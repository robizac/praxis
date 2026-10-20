'use strict';

/**
 * Erros tipados da aplicação. Camadas de serviço/domínio lançam estes erros e o
 * middleware `errorHandler` converte para o shape HTTP padrão.
 */

class AppError extends Error {
  constructor(
    message,
    { status = 500, code = 'internal_error', details, expose = true, cause } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = expose;
    if (cause) {
      this.cause = cause;
    }
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Requisição inválida.', details) {
    super(message, { status: 400, code: 'bad_request', details });
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado.') {
    super(message, { status: 401, code: 'unauthorized' });
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado.', details) {
    super(message, { status: 403, code: 'forbidden', details });
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado.') {
    super(message, { status: 404, code: 'not_found' });
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflito de estado.', code = 'conflict', details) {
    super(message, { status: 409, code, details });
  }
}

class QuotaExceededError extends AppError {
  constructor(message = 'Limite do plano atingido.', details) {
    super(message, { status: 402, code: 'quota_exceeded', details });
  }
}

class TooManyRequestsError extends AppError {
  constructor(message = 'Muitas requisições.') {
    super(message, { status: 429, code: 'too_many_requests' });
  }
}

class ProviderError extends AppError {
  /**
   * Falha ao falar com o provider de IA.
   *
   * Usa 503 (Service Unavailable) e não 502 (Bad Gateway): 502 faz proxies e
   * CDNs (Cloudflare na frente do PRAXIS) substituírem o corpo da resposta
   * pela página genérica de erro deles, escondendo a dica acionável do app
   * ("confirme a chave, o crédito e o modelo"). 503 passa o corpo intacto.
   *
   * @param {string} provider  nome do provider (openai, anthropic, ...)
   * @param {string} message   mensagem exibida ao usuário
   * @param {string} hint      como resolver
   * @param {number} [providerStatus] status HTTP devolvido pelo provider
   */
  constructor(provider, message, hint, providerStatus) {
    super(message, {
      status: 503,
      code: 'ai_provider_error',
      details: { provider, hint, providerStatus }
    });
    this.provider = provider;
    this.hint = hint;
    this.providerStatus = providerStatus;
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  QuotaExceededError,
  TooManyRequestsError,
  ProviderError
};
