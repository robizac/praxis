# PRAXIS — Relatório de análise, auditoria e proposta de correção

**Produção:** https://praxis-5wcz.kymus.app
**Repositório:** https://github.com/robizac/praxis (clonado em `/root/projeto/praxis`)
**Data:** 2026-10-20
**Branch base:** `main` @ `442ab7a` (Merge PR #15)

---

## 1. Resumo executivo

| # | Achado | Severidade | Status |
|---|--------|-----------|--------|
| **A** | **Produção está 4 commits atrás do `main`** — deploy desatualizado | 🔴 Crítico | **Causa raiz do bug reportado** |
| **B** | **`POST /api/praxis` retorna 502 — a IA está 100% quebrada em produção** | 🔴 Crítico | A função principal do produto não funciona |
| **C** | Cloudflare mascara o erro real do app (JSON → página genérica do CF) | 🔴 Crítico | Usuário vê "Bad gateway" em vez da dica útil |
| **D** | `APP_URL=http://localhost:3000` em produção → CORS permite só `localhost` | 🟠 Alto | Config de deploy |
| **E** | `STRIPE_PRICE_*` vazias → `priceId: null`, `purchasable: false` | 🟠 Alto | Checkout indisponível |
| **F** | Rate limit de auth: **20 req / 15 min por IP** | 🟠 Alto | Trava login em IP compartilhado |
| **G** | `formatPtBr` depende de ICU `pt-BR` → quebra em Node sem locale data | 🟡 Médio | Teste falha fora do CI |
| **H** | `sitemap.xml` aponta para `dash.kymus.app/hosting/` | 🟡 Médio | SEO errado |
| **I** | Sem favicon → `/favicon.ico` 404 | 🟡 Baixo | Polimento |
| **J** | `?plan=pro` / `?plan=pro_annual` ignorados pela SPA | 🟡 Baixo | UX dos CTAs de plano |
| **K** | `weekly_reviews.json` (dado de runtime) versionado no git | 🟡 Baixo | Higiene |
| **L** | `npm audit`: 9–12 vulnerabilidades (1 crítica) em transitivas | 🟡 Médio | Dependências |

**Teste falhando no `main`:** `test/domain.test.js` → `toIsoFromPtBr faz round-trip com formatPtBr` — **falha** (ver G).

---

## 2. Causa raiz do bug reportado ("os links não funcionam")

### 2.1 O erro é real e reproduzido

```
GET https://praxis-5wcz.kymus.app/entrar
→ HTTP 404
→ content-type: application/json
→ {"error":{"code":"not_found","message":"Rota não encontrada."},"requestId":"..."}
```

Idêntico ao JSON reportado pelo usuário. ✅ **Reproduzido.**

### 2.2 Diagnóstico forense: qual commit está no ar?

Comparei o **hash blob (sha1 do git)** do HTML de produção com todo o histórico:

| Arquivo | Blob em produção | Commit mais recente que o contém |
|---|---|---|
| `web/landing/index.html` | `782bf88f…` | `8092455` |
| `web/app/app.js` | `f0647726…` | `8092455` |

**Produção roda `8092455`** (Merge PR #13 — `feat/fase9-lancamento`, 20/10 07:40 -0300).

### 2.3 Commits que estão no `main` e **não** em produção

```
e537ec4  fix(landing): corrige links /cadastro e /entrar para /app (404)   ← O FIX JÁ EXISTE
9702bd8  feat(app): server-side history filters, edit/delete/upcoming, profile/password, admin panel, landing links
0120b65  feat(auth): consentimento aos termos no cadastro (RF-07)
32e3af4  feat(quick-wins): PWA, dashboard/resumo e exportação CSV/Markdown
```

> 🔎 **Prova adicional:** em produção, `POST /api/auth/register` **sem** `acceptedTerms` retorna **201**. No `main`, `acceptedTerms` é **sempre** obrigatório (`src/services/authService.js:98`). Logo, produção **não** tem o commit `0120b65`. Confirma o diagnóstico.

### 2.4 Conclusão

> **O bug NÃO é de código — é de deploy.**
> O fix `e537ec4` já está no `main` (PR #15, mergeado 41 min após a análise). **O deploy simplesmente não foi feito** (ou falhou).

Consequências do deploy atrasado:
- `/entrar` e `/cadastro` → 404 (o que o usuário reportou)
- Sem PWA, sem dashboard/resumo, sem exportação CSV/Markdown
- Sem filtros de histórico no servidor, sem edição/exclusão, sem perfil/senha
- **Sem painel admin**
- Sem consentimento de termos (exigência legal/LGPD — `docs/14`)
- **2 migrações pendentes**: `009_completed_at`, `010_terms_consent`

---

## 3. Bug crítico: a IA está 502 em produção

### 3.1 Evidência

```
POST /api/praxis  →  502  em 0,1s   (content-type: application/json)
body (CF): {"type":"https://developers.cloudflare.com/.../error-502/",
            "title":"Error 502: Bad gateway","cloudflare_error":true, ...}
```

### 3.2 O processo NÃO reinicia

```
/health antes:  {"status":"ok","uptime":41415}
POST /api/praxis → 502
/health depois: {"status":"ok","uptime":41415}   → sem reinício
```

Não é crash, não é timeout (0,1s), não é sobrecarga.

### 3.3 Reprodução local (idêntica)

Rodei o app localmente com `NODE_ENV=production`:

```
POST /api/praxis → 502
{"error":{"code":"ai_provider_error",
          "message":"OpenAI não conseguiu gerar a resposta.",
          "details":{"provider":"openai",
                     "hint":"Confirme a chave, o crédito disponível e o modelo."}},
 "requestId":"…"}
```

**O app responde 502 corretamente com uma dica útil — mas o Cloudflare substitui o body pela página genérica dele.** Logo o usuário nunca vê a dica.

### 3.4 Causa provável

`ProviderError` usa **status 502** (`src/domain/errors.js:70`). O `openai.js` lança esse erro em 3 casos:

| Situação | Mensagem | Latência |
|---|---|---|
| Sem chave nenhuma | "Nenhuma chave da OpenAI configurada." | instantânea |
| Chave inválida/sem crédito | "OpenAI não conseguiu gerar a resposta." | ~300 ms |
| Modelo inexistente | "OpenAI não conseguiu gerar a resposta." | ~300 ms |

A latência de **0,1s** em produção (origem perto do CF) é compatível com **falha de autenticação na OpenAI** — chave ausente/inválida — ou com **modelo inexistente**.

🔎 **Pista forte no próprio repo:** `.env.example:28` define `AI_DEFAULT_MODEL=gpt-5-nano` ("modelo econômico padrão") e `docs/13-deploy-kymus.md` repete `AI_DEFAULT_MODEL=gpt-5-nano`. Se a produção copiou esse valor, a chamada falha com 404 da OpenAI → 502.

⚠️ **Não tenho acesso aos logs nem ao `.env` de produção** — isso precisa ser confirmado no painel da Kymus. O `scripts/smoke.js` (do próprio repo) já sinaliza: `FAIL praxis: POST /api/praxis (IA) — status 502`.

---

## 4. Auditoria de limpeza do repositório

### 4.1 Branches — ✅ **TODAS LIMPAS**

| Branch | ahead de main | mergeada em main |
|---|---|---|
| `chore/opencode-custom-tool-v2` | 0 | ✅ |
| `chore/reviewer-subagent` | 0 | ✅ |
| `chore/tooling-lint-format` | 0 | ✅ |
| `docs/agents-e-readme` | 0 | ✅ |
| `docs/guia-opencode` | 0 | ✅ |
| `feat/fase12-completude` | 0 | ✅ |
| `feat/fase8-hardening` | 0 | ✅ |
| `feat/fase9-lancamento` | 0 | ✅ |
| `feat/opencode-workflow` | 0 | ✅ |
| `fix/domain-datas-tags` | 0 | ✅ |
| `hotfix/landing-links` | 0 | ✅ |
| `main` | 0 | ✅ |

**Nenhum commit perdido, nenhum branch órfão, nenhum trabalho não mergeado.** Working tree limpa. ✅

### 4.2 Integridade

| Verificação | Resultado |
|---|---|
| `git fsck --full --strict` | ✅ sem corrupção |
| Segredos commitados (`.env`, `*.pem`, `*.key`) | ✅ nenhum (só `.env.example`) |
| `node_modules/`, `dist/`, `coverage/` versionados | ✅ nenhum |
| Blobs duplicados | ✅ só as migrações `postgres/` × `sqlite/` (dialetos diferentes — **intencional**) |
| Dead code (grafo de imports a partir das entradas) | ✅ **nenhum** (o único "órfão", `src/jobs/reminders.worker.js`, é entrypoint do `npm run worker`) |
| `require()` apontando pra arquivo inexistente | ✅ **nenhum** |
| Assets quebrados nos HTML do repo | ✅ **nenhum** |
| Rotas citadas na landing × rotas do servidor | ✅ todas existem |
| Permissões de arquivo | ✅ normais |
| CRLF/LF | ✅ uniforme |

### 4.3 O que precisa de ajuste

| Item | Problema | Ação |
|---|---|---|
| `.gitignore` | só 9 linhas; falta `.env.*` (só `.env` está), `*.log`, `coverage/`, `.DS_Store`, `.vscode/`, `*.tsbuildinfo`, `dist/`, `uploads/` | completar |
| `weekly_reviews.json` | dado de runtime **versionado** (conteúdo `[]`); usado só por `scripts/migrate-legacy.js` | `git rm --cached` + ignorar (o script já lida com ausência) |
| `.gitattributes` | inexistente → risco de diff falso de CRLF/LF entre máquinas | criar com `* text=auto eol=lf` |
| `npm audit` | 9 vulns (1 crítica: `tar` via `sqlite3`; `uuid` via `node-cron`; `braces` via `nodemon`) | ver §6 |

### 4.4 Testes / lint no `main`

```
npm run lint  → ✅ passou (oxlint, sem warnings)
npm test      → ⚠️ 93 passaram, 1 FALHOU
                  test/domain.test.js:52
                  "toIsoFromPtBr faz round-trip com formatPtBr (vírgula do pt-BR)"
                  esperado '2026-12-25T20:00:00.000Z' → obtido null
```

**Causa (item G):** `formatPtBr` usa `date.toLocaleString('pt-BR', …)`, que depende dos dados de locale do ICU. Em Node sem `pt-BR` (small-icu), o resultado sai em **en-US** (`12/25/2026, 20:00`) → o parser pt-BR não reconhece → `null`.

```
neste container:  Intl.DateTimeFormat.supportedLocalesOf(['pt-BR']) = []   ← small-icu
formato gerado:   "12/25/2026, 20:00"  (en-US)   ← deveria ser "25/12/2026, 20:00"
```

**Impacto real (não só de teste):** se o deploy usar um Node sem ICU completo, o usuário vê **"Prazo: 12/25/2026, 20:00"** (formato americano) e o app ainda **não consegue reinterpretar a própria data** → cai no fallback e grava o prazo errado no banco.

> O `Dockerfile` usa `node:20-alpine` (imagem oficial, full-ICU) → produção está OK. Mas o `test/` roda em Node com ICU variável, e qualquer ambiente novo/ Alpine com `apk add nodejs` quebra.

---

## 5. Proposta de correção

### Branch 1 — `fix/rotas-entrar-cadastro` (o bug reportado)

**5.1 Rotas `/entrar` e `/cadastro` no servidor** (`src/http/app.js`)

Hoje só existem `/`, `/app`, `/termos`, `/privacidade`, `/contato`. O fix `e537ec4` apontava tudo para `/app` — o que resolve o 404, mas **"Começar grátis" cairia na tela de *Entrar***, e as URLs `/entrar` e `/cadastro` (já divulgadas em marketing) continuariam 404.

Proposta: registrar as duas rotas servindo a SPA, preservando a query string:

```js
// Rotas de entrada: preservam a URL pública e abrem a aba correta da SPA.
for (const page of ['entrar', 'cadastro']) {
  app.get(`/${page}`, (_req, res) => res.sendFile(path.join(WEB_APP_DIR, 'index.html')));
}
```

**5.2 SPA escolhe a aba inicial pela URL** (`web/app/app.js`)

No `bootstrap()` (hoje termina em `showAuth('login')`):

```js
const path = window.location.pathname;
const params = new URLSearchParams(window.location.search);
const view = path.endsWith('/cadastro') || params.get('tab') === 'register'
  ? 'register'
  : path.endsWith('/entrar') || params.get('tab') === 'login'
    ? 'login'
    : null;
if (view) showAuth(view);
```

**5.3 `?plan=` respeitado** — guardar o plano da query e, após o cadastro, ir para `#/account` e disparar o checkout (`startCheckout(planId)` já existe).

**5.4 Landing** — manter `/entrar` e `/cadastro` (não `/app`), para que "Começar grátis" leve ao cadastro.

**5.5 Favicon** — `web/landing/favicon.svg` + `<link rel="icon">` na landing e no app.

**5.6 `sitemap.xml`** — corrigir domínio e listar `/`, `/app`, `/termos`, `/privacidade`, `/contato`.

### Branch 2 — `chore/auditoria-limpeza`

- `.gitignore` completo
- `.gitattributes` novo
- `git rm --cached weekly_reviews.json` + ignorar
- `formatPtBr` sem depender de ICU (formatar a data manualmente) → **corrige o teste que falha** e elimina a fragilidade
- `npm audit fix` (com revisão)

### Branch 3 (ou commit) — `fix/ia-producao-502`

- **Config de produção** (não é código): validar `MANAGED_OPENAI_API_KEY` e `AI_DEFAULT_MODEL` (o repo sugere `gpt-5-nano`, que precisa existir na conta)
- **Código (opcional, mas recomendado):** `ProviderError` não deveria usar **502** — 502 é "bad gateway do proxy" e faz o Cloudflare substituir o body pelo dele. Trocar para **503** (`Service Unavailable`) faz o app devolver a dica real ao usuário. Alternativa: manter 502 mas expor `details.hint` no topo.

### Deploy (o item mais importante)

**O fix do bug reportado é só o deploy.** Após o merge:
1. `npm run migrate` (aplica `009_completed_at` e `010_terms_consent`)
2. reiniciar web + worker
3. rodar `npm run smoke -- --base-url https://praxis-5wcz.kymus.app` → **tem que dar 13/13**

---

## 6. Riscos e atenção

| Item | Observação |
|---|---|
| Migrações pendentes | `009_completed_at` e `010_terms_consent` — são aditivas, mas testar em staging antes |
| `npm audit fix --force` | o `--force` propõe **downgrade** (`sqlite3@6.0.1`, `nodemon@1.14.10`, `node-cron@4.6.0`) — **não aplicar `--force`**. Tratar manualmente e testar |
| Rate limit de auth | Subir de 20/15min ou isentar `/api/auth/csrf` e `/api/auth/me` do limite de tentativas |
| Repositório está **público** | Lembrete: voltar para *Private* quando terminar (o app não tem segredos no repo, mas o histórico é público) |
| Tokens expostos no chat | Revogar `github_pat_…` e `ghp_…` ao final |
