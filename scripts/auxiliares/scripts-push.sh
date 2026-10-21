#!/bin/sh
# Sobe as três branches de correção para o GitHub e abre os PRs.
#
# Uso:
#   export GITHUB_TOKEN=ghp_xxx      # PAT clássico com escopo `repo` (ou `public_repo`)
#   sh /root/projeto/praxis/scripts-push.sh
#
# Branches:
#   fix/rotas-entrar-cadastro  → corrige o 404 de /entrar e /cadastro
#   chore/auditoria-limpeza    → ignores, gitattributes, deps, datas pt-BR
#   fix/ia-producao-502        → provider de IA responde 503, não 502
#
# Requer `gh` autenticado (gh auth login) para abrir os PRs; sem ele, apenas
# faz o push.

set -e

REPO="robizac/praxis"
BRANCHES="fix/rotas-entrar-cadastro chore/auditoria-limpeza fix/ia-producao-502"

cd "$(dirname "$0")/.." || exit 1

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Defina GITHUB_TOKEN antes (PAT com escopo 'repo' ou 'public_repo')."
  exit 1
fi

ASKPASS="$(mktemp)"
cat > "$ASKPASS" <<'EOF'
#!/bin/sh
case "$1" in
  *sername*) echo "x-access-token" ;;
  *) echo "$GITHUB_TOKEN" ;;
esac
EOF
chmod +x "$ASKPASS"
export GIT_ASKPASS="$ASKPASS"
export GIT_TERMINAL_PROMPT=0
export GIT_AUTHOR_NAME="OpenCode Agent"
export GIT_AUTHOR_EMAIL="agent@opencode.local"
export GIT_COMMITTER_NAME="OpenCode Agent"
export GIT_COMMITTER_EMAIL="agent@opencode.local"

echo "== push das branches =="
for b in $BRANCHES; do
  git checkout -q "$b" || exit 1
  echo "-- $b"
  git push -u origin "$b" || exit 1
done

git checkout -q main
git fetch -q origin

echo
echo "== PRs =="
if command -v gh >/dev/null 2>&1; then
  gh pr create --repo "$REPO" --base main --head fix/rotas-entrar-cadastro \
    --title "fix(landing): cria as rotas /entrar e /cadastro e abre a aba correta" \
    --body "Os links /entrar e /cadastro da landing caíam no catch-all 404 (\"Rota não encontrada.\"), quebrando todos os CTAs de \"Entrar\" e \"Começar grátis\". O commit e537ec4 apontava tudo para /app, o que resolve o 404 mas manda \"Começar grátis\" para a tela de login e perde a URL pública já divulgada em marketing.

- server: registra GET /entrar e GET /cadastro servindo a SPA
- app: escolhe a aba inicial pela URL e respeita ?plan=pro|pro_annual
- landing: volta a linkar /entrar e /cadastro
- landing/app: favicon.svg + <link rel=\"icon\">
- server: sitemap.xml dinâmico a partir do APP_URL (o estático apontava para dash.kymus.app/hosting/)
- env: avisa no boot quando APP_URL não é uma URL pública em produção
- smoke + test: cobrem /entrar, /cadastro e \"nenhum link público em 404\"" || echo "falha ao abrir PR"

  gh pr create --repo "$REPO" --base main --head chore/auditoria-limpeza \
    --title "chore(repo): auditoria de limpeza — ignores, gitattributes, deps e datas pt-BR" \
    --body "Auditoria do repositório: branches limpas, fsck ok, sem segredos, sem dead code, sem require quebrado.

- formatPtBr sem depender do ICU (em build small-icu saía \"12/25/2026\" em en-US e o app não conseguia ler a própria data)
- deps: node-cron 4, overrides de tar/@tootallnate/once, nodemon removido (node --watch). npm audit: 12 (1 crítica) -> 0
- .gitignore completo, .gitattributes novo, weekly_reviews.json fora do índice
- README/AGENTS ajustados" || echo "falha ao abrir PR"

  gh pr create --repo "$REPO" --base main --head fix/ia-producao-502 \
    --title "fix(ia): provider de IA responde 503 com o status do provider, não 502" \
    --body "Em produção, POST /api/praxis devolvia 502 e o usuário via apenas a página genérica do Cloudflare, sem nenhuma dica do que fazer.

- ProviderError: 502 -> 503 (o corpo passa intacto até o usuário)
- openai: traduz 401/403/404/429 em mensagem acionável e inclui providerStatus
- health: expõe provider/managedKeyConfigured/defaultModel (sem vazar a chave)
- docs/09: contrato de erro do provider" || echo "falha ao abrir PR"
else
  echo "gh não encontrado: branches enviadas, abra os PRs pela UI."
fi

rm -f "$ASKPASS"
echo
echo "== pronto =="
