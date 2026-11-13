'use strict';

const { AREAS } = require('../../domain');

const PRAXIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          area: { type: 'string', enum: AREAS },
          acao: { type: 'string' },
          prazo: { type: 'string' },
          regra_minima: { type: 'string' }
        },
        required: ['area', 'acao', 'prazo', 'regra_minima']
      }
    }
  },
  required: ['tasks']
};

function buildPrompt(input, _selectedArea) {
  return `
Você é o PRAXIS.
Transforme o que a pessoa quer aprender abaixo em um passo a passo prático de tarefas, sem teoria.

O que a pessoa quer aprender:
"${input}"

Regras:
- Responda em português.
- Gere de 3 a 6 tarefas (apenas as necessárias para concluir o objetivo).
- Para cada tarefa, escolha a "area" mais adequada dentre: ${AREAS.join(', ')}.
- Cada tarefa deve ter uma ação concreta, um prazo e uma regra mínima.
- Retorne APENAS JSON, sem texto extra, markdown ou explicações.
- Siga exatamente este schema:
${JSON.stringify(PRAXIS_JSON_SCHEMA)}
`;
}

module.exports = { PRAXIS_JSON_SCHEMA, buildPrompt };
