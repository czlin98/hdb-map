import "@testing-library/jest-dom/vitest";

// jsdom lacks matchMedia, which components read at render time. Report the desktop
// breakpoint so integration tests take the side-panel path: Vaul's mobile drawer (portal +
// measurement) is unreliable in jsdom.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom lacks ResizeObserver, which cmdk and Vaul construct on mount.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
