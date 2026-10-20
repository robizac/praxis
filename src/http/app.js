'use strict';

const path = require('path');
const express = require('express');
const { requestContext, httpLogger } = require('./middleware/observability');
const {
  helmetMiddleware,
  permissionsPolicyMiddleware,
  corsMiddleware
} = require('./middleware/security');
const { httpMetrics } = require('./middleware/metrics');
const { cookieParser } = require('./middleware/cookies');
const { attachUser } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const webhookRoutes = require('./routes/webhooks.routes');
const healthRoutes = require('./routes/health.routes');

const WEB_APP_DIR = path.join(__dirname, '..', '..', 'web', 'app');
const LANDING_DIR = path.join(__dirname, '..', '..', 'web', 'landing');

/** Monta a instância do Express com middlewares e rotas. */
function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmetMiddleware);
  app.use(permissionsPolicyMiddleware);
  app.use(corsMiddleware);
  app.use(requestContext);
  app.use(httpMetrics);
  app.use(httpLogger);
  // Preserva o corpo bruto para verificação de assinatura do webhook da Stripe.
  app.use(
    express.json({
      limit: '64kb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(cookieParser);

  // Infra
  app.use(healthRoutes);

  // Webhooks (fora de /api: sem CSRF/sessão; assinatura própria).
  app.use(webhookRoutes);

  // Resolve a sessão (se houver) para toda a API antes das rotas.
  app.use('/api', attachUser);

  // API
  app.use('/api', apiRoutes);

  // Páginas legais sem extensão (`/termos`, `/privacidade`, `/contato`).
  for (const page of ['termos', 'privacidade', 'contato']) {
    app.get(`/${page}`, (_req, res) => res.sendFile(path.join(LANDING_DIR, `${page}.html`)));
  }

  // Landing page em `/`
  app.use(express.static(LANDING_DIR));

  // SPA em `/app` (fallback para rotas hash-based do SPA)
  app.use('/app', express.static(WEB_APP_DIR));
  app.get('/app/*', (_req, res) => res.sendFile(path.join(WEB_APP_DIR, 'index.html')));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, WEB_APP_DIR, LANDING_DIR };
