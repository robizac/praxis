'use strict';

const praxisRepo = require('../repositories/praxis.repo');
const remindersRepo = require('../repositories/reminders.repo');
const reminderService = require('./reminderService');
const aiService = require('./ai/aiService');
const { parsePraxisJson } = require('./ai/parse');
const {
  normalizeArea,
  normalizeStatus,
  parseTagsColumn,
  toIsoFromPtBr,
  formatPtBr,
  buildSafeFallback,
  shouldBlockNewAction,
  BadRequestError,
  ConflictError,
  NotFoundError
} = require('../domain');

/** Converte uma linha do banco no contrato público da API. */
function mapRow(row) {
  if (!row) {
    return null;
  }

  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  const prazoIso = row.prazo_iso instanceof Date ? row.prazo_iso.toISOString() : row.prazo_iso;

  return {
    id: row.id,
    texto: row.texto,
    acao: row.acao_pratica,
    prazo_iso: prazoIso,
    regra_minima: row.regra_minima,
    area: normalizeArea(row.area),
    status: normalizeStatus(row.status),
    created_at: createdAt,
    tags: parseTagsColumn(row.tags),
    acao_pratica: row.acao_pratica,
    prazo_humano: row.prazo_humano,
    prazo: row.prazo_humano,
    regraMinima: row.regra_minima
  };
}

function computeDeadline(praxis) {
  let prazoIso = toIsoFromPtBr(praxis.prazo);
  let prazoHumano = praxis.prazo;

  if (!prazoIso) {
    const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
    fallback.setHours(20, 0, 0, 0);
    prazoIso = fallback.toISOString();
    prazoHumano = formatPtBr(fallback);
  }

  return { prazoIso, prazoHumano };
}

/** Gera uma nova ação a partir de um aprendizado (usa IA). */
async function generate({ userId, planId = 'free', texto, area }) {
  const input = String(texto || '').trim();
  if (!input) {
    throw new BadRequestError('Campo texto é obrigatório.');
  }

  const selectedArea = normalizeArea(area);
  const pendentes = await praxisRepo.countPending(userId);

  if (shouldBlockNewAction(pendentes)) {
    throw new ConflictError(
      'Você já tem 2 ações pendentes. Conclua uma antes de gerar outra.',
      'limite_pendentes',
      { pendentes }
    );
  }

  const ai = await aiService.generate({ userId, planId, input, area: selectedArea });
  const parsed = parsePraxisJson(ai.text);

  let praxis;
  let warning = '';
  if (!parsed.ok) {
    console.error('[praxis] parse inválido, conteúdo bruto:', ai.text);
    praxis = buildSafeFallback(input, selectedArea);
    warning = 'Não entendi a resposta da IA — gere novamente.';
  } else {
    praxis = { ...parsed.data, area: selectedArea || parsed.data.area };
  }

  const { prazoIso, prazoHumano } = computeDeadline(praxis);

  const id = await praxisRepo.insert(userId, {
    texto: input,
    acaoPratica: praxis.acao,
    prazoIso,
    prazoHumano,
    regraMinima: praxis.regra_minima,
    area: praxis.area
  });

  const row = await praxisRepo.getById(userId, id);

  // Fase 7: lembrete default ao criar a ação (opcional, configurável pelo usuário).
  const defaultReminder = await reminderService.createDefaultForItem({
    userId,
    planId,
    praxisId: id,
    prazoIso
  });

  return {
    ...mapRow(row),
    defaultReminder,
    provider: ai.provider,
    source: ai.source,
    cached: ai.cached,
    warning
  };
}

async function listHistory(userId, limit = 100) {
  const rows = await praxisRepo.listRecent(userId, limit);
  return rows.map(mapRow);
}

async function getById(userId, id) {
  return mapRow(await praxisRepo.getById(userId, id));
}

async function update(userId, id, changes) {
  const current = await praxisRepo.getById(userId, id);
  if (!current) {
    throw new NotFoundError('Item não encontrado.');
  }

  const nextStatus = changes.status
    ? normalizeStatus(changes.status)
    : normalizeStatus(current.status);
  const nextArea = changes.area ? normalizeArea(changes.area) : normalizeArea(current.area);

  let nextTags = parseTagsColumn(current.tags);
  if (Object.prototype.hasOwnProperty.call(changes, 'tags')) {
    nextTags = Array.isArray(changes.tags) ? changes.tags : [];
  }

  const updated = await praxisRepo.updateFields(userId, id, {
    status: nextStatus,
    area: nextArea,
    tags: nextTags
  });

  return mapRow(updated);
}

async function remove(userId, id) {
  await remindersRepo.deleteByPraxis(id);
  const changes = await praxisRepo.deleteById(userId, id);
  return changes > 0;
}

async function upcoming(userId, windowParam) {
  const windowKey = windowParam === '7d' ? '7d' : '24h';
  const hours = windowKey === '7d' ? 24 * 7 : 24;
  const fromIso = new Date().toISOString();
  const toIso = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const rows = await praxisRepo.listUpcoming(userId, fromIso, toIso);
  return { window: windowKey, items: rows.map(mapRow) };
}

module.exports = {
  mapRow,
  generate,
  listHistory,
  getById,
  update,
  remove,
  upcoming
};
