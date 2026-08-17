# Prompts

Two things live in this file: the prompts that were given to the AI to
build this app, and the prompts this app itself sends to Gemini.

---

## Prompts I gave the AI

Five reusable prompts from across this build, each verbatim, each with
one line on what it was for.

### 1. Kick-off — establish the shape before writing code

> Now build the backend's foundation. Everything in this prompt is pure
> infrastructure — no Express yet, no Gemini yet.
>
> be/package.json: name "be", type module, scripts `dev` = `node --watch
> src/server.js`, `start` = `node src/server.js`, `test` = `node --test
> --test-reporter=spec "tests/**/*.test.js"`. Dependencies: cors, dotenv,
> express. devDependency: supertest.
>
> be/src/config.js — loads `.env` from the repo root (and an optional
> be/.env that overrides it) via dotenv, and exports a frozen-in-spirit
> `config` object: [...port, dataDir, gemini.\*, limits.\* — full field
> list given] ... Also export `assertRunnableConfig()` which throws a
> plain Error telling the user to set GEMINI_API_KEY or GEMINI_FAKE=1 if
> neither is set — the server calls this at boot and exits(1) on failure,
> never starts silently misconfigured.
>
> [... be/src/lib/errors.js, wrap.js, validate.js, fs-json.js, lock.js,
> png.js specified file-by-file, each with exact exports and behaviour
> ...]
>
> be/src/domain/steps.js — pure, no I/O, imports only ../lib/errors.js.
> This is the ordering/derivation engine and it is the single most
> important file to get exactly right, because everything else — the
> pipeline, the views, the frontend — trusts its output instead of
> deriving its own copy.
>
> [... exact STEPS/STEP_LABELS/STRANDED_AFTER_MS values, isStranded,
> nextRunnableStep, projectStatus, assertCanRun specified precisely,
> including the exact conflict messages and error codes for each branch
> ...]
>
> Write be/tests/steps.test.js (node:test) covering, using exactly these
> scenarios [...] Run `npm --workspace be run test` and show me it
> passing before we go further.

**Purpose:** set every naming, error-shape, and file-layout convention
the rest of the build reuses without re-litigating it — and establish
the pattern every later prompt follows: specify the pure/no-I/O domain
logic exactly (down to conflict messages), then demand a green test run
as proof before moving on.

### 2. Implementation, test-first — the pipeline core

> This is the core of the app: claim → run in background → release, and
> the five Gemini-calling steps. Test-first for the pipeline behaviour —
> this suite is the leash, per CLAUDE.md's working agreement.
>
> be/src/domain/pipeline.js — `createPipeline({store, handlers, now =
> () => Date.now(), logger = console})` returns `{start, reset,
> settled}`.
>
> `start(projectId, step, input)`:
>   - `store.updateProject(projectId, draft => {...})`:
>     - `assertCanRun(draft, step, now())` — throws inside the lock, on
>       fresh state, which is what makes the duplicate-call guard
>       actually hold across tabs and restarts (comment this explicitly)
>     [...]
>
> [... execute(), reset(), settled() specified with exact patch
> sequencing and error-state fields ...]
>
> be/src/domain/handlers.js — `createHandlers({client, store, gemini,
> limits})` [...] Two rules stated as a comment at the top of the file
> and followed by every handler: (1) persist each Gemini id via `patch`
> the MOMENT it exists [...] (2) never loop a retry — throw, let the
> pipeline record it.
>
> Now write be/tests/pipeline.test.js covering, at minimum, these named
> behaviours (use tests/helpers.js's makeApp, runStepAndSettle,
> runWholePipeline, gatedClient, failingClient, simulateCrashedClaim):
>
> "no duplicate Gemini calls" [...] "failure and retry" [...]
> "stuck-step recovery" [...] "server-side caps" [...]
>
> Run the backend suite and show me it green before moving on.

**Purpose:** the concurrency-critical core of the app, specified as
behaviour-first — every test name was written before the implementation,
naming the exact race/crash/retry scenario it has to survive, so "done"
meant "the named scenario is provably true" rather than "the code
compiles."

### 3. Design interrogation — reject the default look, name the exact system

> Now make it look like a real product, not a wireframe — and
> specifically not the cream-canvas / serif-headline / terracotta-accent
> look every AI coding tool defaults to (it's a recognizable tell, not a
> design choice). Follow DESIGN.md, which I've written for this exact
> app: the identity is book-material — parchment, cloth binding,
> specimen plates — not a clone of anyone's marketing site. One
> stylesheet, fe/src/styles.css, imported once from main.jsx — no CSS
> framework (at this size, one file is smaller than the config a
> framework would need).
>
> Load two Google Fonts via `@font-face` (or a single `<link>` in
> index.html, your call): `Fraunces` (display [...]) and `Work Sans`
> (UI/body). Not Inter, not Geist, not Space Grotesk — DESIGN.md is
> explicit about that. [...]
>
> Design tokens in `:root`, per DESIGN.md's token table: [...] No
> --shadow tokens: hairline borders do the separation work, not blur.
> [...]
>
> Redefine ONLY the surface/text tokens inside `@media
> (prefers-color-scheme: dark)` [...] so every component is written once
> and looks right in both.
>
> [...] most notably: `.stepper` renders as a table-of-contents rail
> (`I · Style`, `II · Characters`, …) in --font-display, not a checkmark
> progress bar [...] `.art-card` is the specimen-plate treatment [...]
> `.banner--error` is the one place a --binding left edge is allowed
> (it's a semantic alert convention, not card decoration — keep it out
> of every other component).
>
> [... full class inventory specified: .shell/.topbar, .page, .card,
> .stack, .row, .field, .input/.textarea, .btn, .pill, .banner, .spinner,
> .stepper/.step, .progress-strip, .project-list/.project-row, .skeleton,
> .empty, .art-grid/.art-card, .chip-row/.chip, .link-button, .book,
> .splash, .sr-only, .faint/.subtle ...]
>
> Do a pass over every component from prompts 7–8 if any className
> doesn't yet exist in this stylesheet, and fix any mismatch. Then run
> the full frontend test suite again [...] and take a look at the app
> yourself: sign in, create a project with GEMINI_FAKE=1, run all five
> steps, and check both colour schemes.

