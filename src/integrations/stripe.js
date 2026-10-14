'use strict';

const { config } = require('../config/env');
const { AppError } = require('../domain');

/**
 * Integração com a Stripe (SDK oficial).
 *
 * - `isConfigured()` diz se há `STRIPE_SECRET_KEY` (modo teste ou live).
 * - `getStripe()` devolve o cliente (lazy) e falha com 503 se não configurado.
 * - `constructEvent()` verifica a assinatura do webhook (pura, sem rede).
 * - `priceIdForPlan()` / `planForPriceId()` mapeiam plano ↔ preço.
 *
 * O cliente pode ser injetado em testes via `setClient`/`resetClient`.
 */

let client = null;
let injected = null;

function isConfigured() {
  return Boolean(config.stripe.secretKey);
}

function setClient(fake) {
  injected = fake;
}

function resetClient() {
  injected = null;
  client = null;
}

function getStripe() {
  if (injected) {
    return injected;
  }
  if (!config.stripe.secretKey) {
    throw new AppError('Pagamentos não configurados (STRIPE_SECRET_KEY).', {
      status: 503,
      code: 'billing_not_configured'
    });
  }
  if (!client) {
    // eslint-disable-next-line global-require
    const Stripe = require('stripe');
    client = new Stripe(config.stripe.secretKey);
  }
  return client;
}

/** Verifica a assinatura do webhook e devolve o evento. Lança em assinatura inválida. */
function constructEvent(rawBody, signature) {
  if (!config.stripe.webhookSecret) {
    throw new AppError('Webhook não configurado (STRIPE_WEBHOOK_SECRET).', {
      status: 503,
      code: 'billing_not_configured'
    });
  }
  // eslint-disable-next-line global-require
  const Stripe = require('stripe');
  return Stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}

const PRICE_ENV_BY_PLAN = {
  pro: () => config.stripe.priceProMonthly,
  pro_annual: () => config.stripe.priceProAnnual
};

function priceIdForPlan(planId) {
  const resolver = PRICE_ENV_BY_PLAN[planId];
  return resolver ? resolver() || null : null;
}

function planForPriceId(priceId) {
  if (!priceId) {
    return null;
  }
  const entry = Object.keys(PRICE_ENV_BY_PLAN).find(
    (planId) => PRICE_ENV_BY_PLAN[planId]() === priceId
  );
  return entry || null;
}

module.exports = {
  isConfigured,
  getStripe,
  setClient,
  resetClient,
  constructEvent,
  priceIdForPlan,
  planForPriceId
};
