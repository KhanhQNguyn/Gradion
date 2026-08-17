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
    <div className="new-project-page">
      <a className="back-link" href={`#/${routes.list()}`}>
        ← All projects
      </a>

      <h1>Start a new project</h1>

      {serverError && (
        <Banner tone="error" title="Could not create the project">
          {serverError.message}
        </Banner>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="project-title">Title</label>
        <input
          id="project-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, title: true }))}
          aria-invalid={touched.title && titleError ? 'true' : 'false'}
          aria-describedby={touched.title && titleError ? 'project-title-error' : undefined}
        />
        {touched.title && titleError && (
          <p id="project-title-error" className="field-error">
            {titleError}
          </p>
        )}

        <label htmlFor="project-text">Book text</label>
        <textarea
          id="project-text"
          rows={12}
          value={text}
          onChange={handleTextChange}
          onBlur={() => setTouched((t) => ({ ...t, text: true }))}
          aria-invalid={touched.text && textError ? 'true' : 'false'}
          aria-describedby="project-text-hint"
        />
        <p id="project-text-hint" className="field-hint">
          {filename ? `Loaded ${filename} — ` : ''}
          {trimmedText.length} characters. Paste the full text — Project Gutenberg is a good
          source — at least {MIN_TEXT} characters.
        </p>
        {touched.text && textError && <p className="field-error">{textError}</p>}

        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,text/plain"
          hidden
          aria-label="Upload a book text file"
          onChange={handleFilePicked}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Upload .txt
        </button>

        <div className="form-actions">
          <button type="button" onClick={handleCancel}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </div>
  );
}
