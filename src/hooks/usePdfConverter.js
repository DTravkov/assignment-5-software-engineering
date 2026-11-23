import { useEffect, useRef, useState } from 'react';
import { parsePages } from '../lib/files';
import { convertPdf, openPdf } from '../lib/pdf';
import { estimateImagesMemory } from '../lib/memory';

const emptyState = () => ({
  file: null,
  pageCount: 0,
  results: [],
  status: 'idle',
  progress: { current: 0, total: 0 },
  error: '',
  notice: '',
});

function releaseImages(images) {
  images.forEach((image) => URL.revokeObjectURL(image.url));
}

async function releasePdf(pdf) {
  try {
    await pdf?.destroy();
  } catch {
    // Cleanup must also work when a PDF worker has already stopped.
  }
}

// Facade: callers receive document metadata and actions, never PDF.js objects.
export function usePdfConverter() {
  const [state, setState] = useState(emptyState);
  const pdfRef = useRef(null);
  const fileRef = useRef(null);
  const resultsRef = useRef([]);
  const activeRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const active = activeRef.current;
      activeRef.current = null;
      active?.controller?.abort();
      void releasePdf(pdfRef.current);
      pdfRef.current = null;
      fileRef.current = null;
      releaseImages(resultsRef.current);
      resultsRef.current = [];
    };
  }, []);

  async function load(file) {
    if (!file || !mountedRef.current || activeRef.current) return false;
    const operation = { controller: new AbortController() };
    const { signal } = operation.controller;
    activeRef.current = operation;
    const isCurrent = () => mountedRef.current && activeRef.current === operation;
    setState((previous) => ({ ...previous, status: 'loading', error: '', notice: '' }));

    try {
      const pdf = await openPdf(file, { signal });
      if (!isCurrent() || signal.aborted) {
        await releasePdf(pdf);
        if (isCurrent()) setState((previous) => ({ ...previous, notice: 'Opening cancelled. Choose a PDF when you are ready.' }));
        return false;
      }

      const previousPdf = pdfRef.current;
      pdfRef.current = pdf;
      fileRef.current = file;
      releaseImages(resultsRef.current);
      resultsRef.current = [];
      setState({ ...emptyState(), file, pageCount: pdf.numPages, status: 'ready' });
      void releasePdf(previousPdf);
      return true;
    } catch (error) {
      if (isCurrent()) {
        setState((previous) => ({
          ...previous,
          error: signal.aborted ? '' : error.message || 'We could not open this PDF.',
          notice: signal.aborted ? 'Opening cancelled. Choose a PDF when you are ready.' : '',
        }));
      }
      return false;
    } finally {
      if (isCurrent()) {
        activeRef.current = null;
        setState((previous) => ({ ...previous, status: pdfRef.current ? 'ready' : 'idle' }));
      }
    }
  }

  async function convert({ pages, dpi = 144, format = 'png', quality = 90 } = {}) {
    if (!mountedRef.current || !pdfRef.current || activeRef.current) return false;
    const operation = { controller: new AbortController() };
    const { signal } = operation.controller;
    activeRef.current = operation;
    const isCurrent = () => mountedRef.current && activeRef.current === operation;
    setState((previous) => ({ ...previous, status: 'converting', error: '', notice: '' }));

    try {
      const total = pdfRef.current.numPages;
      const selected = pages === undefined
        ? Array.from({ length: total }, (_, index) => index + 1)
        : parsePages(pages.join(','), total);
      setState((previous) => ({ ...previous, progress: { current: 0, total: selected.length } }));
      const results = await convertPdf(
        pdfRef.current, fileRef.current.name, selected,
        {
          dpi, format, quality, signal,
          reservedBytes: fileRef.current.size * 2 + estimateImagesMemory(resultsRef.current),
        },
        (current, count) => {
          if (isCurrent() && !signal.aborted) {
            setState((previous) => ({ ...previous, progress: { current, total: count } }));
          }
        },
      );

      if (!isCurrent() || signal.aborted) {
        releaseImages(results);
        if (isCurrent()) setState((previous) => ({ ...previous, notice: 'Conversion cancelled. Your document is ready when you are.' }));
        return false;
      }

      releaseImages(resultsRef.current);
      resultsRef.current = results;
      setState((previous) => ({
        ...previous,
        results,
        notice: `${results.length} ${results.length === 1 ? 'image is' : 'images are'} ready to download.`,
      }));
      return true;
    } catch (error) {
      if (isCurrent()) {
        setState((previous) => ({
          ...previous,
          error: signal.aborted ? '' : error.message || 'Conversion failed. Try fewer pages or a lower resolution.',
          notice: signal.aborted ? 'Conversion cancelled. Your document is ready when you are.' : '',
        }));
      }
      return false;
    } finally {
      if (isCurrent()) {
        activeRef.current = null;
        setState((previous) => ({ ...previous, status: 'ready' }));
      }
    }
  }

  function cancel() {
    activeRef.current?.controller?.abort();
  }

  function reset() {
    const active = activeRef.current;
    activeRef.current = null;
    active?.controller?.abort();
    void releasePdf(pdfRef.current);
    pdfRef.current = null;
    fileRef.current = null;
    releaseImages(resultsRef.current);
    resultsRef.current = [];
    if (mountedRef.current) setState(emptyState());
  }

  function clearError() {
    if (mountedRef.current) setState((previous) => ({ ...previous, error: '' }));
  }

  return { ...state, load, convert, cancel, reset, clearError };
}
