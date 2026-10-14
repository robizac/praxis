'use strict';

const repo = require('../repositories/reviews.repo');
const { BadRequestError } = require('../domain');

const REQUIRED_FIELDS = ['executei', 'trouxe_paz', 'gerou_peso', 'deve_sair'];

async function list(userId) {
  return repo.list(userId);
}

async function create(userId, body) {
  const respostas = body?.respostas || {};
  const payload = {
    respostas: {
      executei: String(respostas.executei || '').trim(),
      trouxe_paz: String(respostas.trouxe_paz || '').trim(),
      gerou_peso: String(respostas.gerou_peso || '').trim(),
      deve_sair: String(respostas.deve_sair || '').trim()
    }
  };

  const missing = REQUIRED_FIELDS.some((field) => !payload.respostas[field]);
  if (missing) {
    throw new BadRequestError('Preencha as 4 respostas da revisão semanal.');
  }

  return repo.create(userId, payload);
}

module.exports = { list, create };
