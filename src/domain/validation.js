'use strict';

const { BadRequestError } = require('./errors');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const MAX_NAME_LENGTH = 120;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function assertValidEmail(email) {
  if (!EMAIL_REGEX.test(email)) {
    throw new BadRequestError('Informe um e-mail válido.');
  }
}

function assertValidPassword(password) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestError(`A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    throw new BadRequestError('A senha é muito longa.');
  }
}

function assertValidName(name) {
  const value = String(name || '').trim();
  if (value.length < 2 || value.length > MAX_NAME_LENGTH) {
    throw new BadRequestError('Informe um nome válido.');
  }
}

module.exports = {
  EMAIL_REGEX,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  assertValidEmail,
  assertValidPassword,
  assertValidName
};
