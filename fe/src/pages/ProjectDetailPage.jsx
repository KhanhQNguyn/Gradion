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
      tone="warning"
      title={`"${stepState.label}" looks stuck`}
      action={
        <button type="button" onClick={handleClear} disabled={clearing}>
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
        <button type="button" onClick={() => onRetry(step.key)} disabled={busy}>
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
      <section className="card step-action-card">
        <p>All five steps are done.</p>
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
    <section className="card step-action-card">
      <h2>
        Step {stepIndex} · {stepInfo.label}
      </h2>
      <p className="step-hint">{actions.hint}</p>

      {currentStep === 'style' && (
        <input
          type="text"
          value={styleText}
          onChange={(event) => setStyleText(event.target.value)}
          placeholder="e.g. linocut print, two inks, coarse paper"
          disabled={busy}
          aria-label="Your own art style (optional)"
        />
      )}

      <button type="button" onClick={handleClick} disabled={busy}>
        {busy ? 'Working…' : ctaLabel}
      </button>
      {busy && <p className="step-action-note">A step is already running.</p>}
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
      <section className="card book-panel" aria-busy="true">
        <div className="skeleton skeleton--block" />
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="card book-panel">
        <Banner tone="error" title="Could not load the book text">
          {state.error.message}
        </Banner>
      </section>
    );
  }

  return (
    <section className="card book-panel">
      <div className="book-panel-header">
        <h2>Book text</h2>
        <span className="caption">{state.text.length} characters</span>
      </div>
      <pre className={`book-text ${expanded ? 'book-text--expanded' : ''}`}>{state.text}</pre>
      <button type="button" onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Collapse' : 'Expand'}
      </button>
    </section>
  );
}

export default function ProjectDetailPage({ projectId }) {
  const { project, loadError, actionError, pendingStep, runStep, resetStuckStep } =
    useProject(projectId);

  if (!project && loadError) {
    return (
      <div className="project-detail-page">
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
      <div className="project-detail-page" aria-busy="true">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--block" />
        <div className="skeleton skeleton--block" />
      </div>
    );
  }

  const doneCount = project.steps.filter((step) => step.status === 'done').length;
  const erroredStep = project.steps.find((step) => step.status === 'error');
  const busy = Boolean(project.stepState) || Boolean(pendingStep);

  return (
    <div className="project-detail-page">
      <a className="back-link" href={`#/${routes.list()}`}>
        ← All projects
      </a>

      <header className="project-header">
        <div>
          <h1>{project.title}</h1>
          <p className="project-header-meta">
            {formatDate(project.createdAt)}
            {project.models.text ? ` · ${project.models.text} / ${project.models.image}` : ''}
          </p>
        </div>
        <StatusPill status={project.status} />
      </header>

      <section className="card pipeline-card">
        <h2>Pipeline</h2>
        <Stepper steps={project.steps} />
        <p className="caption">
          {doneCount} of {project.steps.length} done
        </p>
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
        <section className="card style-card">
          <h2>Art style</h2>
          <p>{project.style}</p>
          <span className="chip">{project.styleSource === 'user' ? 'yours' : 'generated'}</span>
        </section>
      )}

      {project.characters.length > 0 && (
        <section className="card characters-section">
          <h2>Characters</h2>
          <p className="caption">Adults only, capped at 2 by the server.</p>
          <div className="art-grid">
            {project.characters.map((character) => (
              <ArtCard
                key={character.id}
                item={character}
                kind="character"
                running={project.stepState?.step === 'portraits'}
              />
            ))}
          </div>
        </section>
      )}

      {project.chapters.length > 0 && (
        <section className="card chapters-section">
          <h2>Chapter illustration</h2>
          <p className="caption">Capped at 1 chapter by the server.</p>
          <div className="art-grid">
            {project.chapters.map((chapter) => (
              <ArtCard
                key={chapter.id}
                item={chapter}
                kind="chapter"
                running={project.stepState?.step === 'illustrations'}
              />
            ))}
          </div>
        </section>
      )}

      <BookPanel projectId={projectId} />
    </div>
  );
}
