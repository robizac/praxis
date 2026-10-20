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
    completed_at:
      row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at,
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

  let completedAt = null;
  if (nextStatus === 'feito') {
    completedAt = current.completed_at || new Date().toISOString();
  }

  const updated = await praxisRepo.updateFields(userId, id, {
    status: nextStatus,
    area: nextArea,
    tags: nextTags,
    completedAt
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

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return '"' + text.replaceAll('"', '""') + '"';
  }
  return text;
}

async function exportHistory(userId, format = 'csv') {
  const rows = await praxisRepo.listRecent(userId, 1000);
  const items = rows.map(mapRow);

  if (format === 'md') {
    const lines = [];
    lines.push('# Histórico PRAXIS');
    lines.push('');
    lines.push(`Gerado em: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('| ID | Criado em | Área | Status | Ação | Prazo |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const item of items) {
      lines.push(
        `| ${item.id} | ${item.created_at} | ${String(item.area).replaceAll('|', '\\|')} | ${item.status} | ${String(item.acao).replaceAll('|', '\\|')} | ${String(item.prazo).replaceAll('|', '\\|')} |`
      );
    }
    lines.push('');
    for (const item of items) {
      lines.push(`## Ação #${item.id}`);
      lines.push('');
      lines.push(`- **Aprendizado:** ${item.texto}`);
      lines.push(`- **Ação:** ${item.acao}`);
      lines.push(`- **Prazo:** ${item.prazo}`);
      lines.push(`- **Regra mínima:** ${item.regra_minima}`);
      lines.push(`- **Área:** ${item.area}`);
      lines.push(`- **Status:** ${item.status}`);
      lines.push(`- **Criado em:** ${item.created_at}`);
      lines.push('');
    }
    return {
      filename: 'praxis-historico.md',
      contentType: 'text/markdown; charset=utf-8',
      body: lines.join('\n')
    };
  }

  const header = [
    'id',
    'created_at',
    'area',
    'status',
    'texto',
    'acao',
    'prazo',
    'regra_minima',
    'tags'
  ];
  const csvLines = [header.join(',')];
  for (const item of items) {
    csvLines.push(
      [
        item.id,
        item.created_at,
        csvEscape(item.area),
        item.status,
        csvEscape(item.texto),
        csvEscape(item.acao),
        csvEscape(item.prazo),
        csvEscape(item.regra_minima),
        csvEscape(JSON.stringify(item.tags || []))
      ].join(',')
    );
  }
  return {
    filename: 'praxis-historico.csv',
    contentType: 'text/csv; charset=utf-8',
    body: csvLines.join('\n') + '\n'
  };
}

async function summary(userId) {
  const rows = await praxisRepo.listRecent(userId, 1000);
  const items = rows.map(mapRow);
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const pendentes = items.filter((item) => item.status === 'pendente').length;
  const feitos = items.filter((item) => item.status === 'feito');
  const feitosSemana = feitos.filter((item) => {
    if (!item.completed_at) return false;
    return new Date(item.completed_at) >= sevenDaysAgo;
  }).length;

  const dateSet = new Set(
    feitos
      .map((item) =>
        item.completed_at ? new Date(item.completed_at).toISOString().slice(0, 10) : null
      )
      .filter(Boolean)
  );

  let streak = 0;
  const cursor = new Date(now);
  const todayStr = cursor.toISOString().slice(0, 10);
  if (!dateSet.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (true) {
    const ds = cursor.toISOString().slice(0, 10);
    if (dateSet.has(ds)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return {
    pendentes,
    feitosSemana,
    streak,
    total: items.length,
    feitosTotal: feitos.length
  };
}

module.exports = {
  mapRow,
  generate,
  listHistory,
  getById,
  update,
  remove,
  upcoming,
  exportHistory,
  summary
};
