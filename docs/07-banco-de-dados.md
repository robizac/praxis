# 07 — Banco de dados

## 7.1 Decisão

- **Produção**: PostgreSQL gerenciado (o host Kymus provê Postgres; confirmar na
  aprovação). Escala horizontal, backup, transações reais.
- **Desenvolvimento/testes**: Postgres local via Docker, ou SQLite mantido como
  adaptador de desenvolvimento. Recomendação: usar Postgres nos dois para evitar
  divergência de dialeto.

Conexão por `DATABASE_URL`; pool via `pg`. Migrações numeradas em
`src/db/migrations/`, aplicadas no boot e registradas em `schema_migrations`.

## 7.2 Multi-tenancy

Estratégia **por linha** (`user_id` em toda tabela de dados do usuário).
- Toda consulta de repositório recebe `userId` e filtra por ele.
- Índices compostos iniciam por `user_id`.
- Nunca aceitar `user_id` do cliente; sempre da sessão autenticada.
- (Opcional futuro) Row Level Security no Postgres como defesa em profundidade.

## 7.3 Modelo de dados

```
users 1─n sessions
users 1─n praxis_items 1─n reminders
users 1─n weekly_reviews
users 1─n ai_usage
users 1─n ai_credentials (BYOK)
users 1─1 subscriptions (via stripe_customer_id)
users 1─n audit_log
```

### users
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| email | citext UNIQUE | normalizado minúsculo |
| password_hash | text NULL | nulo se OAuth-only |
| name | text | |
| role | text | `user` \| `admin` (default `user`) |
| email_verified_at | timestamptz NULL | |
| timezone | text | default `America/Sao_Paulo` |
| status | text | `active` \| `disabled` \| `deleted` |
| reminder_default_enabled | int | 0/1 (Fase 7) |
| reminder_default_channel | text NULL | `telegram` \| `browser` \| `email` |
| reminder_default_lead_minutes | int | default 10 |
| created_at / updated_at | timestamptz | |

### sessions
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | session id (cookie) |
| user_id | uuid FK | ON DELETE CASCADE |
| token_hash | text | hash do token de sessão |
| user_agent / ip | text | auditoria |
| expires_at | timestamptz | |
| revoked_at | timestamptz NULL | logout |
| created_at | timestamptz | |

### password_resets / email_verifications
`id, user_id, token_hash, expires_at, used_at, created_at`.

### praxis_items (evolução da tabela atual)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | index |
| texto | text | aprendizado de origem |
| acao_pratica | text | |
| prazo_iso | timestamptz | |
| prazo_humano | text | cache de exibição |
| regra_minima | text | |
| area | text | uma das `AREAS` |
| status | text | `pendente` \| `feito` |
| tags | jsonb | default `[]` |
| provider | text | provider de IA usado |
| created_at / updated_at | timestamptz | |

Índices: `(user_id, status)`, `(user_id, created_at desc)`, `(user_id, prazo_iso)`.

### reminders
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| praxis_id | uuid FK | ON DELETE CASCADE |
| remind_at_iso | timestamptz | |
| channel | text | `email` \| `telegram` \| `browser` |
| status | text | `pending` \| `sent` \| `failed` |
| attempts | int | default 0 |
| sent_at | timestamptz NULL | |
| last_error | text NULL | |
| created_at | timestamptz | |

Índice: `(status, remind_at_iso)`.

### telegram_chats (Fase 7)
| Campo | Tipo | Notas |
|---|---|---|
| id | text PK | UUID gerado na aplicação |
| user_id | text FK | UNIQUE, ON DELETE CASCADE |
| chat_id | text | id do chat do Telegram |
| username | text NULL | `@usuario` no momento do vínculo |
| linked_at / updated_at | text | ISO-8601 |

Índice: `(user_id)`.

### telegram_link_codes (Fase 7)
| Campo | Tipo | Notas |
|---|---|---|
| code | text PK | 6 dígitos, uso único |
| user_id | text FK | ON DELETE CASCADE |
| expires_at | text | TTL de 15 min |
| used_at | text NULL | preenchido ao vincular |
| created_at | text | ISO-8601 |

Índice: `(user_id)`.

### weekly_reviews (sai do JSON para o banco)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| respostas | jsonb | `{executei,trouxe_paz,gerou_peso,deve_sair}` |
| insights | text | opcional |
| created_at | timestamptz | |

### ai_credentials (BYOK)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| provider | text | `openai` \| `anthropic` \| `gemini` \| `ollama` |
| base_url | text NULL | para ollama/self-host |
| model | text NULL | override de modelo |
| key_cipher | bytea | AES-256-GCM |
| key_last4 | text | exibição mascarada |
| created_at / updated_at | timestamptz | |

Unique: `(user_id, provider)`.

### ai_usage
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| source | text | `managed` \| `byok` |
| provider | text | |
| model | text | |
| input_tokens / output_tokens | int | |
| cost_usd | numeric(10,6) | estimado |
| created_at | timestamptz | |

Índice: `(user_id, created_at)` — base para cotas e relatórios.

### subscriptions
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK UNIQUE | uma assinatura por usuário |
| stripe_customer_id | text UNIQUE NULL | |
| stripe_subscription_id | text UNIQUE NULL | |
| price_id | text NULL | Price da Stripe (mapeia para o plano) |
| plan | text | `free` \| `pro` \| `pro_annual` |
| status | text | `none` `active` `trialing` `past_due` `canceled` `incomplete` `unpaid` |
| current_period_end | timestamptz NULL | |
| cancel_at_period_end | boolean | |
| trial_end | timestamptz NULL | fim do trial |
| created_at / updated_at | timestamptz | |

