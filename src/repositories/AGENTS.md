# AGENTS.md — `src/repositories/`

Regras específicas da camada de acesso a dados. Somam-se ao `AGENTS.md` da raiz;
não o substituem.

## Invariante nº 1: tudo é escopado por `user_id`

Toda query sobre dados do usuário **precisa** filtrar por `user_id`, e esse
`user_id` **sempre** vem como parâmetro (chega da sessão via serviço) — **nunca**
de `req`, body ou query do cliente.

```js
// Bom: user_id no WHERE, valor recebido do serviço.
async function getById(userId, id) {
  return db.get('SELECT * FROM praxis_items WHERE id = ? AND user_id = ?', [id, userId]);
}

// Ruim: sem escopo (vaza dados entre usuários) e montando SQL com o valor.
async function getById(id) {
  return db.get(`SELECT * FROM praxis_items WHERE id = ${id}`);
}
```

- `INSERT` grava `user_id` na coluna; `UPDATE`/`DELETE` incluem
  `AND user_id = ?` no `WHERE`; `SELECT` sempre filtra.
- Nunca concatene valores em SQL: use sempre placeholders (`?`).

## Outras regras da camada

- **Um repositório por agregado**, `*.repo.js`, `camelCase` nas funções.
- Repositório **não** decide regra de negócio: nada de `if` de entitlement, cota
  ou validação de domínio aqui — isso é papel de `services/` e `domain/`.
- Erros de negócio (`NotFoundError` etc.) são lançados no **serviço**, não aqui;
  o repositório devolve o dado (ou `undefined`/contagem de linhas).
- Mudança de schema **nunca** aqui: é migração numerada e aditiva em
  `src/db/migrations/{sqlite,postgres}/` (mesmo número nos dois dialetos).
- Compatível com SQLite e Postgres: evite SQL específico de um dialeto.
