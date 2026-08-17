import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createFakeClient } from '../src/gemini/fake-client.js';
import {
  makeApp,
  makeProject,
  runStepDirect,
  runWholePipelineDirect,
  gatedClient,
  failingClient,
  simulateCrashedClaim,
} from './helpers.js';

describe('no duplicate Gemini calls', () => {
  test('first run of a step is accepted, a concurrent second request gets 409', async () => {
    const app = await makeApp({});
    const project = await makeProject(app);

    const claimed = await app.pipeline.start(project.id, 'style', {});
    assert.equal(claimed.steps.style.status, 'running');

    await assert.rejects(
      () => app.pipeline.start(project.id, 'style', {}),
      (err) => err.status === 409
    );

    await app.pipeline.settled(project.id);
    await app.cleanup();
  });

  test('a client that refreshes mid-step is told the in-flight state, not an error', async () => {
    const gated = gatedClient(createFakeClient({}));
    const app = await makeApp({ client: gated });
    const project = await makeProject(app);

    gated.hold();
    await app.pipeline.start(project.id, 'style', {});

    const mid = await app.store.getProject(project.id);
    assert.equal(mid.steps.style.status, 'running');
    assert.equal(mid.steps.style.error, null);
    assert.ok(mid.stepState);
    assert.equal(mid.stepState.step, 'style');

    gated.release();
    await app.pipeline.settled(project.id);

    const done = await app.store.getProject(project.id);
    assert.equal(done.steps.style.status, 'done');
    await app.cleanup();
  });

  test('across a duplicate attempt the book is uploaded exactly once', async () => {
    const gated = gatedClient(createFakeClient({}));
    const app = await makeApp({ client: gated });
    const project = await makeProject(app);

    gated.hold();
    await app.pipeline.start(project.id, 'style', {});
    await assert.rejects(() => app.pipeline.start(project.id, 'style', {}));
    gated.release();
    await app.pipeline.settled(project.id);

    assert.equal(gated.calls.uploadFile, 1);
    await app.cleanup();
  });
});

describe('failure and retry', () => {
  test('a failing client records a failed step without losing the rest of the project', async () => {
    const app = await makeApp({ client: failingClient(createFakeClient({}), () => true) });
    const project = await makeProject(app);

    const after = await runStepDirect(app, project.id, 'style', {});
    assert.equal(after.steps.style.status, 'error');
    assert.ok(after.steps.style.error);
    assert.equal(after.stepState, null);
    assert.equal(after.title, project.title);
    assert.equal(after.id, project.id);
    await app.cleanup();
  });

  test('retrying a failed step with a working client succeeds', async () => {
    const app = await makeApp({ client: failingClient(createFakeClient({}), () => true) });
    const project = await makeProject(app);
    await runStepDirect(app, project.id, 'style', {});

    const app2 = await makeApp({ dataDir: app.dataDir, client: createFakeClient({}) });
    const after = await runStepDirect(app2, project.id, 'style', {});
    assert.equal(after.steps.style.status, 'done');
    assert.ok(after.style);
    await app.cleanup();
  });

  test('retry does not re-upload the book or redo a turn that already has an id', async () => {
    // Fails on the SECOND non-image interaction call (the style-generation
    // turn) — the book upload and the book-seed interaction have already
    // succeeded and been persisted by that point.
    const failing = failingClient(createFakeClient({}), ({ kind, count }) => {
      return kind === 'interaction' && count === 2;
    });
    const app = await makeApp({ client: failing });
    const project = await makeProject(app);

    const failed = await runStepDirect(app, project.id, 'style', {});
    assert.equal(failed.steps.style.status, 'error');
    assert.ok(failed.gemini.bookFileUri);
    assert.ok(failed.gemini.bookInteractionId);
    assert.equal(failed.gemini.styleInteractionId, null);

    const base = createFakeClient({});
    const calls = { uploadFile: 0, createInteraction: 0 };
    const counting = {
      async uploadFile(args) {
        calls.uploadFile += 1;
        return base.uploadFile(args);
      },
      async createInteraction(args) {
        calls.createInteraction += 1;
        return base.createInteraction(args);
      },
    };

    const app2 = await makeApp({ dataDir: app.dataDir, client: counting });
    const done = await runStepDirect(app2, project.id, 'style', {});

    assert.equal(done.steps.style.status, 'done');
    assert.equal(calls.uploadFile, 0, 'retry must not re-upload the book');
    assert.equal(
      calls.createInteraction,
      1,
      'retry must not redo the book-seed turn, only the style-generation turn'
    );
    await app.cleanup();
  });

  test('a failure on the second image leaves the first image file in place; retry only regenerates the missing one', async () => {
    const failing = failingClient(
      createFakeClient({}),
      ({ kind, count }) => kind === 'imageGen' && count === 2
    );
    const app = await makeApp({ client: failing });
    const project = await makeProject(app);

    await runStepDirect(app, project.id, 'style', {});
    await runStepDirect(app, project.id, 'characters', {});
    const afterFail = await runStepDirect(app, project.id, 'portraits', {});

    assert.equal(afterFail.steps.portraits.status, 'error');
    assert.equal(afterFail.characters[0].imageStatus, 'done');
    assert.ok(afterFail.characters[0].image);
    assert.equal(afterFail.characters[1].imageStatus, 'error');
    assert.equal(afterFail.characters[1].image, null);

    const firstImageOnDisk = await app.store.imagePath(project.id, afterFail.characters[0].image);
    assert.ok(firstImageOnDisk);

    const app2 = await makeApp({ dataDir: app.dataDir, client: createFakeClient({}) });
    const afterRetry = await runStepDirect(app2, project.id, 'portraits', {});

    assert.equal(afterRetry.steps.portraits.status, 'done');
    assert.equal(afterRetry.characters[0].image, afterFail.characters[0].image);
    assert.ok(afterRetry.characters[1].image);
    assert.equal(afterRetry.characters[1].imageStatus, 'done');
    await app.cleanup();
  });
});

