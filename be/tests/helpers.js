import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createStore } from '../src/store/index.js';
import { createHandlers } from '../src/domain/handlers.js';
import { createPipeline } from '../src/domain/pipeline.js';
import { createFakeClient } from '../src/gemini/fake-client.js';
import { ProviderError } from '../src/lib/errors.js';
import { STEPS } from '../src/domain/steps.js';

// A real ~600-character excerpt — "The Wind in the Willows", the Mole
// spring-cleaning scene — long enough to clear config.limits.minBookChars.
export const BOOK = `
The Mole had been working very hard all the morning, spring-cleaning his little
home. First with brooms, then with dusters; then on ladders and steps and
chairs, with a brush and a pail of whitewash; till he had dust in his throat
and eyes, and splashes of whitewash all over his black fur, and an aching back
and weary arms. Spring was moving in the air above and in the earth below and
around him, penetrating even his dark and lowly little house with its spirit
of divine discontent and longing. It was small wonder, then, that he suddenly
flung down his brush on the floor, said "Bother!" and "O blow!" and also "Hang
spring-cleaning!" and bolted out of the house without even waiting to put on
his coat.
`.trim();

const TEST_LIMITS = {
  maxCharacters: 2,
  maxChapters: 1,
  minBookChars: 200,
  maxBookChars: 2_000_000,
  maxTitleChars: 120,
};

const TEST_GEMINI = {
  textModel: 'test-text-model',
  imageModel: 'test-image-model',
};

// Builds the pipeline-level "app" (store + handlers + pipeline) on a
// throwaway temp directory, unless an existing dataDir is passed in, in
// which case it builds a *second* app over the *same* files — this is
// how later tests simulate a server restart (fresh in-memory state,
// same on-disk state). No Express here yet — that's createApp, built in
// a later prompt on top of these same pieces.
export async function makeApp({ client, dataDir, limits = TEST_LIMITS, now } = {}) {
  const isTemp = !dataDir;
  const finalDataDir = dataDir || (await fs.mkdtemp(path.join(os.tmpdir(), 'be-app-test-')));

  const store = createStore({ dataDir: finalDataDir });
  await store.init();

  const testClient = client || createFakeClient({});
  const handlers = createHandlers({ client: testClient, store, gemini: TEST_GEMINI, limits });
  const pipelineOpts = { store, handlers, logger: { error() {} } };
  if (now) pipelineOpts.now = now;
  const pipeline = createPipeline(pipelineOpts);

  return {
    store,
    client: testClient,
    handlers,
    pipeline,
    limits,
    gemini: TEST_GEMINI,
    dataDir: finalDataDir,
    async cleanup() {
      if (isTemp) await fs.rm(finalDataDir, { recursive: true, force: true });
    },
  };
}

export async function makeProject(app, { email = 'reader@example.com', title = 'Wind Book' } = {}) {
  const { user } = await app.store.findOrCreateUser({ email, name: 'Reader' });
  return app.store.createProject({ userId: user.id, title, bookText: BOOK });
}

// Starts a step and waits for its (never-rejecting) execution to settle,
// then returns the freshly-read project.
export async function runStepAndSettle(app, projectId, step, input) {
  await app.pipeline.start(projectId, step, input);
  await app.pipeline.settled(projectId);
  return app.store.getProject(projectId);
}

export async function runWholePipeline(app, projectId, { style } = {}) {
  for (const step of STEPS) {
    await runStepAndSettle(app, projectId, step, step === 'style' ? { style } : undefined);
  }
  return app.store.getProject(projectId);
}

// Wraps a base client so a caller can pause any in-flight call until
// release() is invoked — used to widen the window in which a duplicate
// start() attempt would race the first one.
export function gatedClient(base) {
  let gate = null;
  let release = null;
  const calls = { uploadFile: 0, createInteraction: 0 };

  return {
    calls,
    hold() {
      gate = new Promise((resolve) => {
        release = resolve;
      });
    },
    release() {
      if (release) release();
      gate = null;
      release = null;
    },
    async uploadFile(args) {
      calls.uploadFile += 1;
      if (gate) await gate;
      return base.uploadFile(args);
    },
    async createInteraction(args) {
      calls.createInteraction += 1;
      if (gate) await gate;
      return base.createInteraction(args);
    },
  };
}

// Wraps a base client so specific calls can be made to fail. `shouldFail`
// receives {kind, count, args} where kind is 'upload', 'imageGen', or
// 'interaction' (any non-image createInteraction call), and count is a
// 1-based counter scoped to that kind.
export function failingClient(base, shouldFail) {
  let uploadCount = 0;
  let interactionCount = 0;
  let imageGenCount = 0;

  return {
    async uploadFile(args) {
      uploadCount += 1;
      if (shouldFail({ kind: 'upload', count: uploadCount, args })) {
        throw new ProviderError({ status: 500, body: 'Simulated upload failure' });
      }
      return base.uploadFile(args);
    },
    async createInteraction(args) {
      const isImageGen =
        typeof args.input === 'string' && args.input.startsWith('Create an illustration');
      if (isImageGen) {
        imageGenCount += 1;
      } else {
        interactionCount += 1;
      }
      const info = isImageGen
        ? { kind: 'imageGen', count: imageGenCount, args }
        : { kind: 'interaction', count: interactionCount, args };

      if (shouldFail(info)) {
        throw new ProviderError({ status: 500, body: 'Simulated interaction failure' });
      }
      return base.createInteraction(args);
    },
  };
}

// Directly manipulates store state to simulate a claim left behind by a
// crashed process — bypasses the pipeline entirely, the way a real
// restart would leave stale stepState on disk with no in-memory timer.
export async function simulateCrashedClaim(app, projectId, step, { ageMs }) {
  const startedAt = new Date(Date.now() - ageMs).toISOString();
  return app.store.updateProject(projectId, (draft) => {
    const attempts = (draft.steps[step]?.attempts || 0) + 1;
    draft.steps[step] = {
      status: 'running',
      startedAt,
      finishedAt: null,
      error: null,
      attempts,
    };
    draft.stepState = { step, startedAt, attempt: attempts };
  });
}
