# docs/plan.md

## 0 · Understand the pipeline first

> Source A: `bierf/master.md` (assessment brief)  
> Source B: `bierf/req.md` (Book_illustration.ipynb raw notebook)

The pipeline follows **"Illustrate a book: The Wind in the Willows"**, steps 1-5 in the notebook.
The notebook uses the Python `google-genai >= 2.10` SDK. Every SDK call maps to a plain REST endpoint.
Below is the REST-level contract inferred from the notebook code and the Gemini API reference docs.

---

### HTTP Call Table - Steps 1-5 only

> All calls are authenticated via `?key=GEMINI_API_KEY` (query-param) or `x-goog-api-key` header.
> Base URL: `GEMINI_BASE_URL` (default `https://generativelanguage.googleapis.com`)

| # | Step name | Method + Endpoint | Key request body fields | What it returns | State that survives to next step |
|---|-----------|-------------------|------------------------|-----------------|----------------------------------|
| 1a | File upload - init | POST /upload/v1beta/files | Headers: X-Goog-Upload-Protocol: resumable, X-Goog-Upload-Command: start, X-Goog-Upload-Header-Content-Type: text/plain; body: {"file":{"display_name":"<title>"}} | X-Goog-Upload-URL in response header (resumable session URI) | upload URL |
| 1b | File upload - bytes | POST <upload-url> (raw bytes) | Headers: Content-Length, X-Goog-Upload-Offset:0, X-Goog-Upload-Command: upload,finalize; body: raw .txt bytes | {"file":{"name":"files/...","uri":"...","mimeType":"text/plain","state":"ACTIVE"}} | file.uri, file.name stored in project |
| 2 | Book interaction (start chat) | POST /v1beta/interactions | {"model":GEMINI_TEXT_MODEL,"input":[{"type":"text","text":"Here's a book ..."},{"type":"document","uri":"<file.uri>"}],"service_tier":"standard"} | {"id":"<interaction_id>","output_text":"...","steps":[...]} | interaction_id - root of conversation chain |
| 3 | Style (auto-generate or user-supplied) | POST /v1beta/interactions | {"model":GEMINI_TEXT_MODEL,"input":"<style prompt or ack>","previous_interaction_id":"<book_interaction.id>","service_tier":"standard"} | {"id":"<style_interaction_id>","output_text":"<art style text>",...} | style_interaction_id, style string |
| 4 | Characters (structured JSON) | POST /v1beta/interactions | {"model":GEMINI_TEXT_MODEL,"input":"Can you describe the main characters (only the adults)...","previous_interaction_id":"<style_interaction_id>","response_format":{"type":"text","mime_type":"application/json","schema":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"prompt":{"type":"string"}}}}},"service_tier":"standard"} | {"id":"<chars_interaction_id>","output_text":"[{\"name\":\"...\",\"prompt\":\"...\"},...]"} JSON array, server caps to max 2 | chars_interaction_id, characters[] {name,prompt} |
| 5a | Portrait context seed (image chain init) | POST /v1beta/interactions | {"model":IMAGE_MODEL,"input":"You are going to generate portrait images... style:{style}... rules:{system_instructions}","service_tier":"standard"} | {"id":"<chars_img_seed_id>",...} (no image) | chars_img_seed_id |
| 5b | Portrait image (one per character, chained) | POST /v1beta/interactions | {"model":IMAGE_MODEL,"input":"Create an illustration for {name} following: {prompt}","previous_interaction_id":"<prev_chars_img_id>","service_tier":"standard"} | {"id":"<new_chars_img_id>","steps":[{"type":"model_output","content":[{"type":"image","mime_type":"image/png","data":"<base64>"}]}]} | new_chars_img_id for next portrait; base64 data saved to disk |
| 4b | Chapters (structured JSON) | POST /v1beta/interactions | {"model":GEMINI_TEXT_MODEL,"input":"Now, for each chapter... reuse character prompts...","previous_interaction_id":"<chars_interaction_id>","response_format":{"type":"text","mime_type":"application/json","schema":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"prompt":{"type":"string"}}}}},"service_tier":"standard"} | {"id":"<chapters_interaction_id>","output_text":"[{\"name\":\"...\",\"prompt\":\"...\"}]"} capped to max 1 | chapters_interaction_id, chapters[] {name,prompt} |
| 5c | Chapter illustration seed | POST /v1beta/interactions | {"model":IMAGE_MODEL,"input":"Starting from now, we're going to illustrate...","previous_interaction_id":"<last_portrait_interaction_id>","service_tier":"standard"} | {"id":"<chapters_img_seed_id>",...} (no image) | chapters_img_seed_id - seeds chapter chain with portrait context |
| 5d | Chapter illustration (one per chapter, chained) | POST /v1beta/interactions | {"model":IMAGE_MODEL,"input":"Create an illustration for {chapter.name} using previously generated characters... {chapter.prompt}","previous_interaction_id":"<last_chapter_img_id>","service_tier":"standard"} | Same image response as 5b | base64 saved to disk; last_chapter_img_id updated |

