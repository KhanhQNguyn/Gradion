# Architecture

Companion to the README. This is the "how does it actually work"
document — diagrams and traces, not a restatement of the file tree.

## Layer diagram

```
┌─────────────────────────────── fe/ (React, Vite) ───────────────────────────────┐
│                                                                                   │
│  pages/  ─┬─  ProjectListPage, NewProjectPage, ProjectDetailPage                 │
│  components/ ─  Stepper, ArtCard, Banner, StatusPill, IdentityScreen             │
│  hooks/useProject.js  ── polling, run/reset actions                             │
│  api.js  ── the ONE fetch wrapper, one error shape                              │
│                                                                                   │
└──────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ HTTP, /api/* only, relative paths
                                    ▼
┌─────────────────────────────── be/ (Express) ────────────────────────────────────┐
│                                                                                   │
│  routes/          ── auth.js, projects.js — validate, call domain, shape response│
│  views/                                                                          │
│    project-view.js ── the ONLY shape the frontend ever sees                     │
│  domain/                                                                         │
│    pipeline.js    ── claim → background execute → patch (the concurrency core)  │
│    handlers.js    ── the 5 step handlers, each calling gemini/ and store/        │
│    steps.js       ── pure ordering/derivation, no I/O                           │
│  gemini/                                                                         │
│    rest-client.js / fake-client.js / hybrid-client.js  ── one interface, 3 impls │
│    prompts.js     ── verbatim notebook prompts                                  │
│  store/index.js   ── the ONLY code that touches project.json                    │
│                                                                                   │
└───────────┬───────────────────────────────────────────────────┬─────────────────┘
            │ fs (JSON files, atomic writes)                    │ REST (unless faked)
            ▼                                                   ▼
      be/data/ (gitignored)                      generativelanguage.googleapis.com
      users/, projects/<id>/
        project.json, book.txt, images/*.png
```

Every arrow crossing a box boundary is deliberate: the frontend never
imports anything from `be/`, routes never write `project.json` directly,
handlers never touch the filesystem except through `store`, and nothing
outside `gemini/` constructs a Gemini request body.

## Running a step — the trace

A `POST /projects/:id/steps/:step/run` does this, in order:

1. **`routes/projects.js`** validates the step name and calls
   `store.requireProject` (404 before anything pipeline-related, so a
   stranger never learns a project exists).
2. **`pipeline.start`** calls `store.updateProject`, which takes the
   per-project lock, reads `project.json` fresh off disk, and inside that
   single locked read-modify-write:
   - runs `assertCanRun(draft, step, now())` — throws if another step is
     live, if this one's already done, or if a predecessor isn't done
   - marks the step `running`, sets `stepState = {step, startedAt,
     attempt}`
   - writes the file
3. **The route responds `202`** with the claimed project — before any
   Gemini call has been made.
4. **`execute()` runs in the background** (not awaited by the request):
   calls the step's handler, which calls the Gemini client and, for
   every id or partial result it produces, calls `patch()` — itself a
   full `store.updateProject` — to persist it immediately.
5. **On success or failure**, `execute()` does one final `patch()`:
   status `done` or `error`, `stepState` cleared.

Three properties fall directly out of claiming *before* returning:

- **A second request gets 409, not a race.** By the time the route
  responds, the claim is already on disk. A concurrent request re-reads
  fresh state under the same lock and sees it.
- **A mid-step refresh is indistinguishable from never refreshing.**
  `GET /projects/:id` always reads the same on-disk state `execute()` is
  writing to — there's no separate "in-flight" channel to fall out of
  sync with.
- **Every `patch()` is a durable checkpoint.** If the process dies
  between two `patch()` calls, everything already patched survived; nothing
  before the crash is silently lost, and nothing after it is silently
  assumed.

## Failure and recovery

