# 04 — Padrões e convenções

## 4.1 Código

- **Linguagem**: JavaScript (CommonJS hoje). Manter consistência; migrar para
  ESM/TypeScript é opcional e isolado (ADR futura).
- **Nomes**: arquivos `kebab`/`dot` minúsculo (`praxis.repo.js`); funções `camelCase`;
  classes `PascalCase`; constantes `UPPER_SNAKE`.
- **Assíncrono**: `async/await`; nada de callback em código novo (wrapper do driver resolve).
- **Erros**: lançar `AppError` tipado; nunca `res.status(500)` direto na rota.
- **Sem segredos no código**; tudo via `config/env.js`.
- **Funções pequenas e puras no domínio** (ex.: `normalizeArea`, `shouldBlockNewAction`).

## 4.2 Contrato de API

- Base: `/api`. Versão explícita em breaking changes (`/api/v2`).
- **JSON sempre**. Sucesso: recurso ou `{ data }`. Erro: shape único:

```json
{
  "error": {
    "code": "quota_exceeded",
    "message": "Você atingiu o limite do plano.",
    "details": {}
  },
  "requestId": "..."
}
```

- **Códigos**: 400 validação, 401 não autenticado, 403 sem permissão/plano,
  404 ausente, 409 conflito de estado (ex.: `limite_pendentes`), 429 rate limit/cota, 500 interno.
- **Paginação**: `?limit=&cursor=` (cursor opcional); nada de retornar "tudo".
- **Idempotência**: webhooks e operações de cobrança idempotentes por `event.id`.
- **Datas**: ISO 8601 UTC no transporte; formatação pt-BR só na apresentação.

## 4.3 Validação

- Validar `body`, `query` e `params` na borda (esquema por rota).
- Rejeitar campos desconhecidos em payloads sensíveis.
- Normalização de domínio (`normalizeArea`, `normalizeStatus`) permanece no domínio.

## 4.4 Banco e migrações

- SQL explícito nos repositórios (parametrizado — nunca concatenar input).
- Migrações numeradas `NNN_descricao.sql`, aplicadas em ordem, registradas em
  `schema_migrations`. Sempre aditivas quando possível.
- Transações para operações multi-tabela (ex.: assinatura + entitlement).

## 4.5 Segurança

- Senhas com **Argon2id** (fallback bcrypt). Nunca logar credenciais.
- Cookies de sessão: `HttpOnly`, `Secure`, `SameSite=Lax`, rotação no login.
- **CSRF** em formulários/sessão (token ou double-submit) para rotas mutáveis.
- **Rate limit** por IP e por usuário; limites mais duros em `/api/praxis` e auth.
- **Headers** via `helmet`; CORS restrito ao domínio.
- **Chaves BYOK**: cifradas em repouso (AES-256-GCM, chave mestra no secret manager);
  nunca retornadas ao cliente (só máscara `sk-...abcd`).
- **Logs**: mascarar segredos; não registrar tokens do Stripe/Telegram/IA.

## 4.6 Observabilidade

- Logs JSON com `requestId`, `userId`, `route`, `status`, `durationMs`.
- `/health` (liveness) e `/ready` (dependências).
- Métricas de negócio: gerações de IA/mês, custo estimado, conversão de checkout.
- Alertas: falha de webhook Stripe, fila de lembretes parada, erro 5xx acima do limite.

## 4.7 Testes

- `node:test` (já usado) — manter.
- **Unitário**: domínio puro (`areas`, `limits`, `plans`), parser de IA.
- **Integração**: rotas com DB de teste; auth; cobrança (Stripe em modo teste via mocks).
- **Contrato**: shape de resposta de `/api/*`.
- Cobertura mínima: domínio 90%, serviços 70%.
- CI: lint + testes + migração em banco limpo.

## 4.8 Git e entrega

- Branches: `feat/...`, `fix/...`, `chore/...`, `docs/...`.
- Commits: Conventional Commits (`feat(auth): ...`).
- PR pequeno por fase/tarefa, com descrição e checklist de aceite.
- Sem merge sem CI verde; sem segredo em commit.
- Feature flags para liberar o app novo antes da migração de dados.

## 4.9 Front-end

- Mobile-first; sem framework hoje (SPA vanilla). Se crescer, avaliar migração
  incremental (ex.: HTMX/lit/Vue) — não reescrever tudo de uma vez.
- `escapeHtml` obrigatório ao injetar dados (padrão atual mantido).
- Estados explícitos: carregando, vazio, erro, sucesso.
- Tokens de design centralizados (ver [06](06-design-ux.md)).
- Acessibilidade: foco visível, labels, contraste AA, alvo de toque >= 44px.
