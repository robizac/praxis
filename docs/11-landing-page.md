# 11 — Landing page

## 11.1 Objetivo e métrica

- **Objetivo**: converter visitante em cadastro/assinatura do Pro.
- **Métricas**: visitas → clique em CTA → cadastro (conversão), checkout iniciado, assinatura.
- **Posicionamento**: "Transforme o que você aprende em ação prática — uma ação por vez."

## 11.2 Rotas e estrutura

| Rota | Página | Público |
|---|---|---|
| `/` | Landing | visitante |
| `/precos` | Planos (pode ser âncora da landing) | visitante |
| `/cadastro` | Criar conta | visitante |
| `/entrar` | Login | visitante |
| `/app` | Aplicação (área logada) | autenticado |
| `/app/conta` | Conta/plano/BYOK | autenticado |
| `/admin` | Administração | admin |

Recomendação: **landing estática em `/`**, app em `/app`, mesmo host/domínio
(fácil SEO + cookies de sessão compartilhados).

## 11.3 Seções da landing (nesta ordem)

1. **Header** — logo PRAXIS, âncoras (Como funciona, Planos, FAQ), botões "Entrar" e "Começar grátis".
2. **Hero** — headline, subheadline, CTA primário ("Transformar meu aprendizado") + secundário ("Ver planos"), ilustração/prova social leve.
3. **Problema** — "Você aprende muito e aplica pouco." 3 dores rápidas.
4. **Solução / Como funciona** — 3 passos com ícones:
   1. Escreva o que aprendeu.
   2. Escolha a Área da Vida.
   3. Receba ação + prazo + regra mínima.
5. **Demonstração** — mockup da tela Início (antes/depois) mostrando o JSON virando os 3 cards.
6. **Diferenciais** — limite saudável de 2 pendentes; lembretes; revisão semanal; chave de IA própria (BYOK).
7. **Casos de uso** — bullets por perfil (criador, empreendedor, estudante).
8. **Depoimentos** — 2–3 curtos (placeholder até ter reais).
9. **Planos** — Free vs Pro vs Pro Anual, com tabela de recursos e CTA `Assinar` (leva ao checkout).
10. **FAQ** — o que é, preciso saber IA?, meus dados, posso usar minha chave OpenAI?, posso cancelar?, funciona no celular?
11. **CTA final** — faixa de conversão.
12. **Footer** — Termos, Privacidade, Contato, © PRAXIS.

## 11.4 Copy (rascunho)

**Hero**
- H1: **Transforme o que você aprende em ação prática.**
- Sub: Escreva um aprendizado e receba *uma* ação simples, com prazo e uma regra mínima. Sem teoria, sem sobrecarga.
- CTA: **Começar grátis** (secundário: Ver planos)

**Problema**
- "Você consome muito conteúdo e aplica pouco."
- "Listas de tarefas infinitas travam em vez de destravar."
- "Falta ritmo para sustentar o que importa."

**Como funciona**
1. **Registre** o que aprendeu.
2. **Escolha** a Área da Vida.
3. **Execute** a ação mínima — o PRAXIS cuida do prazo e do lembrete.

**Diferenciais**
- 🎯 Foco forçado: no máximo 2 ações pendentes.
- ⏰ Prazos e lembretes que realmente chegam.
- 🔁 Revisão semanal para fechar ciclos.
- 🔑 Use sua própria chave de IA (OpenAI, Anthropic, Gemini ou Ollama).

**Prova de preço**
- Free: comece de graça.
- Pro: R$ 27/mês — 300 gerações de IA/mês, BYOK ilimitado, lembretes ampliados.

## 11.5 SEO e performance

- `<title>` e `<meta description>` por rota; `lang="pt-BR"`.
- Open Graph + Twitter Card (imagem 1200x630).
- `sitemap.xml` e `robots.txt`; canonical.
- Dados estruturados `SoftwareApplication` + `FAQPage` (rich results).
- Core Web Vitals: estático, sem JS bloqueante, imagens otimizadas (WebP/AVIF), LCP < 2,5s.
- Palavras-chave: "transformar aprendizado em ação", "produtividade com IA", "aplicar o que aprendi".

## 11.6 Stack e implementação

- **HTML/CSS estático** em `web/landing/index.html` (rápido, SEO, sem build) —
  reaproveita os tokens de [06](06-design-ux.md).
- JS mínimo para: menu mobile, smooth scroll, e disparo de checkout (`fetch` → `/api/billing/checkout`).
- Seções de preço puxam `GET /api/billing/plans` (fallback estático no HTML).
- Analytics: evento `cta_click`, `signup_start`, `checkout_start` (provider a definir).

## 11.7 Acessibilidade e mobile

- Hierarquia de headings correta (um H1), contraste AA, foco visível.
- Layout responsivo; CTA fixo no rodapé no mobile.
- Botões com texto claro (não só ícone).

## 11.8 Imagens e marca

- Logo atual: círculo com ponto central (SVG inline em `index.html`).
- Direção visual: neutra, "papel", tipografia sans; acento preto `#272727`.
- Ilustrações leves ou screenshots reais; evitar stock genérico.
