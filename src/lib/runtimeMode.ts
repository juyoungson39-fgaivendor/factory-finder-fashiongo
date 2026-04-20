// Runtime mode helpers.
//
// SECURITY: We intentionally do NOT treat preview hostnames as elevated.
// Previously this file granted unauthenticated access and admin privileges
// on `*.lovable.app` preview URLs, which leaked admin features to anyone
// who could guess the URL.
//
// `isDevelopmentAccessMode` is now scoped strictly to local Vite dev (`npm run dev`).
// In dev, you should still log in with a real seeded admin account to test admin UI;
// this flag is only used for harmless conveniences (e.g. seed scripts).

export const isPreviewMode = false;

export const isDevelopmentAccessMode = import.meta.env.DEV;
