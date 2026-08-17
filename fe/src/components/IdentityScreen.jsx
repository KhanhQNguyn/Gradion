import { useState } from 'react';

import { api } from '../api.js';
import { saveSession } from '../session.js';
import { Banner } from './Banner.jsx';

// Same shape the backend validates against.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function IdentityScreen({ onSignedIn }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const nameError = trimmedName.length < 2 ? 'Enter at least 2 characters.' : null;
  const emailError = !EMAIL_RE.test(trimmedEmail) ? 'Enter a valid email address.' : null;

  async function handleSubmit(event) {
    event.preventDefault();
    setTouched({ name: true, email: true });
    if (nameError || emailError) return;

    setBusy(true);
    setServerError(null);
    try {
      const result = await api.signIn(trimmedEmail, trimmedName);
      const session = saveSession({ token: result.token, user: result.user });
      onSignedIn(session);
    } catch (err) {
      setServerError(err);
    } finally {
      setBusy(false);
    }
  }

  const emailDescribedBy = ['identity-email-hint', touched.email && emailError ? 'identity-email-error' : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="identity-screen">
      <form className="identity-card" onSubmit={handleSubmit} noValidate>
        <h1>Book Illustrator</h1>
        <p className="identity-lede">Sign in to start or continue a project.</p>

        {serverError && (
          <Banner tone="error" title="Could not sign in">
            {serverError.message}
          </Banner>
        )}

        <label htmlFor="identity-name">Name</label>
        <input
          id="identity-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          aria-invalid={touched.name && nameError ? 'true' : 'false'}
          aria-describedby={touched.name && nameError ? 'identity-name-error' : undefined}
        />
        {touched.name && nameError && (
          <p id="identity-name-error" className="field-error">
            {nameError}
          </p>
        )}

        <label htmlFor="identity-email">Email</label>
        <input
          id="identity-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          aria-invalid={touched.email && emailError ? 'true' : 'false'}
          aria-describedby={emailDescribedBy}
        />
        <p id="identity-email-hint" className="field-hint">
          No password. A new email starts a new workspace; a known one loads your projects.
        </p>
        {touched.email && emailError && (
          <p id="identity-email-error" className="field-error">
            {emailError}
          </p>
        )}

        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
