export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) =>
  new HttpError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Sign in first.') =>
  new HttpError(401, 'unauthorized', message);

export const notFound = (message = 'Not found.') =>
  new HttpError(404, 'not_found', message);

export const conflict = (message, details) =>
  new HttpError(409, 'conflict', message, details);

// Thrown by the Gemini clients so a step handler can record a usable message.
export class ProviderError extends Error {
  constructor({ status, body } = {}) {
    super(typeof body === 'string' ? body : JSON.stringify(body));
    this.name = 'ProviderError';
    this.status = status;
    this.body = body;
  }
}
