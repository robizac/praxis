# 02 — Mapeamento de funcionalidades

Resultado da leitura completa do repositório. Cada funcionalidade lista onde
está no código, como é acionada e qual o comportamento atual.

## 2.1 Inventário de arquivos

| Arquivo | Papel |
|---|---|
| `server.js` | Servidor Express: providers de IA, API REST, agendador de lembretes, bootstrap. |
| `db.js` | Wrapper SQLite (`run`/`get`/`all`) + criação/migração de schema. |
| `domain.js` | Regras de domínio: `AREAS`, `normalizeArea`, `shouldBlockNewAction`. |
| `weeklyReviewsStore.js` | Persistência de revisões semanais em JSON (`weekly_reviews.json`). |
| `index.html` | SPA completa (HTML+CSS+JS inline, hash routing) com as 3 telas. |
| `package.json` | Scripts (`dev`, `start`, `test`) e dependências. |
| `.env.example` | Modelo de variáveis de ambiente. |
| `test/domain.test.js` | Testes de `normalizeArea` e `shouldBlockNewAction`. |
| `test/ollama-provider.test.js` | Teste do parser `parsePraxisJson`. |
| `.codex/environments/environment.toml` | Ação "Run" (`npm run dev`). |
| `README.md` | Documentação atual e instruções. |

## 2.2 Funcionalidades

### F1 — Gerar ação a partir de aprendizado (IA)
- **Onde**: `server.js` → `app.post('/api/praxis')`, `gerarPraxis`, `gerarPraxisComOllama`, `gerarPraxisComOpenAI`, `buildPrompt`, `parsePraxisJson`.
- **Fluxo**: usuário envia `{ input|texto, area }` → valida texto → verifica pendentes → chama provider → parseia JSON → normaliza área → converte prazo → grava → devolve payload.
- **Regras**:
  - Bloqueia se `>= 2` itens com `status = 'pendente'` → HTTP `409 { error: 'limite_pendentes' }`.
  - Área escolhida pelo usuário tem prioridade sobre a da IA.
  - Se o JSON da IA vier inválido → usa `buildSafeFallback` e retorna `warning`.
  - Prazo em pt-BR (`dd/mm/yyyy HH:MM`) → ISO; fallback: amanhã 20:00.
- **Saída**: `acao`, `prazo`, `regraMinima`, `area`, `id`, `status`, `created_at`, `provider`, `warning`.

### F2 — Metadados da Home
- **Onde**: `GET /api/meta`.
- **Retorno**: `{ pendentes, pode_gerar }` (`pode_gerar = pendentes < 2`).
- **Uso**: habilita/desabilita o botão "Transformar em Ação".

### F3 — Histórico de ações
- **Onde**: `GET /api/history`, `PATCH /api/history/:id`, `DELETE /api/history/:id`.
- **GET**: últimos 100 itens por `created_at` desc.
- **PATCH**: atualiza `status` (`pendente`/`feito`), `area` e `tags` (máx. 10, sanitizadas).
- **DELETE**: remove item e seus `reminders`.
- **Front**: filtro por área, status, busca textual e ordenação (recentes/prazo) — tudo client-side em `renderHistory()`.

### F4 — Próximos prazos
- **Onde**: `GET /api/upcoming?window=24h|7d`.
- **Retorno**: `{ window, items }` de pendentes com prazo entre agora e agora+janela.

### F5 — Revisão Semanal
- **Onde**: `GET/POST /api/weekly-reviews`, `weeklyReviewsStore.js`.
- **Regras**: 4 respostas obrigatórias (`executei`, `trouxe_paz`, `gerou_peso`, `deve_sair`).
- **Persistência**: arquivo `weekly_reviews.json` (array), id incremental manual.
- **Front**: formulário + lista colapsável das 10 últimas.

### F6 — Concluir item (legado)
- **Onde**: `POST /api/complete/:id`.
- **Uso**: compatibilidade; marca como `feito`. Substituído por `PATCH /api/history/:id`.

### F7 — Lembretes
- **Onde**: `POST /api/remind/:id`, `GET /api/browser-reminders`, `POST /api/browser-reminders/:id/sent`, `setupReminderScheduler()`.
- **Canais**: `telegram` (cron a cada minuto envia via Bot API) e `browser` (front consulta e usa Notification API).
- **Tabela**: `reminders(praxis_id, remind_at_iso, channel, sent_at)`.

