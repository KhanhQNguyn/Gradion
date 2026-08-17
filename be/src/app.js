import express from 'express';
import cors from 'cors';

import { config as defaultConfig } from './config.js';
import { createStore } from './store/index.js';
import { createHandlers } from './domain/handlers.js';
import { createPipeline } from './domain/pipeline.js';
import { createRestClient } from './gemini/rest-client.js';
import { createFakeClient } from './gemini/fake-client.js';
import { createHybridClient } from './gemini/hybrid-client.js';
import { createAuthRouter } from './routes/auth.js';
import { createProjectsRouter } from './routes/projects.js';
import { sessionMiddleware } from './middleware/session.js';
import { HttpError } from './lib/errors.js';

export async function createApp({ config = defaultConfig, client, logger = console } = {}) {
  const store = createStore({ dataDir: config.dataDir });
  await store.init();

  // Three modes: fully stubbed (tests, agent-run commands), hybrid (live
  // text + mocked image — the reviewer-facing demo mode), fully live.
  // This is THE injection point every test relies on.
  const geminiClient =
    client ??
    (config.gemini.fake
      ? createFakeClient()
      : config.gemini.imageFake
        ? createHybridClient({
            real: createRestClient(config.gemini),
            fake: createFakeClient(),
            imageModel: config.gemini.imageModel,
          })
        : createRestClient(config.gemini));

  const handlers = createHandlers({
    client: geminiClient,
    store,
    gemini: { textModel: config.gemini.textModel, imageModel: config.gemini.imageModel },
    limits: config.limits,
  });
  const pipeline = createPipeline({ store, handlers, logger });

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: true }));
  // A whole book arrives in one body.
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (req, res) => {
    const mode = config.gemini.fake
      ? 'stub'
      : config.gemini.imageFake
        ? 'hybrid (live text, stubbed image)'
        : 'live';
    res.json({
      ok: true,
      gemini: mode,
      models: { text: config.gemini.textModel, image: config.gemini.imageModel },
      caps: { characters: config.limits.maxCharacters, chapters: config.limits.maxChapters },
    });
  });

  app.use('/api', createAuthRouter({ store }));
  app.use('/api', sessionMiddleware(store), createProjectsRouter({ store, pipeline, config }));

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint.' } });
  });

  // Single error shape for the whole API.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      });
    }
    if (err.type === 'entity.too.large') {
      return res
        .status(413)
        .json({ error: { code: 'too_large', message: 'That book is too large to upload.' } });
    }
    logger.error(err);
    res.status(500).json({ error: { code: 'internal', message: 'Something went wrong on the server.' } });
  });

  return { app, store, pipeline, client: geminiClient, config };
}
