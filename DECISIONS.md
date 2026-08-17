# Decisions

Trade-offs, not a worklog — `git log` already has the worklog. Written
in first person, as the engineer who made each call.

## 1. Node + React, and nothing else in the box

I rejected TypeScript, Zod, Docker, and a services/repositories split.
Each of those buys something real and I turned it down anyway, for a
reason specific to this project's size:

- **TypeScript** would have caught a handful of shape mismatches at
  compile time that tests now catch at run time instead. What it costs
  in return, honestly: `project.json`'s shape is enforced by exactly two
  things — the test suite, and the fact that `toProjectView` is the
  single place that shape gets produced and read back. There's no
  compiler backstopping that; if someone adds a field to `project.json`
  and forgets to thread it through `toProjectView`, nothing red appears
  until a test (or a human) notices the frontend isn't showing it. For a
  ~15-file backend with one shape flowing through it, I judged that gap
  smaller than the cost of a build step and `.d.ts` friction on every
  file. I would not make the same call past a certain size.
- **Zod** (or any schema library) — `be/src/lib/validate.js` hand-rolls
  three functions because the app validates exactly three shapes (email,
  name, title/text), each two or three fields. A schema library's setup
  cost — dependency, schema definitions, error-formatting glue — is more
  code than the three functions it would replace.
- **Docker** — no database, no second service; see the README's
  "no docker-compose.yml" callout. A single `Dockerfile` for the Node
  process alone would still need something to explain "and also run
  `npm run dev:fe`," which is what `start.sh` already does.
