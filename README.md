# Pagepress

A single-page PDF to picture converter built with React and Vite. PDF.js renders documents locally; JSZip packages the resulting images. There is no backend and documents are never uploaded.

## Run

Requires Node.js 22.12+ and npm.

```sh
cd pagepress
npm install
npm run dev
```

If already inside the `pagepress` directory, skip `cd pagepress`. On Windows PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

```sh
npm test          # focused unit and React interaction tests
npm run test:e2e # real PDF rendering and downloads in Google Chrome
npm run build    # production output in dist/
npm run preview  # serve the production build locally
```

The browser tests use an installed Google Chrome. Alternatively, run `npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium`. The test runner starts its own Vite server.

## Acceptance criteria

1. Users can select or drag in a PDF, see its page count, and receive a clear error for unsupported or unreadable files.
2. Users can convert all pages or a chosen page range to PNG, JPEG, or WebP, with resolution and image quality controls.
3. Users can preview results, download individual images, or download all converted pages as a ZIP.
4. A “Share in…” menu offers WhatsApp, Telegram, Facebook, and X, plus native file sharing where supported, and explains when downloaded images need to be attached manually.
5. The single-page interface works on mobile and desktop, supports keyboard navigation, and has focused tests covering PDF validation, page selection, conversion, and downloads.

## Usage and limits

- Import one PDF at a time, up to 100 MB. The built-in sample is an original three-page vector PDF.
- Select PNG, JPG, or WebP; choose 72, 144, or 300 DPI. JPG and WebP expose a quality slider; PNG is lossless.
- Custom page selections accept comma-separated pages and inclusive ranges, such as `1, 3–5`. Duplicates are removed and pages are exported in document order.
- Opening and conversion can be cancelled. Cancellation, reset, and unmount abort an active PDF loading task. A cancelled or failed replacement preserves the previous results.
- Conversion and ZIP creation use an estimated 256 MB memory budget. It includes the source file (two copies), previous results, decoded previews (four bytes per pixel), rendering buffers, and encoded image/ZIP copies. Checks run before allocating each page canvas and before ZIP creation. This is a conservative application estimate, not a measurement or guarantee of browser/PDF.js memory usage. Pages are also limited to 24 million pixels and 16,384 pixels per dimension. Lower the resolution or select fewer pages if needed.
- Password protected PDFs must be unlocked first. Damaged PDFs show an error without removing the previous valid document.
- Files stay in tab memory until removed or the tab closes. Downloads remain on the device.

## Sharing

Native file sharing sends actual converted image files using the device share sheet. It requires a secure context (HTTPS or localhost), browser support, and an installed compatible share target. The app checks `navigator.canShare` before showing this action.

WhatsApp, Telegram, Facebook, and X links open their share composers with a link to the converter. Those web share endpoints cannot attach private browser files. Download the images and attach them manually; the menu explains this. No document names, contents, or local blob URLs are included in social links.

References: [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API), [Telegram share buttons](https://core.telegram.org/widgets/share), [WhatsApp click to chat](https://faq.whatsapp.com/5913398998672934).

## Structure

- `src/App.jsx`: export settings, previews, downloads, sharing, and accessible dialogs; delegates conversion lifecycle to the facade hook.
- `src/hooks/usePdfConverter.js`: conversion facade; owns PDF resources, results, progress, errors, cancellation, and cleanup. Exposes `load(file)`, `convert(options)`, `cancel()`, and `reset()`, plus `clearError()` for dismissal. `convert` accepts optional page numbers, DPI, format, and quality. Async actions return whether they succeeded; raw PDF.js objects stay private.
- `src/lib/pdf.js`: PDF loading, worker configuration, bounded rendering, cancellation, and conversion.
- `src/lib/files.js`: input validation, page range parsing, filenames, ZIP creation, downloads, and social links.
- `src/lib/memory.js`: shared memory estimates and the conversion/ZIP budget.
- `src/lib/sample.js`: the original sample document, generated without a network request.
- `src/**/*.test.*`: unit and interaction tests.
- `e2e/converter.spec.js`: actual PDF conversion, image signatures and dimensions, ZIP contents, preview, errors, and mobile overflow checks.

The dev and build scripts copy PDF.js font, CMap, and WASM resources into `public/pdfjs/`. These generated resources are ignored by Git and packaged with the build. UI fonts use Google Fonts with local system fallbacks.

The Sites hosting manifest uses `dist/` as the static deployment directory.
