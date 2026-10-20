const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const Stripe = require('stripe');

const db = require('../src/db');
const { config } = require('../src/config/env');
const usersRepo = require('../src/repositories/users.repo');
const stripe = require('../src/integrations/stripe');
const billingService = require('../src/services/billingService');

const skip = db.dialect !== 'sqlite';

const WEBHOOK_SECRET = 'whsec_test_praxis';
const PRICE_PRO = 'price_test_pro_monthly';

async function createUser() {
  return usersRepo.create({
    email: `billing-${randomUUID()}@example.com`,
    passwordHash: 'x',
    name: 'Cobrança'
  });
}

function sign(payload) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
}

/** Assina e entrega um evento de forma consistente (payload === assinatura). */
async function deliver(event) {
  const payload = JSON.stringify(event);
  return billingService.handleWebhook(payload, sign(payload));
}

function subscriptionEvent({
  userId,
  status,
  customerId,
  subscriptionId,
  cancelAtPeriodEnd = false
}) {
  return {
    id: `evt_${randomUUID()}`,
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: subscriptionId,
        customer: customerId,
        status,
        cancel_at_period_end: cancelAtPeriodEnd,
        current_period_end: 2000000000,
        trial_end: null,
        metadata: { user_id: userId },
        items: { data: [{ price: { id: PRICE_PRO } }] }
      }
    }
  };
}

function withStripeConfig() {
  const original = { ...config.stripe };
  config.stripe.webhookSecret = WEBHOOK_SECRET;
  config.stripe.secretKey = 'sk_test_123';
  config.stripe.priceProMonthly = PRICE_PRO;
  return () => {
    config.stripe.webhookSecret = original.webhookSecret;
    config.stripe.secretKey = original.secretKey;
    config.stripe.priceProMonthly = original.priceProMonthly;
  };
}

test('billing: plano efetivo depende do status da assinatura', () => {
  assert.equal(billingService.effectivePlanId(null), 'free');
  assert.equal(billingService.effectivePlanId({ status: 'active', plan: 'pro' }), 'pro');
  assert.equal(
    billingService.effectivePlanId({ status: 'trialing', plan: 'pro_annual' }),
    'pro_annual'
  );
  assert.equal(billingService.effectivePlanId({ status: 'past_due', plan: 'pro' }), 'free');
  assert.equal(billingService.effectivePlanId({ status: 'canceled', plan: 'pro' }), 'free');
});

test('billing: webhook com assinatura inválida retorna 400', { skip }, async () => {
  await db.initDb();
  const restore = withStripeConfig();
  try {
    await assert.rejects(
      () => billingService.handleWebhook('{"id":"evt_x"}', 't=1,v1=deadbeef'),
      (error) => error.status === 400
    );
  } finally {
    restore();
  }
});

test('billing: sem STRIPE_WEBHOOK_SECRET retorna 503', { skip }, async () => {
  await db.initDb();
  const original = config.stripe.webhookSecret;
  config.stripe.webhookSecret = '';
  try {
    await assert.rejects(
      () => billingService.handleWebhook('{}', 't=1,v1=x'),
      (error) => error.status === 503 && error.code === 'billing_not_configured'
    );
  } finally {
    config.stripe.webhookSecret = original;
  }
});

test('billing: webhook ativa o plano e é idempotente', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  const restore = withStripeConfig();
  const customerId = `cus_${randomUUID()}`;
  const subscriptionId = `sub_${randomUUID()}`;
  const event = subscriptionEvent({
    userId: user.id,
    status: 'active',
    customerId,
    subscriptionId
  });

  try {
    assert.equal(await billingService.resolvePlanId(user.id), 'free');

    const first = await deliver(event);
    assert.equal(first.received, true);
    assert.equal(first.duplicate, false);
    assert.equal(await billingService.resolvePlanId(user.id), 'pro');

    const status = await billingService.getStatus(user.id);
    assert.equal(status.plan.id, 'pro');
    assert.equal(status.status, 'active');

    // Mesmo evento novamente → idempotente (não reprocessa).
    const second = await deliver(event);
    assert.equal(second.duplicate, true);
    assert.equal(await billingService.resolvePlanId(user.id), 'pro');
  } finally {
    restore();
  }
});

