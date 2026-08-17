import { badRequest, conflict } from '../lib/errors.js';

export const STEPS = ['style', 'characters', 'portraits', 'chapters', 'illustrations'];

export const STEP_LABELS = {
  style: 'Art style',
  characters: 'Characters',
  portraits: 'Portraits',
  chapters: 'Chapters',
  illustrations: 'Illustrations',
};

export const STEP_RUNNING_LABELS = {
  style: 'Defining the art style',
  characters: 'Reading the book for its main characters',
  portraits: 'Painting the character portraits',
  chapters: 'Writing the chapter scene prompt',
  illustrations: 'Painting the chapter illustration',
};

// Per-step because image calls are minutes, not seconds.
export const STRANDED_AFTER_MS = {
  style: 3 * 60_000,
  characters: 4 * 60_000,
  portraits: 10 * 60_000,
  chapters: 4 * 60_000,
  illustrations: 10 * 60_000,
};

export function emptySteps() {
  const steps = {};
  for (const step of STEPS) {
    steps[step] = {
      status: 'pending',
      attempts: 0,
      startedAt: null,
      finishedAt: null,
      error: null,
    };
  }
  return steps;
}

export function isStep(value) {
  return STEPS.includes(value);
}

export function stepIndex(step) {
  return STEPS.indexOf(step);
}

// Pure function of stored data — must survive a process restart with no timer.
export function isStranded(project, now = Date.now()) {
  const claim = project.stepState;
  if (!claim) return false;
  const threshold = STRANDED_AFTER_MS[claim.step] ?? 5 * 60_000;
  return now - new Date(claim.startedAt).getTime() > threshold;
}

export function nextRunnableStep(project) {
  for (const step of STEPS) {
    if (project.steps[step].status !== 'done') {
      return step;
    }
  }
  return null;
}

export function projectStatus(project) {
  const allDone = STEPS.every((step) => project.steps[step].status === 'done');
  if (allDone) return 'done';
  if (project.stepState) return 'in_progress';
  const anyError = STEPS.some((step) => project.steps[step].status === 'error');
  if (anyError) return 'error';
  const allPending = STEPS.every((step) => project.steps[step].status === 'pending');
  if (allPending) return 'draft';
  return 'in_progress';
}

// The single gate every run request passes through, called *inside* the
// project lock on freshly-read state.
export function assertCanRun(project, step, now = Date.now()) {
  if (!isStep(step)) {
    throw badRequest(`Unknown step "${step}".`);
  }

  const claim = project.stepState;
  if (claim && !isStranded(project, now)) {
    if (claim.step === step) {
      throw conflict(`"${STEP_LABELS[step]}" is already running.`, {
        code: 'step_in_progress',
        step: claim.step,
        startedAt: claim.startedAt,
      });
    }
    throw conflict(`"${STEP_LABELS[claim.step]}" is running — wait for it to finish.`, {
      code: 'step_in_progress',
      step: claim.step,
      startedAt: claim.startedAt,
    });
  }

  if (project.steps[step].status === 'done') {
    throw conflict(`"${STEP_LABELS[step]}" is already done.`, {
      code: 'step_done',
      step,
    });
  }

  const idx = stepIndex(step);
  for (let i = 0; i < idx; i++) {
    const blocking = STEPS[i];
    if (project.steps[blocking].status !== 'done') {
      throw conflict(`Run "${STEP_LABELS[blocking]}" first.`, {
        code: 'out_of_order',
        step,
        blockedBy: blocking,
      });
    }
  }
}
