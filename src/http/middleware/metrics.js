'use strict';

const metrics = require('../../lib/metrics');

/**
 * Coleta por requisição: total por método/rota/status e histograma de
 * latência. Mantém a cardinalidade baixa usando o *padrão* da rota
 * (`req.route.path` ou o prefixo), nunca a URL crua com ids.
 */
function httpMetrics(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path || req.baseUrl || 'unmatched';
    const labels = { method: req.method, route, status: String(res.statusCode) };

    metrics.increment(
      'http_requests_total',
      'Total de requisições HTTP por método, rota e status.',
      labels
    );
    metrics.observe(
      'http_request_duration_seconds',
      'Duração das requisições HTTP em segundos.',
      metrics.HTTP_DURATION_BUCKETS,
      seconds,
      { method: req.method, route }
    );
  });

  next();
}

module.exports = { httpMetrics };
