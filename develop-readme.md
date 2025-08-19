# Develop guide (vite-plugin-lazy-css-modules-inliner)

This document is for contributors/maintainers.

## Local development workflow

- Build once
    - `npm run build`
- Watch & link into your app
    - In this repo: `npm run connect` (runs build:watch + npm link)
    - In your target app: `npm link vite-plugin-lazy-css-modules-inliner`
    - Restart the target app's dev server to pick up the symlinked package
- Unlink later
    - In the target app: `npm unlink vite-plugin-lazy-css-modules-inliner && npm i`

Notes

- The runtime file `src/tplStyleRuntimeInjector.js` is copied into `dist/` by build scripts. If you change it, use watch build or re-run build.
- The package is ESM-only (`type: module`). Node >= 18 required.
- Clear caches if behavior looks stale: remove the app's `node_modules/.vite`, `dist`, restart dev server.
