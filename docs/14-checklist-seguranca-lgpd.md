# 14 — Checklist de segurança, LGPD e operação (Fase 8)

> Revisão de segurança e conformidade do PRAXIS antes do lançamento.
> Marque cada item no go-live (ver [13](13-deploy-kymus.md)).
> Última revisão: outubro de 2026.

## 14.1 OWASP Top 10 (2021)

| Risco                                | Controles no PRAXIS                                                                                                                                                                 | Onde está no código/teste                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A01 Broken Access Control**        | Toda query de dados do usuário é escopada por `user_id` da sessão; rotas autenticadas usam `requireAuth`; plano/entitlement por middleware; recursos de outro usuário retornam 404. | `src/repositories/*.repo.js`, `src/http/middleware/auth.js`, `src/http/middleware/entitlements.js`, `test/isolation.test.js`                               |
| **A02 Cryptographic Failures**       | Senhas com Argon2id (fallback scrypt); chaves BYOK cifradas com AES-256-GCM; tokens de sessão/reset só como hash; cookie httpOnly/SameSite; HSTS em produção.                       | `src/lib/password.js`, `src/integrations/crypto.js`, `src/lib/tokens.js`, `src/http/middleware/cookies.js`, `test/crypto.test.js`, `test/password.test.js` |
| **A03 Injection**                    | SQL sempre parametrizado (`?` → `$n`); HTML da SPA escapado com `escapeHtml`; nenhuma concatenação de entrada do cliente em SQL.                                                    | `src/repositories/*`, `src/db/postgres.js`, `web/app/app.js`                                                                                               |
| **A04 Insecure Design**              | Limite de 2 ações pendentes; cotas por plano; orçamento diário de IA; confirmação explícita (`EXCLUIR`) para apagar conta; ativação de plano só por webhook.                        | `src/domain/`, `src/services/usageService.js`, `src/services/billingService.js`                                                                            |
| **A05 Security Misconfiguration**    | Helmet com CSP restritiva (sem `unsafe-inline`), `Permissions-Policy`, CORS restrito em produção, `x-powered-by` desligado, rate limit, erros sem stack trace.                      | `src/http/middleware/security.js`, `test/health.test.js`                                                                                                   |
| **A06 Vulnerable Components**        | Dependências mínimas; `npm audit` no fluxo de manutenção (rodar antes de cada release).                                                                                             | `package.json`                                                                                                                                             |
| **A07 Identification/Auth Failures** | Sessão rotativa no login, revogação no logout/reset, CSRF double-submit, rate limit de auth, e-mail verificado, auditoria de eventos.                                               | `src/services/authService.js`, `src/http/middleware/cookies.js`, `test/auth.test.js`                                                                       |
| **A08 Software/Data Integrity**      | Webhook Stripe com verificação de assinatura + idempotência por `event.id`; migrações versionadas; backup com teste de restauração.                                                 | `src/integrations/stripe.js`, `src/db/migrate.js`, `test/billing.test.js`, `scripts/backup.js`                                                             |
| **A09 Logging/Monitoring**           | Log estruturado (pino) com redaction de segredos; `/metrics` Prometheus; alertas de 5xx, webhook, worker e custo de IA; `audit_log` de eventos sensíveis.                           | `src/lib/logger.js`, `src/lib/metrics.js`, `src/jobs/alerts.job.js`, `src/services/alertService.js`                                                        |
| **A10 SSRF**                         | Chamadas de IA usam URLs fixas dos providers; BYOK com base URL é decisão do usuário sobre a própria chave. Sem fetch de URL arbitrária vinda do cliente.                           | `src/services/ai/providers/*`                                                                                                                              |

### Itens de revisão manual

- [ ] Rodar `npm audit --omit=dev` antes de cada release.
- [ ] Revisar dependências novas (mínimo necessário; sem pacote abandonado).
- [ ] Confirmar que nenhum segredo aparece em logs (`redact` do pino).
- [ ] Testar CSP em produção: nenhum bloqueio no console do browser.
- [ ] Revisar headers com `curl -I https://<dominio>` (CSP, HSTS, nosniff, Permissions-Policy).
- [ ] Confirmar que `/metrics` exige `METRICS_TOKEN` em produção.
- [ ] Rodar o teste de restauração de backup (14.4).

## 14.2 LGPD

| Direito/dever              | Implementação                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Acesso e portabilidade** | `GET /api/account/export` gera `praxis-export-v1` com conta, itens, lembretes, revisões, uso de IA, assinatura, preferências, Telegram e log de auditoria. Botão em **Conta → Dados e privacidade**. |
| **Eliminação**             | `DELETE /api/account` (confirmação `EXCLUIR`): cancela assinatura Stripe (best-effort), apaga dados de 11 tabelas + usuário e anonimiza o `audit_log`. Registra `account.deleted` sem PII.           |
| **Transparência**          | Páginas `/termos`, `/privacidade` e `/contato` descrevem dados, base legal, operadores, retenção e direitos.                                                                                         |
| **Segurança**              | Criptografia de chaves, hash de senha, escopo por usuário, cookie httpOnly, CSRF.                                                                                                                    |
| **Retenção**               | `audit_log` 12 meses; `ai_usage` 24 meses; backups com rotação de 7 dias (docs/07 §7.7).                                                                                                             |
| **Operadores**             | Stripe (pagamento), provider de e-mail, provider de IA (modo gerenciado) e hospedagem.                                                                                                               |
| **Incidentes**             | Log de segurança + alertas operacionais; comunicar titulares/ANPD se houver risco relevante.                                                                                                         |

