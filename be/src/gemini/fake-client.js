import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gradientPng } from '../lib/png.js';

// Curated fixture stills, loaded once at module scope so a whole test
// run (or a demo session) only reads them off disk a single time each.
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFixtureBase64(filename) {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename)).toString('base64');
}

const FIXTURE_TOAD_BASE64 = loadFixtureBase64('toad-portrait.png');
const FIXTURE_BADGER_BASE64 = loadFixtureBase64('badger-portrait.png');
const FIXTURE_CHAPTER_BASE64 = loadFixtureBase64('chapter-illustration.png');

// Same two-method interface as rest-client.js, no network. Two jobs: let
// the whole test suite drive all five steps with zero quota, and let a
// reviewer click through the app with GEMINI_FAKE=1 and no key.
//
// Deliberately returns MORE than the server-side caps allow (4 characters,
// 3 chapters) so the cap in the pipeline handlers is actually exercised by
// a test, not assumed.

export const FAKE_STYLE =
  'An Edwardian watercolour storybook style, in the tradition of E.H. Shepard, but with a warm twilight twist: soft graphite linework washed with loose, glowing colour, riverbanks rendered in dusky greens and golds, long violet shadows, and a faint painterly grain throughout, as if each page had been left out to dry in the last light of a summer evening.';

export const FAKE_CHARACTERS = [
  {
    name: 'Mr. Toad',
    prompt:
      'A stout, bright-eyed toad standing upright in a loud checked waistcoat and driving goggles pushed up on his forehead, one thumb hooked pompously in his lapel, an oversized motoring coat flaring behind him as if caught mid-boast, rendered with comic swagger and an unmistakable gleam of reckless enthusiasm in his round eyes.',
  },
  {
    name: 'Badger',
    prompt:
      'A broad-shouldered, grizzled badger with a silver-striped face, dressed in a well-worn tweed smoking jacket, standing gruffly but kindly in the doorway of a burrow lined with old books, his small spectacles perched low, exuding quiet authority, patience, and the settled comfort of someone who has seen every kind of foolishness and forgiven most of it.',
  },
  {
    name: 'Ratty',
    prompt:
      'A sleek, brown water rat with glossy fur and whiskers catching the light, seated at the oars of a small wooden rowing boat, wearing a faded blue boating jacket, a woven picnic basket at his feet, gazing out over the river with the calm, contented expression of someone who genuinely believes there is nothing—absolutely nothing—half so much worth doing.',
  },
  {
    name: 'Otter',
    prompt:
      'A lean, muscular otter with slicked wet fur and a rakish grin, perched on a mossy rock at the river\'s edge, droplets glinting off his whiskers, one paw braced against the stone as if he had just surfaced mid-conversation, radiating restless energy, river-wise confidence, and the easy charm of a lifelong swimmer.',
  },
];

export const FAKE_CHAPTERS = [
  {
    name: 'The River Bank',
    prompt:
      'Illustrate the sun-dappled river bank in early summer: Ratty is rowing his little wooden boat close to shore while a wide-eyed Mole, fresh out of his burrow, sits nervously in the stern clutching the gunwale, reeds and wildflowers leaning over the water, dragonflies catching the light, the whole scene warm, unhurried, and glowing with the joy of a first day on the river.',
    characters: ['Ratty'],
  },
  {
    name: 'The Open Road',
    prompt:
      'Illustrate Mr. Toad standing triumphant beside a gleaming, brightly painted motor-car in the middle of a dusty country road, goggles askew, arms flung wide in delight, dust and small stones still settling around the wheels, with Ratty and Badger looking on from the roadside with matching expressions of weary disapproval.',
    characters: ['Mr. Toad', 'Ratty', 'Badger'],
  },
  {
    name: 'Mr. Badger',
    prompt:
      "Illustrate the warm, firelit interior of Badger's underground kitchen: Badger seated in a great armchair by the hearth, pipe in hand, with Ratty and Otter gathered close on low stools, shadows dancing on walls hung with old tools and dried herbs, the whole room radiating safety, comfort, and quiet, unspoken loyalty.",
    characters: ['Badger', 'Ratty', 'Otter'],
  },
];

function inputText(input) {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    return input.map((part) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('\n');
  }
  return input?.text ?? '';
}

export function createFakeClient({ latencyMs = 0, palette } = {}) {
  const defaultPalette = [
    { from: [40, 44, 62], to: [150, 120, 200] },
    { from: [60, 90, 60], to: [220, 200, 120] },
    { from: [80, 40, 40], to: [230, 170, 140] },
  ];
  const colors = palette && palette.length ? palette : defaultPalette;

  let fileCounter = 0;
  let interactionCounter = 0;
  let imageCounter = 0;

  async function delay() {
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
  }

  async function uploadFile({ displayName }) {
    await delay();
    fileCounter += 1;
    return {
      name: `files/fake_file_${fileCounter}`,
      uri: `https://files.invalid/${displayName}`,
      state: 'ACTIVE',
    };
  }

  function textInteraction(text) {
    interactionCounter += 1;
    return {
      id: `fake_int_${interactionCounter}`,
      status: 'completed',
      output_text: text,
      steps: [{ type: 'message', content: [{ type: 'text', text }] }],
    };
  }

  function imageInteraction(fixtureHint) {
    interactionCounter += 1;

    let data;
    // fixtureHint is set by handlers.js's generateImages() — it names
    // the slot being generated (which character index, or "chapter"),
    // not what the live text model happened to call it, so this works
    // for any uploaded book, not just Wind in the Willows.
    if (fixtureHint === 'toad') {
      data = FIXTURE_TOAD_BASE64;
    } else if (fixtureHint === 'badger') {
      data = FIXTURE_BADGER_BASE64;
    } else if (fixtureHint === 'chapter') {
      data = FIXTURE_CHAPTER_BASE64;
    } else {
      const { from, to } = colors[imageCounter % colors.length];
      imageCounter += 1;
      data = gradientPng({ width: 384, height: 576, from, to }).toString('base64');
    }

    return {
      id: `fake_int_${interactionCounter}`,
      status: 'completed',
      output_image: { type: 'image', data, mime_type: 'image/png' },
      steps: [{ type: 'message', content: [{ type: 'image', data, mime_type: 'image/png' }] }],
    };
  }

  async function createInteraction({ model, input, responseFormat, fixtureHint }) {
    await delay();
    const text = inputText(input);

    if (/image/i.test(model)) {
      // Seed turns ("you are going to generate portraits...") ask for no
      // image and must return a text-only interaction, exactly like the
      // real model does for a seed turn — seedPortraits/SEED_ILLUSTRATIONS
      // never pass fixtureHint, so a missing hint plus an actual
      // generation request (checked via the prompt prefix) is the
      // uncapped-extra-slot / no-hint fallback case, still worth a real
      // (gradient) image rather than "Understood.".
      if (text.startsWith('Create an illustration')) {
        return imageInteraction(fixtureHint);
      }
      return textInteraction('Understood.');
    }

    if (responseFormat?.schema?.items?.properties?.characters) {
      return textInteraction(JSON.stringify(FAKE_CHAPTERS));
    }

    if (responseFormat?.schema?.type === 'array') {
      return textInteraction(JSON.stringify(FAKE_CHARACTERS));
    }

    if (/define a art style/.test(text)) {
      return textInteraction(FAKE_STYLE);
    }

    return textInteraction('Understood.');
  }

  return { uploadFile, createInteraction };
}
