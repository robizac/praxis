# 03 — Arquitetura

## 3.1 Estilo arquitetural

**Monólito modular em camadas**, extraível em serviços depois. Um único deploy
para o app web + API; o processamento assíncrono (lembretes) roda como
**worker/scheduled job** separado, compartilhando o mesmo código-base.

Princípios:

1. **Domínio no centro** — regras de negócio não dependem de Express, SQL ou Stripe.
2. **Dependências apontam para dentro** — HTTP/DB/integrações são adaptadores.
3. **Multi-tenant explícito** — toda consulta é escopada por `user_id`.
4. **Config validada no boot** — falha rápida se faltar env.
5. **Tudo observável** — logs estruturados, `/health`, `/ready`.

## 3.2 Estrutura de pastas alvo

```
praxis/
├─ src/
│  ├─ config/
│  │  ├─ env.js              # parse + validação de variáveis (zod/envalid)
│  │  └─ constants.js
│  ├─ domain/                # regras puras (sem I/O)
│  │  ├─ areas.js            # AREAS, normalizeArea (migra de domain.js)
│  │  ├─ limits.js           # shouldBlockNewAction, cotas por plano
│  │  ├─ plans.js            # catálogo de planos e entitlements
│  │  └─ errors.js           # AppError, NotFound, Forbidden, QuotaExceeded...
│  ├─ http/
│  │  ├─ app.js              # monta o Express (middlewares + rotas)
│  │  ├─ server.js           # bootstrap HTTP
│  │  ├─ middleware/
│  │  │  ├─ auth.js          # requireAuth, attachUser
│  │  │  ├─ entitlements.js  # requirePlan/requireQuota
│  │  │  ├─ rateLimit.js
│  │  │  ├─ validate.js      # validação de body/query
│  │  │  └─ errorHandler.js  # tratamento central de erros
│  │  └─ routes/
│  │     ├─ auth.routes.js
│  │     ├─ praxis.routes.js
│  │     ├─ history.routes.js
│  │     ├─ reviews.routes.js
│  │     ├─ reminders.routes.js
│  │     ├─ billing.routes.js
│  │     └─ users.routes.js   # chaves BYOK, preferências
│  ├─ services/              # casos de uso (orquestração)
│  │  ├─ ai/
│  │  │  ├─ aiService.js     # escolhe provider (gerenciado vs BYOK)
│  │  │  ├─ providers/openai.js
│  │  │  ├─ providers/ollama.js
│  │  │  ├─ providers/anthropic.js   # opcional
│  │  │  ├─ prompt.js        # buildPrompt + JSON schema
│  │  │  └─ parse.js         # parsePraxisJson
│  │  ├─ praxisService.js
│  │  ├─ historyService.js
│  │  ├─ reviewService.js
│  │  ├─ reminderService.js
│  │  ├─ usageService.js     # medição/cotas de IA
│  │  └─ billingService.js   # sincroniza assinatura -> entitlement
│  ├─ repositories/          # acesso a dados (SQL)
│  │  ├─ users.repo.js
│  │  ├─ sessions.repo.js
│  │  ├─ praxis.repo.js
│  │  ├─ reminders.repo.js
│  │  ├─ reviews.repo.js
│  │  ├─ usage.repo.js
│  │  └─ subscriptions.repo.js
│  ├─ integrations/
│  │  ├─ stripe/             # client, checkout, portal, webhooks
│  │  ├─ telegram.js
│  │  └─ crypto.js           # AES-256-GCM para chaves BYOK
│  ├─ jobs/
│  │  ├─ reminders.worker.js # processa lembretes vencidos
│  │  └─ scheduler.js
│  └─ db/
│     ├─ pool.js             # pg Pool
│     └─ migrations/         # 001_..., 002_...
├─ web/                      # front-end
│  ├─ landing/               # index.html + assets (estático)
│  └─ app/                   # SPA do app (evolução do index.html atual)
├─ test/                     # unit + integração
├─ scripts/                  # migrate, seed, stripe-setup
├─ Dockerfile
├─ .env.example
└─ package.json
```

> O `index.html` atual pode ser movido para `web/app/index.html` sem reescrita;
> a landing nasce em `web/landing/index.html`.

## 3.3 Camadas e fluxo de uma requisição

```
Cliente → Express (middleware: log, body, sessão, auth, rate limit, entitlements)
        → Rota (valida entrada)
        → Serviço (regra de negócio / orquestração)
        → Repositório (SQL) / Integração (IA, Stripe, Telegram)
        → Resposta JSON padronizada
```

Regra de ouro: **rota não fala SQL; serviço não fala `req`/`res`; domínio não faz I/O.**

## 3.4 Topologia de deploy

```
                    ┌──────────────────────────┐
   Navegador  ───▶  │  Web/API (Node Express)   │ ──▶ Postgres gerenciado
                    │  - landing estática /     │
                    │  - API /api/*             │ ──▶ Stripe API (checkout/portal)
                    │  - webhook /webhooks/stripe│
                    └──────────────────────────┘
                               ▲
                               │ mesma imagem, comando diferente
                    ┌──────────────────────────┐
                    │  Worker de lembretes      │ ──▶ Telegram / e-mail
                    │  (cron a cada minuto)     │
                    └──────────────────────────┘
```

- **Web/API**: escala horizontal. Sessão em cookie + store no Postgres (ou Redis futuro).
- **Worker**: 1 instância, comando `npm run worker`; evita depender do processo web.
- **Postgres**: fonte de verdade; migrações aplicadas no boot do web.
- **Stripe**: única fonte de verdade de cobrança; app reflete via webhooks.

## 3.5 Decisões de arquitetura (ADRs resumidos)

| ADR | Decisão                                | Motivo                                | Alternativas                      |
| --- | -------------------------------------- | ------------------------------------- | --------------------------------- |
| 001 | Postgres gerenciado em produção        | Concorrência, backup, multi-instância | Manter SQLite (limita)            |
| 002 | Monólito modular                       | Time pequeno, velocidade              | Microsserviços (overkill)         |
| 003 | Sessão em cookie httpOnly + Argon2     | Simples e seguro                      | JWT stateless (revogação difícil) |
| 004 | `user_id` em todas as tabelas          | Multi-tenancy por linha               | Schemas por usuário               |
| 005 | Worker separado para lembretes         | Independe do web/scale                | Cron in-process (atual)           |
| 006 | IA: gerenciado por cota + BYOK         | Controle de custo + poder usuário     | Só chave do dono (atual)          |
| 007 | Stripe Billing + entitlements internos | Fonte única de cobrança               | Controle manual de plano          |
| 008 | Landing estática em `/`, app em `/app` | SEO + simplicidade                    | Sites separados                   |

## 3.6 Requisitos de infraestrutura

- Node 20 LTS, Postgres 15+, HTTPS terminado no host (Kymus).
- Variáveis sensíveis via secret manager do host (não em arquivo).
- Migrações idempotentes e retrocompatíveis.
- Healthcheck `/health` (liveness) e `/ready` (checa DB + Stripe + IA).
