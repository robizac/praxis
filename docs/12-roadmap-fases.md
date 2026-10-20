# 12 — Roadmap por fases

Plano de execução para aprovação. Cada fase é um incremento entregável e testável.
Estimativas em **semanas de 1 dev** (ajustar conforme time). Dependências são explícitas.

> **Status atual**: Fase 0 concluída (decisões aprovadas). Fase 1 implementada ✅.
> **Fase 2 implementada** ✅ (contas, sessões, CSRF, telas de auth).
> **Fase 3 implementada** ✅ (multi-tenancy: `user_id` em itens/lembretes, revisões no banco, script de migração).
> **Fase 4 implementada** ✅ (IA: BYOK + cotas + medição de custo + cache).
> **Fase 5 implementada** ✅ (Stripe: checkout, portal, webhook idempotente, entitlements por plano).
> **Fase 6 implementada** ✅ (landing page com SEO + roteamento `/`/`/app`).
> **Fase 7 implementada** ✅ (worker `npm run worker`; e-mail e Telegram por usuário; lembrete default configurável).
> **Fase 8 implementada** ✅ (CSP/headers, LGPD, métricas e alertas, testes/cobertura, backups).
> Próxima: Fase 9 (lançamento). Pendência: confirmar preços finais do Pro.

```
F0 Descoberta ─▶ F1 Fundação ─▶ F2 Acesso ─▶ F3 Multi-tenant ─▶ F4 IA/Custos
                                                  │                 │
                                                  ▼                 ▼
                                              F5 Stripe ◀─────── F6 Landing
                                                  │
                                                  ▼
                                         F7 Lembretes ─▶ F8 Hardening ─▶ F9 Lançamento
```

## Fase 0 — Descoberta e aprovação (2–3 dias)
**Objetivo**: fechar decisões antes de codar.

Tarefas:
- [ ] Aprovar docs 03–12 e responder às decisões abertas ([docs/README](README.md)).
- [ ] Definir preços/limites finais (Free/Pro/Pro Anual).
- [ ] Confirmar Postgres no Kymus e fluxo de deploy.
- [ ] Confirmar provedor de e-mail transacional (ex.: Resend/SES).
- [ ] Definir domínio e subdomínios.

Entregável: decisões registradas + backlog priorizado.
Aceite: todos os itens de "decisões a aprovar" resolvidos.

## Fase 1 — Fundação técnica (1–1,5 semana) ✅ concluída
**Objetivo**: base para evoluir sem retrabalho.

Tarefas:
- [x] Reestruturar em `src/` (config, domain, http, services, repositories, integrations, jobs).
- [x] `config/env.js` com validação (faltando env ⇒ aviso/falha no boot).
- [x] Migrar `domain.js` → `src/domain/`; manter testes verdes.
- [x] Camada de DB (`pg` + pool para Postgres; SQLite em dev) e runner de migrações + `schema_migrations`.
- [x] Middlewares base: logger estruturado (pino), `errorHandler`, `requestId`, `helmet`, CORS, rate limit.
- [x] `/health` e `/ready`.
- [x] `Dockerfile` + `docker-compose` (app + postgres) para dev.
- [x] CI: testes (SQLite) + migração em Postgres limpo.
- [x] Mover SPA para `web/app/index.html`; servir estático.

Aceite: app roda com SQLite (dev) e com Postgres (`DATABASE_URL`); testes passando;
mesma funcionalidade de hoje (sem auth ainda) porém sobre a nova base.
Dependências: F0.

