import { useEffect, useState } from 'react';

import { api } from '../api.js';
import { routes } from '../router.js';
import { useProject } from '../hooks/useProject.js';
import { formatDate, formatElapsed } from '../lib/format.js';
import StatusPill from '../components/StatusPill.jsx';
import { Stepper } from '../components/Stepper.jsx';
import { Banner } from '../components/Banner.jsx';
import ArtCard from '../components/ArtCard.jsx';

const ACTIONS = {
  style: {
    cta: 'Generate an art style',
    ctaCustom: 'Use my art style',
    hint: 'The book is uploaded and sent to Gemini here — once. Every later step reuses that conversation.',
  },
  characters: {
    cta: 'Find the main characters',
    hint: "Up to 2 adult characters, each with an image prompt written from the book's own descriptions.",
  },
  portraits: {
    cta: 'Paint the portraits',
    hint: 'One image per character. The slow step — expect 30 seconds or more each.',
  },
  chapters: {
    cta: 'Write the chapter scene',
    hint: 'One chapter prompt that refers back to the characters by name.',
  },
  illustrations: {
    cta: 'Illustrate the chapter',
    hint: 'Chained onto the portraits so the characters stay recognisable.',
  },
};

function RunningBanner({ stepState }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Banner tone="info" spinner title={`${stepState.label}…`}>
      <p>
        Running for {formatElapsed(stepState.startedAt, now)}
        {stepState.attempt > 1 ? ` (attempt ${stepState.attempt})` : ''}.
      </p>
      <p>It's safe to refresh or close this tab — the step keeps running on the server.</p>
    </Banner>
  );
}

function StalledBanner({ stepState, onClear }) {
  const [now, setNow] = useState(() => Date.now());
  // Local to this banner, deliberately not the page-wide `busy` flag —
  // that flag is true for the entire lifetime of a stalled claim (it's
  // still `project.stepState`), which would leave this exact button
  // permanently disabled instead of only while the reset call is in flight.
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function handleClear() {
    setClearing(true);
    try {
      await onClear();
    } finally {
      setClearing(false);
    }
  }

  return (
    <Banner
      tone="warn"
      title={`"${stepState.label}" looks stuck`}
      action={
        <button type="button" className="btn btn--danger" onClick={handleClear} disabled={clearing}>
          {clearing ? 'Clearing…' : 'Clear and retry'}
        </button>
      }
    >
      <p>
        Running for {formatElapsed(stepState.startedAt, now)} with no update — the server likely
        restarted mid-step.
      </p>
    </Banner>
  );
}

function StepErrorBanner({ step, busy, onRetry }) {
  return (
    <Banner
      tone="error"
      title={`"${step.label}" failed`}
      action={
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => onRetry(step.key)}
          disabled={busy}
        >
          {busy ? 'Retrying…' : 'Retry this step'}
        </button>
      }
    >
      <p>{step.error}</p>
      <p>
        Attempt {step.attempts}. Steps already completed are untouched — retrying this one won't
        redo them.
      </p>
    </Banner>
  );
}

function StepActionCard({ project, pendingStep, onRunStep }) {
  const [styleText, setStyleText] = useState('');
  const { currentStep } = project;
  const busy = Boolean(project.stepState) || Boolean(pendingStep);

  if (!currentStep) {
    return (
      <section className="card">
        <div className="card__body">
          <p>All five steps are done.</p>
        </div>
      </section>
    );
  }

  const stepInfo = project.steps.find((step) => step.key === currentStep);
  const stepIndex = project.steps.findIndex((step) => step.key === currentStep) + 1;
  const actions = ACTIONS[currentStep];
  const trimmedStyle = styleText.trim();
  const ctaLabel = currentStep === 'style' && trimmedStyle ? actions.ctaCustom : actions.cta;

  function handleClick() {
    if (currentStep === 'style') {
      onRunStep('style', trimmedStyle ? { style: trimmedStyle } : {});
    } else {
      onRunStep(currentStep, {});
    }
  }

  return (
    <section className="card">
      <div className="card__head">
        <h2>
          Step {stepIndex} · {stepInfo.label}
        </h2>
      </div>
      <div className="card__body stack stack--tight">
        <p className="subtle">{actions.hint}</p>

        {currentStep === 'style' && (
          <input
            type="text"
            className="input"
            value={styleText}
            onChange={(event) => setStyleText(event.target.value)}
            placeholder="e.g. linocut print, two inks, coarse paper"
            disabled={busy}
            aria-label="Your own art style (optional)"
          />
        )}

        <div>
          <button type="button" className="btn btn--primary btn--lg" onClick={handleClick} disabled={busy}>
            {busy ? 'Working…' : ctaLabel}
          </button>
          {busy && <p className="step-action-note">A step is already running.</p>}
        </div>
      </div>
    </section>
  );
}

