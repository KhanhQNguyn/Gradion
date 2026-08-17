import { useState } from 'react';

// `running` is only true while a caller-chosen step (portraits or
// illustrations) is the live one, so a queued-but-not-yet-generating item
// can be told apart from one that's actually generating right now.
function Placeholder({ state, error }) {
  if (state === 'running') {
    return (
      <div className="art-placeholder" data-state="running">
        <span className="spinner" aria-hidden="true" />
        <span>Generating…</span>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="art-placeholder" data-state="error">
        <span>Failed</span>
        {error && <span className="art-placeholder-detail">{error}</span>}
      </div>
    );
  }

  return (
    <div className="art-placeholder" data-state={state}>
      <span>{state === 'queued' ? 'Queued' : 'Not generated yet'}</span>
    </div>
  );
}

// A fixed aspect-ratio frame so a portrait landing mid-generation never
// shoves the layout around. Per DESIGN.md this frame IS the
// specimen-plate visual, so it needs no icon inside it.
export default function ArtCard({ item, kind, running }) {
  const [open, setOpen] = useState(false);

  const placeholderState =
    running && item.imageStatus === 'pending' ? 'queued' : item.imageStatus;

  return (
    <figure className="art-card">
      <div className="art-frame">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} />
        ) : (
          <Placeholder state={placeholderState} error={item.error} />
        )}
      </div>
      <figcaption className="art-caption">
        <p className="art-name">{item.name}</p>

        {kind === 'chapter' && item.characters?.length > 0 && (
          <ul className="chip-row">
            {item.characters.map((name) => (
              <li key={name} className="chip">
                {name}
              </li>
            ))}
          </ul>
        )}

        <div className={`art-prompt ${open ? 'art-prompt--open' : ''}`}>
          <p>{item.prompt}</p>
        </div>
        <button type="button" className="link-button" onClick={() => setOpen((v) => !v)}>
          {open ? 'Show less' : 'Show full prompt'}
        </button>
      </figcaption>
    </figure>
  );
}
