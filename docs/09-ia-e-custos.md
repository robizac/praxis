# 09 — IA e custos

Atende direto ao requisito: *"a funcionalidade que usa agente de IA deve usar a
chave de IA do usuário, ou algo cujo custo de uso seja menor que o cobrado na assinatura."*

## 9.1 Estratégia recomendada: híbrida (BYOK + gerenciado com cota)

| Modo | Quem paga a IA | Quando usar | Vantagem |
|---|---|---|---|
| **Gerenciado** (default) | PRAXIS (chave da plataforma) | todos, até a cota | Zero atrito; funciona no primeiro clique |
| **BYOK** | Usuário (chave própria) | power users / quem quer modelo específico | Custo zero para o PRAXIS; sem cota |
| Ollama local (BYOK self-host) | Usuário | quem já roda Ollama | Custo zero, privacidade |

Regra: **BYOK ativo ⇒ não consome cota gerenciada.** Sem BYOK ⇒ limite mensal
do plano. Ao estourar ⇒ oferta de upgrade/BYOK.

Isso garante o objetivo de negócio: no pior caso (só gerenciado), o custo de IA
é uma fração pequena da assinatura (ver 9.3).

## 9.2 Abstração de provider

`src/services/ai/aiService.js` decide o provider:

```
gerarPraxis(userId, texto, area):
  1. cred = ai_credentials[userId]           # BYOK?
  2. provider = cred ? cred.provider : 'managed'
  3. se managed: checa cota (usageService.canConsume)
  4. chama adaptador: providers/{openai|anthropic|gemini|ollama}.js
  5. parsePraxisJson + fallback seguro
  6. registra ai_usage (tokens, custo estimado, source)
```

Contrato dos adaptadores: `generate({ apiKey, baseUrl, model, prompt, schema }) -> rawText`.
Adicionar provider = novo arquivo, sem tocar no resto.

## 9.3 Modelo de custo (viabilidade)

Premissas de uma geração PRAXIS:
- **Entrada**: ~500 tokens (system + regra + aprendizado + schema).
- **Saída**: ~150 tokens (JSON).
- Modelo econômico: **US$ 0,15 / 1M input** e **US$ 0,60 / 1M output**
  (classe `gpt-5-nano` / `gemini-flash` / `gpt-4o-mini`). *Confirmar preço atual.*

Custo por geração:
```
0,0005 * 0,15 + 0,00015 * 0,60 = 0,000075 + 0,00009 = US$ 0,000165
≈ R$ 0,0009  (câmbio ~5,4)  → menos de 1 centavo
```

Custo mensal por assinante (pior caso do plano):

| Plano | Gerações/mês | Custo IA estimado (US$) | Custo (R$) | Preço (R$) | % da receita |
|---|---|---|---|---|---|
| Free | 10 | 0,0017 | 0,01 | 0 | — |
| Pro | 300 | 0,05 | 0,27 | 27 | **~1,0%** |
| Pro (se 3x a cota) | 900 | 0,15 | 0,81 | 27 | ~3,0% |
| Pro Anual | 400 | 0,07 | 0,36 | 20 (equivalente/mês) | ~1,8% |

Mesmo com **10x** de margem de erro ou uso de modelo ~10x mais caro, o custo
segue abaixo de ~15% da receita (RNF-07). **A assinatura cobre folgadamente o custo de IA.**

> Números de preço/câmbio devem ser reconfirmados na aprovação e revisitados
> trimestralmente (os preços de API mudam).

## 9.4 Cotas, medição e limites

- `ai_usage` grava cada chamada (tokens, modelo, custo estimado, `source`).
- Cota lida por agregação do mês corrente: `SUM` de gerações por `user_id`.
- Contadores por ciclo de assinatura (`current_period_end`) no Pro; mensal no Free.
- Bloqueio em `requireEntitlement('aiGenerations')` → HTTP 402/429 com CTA.
- Alerta interno se custo agregado do dia passar de um teto (`AI_DAILY_BUDGET_USD`).

