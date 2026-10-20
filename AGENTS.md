# AGENTS.md — Guia para agentes e contribuidores

Este arquivo descreve **arquitetura, padrões e convenções** do PRAXIS para quem
for alterar o código (humanos ou agentes de IA). Leia antes de implementar.
Detalhes em [`docs/`](docs/README.md).

## Estado atual

**Fases 1 a 8 concluídas** — o código vive em `src/`
(camadas: `http → services → repositories/domain`). Banco: SQLite em dev, Postgres
quando `DATABASE_URL` existe. Migrações versionadas, logger estruturado, erros
tipados, health/ready, CI e Docker.

- Controle de acesso implementado: cadastro/login/logout, sessão em cookie httpOnly,
  CSRF double-submit, Argon2id, verificação de e-mail, reset de senha e `audit_log`.
- Multi-tenancy ativa (Fase 3): `praxis_items`, `reminders`, `weekly_reviews` escopados por `user_id`. Linhas com `user_id NULL` existem apenas em bases legadas (usar `scripts/migrate-legacy.js` para migrar).
- IA híbrida (Fase 4): modo **gerenciado** (chave da plataforma, com cota do plano)
  ou **BYOK** (chave do usuário, cifrada com AES-256-GCM, sem cota). Providers:
  OpenAI, Anthropic, Gemini e Ollama. Uso e custo ficam em `ai_usage`.
- Cobrança (Fase 5): Stripe Checkout + Billing Portal; webhook `/webhooks/stripe`
  (assinatura verificada, idempotente por `event.id`); `subscriptions` sincronizada;
  plano efetivo (`free`/`pro`/`pro_annual`) resolvido em `attachUser` (`req.user.plan`).
  Ativação **só** por webhook — nunca pelo `success_url`.
- Landing + roteamento (Fase 6): landing pública em `/` (`web/landing`), SPA em
  `/app` (`web/app`), com SEO/OG/JSON-LD e páginas legais (`termos`, `privacidade`).
- Lembretes confiáveis (Fase 7): worker `npm run worker`
  (`src/jobs/reminders.worker.js`) entrega canais `telegram` e `email` fora do
  processo web; retentativas com `attempts`/`last_error` (teto 5); Telegram
  **por usuário** via código de pareamento (`telegram_chats` +
  `telegram_link_codes`, webhook `/webhooks/telegram`); lembrete default ao criar
  ação, configurável em `GET/PUT /api/settings` (`reminderDefault`).
- Hardening/LGPD (Fase 8): CSP sem `unsafe-inline` (HTML/CSS/JS externos,
  `Permissions-Policy`), exportação (`GET /api/account/export`) e exclusão
  (`DELETE /api/account`) de dados, `/metrics` Prometheus (opcional
  `METRICS_TOKEN`), alertas por log/e-mail (`ALERT_EMAIL`) para 5xx, webhook,
  worker e custo de IA, e scripts de backup/restauração (`npm run backup`,
  `npm run backup:test-restore`). Checklist em `docs/14`.
- Arquivos legados na raiz (`server.js`) viraram shims de compatibilidade.

## Arquitetura

Monólito modular em camadas: `http → services → repositories/domain`.
Estrutura atual:

```
src/
  config/        env validada, constantes
  domain/        regras puras (areas, limits, plans, praxis, reminders, errors)
  http/          app, server, middleware, routes
  services/      casos de uso (praxis/history, review, reminder, usage, billing, account, auth, settings, telegram, audit, alert, ai/)
  repositories/  SQL (sempre escopado por user_id)
  integrations/  stripe, telegram, crypto
  jobs/          worker de lembretes + alertas operacionais
  db/            pool + migrations
web/
  landing/       página pública
  app/           SPA
```

## Regras de ouro

1. Rota não fala SQL; serviço não fala `req`/`res`; domínio não faz I/O.
2. Toda consulta de dados do usuário é escopada por `user_id` (da sessão, nunca do cliente).
3. Config só via `src/config/env.js` (validada no boot). Sem segredos no código.
4. Erros tipados (`AppError`); nunca `res.status(500)` solto na rota.
5. Toda mudança de schema é uma migração numerada e aditiva.
6. Entitlements (plano) são checados por middleware, não espalhados nas rotas.

