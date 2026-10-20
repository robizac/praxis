# 13 — Deploy no Kymus (`dash.kymus.app/hosting`)

> Não consegui acessar o painel do Kymus a partir daqui para confirmar o modelo
> exato (buildpack vs. Docker, suporte a worker/cron). Este documento assume um
> host do tipo PaaS que aceita **Dockerfile** ou Node buildpack, variáveis de
> ambiente e um banco gerenciado. **Confirmar em F0** e ajustar.

## 13.1 Requisitos do host

- Execução Node 20 LTS.
- **Postgres gerenciado** (ou add-on) com `DATABASE_URL`.
- Variáveis de ambiente/segredos.
- Comando de start configurável (web e worker).
- HTTPS/TLS e domínio customizado.
- Ideal: suporte a **worker/cron** (para lembretes). Se não houver, usar um
  serviço externo de cron chamando um endpoint protegido.

## 13.2 Dockerfile sugerido

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "src/http/server.js"]
```

Worker (mesma imagem, comando diferente):

```dockerfile
# comando do worker: node src/jobs/reminders.worker.js
```

## 13.3 Processos

| Processo            | Comando                                 | Escala            |
| ------------------- | --------------------------------------- | ----------------- |
| Web/API             | `node src/http/server.js`               | 1+ (horizontal)   |
| Worker de lembretes | `node src/jobs/reminders.worker.js`     | 1 (singleton)     |
| Migrações           | `node scripts/migrate.js` (idempotente) | 1, no boot do web |

> Lembretes **não** podem depender de `node-cron` no processo web (quebra com
> múltiplas instâncias/sleep). Ver F7.

## 13.4 Variáveis de ambiente (produção)

```bash
# App
NODE_ENV=production
PORT=3000
APP_URL=https://praxis.exemplo.com
APP_BASE_DOMAIN=praxis.exemplo.com
SESSION_SECRET=<32+ bytes aleatórios>

# Banco
DATABASE_URL=postgres://user:pass@host:5432/praxis

# E-mail
EMAIL_PROVIDER=resend
EMAIL_API_KEY=...
EMAIL_FROM="PRAXIS <no-reply@praxis.exemplo.com>"

# IA (gerenciado)
AI_DEFAULT_PROVIDER=openai
MANAGED_OPENAI_API_KEY=...
AI_DEFAULT_MODEL=gpt-5-nano
AI_MAX_TOKENS=400
AI_TIMEOUT_MS=20000
AI_DAILY_BUDGET_USD=5
AI_KEY_ENCRYPTION_SECRET=<32+ bytes aleatórios>

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
BILLING_TRIAL_DAYS=7

# Telegram (opcional / por usuário)
TELEGRAM_BOT_TOKEN=...

# Observabilidade, alertas e backups (Fase 8)
ALERT_EMAIL=ops@praxis.exemplo.com
ALERT_COOLDOWN_MINUTES=60
ALERT_HTTP_5XX_THRESHOLD=10
ALERT_AI_COST_RATIO=0.8
METRICS_TOKEN=<32+ bytes aleatórios>   # /metrics exige Bearer token
BACKUP_DIR=/var/backups/praxis
BACKUP_RETENTION=7
```

> Manter o `.env.example` do repositório em sincronia com esta lista.
> Nunca commitar `.env`; usar os segredos do host.

## 13.5 Passos de publicação

1. **Repositório**: garantir `Dockerfile`, `.dockerignore`, scripts de start.
2. **Banco**: criar Postgres; copiar `DATABASE_URL`.
3. **Segredos**: cadastrar todas as variáveis acima.
4. **Web**: criar serviço apontando para o Dockerfile; porta 3000; healthcheck `/health`.
5. **Worker**: criar segundo serviço com o mesmo código e comando do worker.
6. **Migrações**: aplicar no boot do web (ou passo de release).
7. **Stripe**: registrar webhook `https://<dominio>/webhooks/stripe` para os eventos de 10.4; copiar `whsec_`.
8. **Domínio**: apontar DNS; garantir TLS.
9. **Monitor**: checar `/health` e `/ready`; raspar `/metrics` com `METRICS_TOKEN`.
10. **Alertas**: configurar `ALERT_EMAIL` e testar um alerta real.
11. **Backup**: agendar `npm run backup` (diário) e rodar `npm run backup:test-restore`.
12. **Smoke tests**: landing → cadastro → geração → assinatura → lembrete.

### Backup e restauração

```bash
# Diário (cron/Kymus). Requer pg_dump no host.
npm run backup -- --out /var/backups/praxis --retention 7

# Teste de restauração (trimestral) em banco descartável do Postgres
npm run backup:test-restore -- --file /var/backups/praxis-....dump \
  --target postgres://user:pass@host:5432/praxis_restore_test
```

Política: retenção de 7 dias, backup fora do host da aplicação, teste de
restauração trimestral. Detalhes em [14](14-checklist-seguranca-lgpd.md#144-backup-e-restauração).

## 13.6 Checklist de go-live

- [ ] `NODE_ENV=production` e `SESSION_SECRET` forte.
- [ ] Postgres acessível e migrações aplicadas.
- [ ] Web e worker no ar; worker processando sem erro.
- [ ] Webhook Stripe validado (testar evento de teste).
- [ ] E-mails transacionais chegando (verificação, reset, cobrança).
- [ ] `/health` e `/ready` verdes e monitorados.
- [ ] `/metrics` raspado com `METRICS_TOKEN`; alertas de 5xx/webhook/worker/IA ativos.
- [ ] Backup do Postgres agendado e teste de restauração validado.
- [ ] Custo de IA com alerta (`AI_DAILY_BUDGET_USD` + `ALERT_AI_COST_RATIO`).
- [ ] Termos/privacidade/contato publicados; exportação e exclusão de conta funcionam.
- [ ] Checklist de segurança e LGPD ([14](14-checklist-seguranca-lgpd.md)) completo.
- [ ] Landing com Lighthouse >= 90.

## 13.7 Observações específicas do Kymus

Como o painel não pôde ser inspecionado daqui, confirmar:

- [ ] Aceita Dockerfile? (Se não, buildpack Node: definir start command.)
- [ ] Oferece Postgres gerenciado? (Se não, usar provedor externo, ex.: Neon/Supabase.)
- [ ] Suporta processo worker/segundo serviço? (Se não, cron externo.)
- [ ] Como são injetados segredos e domínios.
- [ ] Limites de memória/CPU e se há "sleep" de instância ociosa.
