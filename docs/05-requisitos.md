# 05 — Requisitos

Especificação do produto-alvo. IDs são referências estáveis para tarefas e testes.

## 5.1 Requisitos funcionais

### Conta e acesso

| ID    | Requisito                                                                   | Prioridade |
| ----- | --------------------------------------------------------------------------- | ---------- |
| RF-01 | Cadastro por e-mail + senha (nome, e-mail, senha) com verificação de e-mail | Must       |
| RF-02 | Login/logout com sessão persistente em cookie httpOnly                      | Must       |
| RF-03 | Recuperação de senha por e-mail (token de uso único, expira em 1h)          | Must       |
| RF-04 | Login social com Google (OAuth 2.0)                                         | Should     |
| RF-05 | Usuário edita perfil (nome, fuso horário) e troca senha                     | Should     |
| RF-06 | Exclusão de conta (LGPD) com remoção/anonimização dos dados                 | Must       |
| RF-07 | Consentimento de termos/privacidade no cadastro                             | Must       |

### Aplicação PRAXIS

| ID    | Requisito                                                                     | Prioridade |
| ----- | ----------------------------------------------------------------------------- | ---------- |
| RF-10 | Gerar ação (IA) a partir de aprendizado + Área da Vida                        | Must       |
| RF-11 | Limite de 2 ações pendentes (regra atual preservada)                          | Must       |
| RF-12 | Histórico paginado com filtros (área, status, busca, ordenação) — server-side | Must       |
| RF-13 | Concluir/reabrir ação                                                         | Must       |
| RF-14 | Editar área e tags de uma ação                                                | Should     |
| RF-15 | Excluir ação (com confirmação)                                                | Should     |
| RF-16 | Próximos prazos (24h / 7d)                                                    | Should     |
| RF-17 | Revisão Semanal (4 respostas) persistida em banco                             | Must       |
| RF-18 | Dashboard/resumo: pendentes, feitas na semana, sequência (streak)             | Should     |

### IA e custos

| ID    | Requisito                                                              | Prioridade |
| ----- | ---------------------------------------------------------------------- | ---------- |
| RF-20 | Motor de IA com provider gerenciado (default)                          | Must       |
| RF-21 | Cota mensal de gerações por plano, com contagem e bloqueio             | Must       |
| RF-22 | BYOK: usuário conecta a própria chave (OpenAI/Anthropic/Gemini/Ollama) | Must       |
| RF-23 | Chaves BYOK cifradas em repouso; exibidas apenas mascaradas            | Must       |
| RF-24 | Com BYOK ativo, geração não consome cota gerenciada                    | Must       |
| RF-25 | Fallback seguro quando a IA falha (mantém `buildSafeFallback`)         | Must       |
| RF-26 | Registro de uso (tokens, custo estimado, provider) por geração         | Should     |

### Lembretes e notificações

| ID    | Requisito                                                            | Prioridade |
| ----- | -------------------------------------------------------------------- | ---------- |
| RF-30 | Criar lembrete (data/hora + canal: e-mail, Telegram, navegador)      | Must       |
| RF-31 | Envio confiável por worker, com retentativa e registro de envio      | Must       |
| RF-32 | Lembrete por e-mail (provider transacional)                          | Should     |
| RF-33 | Vincular Telegram por código de pareamento (por usuário, não global) | Should     |

### Monetização

| ID    | Requisito                                                        | Prioridade |
| ----- | ---------------------------------------------------------------- | ---------- |
| RF-40 | Landing page pública com planos e CTA de assinatura              | Must       |
| RF-41 | Checkout Stripe (assinatura mensal/anual)                        | Must       |
| RF-42 | Portal do cliente Stripe (trocar plano, cartão, cancelar)        | Must       |
| RF-43 | Webhooks Stripe sincronizam status da assinatura                 | Must       |
| RF-44 | Entitlements aplicados ao app (ex.: cota de IA, nº de lembretes) | Must       |
| RF-45 | Período de teste de 7 dias no plano Pro                          | Should     |
| RF-46 | Enforce imediato ao cancelar/expirar (rebaixa para Free)         | Must       |
| RF-47 | Notificações de cobrança (falha, renovação) por e-mail           | Should     |

