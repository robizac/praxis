'use strict';

const express = require('express');
const db = require('../../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Apenas administradores.
router.use(requireRole('admin'));

router.get('/admin/users', async (req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT u.id, u.email, u.name, u.role, u.created_at,
              s.plan, s.status AS subscription_status, s.current_period_end
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       ORDER BY u.created_at DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/summary', async (req, res, next) => {
  try {
    const users = await db.get('SELECT COUNT(*) AS total FROM users');
    const subs = await db.all(
      'SELECT plan, status, COUNT(*) AS total FROM subscriptions GROUP BY plan, status'
    );
    const usage = await db.get(
      'SELECT COUNT(*) AS generations, COALESCE(SUM(cost_usd), 0) AS cost FROM ai_usage'
    );
    res.json({
      users: Number(users ? users.total : 0),
      subscriptions: subs,
      aiUsage: {
        generations: Number(usage ? usage.generations : 0),
        costUsd: Number(usage ? usage.cost : 0)
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