test('billing: past_due rebaixa e deleted cancela', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  const restore = withStripeConfig();
  const customerId = `cus_${randomUUID()}`;
  const subscriptionId = `sub_${randomUUID()}`;

  try {
    await deliver(
      subscriptionEvent({ userId: user.id, status: 'active', customerId, subscriptionId })
    );
    assert.equal(await billingService.resolvePlanId(user.id), 'pro');

    // Falha de pagamento → past_due → sem acesso.
    await deliver({
      id: `evt_${randomUUID()}`,
      type: 'invoice.payment_failed',
      data: {
        object: { id: `in_${randomUUID()}`, customer: customerId, subscription: subscriptionId }
      }
    });
    assert.equal(await billingService.resolvePlanId(user.id), 'free');
    assert.equal((await billingService.getStatus(user.id)).status, 'past_due');

    // Cancelamento → canceled → free.
    await deliver({
      id: `evt_${randomUUID()}`,
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: subscriptionId,
          customer: customerId,
          status: 'canceled',
          current_period_end: 2000000000,
          metadata: { user_id: user.id }
        }
      }
    });
    assert.equal(await billingService.resolvePlanId(user.id), 'free');
    assert.equal((await billingService.getStatus(user.id)).status, 'canceled');
  } finally {
    restore();
  }
});

test('billing: checkout cria/reusa customer e cria sessão', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  const restore = withStripeConfig();
  const calls = { customers: 0, checkout: 0 };
  const fakeCustomerId = `cus_${randomUUID()}`;

  stripe.setClient({
    customers: {
      create: async () => {
        calls.customers += 1;
        return { id: fakeCustomerId };
      }
    },
    checkout: {
      sessions: {
        create: async (params) => {
          calls.checkout += 1;
          assert.equal(params.line_items[0].price, PRICE_PRO);
          assert.equal(params.mode, 'subscription');
          assert.equal(params.subscription_data.metadata.user_id, user.id);
          return { id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' };
        }
      }
    }
  });

  try {
    const session = await billingService.createCheckoutSession(user, { priceId: PRICE_PRO });
    assert.equal(session.url, 'https://checkout.stripe.test/cs_test_1');
    assert.equal(calls.customers, 1);
    assert.equal(calls.checkout, 1);

    // Segunda vez reusa o customer salvo (não cria outro).
    await billingService.createCheckoutSession(user, { priceId: PRICE_PRO });
    assert.equal(calls.customers, 1);
    assert.equal(calls.checkout, 2);
  } finally {
    stripe.resetClient();
    restore();
  }
});

test('billing: portal exige assinatura e retorna url', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  const restore = withStripeConfig();
  const customerId = `cus_${randomUUID()}`;
  const subscriptionId = `sub_${randomUUID()}`;

  try {
    // Sem customer vinculado → 400.
    await assert.rejects(
      () => billingService.createPortalSession(user, {}),
      (error) => error.status === 400
    );

    // Vincula um customer via webhook.
    await deliver({
      id: `evt_${randomUUID()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_${randomUUID()}`,
          customer: customerId,
          subscription: subscriptionId,
          metadata: { user_id: user.id }
        }
      }
    });

    stripe.setClient({
      billingPortal: {
        sessions: {
          create: async (params) => {
            assert.equal(params.customer, customerId);
            return { url: 'https://billing.stripe.test/portal' };
          }
        }
      }
    });

    const session = await billingService.createPortalSession(user, {});
    assert.equal(session.url, 'https://billing.stripe.test/portal');
  } finally {
    stripe.resetClient();
    restore();
  }
});
