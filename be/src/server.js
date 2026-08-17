import { config, assertRunnableConfig } from './config.js';
import { createApp } from './app.js';

try {
  assertRunnableConfig();
} catch (err) {
  console.error(`[be] ${err.message}`);
  process.exit(1);
}

const { app } = await createApp({ config });

const modeDescription = config.gemini.fake
  ? 'stub'
  : config.gemini.imageFake
    ? `hybrid — live ${config.gemini.textModel}, stubbed images`
    : `live (${config.gemini.textModel} / ${config.gemini.imageModel})`;

app.listen(config.port, () => {
  console.log(`[be] listening on port ${config.port}`);
  console.log(`[be] gemini mode: ${modeDescription}`);
  console.log(`[be] data dir: ${config.dataDir}`);
});
