'use strict';

const { randomUUID } = require('crypto');
const db = require('../db');

const COLUMNS = `id, user_id, stripe_customer_id, stripe_subscription_id, price_id,
  plan, status, current_period_end, cancel_at_period_end, trial_end, created_at, updated_at`;

function toIso(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

function map(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    user_id: row.user_id,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    price_id: row.price_id,
    plan: row.plan,
    status: row.status,
    current_period_end: toIso(row.current_period_end),
    cancel_at_period_end: Boolean(Number(row.cancel_at_period_end)),
    trial_end: toIso(row.trial_end),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

async function getByUser(userId) {
  return map(await db.get(`SELECT ${COLUMNS} FROM subscriptions WHERE user_id = ?`, [userId]));
}

async function getByCustomerId(customerId) {
  if (!customerId) {
    return null;
  }
  return map(await db.get(`SELECT ${COLUMNS} FROM subscriptions WHERE stripe_customer_id = ?`, [customerId]));
}

async function getBySubscriptionId(subscriptionId) {
  if (!subscriptionId) {
    return null;
  }
  return map(
    await db.get(`SELECT ${COLUMNS} FROM subscriptions WHERE stripe_subscription_id = ?`, [subscriptionId])
  );
}

/** Cria/atualiza a assinatura do usuário (merge parcial: campos ausentes são preservados). */
async function upsert(userId, data) {
  const existing = await getByUser(userId);
  const now = new Date().toISOString();
  const pick = (key, column, fallback) =>
    data[key] !== undefined ? data[key] : (existing ? existing[column] : fallback);

  const next = {
    stripe_customer_id: pick('stripeCustomerId', 'stripe_customer_id', null),
    stripe_subscription_id: pick('stripeSubscriptionId', 'stripe_subscription_id', null),
    price_id: pick('priceId', 'price_id', null),
    plan: pick('plan', 'plan', 'free'),
    status: pick('status', 'status', 'none'),
    current_period_end: pick('currentPeriodEnd', 'current_period_end', null),
    trial_end: pick('trialEnd', 'trial_end', null),
    cancel_at_period_end: data.cancelAtPeriodEnd !== undefined
      ? (data.cancelAtPeriodEnd ? 1 : 0)
      : (existing && existing.cancel_at_period_end ? 1 : 0)
  };

  const params = [
    next.stripe_customer_id,
    next.stripe_subscription_id,
    next.price_id,
    next.plan,
    next.status,
    next.current_period_end,
    next.cancel_at_period_end,
    next.trial_end
  ];

  if (existing) {
    await db.run(
      `UPDATE subscriptions
          SET stripe_customer_id = ?, stripe_subscription_id = ?, price_id = ?, plan = ?,
              status = ?, current_period_end = ?, cancel_at_period_end = ?, trial_end = ?, updated_at = ?
        WHERE user_id = ?`,
      [...params, now, userId]
    );
  } else {
    await db.run(
      `INSERT INTO subscriptions
         (id, user_id, stripe_customer_id, stripe_subscription_id, price_id, plan, status,
          current_period_end, cancel_at_period_end, trial_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), userId, ...params, now, now]
    );
  }

  return getByUser(userId);
}

module.exports = { map, getByUser, getByCustomerId, getBySubscriptionId, upsert };
