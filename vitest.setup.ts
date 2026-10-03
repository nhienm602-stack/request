import "@testing-library/jest-dom/vitest";

// This file also loads for tests that opt into the `node` environment (the
// Server Action suite), where none of the DOM globals below exist. Guarding on
// `window` keeps one setup file usable by both environments.
if (typeof window !== "undefined") {
  // jsdom implements neither of these, and both are used by the upload fields
  // (object URL previews) and by the summary panel's scroll behaviour.
  if (typeof URL.createObjectURL === "undefined") {
    URL.createObjectURL = () => "blob:mock";
    URL.revokeObjectURL = () => {};
  }

  if (typeof Element.prototype.scrollIntoView === "undefined") {
    Element.prototype.scrollIntoView = () => {};
  }
}
