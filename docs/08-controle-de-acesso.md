# 08 — Controle de acesso

## 8.1 Objetivos

1. Cada usuário vê **apenas os próprios dados** (isolamento multi-tenant).
2. Acesso ao produto e às funcionalidades é definido por **plano/entitlement**.
3. Operadores (`admin`) têm acesso administrativo auditado.

## 8.2 Autenticação (Quem é você)

**Método primário**: e-mail + senha.
- Hash com **Argon2id** (params: memory 19 MiB, iterations 2, parallelism 1) — fallback `bcrypt`.
- Requisitos de senha: >= 8 caracteres; bloqueio progressivo após tentativas falhas.
- Verificação de e-mail obrigatória para uso pleno (token de uso único, expira 24h).
- Reset de senha: token de uso único, expira 1h, invalida sessões.

**Método secundário**: Google OAuth 2.0 (OpenID Connect). Conta vinculada por e-mail verificado.

**Sessão**:
- Cookie `praxis_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` em produção.
- Sessão opaca (token aleatório) + `token_hash` (SHA-256) no banco → permite revogação (logout, reset, admin).
- Expiração de 30 dias; revogação no logout e em reset de senha.
- Logout revoga a sessão no servidor.

> **Implementado (Fase 2)**: verificação de e-mail **não bloqueia** o uso nesta fase;
> a conta apenas fica com `email_verified_at` nulo até a confirmação. Google OAuth
> foi adiado. `/api/auth/csrf` estabelece o cookie de CSRF para o SPA.

**Fluxo de login**
```
POST /api/auth/login { email, password }
  → verifica hash → cria sessão → Set-Cookie → 200 { user }
POST /api/auth/logout → revoga sessão → limpa cookie
GET  /api/auth/me → { user, plan, entitlements }
```

## 8.3 Autorização (O que você pode fazer)

### Papéis (RBAC)
| Papel | Descrição | Escopo |
|---|---|---|
| `user` | Usuário comum | Só os próprios recursos |
| `admin` | Operador | Leitura ampla + ações administrativas |

Papéis são **ortogonais ao plano**: um `user` Pro continua `user`, mas com entitlements maiores.

### Entitlements (por plano)
Derivados da assinatura ativa; checados por middleware.

```js
// src/domain/plans.js
const PLANS = {
  free:      { aiGenerationsPerMonth: 10,  byok: true,  reminders: 20,  history: 'full', weeklyReview: true },
  pro:       { aiGenerationsPerMonth: 300, byok: true,  reminders: 500, history: 'full', weeklyReview: true },
  pro_annual:{ aiGenerationsPerMonth: 400, byok: true,  reminders: 500, history: 'full', weeklyReview: true },
};
```

> Valores são proposta; ajustar na aprovação (ver [09](09-ia-e-custos.md)).

### Middlewares
| Middleware | Função | Exemplo |
|---|---|---|
| `attachUser` | Lê cookie, carrega usuário/plano | todas as rotas do app |
| `requireAuth` | 401 se não autenticado | `/api/history`, `/app` |
| `requireRole('admin')` | 403 se papel insuficiente | `/api/admin/*` |
| `requireEntitlement('aiGenerations')` | 402 se cota do plano esgotada (BYOK ignora) | `POST /api/praxis` |
| `requirePlan(['pro','pro_annual'])` | Bloqueia recurso por plano | features premium |
| `rateLimit` | Limita por IP/usuário | auth e IA |

> **Implementado (Fase 4)**: `requireEntitlement` vive em
> `src/http/middleware/entitlements.js` e delega para `usageService`. Com BYOK
> ativo a cota gerenciada é ignorada; o teto diário global da plataforma responde
> **503** (`ai_daily_budget_exceeded`). A gestão da chave BYOK usa
> `GET|PUT|DELETE /api/ai/credentials` (a API nunca devolve a chave, só `key_last4`)
> e a cota/uso em `GET /api/ai/usage`.
>
> **Implementado (Fase 5)**: o plano efetivo vem de `billingService.resolvePlanId`
> (assinatura `active`/`trialing` ⇒ plano do preço; senão `free`) e é carregado por
> `attachUser` em `req.user.plan`. `GET /api/auth/me` devolve `plan` + `entitlements`.
> `POST /api/praxis` consome a cota do plano efetivo.

Página/rota sem sessão no front: redireciona para `/entrar?next=...`.

## 8.4 Isolamento multi-tenant

- Repositórios exigem `userId`; **nunca** confiar em id do cliente.
- Teste automatizado: usuário A não acessa recurso de B (404, não 403, para não vazar existência).
- Opcional: Postgres RLS com `app.current_user_id`.

## 8.5 Ciclo de vida da conta

| Evento | Efeito |
|---|---|
| Cadastro | cria `users`, assinatura `free`, sessão, e-mail de verificação |
| Verificação | marca `email_verified_at` |
| Assinatura Pro | atualiza `subscriptions` via webhook; entitlements passam a Pro |
| Cancelamento | mantém Pro até `current_period_end`; depois rebaixa a Free |
| Falha de pagamento | `past_due` por 7 dias → rebaixa (`unpaid`) |
| Exclusão de conta | hard delete dos dados + anonimização do `audit_log` (LGPD); assinatura Stripe cancelada; sessões revogadas |

## 8.6 Segurança de sessão e CSRF

- Rotas mutáveis exigem token CSRF (double-submit cookie: `praxis_csrf` + header `X-CSRF-Token`).
- `helmet` para headers, com CSP restritiva: HTML/CSS/JS externos, `script-src 'self'`,
  `style-src 'self'` (sem `unsafe-inline`) e `Permissions-Policy` (Fase 8).
- Rate limit: auth `20/15min/IP`; `/api/praxis` `30/min`; API geral `120/min`.
- Registrar logins falhos e mudanças de senha em `audit_log` (ações `auth.*`).

## 8.7 Planos e limites (proposta)

| Recurso | Free | Pro | Pro Anual |
|---|---|---|---|
| Gerações de IA/mês (gerenciado) | 10 | 300 | 400 |
| BYOK (chave própria) | ✅ | ✅ | ✅ |
| Ações no histórico | ilimitado | ilimitado | ilimitado |
| Limite de pendentes | 2 | 2 | 2 |
| Lembretes ativos | 20 | 500 | 500 |
| Revisão semanal | ✅ | ✅ | ✅ |
| Suporte | comunidade | e-mail | e-mail prioritário |

Detalhes de preço e viabilidade de custo em [09](09-ia-e-custos.md) e [10](10-pagamentos-stripe.md).
