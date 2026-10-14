# AGENTS.md — Guia para agentes e contribuidores

Este arquivo descreve **arquitetura, padrões e convenções** do PRAXIS para quem
for alterar o código (humanos ou agentes de IA). Leia antes de implementar.
Detalhes em [`docs/`](docs/README.md).

## Estado atual

**Fases 1 a 7 concluídas** — o código vive em `src/`
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
- Arquivos legados na raiz (`server.js`) viraram shims de compatibilidade.

## Arquitetura

Monólito modular em camadas: `http → services → repositories/domain`.
Estrutura atual:

```
src/
  config/        env validada, constantes
  domain/        regras puras (areas, limits, plans, errors)
  http/          app, server, middleware, routes
  services/      casos de uso (ai, praxis, history, review, reminder, usage, billing, telegram, settings)
  repositories/  SQL (sempre escopado por user_id)
  integrations/  stripe, telegram, crypto
  jobs/          worker de lembretes
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

Ver [`docs/04-padroes-e-convencoes.md`](docs/04-padroes-e-convencoes.md).

## Comandos

```bash
npm i                  # instalar
npm run dev            # desenvolvimento (nodemon)
npm start              # produção
npm test               # node --test
npm run migrate        # aplica migrações (idempotente)
npm run stripe:setup   # cria produtos/preços de teste na Stripe e imprime os IDs
npm run worker         # worker de lembretes (telegram/e-mail), fora do processo web
```

> Em produção, **não** rode o cron de lembretes dentro do processo web: use
> `npm run worker` como processo separado.

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

## Não fazer

- Não commitar `.env`, `praxis.db` ou segredos.
- Não consultar a API do Stripe a cada request (usar `subscriptions` local).
- Não ativar plano pelo `success_url` (só webhook).
- Não rodar cron de lembretes dentro do processo web em produção.
- Não confiar em `user_id` vindo do cliente.
