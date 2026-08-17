import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createStore } from '../src/store/index.js';
import { writeJsonAtomic, readJson } from '../src/lib/fs-json.js';

async function makeTempStore() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'be-store-test-'));
  const store = createStore({ dataDir });
  await store.init();
  return { store, dataDir };
}

async function cleanup(dataDir) {
  await fs.rm(dataDir, { recursive: true, force: true });
}

describe('store: users and projects', () => {
  test('findOrCreateUser creates then reuses, updating name on change', async () => {
    const { store, dataDir } = await makeTempStore();
    try {
      const first = await store.findOrCreateUser({ email: 'A@Example.com', name: 'Alice' });
      assert.equal(first.created, true);
      assert.equal(first.user.email, 'a@example.com');

      const second = await store.findOrCreateUser({ email: 'a@example.com', name: 'Alice B' });
      assert.equal(second.created, false);
      assert.equal(second.user.id, first.user.id);
      assert.equal(second.user.name, 'Alice B');

      const reloaded = await store.getUser(first.user.id);
      assert.equal(reloaded.name, 'Alice B');
    } finally {
      await cleanup(dataDir);
    }
  });

  test('createProject writes book, project file, and links to user', async () => {
    const { store, dataDir } = await makeTempStore();
    try {
      const { user } = await store.findOrCreateUser({ email: 'b@example.com', name: 'Bob' });
      const project = await store.createProject({
        userId: user.id,
        title: 'My Book',
        bookText: 'Once upon a time...',
      });

      const bookText = await store.readBookText(project.id);
      assert.equal(bookText, 'Once upon a time...');

      const fetched = await store.getProject(project.id);
      assert.equal(fetched.id, project.id);
      assert.equal(fetched.userId, user.id);

      const reloadedUser = await store.getUser(user.id);
      assert.deepEqual(reloadedUser.projectIds, [project.id]);
    } finally {
      await cleanup(dataDir);
    }
  });

  test('requireProject 404s on missing id and on a project owned by someone else', async () => {
    const { store, dataDir } = await makeTempStore();
    try {
      const { user: owner } = await store.findOrCreateUser({
        email: 'owner@example.com',
        name: 'Owner',
      });
      const { user: stranger } = await store.findOrCreateUser({
        email: 'stranger@example.com',
        name: 'Stranger',
      });
      const project = await store.createProject({
        userId: owner.id,
        title: 'Owned',
        bookText: 'text'.repeat(100),
      });

      await assert.rejects(
        () => store.requireProject('prj_doesnotexist', owner.id),
        (err) => err.status === 404
      );
      await assert.rejects(
        () => store.requireProject(project.id, stranger.id),
        (err) => err.status === 404
      );
      const ok = await store.requireProject(project.id, owner.id);
      assert.equal(ok.id, project.id);
    } finally {
      await cleanup(dataDir);
    }
  });

  test('getProject returns null for a path-traversal-shaped id, never throws', async () => {
    const { store, dataDir } = await makeTempStore();
    try {
      const result = await store.getProject('../../etc/passwd');
      assert.equal(result, null);

      const result2 = await store.getProject('prj_../../../secret');
      assert.equal(result2, null);
    } finally {
      await cleanup(dataDir);
    }
  });

  test('imagePath rejects non-png/traversal filenames and returns null when file is absent', async () => {
    const { store, dataDir } = await makeTempStore();
    try {
      const { user } = await store.findOrCreateUser({ email: 'c@example.com', name: 'C' });
      const project = await store.createProject({
        userId: user.id,
        title: 'Imgs',
        bookText: 'text'.repeat(100),
      });

      assert.equal(await store.imagePath(project.id, '../../../etc/passwd'), null);
      assert.equal(await store.imagePath(project.id, 'evil.png/../../x'), null);
      assert.equal(await store.imagePath(project.id, 'not-a-png.txt'), null);
      assert.equal(await store.imagePath(project.id, 'missing.png'), null);

      await store.saveImage(project.id, 'portrait.png', Buffer.from([1, 2, 3]));
      const found = await store.imagePath(project.id, 'portrait.png');
      assert.ok(found && found.endsWith('portrait.png'));
    } finally {
      await cleanup(dataDir);
    }
  });
});

describe('store: atomicity and concurrency', () => {
  test('writeJsonAtomic never exposes a half-written file to a concurrent reader', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'be-atomic-test-'));
    try {
      const file = path.join(dataDir, 'big.json');
      const bigValue = (n) => ({ n, payload: 'x'.repeat(200_000) });

      await writeJsonAtomic(file, bigValue(0));

      let readErrors = 0;
      let reads = 0;
      const stop = { flag: false };

      const readerLoop = (async () => {
        while (!stop.flag) {
          reads++;
          try {
            await readJson(file, undefined);
          } catch {
            readErrors++;
          }
        }
      })();

      const writes = [];
      for (let i = 1; i <= 30; i++) {
        writes.push(writeJsonAtomic(file, bigValue(i)));
      }
      await Promise.all(writes);
      stop.flag = true;
      await readerLoop;

      assert.ok(reads > 0, 'reader should have run at least once');
      assert.equal(readErrors, 0, 'every read of the file should parse successfully');
    } finally {
      await cleanup(dataDir);
    }
  });

  test('two concurrent updateProject calls on the same project both land', async () => {
    const { store, dataDir } = await makeTempStore();
    try {
      const { user } = await store.findOrCreateUser({ email: 'd@example.com', name: 'D' });
      const project = await store.createProject({
        userId: user.id,
        title: 'Counters',
        bookText: 'text'.repeat(100),
      });

      await store.updateProject(project.id, (p) => {
        p.counterA = 0;
        p.counterB = 0;
      });

      const incrementA = () =>
        store.updateProject(project.id, (p) => {
          p.counterA += 1;
        });
      const incrementB = () =>
        store.updateProject(project.id, (p) => {
          p.counterB += 1;
        });

      const runsA = Array.from({ length: 20 }, incrementA);
      const runsB = Array.from({ length: 20 }, incrementB);
      await Promise.all([...runsA, ...runsB]);

      const final = await store.getProject(project.id);
      assert.equal(final.counterA, 20);
      assert.equal(final.counterB, 20);
    } finally {
      await cleanup(dataDir);
    }
  });
});