**Purpose:** name the exact anti-pattern being avoided ("the cream-
canvas / serif-headline / terracotta-accent look") rather than just
asking for "good design," then specify the whole token/class system in
one pass so no component's markup and no component's CSS drift out of
sync — and close by demanding the AI actually drive the app, not just
compile it.

### 4. Adversarial review — force concrete answers, not reassurance

> for anything touching domain/pipeline.js, domain/handlers.js,
> domain/steps.js or store/, ask three adversarial questions (where can
> two requests interleave now; what does project.json contain if the
> process dies at the new code and what does the next GET render; does a
> retry re-pay for something that already succeeded) and demand concrete
> answers, not reassurance; end with a verdict — "ship it" or a numbered
> fix list. Explicitly: report findings, don't auto-fix.

**Purpose:** the standing rule (now `.claude/commands/verify.md`) for
every future change to the concurrency-sensitive core: three specific,
answerable questions instead of an open-ended "does this look safe?" —
because "looks safe" is exactly the failure mode a duplicate-call bug or
a lost write hides behind.

### 5. Right-sizing pass — grade against "smallest thing that fully works"

> Finally: do the right-sizing pass CLAUDE.md's working agreement asks
> for. Read the whole diff across all ten prompts as a reviewer grading
> "smallest thing that fully works." List, without defending any of it,
> every abstraction, config flag, dependency or helper that exists for a
> feature we didn't ship.

**Purpose:** a closing self-audit prompt, run once at the end rather than
per-file, that explicitly forbids justifying what it finds — the point
is an honest inventory of scope creep, not a defense of it.

---

## Prompts the app sends Gemini

Mirrors `be/src/gemini/prompts.js` exactly. Kept-on-purpose typos are
called out — this file is a transcription of the assessment notebook,
not a paraphrase, because the wording is the thing being graded. The
negative prompt (`IMAGE_RULES`) and both structured-output schemas
(`PROMPT_LIST_SCHEMA`, `CHAPTER_LIST_SCHEMA`) are carried over verbatim
from the notebook as well.

| Step | Constant | Prompt text sent to Gemini |
|---|---|---|
| 1 — book upload seed | `SEED_BOOK` | "Here's a book, to illustrate using Nano Banana. Don't say anything for now, instructions will follow." |
| 2 — style (no user style given) | `GENERATE_STYLE` | "Can you define a art style that would fit the story but with a twist? Just give us the prompt for the art syle that will added to the furture prompts." *(typos "a art style" / "art syle" / "furture prompts" kept as-is — notebook wording)* |
| 2 — style (user supplied one) | `acceptUserStyle(style)` | `The art style will be:"${style}". Keep that in mind when generating future prompts. Keep quiet for now, instructions will follow.` |
| 3 — characters | `DESCRIBE_CHARACTERS` | "Can you describe the main characters (only the adults) and prepare a prompt describing them with as much details as possible (use the descriptions from the book) so Nano Banana can generate images of them? Each prompt should be at least 50 words." |
| 4 — chapters | `DESCRIBE_CHAPTERS` | "Now, for each chapters of the book, give me a prompt to illustrate what happens in it. It should be a single image, not a multi-tiled page. Be very descriptive, especially of the characters. Be very descriptive and remember to tell their name and to reuse the character prompts if they appear in the images. Also list all characters who appear in it." |
| 5a — portrait seed | `seedPortraits({title, style})` | `You are going to generate portrait images to illustrate "${title}". The style we want you to follow is: Follow this style: "${style}" Also follow those rules: ${IMAGE_RULES}` |
| 5b — portrait (per character) | `portraitPrompt(character)` | `Create an illustration for ${character.name} following this description: ${character.prompt}` |
| 5c — illustration seed | `SEED_ILLUSTRATIONS` | "Starting from now, we're going to illustrate the book's chapters. Don't forget to refer to your previous illustrations of the characters to keep the characters consistency, but feel free to change their position." |
| 5d — illustration (per chapter) | `illustrationPrompt(chapter)` | `Create an illustration for ${chapter.name} using the previously generated characters following this description: ${chapter.prompt}` |

**Negative prompt, appended to the portrait seed (`IMAGE_RULES`):**

> There must be no text on the image, it should not look like a cover
> page.
> It should be a full illustration with no borders, titles, nor
> description.
> Unless asked otherwise, stay family-friendly with uplifting colors.
> Each produced should be a simple image, no panels.

**Structured-output schemas**, both `response_format: {type: 'text',
mime_type: 'application/json', schema: ...}`:

- `PROMPT_LIST_SCHEMA` (characters) — `Array<{name: string, prompt:
  string}>`, both fields required.
- `CHAPTER_LIST_SCHEMA` (chapters) — `Array<{name: string, prompt:
  string, characters: string[]}>`, all three fields required.
