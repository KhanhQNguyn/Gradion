# CLAUDE.md — Standing Brief for AI Work in This Repo

> This file is the authoritative context for all AI-assisted work.
> Read it in full before proposing any code change.

---

## Non-Negotiables

These are **requirements, not preferences. Do not trade them for elegance.**

1. **Max 2 characters, max 1 chapter — enforced server-side, always.**
   These caps are encoded in a `config.limits` object in the server source code.
   They are deliberately NOT env-configurable (not in `.env`, not in any config file).
   The client must never be able to talk the server into more Gemini calls.
   Verify: grep for `config.limits` — the numbers `2` and `1` must live there, nowhere else.

2. **The book is sent to Gemini exactly once.**
   Step 1 uploads the book text through the File API and gets a `file.uri`.
   Step 2 sends that URI inside `client.interactions.create` and receives a `bookInteractionId`.
   Steps 3–5 chain with `previous_interaction_id` through that session tree.
   Never re-send the raw book text after step 2.

3. **Never auto-retry a Gemini generation call.**
   No backoff helpers, no retry wrappers, no `attempts` options on the HTTP client.
   A failure becomes a recorded step error (`{ status: "error", error: "..." }`) plus a
   retry button visible to the user. All retries are user-triggered.

4. **Steps run in order, one at a time.**
   A single gate function (`assertCanRun(projectId, stepIndex)`) is the only place that
   decides whether a step may start. It runs *inside* the per-project write lock, reading
   state from disk so it is never fooled by stale in-memory data.

5. **Every mutation goes through `store.updateProject(id, patch)` — locked, atomic.**
   Never call `fs.writeFile` on a `project.json` directly from any other module.
   The lock is a per-project `AsyncLocalStorage`-compatible mutex. Concurrent writers queue.

6. **Nothing may be permanently stuck.**
   When a step is claimed (`status: "running"`), the claim record carries a `startedAt`
   ISO timestamp. A helper `isStranded(claim)` compares `startedAt` to `Date.now()` using
   a configurable but source-coded threshold (e.g., 10 minutes).
   Stranded detection reads timestamps from disk — never from an in-memory timer or
   process uptime — so it survives server restarts.

---

## Intended File Tree

```
book-illustrator/
├── .env.example              # env var docs — no real secrets
├── .env                      # local secrets — gitignored
├── .gitignore
├── CLAUDE.md                 # this file
├── DECISIONS.md              # decision log (human-written)
├── README.md
├── TESTING.md
├── TEST-REPORT.txt           # real test run output — NOT gitignored (graded)
├── package.json              # npm workspaces root
│
├── bierf/
│   ├── master.md             # assessment brief (copy)
│   └── req.md                # Book_illustration.ipynb raw source
│
├── docs/
│   ├── plan.md               # §0 pipeline contract (this sprint)
│   └── architecture.md       # (next sprint)
│
├── be/                       # Express (or Fastify) backend workspace
│   ├── package.json
│   ├── src/
│   │   ├── index.js          # entry — createApp({config, client})
│   │   ├── config.js         # loads env, defines config.limits = { maxChars: 2, maxChapters: 1 }
│   │   ├── store.js          # createStore({dataDir}) — per-project JSON + file lock
│   │   ├── pipeline.js       # createPipeline({store, handlers}) — assertCanRun, step runner
│   │   ├── geminiClient.js   # createGeminiClient({config}) or createFakeClient()
│   │   ├── handlers/
│   │   │   ├── step1.js      # File API upload
│   │   │   ├── step2.js      # interactions.create (book)
│   │   │   ├── step3.js      # style
│   │   │   ├── step4.js      # characters (structured output)
│   │   │   ├── step4b.js     # chapters (structured output)
│   │   │   ├── step5a.js     # portrait seed
│   │   │   ├── step5b.js     # portrait image loop
│   │   │   ├── step5c.js     # chapter illustration seed
│   │   │   └── step5d.js     # chapter illustration loop
│   │   └── routes/
│   │       ├── users.js
│   │       ├── projects.js
│   │       └── pipeline.js
│   ├── test/
│   │   └── ...
│   └── data/                 # gitignored — per-project state + images
│
└── fe/                       # React (or Vite vanilla) frontend workspace
    ├── package.json
    ├── index.html
    ├── src/
    │   ├── main.jsx          # or main.js
    │   ├── App.jsx
    │   ├── pages/
    │   │   ├── IdentityPage.jsx
    │   │   ├── ProjectListPage.jsx
    │   │   ├── NewProjectPage.jsx
    │   │   └── ProjectDetailPage.jsx
    │   ├── components/
    │   │   ├── Stepper.jsx
    │   │   ├── CharacterCard.jsx
    │   │   ├── ChapterCard.jsx
    │   │   └── ...
    │   └── api.js            # typed fetch wrappers for the BE REST API
    └── test/
        └── ...
```

