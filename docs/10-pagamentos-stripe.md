# 10 — Pagamentos (Stripe)

## 10.1 Modelo de cobrança

Assinatura recorrente (Billing) com dois planos pagos, em **BRL**:

| Plano | Preço | Ciclo | Stripe Product | Stripe Price |
|---|---|---|---|---|
| Pro | R$ 27,00 | mensal | `prod_pro` | `price_pro_monthly` |
| Pro Anual | R$ 197,00 (≈ R$16,42/mês) | anual | `prod_pro_annual` | `price_pro_annual` |
| Free | R$ 0 | — | (sem Stripe) | — |

O preço final é decisão a aprovar (ver [09](09-ia-e-custos.md) para viabilidade).
Ambos têm **trial de 7 dias** (`trial_period_days: 7`), configurável.

## 10.2 Fluxo de compra

```
Landing /app
   │  "Assinar Pro"
   ▼
POST /api/billing/checkout { priceId }
   │  cria/reusa Customer (stripe_customer_id em subscriptions)
   ▼
Stripe Checkout Session (success_url=/app/conta?checkout=ok, cancel_url=/precos)
   ▼
Usuário paga
   ▼
Stripe webhook → checkout.session.completed / customer.subscription.*
   ▼
billingService sincroniza subscriptions → entitlements
   ▼
App libera Pro
```

**Portal do cliente**: `POST /api/billing/portal` → Stripe Billing Portal
(trocar cartão, upgrade/downgrade, cancelar, ver faturas). Sem retorno imediato:
uso otimista + refresh em foco.

## 10.3 Endpoints da aplicação

| Método | Rota | Função |
|---|---|---|
| GET | `/api/billing/plans` | catálogo de planos/preços públicos |
| GET | `/api/billing/subscription` | assinatura do usuário + entitlement |
| POST | `/api/billing/checkout` | cria Checkout Session |
| POST | `/api/billing/portal` | cria sessão do Portal do cliente |
| POST | `/webhooks/stripe` | recebe eventos (raw body, assinatura verificada) |

## 10.4 Webhooks (fonte da verdade)

Verificar assinatura com `STRIPE_WEBHOOK_SECRET`; responder `200` rápido;
processar de forma idempotente por `event.id` (tabela `stripe_events`).

| Evento | Ação |
|---|---|
| `checkout.session.completed` | vincula customer/subscription ao usuário; ativa plano |
| `customer.subscription.created/updated` | atualiza `plan`, `status`, `current_period_end`, `cancel_at_period_end` |
| `customer.subscription.deleted` | rebaixa para `free` ao fim do período |
| `invoice.paid` | confirma renovação; registra receita |
| `invoice.payment_failed` | marca `past_due`; dispara e-mail; retry Stripe |
| `customer.updated` | sincroniza e-mail/endereço quando necessário |

Mapeamento de status Stripe → interno: `trialing→trialing`, `active→active`,
`past_due→past_due`, `canceled→canceled`, `unpaid→unpaid`, `incomplete→incomplete`.

Entitlement efetivo: `active|trialing` ⇒ plano do `price`; senão ⇒ `free`.

## 10.5 Modelo local (sincronizado por webhook)

Tabela `subscriptions` (ver [07](07-banco-de-dados.md)) guarda `stripe_customer_id`,
`stripe_subscription_id`, `plan`, `status`, `current_period_end`, `cancel_at_period_end`.
É a base das checagens de entitlement — **não** consultar a Stripe a cada request.

## 10.6 Idempotência e concorrência

- Inserir `event.id` em `stripe_events` antes de processar; se já existe, ignorar.
- Atualizações em transação (subscription + entitlement derivado).
- Nunca confiar em `success_url` para ativar plano (só o webhook ativa).

## 10.7 Segurança e conformidade

- `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` só no servidor.
- Checkout no domínio do Stripe (PCI fora do escopo).
- Não armazenar dados de cartão.
- LGPD: Stripe como operador; cláusula de privacidade no contrato/termos.

## 10.8 Variáveis de ambiente

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
STRIPE_PORTAL_CONFIG_ID=            # opcional (configuração do portal)
BILLING_TRIAL_DAYS=7
```

## 10.9 Plano de testes

- **Modo teste** (`sk_test_...`, cartão `4242...`).
- Casos: criação de customer; checkout com sucesso; trial; upgrade; downgrade;
  cancelamento (mantém até o fim); falha de pagamento → `past_due` → rebaixa;
  webhook duplicado (idempotência); webhook com assinatura inválida (400).
- Stripe CLI: `stripe listen --forward-to localhost:3000/webhooks/stripe`.
- Script `scripts/stripe-setup.js` cria produtos/preços de teste e imprime os IDs.

## 10.10 Recibos, notas e impostos

- Recibos automáticos da Stripe (e-mail).
- Tributação: usar Stripe Tax se aplicável (BRL/BR). Avaliar com contador.
- Dunning (cobrança de falhas): configurar no Dashboard (Smart Retries + e-mails).

## 10.11 Implementação (Fase 5)

| Peça | Arquivo |
|---|---|
| Migração | `src/db/migrations/{sqlite,postgres}/005_billing.sql` |
| SDK + assinatura | `src/integrations/stripe.js` (`getStripe`, `constructEvent`, `priceIdForPlan`/`planForPriceId`) |
| Assinaturas | `src/repositories/subscriptions.repo.js` |
| Idempotência | `src/repositories/stripeEvents.repo.js` |
| Regras | `src/services/billingService.js` (checkout, portal, `applyEvent`, `handleWebhook`) |
| Rotas | `src/http/routes/billing.routes.js`, `src/http/routes/webhooks.routes.js` |
| Setup de preços | `scripts/stripe-setup.js` (`npm run stripe:setup`) |

- Plano efetivo em `attachUser` → `req.user.plan`; `GET /api/auth/me` devolve
  `plan` + `entitlements`; `POST /api/praxis` usa o plano efetivo nas cotas.
- O webhook é montado fora de `/api` (sem CSRF/sessão); o corpo bruto é preservado
  por `express.json({ verify })` e a assinatura é validada pelo SDK. Assinatura
  inválida → **400**; `STRIPE_WEBHOOK_SECRET` ausente → **503**.
- Sem `STRIPE_SECRET_KEY`, checkout/portal respondem **503** e os botões de compra
  ficam desabilitados na UI (Free).
- E-mails de cobrança (confirmação, falha, cancelamento) usam
  `src/integrations/email.js` (em dev apenas registra no log).
- Testes: `test/billing.test.js` (plano efetivo, assinatura inválida, idempotência,
  ativação → Pro, `past_due` → free, `deleted` → free, checkout/portal com cliente fake).
