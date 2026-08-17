import {
  SEED_BOOK,
  GENERATE_STYLE,
  acceptUserStyle,
  DESCRIBE_CHARACTERS,
  DESCRIBE_CHAPTERS,
  PROMPT_LIST_SCHEMA,
  CHAPTER_LIST_SCHEMA,
  seedPortraits,
  SEED_ILLUSTRATIONS,
  portraitPrompt,
  illustrationPrompt,
} from '../gemini/prompts.js';
import { outputText, outputImage, parseJsonOutput } from '../gemini/interaction.js';
import { ProviderError } from '../lib/errors.js';
import { slugify } from '../lib/fs-json.js';

// Two rules every handler in this file follows:
// 1. Persist each Gemini id via `patch` the MOMENT it exists, so a crash
//    between two calls resumes from the last id instead of re-uploading
//    or re-running a paid-for turn.
// 2. Never loop a retry — throw, let the pipeline record it.

export function createHandlers({ client, store, gemini, limits }) {
  async function style({ project, patch, input }) {
    let bookFileUri = project.gemini.bookFileUri;
    if (!bookFileUri) {
      const bytes = await store.readBookBytes(project.id);
      const file = await client.uploadFile({
        bytes,
        mimeType: 'text/plain',
        displayName: `${project.id}-book.txt`,
      });
      bookFileUri = file.uri;
      project = await patch((draft) => {
        draft.gemini.bookFileUri = file.uri;
        draft.gemini.textModel = gemini.textModel;
        draft.gemini.imageModel = gemini.imageModel;
      });
    }

    let bookInteractionId = project.gemini.bookInteractionId;
    if (!bookInteractionId) {
      // This is the ONLY place the book itself is ever sent (non-negotiable #2).
      const interaction = await client.createInteraction({
        model: gemini.textModel,
        input: [
          { type: 'text', text: SEED_BOOK },
          { type: 'document', uri: bookFileUri },
        ],
      });
      bookInteractionId = interaction.id;
      project = await patch((draft) => {
        draft.gemini.bookInteractionId = interaction.id;
      });
    }

    const userStyle = (input?.style ?? '').trim();
    const interaction = await client.createInteraction({
      model: gemini.textModel,
      input: userStyle ? acceptUserStyle(userStyle) : GENERATE_STYLE,
      previousInteractionId: bookInteractionId,
    });

    const resolvedStyle = userStyle || outputText(interaction).trim();
    if (!resolvedStyle) {
      throw new ProviderError({ status: 502, body: 'Gemini returned an empty art style.' });
    }

    await patch((draft) => {
      draft.gemini.styleInteractionId = interaction.id;
      draft.style = resolvedStyle;
      draft.styleSource = userStyle ? 'user' : 'generated';
    });
  }

  async function characters({ project, patch }) {
    const interaction = await client.createInteraction({
      model: gemini.textModel,
      input: DESCRIBE_CHARACTERS,
      previousInteractionId: project.gemini.styleInteractionId,
      responseFormat: PROMPT_LIST_SCHEMA,
    });

    const items = parseJsonOutput(interaction, { expect: 'array' })
      .filter((item) => item?.name && item?.prompt)
      // This is the server-side character cap — non-negotiable #1.
      .slice(0, limits.maxCharacters);

    if (items.length === 0) {
      throw new ProviderError({ status: 502, body: 'Gemini returned no usable characters.' });
    }

    await patch((draft) => {
      draft.gemini.charactersInteractionId = interaction.id;
      draft.characters = items.map((item, index) => ({
        id: `chr_${index + 1}`,
        name: item.name,
        prompt: item.prompt,
        image: null,
        imageStatus: 'pending',
        error: null,
      }));
    });
  }

  async function portraits({ project, patch }) {
    let imageInteractionId = project.gemini.imageInteractionId;
    if (!imageInteractionId) {
      const seed = await client.createInteraction({
        model: gemini.imageModel,
        input: seedPortraits({ title: project.title, style: project.style }),
      });
      imageInteractionId = seed.id;
      project = await patch((draft) => {
        draft.gemini.imageInteractionId = seed.id;
      });
    }

    await generateImages({
      project,
      patch,
      collection: 'characters',
      filePrefix: 'character',
      promptFor: portraitPrompt,
    });
  }

  async function chapters({ project, patch }) {
    // Chained off charactersInteractionId, NOT style or the book id —
    // deliberate, mirroring the notebook, so chapter prompts can refer
    // back to the character descriptions by name.
    const interaction = await client.createInteraction({
      model: gemini.textModel,
      input: DESCRIBE_CHAPTERS,
      previousInteractionId: project.gemini.charactersInteractionId,
      responseFormat: CHAPTER_LIST_SCHEMA,
    });

    const items = parseJsonOutput(interaction, { expect: 'array' })
      .filter((item) => item?.name && item?.prompt)
      .slice(0, limits.maxChapters);

    if (items.length === 0) {
      throw new ProviderError({ status: 502, body: 'Gemini returned no usable chapters.' });
    }

    await patch((draft) => {
      draft.gemini.chaptersInteractionId = interaction.id;
      draft.chapters = items.map((item, index) => ({
        id: `cha_${index + 1}`,
        name: item.name,
        prompt: item.prompt,
        characters: Array.isArray(item.characters) ? item.characters : [],
        image: null,
        imageStatus: 'pending',
        error: null,
      }));
    });
  }

  async function illustrations({ project, patch }) {
    if (!project.gemini.illustrationsSeeded) {
      // Chained off the CURRENT imageInteractionId — the last portrait
      // turn — so the model keeps referring back to the portraits it
      // already generated and characters stay visually consistent.
      const seed = await client.createInteraction({
        model: gemini.imageModel,
        input: SEED_ILLUSTRATIONS,
        previousInteractionId: project.gemini.imageInteractionId,
      });
      project = await patch((draft) => {
        draft.gemini.imageInteractionId = seed.id;
        draft.gemini.illustrationsSeeded = true;
      });
    }

    await generateImages({
      project,
      patch,
      collection: 'chapters',
      filePrefix: 'chapter',
      promptFor: illustrationPrompt,
    });
  }

  // Shared by portraits and illustrations.
  async function generateImages({ project, patch, collection, filePrefix, promptFor }) {
    const items = project[collection];
    let previousInteractionId = project.gemini.imageInteractionId;

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.image) continue; // already generated — a retry only pays for what's missing

      // Written before the call so the UI can show item 1 landed while
      // item 2 is still generating.
      await patch((draft) => {
        draft[collection][index].imageStatus = 'running';
        draft[collection][index].error = null;
      });

      try {
        // Deterministic regardless of what the live text model actually
        // named the character or chapter — it depends only on which
        // slot is being generated, so it works for ANY uploaded book,
        // not just the Wind in the Willows reference text. The fake
        // client uses this to pick a fixture image; the real client
        // ignores it (see rest-client.js/hybrid-client.js).
        const fixtureHint =
          filePrefix === 'character' && index === 0
            ? 'toad'
            : filePrefix === 'character' && index === 1
              ? 'badger'
              : filePrefix === 'chapter'
                ? 'chapter'
                : undefined;

        const interaction = await client.createInteraction({
          model: gemini.imageModel,
          input: promptFor(item),
          previousInteractionId,
          fixtureHint,
        });

        const image = outputImage(interaction);
        if (!image?.data) {
          throw new ProviderError({
            status: 502,
            body: `Gemini returned no image for "${item.name}".`,
          });
        }

        const filename = `${filePrefix}-${index + 1}-${slugify(item.name, filePrefix)}.png`;
        await store.saveImage(project.id, filename, Buffer.from(image.data, 'base64'));

        // Keep chaining so later images in the same step stay visually consistent.
        previousInteractionId = interaction.id;
        await patch((draft) => {
          draft[collection][index].image = filename;
          draft[collection][index].imageStatus = 'done';
          draft.gemini.imageInteractionId = interaction.id;
        });
      } catch (err) {
        await patch((draft) => {
          draft[collection][index].imageStatus = 'error';
          draft[collection][index].error = err.message;
        });
        // Don't silently continue past a failed image — the loop stops
        // and the step is recorded as failed.
        throw err;
      }
    }
  }

  return { style, characters, portraits, chapters, illustrations };
}
