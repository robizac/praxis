---
name: proxima-tarefa
description: Descobre a próxima tarefa não concluída do roadmap do PRAXIS (docs/12-roadmap-fases.md), faz um plano curto e conduz o loop explorar → planejar → implementar → verificar → atualizar status. Use ao iniciar trabalho de uma nova fase.
---

# Próxima tarefa do roadmap

O roadmap (`docs/12-roadmap-fases.md`) é um plano, não um fluxo executável.
Esta skill transforma "a próxima tarefa" em trabalho padronizado — sempre o
**mesmo loop**, para o resultado não depender de como o pedido foi formulado.

## 1. Descobrir o estado (fonte única)

Leia o roadmap e identifique as fases **não** concluídas (as que ainda têm
`- [ ]`). Confirme com o dono do repo qual é a fase alvo, se houver dúvida.

```bash
# fases com tarefas pendentes
grep -n '^## Fase' docs/12-roadmap-fases.md
grep -n '\- \[ \]' docs/12-roadmap-fases.md
```

- **Estado atual do projeto: Fases 1–7 concluídas ✅. Fase 8 (hardening/LGPD)
  pendente e Fase 9 (lançamento) dependente dela.**
- Respeite as **dependências** da fase (campo "Dependências" no roadmap).
- Se o status divergir entre `docs/README.md`, `AGENTS.md` e o roadmap,
  **pare e reporte** a divergência antes de codar (a duplicação é conhecida).

## 2. Explorar antes de planejar

Não proponha código sem contexto. Leia o que a tarefa toca:

- o documento de `docs/` correspondente (ver tabela em `AGENTS.md`);
- os arquivos reais citados na fase (ex.: `src/http/app.js` para CSP);
- as **regras de ouro** em `AGENTS.md` e os padrões em `docs/04`.

Para dependências externas (documentação de lib, caso OWASP), use `webfetch`.

## 3. Planejar (mudança não trivial)

Apresente um plano curto **antes de implementar**: arquivos que serão tocados,
o que muda em cada um, riscos e como você vai verificar. Espere aprovação.

## 4. Implementar a menor versão correta

- Diffs mínimos, padrões existentes, nomes claros (o "Aiming the Slop Cannon"
  do curso).
- Mudou schema? Carregue a skill `nova-migracao` (@nova-migracao).
- Não misture refactor/reformatação com a lógica da tarefa.

## 5. Verificar com feedback real

Carregue a skill `validate` (@validate) — lint, formatação, testes e migrações.
Quando houver UI, use o navegador (árvore de acessibilidade + logs/network) para
produzir evidência, não suposição.

## 6. Atualizar o status (fechar o loop)

Ao concluir uma tarefa, marque-a no roadmap (`- [ ]` → `- [x]`) **no mesmo
commit** da implementação. Se a fase inteira terminou, atualize também o bloco
de status em `docs/README.md` e a seção "Estado atual" do `AGENTS.md`.

## Regras

- **Uma tarefa por vez.** Não avance para a próxima sem fechar e reportar esta.
- Pronto para publicar? A skill `pronto-para-pr` (@pronto-para-pr) compõe
  validação + revisão.
- **Não** commite, faça push nem abra PR sem o dono do repo pedir.
- "Não é bug"/"não vale a pena agora" são respostas válidas — diga quando a
  evidência não sustenta a mudança, em vez de inventar uma correção.