Checklist de conformidade:

- [x] Exportação de dados implementada e testada (`test/account.test.js`).
- [x] Exclusão de conta implementada e testada (purge + anonimização do audit).
- [x] Política de privacidade com direitos do titular e retenção.
- [x] Termos de uso com planos, cancelamento e BYOK.
- [x] Log de auditoria sem PII após exclusão.
- [ ] Definir encarregado (DPO) e canal oficial de contato antes do go-live.
- [ ] Revisar contratos/DPA com Stripe, e-mail, IA e hospedagem.

## 14.3 Observabilidade e alertas

- `/health`: liveness (não toca o banco).
- `/ready`: readiness (faz `SELECT 1`).
- `/metrics`: contadores Prometheus (HTTP por método/rota/status, latência, webhooks
  Stripe, entregas de lembrete, gerações e custo de IA, alertas). Protegido por
  `METRICS_TOKEN` quando definido.
- Alertas (`src/services/alertService.js`): sempre no log estruturado
  (`alert: true`); e-mail para `ALERT_EMAIL` se houver provider configurado.
  Cooldown por chave (`ALERT_COOLDOWN_MINUTES`, padrão 60) evita tempestade.
- Verificações a cada 5 min (`src/jobs/alerts.job.js`):
  - pico de 5xx (`ALERT_HTTP_5XX_THRESHOLD`, padrão 10 na janela);
  - custo de IA do dia ≥ `ALERT_AI_COST_RATIO` (padrão 80%) de `AI_DAILY_BUDGET_USD`.
- Alertas por evento:
  - falha no webhook da Stripe (`stripe_webhook_failure`, crítico);
  - falha no webhook do Telegram (`telegram_webhook_failure`);
  - lembretes que falharam na entrega (`reminders_delivery_failed`).

Checklist:

- [ ] `ALERT_EMAIL` configurado e testado com um alerta real.
- [ ] Coletor de logs do host marcando `alert: true`.
- [ ] Painel/dash lendo `/metrics` (ou scrape Prometheus).
- [ ] Alerta de custo coerente com `AI_DAILY_BUDGET_USD`.
- [ ] Monitor de `/health` e `/ready` no host.

## 14.4 Backup e restauração

Scripts:

```bash
# Postgres (usa pg_dump; requer o cliente instalado)
npm run backup -- --out /var/backups/praxis --retention 7

# SQLite (dev; snapshot consistente com VACUUM INTO)
npm run backup -- --out ./backups

# Teste de restauração do SQLite (valida integridade, tabelas e migrações)
npm run backup:test-restore -- --file ./backups/praxis-....db

# Teste de restauração do Postgres (banco DESCARTÁVEL de destino)
npm run backup:test-restore -- --file /var/backups/praxis-....dump \
  --target postgres://user:pass@host:5432/praxis_restore_test
```

Procedimento de teste trimestral (Postgres):

1. Criar um banco descartável (`CREATE DATABASE praxis_restore_test`).
2. Rodar `npm run backup:test-restore -- --file <dump> --target <url do descartável>`.
3. Conferir no JSON de saída `ok: true`, `migrations`, `users` e `tables`.
4. Fazer um smoke test de leitura na aplicação apontada para o banco restaurado.
5. Dropar o banco descartável.

Checklist:

- [x] Script de backup para Postgres e SQLite.
- [x] Script de teste de restauração com validação de schema.
- [x] Rotação de backups (`BACKUP_RETENTION`, padrão 7).
- [ ] Agendar o backup diário no host (cron/Kymus) com `BACKUP_DIR`.
- [ ] Guardar backups fora do host da aplicação.
- [ ] Registrar o resultado do teste trimestral.
- [ ] Testar restauração do Postgres no ambiente de deploy.

## 14.5 Riscos residuais conhecidos

- Métricas e cooldown de alertas são **em memória e por processo**; com múltiplas
  instâncias, cada uma alerta separadamente. Aceitável no volume atual; migrar
  para armazenamento compartilhado se escalar.
- Rate limit também é por processo (memória do `express-rate-limit`).
- O teste de restauração do Postgres **não** cria/derruba o banco de destino:
  ele precisa existir e ser descartável.
- Backups não são enviados para storage externo pelo script; isso é
  responsabilidade do host/infra.
- O cron de lembretes dentro do processo web continua existindo para dev; em
  produção use o worker dedicado (docs/13).
