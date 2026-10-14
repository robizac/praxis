'use strict';

/**
 * Catálogo de planos e entitlements.
 * Fase 2: usado apenas para expor o plano do usuário.
 * Fase 4/5: aplicado nas cotas de IA e liberado via assinatura Stripe.
 */
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    aiGenerationsPerMonth: 10,
    byok: true,
    reminders: 20,
    history: 'full',
    weeklyReview: true,
    cycle: 'none',
    priceBrl: 0
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    aiGenerationsPerMonth: 300,
    byok: true,
    reminders: 500,
    history: 'full',
    weeklyReview: true,
    cycle: 'monthly',
    priceBrl: 27
  },
  pro_annual: {
    id: 'pro_annual',
    name: 'Pro Anual',
    aiGenerationsPerMonth: 400,
    byok: true,
    reminders: 500,
    history: 'full',
    weeklyReview: true,
    cycle: 'annual',
    priceBrl: 197
  }
};

function getPlan(id) {
  return PLANS[id] || PLANS.free;
}

/** Planos pagos (usados no catálogo público e no checkout). */
const PAID_PLAN_IDS = ['pro', 'pro_annual'];

/** Catálogo público (sem detalhes internos de preço da Stripe). */
function listPublicPlans() {
  return Object.values(PLANS).map((plan) => ({
    id: plan.id,
    name: plan.name,
    priceBrl: plan.priceBrl,
    cycle: plan.cycle,
    aiGenerationsPerMonth: plan.aiGenerationsPerMonth,
    reminders: plan.reminders,
    byok: plan.byok,
    history: plan.history,
    weeklyReview: plan.weeklyReview
  }));
}

module.exports = { PLANS, PAID_PLAN_IDS, getPlan, listPublicPlans };
