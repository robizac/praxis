'use strict';

const express = require('express');
const billingService = require('../../services/billingService');

const router = express.Router();

router.get('/billing/plans', (_req, res) => {
  res.json({ plans: billingService.getPlans() });
});

router.get('/billing/subscription', async (req, res, next) => {
  try {
    res.json(await billingService.getStatus(req.user.id));
  } catch (error) {
    next(error);
  }
});

router.post('/billing/checkout', async (req, res, next) => {
  try {
    const priceId = req.body?.priceId ? String(req.body.priceId).trim() : undefined;
    const session = await billingService.createCheckoutSession(req.user, { priceId });
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

router.post('/billing/portal', async (req, res, next) => {
  try {
    const returnUrl = req.body?.returnUrl ? String(req.body.returnUrl).trim() : undefined;
    const session = await billingService.createPortalSession(req.user, { returnUrl });
    res.json(session);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