function BookPanel({ projectId }) {
  const [state, setState] = useState({ status: 'loading', text: null, error: null });
  const [expanded, setExpanded] = useState(false);

  // Fetched once, on mount — explicitly not part of the polled project
  // payload, since a book is hundreds of KB and the project is polled
  // every couple of seconds.
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', text: null, error: null });

    api
      .getBook(projectId)
      .then((text) => {
        if (!cancelled) setState({ status: 'ready', text, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', text: null, error: err });
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (state.status === 'loading') {
    return (
      <section className="card" aria-busy="true">
        <div className="card__body">
          <div className="skeleton skeleton--block" />
        </div>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="card">
        <div className="card__body">
          <Banner tone="error" title="Could not load the book text">
            {state.error.message}
          </Banner>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card__head">
        <h2>Book text</h2>
        <span className="faint">{state.text.length} characters</span>
      </div>
      <div className="card__body">
        <pre className={`book ${expanded ? 'book--full' : ''}`}>{state.text}</pre>
        <button type="button" className="btn btn--ghost" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
    </section>
  );
}

export default function ProjectDetailPage({ projectId }) {
  const { project, loadError, actionError, pendingStep, runStep, resetStuckStep } =
    useProject(projectId);

  if (!project && loadError) {
    return (
      <div className="page">
        <a className="back-link" href={`#/${routes.list()}`}>
          ← All projects
        </a>
        <Banner tone="error" title="Could not load this project">
          {loadError.message}
        </Banner>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="page" aria-busy="true">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--block" style={{ marginBottom: 'var(--space-3)' }} />
        <div className="skeleton skeleton--block" />
      </div>
    );
  }

  const doneCount = project.steps.filter((step) => step.status === 'done').length;
  const erroredStep = project.steps.find((step) => step.status === 'error');
  const busy = Boolean(project.stepState) || Boolean(pendingStep);

  return (
    <div className="page">
      <a className="back-link" href={`#/${routes.list()}`}>
        ← All projects
      </a>

      <div className="stack">
        <header className="project-header">
          <div>
            <h1>{project.title}</h1>
            <p className="faint">
              {formatDate(project.createdAt)}
              {project.models.text ? ` · ${project.models.text} / ${project.models.image}` : ''}
            </p>
          </div>
          <StatusPill status={project.status} />
        </header>

        <section className="card">
          <div className="card__head">
            <h2>Pipeline</h2>
            <span className="faint">
              {doneCount} of {project.steps.length} done
            </span>
          </div>
          <div className="card__body">
            <Stepper steps={project.steps} />
          </div>
        </section>

        {project.stepState && !project.stepState.stalled && (
          <RunningBanner stepState={project.stepState} />
        )}

        {project.stepState && project.stepState.stalled && (
          <StalledBanner stepState={project.stepState} onClear={resetStuckStep} />
        )}

        {!project.stepState && erroredStep && (
          <StepErrorBanner step={erroredStep} busy={busy} onRetry={runStep} />
        )}

        {actionError && (
          <Banner tone="error" title="Something went wrong">
            {actionError.message}
          </Banner>
        )}

        <StepActionCard project={project} pendingStep={pendingStep} onRunStep={runStep} />

        {project.style && (
          <section className="card">
            <div className="card__head">
              <h2>Art style</h2>
              <span className="chip">{project.styleSource === 'user' ? 'yours' : 'generated'}</span>
            </div>
            <div className="card__body">
              <p>{project.style}</p>
            </div>
          </section>
        )}

        {project.characters.length > 0 && (
          <section className="card">
            <div className="card__head">
              <h2>Characters</h2>
            </div>
            <div className="card__body">
              <p className="faint">Adults only, capped at 2 by the server.</p>
              <div className="art-grid">
                {project.characters.map((character, index) => (
                  <ArtCard
                    key={character.id}
                    item={character}
                    kind="character"
                    number={index + 1}
                    running={project.stepState?.step === 'portraits'}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {project.chapters.length > 0 && (
          <section className="card">
            <div className="card__head">
              <h2>Chapter illustration</h2>
            </div>
            <div className="card__body">
              <p className="faint">Capped at 1 chapter by the server.</p>
              <div className="art-grid">
                {project.chapters.map((chapter, index) => (
                  <ArtCard
                    key={chapter.id}
                    item={chapter}
                    kind="chapter"
                    number={index + 1}
                    running={project.stepState?.step === 'illustrations'}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        <BookPanel projectId={projectId} />
      </div>
    </div>
  );
}
