const path = require('path');
const express = require('express');
const cron = require('node-cron');
const dotenv = require('dotenv');
const { all, get, initDb, run } = require('./db');
const { AREAS, normalizeArea, shouldBlockNewAction } = require('./domain');
const { createWeeklyReview, listWeeklyReviews } = require('./weeklyReviewsStore');

dotenv.config();
console.log('PRAXIS iniciando em modo:', process.env.NODE_ENV);

const app = express();
const PORT = Number(process.env.PORT || 3000);

const configuredProvider = (process.env.AI_PROVIDER || 'ollama').toLowerCase();
const provider = process.env.NODE_ENV === 'production' ? 'openai' : configuredProvider;
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const ollamaModel = process.env.OLLAMA_MODEL || 'mistral';
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const PRAXIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: {
      type: 'string',
      enum: AREAS
    },
    acao: { type: 'string' },
    prazo: { type: 'string' },
    regra_minima: { type: 'string' }
  },
  required: ['area', 'acao', 'prazo', 'regra_minima']
};

let fetchImpl = globalThis.fetch;

async function getFetch() {
  if (fetchImpl) {
    return fetchImpl;
  }

  const mod = await import('node-fetch');
  fetchImpl = mod.default;
  return fetchImpl;
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function toIsoFromPtBr(text) {
  const match = String(text || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!match) {
    return null;
  }

  const [, day, month, year, hour, minute] = match;
  const localDate = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0
  );

  if (Number.isNaN(localDate.getTime())) {
    return null;
  }

  return localDate.toISOString();
}

function formatPtBr(dateLike) {
  const date = new Date(dateLike);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 10);
}

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase().trim();
  if (['feito', 'concluido', 'concluído'].includes(value)) {
    return 'feito';
  }
  return 'pendente';
}

function buildPrompt(input, selectedArea) {
  return `
Você é o PRAXIS.
Transforme o aprendizado abaixo em execução prática mínima, sem teoria.

Aprendizado:
"${input}"

Área da Vida escolhida pelo usuário (obrigatória e prioritária):
"${selectedArea}"

Regras:
- Responda em português.
- Use exatamente a área escolhida pelo usuário em "area".
- Retorne APENAS JSON, sem texto extra, markdown ou explicações.
- Siga exatamente este schema:
${JSON.stringify(PRAXIS_JSON_SCHEMA)}
`;
}

function buildSafeFallback(texto, area) {
  const due = new Date(Date.now() + 24 * 60 * 60 * 1000);
  due.setHours(20, 0, 0, 0);
  return {
    area: normalizeArea(area),
    acao: `Aplique por 10 minutos: "${texto}".`,
    prazo: formatPtBr(due),
    regra_minima: 'Se demorar mais de 2 minutos para começar, reduza para 3 minutos e execute agora.'
  };
}

function normalizePraxisPayload(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  return {
    area: normalizeArea(data.area),
    acao: String(data.acao || '').trim(),
    prazo: String(data.prazo || '').trim(),
    regra_minima: String(data.regra_minima || '').trim()
  };
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function extractFirstJsonObject(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  return match ? match[0] : '';
}

function parsePraxisJson(rawText) {
  const raw = String(rawText || '').trim();
  let parsed = tryParseJson(raw);

  if (!parsed) {
    const candidate = extractFirstJsonObject(raw);
    if (candidate) {
      parsed = tryParseJson(candidate);
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'invalid_json', raw };
  }

  const normalized = normalizePraxisPayload(parsed);
  if (!normalized.acao || !normalized.prazo || !normalized.regra_minima) {
    return { ok: false, error: 'missing_fields', raw };
  }

  return { ok: true, data: normalized };
}

function makeProviderError(providerName, message, hint) {
  const err = new Error(message);
  err.provider = providerName;
  err.hint = hint;
  return err;
}

async function gerarPraxisComOllama(input, selectedArea) {
  const prompt = buildPrompt(input, selectedArea);
  const fetch = await getFetch();

  let response;
  try {
    response = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          {
            role: 'system',
            content: 'Você transforma aprendizado em ação prática e responde apenas JSON válido.'
          },
          { role: 'user', content: prompt }
        ],
        stream: false,
        format: PRAXIS_JSON_SCHEMA
      })
    });
  } catch (_error) {
    throw makeProviderError(
      'ollama',
      'Não foi possível conectar ao Ollama.',
      `Inicie o Ollama em ${ollamaBaseUrl} e confirme o modelo com: ollama pull ${ollamaModel}`
    );
  }

  if (!response.ok) {
    const body = await response.text();
    console.error('[ollama] erro HTTP', response.status, body);
    throw makeProviderError(
      'ollama',
      'Ollama não conseguiu gerar a resposta.',
      `Verifique se o modelo "${ollamaModel}" existe (ollama pull ${ollamaModel}) e se o serviço está online.`
    );
  }

  const data = await response.json();
  const text = String(data?.message?.content || '').trim();

  if (!text) {
    throw makeProviderError(
      'ollama',
      'Ollama retornou resposta vazia.',
      `Teste manualmente em ${ollamaBaseUrl} e confirme o modelo ${ollamaModel}.`
    );
  }

  return text;
}

