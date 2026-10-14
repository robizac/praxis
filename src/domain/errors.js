'use strict';

/**
 * Erros tipados da aplicação. Camadas de serviço/domínio lançam estes erros e o
 * middleware `errorHandler` converte para o shape HTTP padrão.
 */

class AppError extends Error {
  constructor(message, { status = 500, code = 'internal_error', details, expose = true, cause } = {}) {
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
  constructor(provider, message, hint) {
    super(message, {
      status: 502,
      code: 'ai_provider_error',
      details: { provider, hint }
    });
    this.provider = provider;
    this.hint = hint;
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
