// Mirrors the backend's domain/steps.js constants exactly, so fixtures
// stay in lockstep with what toProjectView actually produces.
const STEPS = ['style', 'characters', 'portraits', 'chapters', 'illustrations'];

const STEP_LABELS = {
  style: 'Art style',
  characters: 'Characters',
  portraits: 'Portraits',
  chapters: 'Chapters',
  illustrations: 'Illustrations',
};

const STEP_RUNNING_LABELS = {
  style: 'Defining the art style',
  characters: 'Reading the book for its main characters',
  portraits: 'Painting the character portraits',
  chapters: 'Writing the chapter scene prompt',
  illustrations: 'Painting the chapter illustration',
};

const STRANDED_AFTER_MS = {
  style: 3 * 60_000,
  characters: 4 * 60_000,
  portraits: 10 * 60_000,
  chapters: 4 * 60_000,
  illustrations: 10 * 60_000,
};

function emptyStepRecord() {
  return { status: 'pending', attempts: 0, startedAt: null, finishedAt: null, error: null };
}

// One entry per STEPS key, in order, with the given statuses; any not
// passed default to 'pending'. e.g. steps('done', 'done', 'running')
// gives style/characters done, portraits running, chapters/illustrations
// pending.
export function steps(...statuses) {
  return STEPS.map((key, index) => {
    const status = statuses[index] ?? 'pending';
    const record = emptyStepRecord();
    if (status !== 'pending') {
      record.status = status;
      record.attempts = 1;
      record.startedAt = new Date().toISOString();
      if (status === 'done') record.finishedAt = new Date().toISOString();
      if (status === 'error') record.error = 'Simulated failure.';
    }
    return { key, label: STEP_LABELS[key], ...record, stalled: false };
  });
}

export function runningState(step, { secondsAgo = 8, attempt = 1, stalled = false } = {}) {
  return {
    step,
    label: STEP_RUNNING_LABELS[step],
    startedAt: new Date(Date.now() - secondsAgo * 1000).toISOString(),
    attempt,
    stalled,
    strandedAfterMs: STRANDED_AFTER_MS[step],
  };
}

export function character(index, overrides = {}) {
  return {
    id: `chr_${index + 1}`,
    name: `Character ${index + 1}`,
    prompt: `A vivid, detailed description of character ${index + 1}, drawn from the book.`,
    image: null,
    imageStatus: 'pending',
    error: null,
    imageUrl: null,
    ...overrides,
  };
}

export function chapter(index, overrides = {}) {
  return {
    id: `cha_${index + 1}`,
    name: `Chapter ${index + 1}`,
    prompt: `A vivid scene prompt for chapter ${index + 1}.`,
    characters: [],
    image: null,
    imageStatus: 'pending',
    error: null,
    imageUrl: null,
    ...overrides,
  };
}

// Mirrors exactly what toProjectView returns.
export function makeProject(overrides = {}) {
  return {
    id: 'prj_test1',
    title: 'Wind in the Willows',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'draft',
    currentStep: 'style',
    stepState: null,
    steps: steps(),
    style: null,
    styleSource: null,
    characters: [],
    chapters: [],
    models: { text: 'gemini-3.7-flash', image: 'gemini-3.1-flash-lite-image' },
    ...overrides,
  };
}

// Mirrors toProjectSummary.
export function summary(overrides = {}) {
  const project = makeProject(overrides);
  return {
    id: project.id,
    title: project.title,
    createdAt: project.createdAt,
    status: project.status,
    currentStep: project.currentStep,
    stepState: project.stepState,
    steps: project.steps.map((step) => ({
      key: step.key,
      label: step.label,
      status: step.status,
      stalled: step.stalled,
    })),
    counts: {
      characters: project.characters?.length ?? 0,
      chapters: project.chapters?.length ?? 0,
    },
    ...('counts' in overrides ? { counts: overrides.counts } : {}),
  };
}