### Administração

| ID    | Requisito                                                     | Prioridade |
| ----- | ------------------------------------------------------------- | ---------- |
| RF-50 | Painel admin: usuários, assinaturas, uso de IA, receita (MRR) | Should     |
| RF-51 | Impersonar usuário para suporte (com auditoria)               | Could      |
| RF-52 | Log de auditoria de ações sensíveis                           | Should     |

## 5.2 Requisitos não funcionais

| ID     | Requisito          | Meta                                                |
| ------ | ------------------ | --------------------------------------------------- |
| RNF-01 | Performance de API | p95 < 300ms (exceto IA)                             |
| RNF-02 | Geração de IA      | p95 < 6s; timeout 20s com erro amigável             |
| RNF-03 | Disponibilidade    | 99.5%/mês                                           |
| RNF-04 | Escalabilidade     | escala horizontal do web; worker dedicado           |
| RNF-05 | Segurança          | OWASP Top 10; senhas Argon2id; TLS obrigatório      |
| RNF-06 | Privacidade        | LGPD: consentimento, exportação e exclusão de dados |
| RNF-07 | Custo de IA        | Custo médio por usuário < 15% da receita do plano   |
| RNF-08 | Observabilidade    | logs estruturados, health/ready, alertas            |
| RNF-09 | Backup             | Postgres com backup diário + retenção 7 dias        |
| RNF-10 | Acessibilidade     | WCAG 2.1 AA (contraste, teclado, labels)            |
| RNF-11 | i18n               | pt-BR agora; estrutura pronta para en/es            |
| RNF-12 | Compatibilidade    | últimos 2 anos de navegadores mobile/desktop        |
| RNF-13 | Testes             | domínio >= 90%, serviços >= 70%                     |

## 5.3 Personas e histórias de usuário

**Persona A — "Ana, a aplicadora"** (usuária final, Free→Pro)

> Como Ana, quero registrar um aprendizado e receber uma única ação concreta,
> para não me perder em teoria.

Aceite:

- Dado que estou logada e tenho < 2 pendentes, quando envio um aprendizado
  com área válida, então recebo ação, prazo e regra mínima em < 6s.
- Dado que tenho 2 pendentes, quando tento gerar, então vejo a mensagem de
  limite e o botão fica desabilitado.

**Persona B — "Bruno, o power user"** (BYOK)

> Como Bruno, quero usar minha própria chave da OpenAI, para controlar custo e modelo.

Aceite:

- Posso salvar/atualizar/remover minha chave; ela aparece mascarada.
- Com BYOK ativo, minhas gerações ignoram a cota gerenciada.
- Se minha chave falhar, recebo erro claro e posso voltar ao modo gerenciado.

**Persona C — "Carla, assinante"**

> Quero assinar o Pro, gerenciar meu cartão e cancelar sem falar com suporte.

Aceite:

- Checkout em poucos cliques; volta ao app com plano ativo.
- Portal do Stripe permite trocar cartão/plano e cancelar.
- Ao cancelar, mantenho acesso até o fim do período e depois volto ao Free.

**Persona D — "Diego, operador/admin"**

> Quero ver uso, assinaturas e receita para operar o negócio.

Aceite:

- Vejo lista de usuários, plano, status de assinatura e uso de IA do mês.
- Vejo MRR/assinaturas ativas.

## 5.4 Regras de negócio (referência)

- **RN-01** Limite de 2 pendentes por usuário (não global).
- **RN-02** Área escolhida pelo usuário prevalece sobre a da IA.
- **RN-03** Prazo sempre em data/hora; fallback amanhã 20:00 (fuso do usuário).
- **RN-04** Cota de IA reseta no ciclo da assinatura (ou mensal no Free).
- **RN-05** BYOK não consome cota gerenciada.
- **RN-06** Cancelamento: acesso até `current_period_end`; depois Free.
- **RN-07** Uma conta = um registro; e-mail único e verificado.

## 5.5 Fora de escopo (v1)

- App mobile nativo (será PWA).
- Colaboração/equipes e compartilhamento.
- Gamificação avançada, integrações Google Calendar (avaliar depois).
- Múltiplos idiomas (somente pt-BR na v1).
