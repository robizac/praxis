# PRAXIS — Documentação de Produto e Engenharia

Esta pasta é a fonte da verdade para evoluir o PRAXIS de um MVP local para um
produto SaaS multi-usuário, com controle de acesso, banco de dados gerenciado,
IA com custo controlado, landing page e pagamento via Stripe.

> Status: **Fases 1–8 concluídas** ✅. Próxima fase: lançamento (9) conforme o
> [roadmap](12-roadmap-fases.md).

## Índice

| # | Documento | Conteúdo |
|---|-----------|----------|
| 01 | [Visão geral](01-visao-geral.md) | Produto, público, proposta de valor, estado atual |
| 02 | [Mapeamento de funcionalidades](02-mapeamento-funcionalidades.md) | Tudo que o app faz hoje (arquivo, endpoint, fluxo) + lacunas |
| 03 | [Arquitetura](03-arquitetura.md) | Arquitetura alvo, módulos, camadas, deploy |
| 04 | [Padrões e convenções](04-padroes-e-convencoes.md) | Padrões de código, API, erros, git, testes |
| 05 | [Requisitos](05-requisitos.md) | Requisitos funcionais, não funcionais e critérios de aceite |
| 06 | [Design / UX](06-design-ux.md) | Personas, jornadas, telas, design tokens, acessibilidade |
| 07 | [Banco de dados](07-banco-de-dados.md) | Modelo de dados, DDL, migrações, multi-tenancy |
| 08 | [Controle de acesso](08-controle-de-acesso.md) | Autenticação, sessões, RBAC, planos/entitlements |
| 09 | [IA e custos](09-ia-e-custos.md) | BYOK, modelo gerenciado, cotas, modelo de custo |
| 10 | [Pagamentos (Stripe)](10-pagamentos-stripe.md) | Produtos, checkout, portal, webhooks, estados |
| 11 | [Landing page](11-landing-page.md) | Estrutura, seções, copy, SEO, rotas |
| 12 | [Roadmap por fases](12-roadmap-fases.md) | Fases, tarefas, entregáveis, critérios de aceite |
| 13 | [Deploy no Kymus](13-deploy-kymus.md) | Build, Docker, variáveis, jobs, checklist |
| 14 | [Segurança, LGPD e operação](14-checklist-seguranca-lgpd.md) | OWASP, direitos do titular, métricas/alertas, backup/restore |

Documentos de apoio na raiz:

- [`/README.md`](../README.md) — como rodar hoje (dev).
- [`/AGENTS.md`](../AGENTS.md) — guia de arquitetura/padrões para agentes de IA.
- [`/.env.example`](../.env.example) — todas as variáveis de ambiente (atual e planejadas).

## Decisões que precisam de aprovação

1. **Banco de produção**: Postgres gerenciado (recomendado) vs. manter SQLite.
2. **Autenticação**: e-mail + senha (recomendado) e/ou Google OAuth / magic link.
3. **Preço e limites dos planos** (ver [09](09-ia-e-custos.md) e [10](10-pagamentos-stripe.md)).
4. **Estratégia de IA**: BYOK + cota gerenciada no plano pago (recomendado).
5. **Domínio/rotas**: landing em `/` e app em `/app` no mesmo host (recomendado).
