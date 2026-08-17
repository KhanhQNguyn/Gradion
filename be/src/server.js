import { config, assertRunnableConfig } from './config.js';

try {
  assertRunnableConfig();
} catch (err) {
  console.error(`[be] ${err.message}`);
  process.exit(1);
}

console.log(`[be] config loaded — port ${config.port}, dataDir ${config.dataDir}`);
console.log('[be] Express app not wired up yet — infrastructure-only checkpoint.');
