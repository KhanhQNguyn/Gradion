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

    // The header is the primary path for every fetch()-driven call —
    // api.js's call() always sends it and never the query param. The
    // query-param fallback exists ONLY because <img> tags are plain
    // browser-native requests that can't attach custom headers — there's
    // no way for ArtCard's <img src={imageUrl}> to send an Authorization
    // header. It's implemented here, on the whole middleware, rather
    // than route-scoped to just /images/*, so the same fallback covers
    // every route this middleware guards, but in practice only the image
    // route's URLs (built by api.authedImageUrl) ever carry it. A leaked
    // image URL exposes the same token a leaked Authorization header
    // would, replayable against any endpoint if someone bothers to copy
    // it out and re-send it by hand — narrower than a leaked password in
    // that it's still just "the same bearer token," but real. See
    // DECISIONS.md for why this trade was accepted anyway.
    const token = match ? match[1].trim() : typeof req.query.token === 'string' ? req.query.token : null;
    if (!token) {
      throw unauthorized();
    }

    const user = await store.getUser(token);
    if (!user) {
      throw unauthorized('That session is no longer valid — sign in again.');
    }

    req.user = user;
    next();
  });
}
