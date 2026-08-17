import express from 'express';

import { wrap } from '../lib/wrap.js';
import { requireEmail, requireString } from '../lib/validate.js';
import { sessionMiddleware } from '../middleware/session.js';

export function createAuthRouter({ store }) {
  const router = express.Router();

  router.post(
    '/auth/session',
    wrap(async (req, res) => {
      const email = requireEmail(req.body?.email);
      const name = requireString(req.body?.name, 'name', { min: 2, max: 80 });

      const { user, created } = await store.findOrCreateUser({ email, name });
      res.status(created ? 201 : 200).json({
        token: user.id,
        user: { id: user.id, email: user.email, name: user.name },
        created,
      });
    })
  );

  router.get(
    '/me',
    sessionMiddleware(store),
    wrap(async (req, res) => {
      res.json({ user: { id: req.user.id, email: req.user.email, name: req.user.name } });
    })
  );

  return router;
}