## 9.5 Guardrails de custo

1. **Prompt mínimo** — schema compacto, sem histórico, sem repetições.
2. **`max_tokens`** na resposta (ex.: 400) para impedir saídas longas.
3. **Cache** — hash de `(texto normalizado + área + modelo)`; reusa resultado por 30 dias.
4. **Deduplicação** — não gerar para o mesmo texto já existente pendente.
5. **Timeout + circuit breaker** — 20s; após N falhas, fallback.
6. **Fallback seguro** — `buildSafeFallback` (já existe) sem nova chamada.
7. **Rate limit** — 30/min/usuário no `/api/praxis`.
8. **Modelo por plano** — econômico por padrão; premium só se BYOK ou plano top.

## 9.6 BYOK — gestão de chaves

- Providers: OpenAI, Anthropic, Google Gemini, Ollama (self-host).
- Chave cifrada com **AES-256-GCM**; chave mestra em `AI_KEY_ENCRYPTION_SECRET`
  (secret manager do host). Nunca logada, nunca devolvida (só `key_last4`).
- Fluxo: usuário cola chave → valida com uma chamada de teste barata → salva.
- Falha da chave do usuário → erro claro + opção de voltar ao gerenciado.
- Aviso de segurança na UI: "usada apenas para gerar suas ações; nunca exibida".

## 9.7 Variáveis de ambiente da IA

```
AI_DEFAULT_PROVIDER=openai        # provider gerenciado da plataforma
MANAGED_OPENAI_API_KEY=...        # chave da plataforma (gerenciado)
AI_DEFAULT_MODEL=gpt-5-nano
AI_MAX_TOKENS=400
AI_TIMEOUT_MS=20000
AI_DAILY_BUDGET_USD=5
AI_KEY_ENCRYPTION_SECRET=...      # cifra das chaves BYOK
# BYOK é configurado por usuário no banco, não em env.
```

## 9.8 Roadmap de IA (opcional, pós-v1)

- Roteamento inteligente: tentativa em modelo barato → escalonar para melhor se falhar no schema.
- Batch/agrupamento de revisões semanais com 1 chamada.
- Prompts especializados por Área da Vida.
- Avaliação de qualidade (golden set) para manter consistência do JSON.
- Cache distribuído (Redis) quando houver múltiplas instâncias.

## 9.9 Notas de implementação (Fase 4)

- **Roteamento** (`src/services/ai/aiService.js`): com `ai_credentials` ativa →
  BYOK (chave do usuário, sem cota); sem credencial → provider gerenciado
  (`AI_PROVIDER` em dev; remoto em produção) com cota do plano + teto diário.
- **Adaptadores** (`src/services/ai/providers/`): `openai`, `anthropic`, `gemini`,
  `ollama`. Adicionar um provider é criar um arquivo e registrá-lo em `index.js`.
  Contrato: `generate({ input, area, apiKey, baseUrl, model }) -> { text, usage, model }`.
- **BYOK**: chave cifrada com AES-256-GCM (`AI_KEY_ENCRYPTION_SECRET`); a API nunca
  devolve a chave (só `key_last4`). Salvar exige uma chamada de teste barata.
- **Cotas**: `ai_usage` grava cada geração (tokens, modelo, `cost_usd` estimado,
  `source`). Cota = `COUNT` de `source='managed'` no mês corrente. Middleware
  `requireEntitlement('aiGenerations')` bloqueia com **HTTP 402** (`quota_exceeded`).
- **Orçamento diário**: `SUM(cost_usd)` gerenciado do dia ≥ `AI_DAILY_BUDGET_USD`
  → **HTTP 503** (`ai_daily_budget_exceeded`). BYOK não é afetado.
- **Cache**: hash de `(texto normalizado + área + provider + modelo)`, TTL 30 dias,
  em memória por processo.
- **Pendências**: contadores por ciclo de assinatura (Pro) chegam na Fase 5;
  modelo premium por plano fica como evolução.
