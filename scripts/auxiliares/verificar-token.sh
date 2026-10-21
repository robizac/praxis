#!/bin/sh
# Verifica se um token do GitHub tem acesso a um repositório.
# Uso: sh verificar-token.sh <TOKEN> [owner/repo]
TOKEN="$1"
REPO="${2:-robizac/praxis}"

if [ -z "$TOKEN" ]; then
  echo "Uso: sh verificar-token.sh <TOKEN> [owner/repo]"
  exit 1
fi

AUTH="Authorization: Bearer $TOKEN"

echo "== identidade do token =="
curl -s -H "$AUTH" -H "Accept: application/vnd.github+json" https://api.github.com/user \
  | grep -E '"login"|"message"'

echo
echo "== acesso a $REPO =="
curl -s -o /tmp/_repo.json -w "HTTP %{http_code}\n" \
  -H "$AUTH" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO"

if [ "$(grep -c '"full_name"' /tmp/_repo.json)" -gt 0 ]; then
  echo "OK: token tem acesso ao repo."
  grep -E '"full_name"|"default_branch"|"private"' /tmp/_repo.json
else
  echo "FALHA: token SEM acesso ao repo (404)."
  echo "-> Edite o token em github.com/settings/personal-access-tokens"
  echo "-> Repository access: All repositories (ou marque $REPO)"
  echo "-> Permissions > Contents: Read and write"
fi
rm -f /tmp/_repo.json
