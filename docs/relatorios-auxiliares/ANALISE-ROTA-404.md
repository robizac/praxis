# PRAXIS — Análise do erro "Rota não encontrada." em produção

Ambiente analisado: https://praxis-5wcz.kymus.app
Data: 2026-10-20

---

## 1. Diagnóstico (confirmado em produção)

### 1.1 Origem exata do erro

O JSON reportado pelo usuário é o **404 do catch-all do servidor**:

```json
{
  "error": { "code": "not_found", "message": "Rota não encontrada." },
  "requestId": "5b977b52-e737-4a7b-98e0-3201887b03e0"
}
```

Ele é devolvido (HTTP 404, `content-type: application/json`) por qualquer rota
HTML que não exista no servidor — inclusive pelas rotas da landing page.

### 1.2 Links quebrados (reproduzido)

Varredura de TODOS os `href`/`src` da landing page (`/`) e do app (`/app`):

| Link                        | Status  | Observação                                 |
| --------------------------- | ------- | ------------------------------------------ |
| `/`                         | 200     | ok                                         |
| `/entrar`                   | **404** | **QUEBRADO** → JSON "Rota não encontrada." |
| `/cadastro`                 | **404** | **QUEBRADO** → JSON "Rota não encontrada." |
| `/cadastro?plan=pro`        | **404** | **QUEBRADO** → JSON "Rota não encontrada." |
| `/cadastro?plan=pro_annual` | **404** | **QUEBRADO** → JSON "Rota não encontrada." |
| `/termos`                   | 200     | ok                                         |
| `/privacidade`              | 200     | ok                                         |
| `/contato`                  | 200     | ok                                         |
| `/app`                      | 200     | ok — **este é o app real (SPA)**           |
| `/app/app.js`               | 200     | ok                                         |
| `/app/styles.css`           | 200     | ok (stylesheet próprio do app)             |
| `/styles.css`               | 200     | ok (stylesheet da landing)                 |
| `/favicon.ico`              | 404     | QUEBRADO (menor)                           |

### 1.3 Causa raiz

A landing page (`public/index.html`) aponta para `/entrar` e `/cadastro`,
mas **essas rotas não existem no servidor**. O SPA do produto é servido em
`/app` (e qualquer subpath de `/app`, ex.: `/app/entrar` → 200, serve o index
do SPA). Nenhum link da landing page aponta para `/app`.

Resultado: o usuário clica em "Entrar" / "Começar grátis" / "Assinar Pro" e cai
no catch-all JSON 404.

### 1.4 O que NÃO está quebrado (verificado)

- **API 100% funcional.** Com sessão válida, todos os endpoints usados pelo
  `app.js` respondem 200:
  `/api/auth/csrf`, `/api/auth/login`, `/api/auth/register`, `/api/auth/me`,
  `/api/auth/logout`, `/api/auth/forgot-password`, `/api/auth/reset-password`,
  `/api/auth/verify-email`, `/api/history`, `/api/history/:id`,
  `/api/weekly-reviews`, `/api/meta`, `/api/praxis`, `/api/settings`,
  `/api/ai/usage`, `/api/ai/credentials`, `/api/billing/plans`,
  `/api/billing/subscription`, `/api/billing/checkout`, `/api/billing/portal`,
  `/api/telegram`, `/api/telegram/link-code`, `/api/telegram/link`.
- **Cadastro e login funcionam** (teste real: register → 201, login → 200,
  sessão `praxis_session` emitida, `/api/auth/me` → 200).
- Rotas inexistentes sob `/api/*` com sessão → 404 `not_found` (comportamento
  correto). Sem sessão, qualquer `/api/*` (inclusive inexistente) → 401
  (guard global de autenticação roda antes do roteador).

---

## 2. Achados secundários (produção)

| #   | Achado                                                                                                     | Evidência                                                   | Impacto                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | **Rate limit de auth muito agressivo**: `20 req / 900s` por IP em `/api/auth/*` (o resto da API é 120/min) | headers `ratelimit-limit: 20;w=900`                         | Em IP compartilhado (CGNAT móvel, NAT corporativo, Wi-Fi de família) o **login/cadastro passa a dar 429** ("Muitas tentativas") — o usuário conclui que o site está quebrado. O app consome 2+ chamadas de auth por page load. |
| S2  | **CORS fixado em `http://localhost:3000`**                                                                 | header `access-control-allow-origin: http://localhost:3000` | Resíduo de dev. Qualquer chamada cross-origin real é bloqueada.                                                                                                                                                                |
| S3  | **Checkout indisponível em produção**: `priceId: null` e `purchasable: false` em todos os planos           | `GET /api/billing/plans`                                    | Os CTA "Assinar Pro"/"Assinar Pro Anual" terminam em "Pagamentos indisponíveis no momento." (falta config Stripe/env).                                                                                                         |
| S4  | **sitemap.xml aponta para o site errado**                                                                  | `https://dash.kymus.app/hosting/`                           | SEO: o sitemap do PRAXIS referencia a página de hosting da Kymus. Deveria listar `/`, `/app`, `/termos`, `/privacidade`, `/contato` no domínio do PRAXIS.                                                                      |
| S5  | **`/favicon.ico` → 404** e a landing não declara `<link rel="icon">`                                       | —                                                           | Erro 404 no console + ícone genérico no navegador.                                                                                                                                                                             |
| S6  | **`?plan=pro` / `?plan=pro_annual` são ignorados pelo app**                                                | `app.js` só lê `checkout`/`billing` da query string         | Mesmo depois de corrigir o link, o plano pretendido se perde.                                                                                                                                                                  |
| S7  | **Sem rota de tela de cadastro na SPA**: `showAuth()` só é chamada com `'login'` no bootstrap              | `app.js` `bootstrap()`                                      | Não há como pré-selecionar a aba "Criar conta" por URL.                                                                                                                                                                        |

