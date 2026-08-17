import { assertCanRun, isStranded } from './steps.js';
import { conflict } from '../lib/errors.js';

// A failure mid-image-loop (or a takeover of a stranded claim) shouldn't
// leave a character/chapter stuck showing "running" forever — snap it
// back to 'done' if it already has an image, else 'pending'.
function clearRunningItems(draft) {
  for (const collection of ['characters', 'chapters']) {
    for (const item of draft[collection] || []) {
      if (item.imageStatus === 'running') {
        item.imageStatus = item.image ? 'done' : 'pending';
      }
    }
  }
}

export function createPipeline({ store, handlers, now = () => Date.now(), logger = console }) {
  // Tracks the in-flight execute() promise per project so tests (and
  // nothing else — this is process memory, not durable state) can wait
  // for a step to finish via settled().
  const inFlight = new Map();

  async function execute(project, step, input) {
    const patch = (mutate) => store.updateProject(project.id, mutate);

    try {
      await handlers[step]({ project, patch, input });
      await patch((draft) => {
        draft.steps[step].status = 'done';
        draft.steps[step].finishedAt = new Date(now()).toISOString();
        draft.steps[step].error = null;
        if (draft.stepState?.step === step) {
          draft.stepState = null;
        }
      });
    } catch (err) {
      logger.error(`[pipeline] step "${step}" failed for project ${project.id}:`, err);
      try {
        await patch((draft) => {
          draft.steps[step].status = 'error';
          draft.steps[step].finishedAt = new Date(now()).toISOString();
          draft.steps[step].error = err.message || 'The step failed for an unknown reason.';
          if (draft.stepState?.step === step) {
            draft.stepState = null;
          }
          clearRunningItems(draft);
        });
      } catch (patchErr) {
        logger.error(
          `[pipeline] failed to record error state for project ${project.id}:`,
          patchErr
        );
      }
    }
  }

  async function start(projectId, step, input) {
    const claimed = await store.updateProject(projectId, (draft) => {
      // assertCanRun runs inside the lock, on state freshly read from
      // disk — this is what makes the duplicate-call guard actually hold
      // across browser tabs and across a server restart, not just within
      // one in-memory process tick.
      assertCanRun(draft, step, now());

      if (draft.stepState) {
        // We're taking over a stranded claim (assertCanRun only lets
        // this through if it was stranded) — any item left 'running'
        // from that abandoned attempt needs to be un-stuck.
        clearRunningItems(draft);
      }

      const startedAt = new Date(now()).toISOString();
      const record = draft.steps[step];
      record.status = 'running';
      record.startedAt = startedAt;
      record.finishedAt = null;
      record.error = null;
      record.attempts += 1;
      draft.stepState = { step, startedAt, attempt: record.attempts };
    });

    // Kick off execution without awaiting it — the route answers 202
    // before any Gemini call happens. execute() never rejects, so this
    // is safe to leave unhandled from start()'s perspective.
    const promise = execute(claimed, step, input).finally(() => {
      if (inFlight.get(projectId) === promise) {
        inFlight.delete(projectId);
      }
    });
    inFlight.set(projectId, promise);

    return claimed;
  }

  // The stuck-step escape hatch. Must not become a second way to cancel
  // a live call — only stranded claims can be cleared this way.
  async function reset(projectId) {
    return store.updateProject(projectId, (draft) => {
      if (!draft.stepState) return;

      const claim = draft.stepState;
      if (!isStranded(draft, now())) {
        throw conflict('That step is still running — give it a moment.', {
          code: 'step_in_progress',
          step: claim.step,
          startedAt: claim.startedAt,
        });
      }

      draft.steps[claim.step].status = 'error';
      draft.steps[claim.step].finishedAt = new Date(now()).toISOString();
      draft.steps[claim.step].error =
        'The server likely restarted while this step was running. Nothing generated so far was lost — retry the step.';
      draft.stepState = null;
      clearRunningItems(draft);
    });
  }

  // Test-only hook: wait for a project's in-flight step to finish.
  function settled(projectId) {
    return inFlight.get(projectId) || Promise.resolve();
  }

  return { start, reset, settled };
}
