'use strict';

/**
 * Smoke test do funil de produção (Fase 9 — lançamento).
 *
 * Exercita, de ponta a ponta, o caminho que um usuário real percorre:
 * landing → cadastro → sessão → geração de ação → assinatura, além de
 * /health e /ready (monitor) e, opcionalmente, /metrics.
 *
 * Uso:
 *   APP_URL=https://praxis.exemplo.com npm run smoke
 *   npm run smoke -- --base-url https://praxis.exemplo.com
 *   npm run smoke -- --base-url http://localhost:3000 --generate --checkout
 *
 * Opções:
 *   --base-url URL        URL base do app (ou env SMOKE_BASE_URL / APP_URL)
 *   --generate            gera uma ação por IA (default: true em produção)
 *   --no-generate         pula a geração (útil em dev/CI sem provider)
 *   --checkout            cria uma sessão de checkout Stripe (exige Stripe ok)
 *   --metrics             consulta /metrics (exige SMOKE_METRICS_TOKEN)
 *   --expect-db DIALECT   exige um dialeto em /ready (ex.: postgres)
 *   --keep-account        não exclui a conta de teste ao final
 *   --timeout MS          timeout por requisição (default 30000)
 *
 * Saída: uma linha por etapa com status OK/FAIL/SKIP e, ao final, resumo.
 * Código de saída 0 = tudo verde, 1 = falha, 2 = uso inválido.
 */

const crypto = require('crypto');
const { CSRF_COOKIE, CSRF_HEADER } = require('../src/config/constants');

const CONFIRM_WORD = 'EXCLUIR';
const DEFAULT_TIMEOUT = 30000;

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.SMOKE_BASE_URL || process.env.APP_URL || null,
    generate: true,
    checkout: false,
    metrics: false,
    keepAccount: false,
    expectDb: null,
    metricsToken: process.env.SMOKE_METRICS_TOKEN || null,
    timeout: DEFAULT_TIMEOUT
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--base-url':
        opts.baseUrl = argv[++i];
        break;
      case '--no-generate':
        opts.generate = false;
        break;
      case '--generate':
        opts.generate = true;
        break;
      case '--checkout':
        opts.checkout = true;
        break;
      case '--metrics':
        opts.metrics = true;
        break;
      case '--keep-account':
        opts.keepAccount = true;
        break;
      case '--expect-db':
        opts.expectDb = argv[++i];
        break;
      case '--timeout':
        opts.timeout = Number(argv[++i]);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        if (arg && arg.startsWith('--')) {
          console.error(`Opção desconhecida: ${arg}`);
          process.exit(2);
        }
    }
  }
  return opts;
}

function printHelp() {
  console.log(
    [
      'Uso: npm run smoke -- [opções]',
      '',
      '  --base-url URL        URL base do app (ou env SMOKE_BASE_URL / APP_URL)',
      '  --no-generate         pula a geração de ação por IA',
      '  --checkout            cria sessão de checkout Stripe',
      '  --metrics             consulta /metrics (exige SMOKE_METRICS_TOKEN)',
      '  --expect-db DIALECT   exige dialeto em /ready (ex.: postgres)',
      '  --keep-account        não exclui a conta de teste ao final',
      '  --timeout MS          timeout por requisição (default 30000)'
    ].join('\n')
  );
}

/**
 * Executa o smoke test. Exportado para reuso em testes automatizados.
 * @param {object} options
 * @returns {Promise<{ results: Array, failed: number, skipped: number }>}
 */
