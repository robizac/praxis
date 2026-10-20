---
name: validate
description: Roda o loop de validação do PRAXIS (lint, formatação, testes e migrações) e resume o resultado. Use antes de commitar, abrir PR ou quando quiser conferir que o projeto está saudável.
---

# Validação do PRAXIS

Rode os checks abaixo **na ordem**, do mais rápido para o mais lento. Pare no
primeiro que falhar, mostre o erro exato (`arquivo:linha` + mensagem) e diga o
que precisa mudar — **não conserte sem pedir**.

## 1. Lint

```bash
npm run lint
```

- `oxlint` está na raiz. Config em `.oxlintrc.json`.
- Erro de correção (`correctness`) bloqueia; avisos podem ser relatados mas não
  bloqueiam.

## 2. Formatação

```bash
npm run format:check
```

- Se houver arquivos fora do padrão, rode `npm run format` e **mostre o diff**
  antes de seguir. Formatação é o **último** passo, nunca misturada com lógica.
- **Estado conhecido (pré-reformatação global):** o repositório ainda tem
  arquivos antigos fora do padrão do Prettier. Enquanto isso, trate `format:check`
  como **informativo**: reporte a contagem, mas só bloqueie se **os arquivos que
  você mudou agora** estiverem fora do padrão. Quando a reformatação global for
  aplicada, passe a tratá-lo como bloqueante.

## 3. Testes

```bash
npm test
```

- Esperado: **todos passam** (a suíte roda em SQLite, em processo isolado).
- Confirme que **`praxis.db` não foi criado** na raiz (`ls praxis.db`): a suíte
  usa banco temporário por processo. Se aparecer, é regressão de isolamento.

## 4. Migrações

```bash
npm run migrate
```

- Deve ser **idempotente**: rodar de novo não muda nada.
- Se você adicionou uma migração, **confira os dois dialetos**
  (`src/db/migrations/sqlite/` e `src/db/migrations/postgres/`) com o mesmo número.

## Resumo final

Termine com um bloco curto:

```
lint:      ok | <n> erro(s)
format:    ok | <n> arquivo(s)
testes:    <pass>/<total>
migrações: ok | falhou
praxis.db: não criado ✅ | CRIADO (regressão!)
```

Se tudo passou, diga **"pronto para commit/PR"**. Se algo falhou, liste os
bloqueios em ordem e o próximo passo sugerido.
