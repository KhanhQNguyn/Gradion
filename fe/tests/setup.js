import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia; harmless to stub unconditionally
// in case any component or future CSS-driven check reaches for it.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
