import { beforeEach, describe, expect, it, vi } from 'vitest';
import { File } from 'node:buffer';
import { getDocument } from 'pdfjs-dist';
import { convertPdf, openPdf, renderPage } from './pdf';
import { MAX_MEMORY_BYTES } from './memory';

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));

function mockPdf() {
  const page = {
    getViewport: vi.fn(({ scale }) => ({ width: 420 * scale, height: 560 * scale })),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    cleanup: vi.fn(),
  };
  return { pdf: { getPage: vi.fn(async () => page) }, page };
}

beforeEach(() => {
  getDocument.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback, mime) { callback(new Blob(['encoded image'], { type: mime })); });
});

describe('PDF conversion', () => {
  it.each(['png', 'jpeg', 'webp'])('renders %s with the requested resolution and encoding', async (format) => {
    const { pdf, page } = mockPdf();
    const result = await renderPage(pdf, 2, { dpi: 144, format, quality: 85 });
    expect(pdf.getPage).toHaveBeenCalledWith(2);
    expect(result).toMatchObject({ page: 2, width: 840, height: 1120 });
    expect(result.blob.type).toBe(`image/${format}`);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), `image/${format}`, .85);
    expect(page.cleanup).toHaveBeenCalledOnce();
  });
  it('converts only selected pages and reports progress', async () => {
    const { pdf } = mockPdf();
    const progress = vi.fn();
    const result = await convertPdf(pdf, 'notes.pdf', [1, 3], { dpi: 72, format: 'png', quality: 90 }, progress);
    expect(result.map((image) => image.name)).toEqual(['notes-page-001.png', 'notes-page-003.png']);
    expect(progress.mock.calls).toEqual([[1, 2], [2, 2]]);
  });
  it('stops cancelled conversions and releases partial output URLs', async () => {
    const { pdf } = mockPdf();
    const controller = new AbortController();
    await expect(convertPdf(pdf, 'notes.pdf', [1, 2], { dpi: 72, format: 'png', quality: 90, signal: controller.signal }, () => controller.abort())).rejects.toThrow();
    expect(pdf.getPage).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-image');
  });
  it('rejects browser encoding fallbacks instead of mislabeling a PNG as WebP', async () => {
    HTMLCanvasElement.prototype.toBlob.mockImplementation((callback) => callback(new Blob(['fallback'], { type: 'image/png' })));
    const { pdf } = mockPdf();
    await expect(renderPage(pdf, 1, { dpi: 72, format: 'webp', quality: 90 })).rejects.toThrow('not supported');
  });
  it('bounds canvas sizes before allocating image memory', async () => {
    const { pdf, page } = mockPdf();
    page.getViewport.mockReturnValue({ width: 10000, height: 10000 });
    await expect(renderPage(pdf, 1, { dpi: 300, format: 'png', quality: 90 })).rejects.toThrow('lower resolution');
    expect(page.render).not.toHaveBeenCalled();
  });
  it('provides an actionable error for password protected PDFs', async () => {
    const destroy = vi.fn();
    getDocument.mockReturnValue({ promise: Promise.reject(Object.assign(new Error(), { name: 'PasswordException' })), destroy });
    await expect(openPdf(new File(['%PDF-1.7'], 'locked.pdf'))).rejects.toThrow('password protected');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('destroys a pending loading task and rejects promptly when opening is cancelled', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocument.mockReturnValue({ promise: new Promise(() => {}), destroy });
    const controller = new AbortController();
    const opening = openPdf(new File(['%PDF-1.7'], 'notes.pdf'), { signal: controller.signal });
    const rejection = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(getDocument).toHaveBeenCalledOnce());
    controller.abort();
    await rejection;
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('does not start a loading task if opening was already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(openPdf(new File(['%PDF-1.7'], 'notes.pdf'), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('stops before allocating another canvas when decoded pages exceed the aggregate budget', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:memory-1').mockReturnValueOnce('blob:memory-2');
    const { pdf, page } = mockPdf();
    page.getViewport.mockReturnValue({ width: 4000, height: 4000 });
    await expect(convertPdf(pdf, 'notes.pdf', [1, 2, 3], { dpi: 72, format: 'png', quality: 90 })).rejects.toThrow('memory budget');
    // Small encoded blobs do not hide the large decoded image and render buffers.
    expect(page.render).toHaveBeenCalledTimes(2);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledTimes(2);
    expect(page.cleanup).toHaveBeenCalledTimes(3);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:memory-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:memory-2');
  });

  it('includes retained document and previous-result memory before allocating a canvas', async () => {
    const { pdf, page } = mockPdf();
    await expect(convertPdf(pdf, 'notes.pdf', [1], {
      dpi: 72, format: 'png', quality: 90, reservedBytes: MAX_MEMORY_BYTES - 10,
    })).rejects.toThrow('memory budget');
    expect(page.render).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    expect(page.cleanup).toHaveBeenCalledOnce();
  });

  it('checks encoded output and ZIP copies before retaining an image URL', async () => {
    HTMLCanvasElement.prototype.toBlob.mockImplementation((callback) => callback({ type: 'image/png', size: MAX_MEMORY_BYTES / 3 + 1 }));
    const createUrl = vi.spyOn(URL, 'createObjectURL');
    const { pdf } = mockPdf();
    await expect(convertPdf(pdf, 'notes.pdf', [1], { dpi: 72, format: 'png', quality: 90 })).rejects.toThrow('memory budget');
    expect(createUrl).not.toHaveBeenCalled();
  });
});