---

### Notes on the table

**Interaction chain topology**

`
book_interaction
    +-- style_interaction          (text chain, previous=book_interaction.id)
            +-- chars_prompts_interaction   (text chain, previous=style_interaction.id)
                    +-- chapters_prompts_interaction  (text, previous=chars_prompts_interaction.id)

chars_img_seed  (standalone image chain, no text-chain parent)
    +-- portrait_1  (previous=chars_img_seed.id)
    +-- portrait_2  (previous=portrait_1.id)
    +-- chapters_img_seed  (previous=last_portrait.id)
            +-- chapter_illustration_1  (previous=chapters_img_seed.id)
`

**Structured-output schema** (steps 4 and 4b)

`response_format` is a top-level field on `interactions.create`, NOT inside `generation_config`.
Its schema: `Array<{ name: string; prompt: string }>` as OpenAPI-compatible JSON Schema.

**Image extraction**

Images come back in `response.steps[]` as `{ type: "model_output", content: [{ type: "image", mime_type: "image/png", data: "<base64>" }] }`.
The notebook iterates reversed(steps) to find the last model output with an image part.

**No response_modalities field required**

The notebook does NOT pass `response_modalities` to the image model via `interactions.create`.
Using the IMAGE_MODEL_ID causes the model to return images naturally.
(Differs from legacy generateContent which needed response_modalities: ["IMAGE"].)

---

### Disagreements between brief and notebook

| # | Topic | Notebook says | Brief says | Resolution |
|---|-------|--------------|------------|------------|
| 1 | Character cap | max_character_images=5 (notebook sets 5; a comment says 3) | Max 2 characters, hard requirement | Brief wins. Enforce <=2 at config.limits, never env-configurable. |
| 2 | Chapter cap | max_chapter_images=3 | Max 1 chapter, hard requirement | Brief wins. Enforce <=1 at config.limits. |
| 3 | Auto-retry | SDK configured with 5 retries + exponential backoff on 429/5xx | Never auto-retry. Retries are user-triggered only. | Brief wins. HTTP client must NOT configure retry logic. Surface error; user retries manually. |
| 4 | Image model name | Default gemini-3.1-flash-lite-image; also lists gemini-2.5-flash-image | "Nano Banana family", rate-limit link is for gemini-2.5-flash-image | Both are Nano Banana. Default to gemini-2.5-flash-image per brief's link; override via GEMINI_IMAGE_MODEL. |
| 5 | Adult-only characters | "only the adults" - EEA restriction for Nano Banana | "adult characters, keep that restriction" | No disagreement. Both agree. |

---

### State that must survive between steps (persisted per project)

| Field | Written in step | Read in step(s) |
|-------|----------------|-----------------|
| fileUri | 1b | 2 |
| fileName | 1b | (reference) |
| bookInteractionId | 2 | 3 |
| styleInteractionId | 3 | 4 |
| style (text) | 3 | 5a (injected into image seed prompt) |
| charsInteractionId | 4 | 4b (chapters) |
| characters[] {name, prompt} | 4 | 5a/5b |
| portraitInteractionIds[] | 5b (one per char) | 5c (last seeds chapter chain) |
| portraitImages[] (disk paths) | 5b | UI display |
| chaptersInteractionId | 4b | (stored) |
| chapters[] {name, prompt} | 4b | 5c/5d |
| chapterIllustrationImages[] (disk paths) | 5d | UI display |
