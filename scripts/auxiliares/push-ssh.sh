#!/bin/sh
# Sobe as 3 branches de correção via SSH e monta os links de abertura de PR.
#
# Pré-requisito: a chave pública /root/.ssh/id_ed25519_praxis.pub adicionada em
# https://github.com/settings/keys
#
# Uso: sh /root/projeto/push-ssh.sh

set -e

REPO="robizac/praxis"
BRANCHES="fix/rotas-entrar-cadastro chore/auditoria-limpeza fix/ia-producao-502"

cd /root/projeto/praxis

export GIT_SSH_COMMAND="ssh -i /root/.ssh/id_ed25519_praxis -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

echo "== testando a chave no GitHub =="
if ! ssh -i /root/.ssh/id_ed25519_praxis -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
  echo "ERRO: a chave ainda não foi adicionada em https://github.com/settings/keys"
  exit 1
fi
echo "chave OK"
echo

if git remote get-url origin | grep -q '^https://'; then
  git remote set-url origin "git@github.com:$REPO.git"
  echo "remote trocado para SSH: $(git remote get-url origin)"
fi
echo

echo "== push das branches =="
for b in $BRANCHES; do
  git checkout -q "$b"
  echo "-- $b"
  git push -u origin "$b"
done

git checkout -q main
echo
echo "== abra os PRs nestes links (1 clique em \"Create pull request\") =="
echo "https://github.com/$REPO/compare/main...fix/rotas-entrar-cadastro?expand=1"
echo "https://github.com/$REPO/compare/main...chore/auditoria-limpeza?expand=1"
echo "https://github.com/$REPO/compare/main...fix/ia-producao-502?expand=1"
echo
echo "== pronto =="
