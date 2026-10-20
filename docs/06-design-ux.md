# 06 — Design / UX

## 6.1 Princípios de design

1. **Uma decisão por tela** — reduzir carga cognitiva (o produto é sobre foco).
2. **Ação acima de tudo** — o CTA "Transformar em Ação" é sempre o elemento dominante.
3. **Calma visual** — paleta neutra, muito espaço em branco, tipografia legível.
4. **Mobile-first** — uso principal no celular, em pé e com pressa.
5. **Feedback imediato** — estados de carregando/vazio/erro/sucesso sempre visíveis.

## 6.2 Jornada do usuário (funil)

```
Landing (/)                      App (/app)
┌───────────────┐   Ver planos   ┌──────────────┐   Gerar ação   ┌──────────────┐
│ Descobre       │ ─────────────▶ │ Cadastro/     │ ─────────────▶ │ Início        │
│ valor + preço  │   Assinar      │ Login         │                │ Histórico     │
└───────────────┘                └──────────────┘                │ Revisão       │
        ▲                                  │                     └──────┬───────┘
        │           Concluir ação / atingir cota ───────────────────────┘
        └──────────────────────  Upgrade para Pro (Stripe)  ◀─────────────
```

## 6.3 Telas

### T1 — Landing page (pública, `/`)

Seções e objetivo em [11-landing-page.md](11-landing-page.md).

### T2 — Cadastro (`/cadastro`)

- Campos: nome, e-mail, senha (+ medidor de força), aceite de termos.
- Alternativa: "Continuar com Google".
- Link para "Já tenho conta".

### T3 — Login (`/entrar`)

- E-mail + senha, "esqueci minha senha", link para cadastro.

### T4 — Início (`/app`, aba Início)

- Label + textarea "O que você aprendeu?".
- Select "Área da Vida".
- Botão "Transformar em Ação" (desabilita com 2 pendentes + aviso).
- Cards de resultado: Ação / Prazo / Regra mínima.
- Indicador de cota: "X de Y gerações neste mês" (Pro).

### T5 — Histórico (`/app`, aba Histórico)

- Filtros: Área, Status, busca, ordenação.
- Cards com badges (área/status), ação, prazo, criado em; botão Concluir/Reabrir.
- Ações secundárias: editar tags, excluir.

### T6 — Revisão Semanal (`/app`, aba Revisão)

- 4 textareas (executei / trouxe paz / gerou peso / deve sair).
- Botão Salvar; lista colapsável das últimas revisões.

### T7 — Conta / Plano (`/app/conta`)

- Perfil (nome, fuso), trocar senha, excluir conta.
- Plano atual, uso do mês, botões "Assinar Pro" / "Gerenciar assinatura" (Portal Stripe).
- Chaves de IA (BYOK): conectar/remover, com aviso de segurança.

### T8 — Admin (`/admin`, papel `admin`)

- Usuários (plano, status, uso), assinaturas, MRR.

## 6.4 Wireframes de baixa fidelidade

**Início (mobile)**

```
┌────────────────────────────┐
│ ● PRAXIS        [Início ▾] │
│                            │
│ O que você aprendeu?       │
│ ┌────────────────────────┐ │
│ │                        │ │
│ └────────────────────────┘ │
│ Área da Vida               │
│ [ Energia & Ritmo      ▾ ] │
│ ┌────────────────────────┐ │
│ │  Transformar em Ação   │ │
│ └────────────────────────┘ │
│ ⓘ 2 pendentes            │
│ ┌─ Ação ─────────────────┐ │
│ │ Revisar e-mail 10 min  │ │
│ └────────────────────────┘ │
│ ┌─ Prazo ────────────────┐ │
│ │ 14/10 20:00            │ │
│ └────────────────────────┘ │
│ ┌─ Regra mínima ─────────┐ │
│ │ Se travar, faça 3 min  │ │
│ └────────────────────────┘ │
└────────────────────────────┘
```

**Paywall de cota (Pro)**

```
┌────────────────────────────┐
│  Você usou 300/300          │
│  gerações neste mês.        │
│  ┌──────────────────────┐   │
│  │  Fazer upgrade / BYOK │   │
│  └──────────────────────┘   │
└────────────────────────────┘
```

## 6.5 Design tokens (base atual → evolução)

A SPA atual já usa variáveis CSS. Consolidar:

```css
:root {
  /* cores */
  --bg: #f7f7f5;
  --surface: #ffffff;
  --text: #1f1f1f;
  --muted: #6b6b6b;
  --border: #e5e5e5;
  --accent: #272727;
  --accent-contrast: #ffffff;
  --success: #1f7a45;
  --warning: #9a6b00;
  --danger: #b3261e;
  --info: #2b5f9e;

  /* tipografia */
  --font-sans: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --fs-h1: 1.5rem;
  --fs-h2: 1.25rem;
  --fs-body: 1rem;
  --fs-sm: 0.9rem;
  --fs-xs: 0.77rem;

  /* espaçamento (escala 4px) */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;

  /* forma */
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 999px;

  /* sombra */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-2: 0 4px 16px rgba(0, 0, 0, 0.08);
}
```

- **Modo escuro**: opcional v1.1, via `prefers-color-scheme` + tokens.
- **Contraste**: texto normal >= 4.5:1; reaproveitar `--muted` sobre `--surface`.
- **Toque**: alvos >= 44x44px; botões com `padding` generoso.

## 6.6 Componentes reutilizáveis

| Componente                          | Uso                                 |
| ----------------------------------- | ----------------------------------- |
| `Button` (primary/secondary/danger) | CTAs e ações                        |
| `Card`                              | Resultado, item de histórico, seção |
| `Badge`                             | Área e status                       |
| `Notice`                            | Avisos/erros inline                 |
| `Dialog`                            | Confirmação de exclusão, paywall    |
| `Field` (label+input+erro)          | Formulários                         |
| `Meter`                             | Cota de IA                          |
| `Skeleton`                          | Carregamento de listas              |

## 6.7 Acessibilidade

- Navegação por teclado completa; foco visível.
- `aria-live="polite"` em avisos e resultados.
- Labels associados (`for`/`id`), mensagens de erro com `aria-describedby`.
- Não depender só de cor para status (usar texto/ícone).
- Contraste AA; textos ampliáveis a 200% sem quebra.

## 6.8 Microcopy (exemplos)

| Contexto         | Texto                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| Botão principal  | "Transformar em Ação"                                                   |
| Limite pendentes | "Você já tem 2 ações pendentes. Conclua 1 para gerar outra."            |
| Erro IA          | "Não entendi a resposta da IA — gere novamente."                        |
| Cota esgotada    | "Você usou o plano deste mês. Faça upgrade ou conecte sua chave de IA." |
| Sucesso revisão  | "Revisão salva. Fechou o ciclo com clareza."                            |