- **A services/repositories split** — `store/index.js` already *is* the
  repository layer (it's the only code that touches `project.json`), and
  `domain/handlers.js` already *is* the service layer. Naming them
  `ProjectRepository` and `PipelineService` classes with constructor-
  injected dependencies would add ceremony without adding a capability;
  the factories (`createStore`, `createHandlers`) already give the same
  dependency-injection property the tests rely on.

## 2. JSON files on disk instead of a database

This is the call I was least sure about going in. The reasoning: a book
project is one document that's only ever read and written whole — no
joins, no queries across projects, no reporting. That's exactly the
shape SQLite or Postgres earns its keep by *not* being needed for.

The AI's first pass at `store/index.js` wrote straight to
`project.json` with `fs.writeFile` from three different call sites
(create, update-step, save-image), with no coordination between them. I
pushed back — two concurrent step-runs, or a write racing a read, would
either corrupt the file or silently lose one writer's change — and the
AI was right to take the pushback seriously: the fix was `lib/lock.js`
(a per-key in-process mutex) plus `writeFileAtomic`'s temp-file-then-
`rename` pattern, and `store.updateProject` became the *only* sanctioned
write path, enforced by convention and checked by `/verify`.

The honest ceiling, stated plainly: the lock is an in-process `Map`. It
is correct for exactly one Node process and wrong the moment two API
processes exist — a load balancer, two containers, a second `npm run
dev:be` by accident. The fix for that is a real database with real
transactions, not a cleverer lock; no amount of file-locking cleverness
turns a single-process primitive into a distributed one. I accepted that
ceiling because this app runs as one process, on one machine, for one
reviewer.

## 3. Per-step records plus one claim, not a status enum

The AI's first draft of project state was a single `status` enum:
`draft | style_running | style_done | characters_running | ...`. It
looks tidy until you ask it to answer the question a mid-pipeline
refresh actually needs answered: "steps 1–3 succeeded, step 4 is
running, and step 2 failed once on the way before someone retried it." A
flat enum can hold exactly one of those facts at a time; it can't hold
all three simultaneously, because they aren't sequential states of one
thing — they're independent facts about five different things plus one
shared claim.

The fix was splitting it into `project.steps` (one record per step:
`status`, `attempts`, `startedAt`, `finishedAt`, `error` — history that
never gets thrown away) and `project.stepState` (the single live claim,
or `null`). The cost of the split is real: two structures that have to
stay consistent with each other (a step marked `running` in `steps`
should always correspond to `stepState.step` pointing at it, and vice
versa), which is exactly the kind of invariant a single enum can't
violate by construction but this can. And `stepState` is precisely the
piece that can go stale — it's the thing a crashed process leaves
behind, which is decision 4 below.

## 4. The duplicate-call guard is a claim on disk, not a disabled button — AI OVERRIDE

The AI's first implementation of "don't let two runs of the same step
happen at once" was an in-memory `Set` of `projectId:step` pairs, checked
and populated inside the route handler. It works fine for one browser
tab against one server that never restarts. It fails two ways that
matter here: the `Set` evaporates on every restart (so a process that
died mid-step "forgets" it ever claimed anything), and it's invisible to
a second process entirely.

I had it replaced with a claim written to `project.stepState` *inside
the per-project lock*, on state read fresh from disk, via
`assertCanRun`. That single change does double duty: it's what makes the
duplicate-call guard hold across browser tabs and across a restart (a
second request always reads the same on-disk claim the first one wrote),
and it's what makes "nothing stuck forever" possible at all —
`stepState.startedAt` plus a per-step threshold (`isStranded`) is a pure
function of stored data, so it survives a restart with no timer running
anywhere, and "Clear and retry" converts a stranded claim into a normal
retryable error.

The accepted cost: there's a window — between a process dying and that
step's threshold elapsing — where the stored state honestly says
"running" and isn't. I chose to let that be true rather than paper over
it with a shorter threshold that would false-positive on genuinely slow
image calls. It's an honest wrong answer for a bounded window, not a
silent one.

## 5. No auto-retry, anywhere — AI OVERRIDE

This is the one I felt most strongly about. The AI's first pass at the
image-generation handler wrapped every `createInteraction` call in a
retry-with-exponential-backoff helper, reasoning that 429s are common on
the free tier and a transient failure shouldn't fail the whole step. I
deleted it. A retry loop wrapped around a *doomed* prompt — a content
policy rejection, a malformed schema, anything that isn't actually
transient — doesn't recover, it just re-pays for the same failure
several times in a row, and on a free-tier quota that's measured in
requests-per-minute, a tight retry loop can burn a day's allowance in
under a minute. A failed generation now becomes exactly one thing: stored
`{status:'error', error: message}` plus a button. The human decides
whether it's worth paying for again.

One loop *is* kept, deliberately, and it's not the same thing:
`waitUntilActive` in `rest-client.js` polls the File API's upload status
(`GET /v1beta/{file.name}`) up to 10 times, a second apart, waiting for
`state` to leave `PROCESSING`. That's polling metadata about an upload
that already succeeded — it never re-sends bytes and never re-calls a
generation endpoint — so it doesn't cost quota and doesn't violate the
no-auto-retry rule in spirit or in fact.

The other half of "don't burn quota on a retry" is id-persistence
discipline: every handler in `domain/handlers.js` calls `patch()` the
moment a Gemini id exists, before making the next call. A retried step
checks `project.gemini.bookFileUri` / `bookInteractionId` / etc. before
calling Gemini at all, so re-running a failed step never re-uploads the
book or re-runs a turn that already has an id — it resumes from the last
one that succeeded. `be/tests/pipeline.test.js`'s "retry does not
re-upload the book or redo a turn that already has an id" test is the
proof, not just the intent.

## 6. REST for Gemini, not the SDK

An official `google-genai` SDK exists, and using it was a real option,
not a strawman. I chose plain REST (`gemini/rest-client.js`) for two
reasons. First, ownership of retry behaviour: an SDK's client typically
retries transient failures internally by default, which is exactly the
behaviour decision 5 argues against — fighting an SDK's own retry
defaults is more code and more surprise than writing the four HTTP calls
this app actually needs. Second, and more concretely useful day to day:
a hand-rolled client has an interface — `{uploadFile, createInteraction}`
— that's trivially substitutable for `fake-client.js`. That
substitutability is what lets the entire test suite (steps, pipeline,
api, happy-path — over 50 tests) run with zero network calls and zero
quota, which an SDK's internal HTTP client would make much harder to
intercept cleanly.

The cost: I own the wire format. A field Google renames in the REST API
surfaces as an HTTP 400 or a `undefined` read, not a TypeScript compile
error the way an SDK's generated types might catch it. That's exactly
why `gemini/interaction.js`'s `outputText`/`outputImage` read the
convenience mirror fields (`output_text`, `output_image`) *first* and
fall back to walking `steps[]` in reverse — the shape is defensively
read, not trusted, because there's no compiler enforcing it matches what
I expect.

## 7. Live text calls, mocked image calls

Stating this plainly, since it's a direct answer to a specific ask, not
a generic AI-copilot writeup: **text calls run against the real Gemini
API.** With `GEMINI_FAKE=0` and `GEMINI_IMAGE_FAKE=1` (the shipped
default), the book upload, style generation, character extraction, and
chapter-prompt generation are genuine calls to `GEMINI_TEXT_MODEL` over
the real Interactions API. Only image generation — portraits and the
chapter illustration — is mocked, via `gemini/hybrid-client.js`, which
routes any `createInteraction` call whose `model` equals
`GEMINI_IMAGE_MODEL` to the same fake-image logic the test suite uses,
and routes everything else to the real REST client.

Why this split, specifically: the assessment (§5.3) asks for real calls
to both a text model and an image model. The recruiter's stated mocking
allowance covers image generation specifically ("you can mock the
image-generation response"). As of this writing, the Nano Banana image
models carry no free tier at all, while the text models do. Given those
two constraints together, `GEMINI_IMAGE_FAKE=1` is the one configuration
that's both spec-compliant on text — real prompts, real model, real
API — and doesn't require enabling billing on a key just to run the app
at all.

**How I'd verify it against the live image API, since that's what's
actually being graded here:** flip `GEMINI_IMAGE_FAKE=0` with a real,
billing-enabled `GEMINI_API_KEY` set. I'd expect
`hybrid-client.js` to stop intercepting image-model calls and
`rest-client.js`'s `createInteraction` to hit the real
`/v1beta/interactions` endpoint with `model: GEMINI_IMAGE_MODEL`, and
the response to come back with a base64-encoded PNG in
`steps[].content[].data` alongside `mime_type: "image/png"` — the exact
shape `gemini/interaction.js`'s `outputImage` already reads, since that
function was written against the documented response shape, not against
the fake client's output. I have not run this live myself — I don't have
a billing-enabled key — so I'm not claiming verification I didn't do.
What I did verify by hand: the text half, live, with a real key and
`GEMINI_FAKE=0 GEMINI_IMAGE_FAKE=1` — the book upload, style, and
character steps against the real API, confirming the request/response
shapes in `rest-client.js` and `interaction.js` match what the
Interactions API actually returns, not just what the notebook implied it
would.

## 8. The small one: `await file.text()` → FileReader — AI OVERRIDE, caught by the harness

The AI-generated `.txt` upload handler in `NewProjectPage.jsx` originally
read the picked file with a one-line `await file.text()`. It's correct
in every real browser. The jsdom-based component test for the upload
path failed, because jsdom doesn't implement `Blob.prototype.text` — and
that failure is what caught it, not a diff review, which would have read
that line and moved on without blinking. The fix, `lib/read-file.js`'s
`readTextFile`, tries `file.text()` where it exists and falls back to a
plain `FileReader`, which is available in every real browser too — so
the fallback isn't a test-environment shim, it's the more portable
choice outright. This is the clearest example in this repo of a test
catching something a diff review wouldn't have: the code *looked* fine,
read fine, and was one line shorter than the fix. It just didn't run
everywhere the fix needs to run.

## 9. The image route also accepts the token as a query param — AI OVERRIDE, caught by actually looking at the page

Every route is authenticated the same way: `Authorization: Bearer
<token>`, checked by `sessionMiddleware`. That's fine for every call
`api.js` makes — its `call()` wrapper attaches the header to every
`fetch()`. It's not fine for `ArtCard`'s `<img src={item.imageUrl}>`: a
browser's native image request is not a `fetch()` call, and browsers
never attach custom headers to it. Every portrait and every chapter
illustration was silently 401ing from the moment images shipped, and
none of the tests caught it, because the tests assert on the `imageUrl`
string a component renders, not on whether a real browser can actually
load it — the same category of gap as decision 8's `file.text()`, just
on the read side of the app instead of the write side. It surfaced the
same way: not a diff review, but loading the actual page and watching a
broken-image icon where a portrait should be.

The fix is `sessionMiddleware` also accepting the token from
`req.query.token` when the `Authorization` header is absent, and
`api.authedImageUrl()` being the one place that appends it — so no
component ever touches a raw token. The header stays primary; every
`fetch()`-driven call still goes through it untouched. The trade-off,
stated plainly rather than hidden behind "it's just for images": the
fallback lives on the whole middleware, not scoped to the image route
alone, so structurally any route this middleware guards would accept a
`?token=` query param too — `api.js` just never happens to send one
except for image URLs. A leaked image URL exposes the same bearer token
a leaked `Authorization` header would; someone who copies that token out
of a URL and replays it by hand could hit any endpoint as that user, not
just re-view images. That's not a bigger hole than the app already
has — the token already *is* the account, per decision-adjacent honesty
in `middleware/session.js`'s own comment — but it is one more place that
token now travels, which query strings do more casually than headers
(they end up in browser history, server access logs, and `Referer`
headers on outbound requests). Accepted because the alternative — no way
for a generated image to render in an `<img>` tag at all — isn't
actually an alternative for an app whose whole point is showing
generated images.

---

**One more day, I'd spend it on:**

- **SSE replacing the poll.** `useProject`'s 1.8s/15s poll works, but it
  makes the browser a second clock in a system that already has one —
  the server. Replacing it with an SSE stream from `GET
  /projects/:id/events` ties back to the same principle that makes the
  stranded-claim check trustworthy: state should have exactly one
  authority, and right now polling means the frontend's belief about
  "is this still running" can be up to 1.8 seconds stale for no reason
  better than "that's when we last asked."
- **Per-step attempt history.** `steps[step].error` is a single string,
  overwritten on every attempt. A step that fails twice for two
  different reasons (a schema-parse error, then a rate limit) loses the
  first message the moment the second attempt starts. A small
  `attempts: [{startedAt, finishedAt, error}]` array instead of a
  counter would keep that history without changing anything else about
  how the step is claimed or retried.
