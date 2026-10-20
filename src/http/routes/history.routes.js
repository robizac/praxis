'use strict';

const express = require('express');
const praxisService = require('../../services/praxisService');
const { BadRequestError, NotFoundError } = require('../../domain');

const router = express.Router();

router.get('/history/export', async (req, res, next) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    if (format !== 'csv' && format !== 'md' && format !== 'markdown') {
      throw new BadRequestError('format deve ser csv ou md.');
    }
    const normalized = format === 'markdown' ? 'md' : format;
    const result = await praxisService.exportHistory(req.user.id, normalized);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.body);
  } catch (error) {
    next(error);
  }
});

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
    res.json(
      await praxisService.upcoming(req.user.id, String(req.query.window || '24h').toLowerCase())
    );
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
