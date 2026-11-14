'use strict';

const entriesRepo = require('../repositories/entries.repo');
const { BadRequestError, NotFoundError } = require('../domain');

async function create(userId, content) {
  const text = String(content || '').trim();
  if (!text) {
    throw new BadRequestError('Conteúdo da entrada é obrigatório.');
  }
  const id = await entriesRepo.create(userId, text);
  const rows = await entriesRepo.listByUser(userId, 1);
  return (
    rows.find((r) => r.id === id) || { id, content: text, created_at: new Date().toISOString() }
  );
}

async function list(userId) {
  return entriesRepo.listByUser(userId);
}

async function remove(userId, id) {
  const changes = await entriesRepo.deleteById(userId, id);
  if (!changes) throw new NotFoundError('Entrada não encontrada.');
  return { ok: true };
}

module.exports = { create, list, remove };
