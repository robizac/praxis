'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createApp } = require('../src/http/app');

const ROOT = path.join(__dirname, '..');

async function withServer(run) {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/**
 * Regressão do bug de produção: a landing apontava para `/entrar` e
 * `/cadastro`, rotas que não existiam e caíam no catch-all 404 JSON
 * ("Rota não encontrada."). Todo link público da landing precisa responder.
 */
test('landing: todo link público da página responde 200 (regressão /entrar e /cadastro)', async () => {
  await withServer(async (base) => {
    const html = await (await fetch(`${base}/`)).text();
    const links = [...new Set([...html.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]))];

    assert.ok(links.length > 0, 'a landing deve ter links públicos');
    for (const link of links) {
      const res = await fetch(`${base}${link}`);
      assert.equal(res.status, 200, `link ${link} da landing respondeu ${res.status}`);
    }
  });
});

test('landing: mantém os links /entrar e /cadastro (não /app)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'web', 'landing', 'index.html'), 'utf8');
  assert.match(html, /href="\/entrar"/, 'a landing deve linkar /entrar');
  assert.match(html, /href="\/cadastro"/, 'a landing deve linkar /cadastro');
  assert.doesNotMatch(html, /href="\/app"/, 'a landing não deve linkar direto para /app');
});

test('/entrar e /cadastro servem a SPA (não o JSON de rota não encontrada)', async () => {
  await withServer(async (base) => {
    for (const rota of [
      '/entrar',
      '/cadastro',
      '/cadastro?plan=pro',
      '/cadastro?plan=pro_annual'
    ]) {
      const res = await fetch(`${base}${rota}`);
      assert.equal(res.status, 200, `${rota} respondeu ${res.status}`);
      assert.match(
        res.headers.get('content-type') || '',
        /text\/html/,
        `${rota} não devolveu HTML`
      );
      const html = await res.text();
      assert.match(html, /id="screen-auth"/, `${rota} não serviu a SPA`);
      assert.doesNotMatch(html, /Rota não encontrada/, `${rota} devolveu o catch-all JSON`);
    }
  });
});

test('rota desconhecida continua devolvendo o JSON de erro padronizado', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/rota-que-nao-existe`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    const body = await res.json();
    assert.equal(body.error.code, 'not_found');
    assert.equal(body.error.message, 'Rota não encontrada.');
    assert.ok(body.requestId, 'o erro deve trazer requestId');
  });
});

test('sitemap.xml é gerado a partir do APP_URL e lista as páginas reais', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/sitemap.xml`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /xml/);
    const xml = await res.text();
    assert.match(xml, /<urlset/);
    assert.match(xml, /<loc>[^<]*\/app<\/loc>/);
    assert.match(xml, /<loc>[^<]*\/cadastro<\/loc>/);
    assert.match(xml, /<loc>[^<]*\/entrar<\/loc>/);
    assert.doesNotMatch(
      xml,
      /kymus\.app\/hosting/,
      'o sitemap não pode apontar para o site da Kymus'
    );
  });
});

test('a SPA abre a aba de cadastro quando a URL termina em /cadastro', () => {
  const app = fs.readFileSync(path.join(ROOT, 'web', 'app', 'app.js'), 'utf8');
  assert.match(app, /function authViewFromUrl\(\)/, 'a SPA precisa ler a aba inicial da URL');
  assert.match(
    app,
    /showAuth\(authViewFromUrl\(\) \|\| 'login'\)/,
    'o bootstrap precisa usar a aba da URL'
  );
});

test('a SPA respeita o plano pedido pela landing (?plan=)', () => {
  const app = fs.readFileSync(path.join(ROOT, 'web', 'app', 'app.js'), 'utf8');
  assert.match(app, /function requestedPlan\(\)/);
  assert.match(app, /await maybeStartRequestedCheckout\(\);/);
});
