'use strict';

const usersRepo = require('../repositories/users.repo');
const praxisService = require('./praxisService');
const reviewsRepo = require('../repositories/reviews.repo');
const remindersRepo = require('../repositories/reminders.repo');
const aiUsageRepo = require('../repositories/aiUsage.repo');
const subscriptionsRepo = require('../repositories/subscriptions.repo');
const accountRepo = require('../repositories/account.repo');
const settingsService = require('./settingsService');
const telegramService = require('./telegramService');
const authService = require('./authService');
const stripe = require('../integrations/stripe');
const logger = require('../lib/logger');
const { BadRequestError, NotFoundError } = require('../domain');

/** Palavra de confirmação exigida no corpo ao excluir a conta. */
const CONFIRM_WORD = 'EXCLUIR';

/**
 * Exporta todos os dados pessoais do usuário (LGPD — portabilidade).
 * Shape versionado (`praxis-export-v1`) para evolução futura.
 */
async function exportData(userId) {
  const user = await usersRepo.findById(userId);
  if (!user) {
    throw new NotFoundError('Usuário não encontrado.');
  }

  const [items, reminders, weeklyReviews, aiUsage, subscription, reminderDefault, telegram] =
    await Promise.all([
      praxisService.listHistory(userId, 5000),
      remindersRepo.listByUser(userId),
      reviewsRepo.list(userId, 5000),
      aiUsageRepo.listByUser(userId),
      subscriptionsRepo.getByUser(userId),
      settingsService.getReminderSettings(userId),
      telegramService.getStatus(userId)
    ]);

  return {
    format: 'praxis-export-v1',
    exportedAt: new Date().toISOString(),
    user: authService.publicUser(user),
    settings: { reminderDefault },
    telegram,
    subscription,
    items,
    reminders,
    weeklyReviews,
    aiUsage
  };
}

/** Cancela a assinatura na Stripe (best-effort): não bloqueia a exclusão local. */
async function cancelStripeSubscription(subscription) {
  if (!subscription || !subscription.stripe_subscription_id || !stripe.isConfigured()) {
    return false;
  }
  try {
    await stripe.getStripe().subscriptions.cancel(subscription.stripe_subscription_id);
    return true;
  } catch (error) {
    logger.warn({ err: error.message }, '[account] falha ao cancelar assinatura Stripe');
    return false;
  }
}

/**
 * Exclui a conta e todos os dados (LGPD — eliminação). Exige confirmação
 * explícita (`confirm: "EXCLUIR"`) para evitar exclusões acidentais.
 */
async function deleteAccount(userId, { confirm } = {}) {
  if (String(confirm || '').trim().toUpperCase() !== CONFIRM_WORD) {
    throw new BadRequestError(`Confirme a exclusão enviando confirm="${CONFIRM_WORD}".`);
  }

  const user = await usersRepo.findById(userId);
  if (!user) {
    throw new NotFoundError('Usuário não encontrado.');
  }

  const subscription = await subscriptionsRepo.getByUser(userId);
  const stripeCanceled = await cancelStripeSubscription(subscription);

  // Auditoria é anonimizada (mantida por segurança); demais dados são apagados.
  await accountRepo.anonymizeAuditLog(userId);
  const counts = await accountRepo.purgeUser(userId);

  logger.info({ userId, stripeCanceled, counts }, '[account] conta excluída');
  return { deleted: true, stripeCanceled, counts };
}

module.exports = { CONFIRM_WORD, exportData, deleteAccount };
