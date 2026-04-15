import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

class MockBlobEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.data = options.data;
  }
}

if (typeof globalThis.BlobEvent === "undefined") {
  globalThis.BlobEvent = MockBlobEvent;
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
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
