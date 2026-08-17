import fs from 'node:fs/promises';
import path from 'node:path';

import { ensureDir, readJson, writeJsonAtomic, writeFileAtomic, newId } from '../lib/fs-json.js';
import { withLock } from '../lib/lock.js';
import { notFound } from '../lib/errors.js';
import { emptySteps } from '../domain/steps.js';

const PROJECT_ID_RE = /^prj_[a-z0-9]+$/i;
const IMAGE_FILENAME_RE = /^[a-z0-9._-]+\.png$/i;

export function createStore({ dataDir }) {
  const usersDir = path.join(dataDir, 'users');
  const projectsDir = path.join(dataDir, 'projects');

  const paths = {
    dataDir,
    usersIndexFile: () => path.join(usersDir, 'index.json'),
    userFile: (userId) => path.join(usersDir, `${userId}.json`),
    projectDir: (projectId) => path.join(projectsDir, projectId),
    projectFile: (projectId) => path.join(projectsDir, projectId, 'project.json'),
    bookFile: (projectId) => path.join(projectsDir, projectId, 'book.txt'),
    imagesDir: (projectId) => path.join(projectsDir, projectId, 'images'),
  };

  async function init() {
    await ensureDir(usersDir);
    await ensureDir(projectsDir);
  }

  async function findOrCreateUser({ email, name }) {
    return withLock('users:index', async () => {
      const normalizedEmail = email.trim().toLowerCase();
      const index = await readJson(paths.usersIndexFile(), {});

      const existingId = index[normalizedEmail];
      if (existingId) {
        const user = await readJson(paths.userFile(existingId), null);
        if (user && name && name.trim() && name.trim() !== user.name) {
          user.name = name.trim();
          await writeJsonAtomic(paths.userFile(user.id), user);
        }
        return { user, created: false };
      }

      const user = {
        id: newId('usr'),
        email: normalizedEmail,
        name: name.trim(),
        createdAt: new Date().toISOString(),
        projectIds: [],
      };
      await writeJsonAtomic(paths.userFile(user.id), user);
      index[normalizedEmail] = user.id;
      await writeJsonAtomic(paths.usersIndexFile(), index);
      return { user, created: true };
    });
  }

  async function getUser(userId) {
    return readJson(paths.userFile(userId), null);
  }

  // `steps` (history) and `stepState` (the live claim) are kept separate
  // because one status enum can't say "steps 1-3 succeeded, step 4 is
  // running, step 2 failed once on the way" — which is exactly what a
  // refresh mid-step has to read correctly.
  function newProjectRecord({ userId, title }) {
    return {
      id: newId('prj'),
      userId,
      title: title.trim(),
      createdAt: new Date().toISOString(),
      steps: emptySteps(),
      stepState: null,
      gemini: {
        bookFileUri: null,
        bookInteractionId: null,
        styleInteractionId: null,
        charactersInteractionId: null,
        chaptersInteractionId: null,
        imageInteractionId: null,
        illustrationsSeeded: false,
        textModel: null,
        imageModel: null,
      },
      style: null,
      styleSource: null, // 'user' | 'generated'
      characters: [],
      chapters: [],
    };
  }

  // Write order matters: every prefix is a consistent state to crash in.
  // If the process dies after step 1 or 2, there's an orphaned project
  // directory nobody links to — harmless, cleanable. If it dies after step
  // 3, the project file exists and can be opened directly by id, it just
  // isn't in anyone's list yet. The one thing that must never happen is a
  // project that's listed (in the user's projectIds) but whose
  // project.json doesn't exist yet — so the user update happens last.
  async function createProject({ userId, title, bookText }) {
    const project = newProjectRecord({ userId, title });

    await ensureDir(paths.projectDir(project.id));
    await writeFileAtomic(paths.bookFile(project.id), bookText);
    await writeJsonAtomic(paths.projectFile(project.id), project);

    await withLock(`user:${userId}`, async () => {
      const user = await readJson(paths.userFile(userId), null);
      if (!user) throw notFound('User not found.');
      user.projectIds.push(project.id);
      await writeJsonAtomic(paths.userFile(userId), user);
    });

    return project;
  }

  async function getProject(projectId) {
    if (!PROJECT_ID_RE.test(projectId)) return null;
    return readJson(paths.projectFile(projectId), null);
  }

  // One user must never be able to distinguish "not mine" from "doesn't
  // exist" — always 404, never 403.
  async function requireProject(projectId, userId) {
    const project = await getProject(projectId);
    if (!project || project.userId !== userId) {
      throw notFound('Project not found.');
    }
    return project;
  }

  async function listProjects(userId) {
    const user = await getUser(userId);
    if (!user) throw notFound('User not found.');

    const projects = await Promise.all(user.projectIds.map((id) => getProject(id)));
    return projects
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // THE only sanctioned way to change a project. Every route and every
  // pipeline step must go through this — never write project.json
  // directly anywhere else in the codebase.
  async function updateProject(projectId, mutate) {
    return withLock(`project:${projectId}`, async () => {
      const project = await getProject(projectId);
      if (!project) throw notFound('Project not found.');

      const result = await mutate(project);
      await writeJsonAtomic(paths.projectFile(projectId), project);
      return result ?? project;
    });
  }

  async function readBookText(projectId) {
    return fs.readFile(paths.bookFile(projectId), 'utf8');
  }

  async function readBookBytes(projectId) {
    return fs.readFile(paths.bookFile(projectId));
  }

  async function saveImage(projectId, filename, buffer) {
    await ensureDir(paths.imagesDir(projectId));
    await writeFileAtomic(path.join(paths.imagesDir(projectId), filename), buffer);
  }

  // Path-traversal guard on the image route: validate the filename shape,
  // resolve inside images/, and only return a path that actually exists.
  async function imagePath(projectId, filename) {
    if (!IMAGE_FILENAME_RE.test(filename)) return null;
    const full = path.join(paths.imagesDir(projectId), filename);
    try {
      await fs.access(full);
      return full;
    } catch {
      return null;
    }
  }

  return {
    init,
    findOrCreateUser,
    getUser,
    createProject,
    getProject,
    requireProject,
    listProjects,
    updateProject,
    readBookText,
    readBookBytes,
    saveImage,
    imagePath,
    paths,
  };
}
