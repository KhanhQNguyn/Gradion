// Transcribed verbatim from the assessment notebook — wording (typos
// included: "art syle", "furture prompts", "Each produced should be")
// is the thing being graded, so this file is a transcription, not a
// paraphrase. Do not "fix" it.

export const IMAGE_RULES = `
    There must be no text on the image, it should not look like a cover page.
    It should be a full illustration with no borders, titles, nor description.
    Unless asked otherwise, stay family-friendly with uplifting colors.
    Each produced should be a simple image, no panels.
  `.trim();

export const PROMPT_LIST_SCHEMA = {
  type: 'text',
  mime_type: 'application/json',
  schema: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        prompt: { type: 'string' },
      },
      required: ['name', 'prompt'],
    },
  },
};

export const CHAPTER_LIST_SCHEMA = {
  type: 'text',
  mime_type: 'application/json',
  schema: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        prompt: { type: 'string' },
        characters: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'prompt', 'characters'],
    },
  },
};

export const SEED_BOOK =
  "Here's a book, to illustrate using Nano Banana. Don't say anything for now, instructions will follow.";

export const GENERATE_STYLE =
  'Can you define a art style that would fit the story but with a twist? Just give us the prompt for the art syle that will added to the furture prompts.';

export const acceptUserStyle = (style) =>
  `The art style will be:"${style}". Keep that in mind when generating future prompts. Keep quiet for now, instructions will follow.`;

export const DESCRIBE_CHARACTERS =
  'Can you describe the main characters (only the adults) and prepare a prompt describing them with as much details as possible (use the descriptions from the book) so Nano Banana can generate images of them? Each prompt should be at least 50 words.';

export const DESCRIBE_CHAPTERS =
  'Now, for each chapters of the book, give me a prompt to illustrate what happens in it. It should be a single image, not a multi-tiled page. Be very descriptive, especially of the characters. Be very descriptive and remember to tell their name and to reuse the character prompts if they appear in the images. Also list all characters who appear in it.';

export const styleClause = (style) => `Follow this style: "${style}" `;

export const seedPortraits = ({ title, style }) => `
    You are going to generate portrait images to illustrate "${title}".
    The style we want you to follow is: ${styleClause(style)}
    Also follow those rules: ${IMAGE_RULES}
  `.trim();

export const SEED_ILLUSTRATIONS =
  "Starting from now, we're going to illustrate the book's chapters. Don't forget to refer to your previous illustrations of the characters to keep the characters consistency, but feel free to change their position.";

export const portraitPrompt = (character) =>
  `Create an illustration for ${character.name} following this description: ${character.prompt}`;

export const illustrationPrompt = (chapter) =>
  `Create an illustration for ${chapter.name} using the previously generated characters following this description: ${chapter.prompt}`;