async function runSmoke(options = {}) {
  const opts = {
    baseUrl: options.baseUrl || process.env.SMOKE_BASE_URL || process.env.APP_URL || null,
    generate: options.generate !== false,
    checkout: Boolean(options.checkout),
    metrics: Boolean(options.metrics),
    keepAccount: Boolean(options.keepAccount),
    expectDb: options.expectDb || null,
    metricsToken: options.metricsToken || process.env.SMOKE_METRICS_TOKEN || null,
    timeout: options.timeout || DEFAULT_TIMEOUT,
    log: options.log || console.log
  };

  if (!opts.baseUrl) {
    throw new Error('Base URL não informada. Use --base-url ou env SMOKE_BASE_URL/APP_URL.');
  }
  opts.baseUrl = opts.baseUrl.replace(/\/+$/, '');

  const jar = {};
  const results = [];
  let createdAccount = null;
  let smokeEmail = null;
  let cleanupDone = false;

  const log = opts.log;

  function record(name, status, detail = '') {
    const line = `${status.padEnd(5)} ${name}${detail ? ' — ' + detail : ''}`;
    log(line);
    results.push({ name, status, detail });
  }

  async function request(method, path, body) {
    const headers = { accept: 'application/json' };
    const cookieHeader = Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    if (cookieHeader) headers.cookie = cookieHeader;
    if (jar[CSRF_COOKIE]) headers[CSRF_HEADER] = jar[CSRF_COOKIE];
    if (body !== undefined) headers['content-type'] = 'application/json';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeout);
    let res;
    try {
      res = await fetch(`${opts.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    // atualiza o cookie jar a partir de Set-Cookie (valor bruto, sem decode/encode)
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('set-cookie')].filter(Boolean);
    for (const sc of setCookies) {
      const pair = String(sc).split(';')[0];
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const key = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        jar[key] = val;
      }
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_error) {
        data = text;
      }
    }
    return { status: res.status, data, text, headers: res.headers };
  }

  async function step(name, fn, { skip = false } = {}) {
    if (skip) {
      record(name, 'SKIP');
      return null;
    }
    const started = Date.now();
    try {
      const value = await fn();
      record(name, 'OK', `${Date.now() - started}ms`);
      return value;
    } catch (error) {
      const detail = error && error.message ? error.message : String(error);
      record(name, 'FAIL', detail);
      throw error;
    }
  }

  const run = async () => {
    // 1. Landing
    await step('landing: GET /', async () => {
      const res = await fetch(`${opts.baseUrl}/`, { method: 'GET' });
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      const html = await res.text();
      if (!/PRAXIS/i.test(html)) throw new Error('landing sem marca PRAXIS');
    });

    // 2. SPA
    await step('spa: GET /app/', async () => {
      const res = await fetch(`${opts.baseUrl}/app/`, { method: 'GET' });
      if (res.status !== 200) throw new Error(`status ${res.status}`);
    });

    // 2b. Rotas de entrada da landing (/entrar, /cadastro).
    // Regressão: um 404 aqui derrubava todos os CTAs de "Começar grátis".
    await step('landing: GET /entrar e /cadastro', async () => {
      for (const rota of ['/entrar', '/cadastro']) {
        const res = await fetch(`${opts.baseUrl}${rota}`, { method: 'GET' });
        if (res.status !== 200) throw new Error(`${rota} -> status ${res.status}`);
        const html = await res.text();
        if (!/screen-auth/.test(html)) throw new Error(`${rota} não serviu a SPA`);
      }
    });

    // 2c. Todo link público da landing precisa responder (nenhum 404).
    await step('landing: nenhum link público em 404', async () => {
      const html = await (await fetch(`${opts.baseUrl}/`, { method: 'GET' })).text();
      const links = [...new Set([...html.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]))];
      for (const link of links) {
        const res = await fetch(`${opts.baseUrl}${link}`, { method: 'GET' });
        if (res.status !== 200) throw new Error(`${link} -> status ${res.status}`);
      }
    });

    // 3. Health
    await step('health: GET /health', async () => {
      const res = await request('GET', '/health');
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (!res.data || res.data.status !== 'ok') throw new Error('status != ok');
    });

    // 4. Ready
    await step('ready: GET /ready', async () => {
      const res = await request('GET', '/ready');
      if (res.status !== 200)
        throw new Error(`status ${res.status} (${res.data && res.data.error})`);
      if (!res.data || res.data.status !== 'ready') throw new Error('not ready');
      if (opts.expectDb && res.data.db !== opts.expectDb) {
        throw new Error(`db=${res.data.db}, esperado ${opts.expectDb}`);
      }
    });

    // 5. CSRF (estabelece cookie)
    await step('csrf: GET /api/auth/csrf', async () => {
      const res = await request('GET', '/api/auth/csrf');
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (!res.data || !res.data.csrfToken) throw new Error('sem csrfToken');
      if (!jar[CSRF_COOKIE]) throw new Error('cookie CSRF ausente');
    });

    // 6. Cadastro
    const email = `smoke-${Date.now()}@example.com`;
    const password = `Smoke-${crypto.randomBytes(8).toString('hex')}!Aa1`;
    smokeEmail = email;
    const account = await step('auth: POST /api/auth/register', async () => {
      const res = await request('POST', '/api/auth/register', {
        name: 'Smoke Test',
        email,
        password,
        timezone: 'UTC',
        acceptedTerms: true
      });
      if (res.status !== 201) {
        throw new Error(
          `status ${res.status} (${res.data && res.data.error && res.data.error.message})`
        );
      }
      if (!res.data || !res.data.user || !res.data.user.id) throw new Error('sem user.id');
      if (!jar.praxis_session) throw new Error('sem cookie de sessão');
      return res.data;
    });
    createdAccount = account;

    // 7. Sessão
    await step('auth: GET /api/auth/me', async () => {
      const res = await request('GET', '/api/auth/me');
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (!res.data || !res.data.user || !res.data.user.email) throw new Error('sem email');
    });

    // 8. Meta (limite de pendentes)
    await step('praxis: GET /api/meta', async () => {
      const res = await request('GET', '/api/meta');
      if (res.status !== 200) throw new Error(`status ${res.status}`);
    });

    // 9. Geração (opcional)
    if (opts.generate) {
      const gen = await step('praxis: POST /api/praxis (IA)', async () => {
        const res = await request('POST', '/api/praxis', {
          texto: 'Preciso organizar minhas reuniões da semana e definir uma ação prática.',
          area: 'trabalho'
        });
        if (res.status !== 200) {
          const msg =
            res.data && res.data.error
              ? `${res.data.error.code}: ${res.data.error.message}`
              : `status ${res.status}`;
          throw new Error(
            msg + (res.data && res.data.requestId ? ` (reqId ${res.data.requestId})` : '')
          );
        }
        if (!res.data || !res.data.id) throw new Error('sem id da ação');
        return res.data;
      }).catch((_error) => {
        // não aborta o funil inteiro: registra e segue
        return null;
      });
      if (gen && gen.id) {
        /* conta criada com ação gerada */
      }
    } else {
      record('praxis: POST /api/praxis (IA)', 'SKIP', 'desabilitado');
    }

    // 10. Planos
    await step('billing: GET /api/billing/plans', async () => {
      const res = await request('GET', '/api/billing/plans');
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (!res.data || !Array.isArray(res.data.plans)) throw new Error('sem plans');
    });

    // 11. Assinatura (opcional)
    if (opts.checkout) {
      await step('billing: POST /api/billing/checkout (Stripe)', async () => {
        const res = await request('POST', '/api/billing/checkout', {});
        if (res.status !== 201) {
          const msg =
            res.data && res.data.error
              ? `${res.data.error.code}: ${res.data.error.message}`
              : `status ${res.status}`;
          throw new Error(msg);
        }
        if (!res.data || !res.data.url || !/^https:\/\/checkout\.stripe\.com/.test(res.data.url)) {
          throw new Error('url de checkout inválida');
        }
      });
    } else {
      record('billing: POST /api/billing/checkout (Stripe)', 'SKIP', 'use --checkout');
    }

    // 12. Metrics (opcional)
    if (opts.metrics) {
      await step('metrics: GET /metrics', async () => {
        const headers = {};
        if (opts.metricsToken) headers.authorization = `Bearer ${opts.metricsToken}`;
        const res = await fetch(`${opts.baseUrl}/metrics`, { headers });
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        const text = await res.text();
        if (!/# TYPE/.test(text)) throw new Error('formato prometheus ausente');
      });
    } else {
      record('metrics: GET /metrics', 'SKIP', 'use --metrics');
    }

    // 13. Cleanup (dentro do run, para o caso feliz)
    if (createdAccount && !opts.keepAccount) {
      await step('cleanup: DELETE /api/account', async () => {
        const res = await request('DELETE', '/api/account', { confirm: CONFIRM_WORD });
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        if (!res.data || res.data.deleted !== true) throw new Error('não deletada');
      }).catch((error) => {
        log(`   ! cleanup falhou: ${error.message} (conta ${smokeEmail} pode ter ficado no banco)`);
      });
      cleanupDone = true;
    } else if (createdAccount && opts.keepAccount) {
      record('cleanup: DELETE /api/account', 'SKIP', `--keep-account (conta ${smokeEmail})`);
      cleanupDone = true;
    }
  };

  let aborted = false;
  try {
    await run();
  } catch (_error) {
    aborted = true;
    // o step já registrou FAIL; não repetir
  } finally {
    // garante limpeza mesmo se o funil abortar no meio
    if (createdAccount && !opts.keepAccount && !cleanupDone) {
      try {
        const res = await request('DELETE', '/api/account', { confirm: CONFIRM_WORD });
        if (res.status === 200 && res.data && res.data.deleted === true) {
          record('cleanup: DELETE /api/account', 'OK', 'recuperado no finally');
        } else {
          log(`   ! cleanup no finally falhou: status ${res.status}`);
        }
      } catch (err) {
        log(`   ! cleanup no finally falhou: ${err.message} (conta ${smokeEmail} pode ter ficado)`);
      }
    } else if (createdAccount && opts.keepAccount && !cleanupDone) {
      record('cleanup: DELETE /api/account', 'SKIP', `--keep-account (conta ${smokeEmail})`);
    }
  }

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.status === 'OK').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
    skip: results.filter((r) => r.status === 'SKIP').length
  };

  log('');
  log(
    `Resumo: ${summary.ok} ok, ${summary.fail} falha(s), ${summary.skip} skip, ${summary.total} total.`
  );

  if (summary.fail > 0 || aborted) {
    process.exitCode = 1;
  }
  return { results, ...summary };
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.baseUrl) {
    console.error('Base URL obrigatória. Use --base-url ou env SMOKE_BASE_URL/APP_URL.');
    process.exit(2);
  }
  runSmoke(opts)
    .then((summary) => {
      if (summary.fail > 0) process.exit(1);
    })
    .catch((error) => {
      console.error(`Erro fatal: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { runSmoke };
