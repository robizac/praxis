# PRAXIS

Aplicativo web para transformar conhecimento em ação prática usando IA, com
histórico e lembretes.

## Comandos de validação

```bash
npm i          # instalar dependências (Node.js 20+)
npm test       # rodar a suíte de testes (node --test)
npm run migrate  # aplicar migrações (idempotente)
```

Com Postgres local (app + banco): `docker compose up --build`.

## Como rodar

```bash
cp .env.example .env   # configure as variáveis (ver abaixo)
npm run dev            # desenvolvimento (nodemon)
npm start              # produção
```

Abra [http://localhost:3000](http://localhost:3000) (ou a porta configurada).

## Documentação

A especificação completa vive em [`docs/`](docs/README.md): arquitetura,
requisitos, banco de dados, controle de acesso, IA e custos, Stripe, landing
page e o roadmap por fases. Convenções para agentes e contribuidores:
[`AGENTS.md`](AGENTS.md).

Variáveis de ambiente: tudo documentado em
[`.env.example`](.env.example) (IA gerenciada/BYOK, sessão, e-mail, Stripe,
Telegram, banco). Em resumo:

- `DATABASE_URL` vazio ⇒ SQLite local em dev; definido ⇒ Postgres.
- `SESSION_SECRET` (32+ bytes) é obrigatório em produção.
- IA: `AI_PROVIDER` (`ollama` em dev) + modo gerenciado (chaves `MANAGED_*`) ou
  BYOK (o usuário cadastra a chave dele em **Conta**).
- Lembretes: entrega por **usuário** via pareamento do Telegram
  (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`);
  `TELEGRAM_CHAT_ID` é só destino global de dev/legado (ver `.env.example`).

Ollama local: `ollama pull mistral && ollama serve`.

## Endpoints

Autenticação, aplicação (`/api/praxis`, `/api/history`, `/api/upcoming`,
`/api/weekly-reviews`), IA/conta (`/api/ai/*`), cobrança (`/api/billing/*` +
`/webhooks/stripe`) e health (`/health`, `/ready`) estão listados em detalhe nos
docs. Destaques:

- `POST /api/praxis` recebe `{ "input": "..." }` e retorna `acao`, `prazo`,
  `regraMinima`, `area`, `provider` e `source` (`managed`/`byok`).
- Rotas mutáveis exigem o header `X-CSRF-Token` igual ao cookie `praxis_csrf`.
- O plano só é ativado pelo **webhook** da Stripe, nunca pelo `success_url`.

## Segurança

Nenhuma chave de LLM vai para o frontend. Troca de provider e modo
(gerenciado/BYOK) acontece só no backend; chaves BYOK são cifradas
(AES-256-GCM). Contas usam **Argon2id**, sessão em cookie `httpOnly` + CSRF
double-submit e rate limit nas rotas de auth.

## Evolução planejada

Roadmap completo em [`docs/12-roadmap-fases.md`](docs/12-roadmap-fases.md).
Fases 1–7 concluídas (ver `AGENTS.md`); o PRAXIS evolui para um SaaS
multi-usuário com Postgres gerenciado, IA de custo controlado (cota + BYOK),
pagamento Stripe, landing page e deploy web + worker.
