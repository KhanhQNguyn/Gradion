import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  STEPS,
  emptySteps,
  isStranded,
  nextRunnableStep,
  projectStatus,
  assertCanRun,
} from '../src/domain/steps.js';

function makeProject(overrides = {}) {
  return {
    steps: emptySteps(),
    stepState: null,
    ...overrides,
  };
}

function markDone(project, step) {
  project.steps[step] = {
    status: 'done',
    attempts: 1,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: null,
  };
}

function markError(project, step) {
  project.steps[step] = {
    status: 'error',
    attempts: 1,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: 'boom',
  };
}

describe('step ordering', () => {
  test('first step runs on a fresh project', () => {
    const project = makeProject();
    assert.doesNotThrow(() => assertCanRun(project, 'style'));
  });

  test('a step is refused when its predecessors are not done', () => {
    const project = makeProject();
    try {
      assertCanRun(project, 'characters');
      assert.fail('expected assertCanRun to throw');
    } catch (err) {
      assert.equal(err.status, 409);
      assert.equal(err.details.code, 'out_of_order');
    }
  });

  test('the error names the nearest incomplete predecessor', () => {
    const project = makeProject();
    markDone(project, 'style');
    // characters not done yet -> chapters should name "characters", not "style"
    try {
      assertCanRun(project, 'chapters');
      assert.fail('expected assertCanRun to throw');
    } catch (err) {
      assert.equal(err.details.blockedBy, 'characters');
      assert.match(err.message, /Characters/);
    }
  });

  test('each step becomes runnable once the one before it is done', () => {
    const project = makeProject();
    for (const step of STEPS) {
      assert.doesNotThrow(() => assertCanRun(project, step), `${step} should be runnable`);
      markDone(project, step);
    }
  });

  test('a completed step cannot be re-run', () => {
    const project = makeProject();
    markDone(project, 'style');
    try {
      assertCanRun(project, 'style');
      assert.fail('expected assertCanRun to throw');
    } catch (err) {
      assert.equal(err.details.code, 'step_done');
    }
  });

  test('a failed step CAN be retried', () => {
    const project = makeProject();
    markError(project, 'style');
    assert.doesNotThrow(() => assertCanRun(project, 'style'));
  });

  test('an unknown step name is rejected', () => {
    const project = makeProject();
    assert.throws(() => assertCanRun(project, 'nonsense'), /Unknown step/);
  });
});

describe('duplicate-run guard', () => {
  test('a second run of the step already in flight is rejected', () => {
    const project = makeProject({
      stepState: { step: 'style', startedAt: new Date().toISOString() },
    });
    try {
      assertCanRun(project, 'style');
      assert.fail('expected assertCanRun to throw');
    } catch (err) {
      assert.equal(err.details.code, 'step_in_progress');
      assert.match(err.message, /already running/);
    }
  });

  test('a different step is also rejected while one is in flight', () => {
    const project = makeProject({
      stepState: { step: 'style', startedAt: new Date().toISOString() },
    });
    try {
      assertCanRun(project, 'characters');
      assert.fail('expected assertCanRun to throw');
    } catch (err) {
      assert.equal(err.details.code, 'step_in_progress');
      assert.match(err.message, /wait for it to finish/);
    }
  });

  test('a stranded claim can be taken over', () => {
    const staleStart = new Date(Date.now() - 20 * 60_000).toISOString();
    const project = makeProject({
      stepState: { step: 'style', startedAt: staleStart },
    });
    assert.doesNotThrow(() => assertCanRun(project, 'style'));
  });

  test('a fresh claim is never called stranded', () => {
    const project = makeProject({
      stepState: { step: 'style', startedAt: new Date().toISOString() },
    });
    assert.equal(isStranded(project), false);
  });

  test('image steps use the longer (10 min) threshold, text steps the shorter one', () => {
    const eightMinutesAgo = new Date(Date.now() - 8 * 60_000).toISOString();

    const textProject = makeProject({
      stepState: { step: 'style', startedAt: eightMinutesAgo },
    });
    assert.equal(isStranded(textProject), true, 'style (text) should be stranded at 8 min');

    const imageProject = makeProject({
      stepState: { step: 'portraits', startedAt: eightMinutesAgo },
    });
    assert.equal(
      isStranded(imageProject),
      false,
      'portraits (image) should not be stranded at 8 min'
    );
  });
});

describe('derived state', () => {
  test('projectStatus reports draft correctly', () => {
    const project = makeProject();
    assert.equal(projectStatus(project), 'draft');
  });

  test('projectStatus reports in_progress correctly', () => {
    const project = makeProject({
      stepState: { step: 'style', startedAt: new Date().toISOString() },
    });
    assert.equal(projectStatus(project), 'in_progress');
  });

  test('projectStatus reports done correctly', () => {
    const project = makeProject();
    for (const step of STEPS) markDone(project, step);
    assert.equal(projectStatus(project), 'done');
  });

  test('projectStatus reports error correctly', () => {
    const project = makeProject();
    markDone(project, 'style');
    markError(project, 'characters');
    assert.equal(projectStatus(project), 'error');
  });

  test('nextRunnableStep points at the next step to run', () => {
    const project = makeProject();
    markDone(project, 'style');
    assert.equal(nextRunnableStep(project), 'characters');
  });

  test('nextRunnableStep is null when finished', () => {
    const project = makeProject();
    for (const step of STEPS) markDone(project, step);
    assert.equal(nextRunnableStep(project), null);
  });
});