async function gerarPraxisComOpenAI(input, selectedArea) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw makeProviderError(
      'openai',
      'OPENAI_API_KEY não foi configurada.',
      'Defina OPENAI_API_KEY no .env ou use AI_PROVIDER=ollama.'
    );
  }

  const fetch = await getFetch();
  const prompt = buildPrompt(input, selectedArea);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: openaiModel,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'Você transforma aprendizado em execução prática no formato exato solicitado.'
        },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('[openai] erro HTTP', response.status, body);
    throw makeProviderError(
      'openai',
      'OpenAI não conseguiu gerar a resposta.',
      'Confirme OPENAI_API_KEY, crédito disponível e OPENAI_MODEL no .env.'
    );
  }

  const data = await response.json();
  const text = String(data?.choices?.[0]?.message?.content || '').trim();

  if (!text) {
    throw makeProviderError(
      'openai',
      'OpenAI retornou resposta vazia.',
      'Tente novamente ou ajuste OPENAI_MODEL no .env.'
    );
  }

  return text;
}

async function gerarPraxis(input, selectedArea) {
  if (provider === 'openai') {
    return gerarPraxisComOpenAI(input, selectedArea);
  }

  if (provider !== 'ollama') {
    throw makeProviderError(
      provider,
      `AI_PROVIDER inválido: ${provider}`,
      'Use AI_PROVIDER=ollama ou AI_PROVIDER=openai.'
    );
  }

  return gerarPraxisComOllama(input, selectedArea);
}

function mapHistoryRow(row) {
  let tags = [];
  try {
    tags = sanitizeTags(JSON.parse(row.tags || '[]'));
  } catch (_error) {
    tags = [];
  }

  return {
    id: row.id,
    texto: row.texto,
    acao: row.acao_pratica,
    prazo_iso: row.prazo_iso,
    regra_minima: row.regra_minima,
    area: normalizeArea(row.area),
    status: normalizeStatus(row.status),
    created_at: row.created_at,
    tags,
    acao_pratica: row.acao_pratica,
    prazo_humano: row.prazo_humano,
    prazo: row.prazo_humano,
    regraMinima: row.regra_minima
  };
}

async function sendTelegramMessage(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return false;
  }

  const fetch = await getFetch();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message })
  });

  return res.ok;
}

