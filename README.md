# PRAXIS

Aplicativo web para transformar conhecimento em ação prática usando IA, com histórico e lembretes.

> **Documentação de produto e engenharia**: veja [`docs/`](docs/README.md) para o
> mapeamento de funcionalidades, arquitetura, requisitos, design, banco de dados,
> controle de acesso, IA, Stripe, landing page e o roadmap por fases.
> Guia de convenções para agentes: [`AGENTS.md`](AGENTS.md).

## Requisitos

- Node.js 18+
- npm

## Instalação

```bash
npm i
```

## Configuração do `.env`

Crie um arquivo `.env` na raiz (você pode copiar de `.env.example`):

```bash
cp .env.example .env
```

Variáveis:

- `AI_PROVIDER`: provider gerenciado em dev: `ollama` (padrão), `openai`, `anthropic` ou `gemini` (em produção só remoto: `openai`/`anthropic`/`gemini`)
- `MANAGED_OPENAI_API_KEY` / `MANAGED_ANTHROPIC_API_KEY` / `MANAGED_GEMINI_API_KEY`: chaves da plataforma (modo gerenciado)
- `AI_DEFAULT_MODEL`: modelo econômico padrão do modo gerenciado
- `AI_MAX_TOKENS` / `AI_TIMEOUT_MS` / `AI_DAILY_BUDGET_USD`: guardrails de custo
- `AI_KEY_ENCRYPTION_SECRET`: chave mestra (32+ bytes) para cifrar as chaves BYOK (AES-256-GCM)
- `OLLAMA_BASE_URL`: URL do Ollama local (padrão `http://localhost:11434`)
- `OLLAMA_MODEL`: modelo no Ollama (padrão `mistral`)
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`: chaves diretas (dev/legado; no produto o usuário cadastra a dele em **Conta**)
- `OPENAI_MODEL`: modelo da OpenAI (padrão `gpt-4o-mini`)
- `TELEGRAM_BOT_TOKEN`: token do bot do Telegram (para lembretes via Telegram)
- `TELEGRAM_CHAT_ID`: chat_id que receberá os lembretes
- `SESSION_SECRET`: segredo das sessões/cookies (32+ bytes; obrigatório em produção)
- `DATABASE_URL`: conexão Postgres (vazio ⇒ SQLite local em dev)
- `EMAIL_PROVIDER` / `EMAIL_API_KEY` / `EMAIL_FROM`: e-mail transacional (verificação/reset; sem provider, os e-mails são só logados em dev)
- `PORT`: porta do servidor (ex: `3000`)

## Ollama local

O endpoint `POST /api/praxis` usa o Ollama local em `http://localhost:11434` com o modelo `mistral`.

Antes de iniciar o app, garanta que o Ollama esteja ativo e com o modelo baixado:

```bash
ollama pull mistral
ollama serve
```

## Como rodar

Modo desenvolvimento:

```bash
npm run dev
```

Modo normal:

```bash
npm start
```

