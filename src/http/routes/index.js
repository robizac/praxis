'use strict';

const express = require('express');
const { apiLimiter } = require('../middleware/security');
const { csrfProtection } = require('../middleware/cookies');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Proteção CSRF (double-submit) para toda a API.
router.use(csrfProtection);

// Autenticação: cadastro, login, recuperação de senha (não exige sessão).
router.use('/auth', require('./auth.routes'));

// A partir daqui a API de aplicação exige usuário autenticado.
router.use(apiLimiter);
router.use(requireAuth);

router.use(require('./praxis.routes'));
router.use(require('./history.routes'));
router.use(require('./reviews.routes'));
router.use(require('./reminders.routes'));
router.use(require('./ai.routes'));
router.use(require('./billing.routes'));
router.use(require('./telegram.routes'));
router.use(require('./settings.routes'));
router.use(require('./account.routes'));
router.use(require('./admin.routes'));

module.exports = router;
