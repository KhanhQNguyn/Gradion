---
description: Add a 6th pipeline step without a rewrite. Usage — /add-step <name>
argument-hint: <name>
---

# /add-step $ARGUMENTS

Adding a pipeline step should be a small, contained diff — a handful of
files, each touched for one clear reason. If it turns out to need more
than the list below, that's a finding to report back to the human before
continuing, not something to quietly patch around.

The step name is `$ARGUMENTS` — a single lowercase key like `narration`
or `epilogue`, matching the naming style of the existing five
(`style`, `characters`, `portraits`, `chapters`, `illustrations`).

## 1. Write the failing test first

In `be/tests/steps.test.js`, add assertions for the new step to the
existing "step ordering" and "duplicate-run guard" suites *before*
touching any source file:
- it appears in `STEPS` at the position you intend (order in that array
  IS pipeline order — decide up front whether it's a mid-sequence
  insertion or appended at the end, since that changes what blocks it and
  what it blocks)
- `assertCanRun` refuses it before its new predecessor is done and
  allows it once that predecessor is done
- it has its own `STRANDED_AFTER_MS` entry, and `isStranded` respects it

Run the suite, confirm these new assertions fail (the step doesn't exist
yet), then proceed.

## 2. Touch, in order

1. **`be/src/domain/steps.js`** — append the new key to `STEPS` at the
   chosen position, plus its three matching entries: `STEP_LABELS`,
   `STEP_RUNNING_LABELS`, `STRANDED_AFTER_MS` (text step: seconds to a
   few minutes; image step: 10 minutes, matching `portraits`/
   `illustrations`).

2. **`be/src/store/index.js`** — only if the step needs new persisted
   fields beyond a plain step record. `emptySteps()` already picks up
   the new `STEPS` key automatically — no change needed there. If the
   step produces a new collection (like `characters`/`chapters`) or new
   `project.gemini.*` ids, add them to `newProjectRecord()`.

3. **`be/src/gemini/prompts.js`** — the new prompt text and, if it
   returns structured output, its JSON schema. If either is sourced from
   the assessment notebook, quote it verbatim and note that in a
   comment — this file is a transcription, not a paraphrase (see the
   file's own header comment).

4. **`be/src/domain/handlers.js`** — one handler, named exactly like the
   step key, exported alongside the other five. It must:
   - chain off the correct previous interaction id (read from
     `project.gemini.*` — trace which prior step's output this one
     should build on, the same way `chapters` deliberately chains off
     `charactersInteractionId` rather than `styleInteractionId`)
   - persist every new Gemini id via `patch` the moment it exists
   - skip already-done work on retry (mirror the `if (!project.gemini.X)`
     guard pattern already used by `style` and `portraits`)
   - if it's an image step, reuse the shared `generateImages` helper
     rather than writing a new image loop
   - never loop a retry — throw and let the pipeline record it

5. **`be/src/views/project-view.js`** — only if the step adds a new
   rendered collection (like `characters`/`chapters`) that needs an
   `imageUrl`-mapped shape in `toProjectView`. If it only sets a scalar
   field, it flows through automatically — no change needed.

6. **`fe/src/pages/ProjectDetailPage.jsx`** — add an entry to the
   `ACTIONS` table (`cta`, optionally `ctaCustom`, `hint`) and, if the
   step renders a new collection, a render section following the
   existing characters/chapters pattern (art grid with `ArtCard`, or a
   plain text card if it's not image output).

7. **`fe/tests/fixtures.js`** — add the new step to `STEP_KEYS`/
   `STEP_LABELS` (or equivalent) so `steps(...)` and the rest of the test
   fixtures produce a project shape that matches the real backend.

## 3. What should NOT need to change

`domain/pipeline.js`, anything under `routes/`, `lib/lock.js`, and
`components/Stepper.jsx` are all written generically over `STEPS` — none
of them should need an edit for a new step to work. If you find yourself
editing one of these, stop and report that as a finding: either the new
step doesn't actually fit this pipeline's shape, or one of those files
was less generic than it looked.

## 4. Cost implications

If the new step changes the documented caps (adds a per-run item cap of
its own) or adds a Gemini call every time the pipeline runs, that changes
what a submission costs — which is a graded constraint here. Update
`README.md`'s step table and caps callout, and add a decision entry to
`DECISIONS.md` explaining the added cost and why it's justified.
