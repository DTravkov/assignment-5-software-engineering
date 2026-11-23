# Repository guidance

## Purpose
Pagepress is a single-page PDF-to-image converter in `pagepress/`. Users import PDFs, select pages and output settings, preview images, download individual files or ZIPs, and share. Documents are processed locally in the browser; there is no backend.

## Architecture

- `index.html` loads `src/main.jsx`, which mounts `src/App.jsx`: application entry and React interface/state.
- `src/lib/pdf.js`: PDF.js loading, worker configuration, rendering, cancellation, and memory limits.
- `src/lib/files.js`: validation, page ranges, filenames, downloads, ZIPs, and social links.
- `src/lib/sample.js`: generated sample PDF.
- `src/styles.css`: responsive styling.
- `scripts/copy-pdf-assets.mjs`: copies generated PDF.js resources before development/builds.
- `vite.config.js` and `playwright.config.js`: build and test configuration.

## Setup and safe commands
Use Node.js 22.12+ and npm. Run commands inside `pagepress/`; use `npm.cmd` if PowerShell blocks `npm.ps1`.

- `npm ci`: install the reviewed lockfile without dependency changes.
- `npm run dev`: local development server.
- `npm run build`: production-format artifacts in `dist/`; does not deploy.
- `npm run preview`: local build preview.
- `npm test`, `npm run test:watch`, `npm run test:e2e`: tests.

Browser tests require installed Google Chrome and start their own local server.

## Coding conventions
Follow existing JavaScript ES modules, functional React components/hooks, two-space indentation, single quotes, and semicolons. Keep reusable logic in `src/lib/`. Preserve keyboard access, labels, responsive layouts, local processing, cancellation, and object-URL cleanup. Never edit generated assets or `dist/` directly.

## Test expectations
Run relevant Vitest tests and the build after code changes. Run Playwright for conversion, download, sharing, or layout changes. Test observable behavior and meaningful failures. Report checks and limitations; documentation-only edits need no application tests.

## Forbidden actions
Never read, expose, or commit secrets. No production deployments, destructive commands, or unreviewed dependency changes. Preserve user work. Do not upload source or documents to external services.
