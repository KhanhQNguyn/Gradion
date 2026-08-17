import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { config as defaultConfig } from '../src/config.js';
import { STEPS } from '../src/domain/steps.js';
import { createFakeClient } from '../src/gemini/fake-client.js';
import { ProviderError } from '../src/lib/errors.js';

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

// Builds a whole app (store + pipeline + Express) on a throwaway temp
// directory, unless an existing dataDir is passed in, in which case it
// builds a *second* app over the *same* files — this is how tests
// simulate a server restart: fresh in-memory state (new pipeline, empty
// in-flight map), same on-disk state. gemini.fake is always forced true
// (with test model names swapped in) regardless of the real .env; the
// injected `client` (fake/gated/failing) is what the pipeline actually
// calls, independent of that flag.
export async function makeApp({ client, dataDir, limits = TEST_LIMITS } = {}) {
  const isTemp = !dataDir;
  const finalDataDir = dataDir || (await fs.mkdtemp(path.join(os.tmpdir(), 'be-app-test-')));

  const testConfig = {
    ...defaultConfig,
    dataDir: finalDataDir,
    gemini: {
      ...defaultConfig.gemini,
      fake: true,
      textModel: 'test-text-model',
      imageModel: 'test-image-model',
    },
    limits,
  };

  const testClient = client || createFakeClient({});
  const built = await createApp({
    config: testConfig,
    client: testClient,
    logger: { error() {} }, // expected-failure tests would otherwise be noisy
  });

  return {
    app: built.app,
    store: built.store,
    pipeline: built.pipeline,
    client: built.client,
    config: testConfig,
    limits,
    gemini: { textModel: testConfig.gemini.textModel, imageModel: testConfig.gemini.imageModel },
    dataDir: finalDataDir,
    async cleanup() {
      if (isTemp) await fs.rm(finalDataDir, { recursive: true, force: true });
    },
  };
}

export async function makeProject(ctx, { email = 'reader@example.com', title = 'Wind Book' } = {}) {
  const { user } = await ctx.store.findOrCreateUser({ email, name: 'Reader' });
  return ctx.store.createProject({ userId: user.id, title, bookText: BOOK });
}

// ---------------------------------------------------------------------
// Store/pipeline-level helpers — call the pipeline directly, no HTTP.
// ---------------------------------------------------------------------

export async function runStepDirect(ctx, projectId, step, input) {
  await ctx.pipeline.start(projectId, step, input);
  await ctx.pipeline.settled(projectId);
  return ctx.store.getProject(projectId);
}

export async function runWholePipelineDirect(ctx, projectId, { style } = {}) {
  for (const step of STEPS) {
    await runStepDirect(ctx, projectId, step, step === 'style' ? { style } : undefined);
  }
  return ctx.store.getProject(projectId);
}

// ---------------------------------------------------------------------
// HTTP-level helpers — drive the app exactly like the frontend would.
// ---------------------------------------------------------------------

export async function signIn(ctx, { email = 'reader@example.com', name = 'Reader' } = {}) {
  return request(ctx.app).post('/api/auth/session').send({ email, name });
}

export async function createProject(ctx, token, { title = 'Wind Book', text = BOOK } = {}) {
  return request(ctx.app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, text });
}

export async function runStep(ctx, token, projectId, step, body = {}) {
  return request(ctx.app)
    .post(`/api/projects/${projectId}/steps/${step}/run`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

export async function getProject(ctx, token, projectId) {
  return request(ctx.app)
    .get(`/api/projects/${projectId}`)
    .set('Authorization', `Bearer ${token}`);
}

// Runs a step over HTTP, waits for the (never-rejecting) pipeline
// execution to settle, then returns the freshly-polled project response.
export async function runStepAndSettle(ctx, token, projectId, step, body = {}) {
  const started = await runStep(ctx, token, projectId, step, body);
  if (started.status >= 400) return started;
  await ctx.pipeline.settled(projectId);
  return getProject(ctx, token, projectId);
}

export async function runWholePipeline(ctx, token, projectId, { style } = {}) {
  let res;
  for (const step of STEPS) {
    const body = step === 'style' ? { style } : {};
    res = await runStepAndSettle(ctx, token, projectId, step, body);
    if (res.status >= 400) return res;
  }
  return res;
}

// ---------------------------------------------------------------------
// Client test doubles.
// ---------------------------------------------------------------------

// Wraps a base client so a caller can pause any in-flight call until
// release() is invoked — used to widen the window in which a duplicate
// start() attempt would race the first one. Records every call in .calls.
export function gatedClient(base = createFakeClient({})) {
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

// Two call shapes:
//   failingClient('message')            -> always throws from
//                                          createInteraction, uploadFile
//                                          still works, for tests that
//                                          just need "the step fails".
//   failingClient(base, shouldFail)     -> wraps `base`, throwing only
//                                          when shouldFail({kind, count,
//                                          args}) is true. kind is
//                                          'upload', 'imageGen', or
//                                          'interaction' (any non-image
//                                          createInteraction call); count
//                                          is a 1-based counter scoped to
//                                          that kind.
export function failingClient(baseOrMessage, shouldFail) {
  if (typeof baseOrMessage === 'string' || baseOrMessage === undefined) {
    const message = baseOrMessage || 'Simulated failure';
    const base = createFakeClient({});
    return {
      async uploadFile(args) {
        return base.uploadFile(args);
      },
      async createInteraction() {
        throw new ProviderError({ status: 500, body: message });
      },
    };
  }

  const base = baseOrMessage;
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
// Accepts either a store directly or a ctx/app object that has one, and
// either a bare ageMs number or { ageMs }.
export async function simulateCrashedClaim(ctxOrStore, projectId, step, ageMsOrOptions) {
  const store = ctxOrStore.store ?? ctxOrStore;
  const ageMs = typeof ageMsOrOptions === 'number' ? ageMsOrOptions : ageMsOrOptions.ageMs;
  const startedAt = new Date(Date.now() - ageMs).toISOString();

  return store.updateProject(projectId, (draft) => {
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