Abra [http://localhost:3000](http://localhost:3000) (ou a porta configurada).

## Como usar

Na primeira visita, **crie uma conta** (nome, e-mail e senha) ou entre com uma conta
existente. A sessão fica em um cookie `httpOnly` e o app libera as 3 telas:

1. `Início`:
- Escreva o aprendizado
- Escolha a `Área da Vida`
- Clique em `Transformar em Ação`
- O app gera: ação, prazo e regra mínima

2. `Histórico`:
- Veja todas as ações em cards
- Filtre por área e status
- Busque por texto
- Ordene por mais recentes ou prazo mais próximo
- Conclua ou reabra ações

3. `Revisão Semanal`:
- Responda as 4 perguntas
- Salve a revisão
- Consulte as últimas revisões em formato colapsável

## Endpoints

Autenticação (Fase 2):

- `GET /api/auth/csrf` -> estabelece o cookie CSRF (`praxis_csrf`) para o SPA
- `POST /api/auth/register` -> `{ name, email, password }` cria conta e inicia sessão
- `POST /api/auth/login` -> `{ email, password }` inicia sessão
- `POST /api/auth/logout` -> revoga a sessão e limpa o cookie
- `GET /api/auth/me` -> `{ user, plan }` do usuário autenticado
- `POST /api/auth/verify-email` -> `{ token }` confirma o e-mail
- `POST /api/auth/forgot-password` -> `{ email }` envia link de redefinição
- `POST /api/auth/reset-password` -> `{ token, password }` define nova senha (revoga sessões)

> Rotas mutáveis exigem o header `X-CSRF-Token` igual ao cookie `praxis_csrf`.
> As rotas do app abaixo exigem sessão válida (senão `401`).

Aplicação:

- `POST /api/praxis` -> recebe `{ "input": "..." }` (ou `{ "texto": "..." }`) e retorna `acao`, `prazo`, `regraMinima`, `area`, `provider` e `source` (`managed`/`byok`)
- `POST /api/praxis` pode retornar `409` com `{ "error": "limite_pendentes", ... }` quando já houver 2 pendentes
- `POST /api/praxis` pode retornar `402` (`quota_exceeded`) ao estourar a cota de IA do plano
- `GET /api/meta` -> retorna estado simples da home (`pendentes` e `pode_gerar`)
- `GET /api/history` -> lista os últimos 100 itens
- `PATCH /api/history/:id` -> atualiza `status`, `tags` e/ou `area`
- `DELETE /api/history/:id` -> remove item do histórico
- `GET /api/upcoming?window=24h|7d` -> lista próximos prazos
- `GET /api/weekly-reviews` -> lista revisões semanais salvas
- `POST /api/weekly-reviews` -> salva revisão semanal com as 4 respostas
- `POST /api/complete/:id` -> compatibilidade (marca como feito)
- `POST /api/remind/:id` -> cria lembrete com `{ "remind_at_iso": "...", "channel": "telegram|browser" }`

IA / conta (Fase 4):

- `GET /api/ai/usage` -> cota do mês (`used`, `limit`, `remaining`), `byokActive` e custo do dia
- `GET /api/ai/credentials` -> credencial BYOK mascarada (ou `null`)
- `PUT /api/ai/credentials` -> `{ provider, apiKey, model?, baseUrl? }` (valida com chamada de teste)
- `DELETE /api/ai/credentials` -> remove a chave e volta ao modo gerenciado

Cobrança / planos (Fase 5):

- `GET /api/billing/plans` -> catálogo de planos e preços (com `priceId` quando configurado)
- `GET /api/billing/subscription` -> plano efetivo + status da assinatura
- `POST /api/billing/checkout` -> `{ "priceId": "price_..." }` → cria Checkout Session e devolve `url`
- `POST /api/billing/portal` -> cria sessão do Billing Portal e devolve `url`
- `POST /webhooks/stripe` -> webhook da Stripe (corpo bruto + assinatura; idempotente)

> O plano só é ativado pelo **webhook** (nunca pelo `success_url`). Para criar os
> preços de teste: `npm run stripe:setup` (com `STRIPE_SECRET_KEY`).

## Lembretes

### Telegram

O scheduler roda a cada minuto e envia lembretes pendentes via bot do Telegram.

Passo a passo para criar bot e obter `chat_id`:

1. No Telegram, abra o `@BotFather`.
2. Use `/newbot`, defina nome e username do bot.
3. O BotFather retorna o token (`TELEGRAM_BOT_TOKEN`).
4. Inicie conversa com seu bot e envie qualquer mensagem para ele.
5. Acesse no navegador (substitua `TOKEN`):

```text
https://api.telegram.org/botTOKEN/getUpdates
```

6. No JSON de resposta, pegue `message.chat.id` e use como `TELEGRAM_CHAT_ID`.

### Navegador (opcional)

Ao criar lembrete com canal `browser`, o frontend usa Notification API para mostrar notificações quando a página está aberta e com permissão concedida.

## Segurança

Nenhuma chave de API de LLM é enviada para o frontend. A troca entre providers
(Ollama/OpenAI/Anthropic/Gemini) e entre modo gerenciado/BYOK ocorre somente no
backend. Chaves BYOK são cifradas (AES-256-GCM) e nunca retornam ao cliente
(apenas `key_last4`).

Contas usam **Argon2id** (fallback scrypt), sessão em cookie `httpOnly` + CSRF
double-submit e rate limit nas rotas de auth. Defina `SESSION_SECRET` (32+ bytes) em
produção. Eventos sensíveis (`auth.*`) são registrados em `audit_log`.

## Arquitetura

Monólito modular em camadas (`http → services → repositories/domain`), com o
código em `src/`:

```
src/
  config/        env validada
  domain/        regras puras (áreas, limite, status, datas, erros)
  db/            adaptadores (Postgres | SQLite) + migrações
  repositories/  acesso a dados (sempre escopado por user_id)
  services/      casos de uso + IA (gerenciado/BYOK) + auth
  http/          app, server, middlewares, rotas
  integrations/  Telegram, e-mail, crypto (AES-256-GCM)
  jobs/          agendador de lembretes
web/app/         SPA (auth + 4 telas: início, histórico, revisão, conta)
```

- Banco: **SQLite** em dev; **Postgres** quando `DATABASE_URL` está definida.
- `npm run migrate` aplica migrações; `/health` e `/ready` para monitoramento.
- Detalhes e diagrama em [`docs/03-arquitetura.md`](docs/03-arquitetura.md).

### Comandos

```bash
npm i               # dependências
npm run dev         # desenvolvimento (nodemon)
npm start           # produção
npm run migrate     # migrações de banco
npm run migrate:legacy  # associa dados legados (user_id NULL) a um dono
npm test            # testes (node --test)
```

Com Postgres local (app + banco): `docker compose up --build`.

## Evolução planejada

O roadmap completo está em [`docs/12-roadmap-fases.md`](docs/12-roadmap-fases.md).
Em resumo, o PRAXIS evolui para um SaaS multi-usuário com:

- **Controle de acesso** ✅ — cadastro/login, sessões, RBAC e entitlements por plano ([docs/08](docs/08-controle-de-acesso.md)).
- **Banco de dados** — Postgres gerenciado, migrações e multi-tenancy ([docs/07](docs/07-banco-de-dados.md)).
- **IA com custo controlado** — modo gerenciado com cota + **BYOK** (chave do usuário), custo < 2% da assinatura ([docs/09](docs/09-ia-e-custos.md)).
- **Pagamento integrado** — Stripe Checkout, Portal e webhooks ([docs/10](docs/10-pagamentos-stripe.md)).
- **Landing page** — aquisição e conversão ([docs/11](docs/11-landing-page.md)).
- **Deploy** — web + worker no Kymus ([docs/13](docs/13-deploy-kymus.md)).

> As variáveis de ambiente planejadas (banco, sessão, e-mail, Stripe, BYOK) estão
> documentadas em [`.env.example`](.env.example).
