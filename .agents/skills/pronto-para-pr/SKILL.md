---
name: pronto-para-pr
description: Prepara um PR no PRAXIS — roda a validação completa e pede uma revisão cética ao subagente reviewer, em ordem. Use quando a mudança estiver "quase pronta".
---

# Pronto para PR (skill composta)

Este é um fluxo de alto nível que **compõe** duas peças já existentes. Não
duplique o conteúdo delas — carregue-as.

## Passos

1. **Validação** — carregue e execute a skill `validate` (@validate).
   Se qualquer check falhar, **pare aqui** e reporte os bloqueios.

2. **Revisão cética** — peça ao subagente `reviewer` para revisar o diff
   (working tree ou `<base>...HEAD`). Peça achados por severidade, com
   `arquivo:linha`, e um veredito.

3. **Síntese** — liste:
   - estado da validação (`lint`/`format`/`test`/`migrações`);
   - achados do revisor que **realmente** bloqueiam (separe teórico de real);
   - o que falta mudar antes do merge.

## Regras

- **Não** commite, faça push nem abra PR (o dono do repo faz isso).
- Não "conserte" os achados do revisor sem confirmação.
- Se a validação já quebrou, a revisão é secundária: reporte a falha primeiro.