> **Implementação (Fase 5)**: `src/db/migrations/{sqlite,postgres}/005_billing.sql`.
> Acesso ao plano pago (`effectivePlanId`) só com status `active`/`trialing`.

### stripe_events (idempotência de webhook)
`id text PK (= event.id), type, payload, processed_at, created_at`.
Inserido antes de processar; `processed_at` marca conclusão (retry seguro).

### audit_log
`id, user_id NULL, action, entity, entity_id, metadata jsonb, ip, created_at`.

### schema_migrations
`version text PK, applied_at timestamptz`.

## 7.4 DDL essencial (Postgres)

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  password_hash text,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  email_verified_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE praxis_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  texto text NOT NULL,
  acao_pratica text NOT NULL,
  prazo_iso timestamptz NOT NULL,
  prazo_humano text NOT NULL,
  regra_minima text NOT NULL,
  area text NOT NULL DEFAULT 'Energia & Ritmo',
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','feito')),
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX praxis_items_user_status_idx ON praxis_items (user_id, status);
CREATE INDEX praxis_items_user_created_idx ON praxis_items (user_id, created_at DESC);

CREATE TABLE weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  respostas jsonb NOT NULL,
  insights text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

> **Nota de implementação (Fase 2)**: a migração `002_auth.sql` cria
> `users`, `sessions`, `password_resets`, `email_verifications` e `audit_log`
> usando `TEXT` para ids e timestamps (ISO-8601 gerado pela aplicação), para que o
> mesmo DDL valha em SQLite e Postgres. Os tipos `uuid`/`citext`/`timestamptz`
> acima permanecem como alvo para as tabelas de domínio (Fase 3+), quando um
> adaptador específico de Postgres fizer sentido. Tokens de sessão/reset/verificação
> são gravados apenas como `token_hash` (SHA-256); o valor em claro nunca é persistido.

> **Nota de implementação (Fase 3)**: a migração `003_multi_tenant.sql` adiciona
> `user_id TEXT REFERENCES users(id) ON DELETE CASCADE` (anulável) em `praxis_items`
> e `reminders`, cria a tabela `weekly_reviews` (`user_id` `NOT NULL`, 4 respostas +
> `insights`) e os índices `(user_id, created_at desc)`, `(user_id, status)` e
> `(user_id, sent_at)`. `user_id` fica anulável apenas para não quebrar bases legadas;
> o app sempre grava o dono e todas as queries são escopadas por `user_id`. O script
> `scripts/migrate-legacy.js` associa órfãos a um dono (`--email` ou primeiro usuário)
> e importa `weekly_reviews.json`; `--dry-run` mostra as contagens sem alterar dados.

> **Nota de implementação (Fase 4)**: a migração `004_ai.sql` cria `ai_credentials`
> (1 por usuário: `provider`, `key_ciphertext`/`key_iv`/`key_tag`, `key_last4`,
> `base_url`, `model`, `status`) e `ai_usage` (uma linha por geração: `provider`,
> `source` `managed`/`byok`, `model`, tokens e `cost_usd` estimado) com índice
> `(user_id, created_at desc)`. Ids continuam `TEXT` (UUID gerado na aplicação).
> A chave BYOK nunca é armazenada em claro; a API expõe apenas `key_last4`.

> **Nota de implementação (Fase 7)**: a migração `006_reminders_enhancements.sql`
> adiciona `attempts` (default 0) e `last_error` a `reminders` e cria
> `telegram_chats` (1 chat por usuário, `user_id` UNIQUE). A `007_telegram_link_codes.sql`
> cria `telegram_link_codes` (código de pareamento com `expires_at` e `used_at`).
> A `008_user_reminder_prefs.sql` adiciona `reminder_default_enabled` (0/1),
> `reminder_default_channel` e `reminder_default_lead_minutes` (default 10) a `users`.
> O status do lembrete é derivado de `sent_at` (enviado) e `attempts` (tentativas);
> o worker só considera `sent_at IS NULL AND attempts < 5`. Ids/timestamps
> permanecem `TEXT` para portabilidade SQLite/Postgres.

## 7.5 Migração dos dados atuais

1. Criar usuário "legado" (dono) e associar todos os `praxis_items`/`reminders`
   existentes a ele (`ALTER TABLE ... ADD user_id`, depois `UPDATE`).
2. Importar `weekly_reviews.json` para a tabela `weekly_reviews` desse usuário.
3. Script `scripts/migrate-legacy.js`: executa os passos 1–2 no banco configurado
   (`--email <email>` define o dono, `--dry-run` só reporta).
4. Tornar `user_id` `NOT NULL` só após a migração.

Passos aditivos, executáveis uma vez, com log de contagem.

## 7.6 Regras de acesso a dados

- Repositórios **sempre** exigem `userId` como primeiro argumento.
- Nenhuma query de lista sem `WHERE user_id = $1`.
- Exclusões em cascata via FK (`ON DELETE CASCADE`).
- Dados sensíveis (chaves) nunca em `SELECT *` retornado ao cliente.
- Soft delete de usuário (`status='deleted'`) + job de anonimização.

## 7.7 Backup e retenção

- Backup diário do Postgres (retenção 7 dias, ponto no tempo se disponível).
- Teste de restauração a cada trimestre.
- `audit_log` retido por 12 meses; `ai_usage` por 24 meses (relatórios).
