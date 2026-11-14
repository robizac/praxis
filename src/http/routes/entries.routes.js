'use strict';

const express = require('express');
const entryService = require('../../services/entryService');
const { BadRequestError } = require('../../domain');

const router = express.Router();

router.get('/entries', async (req, res, next) => {
  try {
    res.json(await entryService.list(req.user.id));
  } catch (error) {
    next(error);
  }
});

router.post('/entries', async (req, res, next) => {
  try {
    const entry = await entryService.create(req.user.id, req.body?.content);
    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
});

router.delete('/entries/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new BadRequestError('ID inválido.');
    res.json(await entryService.remove(req.user.id, id));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
