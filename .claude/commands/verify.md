---
description: Pre-commit gate — run both test suites, then review the diff against this project's non-negotiables.
---

# /verify

A pre-commit gate. Report findings — do not auto-fix anything found here.
That's a separate, explicit step the human asks for.

## 1. Run both test suites

Run `./test.sh` (or `.\test.ps1` on Windows).

- If either suite fails: **stop immediately** and show the raw failing
  output (test name, assertion, stack). Do not proceed to step 2. Do not
  summarize the failure away — paste it.
- If both pass: continue.

## 2. Review the diff against this project's non-negotiables

Run `git diff` (staged and unstaged) against the last commit, or against
the merge-base if this is a branch. Read every changed file in full, not
just the diff hunks — a non-negotiable can be violated by something the
diff doesn't show (e.g. a file that already had the problem and the diff
just touches an adjacent line).

Check for, and flag by `file:line` if found:

1. **Auto-retry loops around `createInteraction`.** Any backoff/retry
   wrapper, any `for`/`while` loop that re-calls `createInteraction` or
   `uploadFile` on failure, any `attempts` option passed into a Gemini
   client call. A step failure must become recorded state
   (`{status:'error', error}`) plus a user-triggered retry, never an
   automatic one. The one allowed loop is `waitUntilActive` polling
   *upload metadata* (a GET on file status) — never a generation call.

2. **The book sent more than once.** `SEED_BOOK` / the book's
   `document`/`file.uri` content must appear in exactly one
   `createInteraction` call — the step-1 seed in `handlers.js`'s `style`
   function, gated behind `!project.gemini.bookInteractionId`. Grep for
   any other place `bookFileUri` or the raw book text reaches
   `client.createInteraction`.

3. **The 2/1 caps being anything other than a hard-coded server-side
   `.slice`.** `config.limits.maxCharacters` / `maxChapters` must not be
   read from `process.env`, must not be adjustable via request body or
   query param, and the enforcement must be a `.slice(0, limits.max...)`
   in `domain/handlers.js` — not a UI-side truncation, not a prompt
   instruction alone ("only return 2"), which the model can ignore.

4. **Any `writeJsonAtomic` on `project.json` outside
   `store.updateProject`.** Grep `writeJsonAtomic` and `writeFileAtomic`
   across `be/src/` — every call touching a project's `project.json` must
   originate inside `store/index.js`'s `updateProject`. A handler, route,
   or pipeline file calling it directly is a lock bypass.

5. **Ordering or stranded-threshold logic leaking into `fe/`.** Grep
   `fe/src` for `Date.now()`, `STRANDED_AFTER_MS`-shaped literals, or any
   comparison that re-derives "is this step allowed to run" /
   "is this claim stale" from timestamps. The frontend renders
   `status`/`currentStep`/`stalled`/`stepState` as given — it must not
   recompute them.

6. **Any new `package.json` dependency without a stated justification.**
   Every new entry in `be/package.json` or `fe/package.json` (root too)
   needs a one-line reason in the commit message or a comment nearby.
   "Might be useful" is not a justification.

7. **Anything resembling a live secret outside `.env.example`.** Grep for
   `AIza`, `sk-`, or any string that looks like an API key, in tracked
   files. `.env.example` must only contain empty/placeholder values.

## 3. Adversarial questions for pipeline/store changes

If the diff touches `domain/pipeline.js`, `domain/handlers.js`,
`domain/steps.js`, or anything under `store/`, ask these three questions
about **every changed function** and demand concrete answers — a line
number, a code path, an actual sequence of events — not reassurance
("this should be fine", "the lock handles it"):

1. **Where can two requests interleave now?** Walk the new/changed code
   assuming a second request for the same project arrives at every
   `await` point. Does it see stale state? Does it double-claim? Does it
   double-write?

2. **What does `project.json` contain if the process dies at the new
   code, and what does the next `GET` render?** Pick the line most likely
   to be mid-execution at a crash (after a `patch()` call, after a
   Gemini call before its `patch()`, etc.) and trace forward: what's on
   disk, what does `toProjectView` produce from it, what does the user
   see.

3. **Does a retry re-pay for something that already succeeded?** For any
   new Gemini call added to a handler, confirm: is its result persisted
   via `patch` *before* the next call, so a second attempt after a crash
   skips it? If not, that's a finding, not a nice-to-have.

## 4. Verdict

End with exactly one of:

- **"Ship it."** — nothing found in steps 2 or 3.
- A **numbered fix list** — one item per finding, each with `file:line`,
  what's wrong, and which non-negotiable or adversarial question it
  fails. No editorializing about how easy the fix is; that's not this
  command's job.
