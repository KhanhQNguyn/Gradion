import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Both dev and preview proxy /api to the backend — this is why the app
// uses relative /api/... paths everywhere instead of a hard-coded
// origin: it works behind any host (localhost now, whatever domain the
// reviewer deploys to later).
const proxy = {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    port: 5173,
    proxy,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.js',
    include: ['tests/**/*.test.{js,jsx}'],
    restoreMocks: true,
  },
});