## Convenções

- Nomes: arquivos `kebab.case.js`, funções `camelCase`, constantes `UPPER_SNAKE`.
- `async/await`; sem callbacks novos.
- Datas em ISO/UTC no transporte; pt-BR só na apresentação.
- API: shape de erro único `{ error: { code, message }, requestId }`.
- Commits: Conventional Commits. Branches `feat/`, `fix/`, `docs/`, `chore/`.
- Segurança: Argon2id, cookie httpOnly, CSRF, helmet, rate limit.
- Front: mobile-first, `escapeHtml` ao injetar dados, estados vazio/erro/carregando.

Exemplos (o "bom" ilustra a regra; evite o "ruim"):

```js
// Bom: escopo por user_id da sessão, erro tipado, serviço sem req/res.
async function update(userId, id, fields) {
  const item = await praxisRepo.getById(userId, id); // nunca confia no cliente
  if (!item) throw new NotFoundError('Item não encontrado.');
  return praxisRepo.updateFields(userId, id, fields);
}

// Ruim: SQL na rota, userId vindo do corpo, erro 500 solto, callbacks.
router.patch('/items/:id', (req, res) => {
  db.run('UPDATE items SET status=? WHERE id=' + req.params.id, (err) => { // SQL na rota + concat
    if (err) return res.status(500).send('erro'); // sem AppError
  });
});
```

```js
// Bom: idioma único de erro.
throw new ConflictError('Você já tem 2 ações pendentes.', 'limite_pendentes', { pendentes });

// Ruim: cada rota inventa um shape.
res.status(409).json({ mensagem: 'limite', ok: false });
```

Ver [`docs/04-padroes-e-convencoes.md`](docs/04-padroes-e-convencoes.md).

## Comandos

```bash
npm i                  # instalar
npm run dev            # desenvolvimento (nodemon)
npm start              # produção
npm test               # node --test (suíte completa)
npm run lint           # oxlint (análise estática)
npm run format         # prettier --write (formatação)
npm run check          # lint + format:check + test
npm run test:coverage  # testes com cobertura (thresholds embutidos)
npm run migrate        # aplica migrações (idempotente)
npm run migrate:legacy # associa dados legados (user_id NULL) a um dono
npm run stripe:setup   # cria produtos/preços de teste na Stripe e imprime os IDs
npm run worker         # worker de lembretes (telegram/e-mail), fora do processo web
npm run backup         # backup do banco (pg_dump ou VACUUM INTO) com rotação
npm run backup:test-restore -- --file <backup>  # valida a restauração
```

> Em produção, **não** rode o cron de lembretes dentro do processo web: use
> `npm run worker` como processo separado.

## Testes

- Rode com `npm test` (Node `--test`, sem framework externo).
- **Todo bug corrigido ganha um teste de regressão** que falharia antes da correção.
  Prefira testar a **borda** que expôs o bug (datas inválidas, entrada fora de faixa,
  isolamento por usuário) a reescrever o caminho feliz.
- Não use mocks para o que o projeto já exercita de verdade (SQLite em memória nos
  testes de integração; `skip = db.dialect !== 'sqlite'` quando o caso só vale em SQLite).
- Testes ficam em `test/*.test.js`, um arquivo por área (`domain`, `auth`, `billing`...).

## Lint e formatação (parte do loop de feedback)

- **Ao terminar de mexer na lógica, rode:**
  ```bash
  npm run lint     # oxlint (rápido; falha em erros de correção)
  npm run format   # prettier --write (formata tudo; ignore arquivos gerados)
  ```
- Rode a formatação **por último**, depois que a lógica estiver pronta.
- `npm run check` encadeia lint + format:check + test (use antes de abrir PR).
- Estilo é responsabilidade do Prettier (`.prettierrc.json`), não do agente: não
  discuta indentação/vírgula. Convenção de `catch (_error)` (prefixo `_`) é aceita.

