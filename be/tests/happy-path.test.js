import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { makeApp, signIn, createProject, runStepAndSettle, getProject, BOOK } from './helpers.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('one project, signed in, goes through all five steps end to end — including a simulated restart', async () => {
  const ctx = await makeApp({});
  try {
    const { body: session } = await signIn(ctx, { email: 'author@example.com', name: 'Author' });
    const token = session.token;

    const created = await createProject(ctx, token, { title: 'Wind in the Willows', text: BOOK });
    assert.equal(created.status, 201);
    const projectId = created.body.project.id;

    // Style and characters, on the first instance.
    const afterStyle = await runStepAndSettle(ctx, token, projectId, 'style', {});
    assert.equal(afterStyle.body.project.steps[0].status, 'done');
    assert.ok(afterStyle.body.project.style && afterStyle.body.project.style.length > 0);

    const afterCharacters = await runStepAndSettle(ctx, token, projectId, 'characters', {});
    assert.equal(afterCharacters.body.project.steps[1].status, 'done');
    // The stub offers 4 characters — the server caps to 2.
    assert.equal(afterCharacters.body.project.characters.length, 2);
    for (const character of afterCharacters.body.project.characters) {
      assert.ok(character.prompt && character.prompt.length > 0);
    }

    const afterPortraits = await runStepAndSettle(ctx, token, projectId, 'portraits', {});
    assert.equal(afterPortraits.body.project.steps[2].status, 'done');
    for (const character of afterPortraits.body.project.characters) {
      assert.ok(character.image);
      assert.ok(character.imageUrl);
    }

    // Fetch and verify a portrait is a real PNG (magic bytes), not just a
    // file that happens to exist.
    const portraitFilename = afterPortraits.body.project.characters[0].image;
    const portraitRes = await request(ctx.app)
      .get(`/api/projects/${projectId}/images/${portraitFilename}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(portraitRes.status, 200);
    const portraitBytes = Buffer.from(portraitRes.body);
    assert.deepEqual(portraitBytes.subarray(0, 8), PNG_MAGIC);

    // Simulate a server restart: build a SECOND app instance over the
    // SAME on-disk data directory and continue the same project from
    // wherever it left off.
    const ctx2 = await makeApp({ dataDir: ctx.dataDir });
    try {
      const resumed = await getProject(ctx2, token, projectId);
      assert.equal(resumed.status, 200);
      assert.equal(resumed.body.project.steps[2].status, 'done'); // portraits survived the restart

      const afterChapters = await runStepAndSettle(ctx2, token, projectId, 'chapters', {});
      assert.equal(afterChapters.body.project.steps[3].status, 'done');
      // The stub offers 3 chapters — the server caps to 1.
      assert.equal(afterChapters.body.project.chapters.length, 1);

      const afterIllustrations = await runStepAndSettle(
        ctx2,
        token,
        projectId,
        'illustrations',
        {}
      );
      assert.equal(afterIllustrations.body.project.steps[4].status, 'done');
      for (const chapter of afterIllustrations.body.project.chapters) {
        assert.ok(chapter.image);
      }

      assert.equal(afterIllustrations.body.project.status, 'done');

      // The illustration image is also a real PNG.
      const illustrationFilename = afterIllustrations.body.project.chapters[0].image;
      const illustrationRes = await request(ctx2.app)
        .get(`/api/projects/${projectId}/images/${illustrationFilename}`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(illustrationRes.status, 200);
      const illustrationBytes = Buffer.from(illustrationRes.body);
      assert.deepEqual(illustrationBytes.subarray(0, 8), PNG_MAGIC);

      // The project shows as done in the list view too.
      const list = await request(ctx2.app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`);
      const row = list.body.projects.find((p) => p.id === projectId);
      assert.ok(row);
      assert.equal(row.status, 'done');
    } finally {
      // Same dataDir as ctx — only clean up once, via ctx.cleanup().
      await ctx2.cleanup?.();
    }
  } finally {
    await ctx.cleanup();
  }
});