---

## 3. Correção proposta

### 3.1 Correção principal (obrigatória) — as rotas `/entrar` e `/cadastro`

**Estratégia: manter as URLs públicas e criar as rotas no servidor** (compatível
com links já distribuídos em anúncios, e-mails, SEO e bookmarks) **+**
**corrigir os hrefs** como rede de segurança (o link passa a funcionar mesmo
que a rota de servidor falhe).

**3.1.1 — Backend: registrar as rotas `/entrar` e `/cadastro`**

Servir o mesmo HTML do app (`app.html` / `index.html` de `/app`) nestas rotas,
preservando a query string (`?plan=pro`).

**3.1.2 — Frontend: `app.js` passa a escolher a aba inicial pela URL**

No `bootstrap()`, antes de `showAuth('login')`:

- pathname `/cadastro` (ou query `?tab=register`) → `showAuth('register')`
- pathname `/entrar` (ou query `?tab=login`) → `showAuth('login')`

Assim "Começar grátis" abre direto a aba **Criar conta** e "Entrar" abre a aba
**Entrar**.

**3.1.3 — Frontend: `public/index.html` (landing)**

Trocar os hrefs quebrados por rotas que existem:

- `href="/entrar"` → `href="/entrar"` (agora existe) — ou `href="/app"`
- `href="/cadastro"` → `href="/cadastro"` (agora existe)
- `href="/cadastro?plan=pro"` → mantém
- `href="/cadastro?plan=pro_annual"` → mantém

**Decisão-chave:** manter `/entrar` e `/cadastro` (em vez de apontar tudo para
`/app`) porque o **nome da URL comunica a intenção** ("Começar grátis" precisa
levar à tela de cadastro, não à de login) e porque links de marketing já
circulam com essas URLs. O `/app` continua acessível e passa a ser o alvo
do botão "Entrar" apenas como fallback.

### 3.2 Correções secundárias (recomendadas, no mesmo PR)

- **S6** — `app.js`: ler `?plan=` e, após o cadastro/login, ir para `#/account`
  e disparar o checkout do plano (reusando `startCheckout`).
- **S5** — adicionar `favicon.svg` + `<link rel="icon">` na landing e no app;
  servir `/favicon.ico` (ou redirecionar para o SVG).
- **S4** — corrigir `sitemap.xml` para o domínio do PRAXIS e listar as páginas
  reais.
- **S1** — subir o limite de `/api/auth/*` (ex.: 20/900s → 60/900s) e/ou
  desacoplar o limite de `/api/auth/csrf` e `/api/auth/me` do limite de
  tentativas de login. É o item com maior risco de "o site parece quebrado".
- **S2** — trocar o CORS fixo por variável de ambiente (`APP_ORIGIN`).
- **S3** — configurar `STRIPE_PRICE_*` no ambiente de produção (config, não
  código).

---

## 4. Arquivos prováveis a alterar

```
public/index.html                 (landing — hrefs de /entrar e /cadastro)
public/app/app.js                 (bootstrap: aba inicial + ?plan=)
public/app/index.html             (se necessário: <link rel="icon">)
public/favicon.svg / public/favicon.ico   (novo)
src/server.ts (ou src/app.ts / src/index.ts)  (rotas /entrar e /cadastro)
public/sitemap.xml                (domínio e URLs)
```

_(A estrutura real do repositório será confirmada após o clone.)_

---

## 5. Plano de testes (após implementar)

1. `GET /entrar` → 200 `text/html` e abre a aba "Entrar".
2. `GET /cadastro` → 200 `text/html` e abre a aba "Criar conta".
3. `GET /cadastro?plan=pro` → 200 e preserva o plano.
4. `GET /app` → continua 200 (sem regressão).
5. Landing page: clicar em "Entrar", "Começar grátis", "Assinar Pro",
   "Assinar Pro Anual" → nenhum 404.
6. Register → 201, login → 200, `/api/auth/me` → 200.
7. Varredura automática de todos os `href` da landing + app → 0 respostas 404.
