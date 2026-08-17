import {
  STEPS,
  STEP_LABELS,
  STEP_RUNNING_LABELS,
  STRANDED_AFTER_MS,
  isStranded,
  nextRunnableStep,
  projectStatus,
} from '../domain/steps.js';

// The ONLY shape the frontend is ever allowed to see. Gemini interaction
// ids and file uris (project.gemini.*) never leave this file.
export function toProjectView(project, { now = Date.now(), includeBook = false, bookText = null } = {}) {
  const stalled = isStranded(project, now);
  const current = nextRunnableStep(project);

  return {
    id: project.id,
    title: project.title,
    createdAt: project.createdAt,
    status: projectStatus(project),
    currentStep: current,
    stepState: project.stepState
      ? {
          step: project.stepState.step,
          label: STEP_RUNNING_LABELS[project.stepState.step],
          startedAt: project.stepState.startedAt,
          attempt: project.stepState.attempt,
          stalled,
          strandedAfterMs: STRANDED_AFTER_MS[project.stepState.step],
        }
      : null,
    // `stalled` is computed per-step here, not just once at the top
    // level, because a stalled claim must not keep rendering as healthy
    // progress on the one step it actually belongs to.
    steps: STEPS.map((step) => ({
      key: step,
      label: STEP_LABELS[step],
      ...project.steps[step],
      stalled: stalled && project.stepState?.step === step,
    })),
    style: project.style,
    styleSource: project.styleSource,
    characters: project.characters.map((c) => ({
      ...c,
      imageUrl: c.image ? `/api/projects/${project.id}/images/${c.image}` : null,
    })),
    chapters: project.chapters.map((c) => ({
      ...c,
      imageUrl: c.image ? `/api/projects/${project.id}/images/${c.image}` : null,
    })),
    models: { text: project.gemini.textModel, image: project.gemini.imageModel },
    ...(includeBook ? { bookText } : {}),
  };
}

// Enough for a project-list row, nothing more.
export function toProjectSummary(project, { now = Date.now() } = {}) {
  const view = toProjectView(project, { now });
  return {
    id: view.id,
    title: view.title,
    createdAt: view.createdAt,
    status: view.status,
    currentStep: view.currentStep,
    stepState: view.stepState,
    steps: view.steps.map((s) => ({
      key: s.key,
      label: s.label,
      status: s.status,
      stalled: s.stalled,
    })),
    counts: { characters: view.characters.length, chapters: view.chapters.length },
  };
}
