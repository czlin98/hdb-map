import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement window.matchMedia; components read it at render
// time (App's useIsDesktop, MapView's hover gating), so stub it or those
// renders throw. Report the desktop breakpoint as active so integration
// tests exercise the plain side-panel path — Vaul's mobile drawer (portal
// + measurement) is unreliable in jsdom.
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
