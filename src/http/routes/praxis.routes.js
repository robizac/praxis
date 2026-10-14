'use strict';

const express = require('express');
const praxisService = require('../../services/praxisService');
const praxisRepo = require('../../repositories/praxis.repo');
const { shouldBlockNewAction } = require('../../domain');
const { aiLimiter } = require('../middleware/security');
const { requireEntitlement } = require('../middleware/entitlements');

const router = express.Router();

router.post('/praxis', requireEntitlement('aiGenerations'), aiLimiter, async (req, res, next) => {
  try {
    const texto = req.body?.texto || req.body?.input;
    const result = await praxisService.generate({
      userId: req.user.id,
      planId: req.user.plan || 'free',
      texto,
      area: req.body?.area
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/meta', async (req, res, next) => {
  try {
    const pendentes = await praxisRepo.countPending(req.user.id);
    res.json({ pendentes, pode_gerar: !shouldBlockNewAction(pendentes) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
