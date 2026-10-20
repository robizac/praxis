# Guia OpenCode — resumo do curso (Boot.dev "AI Coding")

Resumo prático para aplicar em **qualquer projeto**. A ideia não é decorar
features, e sim saber *por que* cada peça existe e quando usar cada uma.

## O modelo mental

Um agente de código é: **modelo + harness (OpenCode) + o seu projeto**.
Você ganha alavancagem configurando o ambiente e o loop de feedback — não
escrevendo prompts cada vez mais longos.

Três perguntas que resolvem quase tudo:

1. **Precisa em toda sessão?** → `AGENTS.md`.
2. **Reusa com frequência, mas não em toda sessão?** → **skill**.
3. **É um modo de operação com permissões próprias?** → **agent**.
4. **É código com entradas/saídas definidas?** → **tool** (via **plugin**).

---

## Checklist para um projeto novo

Marque na ordem. Nada disso é obrigatório de uma vez; faça o que o projeto pede.

### 1. Base
- [ ] `opencode.jsonc` com o **modelo** escolhido.
- [ ] `permissions` **seguro por padrão**: o que não estiver liberado, pede permissão.
      **Ordem importa**: a última regra que casa vence →
      *allows amplos primeiro, denials específicos por último*.
- [ ] **Negar leitura de segredos** (nem todo segredo está em `.env`!):
      `.env*`, `.data/**`, `*.secrets.json`, arquivos de credencial.
- [ ] `.gitignore` cobrindo banco de dev, `node_modules`, `.data/`, `logs/`.

### 2. Instruções (`AGENTS.md`)
- [ ] **Regras de ouro** do projeto (as 3–6 invariantes que quebram o sistema se ignoradas).
- [ ] **Comandos** reais (test, lint, migrate, run) — copiáveis.
- [ ] **Arquitetura** em uma tela; **convenções** de nome/estilo.
- [ ] Exemplos **bom vs ruim** (o "ruim" ensina mais que o "bom").
- [ ] Nível **aninhado** para subsistemas com regra própria (ex.: `src/repositories/AGENTS.md`).
- [ ] `~/.config/opencode/AGENTS.md` **global** com preferências suas
      (git, idioma, PRs no fim, etc.) — fora do repositório.
- [ ] README é para **humanos**; AGENTS é para **agentes**. Não duplique.

### 3. Loop de feedback (o mais importante)
- [ ] **Formatter** (Prettier/oxfmt) configurado para o estilo **já existente**.
- [ ] **Linter** (oxlint/eslint) focado em `correctness`; barulho vira ruído.
- [ ] Rodar formatação **por último**, separada de mudança de lógica.
      Reformatar o repo antigo é um **commit dedicado**, não misturado.
- [ ] **Testes** como contrato principal; **todo bug corrigido ganha teste de regressão**
      na **borda** que expôs o bug.
- [ ] Lint/test no **CI**.

### 4. Verificação como parte do fluxo
- [ ] Subagente **`reviewer`** read-only, com as regras do projeto.
      Peça achados por severidade com `arquivo:linha` e um veredito.
- [ ] Para UI: **browser automation** (accessibility tree para clicar,
      screenshot para julgar o render, network/console para a evidência crua).
- [ ] Prefira **estrutura** (snapshot semântico) a **pixels** para operar;
      use imagem só para julgar o resultado.

### 5. Reuso
- [ ] **Skills** para fluxos repetíveis: `validate` (lint/format/test),
      migração, deploy. Pequenas e focadas ("faça uma coisa bem").
- [ ] Uma skill **composta** pode *referenciar* outras em vez de duplicar.
- [ ] **Commands** (`/nome`) para atalhos que **você** dispara, com `$ARGUMENTS`.
- [ ] Permissões de skill: `allow` default, `ask` para as consequentes.

### 6. Extensões
- [ ] **MCP** só quando houver dados/serviço externo real. Cada server paga
      contexto — mantenha pouquíssimos. `disabled: true` para desligar sem apagar.
- [ ] **Plugins** para comportamento do harness: **hooks** (interceptam operações
      vivas) vs **transforms** (mudam definições). Introduza tool custom via plugin.

---

## Skills × Tools × Agents × Commands × MCP × Plugins

| Peça | O que é | Quando usar |
|---|---|---|
| **AGENTS.md** | Instruções sempre presentes | Regra que vale em toda sessão |
| **Skill** | Prompt reutilizável (com assets opcionais) | Reusa muito, mas não sempre; `@nome` |
| **Command** | Atalho do usuário no TUI | Você dispara: `/nome`, `$ARGUMENTS` |
| **Agent** | Modo de operação (tools+permissões) | Papel próprio (ex.: `reviewer` read-only) |
| **Tool** | Código com input/output definidos | Ação estruturada e repetível |
| **MCP** | Provider externo de tools | Integração com serviço/dado de fora |
| **Plugin** | Extensão do harness | Hooks, transforms, registrar agents/skills/tools |

Regra de bolso (do menor ao maior): **tool → skill → agent → plugin**.

---

## Como trabalhar (workflow)

1. **Explorar** o código, as restrições e a documentação. Contexto ruim → plano ruim.
   Explore também **fora** do código (webfetch).
2. **Planejar** quando não for trivial (use o modo Plan).
3. **Implementar** a menor versão correta.
4. **Verificar** com **feedback real** (teste, log, repro, browser).

### Evidência, não chute
Para depurar, empurre o agente para **evidência concreta**:
traces, logs estruturados, teste que falha, script de repro, payload real.
**Proíba patch especulativo.** Antes de mudar comportamento: hipótese →
instrumentação temporária → reproduzir → apontar a evidência que confirma a causa.
("Não parece bug" também é resposta válida — se a evidência mostra que o código
não pode produzir o problema, **não invente a correção**.)

### Incremental
Quebre mudanças grandes em passos pequenos. Ex.: primeiro **parser**, depois
**executor**. Contexto não é infinito; mudanças menores são mais fáceis de
corrigir quando o agente se desvia.

### Múltiplos agentes
- Use **git worktree** para dar a cada agente seu **próprio diretório** (mesmo
  repositório/histórico) — evita que pisem no trabalho um do outro.
- Subagentes dão **isolamento de contexto** de graça: o trabalho sujo deles não
  polui a sua sessão principal.

### Contexto e custo
- **Sessão nova** (`/new`) = decisão **sua**, no **corte de tarefa** (não de tamanho).
- **Compactação automática** roda sozinha perto do limite (mesma sessão, lossy).
- **Subagentes** isolam trabalho pesado automaticamente.

---

## Accountability (a parte que é sua, não do agente)

- O valor não é o número de linhas geradas — é **entender**, **proteger**,
  **julgar** e **assumir responsabilidade** pelo que você entrega.
- "O agente escreveu" **não** é desculpa. É uma desculpa pior que "eu escrevi".
- Exija **diffs mínimos**, **padrões existentes**, **nomes claros**.
- **Sempre revise.** Entenda a arquitetura; às vezes terá de forçar outro caminho.
- Faça **commits de refactor dedicados**.

---

## Mantenha-se atualizado

- Cada modelo novo pode tornar parte do seu setup **obsoleta**.
  Revise `AGENTS.md`/skills/tools a cada modelo: **remova mais prompting do que adiciona**.
- Harnesses mudam: o que hoje é plugin pode virar feature (e vice-versa).
  Customize o **mínimo** possível.