app.post('/api/praxis', async (req, res) => {
  try {
    const texto = String(req.body?.texto || req.body?.input || '').trim();
    const selectedArea = normalizeArea(req.body?.area);
    if (!texto) {
      res.status(400).json({ error: true, message: 'Campo texto é obrigatório.' });
      return;
    }

    const pendingRow = await get(
      "SELECT COUNT(*) AS total FROM praxis_items WHERE status = 'pendente'"
    );
    const pendentes = Number(pendingRow?.total || 0);

    if (shouldBlockNewAction(pendentes)) {
      res.status(409).json({
        error: 'limite_pendentes',
        message: 'Você já tem 2 ações pendentes. Conclua uma antes de gerar outra.',
        pendentes
      });
      return;
    }

    const raw = await gerarPraxis(texto, selectedArea);
    const parsed = parsePraxisJson(raw);
    let praxis;
    let warning = '';

    if (!parsed.ok) {
      console.error('[api/praxis] parse inválido, conteúdo bruto:', raw);
      praxis = buildSafeFallback(texto, selectedArea);
      warning = 'Não entendi a resposta da IA — gere novamente.';
    } else {
      praxis = {
        ...parsed.data,
        area: selectedArea || parsed.data.area
      };
    }

    let prazoIso = toIsoFromPtBr(praxis.prazo);
    let prazoHumano = praxis.prazo;

    if (!prazoIso) {
      const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
      fallback.setHours(20, 0, 0, 0);
      prazoIso = fallback.toISOString();
      prazoHumano = formatPtBr(fallback);
    }

    const inserted = await run(
      `INSERT INTO praxis_items (texto, acao_pratica, prazo_iso, prazo_humano, regra_minima, area, status, tags)
       VALUES (?, ?, ?, ?, ?, ?, 'pendente', '[]')`,
      [texto, praxis.acao, prazoIso, prazoHumano, praxis.regra_minima, praxis.area]
    );

    const item = await get('SELECT * FROM praxis_items WHERE id = ?', [inserted.lastID]);
    const mapped = mapHistoryRow(item);

    res.json({
      acao: mapped.acao,
      prazo: mapped.prazo,
      regraMinima: mapped.regraMinima,
      area: mapped.area,
      acao_pratica: mapped.acao_pratica,
      regra_minima: mapped.regra_minima,
      prazo_iso: mapped.prazo_iso,
      id: mapped.id,
      texto: mapped.texto,
      tags: mapped.tags,
      status: mapped.status,
      created_at: mapped.created_at,
      provider,
      warning
    });
  } catch (error) {
    const activeProvider = error.provider || provider;
    if (activeProvider === 'ollama') {
      console.error('[api/praxis][ollama]', error);
      res.status(500).json({
        error: true,
        message: error.message || 'Falha ao usar Ollama para gerar a ação.',
        hint:
          error.hint ||
          `Verifique se o Ollama está ativo em ${ollamaBaseUrl} e se o modelo ${ollamaModel} está instalado.`,
        provider: 'ollama'
      });
      return;
    }

    console.error('[api/praxis][openai]', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Falha ao usar OpenAI para gerar a ação.',
      hint: error.hint || 'Revise OPENAI_API_KEY e OPENAI_MODEL no .env.',
      provider: 'openai'
    });
  }
});

app.get('/api/meta', async (_req, res) => {
  try {
    const pendingRow = await get(
      "SELECT COUNT(*) AS total FROM praxis_items WHERE status = 'pendente'"
    );
    const pendentes = Number(pendingRow?.total || 0);
    res.json({
      pendentes,
      pode_gerar: pendentes < 2
    });
  } catch (error) {
    console.error('Erro em /api/meta:', error);
    res.status(500).json({ error: true, message: 'Falha ao carregar metadados.' });
  }
});

app.get('/api/history', async (_req, res) => {
  try {
    const rows = await all(
      `SELECT id, texto, acao_pratica, prazo_iso, prazo_humano, regra_minima, area, status, created_at, tags
       FROM praxis_items
       ORDER BY datetime(created_at) DESC
       LIMIT 100`
    );

    res.json(rows.map(mapHistoryRow));
  } catch (error) {
    console.error('Erro em /api/history:', error);
    res.status(500).json({ error: true, message: 'Falha ao carregar histórico.' });
  }
});

