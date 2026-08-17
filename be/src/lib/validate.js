import { badRequest } from './errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function requireString(value, field, { min = 1, max = 500 } = {}) {
  if (value === undefined || value === null) {
    throw badRequest(`${field} is required.`);
  }
  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    throw badRequest(`${field} is required.`);
  }
  if (trimmed.length < min) {
    throw badRequest(`${field} is too short.`);
  }
  if (trimmed.length > max) {
    throw badRequest(`${field} is too long.`);
  }
  return trimmed;
}

export function requireEmail(value) {
  const trimmed = requireString(value, 'email', { min: 3, max: 320 });
  if (!EMAIL_RE.test(trimmed)) {
    throw badRequest('email is not a valid email address.');
  }
  return trimmed.toLowerCase();
}
