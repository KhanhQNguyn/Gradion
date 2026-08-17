import { ProviderError } from '../lib/errors.js';

// Helpers over the Interaction response shape (both the REST client and
// the stub return the same shape):
// { id, status, output_text?, output_image?, steps: [{type, content:
//   [{type, text?|data?, mime_type?}]}] }
//
// `output_text` / `output_image` are convenience mirrors that aren't
// always populated by the real API, so we read those first and fall
// back to walking `steps` in reverse, then each step's `content` in
// reverse, looking for the first matching part.

export function outputText(interaction) {
  if (typeof interaction?.output_text === 'string' && interaction.output_text) {
    return interaction.output_text;
  }

  const steps = interaction?.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const content = steps[i]?.content ?? [];
    for (let j = content.length - 1; j >= 0; j--) {
      const part = content[j];
      if (part?.type === 'text' && typeof part.text === 'string') {
        return part.text;
      }
    }
  }

  return '';
}

export function outputImage(interaction) {
  if (interaction?.output_image) {
    return interaction.output_image;
  }

  const steps = interaction?.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const content = steps[i]?.content ?? [];
    for (let j = content.length - 1; j >= 0; j--) {
      const part = content[j];
      if (part?.type === 'image') {
        return part;
      }
    }
  }

  return null;
}

export function parseJsonOutput(interaction, { expect = 'array' } = {}) {
  const raw = outputText(interaction);
  // Models sometimes wrap structured output in a ```json fence — don't
  // fail a 30-second call over a cosmetic prefix.
  const stripped = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new ProviderError({
      status: 502,
      body: `Could not parse Gemini output as JSON: ${raw.slice(0, 200)}`,
    });
  }

  if (expect === 'array' && !Array.isArray(parsed)) {
    throw new ProviderError({
      status: 502,
      body: `Expected a JSON array from Gemini, got: ${raw.slice(0, 200)}`,
    });
  }

  return parsed;
}
