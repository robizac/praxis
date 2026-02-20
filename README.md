# PRAXIS

Aplicativo web para transformar conhecimento em ação prática usando IA, com histórico e lembretes.

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

- `AI_PROVIDER`: `ollama` (padrão) ou `openai`
- `OLLAMA_BASE_URL`: URL do Ollama local (padrão `http://localhost:11434`)
- `OLLAMA_MODEL`: modelo no Ollama (padrão `mistral`)
- `OPENAI_API_KEY`: chave da OpenAI (obrigatória apenas se `AI_PROVIDER=openai`)
- `OPENAI_MODEL`: modelo da OpenAI (padrão `gpt-4o-mini`)
- `TELEGRAM_BOT_TOKEN`: token do bot do Telegram (para lembretes via Telegram)
- `TELEGRAM_CHAT_ID`: chat_id que receberá os lembretes
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

## Endpoints

- `POST /api/praxis` -> recebe `{ "input": "..." }` (ou `{ "texto": "..." }`) e retorna `acao`, `prazo`, `regraMinima`, `area` e `provider`
- `POST /api/praxis` pode retornar `409` com `{ "error": "limite_pendentes", ... }` quando já houver 2 pendentes
- `GET /api/history` -> lista os últimos 100 itens
- `PATCH /api/history/:id` -> atualiza `status`, `tags` e/ou `area`
- `DELETE /api/history/:id` -> remove item do histórico
- `GET /api/upcoming?window=24h|7d` -> lista próximos prazos
- `GET /api/weekly-reviews` -> lista revisões semanais salvas em arquivo local
- `POST /api/weekly-reviews` -> salva revisão semanal com as 4 respostas
- `POST /api/complete/:id` -> compatibilidade (marca como feito)
- `POST /api/remind/:id` -> cria lembrete com `{ "remind_at_iso": "...", "channel": "telegram|browser" }`

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

Nenhuma chave de API de LLM é enviada para o frontend. A troca entre Ollama/OpenAI ocorre somente no backend.
