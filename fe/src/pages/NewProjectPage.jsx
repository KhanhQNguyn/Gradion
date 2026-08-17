import { useRef, useState } from 'react';

import { api } from '../api.js';
import { navigate, routes } from '../router.js';
import { readTextFile } from '../lib/read-file.js';
import { Banner } from '../components/Banner.jsx';

const MAX_TITLE = 120;
const MIN_TEXT = 200;

export default function NewProjectPage() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [filename, setFilename] = useState(null);
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  const fileInputRef = useRef(null);

  const trimmedTitle = title.trim();
  const trimmedText = text.trim();

  const titleError =
    trimmedTitle.length === 0
      ? 'Title is required.'
      : trimmedTitle.length > MAX_TITLE
        ? `Title must be ${MAX_TITLE} characters or fewer.`
        : null;

  const textError =
    trimmedText.length < MIN_TEXT
      ? `Add at least ${MIN_TEXT} characters (currently ${trimmedText.length}).`
      : null;

  function handleTextChange(event) {
    setText(event.target.value);
    // Typing directly means the loaded-file provenance no longer applies.
    setFilename(null);
  }

  async function handleFilePicked(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const content = await readTextFile(file);
    setText(content);
    setFilename(file.name);
    setTitle((current) => (current.trim() ? current : file.name.replace(/\.[^.]+$/, '')));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setTouched({ title: true, text: true });
    if (titleError || textError) return;

    setBusy(true);
    setServerError(null);
    try {
      const project = await api.createProject(trimmedTitle, trimmedText);
      navigate(routes.project(project.id));
    } catch (err) {
      setServerError(err);
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    navigate(routes.list());
  }

  return (
    <div className="page page--narrow">
      <a className="back-link" href={`#/${routes.list()}`}>
        ← All projects
      </a>

      <div className="page__head">
        <div className="page__head-text">
          <h1>Start a new project</h1>
        </div>
      </div>

      <div className="stack">
        {serverError && (
          <Banner tone="error" title="Could not create the project">
            {serverError.message}
          </Banner>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="project-title">
              Title
            </label>
            <input
              id="project-title"
              className="input"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, title: true }))}
              aria-invalid={touched.title && titleError ? 'true' : 'false'}
              aria-describedby={touched.title && titleError ? 'project-title-error' : undefined}
            />
            {touched.title && titleError && (
              <p id="project-title-error" className="field__error">
                {titleError}
              </p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="project-text">
              Book text
            </label>
            <textarea
              id="project-text"
              className="textarea"
              rows={12}
              value={text}
              onChange={handleTextChange}
              onBlur={() => setTouched((t) => ({ ...t, text: true }))}
              aria-invalid={touched.text && textError ? 'true' : 'false'}
              aria-describedby="project-text-hint"
            />
            <p id="project-text-hint" className="field__hint">
              {filename ? `Loaded ${filename} — ` : ''}
              {trimmedText.length} characters. Paste the full text — Project Gutenberg is a good
              source — at least {MIN_TEXT} characters.
            </p>
            {touched.text && textError && <p className="field__error">{textError}</p>}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            hidden
            aria-label="Upload a book text file"
            onChange={handleFilePicked}
          />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload .txt
          </button>

          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
