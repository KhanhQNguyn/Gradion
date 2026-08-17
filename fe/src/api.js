// The one fetch wrapper, one error shape.

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network', details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let token = null;

export function setAuthToken(value) {
  token = value;
}

async function call(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running?');
  }

  if (response.status === 204) {
    return null;
  }

  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      // Tolerate a body that isn't JSON.
      data = null;
    }
  }

  if (!response.ok) {
    const error = data?.error ?? {};
    throw new ApiError(error.message ?? `Request failed (${response.status}).`, {
      status: response.status,
      code: error.code ?? 'unknown',
      details: error.details,
    });
  }

  return data;
}

export const api = {
  signIn: (email, name) => call('/auth/session', { method: 'POST', body: { email, name } }),

  me: () => call('/me'),

  listProjects: () => call('/projects').then((data) => data.projects),

  createProject: (title, text) =>
    call('/projects', { method: 'POST', body: { title, text } }).then((data) => data.project),

  getProject: (id) => call(`/projects/${id}`).then((data) => data.project),

  getBook: (id) => call(`/projects/${id}/book`).then((data) => data.text),

  runStep: (id, step, body = {}) =>
    call(`/projects/${id}/steps/${step}/run`, { method: 'POST', body }).then((data) => data.project),

  resetStuckStep: (id) =>
    call(`/projects/${id}/reset-stuck-step`, { method: 'POST' }).then((data) => data.project),
};
