import '@testing-library/jest-dom/vitest';

// jsdom has no matchMedia; uPlot calls it at import time to watch for
// device-pixel-ratio changes. A no-op stub lets chart code load under jsdom
// even in tests that don't mock the uplot module.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
}
