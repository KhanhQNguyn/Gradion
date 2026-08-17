# Testing

## The rule for what gets a test

**Does it encode a requirement that's easy to break silently?** Ordering
(a step running out of turn), the duplicate-call guard (two runs of the
same step), resume-after-restart (state surviving a crash), and the
server-side caps (2 characters, 1 chapter) all qualify — each is a bug
that would compile clean, look fine in a quick manual click-through, and
only show up under a specific timing or restart that's easy to not
happen to try. Layout doesn't qualify — a broken flexbox is visible the
moment you look at the page, so it doesn't need a test to catch it (see
"what I deliberately don't test" below for the reasoning on visual
regression specifically).

## Three kinds of injected test client

Every backend test drives the real `createApp`/`createPipeline`/
`createHandlers` code with a swapped-in Gemini client — never a mocked
module, never a different code path than production runs. Three shapes
of client cover everything the suites need:

1. **The shipped stub** (`gemini/fake-client.js`) — deterministic
   responses for every call, used for the normal-path tests and for
   `GEMINI_FAKE=1` at runtime. Same code under test as production; it's
   not a test double for the fake client, it *is* the fake client.
2. **A gated stub** (`tests/helpers.js`'s `gatedClient`) — wraps a base
   client so a call can be paused mid-flight until `.release()` is
   called, and records every call in `.calls`. This is how a step is
   held "in progress" on purpose long enough for a second or third
   request to land on it — without a gate, a step running against the
   instant fake client finishes before a concurrent request could
   plausibly race it.
3. **A controllable failing stub** (`tests/helpers.js`'s
   `failingClient`) — fails on command, either unconditionally or
   selectively via a predicate over `{kind, count}` (`kind: 'upload'`,
   `'interaction'`, or `'imageGen'`). The selective form is what makes
   "fail only the second image, leave the first one's file in place, and
   confirm retry only regenerates the missing one" an actual assertion
   instead of a description of intended behaviour.

## Backend — `be/tests/`

| File | Covers |
|---|---|
| `steps.test.js` | The pure ordering/derivation engine (`domain/steps.js`): step ordering, the duplicate-run guard, stranded-claim detection, `projectStatus`/`nextRunnableStep` — no I/O, no server. |
| `store.test.js` | The persistence layer: user/project CRUD, uniform 404s (missing vs. not-yours), path-traversal rejection on both project ids and image filenames, atomic-write safety under concurrent large writes, and lost-update prevention on concurrent `updateProject` calls. |
| `pipeline.test.js` | The concurrency core: no duplicate Gemini calls (including the book uploaded exactly once across a duplicate attempt), failure-and-retry (including the per-image partial-failure case), stuck-step recovery, and the server-side caps actually cutting the client's over-generous output down. |
| `api.test.js` | The HTTP layer over all of the above: auth, project CRUD routes, validation messages, 404 vs 401 semantics, the image-route path-traversal guard, and `/api/health`. |
| `happy-path.test.js` | The integration test: one project, signed in, all five steps run to completion through real HTTP — **including a simulated server restart** (a second `createApp` instance built over the same `dataDir` mid-pipeline) that finishes the remaining steps. This is the one that actually *proves* resumability, not the one that approximates it by re-reading state and assuming the read is representative. |

## Frontend — `fe/tests/`

| File | Covers |
|---|---|
| `Stepper.test.jsx` | `stepVisualState`'s state-resolution logic (a stalled step reads as error, never as healthy progress; a failed step never renders as current) and the rendered `Stepper`/`ProgressStrip` output, including the accessible per-step text. |
| `ProjectListPage.test.jsx` | Loading → empty-state transition, a row's pill/progress-strip/live-step-name/stalled-flag, row-click navigation, and — the one to get right — a load failure surfacing a Banner instead of leaving the skeleton showing forever. |
| `ProjectDetailPage.test.jsx` | The in-progress banner naming the step and showing elapsed time, the action button disabled while a step is claimed, per-item image progress (one portrait rendered, the next still showing its running placeholder), the error banner's retry button firing `runStep` with exactly that step's key, the stalled-step affordance calling `resetStuckStep`, and the all-done state. |
| `NewProjectPage.test.jsx` | Field validation (including `aria-invalid`), the paste-to-submit path end to end, the `.txt`-upload path actually reading the file in the browser via `readTextFile`, and a server-side failure showing the error without clearing what the user typed. |

## What I deliberately don't test

- **No live Gemini calls, anywhere in the suite.** Stated honestly: the
  wire format in `gemini/rest-client.js` — the resumable File API flow,
  the `Api-Revision` header, the `interactions.create` body shape — is
  verified by hand against a real key (see `DECISIONS.md` §7), not by
  CI. Nothing in this repo asserts against the live API, because doing
  so in an automated suite would either spend quota on every run or
  require a checked-in key, both wrong for this project.
- **No CSS or layout snapshot tests.** They break on every intentional
  refactor and pass straight through real visual regressions (a snapshot
  updates itself into "passing" the moment someone accepts the diff).
  The visual pass — both colour schemes, phone width and desktop
  width — was done by hand; see the manual checklist below.
- **No E2E browser run** (no Playwright/Cypress). The `happy-path.test.js`
  integration test already drives the real Express app through real HTTP
  requests for the full five-step pipeline, with only the Gemini
  provider substituted — the remaining gap an E2E run would close is
  "does this render correctly in an actual browser," which is the visual
  pass's job, not a second automated layer's.
- **`lib/png.js` and `fake-client.js` itself are test-only code.**
  Neither ships to a real Gemini call. Both are covered indirectly: the
  happy-path test's PNG-magic-byte assertion only passes if
  `gradientPng` actually produces a valid PNG, and every other backend
  test that touches an image step only passes if the fake client's
  branching (seed-turn vs. generation-turn, characters vs. chapters
  schema detection) is correct.

## Harness notes

Two features of the test harness paid for themselves mid-build, beyond
just "the tests pass":

- **`makeApp({dataDir})` turning "resume after restart" into something
  asserted, not reasoned about.** Before this existed, "does the app
  survive a restart mid-pipeline" was a claim I had to convince myself
  of by reading the code. With it, `happy-path.test.js` literally builds
  a second app instance over the first one's on-disk data and continues
  the same project — if resumability were broken, that test would fail,
  not "probably still work."
- **The controllable stub's per-image failure switch.** Before
  `failingClient`'s `{kind, count}` predicate existed, testing "a
  partial image failure doesn't lose the successful image" meant either
  skipping that scenario or hand-rolling a one-off mock per test. The
  general form made it cheap enough to actually write the test instead
  of trusting the code path was fine.

## Test run

Run with `./test.sh` (or `.\test.ps1` on Windows) from the repo root.
The same command wrote `TEST-REPORT.txt` alongside this file — it is
committed (see `.gitignore`'s note) because it's a graded artifact, not
a build byproduct.

```
$ ./test.sh

> book-illustrator@0.1.0 test
> npm run test:be && npm run test:fe


> book-illustrator@0.1.0 test:be
> npm run test --workspace=be


> be@0.1.0 test
> node --test --test-reporter=spec

▶ auth
  ✔ a user is created on first sight of an email, and the same user is returned the second time (41.033409ms)
  ✔ a bad email is rejected (5.65218ms)
  ✔ a missing name is rejected (5.045501ms)
  ✔ project routes refuse access without a valid token (13.789019ms)
✔ auth (66.906622ms)
▶ projects
  ✔ a fresh user's project list starts empty (13.606892ms)
  ✔ creating a project starts it in draft with five pending steps (19.694251ms)
  ✔ title validation rejects an empty or oversized title (18.069805ms)
  ✔ book text validation rejects text under the minimum length (9.154459ms)
  ✔ the book text is served in full from its own endpoint and is NOT inlined into GET /projects/:id (17.020775ms)
  ✔ listing only ever shows the signed-in user's own projects, newest first (32.894569ms)
  ✔ an unknown project id 404s (7.214714ms)
  ✔ a path-traversal attempt on the image route is rejected, not served (12.147921ms)
  ✔ an unknown step name on the run route is rejected (10.36822ms)
✔ projects (140.974485ms)
▶ health
  ✔ GET /api/health reports mode, models, and caps (2.960093ms)
✔ health (3.210808ms)
✔ one project, signed in, goes through all five steps end to end — including a simulated restart (151.594076ms)
▶ no duplicate Gemini calls
  ✔ first run of a step is accepted, a concurrent second request gets 409 (25.445566ms)
  ✔ a client that refreshes mid-step is told the in-flight state, not an error (23.097697ms)
  ✔ across a duplicate attempt the book is uploaded exactly once (21.554874ms)
✔ no duplicate Gemini calls (71.429744ms)
▶ failure and retry
  ✔ a failing client records a failed step without losing the rest of the project (17.061718ms)
  ✔ retrying a failed step with a working client succeeds (14.933772ms)
  ✔ retry does not re-upload the book or redo a turn that already has an id (13.00169ms)
  ✔ a failure on the second image leaves the first image file in place; retry only regenerates the missing one (37.487301ms)
✔ failure and retry (82.988259ms)
▶ stuck-step recovery
  ✔ reset refuses to clear a claim that is still plausibly alive (10.602061ms)
  ✔ reset flags a claim nobody is working on as stalled once past the threshold, and the retry works (11.741159ms)
✔ stuck-step recovery (22.614714ms)
▶ server-side caps
  ✔ characters are capped at limits.maxCharacters even though the client returns 4 (12.741319ms)
  ✔ chapters are capped at limits.maxChapters even though the client returns 3 (26.045847ms)
✔ server-side caps (38.992649ms)
▶ end to end sanity
  ✔ the whole pipeline runs through the fake client (37.245237ms)
  ✔ a user-supplied style is used verbatim instead of calling GENERATE_STYLE (8.330526ms)
✔ end to end sanity (45.814043ms)
▶ step ordering
  ✔ first step runs on a fresh project (1.184657ms)
  ✔ a step is refused when its predecessors are not done (0.255944ms)
  ✔ the error names the nearest incomplete predecessor (1.41274ms)
  ✔ each step becomes runnable once the one before it is done (0.29063ms)
  ✔ a completed step cannot be re-run (0.178529ms)
  ✔ a failed step CAN be retried (0.190046ms)
  ✔ an unknown step name is rejected (0.390499ms)
✔ step ordering (5.359439ms)
▶ duplicate-run guard
  ✔ a second run of the step already in flight is rejected (0.382635ms)
  ✔ a different step is also rejected while one is in flight (0.30414ms)
  ✔ a stranded claim can be taken over (0.301817ms)
  ✔ a fresh claim is never called stranded (0.214625ms)
  ✔ image steps use the longer (10 min) threshold, text steps the shorter one (0.222681ms)
✔ duplicate-run guard (1.757001ms)
▶ derived state
  ✔ projectStatus reports draft correctly (0.347992ms)
  ✔ projectStatus reports in_progress correctly (0.9203ms)
  ✔ projectStatus reports done correctly (0.194494ms)
  ✔ projectStatus reports error correctly (0.18349ms)
  ✔ nextRunnableStep points at the next step to run (0.147972ms)
  ✔ nextRunnableStep is null when finished (0.251389ms)
✔ derived state (2.333981ms)
▶ store: users and projects
  ✔ findOrCreateUser creates then reuses, updating name on change (16.12134ms)
  ✔ createProject writes book, project file, and links to user (11.542033ms)
  ✔ requireProject 404s on missing id and on a project owned by someone else (10.664554ms)
  ✔ getProject returns null for a path-traversal-shaped id, never throws (2.712374ms)
  ✔ imagePath rejects non-png/traversal filenames and returns null when file is absent (7.842366ms)
✔ store: users and projects (50.441724ms)
▶ store: atomicity and concurrency
  ✔ writeJsonAtomic never exposes a half-written file to a concurrent reader (48.274502ms)
  ✔ two concurrent updateProject calls on the same project both land (54.381111ms)
✔ store: atomicity and concurrency (102.989766ms)
ℹ tests 53
ℹ suites 13
ℹ pass 53
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 525.004773

> book-illustrator@0.1.0 test:fe
> npm run test --workspace=fe


> fe@0.1.0 test
> vitest run


 RUN  v2.1.9 /Users/khanhnguyenquoc/Documents/Code/Gradion/Gradion/fe

 ✓ tests/Stepper.test.jsx (9 tests) 122ms
 ✓ tests/ProjectListPage.test.jsx (8 tests) 227ms
 ✓ tests/ProjectDetailPage.test.jsx (8 tests) 279ms
 ✓ tests/NewProjectPage.test.jsx (6 tests) 2311ms
   ✓ NewProjectPage > creating from pasted text works end to end and navigates on success 1088ms
   ✓ NewProjectPage > a server-side failure on submit shows the error without clearing what the user typed 1020ms

 Test Files  4 passed (4)
      Tests  31 passed (31)
   Start at  12:27:12
   Duration  3.43s (transform 279ms, setup 341ms, collect 903ms, tests 2.94s, environment 1.93s, prepare 374ms)

Full output written to TEST-REPORT.txt
```

Total: **84 tests, 84 passing** (53 backend, 31 frontend). Working
directory for this run: the repo root, via `./test.sh`.

## Manual UAT checklist

Things that are genuinely not worth automating — either because they
need a real key, real timing races, or a human's eyes:

- [ ] A full live-key run (`GEMINI_FAKE=0`, `GEMINI_IMAGE_FAKE=0`)
      against a real Project Gutenberg text, all five steps.
- [ ] Refresh the browser mid-image-generation and confirm the UI picks
      up exactly where the poll says the step is, with no flash of wrong
      state.
- [ ] Open the same project in two tabs and click the same step's action
      button in both — confirm one gets the running state, the other
      doesn't silently double-run it.
- [ ] `Ctrl-C` the API process mid-image-generation, restart it, confirm
      "Clear and retry" recovers the step without losing whatever
      portraits/illustrations had already been generated and saved.
- [ ] Sign out and back in with the same email — confirm the same
      projects reappear (same user, not a new workspace).
- [ ] Both colour schemes (`prefers-color-scheme`) at 380px and 1440px
      viewport widths.
- [ ] A full keyboard-only pass: sign in, create a project, run every
      step, view the result — tab order sane, focus always visible, no
      trap.
