'use strict';

const express = require('express');
const praxisService = require('../../services/praxisService');
const { BadRequestError, NotFoundError } = require('../../domain');

const router = express.Router();

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id)) {
    throw new BadRequestError('ID inválido.');
  }
  return id;
}

router.get('/history', async (req, res, next) => {
  try {
    res.json(await praxisService.listHistory(req.user.id, 100));
  } catch (error) {
    next(error);
  }
});

router.patch('/history/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    res.json(await praxisService.update(req.user.id, id, req.body || {}));
  } catch (error) {
    next(error);
  }
});

router.delete('/history/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const ok = await praxisService.remove(req.user.id, id);
    if (!ok) {
      throw new NotFoundError('Item não encontrado.');
    }
    res.json({ ok: true, id });
  } catch (error) {
    next(error);
  }
});

router.get('/upcoming', async (req, res, next) => {
  try {
    res.json(await praxisService.upcoming(req.user.id, String(req.query.window || '24h').toLowerCase()));
  } catch (error) {
    next(error);
  }
});

// Endpoint de compatibilidade (legado): marca como feito.
router.post('/complete/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    res.json(await praxisService.update(req.user.id, id, { status: 'feito' }));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
