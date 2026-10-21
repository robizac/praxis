# PRAXIS — Plano de auditoria e limpeza do repositório

> Etapa 2 do trabalho (após `fix/rotas-entrar-cadastro`).
> Princípio: **relatar antes de destruir**. Nada é apagado sem lista prévia
> apresentada para aprovação.

---

## 0. Branch strategy

Dois branches separados, para o PR do bug ficar enxuto e revisável:

| Branch | Escopo |
|---|---|
| `fix/rotas-entrar-cadastro` | Bug dos 404 em `/entrar` e `/cadastro` (correção funcional) |
| `chore/auditoria-limpeza` | Remoção de duplicados/temperados, `.gitignore`, `.gitattributes` |

---

## A. Integridade — "arquivos temperados"

| # | Verificação | Comando / técnica | Severidade |
|---|---|---|---|
| A1 | Objetos corrompidos no histórico | `git fsck --full --strict` | 🔴 |
| A2 | Commits locais não enviados / branches divergentes | `git fetch --all --prune` + `git log --all --not --remotes` | 🔴 |
| A3 | Working tree suja (alterações não commitadas) | `git status --porcelain` | 🟠 |
| A4 | **Segredos commitados** (AWS, OpenAI/Anthropic, Stripe, JWT, senhas, `.env`) | scanner de regex no histórico + working tree | 🔴 |
| A5 | `.env` / `.env.local` / `*.pem` / `*.key` versionados | `git ls-files` | 🔴 |
| A6 | Artefatos de build commitados (`node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`) | `git ls-files` | 🟠 |
| A7 | Arquivos duplicados: mesmo conteúdo em nomes/caminhos diferentes | hash de blobs duplicados (`git cat-file --batch-all-objects`) | 🟡 |
| A8 | Arquivos com nome duplicado em diretórios diferentes (shadowing) | grouping por basename | 🟡 |
| A9 | Arquivos de 0 byte / placeholders vazios | `find -size 0` | 🟡 |
| A10 | Symlinks quebrados | `find -xtype l` | 🟡 |
| A11 | Permissões erradas (ex.: `.sh` sem `+x`, ou `+x` em tudo) | `git ls-files -s` (modo 100755/100644) | 🟡 |
| A12 | Mistura CRLF/LF sem `.gitattributes` | `git ls-files --eol` | 🟡 |
| A13 | Binários grandes commitados | blobs > 1 MB | 🟡 |
| A14 | `package-lock.json` fora de sincronia com `package.json` | `npm ci` em modo dry-run | 🟠 |
| A15 | Referências a paths inexistentes (`require('./x')` sem `x`) | grafo de imports | 🟠 |

---

## B. Quebrados / faltando

| # | Verificação | Como |
|---|---|---|
| B1 | **Compila** | `npm ci` + `npm run build` / `tsc --noEmit` |
| B2 | **Lint limpo** | `npm run lint` |
| B3 | **Testes passam** | `npm test` |
| B4 | **Dead code**: arquivos que ninguém importa | grafo de imports a partir dos entrypoints |
| B5 | **Assets quebrados**: todo `href`/`src` de HTML/CSS aponta para arquivo existente no repo | **mesma técnica que achou o bug em produção** (`/entrar`, `/cadastro`) |
| B6 | **Rotas da API**: todo `fetch('/api/...')` do front tem rota registrada no back | comparar `app.js` × tabela de rotas do servidor |
| B7 | **Variáveis de ambiente**: todo `process.env.X` / `import.meta.env.X` tem entrada no `.env.example` | varredura de `env` |
| B8 | Segredos/URLs hardcoded (localhost em código de produção, `http://localhost:3000` no CORS) | grep de `localhost` / `127.0.0.1` | 
| B9 | Documentação desatualizada (README x comportamento real) | revisão manual |

---

## C. `.gitignore` / `.gitattributes`

### C.1 `.gitignore` — unificar e completar

Currently a verificar no repo. Alvo:

```gitignore
# Dependências
node_modules/
.pnpm-store/
.yarn/cache
.yarn/install-state.gz

# Build / output
dist/
build/
out/
.next/
*.tsbuildinfo

# Ambiente (manter o .example)
.env
.env.*
!.env.example

# Logs
*.log
npm-debug.log*
yarn-error.log*
pnpm-debug.log*

# Testes / cobertura
coverage/
.nyc_output/
.vitest/

# Cache
.cache/
.parcel-cache/
.turbo/

# Sistema operacional / editores
.DS_Store
Thumbs.db
.idea/
.vscode/*
!.vscode/extensions.json

# Uploads e dados locais
uploads/
tmp/
*.sqlite
*.sqlite3
*.db

# TypeScript
*.tsbuildinfo
```

### C.2 `.gitattributes` — normalizar quebras de linha

```gitattributes
* text=auto eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.woff binary
*.woff2 binary
*.pdf binary
```

Motivo: sem isso, o mesmo arquivo pode aparecer como "modificado" em máquinas
diferentes e gerar diffs falsos.

---

## D. Entregáveis

1. `RELATORIO-AUDITORIA.md` — lista completa do que foi encontrado, com
   severidade e ação proposta.
2. Diff do `.gitignore` / `.gitattributes`.
3. Remoções de arquivos duplicados/temperados (após aprovação da lista).
4. Branch `chore/auditoria-limpeza` pronto para PR.

---

## ⚠️ Regra de segurança

Arquivos com possível **segredo** (A4/A5) e arquivos que podem conter
trabalho em andamento (A3) **não são apagados nem publicados** sem
confirmação explícita. A lista é apresentada primeiro.
