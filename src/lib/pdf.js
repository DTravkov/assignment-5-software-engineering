import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { FORMATS, imageName, validatePdf } from './files';
import { checkMemoryBudget, estimateImagesMemory } from './memory';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function openPdf(file, { signal } = {}) {
  signal?.throwIfAborted();
  await validatePdf(file);
  signal?.throwIfAborted();
  const data = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const task = getDocument({
    data,
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
    isEvalSupported: false,
    // This is a static converter: PDF scripts, links, and attachments are never executed.
  });
  let destroyed = false;
  async function destroy() {
    if (destroyed) return;
    destroyed = true;
    await task.destroy();
  }
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    void destroy().catch(() => {});
    rejectAbort(signal.reason);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    signal?.throwIfAborted();
    const pdf = await Promise.race([task.promise, aborted]);
    signal?.throwIfAborted();
    return pdf;
  } catch (error) {
    if (signal?.aborted) {
      void destroy().catch(() => {});
      throw signal.reason;
    }
    await destroy().catch(() => {});
    if (error.name === 'PasswordException') throw new Error('This PDF is password protected. Save an unlocked copy and try again.');
    throw new Error('We could not read this PDF. It may be damaged or unsupported. Try another document.');
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function renderPage(pdf, pageNumber, { dpi, format, quality, signal, reservedBytes = 0 }) {
  signal?.throwIfAborted();
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: dpi / 72 });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  if (width * height > 24_000_000 || width > 16_384 || height > 16_384) {
    page.cleanup();
    throw new Error(`Page ${pageNumber} is too large at this resolution. Try a lower resolution.`);
  }
  try {
    // Reserve room for the canvas, encoder scratch space, and encoded output.
    checkMemoryBudget(reservedBytes + width * height * 4 * 3);
  } catch (error) {
    page.cleanup();
    throw error;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  let renderTask;
  const cancel = () => renderTask?.cancel();
  try {
    if (!context) throw new Error('Your browser could not create an image. Try another browser.');
    signal?.throwIfAborted();
    renderTask = page.render({ canvasContext: context, canvas, viewport, background: '#ffffff' });
    signal?.addEventListener('abort', cancel, { once: true });
    await renderTask.promise;
    signal?.throwIfAborted();
    const mime = FORMATS[format].mime;
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('Could not encode this image. Try a lower resolution.')),
      mime, quality / 100,
    ));
    if (blob.type !== mime) throw new Error(`${FORMATS[format].label} export is not supported by this browser. Try PNG or JPG.`);
    signal?.throwIfAborted();
    return { blob, width, height, page: pageNumber };
  } finally {
    signal?.removeEventListener('abort', cancel);
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}

export async function convertPdf(pdf, fileName, pages, options, onProgress) {
  const images = [];
  let usedBytes = options.reservedBytes || 0;
  try {
    for (const page of pages) {
      options.signal?.throwIfAborted();
      const image = await renderPage(pdf, page, { ...options, reservedBytes: usedBytes });
      usedBytes += estimateImagesMemory([image]);
      checkMemoryBudget(usedBytes);
      images.push({ ...image, name: imageName(fileName, page, options.format), url: URL.createObjectURL(image.blob) });
      onProgress?.(images.length, pages.length);
    }
    options.signal?.throwIfAborted();
    return images;
  } catch (error) {
    for (const image of images) URL.revokeObjectURL(image.url);
    throw error;
  }
}
