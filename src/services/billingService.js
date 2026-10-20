'use strict';

const { config } = require('../config/env');
const { getPlan, listPublicPlans, BadRequestError, AppError } = require('../domain');
const subscriptionsRepo = require('../repositories/subscriptions.repo');
const stripeEventsRepo = require('../repositories/stripeEvents.repo');
const usersRepo = require('../repositories/users.repo');
const stripe = require('../integrations/stripe');
const email = require('../integrations/email');
const logger = require('../lib/logger');

/** Status Stripe → interno (docs/10, 10.4). */
const STATUS_MAP = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
  unpaid: 'unpaid',
  incomplete: 'incomplete',
  incomplete_expired: 'incomplete',
  paused: 'canceled'
};

/** Status interna considerada "com acesso ao plano pago". */
const ENTITLED_STATUSES = new Set(['active', 'trialing']);

function mapStatus(stripeStatus) {
  return STATUS_MAP[stripeStatus] || 'incomplete';
}

/** Converte timestamps Unix (segundos) da Stripe para ISO; tolera ISO/strings. */
function toIso(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return new Date(Number(value) * 1000).toISOString();
  }
  return String(value);
}

/** Plano efetivo do usuário (entitlement): assinatura ativa/trial ⇒ plano do preço; senão free. */
function effectivePlanId(subscription) {
  if (subscription && ENTITLED_STATUSES.has(subscription.status)) {
    return subscription.plan || 'free';
  }
  return 'free';
}

async function resolvePlanId(userId) {
  const subscription = await subscriptionsRepo.getByUser(userId);
  return effectivePlanId(subscription);
}

/** Estado de cobrança para a UI (plano + assinatura + entitlement). */
async function getStatus(userId) {
  const subscription = await subscriptionsRepo.getByUser(userId);
  const planId = effectivePlanId(subscription);
  return {
    plan: getPlan(planId),
    entitled: ENTITLED_STATUSES.has(subscription ? subscription.status : 'none'),
    status: subscription ? subscription.status : 'none',
    currentPeriodEnd: subscription ? subscription.current_period_end : null,
    cancelAtPeriodEnd: subscription ? subscription.cancel_at_period_end : false,
    trialEnd: subscription ? subscription.trial_end : null,
    hasCustomer: Boolean(subscription && subscription.stripe_customer_id),
    hasSubscription: Boolean(subscription && subscription.stripe_subscription_id)
  };
}

/** Catálogo público de planos + disponibilidade de checkout. */
function getPlans() {
  const configured = stripe.isConfigured();
  return listPublicPlans().map((plan) => {
    const priceId = stripe.priceIdForPlan(plan.id) || null;
    return {
      ...plan,
      priceId,
      purchasable: plan.id === 'free' ? false : Boolean(configured && priceId)
    };
  });
}

async function ensureCustomerId(user) {
  const existing = await subscriptionsRepo.getByUser(user.id);
  if (existing && existing.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  const client = stripe.getStripe();
  const customer = await client.customers.create({
    email: user.email,
    name: user.name,
    metadata: { user_id: user.id }
  });
  await subscriptionsRepo.upsert(user.id, {
    stripeCustomerId: customer.id,
    plan: (existing && existing.plan) || 'free',
    status: (existing && existing.status) || 'none'
  });
  return customer.id;
}

async function createCheckoutSession(user, { priceId, appUrl }) {
  const resolvedPrice = priceId || stripe.priceIdForPlan('pro');
  if (!resolvedPrice) {
    throw new BadRequestError('priceId é obrigatório (ou defina STRIPE_PRICE_PRO_MONTHLY).');
  }

  const customerId = await ensureCustomerId(user);
  const base = appUrl || config.appUrl;
  const client = stripe.getStripe();

  const session = await client.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: resolvedPrice, quantity: 1 }],
    success_url: `${base}/?checkout=ok`,
    cancel_url: `${base}/?checkout=cancel`,
    subscription_data: {
      metadata: { user_id: user.id },
      trial_period_days: config.stripe.trialDays || undefined
    },
    // O plano só é ativado pelo webhook — nunca pelo success_url.
    metadata: { user_id: user.id }
  });

  return { id: session.id, url: session.url };
}

async function createPortalSession(user, { returnUrl }) {
  const subscription = await subscriptionsRepo.getByUser(user.id);
  if (!subscription || !subscription.stripe_customer_id) {
    throw new BadRequestError('Nenhuma assinatura encontrada para gerenciar.');
  }

  const params = {
    customer: subscription.stripe_customer_id,
    return_url: returnUrl || `${config.appUrl}/?billing=portal`
  };
  if (config.stripe.portalConfigId) {
    params.configuration = config.stripe.portalConfigId;
  }

  const session = await stripe.getStripe().billingPortal.sessions.create(params);
  return { url: session.url };
}

async function findUserIdByCustomer(customerId) {
  const subscription = await subscriptionsRepo.getByCustomerId(customerId);
  return subscription ? subscription.user_id : null;
}

async function sendBillingEmail(userId, subject, text) {
  if (!userId) {
    return;
  }
  const user = await usersRepo.findById(userId);
  if (!user) {
    return;
  }
  await email.send({ to: user.email, subject, text }).catch((error) => {
    logger.error({ error: error.message, userId }, '[billing] falha ao enviar e-mail');
  });
}

