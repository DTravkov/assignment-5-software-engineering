import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { convertPdf, openPdf } from '../lib/pdf';
import { usePdfConverter } from './usePdfConverter';
import { estimateImagesMemory } from '../lib/memory';

vi.mock('../lib/pdf', () => ({ openPdf: vi.fn(), convertPdf: vi.fn() }));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function makePdf(numPages = 3) {
  return { numPages, destroy: vi.fn().mockResolvedValue(undefined) };
}

function makeImage(url = 'blob:first') {
  return {
    page: 1,
    name: 'notes-page-001.png',
    width: 840,
    height: 1120,
    blob: new Blob(['image'], { type: 'image/png' }),
    url,
  };
}

const file = new File(['%PDF-1.7'], 'notes.pdf', { type: 'application/pdf' });

async function loadFile(result) {
  await act(async () => {
    expect(await result.current.load(file)).toBe(true);
  });
}

async function convertFile(result, options) {
  await act(async () => {
    expect(await result.current.convert(options)).toBe(true);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  openPdf.mockReset().mockResolvedValue(makePdf());
  convertPdf.mockReset().mockResolvedValue([makeImage()]);
});

it('loads metadata and blocks overlapping work before React renders the loading state', async () => {
  const pending = deferred();
  openPdf.mockReturnValueOnce(pending.promise);
  const { result } = renderHook(usePdfConverter);
  let completion;

  await act(async () => {
    completion = result.current.load(file);
    expect(await result.current.load(file)).toBe(false);
    expect(await result.current.convert()).toBe(false);
  });
  expect(result.current.status).toBe('loading');
  expect(openPdf).toHaveBeenCalledOnce();

  await act(async () => {
    pending.resolve(makePdf(5));
    expect(await completion).toBe(true);
  });
  expect(result.current).toMatchObject({ file, pageCount: 5, status: 'ready', results: [], error: '' });
});

it('converts selected pages with the requested settings and exposes progress and results', async () => {
  const pending = deferred();
  convertPdf.mockReturnValueOnce(pending.promise);
  const { result } = renderHook(usePdfConverter);
  await loadFile(result);
  let completion;
  act(() => {
    completion = result.current.convert({ pages: [3, 1, 3], dpi: 72, format: 'jpeg', quality: 80 });
  });
  expect(result.current.status).toBe('converting');
  expect(convertPdf).toHaveBeenCalledWith(
    expect.any(Object), 'notes.pdf', [1, 3],
    expect.objectContaining({ dpi: 72, format: 'jpeg', quality: 80 }), expect.any(Function),
  );
  const reportProgress = convertPdf.mock.calls[0][4];
  act(() => reportProgress(1, 2));
  expect(result.current.progress).toEqual({ current: 1, total: 2 });

  const image = makeImage();
  await act(async () => {
    pending.resolve([image]);
    expect(await completion).toBe(true);
  });
  expect(result.current).toMatchObject({ status: 'ready', results: [image], notice: '1 image is ready to download.' });
});

it('reserves the source document and previous images when reconverting', async () => {
  const { result } = renderHook(usePdfConverter);
  await loadFile(result);
  await convertFile(result);
  const previousResults = result.current.results;
  await convertFile(result);
  expect(convertPdf.mock.calls[1][3].reservedBytes).toBe(file.size * 2 + estimateImagesMemory(previousResults));
});

it('cancels opening, keeps previous results, and allows a retry', async () => {
  const { result } = renderHook(usePdfConverter);
  await loadFile(result);
  await convertFile(result);
  const previousResults = result.current.results;
  openPdf.mockImplementationOnce((_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  let completion;
  act(() => { completion = result.current.load(file); });
  const signal = openPdf.mock.calls[1][1].signal;
  await act(async () => {
    result.current.cancel();
    expect(await completion).toBe(false);
  });
  expect(signal.aborted).toBe(true);
  expect(result.current).toMatchObject({ status: 'ready', file, error: '' });
  expect(result.current.notice).toContain('Opening cancelled');
  expect(result.current.results).toBe(previousResults);
  await loadFile(result);
});

it.each(['reset', 'unmount'])('aborts an in-flight loading signal on %s', async (action) => {
  const pending = deferred();
  const pdf = makePdf();
  openPdf.mockReturnValueOnce(pending.promise);
  const { result, unmount } = renderHook(usePdfConverter);
  let completion;
  act(() => { completion = result.current.load(file); });
  const signal = openPdf.mock.calls[0][1].signal;
  if (action === 'reset') act(() => result.current.reset());
  else unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    pending.resolve(pdf);
    expect(await completion).toBe(false);
  });
  expect(pdf.destroy).toHaveBeenCalledOnce();
});

it('rejects invalid page selections without starting the renderer', async () => {
  const { result } = renderHook(usePdfConverter);
  await loadFile(result);
  await act(async () => {
    expect(await result.current.convert({ pages: [4] })).toBe(false);
  });
  expect(result.current.error).toContain('Choose pages between 1 and 3');
  expect(result.current.status).toBe('ready');
  expect(convertPdf).not.toHaveBeenCalled();
});

it('preserves the loaded document and images after a failed import or conversion', async () => {
  const pdf = makePdf();
  openPdf.mockResolvedValueOnce(pdf);
  const { result } = renderHook(usePdfConverter);
  await loadFile(result);
  await convertFile(result);
  const previousResults = result.current.results;

  openPdf.mockRejectedValueOnce(new Error('Damaged PDF.'));
  await act(async () => {
    expect(await result.current.load(new File(['bad'], 'broken.pdf'))).toBe(false);
  });
  expect(result.current).toMatchObject({ file, pageCount: 3, error: 'Damaged PDF.', status: 'ready' });
  expect(result.current.results).toBe(previousResults);
  expect(pdf.destroy).not.toHaveBeenCalled();

  convertPdf.mockRejectedValueOnce(new Error('Encoding failed.'));
  await act(async () => {
    expect(await result.current.convert()).toBe(false);
  });
  expect(result.current.error).toBe('Encoding failed.');
  expect(result.current.results).toBe(previousResults);
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:first');
  act(() => result.current.clearError());
  expect(result.current.error).toBe('');
});

it('cancels rendering while preserving previous results and keeping the document usable', async () => {
  const { result } = renderHook(usePdfConverter);
  await loadFile(result);
  await convertFile(result);
  const previousResults = result.current.results;
  const pending = deferred();
  convertPdf.mockReturnValueOnce(pending.promise);
  let completion;
  act(() => { completion = result.current.convert(); });
  const signal = convertPdf.mock.calls[1][3].signal;
  act(() => result.current.cancel());
  expect(signal.aborted).toBe(true);

  await act(async () => {
    pending.reject(new DOMException('Aborted', 'AbortError'));
    expect(await completion).toBe(false);
  });
  expect(result.current.status).toBe('ready');
  expect(result.current.notice).toContain('Conversion cancelled');
  expect(result.current.error).toBe('');
  expect(result.current.results).toBe(previousResults);
  await convertFile(result);
});

it('releases replaced results and PDF resources, and makes reset idempotent', async () => {
  const firstPdf = makePdf();
  const secondPdf = makePdf(2);
  openPdf.mockResolvedValueOnce(firstPdf).mockResolvedValueOnce(secondPdf);
  const { result, unmount } = renderHook(usePdfConverter);
  await loadFile(result);
  await convertFile(result);
  convertPdf.mockResolvedValueOnce([makeImage('blob:second')]);
  await convertFile(result);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');

  await loadFile(result);
  expect(firstPdf.destroy).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second');
  expect(result.current).toMatchObject({ pageCount: 2, results: [], progress: { current: 0, total: 0 } });
  act(() => { result.current.reset(); result.current.reset(); });
  unmount();
  expect(secondPdf.destroy).toHaveBeenCalledOnce();
  expect(result.current).toMatchObject({ file: null, pageCount: 0, results: [], status: 'idle' });
});

it('discards a late import after reset without interfering with a newer import', async () => {
  const first = deferred();
  const second = deferred();
  const stalePdf = makePdf();
  openPdf.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { result } = renderHook(usePdfConverter);
  let firstCompletion;
  let secondCompletion;
  act(() => { firstCompletion = result.current.load(file); });
  act(() => result.current.reset());
  act(() => { secondCompletion = result.current.load(file); });

  await act(async () => {
    first.resolve(stalePdf);
    expect(await firstCompletion).toBe(false);
  });
  expect(stalePdf.destroy).toHaveBeenCalledOnce();
  expect(result.current.status).toBe('loading');
  expect(result.current.file).toBeNull();

  await act(async () => {
    second.resolve(makePdf(7));
    expect(await secondCompletion).toBe(true);
  });
  expect(result.current).toMatchObject({ pageCount: 7, status: 'ready' });
});

it.each(['reset', 'unmount'])('aborts and discards late conversion output after %s', async (action) => {
  const pdf = makePdf();
  openPdf.mockResolvedValueOnce(pdf);
  const { result, unmount } = renderHook(usePdfConverter);
  await loadFile(result);
  await convertFile(result);
  const pending = deferred();
  convertPdf.mockReturnValueOnce(pending.promise);
  let completion;
  act(() => { completion = result.current.convert(); });
  const signal = convertPdf.mock.calls[1][3].signal;

  if (action === 'reset') act(() => result.current.reset());
  else unmount();
  expect(signal.aborted).toBe(true);
  expect(pdf.destroy).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');

  await act(async () => {
    convertPdf.mock.calls[1][4](3, 3);
    pending.resolve([makeImage('blob:late')]);
    expect(await completion).toBe(false);
  });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
  if (action === 'reset') expect(result.current).toMatchObject({ file: null, status: 'idle', results: [], progress: { current: 0, total: 0 } });
});

it('remains usable through React StrictMode effect setup and cleanup', async () => {
  const { result } = renderHook(usePdfConverter, { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> });
  await loadFile(result);
  await convertFile(result);
  expect(result.current).toMatchObject({ status: 'ready', results: [expect.objectContaining({ page: 1 })] });
});
