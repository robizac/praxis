'use strict';

const cron = require('node-cron');
const { config } = require('../config/env');
const reminderService = require('../services/reminderService');
const telegram = require('../integrations/telegram');
const telegramChatsRepo = require('../repositories/telegramChats.repo');
const usersRepo = require('../repositories/users.repo');
const email = require('../integrations/email');
const logger = require('../lib/logger');
const metrics = require('../lib/metrics');
const alertService = require('../services/alertService');

function buildMessage(reminder) {
  return [
    'PRAXIS: lembrete de execução',
    `Ação: ${reminder.acao_pratica}`,
    `Prazo: ${reminder.prazo_humano}`
  ].join('\n');
}

/**
 * Entrega um lembrete. Retorna `sent` | `skipped` (canal indisponível) | `failed`.
 * `skipped` não conta como tentativa (evita retry infinito quando não há provider).
 */
async function deliverReminder(reminder) {
  const message = buildMessage(reminder);

  if (reminder.channel === 'telegram') {
    const chat = await telegramChatsRepo.getByUser(reminder.user_id);
    const target = chat ? chat.chat_id : config.telegram.chatId;
    // Sem bot configurado ou sem destino → indisponível (não conta tentativa).
    if (!telegram.isConfigured() || !target) {
      return 'skipped';
    }
    try {
      const ok = await telegram.sendMessage(message, target);
      return ok ? 'sent' : 'failed';
    } catch (error) {
      logger.error(
        { error: error.message, reminderId: reminder.id },
        '[reminders] falha ao enviar Telegram'
      );
      return 'failed';
    }
  }

  if (reminder.channel === 'email') {
    if (!email.isConfigured()) {
      return 'skipped';
    }
    const user = await usersRepo.findById(reminder.user_id);
    if (!user || !user.email) {
      return 'failed';
    }
    try {
      const result = await email.send({
        to: user.email,
        subject: 'PRAXIS: lembrete de execução',
        text: message
      });
      return result && result.delivered ? 'sent' : 'failed';
    } catch (error) {
      logger.error(
        { error: error.message, reminderId: reminder.id },
        '[reminders] falha ao enviar e-mail'
      );
      return 'failed';
    }
  }

  // Canal 'browser' é consumido pela própria SPA (polling), não pelo worker.
  return 'skipped';
}

/** Processa lembretes vencidos dos canais tratados pelo worker (telegram e email). */
async function processDueReminders(channels = ['telegram', 'email']) {
  const summary = { due: 0, sent: 0, failed: 0, skipped: 0 };

  for (const channel of channels) {
    const due = await reminderService.dueByChannel(channel);
    summary.due += due.length;

    for (const reminder of due) {
      const outcome = await deliverReminder(reminder);
      if (outcome === 'sent') {
        await reminderService.markSent(reminder.id);
        summary.sent += 1;
      } else if (outcome === 'failed') {
        await reminderService.markFailed(reminder.id, 'falha no envio');
        summary.failed += 1;
      } else {
        summary.skipped += 1;
      }
      metrics.increment('reminders_delivered_total', 'Entregas de lembrete por canal e desfecho.', {
        channel,
        outcome
      });
    }
  }

  if (summary.failed > 0) {
    await alertService.raise(
      'reminders_delivery_failed',
      `${summary.failed} lembrete(s) falharam na entrega.`,
      { failed: summary.failed, due: summary.due, sent: summary.sent, skipped: summary.skipped }
    );
  }

  return summary;
}

function setupReminderScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      await processDueReminders();
    } catch (error) {
      logger.error({ err: error }, '[reminders] erro no scheduler');
    }
  });
}

module.exports = { setupReminderScheduler, processDueReminders, deliverReminder, buildMessage };
