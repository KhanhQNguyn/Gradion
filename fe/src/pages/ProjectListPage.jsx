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
    <li className="project-row">
      <button
        type="button"
        className="project-row-button"
        onClick={() => navigate(routes.project(project.id))}
      >
        <div className="project-row-main">
          <p className="project-row-title">{project.title}</p>
          <p className="project-row-meta">
            {formatDate(project.createdAt)} · {statusLine}
          </p>
          {project.counts.characters > 0 && (
            <span className="chip">
              {project.counts.characters} {pluralise(project.counts.characters, 'character')}
            </span>
          )}
        </div>
        <div className="project-row-side">
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

  if (error) {
    return (
      <Banner tone="error" title="Could not load your projects">
        {error.message}
      </Banner>
    );
  }

  if (projects === null) {
    return (
      <ul className="project-list" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <li key={row} className="project-row project-row--skeleton" />
        ))}
      </ul>
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        title="No projects yet"
        action={
          <button type="button" onClick={() => navigate(routes.new())}>
            Start your first project
          </button>
        }
      >
        Upload a book and Gemini will find its characters and illustrate a chapter.
      </EmptyState>
    );
  }

  return (
    <ul className="project-list">
      {projects.map((project) => (
        <ProjectRow key={project.id} project={project} />
      ))}
    </ul>
  );
}
