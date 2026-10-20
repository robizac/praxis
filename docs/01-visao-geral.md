# 01 — Visão geral

## O que é o PRAXIS

PRAXIS transforma **conhecimento em ação prática**. O usuário escreve algo que
aprendeu, escolhe uma **Área da Vida** e a aplicação usa IA para devolver:

- **Ação** — o próximo passo concreto e mínimo.
- **Prazo** — quando fazer (data/hora).
- **Regra mínima** — a menor versão executável ("se travar, faça 3 minutos").

Depois o usuário acompanha o **histórico** (conclui/reabre ações), recebe
**lembretes** e faz uma **Revisão Semanal** (4 perguntas de fechamento de ciclo).

## Proposta de valor

| Para quem                           | Dor                    | PRAXIS resolve                            |
| ----------------------------------- | ---------------------- | ----------------------------------------- |
| Pessoas que consomem muito conteúdo | "Aprendo e não aplico" | Converte aprendizado em 1 ação executável |
| Pessoas com excesso de tarefas      | Paralisia / sobrecarga | Limita a 2 ações pendentes por vez        |
| Quem quer constância                | Falta de ritmo         | Prazos + lembretes + revisão semanal      |

## Público-alvo

- Adultos brasileiros (pt-BR) focados em produtividade, fé/propósito e hábitos.
- Perfil: criadores, empreendedores, estudantes, profissionais liberais.
- Uso: mobile-first, sessões curtas, volta diária/semanal.

## Âmbitos (Áreas da Vida)

Fixos hoje, definidos em `domain.js`:

`Espiritualidade`, `Identidade`, `Energia & Ritmo`, `Trabalho & Provisão`, `Relacionamento`.
Fallback: `Energia & Ritmo`.

## Estado atual (MVP)

- **Stack**: Node.js 18+, Express 4, SQLite (`sqlite3`), `node-cron`, `dotenv`,
  `node-fetch`. Front-end: SPA vanilla em um único `index.html` (hash routing) servido por `express.static`.
- **IA**: dois providers — `ollama` (local, padrão em dev) e `openai`
  (forçado em `NODE_ENV=production`). Prompt único que devolve JSON validado por schema.
- **Dados**: `praxis_items` e `reminders` no SQLite local (`praxis.db`);
  revisões semanais em arquivo (`weekly_reviews.json`).
- **Sem autenticação**: os dados são globais e abertos; não há usuários.
- **Sem cobrança**: nenhum controle de plano ou pagamento.

## O que falta para virar produto

1. **Controle de acesso** e multi-usuário (hoje os dados são compartilhados).
2. **Banco gerenciado** (hoje arquivo local por instância).
3. **Custo de IA previsível** (hoje usa chave do dono, sem cota).
4. **Monetização** (Stripe) e **entitlements** por plano.
5. **Landing page** para aquisição.
6. **Infra resiliente** (lembretes não podem depender do processo web).

A evolução está descrita em [03-arquitetura](03-arquitetura.md),
[05-requisitos](05-requisitos.md) e [12-roadmap-fases](12-roadmap-fases.md).
