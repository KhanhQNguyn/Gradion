import { setAuthToken } from './api.js';

const STORAGE_KEY = 'bookIllustrator.session';

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user) return null;
    setAuthToken(parsed.token);
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  setAuthToken(session.token);
  return session;
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  setAuthToken(null);
}
