---
name: nova-migracao
description: Guia para criar uma migração de banco no PRAXIS seguindo as regras de ouro (numerada, aditiva, nos dois dialetos). Use ao mudar o schema.
---

# Nova migração no PRAXIS

Regra de ouro nº 5: **toda mudança de schema é uma migração numerada e aditiva**.
Nunca edite uma migração já aplicada.

## Passos

1. **Descubra o próximo número.** Liste os arquivos existentes:

   ```bash
   ls src/db/migrations/sqlite/ src/db/migrations/postgres/
   ```

   Use o próximo inteiro, com 3 dígitos e zero à esquerda (ex.: `009_`).

2. **Crie o arquivo nos DOIS dialetos**, com o **mesmo prefixo numérico**:
   - `src/db/migrations/sqlite/009_<descricao>.sql`
   - `src/db/migrations/postgres/009_<descricao>.sql`

3. **Escreva SQL aditivo e portável:**
   - Prefira `ALTER TABLE ... ADD COLUMN` / `CREATE TABLE` / `CREATE INDEX`.
   - **Evite** `DROP`/`RENAME` destrutivos (quebram dados em produção).
   - Evite SQL específico de um dialeto; se inevitável, adapte em cada arquivo.
   - Colunas de dados do usuário **precisam** de `user_id` (multi-tenancy, regra nº 2).
   - Novas colunas: `NOT NULL` exige `DEFAULT` (linhas existentes).

4. **Aplique e valide a idempotência:**

   ```bash
   npm run migrate
   npm run migrate   # de novo: não pode mudar nada
   ```

5. **Rode o loop de validação** (skill `validate`) — inclui `npm test`.

## Checklist antes de considerar pronto

- [ ] Número novo, sem colisão, nos **dois** diretórios
- [ ] SQL aditivo (nada destrutivo)
- [ ] `user_id` presente onde há dado de usuário
- [ ] `npm run migrate` roda duas vezes sem erro
- [ ] `npm test` passa

> Dados legados com `user_id NULL` são tratados por `npm run migrate:legacy`
> (`scripts/migrate-legacy.js`), não pela migração.
