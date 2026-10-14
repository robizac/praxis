'use strict';

/** Regra de foco: no máximo 2 ações pendentes por vez. */
const MAX_PENDING = 2;

function shouldBlockNewAction(pendentes) {
  return Number(pendentes) >= MAX_PENDING;
}

module.exports = { MAX_PENDING, shouldBlockNewAction };