app.patch('/api/history/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: true, message: 'ID inválido.' });
      return;
    }

    const current = await get('SELECT * FROM praxis_items WHERE id = ?', [id]);
    if (!current) {
      res.status(404).json({ error: true, message: 'Item não encontrado.' });
      return;
    }

    const nextStatus = req.body?.status
      ? normalizeStatus(req.body.status)
      : normalizeStatus(current.status);

    const nextArea = req.body?.area ? normalizeArea(req.body.area) : normalizeArea(current.area);

    let nextTags = [];
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'tags')) {
      nextTags = sanitizeTags(req.body.tags);
    } else {
      try {
        nextTags = sanitizeTags(JSON.parse(current.tags || '[]'));
      } catch (_error) {
        nextTags = [];
      }
    }

    await run('UPDATE praxis_items SET status = ?, area = ?, tags = ? WHERE id = ?', [
      nextStatus,
      nextArea,
      JSON.stringify(nextTags),
      id
    ]);

    const updated = await get('SELECT * FROM praxis_items WHERE id = ?', [id]);
    res.json(mapHistoryRow(updated));
  } catch (error) {
    console.error('Erro em PATCH /api/history/:id:', error);
    res.status(500).json({ error: true, message: 'Falha ao atualizar item.' });
  }
});

app.delete('/api/history/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: true, message: 'ID inválido.' });
      return;
    }

    await run('DELETE FROM reminders WHERE praxis_id = ?', [id]);
    const deleted = await run('DELETE FROM praxis_items WHERE id = ?', [id]);

    if (deleted.changes === 0) {
      res.status(404).json({ error: true, message: 'Item não encontrado.' });
      return;
    }

    res.json({ ok: true, id });
  } catch (error) {
    console.error('Erro em DELETE /api/history/:id:', error);
    res.status(500).json({ error: true, message: 'Falha ao remover item.' });
  }
});

app.get('/api/upcoming', async (req, res) => {
  try {
    const windowParam = String(req.query.window || '24h').toLowerCase();
    const hours = windowParam === '7d' ? 24 * 7 : 24;

    const rows = await all(
      `SELECT id, texto, acao_pratica, prazo_iso, prazo_humano, regra_minima, area, status, created_at, tags
       FROM praxis_items
       WHERE status = 'pendente'
         AND datetime(prazo_iso) >= datetime('now')
         AND datetime(prazo_iso) <= datetime('now', ?)
       ORDER BY datetime(prazo_iso) ASC`,
      [`+${hours} hours`]
    );

    res.json({ window: windowParam, items: rows.map(mapHistoryRow) });
  } catch (error) {
    console.error('Erro em /api/upcoming:', error);
    res.status(500).json({ error: true, message: 'Falha ao carregar próximos prazos.' });
  }
});

app.get('/api/weekly-reviews', async (_req, res) => {
  try {
    const reviews = await listWeeklyReviews();
    res.json(reviews);
  } catch (error) {
    console.error('Erro em /api/weekly-reviews:', error);
    res.status(500).json({ error: true, message: 'Falha ao carregar revisões semanais.' });
  }
});

app.post('/api/weekly-reviews', async (req, res) => {
  try {
    const respostas = req.body?.respostas || {};
    const payload = {
      respostas: {
        executei: String(respostas.executei || '').trim(),
        trouxe_paz: String(respostas.trouxe_paz || '').trim(),
        gerou_peso: String(respostas.gerou_peso || '').trim(),
        deve_sair: String(respostas.deve_sair || '').trim()
      }
    };

    if (
      !payload.respostas.executei ||
      !payload.respostas.trouxe_paz ||
      !payload.respostas.gerou_peso ||
      !payload.respostas.deve_sair
    ) {
      res.status(400).json({ error: true, message: 'Preencha as 4 respostas da revisão semanal.' });
      return;
    }

    const review = await createWeeklyReview(payload);
    res.status(201).json(review);
  } catch (error) {
    console.error('Erro em /api/weekly-reviews:', error);
    res.status(500).json({ error: true, message: 'Falha ao salvar revisão semanal.' });
  }
});

