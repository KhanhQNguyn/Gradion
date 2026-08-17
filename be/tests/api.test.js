import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { makeApp, signIn, createProject, runStep, getProject, BOOK } from './helpers.js';

describe('auth', () => {
  test('a user is created on first sight of an email, and the same user is returned the second time', async () => {
    const ctx = await makeApp({});
    try {
      const first = await signIn(ctx, { email: 'a@example.com', name: 'Alice' });
      assert.equal(first.status, 201);
      assert.equal(first.body.created, true);
      assert.equal(first.body.user.email, 'a@example.com');

      const second = await signIn(ctx, { email: 'A@Example.com', name: 'Alice' });
      assert.equal(second.status, 200);
      assert.equal(second.body.created, false);
      assert.equal(second.body.user.id, first.body.user.id);
    } finally {
      await ctx.cleanup();
    }
  });

  test('a bad email is rejected', async () => {
    const ctx = await makeApp({});
    try {
      const res = await signIn(ctx, { email: 'not-an-email', name: 'Alice' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'bad_request');
    } finally {
      await ctx.cleanup();
    }
  });

  test('a missing name is rejected', async () => {
    const ctx = await makeApp({});
    try {
      const res = await request(ctx.app)
        .post('/api/auth/session')
        .send({ email: 'a@example.com' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'bad_request');
    } finally {
      await ctx.cleanup();
    }
  });

  test('project routes refuse access without a valid token', async () => {
    const ctx = await makeApp({});
    try {
      const noToken = await request(ctx.app).get('/api/projects');
      assert.equal(noToken.status, 401);

      const badToken = await request(ctx.app)
        .get('/api/projects')
        .set('Authorization', 'Bearer usr_doesnotexist');
      assert.equal(badToken.status, 401);
    } finally {
      await ctx.cleanup();
    }
  });
});

describe('projects', () => {
  test("a fresh user's project list starts empty", async () => {
    const ctx = await makeApp({});
    try {
      const { body } = await signIn(ctx, { email: 'fresh@example.com', name: 'Fresh' });
      const list = await request(ctx.app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${body.token}`);
      assert.equal(list.status, 200);
      assert.deepEqual(list.body.projects, []);
    } finally {
      await ctx.cleanup();
    }
  });

  test('creating a project starts it in draft with five pending steps', async () => {
    const ctx = await makeApp({});
    try {
      const { body } = await signIn(ctx, { email: 'writer@example.com', name: 'Writer' });
      const res = await createProject(ctx, body.token, { title: 'My Book', text: BOOK });

      assert.equal(res.status, 201);
      assert.equal(res.body.project.status, 'draft');
      assert.equal(res.body.project.steps.length, 5);
      assert.ok(res.body.project.steps.every((s) => s.status === 'pending'));
      assert.equal(res.body.project.stepState, null);
      assert.equal(res.body.project.currentStep, 'style');
    } finally {
      await ctx.cleanup();
    }
  });

  test('title validation rejects an empty or oversized title', async () => {
    const ctx = await makeApp({});
    try {
      const { body } = await signIn(ctx, { email: 'writer2@example.com', name: 'Writer' });

      const empty = await createProject(ctx, body.token, { title: '', text: BOOK });
      assert.equal(empty.status, 400);

      const huge = await createProject(ctx, body.token, { title: 'x'.repeat(200), text: BOOK });
      assert.equal(huge.status, 400);
    } finally {
      await ctx.cleanup();
    }
  });

  test('book text validation rejects text under the minimum length', async () => {
    const ctx = await makeApp({});
    try {
      const { body } = await signIn(ctx, { email: 'writer3@example.com', name: 'Writer' });
      const res = await createProject(ctx, body.token, { title: 'Too Short', text: 'short book' });
      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /short/i);
    } finally {
      await ctx.cleanup();
    }
  });

  test('the book text is served in full from its own endpoint and is NOT inlined into GET /projects/:id', async () => {
    const ctx = await makeApp({});
    try {
      const { body } = await signIn(ctx, { email: 'reader@example.com', name: 'Reader' });
      const created = await createProject(ctx, body.token, { title: 'Book', text: BOOK });
      const projectId = created.body.project.id;

      const project = await getProject(ctx, body.token, projectId);
      assert.equal(project.body.project.bookText, undefined);

      const book = await request(ctx.app)
        .get(`/api/projects/${projectId}/book`)
        .set('Authorization', `Bearer ${body.token}`);
      assert.equal(book.status, 200);
      assert.equal(book.body.text, BOOK);
    } finally {
      await ctx.cleanup();
    }
  });

  test("listing only ever shows the signed-in user's own projects, newest first", async () => {
    const ctx = await makeApp({});
    try {
      const alice = await signIn(ctx, { email: 'alice@example.com', name: 'Alice' });
      const bob = await signIn(ctx, { email: 'bob@example.com', name: 'Bob' });

      await createProject(ctx, alice.body.token, { title: 'Alice One', text: BOOK });
      await createProject(ctx, alice.body.token, { title: 'Alice Two', text: BOOK });
      await createProject(ctx, bob.body.token, { title: 'Bob One', text: BOOK });

      const aliceList = await request(ctx.app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${alice.body.token}`);
      assert.equal(aliceList.body.projects.length, 2);
      assert.deepEqual(
        aliceList.body.projects.map((p) => p.title),
        ['Alice Two', 'Alice One']
      );

      const bobList = await request(ctx.app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${bob.body.token}`);
      assert.equal(bobList.body.projects.length, 1);
      assert.equal(bobList.body.projects[0].title, 'Bob One');
    } finally {
      await ctx.cleanup();
    }
  });

  test('an unknown project id 404s', async () => {
    const ctx = await makeApp({});
    try {
      const { body } = await signIn(ctx, { email: 'x@example.com', name: 'Xavier' });
      const res = await getProject(ctx, body.token, 'prj_doesnotexist');
      assert.equal(res.status, 404);
    } finally {
      await ctx.cleanup();
    }
  });

  test('a path-traversal attempt on the image route is rejected, not served', async () => {
    const ctx = await makeApp({});
    try {
      const { body } = await signIn(ctx, { email: 'y@example.com', name: 'Yasmin' });
      const created = await createProject(ctx, body.token, { title: 'Book', text: BOOK });
      const projectId = created.body.project.id;

      const res = await request(ctx.app)
        .get(`/api/projects/${projectId}/images/${encodeURIComponent('../../../etc/passwd')}`)
        .set('Authorization', `Bearer ${body.token}`);
      assert.notEqual(res.status, 200);
      assert.ok([400, 404].includes(res.status));
    } finally {
      await ctx.cleanup();
    }
  });

  test('an unknown step name on the run route is rejected', async () => {
    const ctx = await makeApp({});
    try {
      const { body } = await signIn(ctx, { email: 'z@example.com', name: 'Zed' });
      const created = await createProject(ctx, body.token, { title: 'Book', text: BOOK });
      const projectId = created.body.project.id;

      const res = await runStep(ctx, body.token, projectId, 'not-a-real-step');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'bad_request');
    } finally {
      await ctx.cleanup();
    }
  });
});

describe('health', () => {
  test('GET /api/health reports mode, models, and caps', async () => {
    const ctx = await makeApp({});
    try {
      const res = await request(ctx.app).get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.gemini, 'stub');
      assert.equal(res.body.models.text, 'test-text-model');
      assert.equal(res.body.models.image, 'test-image-model');
      assert.equal(res.body.caps.characters, 2);
      assert.equal(res.body.caps.chapters, 1);
    } finally {
      await ctx.cleanup();
    }
  });
});