async function onCheckoutCompleted(session) {
  const userId = session.metadata?.user_id;
  if (!userId) {
    logger.warn({ sessionId: session.id }, '[billing] checkout.session.completed sem user_id');
    return;
  }
  await subscriptionsRepo.upsert(userId, {
    stripeCustomerId:
      typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
    stripeSubscriptionId:
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id || null
  });
}

async function onSubscriptionUpsert(subscription) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const metadataUserId = subscription.metadata?.user_id || null;
  const userId = metadataUserId || (await findUserIdByCustomer(customerId));

  if (!userId) {
    logger.warn(
      { subscriptionId: subscription.id, customerId },
      '[billing] assinatura sem usuário'
    );
    return;
  }

  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const mappedPlan = stripe.planForPriceId(priceId);
  if (priceId && !mappedPlan) {
    logger.warn(
      { priceId, subscriptionId: subscription.id },
      '[billing] preço desconhecido — concedendo apenas Free'
    );
  }

  await subscriptionsRepo.upsert(userId, {
    stripeCustomerId: customerId || null,
    stripeSubscriptionId: subscription.id,
    priceId,
    plan: mappedPlan || 'free',
    status: mapStatus(subscription.status),
    currentPeriodEnd: toIso(subscription.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    trialEnd: toIso(subscription.trial_end)
  });
}

async function onSubscriptionDeleted(subscription) {
  const userId =
    subscription.metadata?.user_id ||
    (await findUserIdByCustomer(
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
    ));

  if (!userId) {
    return;
  }

  await subscriptionsRepo.upsert(userId, {
    status: 'canceled',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: toIso(subscription.current_period_end)
  });
  await sendBillingEmail(
    userId,
    'Sua assinatura PRAXIS foi encerrada',
    'Sua assinatura Pro foi cancelada e sua conta voltou ao plano Free.'
  );
}

async function findUserIdForInvoice(invoice) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (subscriptionId) {
    const bySub = await subscriptionsRepo.getBySubscriptionId(subscriptionId);
    if (bySub) {
      return { userId: bySub.user_id, subscriptionId };
    }
  }
  return { userId: await findUserIdByCustomer(customerId), subscriptionId };
}

async function onInvoicePaid(invoice) {
  const { userId, subscriptionId } = await findUserIdForInvoice(invoice);
  if (!userId) {
    return;
  }
  await subscriptionsRepo.upsert(userId, {
    status: 'active',
    currentPeriodEnd: toIso(invoice.lines?.data?.[0]?.period?.end || invoice.period_end)
  });
  await sendBillingEmail(
    userId,
    'Pagamento confirmado — PRAXIS Pro',
    `Recebemos seu pagamento${subscriptionId ? ` da assinatura ${subscriptionId}` : ''}. Bom uso!`
  );
}

async function onInvoiceFailed(invoice) {
  const { userId } = await findUserIdForInvoice(invoice);
  if (!userId) {
    return;
  }
  await subscriptionsRepo.upsert(userId, { status: 'past_due' });
  await sendBillingEmail(
    userId,
    'Falha no pagamento — PRAXIS Pro',
    'Não conseguimos processar seu pagamento. Atualize o cartão no Portal do cliente para manter o acesso.'
  );
}

async function applyEvent(event) {
  const object = event.data?.object || {};
  switch (event.type) {
    case 'checkout.session.completed':
      await onCheckoutCompleted(object);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await onSubscriptionUpsert(object);
      break;
    case 'customer.subscription.deleted':
      await onSubscriptionDeleted(object);
      break;
    case 'invoice.paid':
      await onInvoicePaid(object);
      break;
    case 'invoice.payment_failed':
      await onInvoiceFailed(object);
      break;
    default:
      logger.info({ type: event.type }, '[billing] evento ignorado');
  }
}

/**
 * Processa um webhook de forma idempotente por `event.id` (docs/10, 10.6).
 * Eventos já processados são ignorados; eventos inseridos e não concluídos
 * (falha anterior) são reprocessados.
 */
async function handleWebhook(rawBody, signature) {
  if (!config.stripe.webhookSecret) {
    throw new AppError('Webhook não configurado (STRIPE_WEBHOOK_SECRET).', {
      status: 503,
      code: 'billing_not_configured'
    });
  }
  if (!signature) {
    throw new BadRequestError('Cabeçalho Stripe-Signature ausente.');
  }

  let event;
  try {
    event = stripe.constructEvent(rawBody, signature);
  } catch (error) {
    logger.warn({ error: error.message }, '[billing] assinatura de webhook inválida');
    throw new BadRequestError('Assinatura do webhook inválida.');
  }

  const inserted = await stripeEventsRepo.tryInsert(event.id, event.type, JSON.stringify(event));
  if (!inserted && (await stripeEventsRepo.isProcessed(event.id))) {
    return { received: true, duplicate: true };
  }

  await applyEvent(event);
  await stripeEventsRepo.markProcessed(event.id);
  return { received: true, duplicate: false };
}

module.exports = {
  STATUS_MAP,
  ENTITLED_STATUSES,
  mapStatus,
  toIso,
  effectivePlanId,
  resolvePlanId,
  getStatus,
  getPlans,
  ensureCustomerId,
  createCheckoutSession,
  createPortalSession,
  applyEvent,
  handleWebhook
};