---

## Conventions

### Everything is ESM

- `"type": "module"` in every `package.json`.
- Use `import`/`export`. No `require()`, no CommonJS.
- File extensions must be explicit in relative imports: `import { foo } from './foo.js'`.

### Dependency Injection — no module singletons

All top-level factories take their dependencies as arguments:

```js
// backend entry point
const config = createConfig();           // reads process.env, defines config.limits
const store  = createStore({ dataDir: config.dataDir });
const client = config.fake
  ? createFakeClient()
  : createGeminiClient({ config });
const pipeline = createPipeline({ store, handlers, config });
const app = createApp({ config, store, client, pipeline });
```

This makes every unit testable: pass a `createFakeClient()` or a gated client that
throws on the Nth call, without touching the environment or the real network.

### Fake mode (`GEMINI_FAKE=1`)

When `GEMINI_FAKE=1`, the fake client:
- Returns deterministic stub data for every call (fixed style text, fixed character JSON, 1×1 PNG).
- Adds no artificial delay (tests run fast).
- Records every call for assertion in tests.

### `.claude/settings.json`

*(To be created in a later prompt)*  
The settings file will set `GEMINI_FAKE=1` as an environment variable for every
agent-run command. Agent-driven work must never spend real quota.

---

## Pipeline Interaction Chain (from §0 of docs/plan.md)

```
STEP 1  — File API upload (REST: POST /upload/v1beta/files, 2-step resumable)
            -> stores: fileUri, fileName

STEP 2  — Book interaction (REST: POST /v1beta/interactions, passes fileUri)
            -> stores: bookInteractionId

STEP 3  — Style (REST: POST /v1beta/interactions, previous=bookInteractionId)
            -> stores: styleInteractionId, style (text)

STEP 4  — Characters (REST: POST /v1beta/interactions, previous=styleInteractionId,
            response_format JSON schema Array<{name,prompt}>)
            -> stores: charsInteractionId, characters[] (server caps to <=2)

STEP 4b — Chapters (REST: POST /v1beta/interactions, previous=charsInteractionId,
            response_format JSON schema Array<{name,prompt}>)
            -> stores: chaptersInteractionId, chapters[] (server caps to <=1)

STEP 5a — Portrait seed (REST: POST /v1beta/interactions, IMAGE_MODEL, no previous)
            -> stores: charsImgSeedId

STEP 5b — Portrait images (REST: POST /v1beta/interactions, IMAGE_MODEL,
            previous=prev portrait interaction id, one call per character)
            -> stores: portraitInteractionIds[], portraitImages[] (base64 -> disk)

STEP 5c — Chapter illustration seed (REST: POST /v1beta/interactions, IMAGE_MODEL,
            previous=last portrait interaction id)
            -> stores: chaptersImgSeedId

STEP 5d — Chapter illustrations (REST: POST /v1beta/interactions, IMAGE_MODEL,
            previous=prev chapter img interaction id, one call per chapter)
            -> stores: chapterIllustrationImages[] (base64 -> disk)
```

---

## What the Assessment Grades

1. Does the full stack actually work, end to end?
2. Did you use AI as your copilot — and can you prove how?
3. Do your decisions make sense when you explain them?

`DECISIONS.md` must contain 4-6 real decisions (who proposed it, who pushed back,
what it cost). At least 3 places where AI output was overridden.
The `TESTING.md` must describe strategy + include a real test run output.
Git history must be small, meaningful, incremental commits — not one giant commit.
