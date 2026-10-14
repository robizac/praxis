'use strict';

const express = require('express');
const reviewService = require('../../services/reviewService');

const router = express.Router();

router.get('/weekly-reviews', async (req, res, next) => {
  try {
    res.json(await reviewService.list(req.user.id));
  } catch (error) {
    next(error);
  }
});

router.post('/weekly-reviews', async (req, res, next) => {
  try {
    const review = await reviewService.create(req.user.id, req.body || {});
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
