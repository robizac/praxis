'use strict';

const usageService = require('../../services/usageService');
const { UnauthorizedError } = require('../../domain');

/**
 * Guard de entitlement por recurso (regra de ouro #6: checado por middleware).
 * Deve rodar após `requireAuth` (usa `req.user`).
 */
function requireEntitlement(feature) {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        next(new UnauthorizedError('Faça login para continuar.'));
        return;
      }
      await usageService.requireEntitlement(req.user.id, req.user.plan || 'free', feature);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { requireEntitlement };
