import { useState } from 'react';

import { api } from '../api.js';

// `running` is only true while a caller-chosen step (portraits or
// illustrations) is the live one, so a queued-but-not-yet-generating item
// can be told apart from one that's actually generating right now.
function Placeholder({ state, error }) {
  if (state === 'running') {
    return (
      <div className="art-card__placeholder art-card__placeholder--running" data-state="running">
        <span className="spinner" aria-hidden="true" />
        <span>Generating…</span>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="art-card__placeholder art-card__placeholder--error" data-state="error">
        <span>Failed</span>
        {error && <span className="art-card__placeholder-detail">{error}</span>}
      </div>
    );
  }

  return (
    <div className="art-card__placeholder" data-state={state}>
      <span>{state === 'queued' ? 'Queued' : 'Not generated yet'}</span>
    </div>
  );
}

// A fixed aspect-ratio frame so a portrait landing mid-generation never
// shoves the layout around. Per DESIGN.md this frame IS the
// specimen-plate visual — hairline frame, a plate number in the corner,
// an italic caption below — nothing else decorating it.
export default function ArtCard({ item, kind, running, number }) {
  const [open, setOpen] = useState(false);

  const placeholderState =
    running && item.imageStatus === 'pending' ? 'queued' : item.imageStatus;

  return (
    <figure className={`art-card ${kind === 'chapter' ? 'art-card--wide' : ''}`}>
      <div className="art-card__frame">
        {number != null && <span className="art-card__plate-no">Fig. {number}</span>}
        {item.imageUrl ? (
          <img src={api.authedImageUrl(item.imageUrl)} alt={item.name} />
        ) : (
          <Placeholder state={placeholderState} error={item.error} />
        )}
      </div>
      <figcaption className="art-card__body">
        <p className="art-card__name">{item.name}</p>

        {kind === 'chapter' && item.characters?.length > 0 && (
          <ul className="chip-row">
            {item.characters.map((name) => (
              <li key={name} className="chip">
                {name}
              </li>
            ))}
          </ul>
        )}

        <div className={`art-card__prompt ${open ? 'art-card__prompt--open' : ''}`}>
          <p>{item.prompt}</p>
        </div>
        <button type="button" className="link-button" onClick={() => setOpen((v) => !v)}>
          {open ? 'Show less' : 'Show full prompt'}
        </button>
      </figcaption>
    </figure>
  );
}
