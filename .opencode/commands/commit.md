---
description: Revisa o diff, commita as mudanças do PRAXIS com a mensagem informada e faz rebase sobre main
---

Prepare a commit for the PRAXIS repository. The commit message is: $ARGUMENTS

Follow this checklist exactly:

1. Run `git status --short` and `git diff` (and `git diff --staged`). Show me the
   changes and call out anything suspicious: secrets, `.env`, `praxis.db`, debug
   leftovers, or changes unrelated to the message.
2. If you see anything that should not be committed (`.env`, `praxis.db`,
   `.data/`, credentials), stop and tell me before staging.
3. Stage the intended changes with `git add` (do not use `git add -A` blindly).
4. Commit with the message: $ARGUMENTS
   - Use a short, single-sentence Conventional Commits message unless I gave you
     a longer one.
   - If there are sloppy "wip"/"fixup" commits in `git log`, mention them (ask
     before squashing).
5. Run `git pull --rebase origin main`.
6. Show the resulting commit (`git show --stat HEAD`) and the rebase output.

Rules:

- Never push to `main`.
- Never create a pull request here.
- If the working tree is clean, say so and do nothing.
