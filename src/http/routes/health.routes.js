'use strict';

const express = require('express');
const db = require('../../db');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

router.get('/ready', async (_req, res) => {
  try {
    await db.get('SELECT 1 AS ok');
    res.json({ status: 'ready', db: db.dialect });
  } catch (error) {
    res.status(503).json({ status: 'not_ready', error: error.message });
  }
});

module.exports = router;
