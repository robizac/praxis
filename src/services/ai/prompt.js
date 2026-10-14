'use strict';

const { AREAS } = require('../../domain');

const PRAXIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string', enum: AREAS },
    acao: { type: 'string' },
    prazo: { type: 'string' },
    regra_minima: { type: 'string' }
  },
  required: ['area', 'acao', 'prazo', 'regra_minima']
};

function buildPrompt(input, selectedArea) {
  return `
Você é o PRAXIS.
Transforme o aprendizado abaixo em execução prática mínima, sem teoria.

Aprendizado:
"${input}"

Área da Vida escolhida pelo usuário (obrigatória e prioritária):
"${selectedArea}"

Regras:
- Responda em português.
- Use exatamente a área escolhida pelo usuário em "area".
- Retorne APENAS JSON, sem texto extra, markdown ou explicações.
- Siga exatamente este schema:
${JSON.stringify(PRAXIS_JSON_SCHEMA)}
`;
}

module.exports = { PRAXIS_JSON_SCHEMA, buildPrompt };
