'use strict';

const { config } = require('../config/env');
const { getPlan, QuotaExceededError, AppError } = require('../domain');
const aiUsageRepo = require('../repositories/aiUsage.repo');
const aiCredentialsRepo = require('../repositories/aiCredentials.repo');
const remindersRepo = require('../repositories/reminders.repo');

const MANAGED = 'managed';
const BYOK = 'byok';

/** Início do mês corrente em UTC (ciclo mensal do Free; Pro usa período da assinatura na Fase 5). */
function monthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function dayStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function resolvePlanId(user, planId) {
  if (planId) {
    return planId;
  }
  if (user && user.plan) {
    return user.plan;
  }
  return 'free';
}

/** Cota do mês corrente para o plano informado. */
async function getQuota(userId, planId = 'free') {
  const plan = getPlan(planId);
  const periodStart = monthStartIso();
  const used = await aiUsageRepo.countManagedSince(userId, periodStart);
  const limit = plan.aiGenerationsPerMonth;
  return {
    planId: plan.id,
    planName: plan.name,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    periodStart,
    canGenerate: used < limit,
    byokAllowed: Boolean(plan.byok)
  };
}

/** Lança 402 se a cota gerenciada do plano foi atingida. */
async function ensureCanConsume(userId, planId = 'free') {
  const quota = await getQuota(userId, planId);
  if (!quota.canGenerate) {
    throw new QuotaExceededError(
      `Você atingiu o limite de ${quota.limit} gerações do plano ${quota.planName}.`,
      { planId: quota.planId, limit: quota.limit, used: quota.used, upgrade: true }
    );
  }
  return quota;
}

async function hasByok(userId) {
  const cred = await aiCredentialsRepo.getByUser(userId);
  return Boolean(cred && cred.status === 'active');
}

/** Uso do entitlement `reminders`: lembretes ativos vs. limite do plano. */
async function getRemindersUsage(userId, planId = 'free') {
  const plan = getPlan(planId);
  const used = await remindersRepo.countActiveByUser(userId);
  const limit = plan.reminders;
  return {
    planId: plan.id,
    planName: plan.name,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    canCreate: used < limit
  };
}

/** Lança 402 se o plano atingiu o limite de lembretes ativos. */
async function ensureCanCreateReminder(userId, planId = 'free') {
  const usage = await getRemindersUsage(userId, planId);
  if (!usage.canCreate) {
    throw new QuotaExceededError(
      `Você atingiu o limite de ${usage.limit} lembretes ativos do plano ${usage.planName}.`,
      { planId: usage.planId, limit: usage.limit, used: usage.used, upgrade: true }
    );
  }
  return usage;
}

/**
 * Guard de entitlement por recurso. BYOK ativo ignora a cota gerenciada (docs/09).
 * `reminders` limita lembretes ativos (docs/08).
 */
async function requireEntitlement(userId, planId, feature = 'aiGenerations') {
  if (feature === 'reminders') {
    return ensureCanCreateReminder(userId, planId);
  }
  if (feature !== 'aiGenerations') {
    return;
  }
  if (await hasByok(userId)) {
    return;
  }
  await ensureCanConsume(userId, planId);
}

/** Custo estimado (US$) da plataforma hoje. */
async function costTodayUsd() {
  return aiUsageRepo.sumAllManagedCostSince(dayStartIso());
}

async function isDailyBudgetExceeded() {
  const budget = Number(config.ai.dailyBudgetUsd || 0);
  if (!budget) {
    return false;
  }
  return (await costTodayUsd()) >= budget;
}

/** Lança 503 quando o teto diário de custo da plataforma é atingido. */
async function ensureDailyBudget() {
  if (await isDailyBudgetExceeded()) {
    throw new AppError(
      'Limite diário de uso de IA da plataforma atingido. Tente novamente mais tarde ou use sua própria chave.',
      { status: 503, code: 'ai_daily_budget_exceeded' }
    );
  }
}

async function recordUsage(entry) {
  return aiUsageRepo.insert(entry);
}

module.exports = {
  MANAGED,
  BYOK,
  monthStartIso,
  dayStartIso,
  resolvePlanId,
  getQuota,
  ensureCanConsume,
  hasByok,
  requireEntitlement,
  getRemindersUsage,
  ensureCanCreateReminder,
  costTodayUsd,
  isDailyBudgetExceeded,
  ensureDailyBudget,
  recordUsage
};
