import { unauthorized } from '../lib/errors.js';
import { wrap } from '../lib/wrap.js';

// This is not authentication and doesn't pretend to be — the spec asks
// for email+name with no password/OAuth and leaves session
// representation up to us. The bearer token IS the user id: anyone
// holding a user id can act as that user. That's why this ships
// local-only, not something a "real" deployment would keep as-is.
export function sessionMiddleware(store) {
  return wrap(async (req, res, next) => {
    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      throw unauthorized();
    }

    const token = match[1].trim();
    const user = await store.getUser(token);
    if (!user) {
      throw unauthorized('That session is no longer valid — sign in again.');
    }

    req.user = user;
    next();
  });
}
