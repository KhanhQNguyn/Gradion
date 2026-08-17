// A per-key async mutex. This is in-process only — correct for one Node
// process, wrong for two; that's the honest limit of the JSON-files choice,
// not something a cleverer lock fixes.
const tails = new Map();

export async function withLock(key, fn) {
  const prevTail = tails.get(key) || Promise.resolve();
  // Swallow the previous holder's rejection so one failed critical section
  // doesn't poison the next one for this key.
  const swallowedPrev = prevTail.then(
    () => {},
    () => {}
  );

  const run = swallowedPrev.then(fn);
  const tracked = run.then(
    () => {},
    () => {}
  );
  tails.set(key, tracked);

  try {
    return await run;
  } finally {
    // Only delete if nobody queued behind us in the meantime.
    if (tails.get(key) === tracked) {
      tails.delete(key);
    }
  }
}

export function locksIdle() {
  return tails.size === 0;
}