### F8 — Interface (SPA de 3 telas)
- **Onde**: `index.html`.
- **Telas**: Início (gerar), Histórico (filtros + concluir/reabrir), Revisão Semanal.
- **Navegação**: hash routing (`#/home`, `#/history`, `#/review`).
- **Estado**: `state.history`, `state.pendingCount`; `refreshHistoryAndMeta()` sincroniza.
- **Sem build step**: HTML/CSS/JS inline, `escapeHtml` para XSS no render.

### F9 — Providers de IA
- **Onde**: `server.js` (`provider`, `gerarPraxis`).
- **Seleção**: `AI_PROVIDER=ollama|openai`; em produção **força** `openai`.
- **Ollama**: `POST {OLLAMA_BASE_URL}/api/chat`, `format` = JSON Schema, `stream:false`.
- **OpenAI**: `POST /v1/chat/completions`, `temperature:0.3`.
- **Contrato**: `PRAXIS_JSON_SCHEMA` (área do enum, ação, prazo, regra mínima).

### F10 — Domínio de áreas e limite
- **Onde**: `domain.js`.
- **Regras**: `normalizeArea` (case-insensitive, fallback) e `shouldBlockNewAction` (>= 2).

### F11 — Bootstrap e observabilidade mínima
- **Onde**: `start()`: `initDb()` → `setupReminderScheduler()` → `listen` em `0.0.0.0:PORT`.
- **Logs**: `console.log/error` (sem nível/JSON).

## 2.3 Contratos de API (resumo)

| Método | Rota | Corpo/Query | Resposta |
|---|---|---|---|
| POST | `/api/praxis` | `{ input, area }` | ação completa / 400 / 409 / 500 |
| GET | `/api/meta` | — | `{ pendentes, pode_gerar }` |
| GET | `/api/history` | — | lista (100) |
| PATCH | `/api/history/:id` | `{ status?, area?, tags? }` | item atualizado |
| DELETE | `/api/history/:id` | — | `{ ok, id }` |
| GET | `/api/upcoming` | `?window=24h\|7d` | `{ window, items }` |
| GET | `/api/weekly-reviews` | — | lista |
| POST | `/api/weekly-reviews` | `{ respostas: {4 campos} }` | review criada |
| POST | `/api/complete/:id` | — | item marcado `feito` |
| POST | `/api/remind/:id` | `{ remind_at_iso, channel }` | reminder criado |
| GET | `/api/browser-reminders` | — | reminders vencidos (browser) |
| POST | `/api/browser-reminders/:id/sent` | — | `{ ok }` |

## 2.4 Lacunas e riscos (base para a evolução)

| # | Lacuna | Impacto | Onde tratar |
|---|--------|---------|-------------|
| L1 | Sem autenticação — dados globais | Privacidade zero; não é vendável | [08](08-controle-de-acesso.md) |
| L2 | Sem `user_id` nas tabelas | Impossível multi-tenant | [07](07-banco-de-dados.md) |
| L3 | SQLite em arquivo local | Escala/backup/concorrência | [07](07-banco-de-dados.md) |
| L4 | Revisões em JSON | Corrupção em concorrência; some no deploy | [07](07-banco-de-dados.md) |
| L5 | Produção usa chave OpenAI do dono | Custo sem limite | [09](09-ia-e-custos.md) |
| L6 | Sem cotas/medição de uso de IA | Abuso e custo imprevisível | [09](09-ia-e-custos.md) |
| L7 | Sem planos/entitlements | Não monetiza | [08](08-controle-de-acesso.md) / [10](10-pagamentos-stripe.md) |
| L8 | Sem landing page | Sem aquisição | [11](11-landing-page.md) |
| L9 | Cron no processo web | Quebra com scale/sleep no host | [13](13-deploy-kymus.md) |
| L10 | Sem rate limit/headers/validação robusta | Superfície de ataque | [04](04-padroes-e-convencoes.md) |
| L11 | Chaves em texto puro (BYOK futuro) | Vazamento de segredo | [09](09-ia-e-custos.md) |
| L12 | Sem migrações versionadas | Schema imprevisível | [07](07-banco-de-dados.md) |
| L13 | Testes cobrem pouco | Regressões | [04](04-padroes-e-convencoes.md) |
| L14 | Erros/logs sem padrão nem rastreio | Difícil diagnosticar | [04](04-padroes-e-convencoes.md) |
