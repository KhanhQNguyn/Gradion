import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// be/src -> be -> repo root
export const repoRoot = path.resolve(__dirname, '../../');

// Root .env first, then an optional be/.env that overrides it.
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'be', '.env'), override: true });

const resolveDataDir = (value) => {
  const dataDir = value || 'be/data';
  return path.isAbsolute(dataDir) ? dataDir : path.resolve(repoRoot, dataDir);
};

const stripTrailingSlash = (value) => value.replace(/\/+$/, '');

export const config = {
  port: Number(process.env.PORT) || 3001,
  dataDir: resolveDataDir(process.env.DATA_DIR),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    baseUrl: stripTrailingSlash(
      process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com'
    ),
    textModel: process.env.GEMINI_TEXT_MODEL || 'gemini-3.7-flash',
    imageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-lite-image',
    // This value moves — check the current one against
    // https://ai.google.dev/api/interactions-api before relying on the default.
    apiRevision: process.env.GEMINI_API_REVISION || '2026-05-20',
    fake: process.env.GEMINI_FAKE === '1',
    // Independent knob: lets text calls run live against the free tier while
    // image calls stay mocked, per the assessment's mocking allowance.
    imageFake: process.env.GEMINI_FAKE === '1' || process.env.GEMINI_IMAGE_FAKE === '1',
    requestTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 5 * 60_000,
  },
  // Non-negotiable #1: these five numbers are NOT env-configurable, by design.
  limits: {
    maxCharacters: 2,
    maxChapters: 1,
    minBookChars: 200,
    maxBookChars: 2_000_000,
    maxTitleChars: 120,
  },
};

Object.freeze(config.gemini);
Object.freeze(config.limits);
Object.freeze(config);

export function assertRunnableConfig() {
  if (!config.gemini.apiKey && !config.gemini.fake) {
    throw new Error(
      'Missing Gemini configuration: set GEMINI_API_KEY in your .env, or set GEMINI_FAKE=1 to run against the local stub.'
    );
  }
}