describe('stuck-step recovery', () => {
  test('reset refuses to clear a claim that is still plausibly alive', async () => {
    const app = await makeApp({});
    const project = await makeProject(app);
    await simulateCrashedClaim(app, project.id, 'style', { ageMs: 30_000 });

    await assert.rejects(
      () => app.pipeline.reset(project.id),
      (err) => err.status === 409
    );
    await app.cleanup();
  });

  test('reset flags a claim nobody is working on as stalled once past the threshold, and the retry works', async () => {
    const app = await makeApp({});
    const project = await makeProject(app);
    await simulateCrashedClaim(app, project.id, 'style', { ageMs: 4 * 60_000 });

    const reset = await app.pipeline.reset(project.id);
    assert.equal(reset.steps.style.status, 'error');
    assert.equal(reset.stepState, null);
    assert.match(reset.steps.style.error, /restart/i);

    const after = await runStepDirect(app, project.id, 'style', {});
    assert.equal(after.steps.style.status, 'done');
    await app.cleanup();
  });
});

describe('server-side caps', () => {
  test('characters are capped at limits.maxCharacters even though the client returns 4', async () => {
    const app = await makeApp({});
    const project = await makeProject(app);
    await runStepDirect(app, project.id, 'style', {});

    const after = await runStepDirect(app, project.id, 'characters', {});
    assert.equal(after.characters.length, app.limits.maxCharacters);
    assert.deepEqual(
      after.characters.map((c) => c.name),
      ['Mr. Toad', 'Badger']
    );
    await app.cleanup();
  });

  test('chapters are capped at limits.maxChapters even though the client returns 3', async () => {
    const app = await makeApp({});
    const project = await makeProject(app);
    await runStepDirect(app, project.id, 'style', {});
    await runStepDirect(app, project.id, 'characters', {});
    await runStepDirect(app, project.id, 'portraits', {});

    const after = await runStepDirect(app, project.id, 'chapters', {});
    assert.equal(after.chapters.length, app.limits.maxChapters);
    assert.equal(after.chapters[0].name, 'The River Bank');
    await app.cleanup();
  });
});

describe('end to end sanity', () => {
  test('the whole pipeline runs through the fake client', async () => {
    const app = await makeApp({});
    const project = await makeProject(app);
    const done = await runWholePipelineDirect(app, project.id, { style: '' });

    assert.equal(done.steps.style.status, 'done');
    assert.equal(done.steps.characters.status, 'done');
    assert.equal(done.steps.portraits.status, 'done');
    assert.equal(done.steps.chapters.status, 'done');
    assert.equal(done.steps.illustrations.status, 'done');

    assert.ok(done.characters.every((c) => c.image));
    assert.ok(done.chapters.every((c) => c.image));
    await app.cleanup();
  });

  test('a user-supplied style is used verbatim instead of calling GENERATE_STYLE', async () => {
    const app = await makeApp({});
    const project = await makeProject(app);
    const after = await runStepDirect(app, project.id, 'style', { style: 'Bold pop art' });
    assert.equal(after.style, 'Bold pop art');
    assert.equal(after.styleSource, 'user');
    await app.cleanup();
  });
});