## MCP servers (poucos, de propósito)

Cada MCP server **paga contexto** descrevendo suas tools ao modelo, mesmo sem uso.

- **Mantenha pouquíssimos servers.** Só adicione um quando houver necessidade real.
- Hoje temos **um**: `context7` (docs atuais das libs). Tools remotas usam o
  prefixo `<server>_<tool>` (ex.: `context7_query-docs`).
- Para **desligar sem apagar** a configuração: `"disabled": true` no server —
  o OpenCode não conecta nem descreve as tools.
- Para **negar uma tool específica** de um MCP, use a permissão com a ação
  `<server>_<tool>` no bloco `permissions` do `opencode.jsonc`.
- Prefira **skills** a MCPs quando a necessidade for só "um prompt reutilizável".

## Plugins do OpenCode (`\.opencode/plugins/`)

Plugins estendem o harness (hooks, transforms, tools). Ficam em `.opencode/plugins/`
e têm dependência em `.opencode/package.json` (`@opencode/plugin`, versão igual à
do CLI — hoje 2.0.32). `node_modules` e `logs/` são ignorados pelo git.

- **Hook x Transform** (a distinção que mais confunde):
  - **Hook** intercepta **operação viva**: `ctx.tool.hook("execute.before"/"execute.after")`,
    `ctx.session.hook("context"/"http.request"/"http.response")`.
  - **Transform** muda a **definição** exposta ao modelo (descrição/input de tool,
    agent…): `ctx.tool.transform((tools) => tools.update("nome", (t) => { ... }))`.
    Não altera a implementação.
- **Tool custom** é sempre registrada via plugin: `tools.add({ name, description, input, ... })`.
  Use prefixo do projeto para evitar colisão de nomes normalizados.
- **Hooks devem ser rápidos e tolerantes a erro** (um throw pode falhar a operação
  interceptada). Nunca derrube uma tool por falha de log.
- Plugins atuais:
  - `praxis.migrations` → tool `praxis_check_migrations` (migrações isoladas em SQLite).
  - `praxis.audit-log` → hooks que registram comandos de shell e edições em `logs/`.
  - `praxis.tool-hints` → transform que enriquece a descrição de `praxis_check_migrations`.

## Documentos-chave

| Tema | Documento |
|---|---|
| Visão geral | [docs/01-visao-geral.md](docs/01-visao-geral.md) |
| Mapeamento de funcionalidades | [docs/02-mapeamento-funcionalidades.md](docs/02-mapeamento-funcionalidades.md) |
| Arquitetura | [docs/03-arquitetura.md](docs/03-arquitetura.md) |
| Requisitos | [docs/05-requisitos.md](docs/05-requisitos.md) |
| Banco de dados | [docs/07-banco-de-dados.md](docs/07-banco-de-dados.md) |
| Controle de acesso | [docs/08-controle-de-acesso.md](docs/08-controle-de-acesso.md) |
| IA e custos | [docs/09-ia-e-custos.md](docs/09-ia-e-custos.md) |
| Stripe | [docs/10-pagamentos-stripe.md](docs/10-pagamentos-stripe.md) |
| Landing | [docs/11-landing-page.md](docs/11-landing-page.md) |
| Roadmap | [docs/12-roadmap-fases.md](docs/12-roadmap-fases.md) |
| Deploy (Kymus) | [docs/13-deploy-kymus.md](docs/13-deploy-kymus.md) |
| Segurança/LGPD | [docs/14-checklist-seguranca-lgpd.md](docs/14-checklist-seguranca-lgpd.md) |

## Não fazer

- Não commitar `.env`, `praxis.db` ou segredos.
- Não consultar a API do Stripe a cada request (usar `subscriptions` local).
- Não ativar plano pelo `success_url` (só webhook).
- Não rodar cron de lembretes dentro do processo web em produção.
- Não confiar em `user_id` vindo do cliente.