| Situation | What's stored | What the user sees |
|---|---|---|
| Gemini returns an error (4xx/5xx, empty output) | `steps[step] = {status:'error', error: <message>}`, `stepState` cleared | The step's error banner, the message, a "Retry this step" button |
| One image in a multi-item step fails (e.g. 2nd portrait) | The failed item's `imageStatus:'error'`; already-generated items keep their `image` filename untouched | Both portraits render — one image, one "Failed" placeholder — retry only regenerates the missing one |
| Process dies while holding the claim | `stepState` stays on disk with its `startedAt`, step stays `running` forever until re-read | The step shows as running; once `now - startedAt` exceeds that step's threshold, the UI shows "may be stuck" and a "Clear and retry" action |
| Network dies mid-call (request sent, response lost) | Whatever was `patch()`-ed before the call started; the call's own result is NOT persisted (it never returned) | Looks identical to "process died holding the claim" from the stored-state side — same stranded-then-clear path applies |

## Two independent conversation chains

```
TEXT CHAIN (book sent exactly once, at the root)
  book_interaction
      └─ style_interaction               (previous = book_interaction.id)
            └─ characters_interaction    (previous = style_interaction.id)
                  └─ chapters_interaction (previous = characters_interaction.id)

IMAGE CHAIN (standalone — never sees the book or the text chain's ids)
  portrait_seed
      └─ portrait_1        (previous = portrait_seed.id)
            └─ portrait_2  (previous = portrait_1.id)
                  └─ illustration_seed        (previous = portrait_2.id)
                        └─ illustration_1     (previous = illustration_seed.id)
```

The two chains only interact through data the app passes explicitly (the
resolved style text, character prompts) — never through a shared
`previous_interaction_id`. This is why `chapters` chains off
`charactersInteractionId` and not `styleInteractionId`: it needs the
model to remember the character descriptions by name, and that's only in
the characters branch of the text chain.

## Storage layout and write-safety

```
be/data/
  users/
    index.json              { "email@x.com": "usr_..." }
    usr_<id>.json            { id, email, name, createdAt, projectIds[] }
  projects/
    prj_<id>/
      project.json            the one document per project
      book.txt                uploaded once, read-only after creation
      images/
        character-1-*.png
        chapter-1-*.png
```

Guarantees, and where each one actually comes from:

- **Atomic**: every write goes to `<file>.<pid>.<random>.tmp` then
  `fs.rename`s over the target — `fs.rename` is atomic on POSIX
  (`rename(2)`) and on Windows (libuv uses `MoveFileEx` with
  `MOVEFILE_REPLACE_EXISTING`), so a reader never observes a
  half-written file.
- **Serialised**: `lib/lock.js`'s per-key async mutex means every
  `store.updateProject(id, ...)` for the same project id queues behind
  the previous one — read, mutate, write happens as one unit, never
  interleaved with another write to the same project.
- **Ordered creation**: `createProject` writes the project directory,
  then `book.txt`, then `project.json`, then links the id onto the
  user's `projectIds` last — every prefix of that sequence is a
  consistent state to crash in; the only possible inconsistency is an
  orphaned, unlinked project directory, never a project that's listed
  but can't be opened.

**The honest ceiling**: the lock is `lib/lock.js`'s in-process `Map` of
promises. It is correct for exactly one Node process. The moment this
runs as two API processes (behind a load balancer, in two containers),
two "simultaneous" requests can each pass their own process's lock and
race on the same file. The fix for that is a real database with actual
transactions, not a cleverer in-process lock — see
[`DECISIONS.md`](../DECISIONS.md) for why that trade was made anyway.

## The frontend derives nothing

`toProjectView` is the only place `status`, `currentStep`, `stalled`, and
`stepState.label` are computed — once, on the server, from
`project.steps` and `project.stepState`. React components (`Stepper`,
`ProjectDetailPage`, `ProjectRow`) read those fields and render them.
None of them re-run `Date.now()` against a `startedAt`, re-derive
ordering, or guess at a stranded threshold. If the server's idea of
"stalled" ever needs to change, it changes in one function, and every
screen that shows step state is correct immediately — there's no second
copy of that logic to find and update.