app.post('/api/complete/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: true, message: 'ID inválido.' });
      return;
    }

    const updated = await run('UPDATE praxis_items SET status = ? WHERE id = ?', ['feito', id]);

    if (updated.changes === 0) {
      res.status(404).json({ error: true, message: 'Item não encontrado.' });
      return;
    }

    const item = await get('SELECT * FROM praxis_items WHERE id = ?', [id]);
    res.json(mapHistoryRow(item));
  } catch (error) {
    console.error('Erro em /api/complete/:id:', error);
    res.status(500).json({ error: true, message: 'Falha ao concluir item.' });
  }
});

app.post('/api/remind/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const remindAtIso = String(req.body?.remind_at_iso || '').trim();
    const channel = String(req.body?.channel || 'telegram').trim();

    if (!Number.isInteger(id) || !remindAtIso) {
      res.status(400).json({ error: 'ID e remind_at_iso são obrigatórios.' });
      return;
    }

    if (!['telegram', 'browser'].includes(channel)) {
      res.status(400).json({ error: 'channel deve ser telegram ou browser.' });
      return;
    }

    const item = await get('SELECT id FROM praxis_items WHERE id = ?', [id]);
    if (!item) {
      res.status(404).json({ error: 'Item não encontrado.' });
      return;
    }

    const reminderDate = new Date(remindAtIso);
    if (Number.isNaN(reminderDate.getTime())) {
      res.status(400).json({ error: 'remind_at_iso inválido.' });
      return;
    }

    const inserted = await run(
      `INSERT INTO reminders (praxis_id, remind_at_iso, channel, sent_at)
       VALUES (?, ?, ?, NULL)`,
      [id, reminderDate.toISOString(), channel]
    );

    const reminder = await get('SELECT * FROM reminders WHERE id = ?', [inserted.lastID]);
    res.status(201).json(reminder);
  } catch (error) {
    console.error('Erro em /api/remind/:id:', error);
    res.status(500).json({ error: 'Falha ao criar lembrete.' });
  }
});

app.get('/api/browser-reminders', async (_req, res) => {
  try {
    const rows = await all(
      `SELECT r.id, r.praxis_id, r.remind_at_iso, p.acao_pratica, p.prazo_humano
       FROM reminders r
       JOIN praxis_items p ON p.id = r.praxis_id
       WHERE r.channel = 'browser' AND r.sent_at IS NULL AND datetime(r.remind_at_iso) <= datetime('now')`
    );
    res.json(rows);
  } catch (error) {
    console.error('Erro em /api/browser-reminders:', error);
    res.status(500).json({ error: 'Falha ao carregar lembretes do navegador.' });
  }
});

app.post('/api/browser-reminders/:id/sent', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    await run(`UPDATE reminders SET sent_at = datetime('now') WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro em /api/browser-reminders/:id/sent:', error);
    res.status(500).json({ error: 'Falha ao registrar lembrete como enviado.' });
  }
});

function setupReminderScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      const dueReminders = await all(
        `SELECT r.id, r.praxis_id, r.remind_at_iso, p.acao_pratica, p.prazo_humano
         FROM reminders r
         JOIN praxis_items p ON p.id = r.praxis_id
         WHERE r.channel = 'telegram' AND r.sent_at IS NULL AND datetime(r.remind_at_iso) <= datetime('now')`
      );

      for (const reminder of dueReminders) {
        const message = [
          'PRAXIS: lembrete de execução',
          `Ação: ${reminder.acao_pratica}`,
          `Prazo: ${reminder.prazo_humano}`
        ].join('\n');

        const sent = await sendTelegramMessage(message);
        if (sent) {
          await run(`UPDATE reminders SET sent_at = datetime('now') WHERE id = ?`, [
            reminder.id
          ]);
        }
      }
    } catch (error) {
      console.error('Erro no scheduler de lembretes:', error);
    }
  });
}

async function start() {
  try {
    await initDb();
    setupReminderScheduler();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Servidor rodando na porta ${PORT}`);
      console.log(`PRAXIS rodando em http://localhost:${PORT} | provider=${provider}`);
      console.log(`Áreas disponíveis: ${AREAS.join(', ')}`);
    });
  } catch (error) {
    console.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = {
  app,
  start,
  parsePraxisJson
};
