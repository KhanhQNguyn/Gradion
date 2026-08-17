import express from 'express';

import { wrap } from '../lib/wrap.js';
import { requireString } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import { isStep } from '../domain/steps.js';
import { toProjectView, toProjectSummary } from '../views/project-view.js';

export function createProjectsRouter({ store, pipeline, config }) {
  const router = express.Router();
  const { limits } = config;

  router.get(
    '/projects',
    wrap(async (req, res) => {
      const projects = await store.listProjects(req.user.id);
      res.json({ projects: projects.map((p) => toProjectSummary(p)) });
    })
  );

  router.post(
    '/projects',
    wrap(async (req, res) => {
      const title = requireString(req.body?.title, 'title', { max: limits.maxTitleChars });
      const text = requireString(req.body?.text, 'text', {
        min: limits.minBookChars,
        max: limits.maxBookChars,
      });

      // The browser reads a dropped .txt with the File API and posts its
      // contents as JSON — there's no multipart upload path on the server.
      const project = await store.createProject({ userId: req.user.id, title, bookText: text });
      res.status(201).json({ project: toProjectView(project) });
    })
  );

  router.get(
    '/projects/:id',
    wrap(async (req, res) => {
      const project = await store.requireProject(req.params.id, req.user.id);
      res.json({ project: toProjectView(project) });
    })
  );

  // Kept separate from the polled payload on purpose — a book is hundreds
  // of KB and the client polls every couple of seconds.
  router.get(
    '/projects/:id/book',
    wrap(async (req, res) => {
      const project = await store.requireProject(req.params.id, req.user.id);
      const text = await store.readBookText(project.id);
      res.json({ text });
    })
  );

  router.post(
    '/projects/:id/steps/:step/run',
    wrap(async (req, res) => {
      const { id, step } = req.params;
      if (!isStep(step)) {
        throw badRequest(`Unknown step "${step}".`);
      }

      // requireProject first so a 404 beats a pipeline error for someone
      // else's project.
      await store.requireProject(id, req.user.id);
      const claimed = await pipeline.start(id, step, req.body ?? {});
      res.status(202).json({ project: toProjectView(claimed) });
    })
  );

  router.post(
    '/projects/:id/reset-stuck-step',
    wrap(async (req, res) => {
      await store.requireProject(req.params.id, req.user.id);
      const project = await pipeline.reset(req.params.id);
      res.json({ project: toProjectView(project) });
    })
  );

  router.get(
    '/projects/:id/images/:filename',
    wrap(async (req, res) => {
      await store.requireProject(req.params.id, req.user.id);
      const filePath = await store.imagePath(req.params.id, req.params.filename);
      if (!filePath) {
        throw notFound('Image not found.');
      }
      res.type('png');
      res.set('Cache-Control', 'private, max-age=31536000, immutable');
      res.sendFile(filePath);
    })
  );

  return router;
}
