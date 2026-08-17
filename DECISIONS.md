# Decisions

These are **design decisions, not a worklog**. `git log` already shows the work history. Each decision explains what I chose, why I chose it, and the main trade-off.

## 1. Node + React, and nothing else

I kept the stack simple: **Node + React**, without TypeScript, Zod, Docker, or separate service/repository layers.

- **TypeScript:** It would catch some type errors earlier, but this project is small and tests already cover the main data shapes. I chose less setup and fewer build-related issues.
- **Zod:** The app validates only a few small shapes. Three simple validation functions are easier to maintain than adding a schema library and its extra setup.
- **Docker:** There is no database or second service to manage. `start.sh` already starts the backend and frontend, so Docker would add setup without much benefit.
- **Services/repositories:** `store/index.js` already handles data access, while `domain/handlers.js` handles business logic. Adding more classes would add structure without adding useful functionality.

## 2. JSON files instead of a database

I chose `project.json` because each book project behaves like one document. There are no joins, cross-project queries, or reporting needs that would justify a database.

- The first version wrote to the file from several places, which could cause lost updates or corruption. I fixed this with a per-project lock and atomic file writes.
- `store.updateProject` is now the only supported write path. This keeps file changes in one place and makes concurrent updates safer.
- The lock works only inside one Node process. If the app later runs across multiple processes, the correct solution is a real database with transactions.
- I accepted this limit because the current app runs as one process on one machine. A database would add complexity without solving a current problem.

## 3. Per-step records plus one active claim

A single `status` enum could not represent the full pipeline state. Different steps can succeed, fail, retry, or run independently.

- `project.steps` stores each step's status, attempts, timestamps, and error. This keeps useful history instead of replacing it.
- `project.stepState` stores the one step currently being claimed. This prevents two requests from running the same step at the same time.
- The trade-off is that `steps` and `stepState` must stay consistent. This is more complex than one enum, but it represents the real pipeline state better.
- A crashed process can leave `stepState` behind. The next decision explains how that stale state is handled.

## 4. Duplicate-run protection is a stored claim, not a disabled button. AI OVERRIDE

The first version used an in-memory `Set` to block duplicate runs. That state disappeared after a restart and was not shared with another process.

- I moved the claim into `project.stepState` and create it inside the project lock. Every request reads the latest state from disk before claiming a step.
- This protects against duplicate runs across browser tabs and keeps the claim after a server restart.
- `startedAt` also lets `isStranded` detect claims left behind by a crashed process. No background timer is required.
- The trade-off is a short period where a crashed step still appears as `running`. I accepted this instead of using a timeout that could wrongly stop slow jobs.

## 5. No automatic retries. AI OVERRIDE

I removed automatic retries from generation calls. Retrying every error can repeat permanent failures and quickly waste API quota.

- A failed generation now becomes `{status: 'error', error: message}`. The user decides whether another attempt is worth the cost.
- The one exception is `waitUntilActive`, which checks an upload until processing finishes. It does not resend the upload or call generation again.
- Gemini IDs are saved as soon as they exist. A retry checks those IDs before making another call, so completed work is not repeated.
- This means a failed step can resume from the last successful operation instead of starting over.

## 6. REST for Gemini instead of the SDK

I used plain REST through `gemini/rest-client.js` instead of the official SDK. This gives me more control over network behavior and testing.

- SDKs may retry some failures automatically. That conflicts with the decision to avoid automatic retries and adds behavior I would need to control.
- The REST client has a small interface: `uploadFile` and `createInteraction`. This makes it easy to replace with `fake-client.js` in tests.
- The main trade-off is that I own the API response format. A Google API change could cause a runtime error instead of a compile-time error.
- `gemini/interaction.js` therefore reads responses defensively and supports more than one expected response shape.

## 7. Real text calls, mocked image calls

The app uses the real Gemini API for text generation and mocks image generation by default.

- With `GEMINI_FAKE=0` and `GEMINI_IMAGE_FAKE=1`, book upload, style generation, character extraction, and chapter prompts use the real API.
- `hybrid-client.js` sends image-model requests to the fake client and all other requests to the real REST client.
- This follows the assessment's allowance for mocked image generation while keeping the required text calls real.
- The image models do not have a free tier, so mocking images avoids requiring billing just to run the project.
- I verified the text flow with a real API key. I have not verified the live image flow because I do not have a billing-enabled key.

## 8. `FileReader` fallback instead of only `file.text()`. AI OVERRIDE

The original upload code used `await file.text()`. It works in browsers, but the jsdom test environment does not support it.

- The test caught the issue even though the code looked correct during review. This was a useful example of a test finding a real compatibility problem.
- `readTextFile` now uses `file.text()` when available and falls back to `FileReader` when it is not.
- The fallback is not only for tests. `FileReader` also works in real browsers, so the solution is more portable.
- This keeps the upload code simple while supporting more environments.

## 9. Image URLs also accept the token as a query parameter. AI OVERRIDE

Normal API requests use `Authorization: Bearer <token>`. That does not work for `<img>` requests because browsers do not add custom headers to native image loading.

- The result was that generated images returned 401 even though the API calls worked. Tests missed this because they only checked the generated URL.
- I fixed this by allowing `sessionMiddleware` to read `?token=` when no `Authorization` header exists.
- `api.authedImageUrl()` is the only place that adds the token, so components never handle tokens directly.
- The trade-off is that tokens in URLs can appear in browser history, logs, or `Referer` headers. I accepted this because protected images cannot load through `<img>` without some URL-based authentication.

# If I had one more day

## 1. Replace polling with SSE

`useProject` currently polls the server every few seconds. It works, but the frontend can be slightly behind the actual server state.

- I would add `GET /projects/:id/events` using Server-Sent Events.
- The server would push state changes directly to the frontend instead of making the browser ask repeatedly.
- This would give the system one clear source of truth and make pipeline updates feel more immediate.

## 2. Preserve per-attempt error history

`steps[step].error` currently stores only the latest error. If a step fails for different reasons, earlier errors are lost.

- I would replace the simple attempt counter with an `attempts` array containing `startedAt`, `finishedAt`, and `error`.
- This would preserve the full history of each attempt without changing how steps are claimed or retried.
- It would also make debugging failed pipeline runs much easier.