> Implementação: `src/config/env.js`, `src/domain/*`, `src/db/*` (adaptadores + migrações),
> `src/repositories/*`, `src/services/*`, `src/http/*`, `src/jobs/reminders.job.js`,
> `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `scripts/migrate.js`.
> 8 testes passando (domínio, parser de IA, repositórios).

## Fase 2 — Controle de acesso (1,5–2 semanas) ✅ concluída
**Objetivo**: contas e sessões.

Tarefas:
- [x] Migração: `users`, `sessions`, `password_resets`, `email_verifications`, `audit_log`.
- [x] Cadastro/login/logout/me; Argon2id (fallback scrypt); verificação de e-mail; reset de senha.
- [x] Sessão em cookie httpOnly + CSRF (double-submit) + rotação no login.
- [x] Middlewares `attachUser`, `requireAuth`, `requireRole`.
- [x] Rate limit de auth + `audit_log` de eventos sensíveis.
- [x] Telas de cadastro/login/recuperação e guarda de rota no front.
- [ ] (Should) Google OAuth — adiado.
- [x] Testes: auth, sessão, CSRF, reset/verificação.

Aceite: só usuário autenticado acessa o app; fluxos de cadastro/login/reset
completos; sessão revogável.
Dependências: F1.

> **Implementação**: `src/services/authService.js`, `src/services/auditService.js`,
> `src/repositories/{users,sessions,authTokens,audit}.repo.js`, `src/lib/{password,tokens}.js`,
> `src/http/middleware/{auth,cookies}.js`, `src/http/routes/auth.routes.js`,
> `src/integrations/email.js`, `src/config/constants.js`,
> `src/db/migrations/{sqlite,postgres}/002_auth.sql`.
> Endpoints: `GET /api/auth/csrf`, `POST /api/auth/{register,login,logout,verify-email,forgot-password,reset-password}`,
> `GET /api/auth/me`. Front: telas de login/cadastro/recuperação/reset em `web/app/index.html`.
>
> **Notas de estado intermediário**: as rotas do app já exigem login, mas os dados
> (itens, revisões) ainda são globais — o escopo por usuário (`user_id`) chega na Fase 3.
> Verificação de e-mail não bloqueia o uso (conta marcada como não verificada);
> o enforcement (se desejado) entra junto com entitlements. Sem provider de e-mail
> configurado, os tokens de verificação/reset são registrados no log e devolvidos na
> resposta apenas em ambiente não-produção (campo `devVerificationToken`/`devToken`).

## Fase 3 — Multi-tenancy e migração de dados (1 semana) ✅ concluída
**Objetivo**: cada usuário vê só os próprios dados.

Tarefas:
- [x] Adicionar `user_id` em `praxis_items`, `reminders`; criar `weekly_reviews` no banco.
- [x] Repositórios passam a exigir `userId`; escopar todas as queries.
- [x] Migrar `reviews.repo.js` de JSON para banco (removido acoplamento ao store legado).
- [x] Script `scripts/migrate-legacy.js`: migra linhas com `user_id NULL` para um usuário dono e importa `weekly_reviews.json` (SQLite/Postgres via pool).
- [x] Testes de isolamento entre usuários (A não vê B).
- [x] Ajustar `/api/*` para derivar `userId` da sessão.

Aceite: dois usuários não enxergam dados um do outro; dados legados migrados.
Dependências: F2.

> **Implementação**: `src/db/migrations/{sqlite,postgres}/003_multi_tenant.sql`
> (`user_id` em `praxis_items`/`reminders`, tabela `weekly_reviews`, índices por usuário),
> `src/repositories/{praxis,reminders,reviews}.repo.js` (todas as queries escopadas por
> `user_id`, sempre primeiro argumento), `src/services/{praxis,reminder,review}Service.js`
> e rotas `/api/*` derivando `userId` de `req.user.id`. `scripts/migrate-legacy.js`
> associa órfãos (`user_id NULL`) a um dono e importa o JSON legado.
>
> **Notas**: `user_id` é anulável por compatibilidade (bases legadas); o app sempre grava
> o dono. Tornar `NOT NULL` fica para quando todos os ambientes estiverem migrados.
> O worker de lembretes (`reminders.job.js`) roda sem escopo (entrega de sistema);
> a API usa `dueByChannel(channel, req.user.id)`.
> Testes: `test/isolation.test.js` (itens, revisões e lembretes de A invisíveis para B).

## Fase 4 — IA: BYOK + cotas + custo (1–1,5 semana) ✅ concluída
**Objetivo**: custo controlado e chave do usuário.

Tarefas:
- [x] `aiService` com roteamento gerenciado vs BYOK.
- [x] Adaptadores `openai`, `anthropic`, `gemini`, `ollama` (pasta `src/services/ai/providers/`).
- [x] Tabelas `ai_credentials` (cifra AES-256-GCM) e `ai_usage`.
- [x] `usageService`: cota por plano/ciclo; `requireEntitlement('aiGenerations')` (middleware).
- [x] Guardrails: `max_tokens`, cache por hash, timeout, fallback seguro, budget diário.
- [x] UI de conta: conectar/remover chave (mascarada), indicador de cota.
- [x] Testes: cota, BYOK, fallback, cache.

Aceite: BYOK não consome cota; gerenciado bloqueia ao estourar; custo registrado
por geração; custo/assinante < 15% da receita.
Dependências: F3.

> **Implementação**: `src/db/migrations/{sqlite,postgres}/004_ai.sql`
> (`ai_credentials`, `ai_usage`), `src/integrations/crypto.js` (AES-256-GCM),
> `src/repositories/{aiCredentials,aiUsage}.repo.js`, `src/services/usageService.js`
> (cota mensal, orçamento diário, entitlement), `src/services/ai/aiService.js`
> (roteamento gerenciado/BYOK, cache, medição), `src/services/ai/providers/`
> (`openai`, `anthropic`, `gemini`, `ollama`), `src/services/ai/{cache,pricing}.js`,
> `src/http/middleware/entitlements.js`, `src/http/routes/ai.routes.js`.
> Endpoints: `GET /api/ai/usage`, `GET|PUT|DELETE /api/ai/credentials`.
> Front: tela **Conta** (`#/account`) com cota + gestão de chave.
>
> **Notas**: BYOK ativo ignora a cota gerenciada (docs/09). O modo gerenciado
> respeita a cota do plano e um teto diário global (`AI_DAILY_BUDGET_USD`, HTTP 503).
> Chaves BYOK são cifradas e devolvidas apenas mascaradas (`key_last4`); a validação
> de uma chave usa uma chamada de teste barata (ignorada quando `NODE_ENV=test`).
> O cache é em memória por processo (30 dias) — cache distribuído fica para escala
> multi-instância. `cost_usd` é estimativa (docs/09), não cobrança.
> Testes: `test/crypto.test.js`, `test/usage.test.js`, `test/ai-routing.test.js`.

## Fase 5 — Stripe e entitlements ✅ (1,5–2 semanas)
**Objetivo**: cobrar e liberar recursos por plano.

Tarefas:
- [x] Criar produtos/preços (`scripts/stripe-setup.js`); catálogo `GET /api/billing/plans`.
- [x] `subscriptions` + `stripe_events`; `billingService` de sincronização.
- [x] `POST /api/billing/checkout` e `POST /api/billing/portal`.
- [x] Webhook `/webhooks/stripe` (raw body, verificação de assinatura, idempotência).
- [x] Entitlements por plano aplicados no app (cota, lembretes).
- [x] Trial de 7 dias; fluxo de cancelamento (mantém até fim do período).
- [x] E-mails de cobrança (sucesso, falha, renovação).
- [x] UI de conta/planos + paywall de cota.
- [x] Testes de cobrança em modo teste (Stripe CLI).

Aceite: assinar/upgrade/cancelar funcionam; webhook sincroniza; ao cancelar,
acesso expira no fim do período; pagamento falho rebaixa.
Dependências: F4.

> **Implementação**: `src/db/migrations/{sqlite,postgres}/005_billing.sql`
> (`subscriptions`, `stripe_events`), `src/integrations/stripe.js` (SDK oficial +
> verificação de assinatura), `src/repositories/{subscriptions,stripeEvents}.repo.js`,
> `src/services/billingService.js`, `src/http/routes/{billing,webhooks}.routes.js`,
> `scripts/stripe-setup.js` (`npm run stripe:setup`).
>
> **Notas**: o plano efetivo é resolvido por `billingService.resolvePlanId` e
> injetado em `req.user.plan` por `attachUser`; `GET /api/auth/me` devolve
> `plan`/`entitlements`. O webhook é montado fora de `/api` (sem CSRF/sessão) e usa
> o corpo bruto (`express.json({ verify })`); assinatura inválida → 400, segredo
> ausente → 503. A ativação do plano **só** ocorre via webhook (nunca pelo
> `success_url`). Sem `STRIPE_SECRET_KEY`, checkout/portal respondem 503 e os
> botões de compra ficam desabilitados. Testes: `test/billing.test.js`.
> **Aberto**: confirmar preços do Pro (docs/09) e preços de teste (`price_...`).

## Fase 6 — Landing page ✅ (1 semana)
**Objetivo**: aquisição + conversão.

Tarefas:
- [x] `web/landing/index.html` com as 12 seções ([11](11-landing-page.md)).
- [x] CTAs integrados ao cadastro/checkout.
- [x] SEO (meta, OG, sitemap, robots, JSON-LD), performance e acessibilidade.
- [x] Analytics de funil (cta_click, signup_start, checkout_start) — preparado (links estruturados).

Aceite: Lighthouse >= 90 (perf/SEO/a11y); CTA leva ao cadastro/checkout;
planos refletem a Stripe.
Dependências: F5 (para preços reais).

> **Implementação**: `web/landing/index.html`, `robots.txt`, `sitemap.xml`,
> páginas estáticas (`termos.html`, `privacidade.html`, `contato.html`). Roteamento
> em `src/http/app.js` serve landing em `/` e SPA em `/app`.

## Fase 7 — Lembretes confiáveis (1 semana)
**Objetivo**: notificações que não dependem do processo web.

Tarefas:
- [x] Worker `jobs/reminders.worker.js` (comando `npm run worker`).
- [x] Lembrete por **e-mail** (provider transacional) além de Telegram/browser.
- [x] Pareamento de Telegram **por usuário** (código), não global por env.
- [x] Retentativas, `attempts`, `last_error`, status `sent/failed`.
- [x] Lembrete default ao criar ação (opcional, configurável pelo usuário).

Aceite: lembretes disparam no horário, com retentativa e log; funciona com o
web escalando horizontalmente.
Dependências: F3.

> **Implementação**: `src/jobs/reminders.worker.js` executa `processDueReminders` em
> loop (`npm run worker`); `reminders.job.js` continua sendo usado pelo cron
> no processo web. O worker entrega `telegram` e `email` (o canal `browser` é
> consumido pela própria SPA via polling). Cada envio falho incrementa
> `reminders.attempts` e grava `last_error` (teto de 5 tentativas, ver
> `MAX_ATTEMPTS` em `reminders.repo.js`); canais indisponíveis (sem provider/token)
> são ignorados sem contar tentativa. `email.isConfigured()` evita retry infinito
> quando não há provider configurado.
>
> **Telegram por usuário**: migração `007_telegram_link_codes.sql`
> (`telegram_chats` + `telegram_link_codes`). Fluxo: o app gera um código
> (`POST /api/telegram/link-code`, 6 dígitos, TTL 15 min, uso único), o usuário
> envia `/start <código>` (ou `/vincular <código>`) ao bot e o webhook
> `POST /webhooks/telegram` associa o `chat_id` ao usuário. `GET /api/telegram`
> retorna o status; `DELETE /api/telegram/link` desvincula. Sem
> `TELEGRAM_CHAT_ID` global e sem vínculo, o envio é ignorado.
>
> **Lembrete default**: migração `008_user_reminder_prefs.sql` adiciona
> `reminder_default_enabled`, `reminder_default_channel` e
> `reminder_default_lead_minutes` a `users`. Preferências em `GET/PUT /api/settings`
> (`reminderDefault`), editáveis na tela Conta. Ao gerar uma ação,
> `praxisService.generate` chama `reminderService.createDefaultForItem`, que agenda
> o lembrete em `prazo − leadMinutes` no canal escolhido, sem nunca lançar por
> cota/prazo (apenas ignora e registra um aviso).


## Fase 8 — Hardening, observabilidade e LGPD (1 semana) ✅
**Objetivo**: pronto para produção.

Tarefas:
- [x] CSP com JS/CSS externos (remover inline do HTML), headers completos.
- [x] Exportação e exclusão de dados do usuário (LGPD); termos/privacidade.
- [x] Métricas de negócio + alertas (webhook, worker, 5xx, custo IA).
- [x] Cobertura de testes nos alvos; revisão de segurança (OWASP).
- [x] Backups e teste de restauração.

Aceite: checklist de segurança e LGPD completo; alertas ativos.
Dependências: F5, F6, F7.

> **Implementação**: `src/http/middleware/security.js` (CSP sem `unsafe-inline`,
> `Permissions-Policy`, HSTS em produção), HTML/CSS/JS 100% externos
> (`web/app/{index.html,styles.css,app.js}` e `web/landing/*`), rotas
> `/termos`, `/privacidade` e `/contato`.
> **LGPD**: `GET /api/account/export` (inclui `auditLog`), `DELETE /api/account`
> (hard delete + anonimização do audit + evento `account.deleted` sem PII) e
> páginas legais com direitos, base legal e retenção.
> **Observabilidade**: `src/lib/metrics.js` + `/metrics` (Prometheus, opcional
> `METRICS_TOKEN`), `src/services/alertService.js` (log estruturado + e-mail,
> cooldown), `src/jobs/alerts.job.js` (5xx e custo de IA a cada 5 min), alertas
> de webhook Stripe/Telegram e de falha do worker de lembretes.
> **Testes**: `test/{health,security,metrics,alerts,backup}.test.js`,
> `npm run test:coverage` (Node test runner, thresholds 75/65/75).
> **Backups**: `scripts/backup.js` (Postgres `pg_dump` / SQLite `VACUUM INTO`,
> rotação) e `scripts/backup-restore.js` (valida integridade/schema).
> Checklist completo em [14](14-checklist-seguranca-lgpd.md).

## Fase 9 — Lançamento no Kymus (2–3 dias)
**Objetivo**: publicar em `dash.kymus.app/hosting`.

Tarefas:
- [ ] Provisionar Postgres; configurar secrets.
- [ ] Deploy web + worker; migrações no boot.
- [ ] Configurar webhook Stripe para a URL de produção.
- [ ] Domínio, TLS, `/health` e `/ready` no monitor.
- [ ] Smoke tests do funil (landing → cadastro → geração → assinatura).
- [ ] Pós-lançamento: monitorar custo de IA, erros e conversão.

Aceite: funil completo em produção; monitoramento verde.
Dependências: F8.

## Resumo e sequência

| Fase | Entrega | Est. | Depende |
|---|---|---|---|
| F0 | Decisões | 2–3 d | — |
| F1 | Fundação + DB + CI ✅ | 1–1,5 sem | F0 |
| F2 | Contas e sessões ✅ | 1,5–2 sem | F1 |
| F3 | Multi-tenant + migração | 1 sem | F2 |
| F4 | BYOK + cotas + custo | 1–1,5 sem | F3 |
| F5 | Stripe + entitlements | 1,5–2 sem | F4 |
| F6 | Landing page | 1 sem | F5 |
| F7 | Lembretes confiáveis | 1 sem | F3 |
| F8 | Hardening + LGPD ✅ | 1 sem | F5,F6,F7 |
| F9 | Lançamento | 2–3 d | F8 |

**Total estimado**: ~10–12 semanas de 1 dev (F6 e F7 podem ser paralelas com 2 pessoas).

## Quick wins (podem ir antes, se quiser valor já)
- PWA (instalável) e lembrete default por e-mail.
- Dashboard/resumo (pendentes, feitas na semana, streak).
- Exportar histórico em CSV/Markdown.

## Riscos e mitigação

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Preço de API sobe | Média | Médio | BYOK + monitorar custo + trocar modelo |
| Migração de dados corrompe | Baixa | Alto | Script idempotente + backup + dry-run |
| Worker não roda no host | Média | Alto | Confirmar suporte a worker/cron no Kymus (F0) |
| Escopo de auth cresce | Média | Médio | Google OAuth é "Should"; senha primeiro |
| Webhook mal configurado | Média | Alto | Testes Stripe CLI + idempotência + alertas |
| Baixa conversão | Média | Alto | Landing + trial + iteração de copy |
