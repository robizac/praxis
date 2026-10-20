'use strict';

const cron = require('node-cron');
const { config } = require('../config/env');
const metrics = require('../lib/metrics');
const logger = require('../lib/logger');
const usageService = require('../services/usageService');
const alertService = require('../services/alertService');

/**
 * Verificações periódicas de sinais operacionais (Fase 8).
 *
 * Roda no processo web (as métricas HTTP são por processo). O worker de
 * lembretes alerta diretamente nas falhas de entrega. O custo de IA é lido do
 * banco, então a checagem funciona mesmo com múltiplas instâncias.
 */

const CHECK_INTERVAL_CRON = '*/5 * * * *';
const WINDOW_MINUTES = 5;

let last5xx = 0;

/** Soma as respostas 5xx acumuladas no processo. */
function total5xx() {
  return metrics
    .getCounters('http_requests_total')
    .filter(({ labels }) => String(labels.status || '').startsWith('5'))
    .reduce((sum, entry) => sum + entry.value, 0);
}

/** Alerta quando o número de 5xx desde a última checagem passa do limite. */
async function checkHttp5xx() {
  const current = total5xx();
  const delta = current - last5xx;
  last5xx = current;

  const threshold = config.alerts.http5xxThreshold;
  if (threshold > 0 && delta >= threshold) {
    await alertService.raise(
      'http_5xx_spike',
      `Pico de ${delta} respostas 5xx em até ${WINDOW_MINUTES} minutos.`,
      { count: delta, threshold, windowMinutes: WINDOW_MINUTES },
      { severity: 'critical' }
    );
  }

  return { delta, threshold };
}

/** Alerta quando o custo de IA do dia atinge a fração configurada do teto. */
async function checkAiCost() {
  const budget = Number(config.ai.dailyBudgetUsd || 0);
  if (!budget) {
    return { skipped: true, reason: 'no_budget' };
  }

  const cost = await usageService.costTodayUsd();
  const ratio = cost / budget;
  if (ratio >= config.alerts.aiCostRatio) {
    await alertService.raise(
      'ai_cost_threshold',
      `Custo de IA hoje em US$ ${cost.toFixed(4)} (${Math.round(ratio * 100)}% do teto diário de US$ ${budget}).`,
      { costUsd: Number(cost.toFixed(4)), budgetUsd: budget, ratio: Number(ratio.toFixed(2)) }
    );
  }

  return { costUsd: Number(cost.toFixed(4)), budgetUsd: budget, ratio: Number(ratio.toFixed(2)) };
}

function setupAlertScheduler() {
  if (config.nodeEnv === 'test') {
    return null;
  }

  return cron.schedule(CHECK_INTERVAL_CRON, async () => {
    try {
      await checkHttp5xx();
      await checkAiCost();
    } catch (error) {
      logger.error({ err: error.message }, '[alerts] falha ao verificar alertas');
    }
  });
}

/**
 * Reinicia a janela de 5xx (usado nos testes e quando o processo reinicia,
 * já que os contadores em memória também zeram).
 */
function resetWindow() {
  last5xx = total5xx();
}

module.exports = { setupAlertScheduler, checkHttp5xx, checkAiCost, total5xx, resetWindow };
