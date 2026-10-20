'use strict';

/**
 * Cria (ou reutiliza) produtos e preços de teste na Stripe e imprime os IDs
 * para colar no `.env`. Idempotente: reutiliza produto por metadata
 * `praxis_plan` e preço por valor/ciclo.
 *
 * Uso: STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup
 */

const { config } = require('../src/config/env');

const PRODUCTS = [
  {
    plan: 'pro',
    name: 'PRAXIS Pro',
    amount: 2700,
    currency: 'brl',
    interval: 'month',
    envKey: 'STRIPE_PRICE_PRO_MONTHLY'
  },
  {
    plan: 'pro_annual',
    name: 'PRAXIS Pro Anual',
    amount: 19700,
    currency: 'brl',
    interval: 'year',
    envKey: 'STRIPE_PRICE_PRO_ANNUAL'
  }
];

async function ensureProduct(stripe, spec) {
  const found = await stripe.products.search({
    query: `metadata['praxis_plan']:'${spec.plan}'`,
    limit: 1
  });
  if (found.data.length) {
    console.log(`• Produto existente para ${spec.plan}: ${found.data[0].id}`);
    return found.data[0];
  }
  const product = await stripe.products.create({
    name: spec.name,
    metadata: { praxis_plan: spec.plan }
  });
  console.log(`+ Produto criado para ${spec.plan}: ${product.id}`);
  return product;
}

async function ensurePrice(stripe, product, spec) {
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const existing = prices.data.find(
    (price) =>
      price.unit_amount === spec.amount &&
      price.currency === spec.currency &&
      price.recurring &&
      price.recurring.interval === spec.interval
  );
  if (existing) {
    return existing;
  }
  return stripe.prices.create({
    product: product.id,
    unit_amount: spec.amount,
    currency: spec.currency,
    recurring: { interval: spec.interval },
    metadata: { praxis_plan: spec.plan }
  });
}

(async () => {
  if (!config.stripe.secretKey) {
    console.error('Defina STRIPE_SECRET_KEY (modo teste: sk_test_...) antes de rodar.');
    process.exit(1);
  }

  // eslint-disable-next-line global-require
  const Stripe = require('stripe');
  const stripe = new Stripe(config.stripe.secretKey);

  const lines = [];
  for (const spec of PRODUCTS) {
    const product = await ensureProduct(stripe, spec);
    const price = await ensurePrice(stripe, product, spec);
    lines.push(`${spec.envKey}=${price.id}`);
  }

  console.log('\nCole no .env:\n');
  lines.forEach((line) => console.log(line));
  console.log(
    '\nWebhook: aponte para /webhooks/stripe e copie o signing secret para STRIPE_WEBHOOK_SECRET.'
  );
})();
