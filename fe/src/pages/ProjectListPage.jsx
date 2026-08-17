import { useEffect, useState } from 'react';

import { api } from '../api.js';
import { navigate, routes } from '../router.js';
import { formatDate, pluralise } from '../lib/format.js';
import StatusPill from '../components/StatusPill.jsx';
import { ProgressStrip } from '../components/Stepper.jsx';
import { Banner, EmptyState } from '../components/Banner.jsx';

function ProjectRow({ project }) {
  const doneCount = project.steps.filter((step) => step.status === 'done').length;
  const total = project.steps.length;

  let statusLine;
  if (project.stepState) {
    statusLine = project.stepState.stalled
      ? `${project.stepState.label} may be stuck`
      : project.stepState.label;
  } else {
    statusLine = `${doneCount} of ${total} steps done`;
  }

  return (
    <li className="project-list__item">
      <button
        type="button"
        className="project-row"
        onClick={() => navigate(routes.project(project.id))}
      >
        <div className="project-row__main">
          <p className="project-row__title">{project.title}</p>
          <p className="project-row__meta">
            {formatDate(project.createdAt)} · {statusLine}
          </p>
          {project.counts.characters > 0 && (
            <span className="chip">
              {project.counts.characters} {pluralise(project.counts.characters, 'character')}
            </span>
          )}
        </div>
        <div className="project-row__aside">
          <StatusPill status={project.status} />
          <ProgressStrip steps={project.steps} />
        </div>
      </button>
    </li>
  );
}

export default function ProjectListPage() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setProjects(null);
    setError(null);

    api
      .listProjects()
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__head-text">
          <h1>Projects</h1>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => navigate(routes.new())}>
          New project
        </button>
      </div>

      {error && (
        <Banner tone="error" title="Could not load your projects">
          {error.message}
        </Banner>
      )}

      {!error && projects === null && (
        <ul className="project-list" aria-busy="true">
          {[0, 1, 2].map((row) => (
            <li key={row} className="project-list__item project-list__item--skeleton">
              <div className="skeleton skeleton--row" />
            </li>
          ))}
        </ul>
      )}

      {!error && projects !== null && projects.length === 0 && (
        <EmptyState
          title="No projects yet"
          action={
            <button type="button" className="btn btn--primary" onClick={() => navigate(routes.new())}>
              Start your first project
            </button>
          }
        >
          Upload a book and Gemini will find its characters and illustrate a chapter.
        </EmptyState>
      )}

      {!error && projects !== null && projects.length > 0 && (
        <ul className="project-list">
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </ul>
      )}
    </div>
  );
}
