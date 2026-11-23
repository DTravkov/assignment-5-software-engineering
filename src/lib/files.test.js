import { describe, expect, it, vi } from 'vitest';
import { File } from 'node:buffer';
import JSZip from 'jszip';
import { createZip, downloadBlob, imageName, MAX_FILE_SIZE, parsePages, shareLinks, validatePdf } from './files';
import { MAX_MEMORY_BYTES } from './memory';

describe('document validation', () => {
  it('accepts a PDF with a valid signature and a case-insensitive extension', async () => {
    await expect(validatePdf(new File(['%PDF-1.7\ncontent'], 'report.PDF'))).resolves.toBeUndefined();
  });
  it('rejects non-PDF content, empty files, and files above the size limit', async () => {
    await expect(validatePdf(new File(['image'], 'image.png'))).rejects.toThrow('Choose a PDF');
    await expect(validatePdf(new File(['not a PDF'], 'report.pdf'))).rejects.toThrow('does not appear');
    await expect(validatePdf(new File([], 'empty.pdf'))).rejects.toThrow('empty');
    await expect(validatePdf({ name: 'large.pdf', size: MAX_FILE_SIZE + 1 })).rejects.toThrow('100 MB');
  });
});

describe('page selection', () => {
  it('sorts pages, expands ranges, handles en dashes, and removes duplicates', () => {
    expect(parsePages('5, 1, 2–4, 3', 8)).toEqual([1, 2, 3, 4, 5]);
  });
  it.each(['', '0', '9', '4-2', '1,', '1.5', '1-9', 'one', '1-2-3'])('rejects invalid range %j', (range) => {
    expect(() => parsePages(range, 8)).toThrow();
  });
});

describe('export and sharing', () => {
  it('rejects ZIP creation when decoded images and working copies exceed the memory budget', async () => {
    const images = [{ name: 'page.png', width: 4000, height: 4000, blob: { size: 70 * 1024 * 1024 } }];
    await expect(createZip(images)).rejects.toThrow('memory budget');
  });

  it('reserves document memory when preparing a ZIP', async () => {
    await expect(createZip([{ name: 'page.png', blob: new Uint8Array([1]) }], MAX_MEMORY_BYTES)).rejects.toThrow('memory budget');
  });
  it('builds safe, unambiguous output filenames', () => {
    expect(imageName('A:B.PDF', 12, 'jpeg')).toBe('A_B-page-012.jpg');
  });
  it('creates a ZIP containing every image with its exact data', async () => {
    const zipBlob = await createZip([
      { name: 'page-001.png', blob: new Uint8Array([1, 2, 3]) },
      { name: 'page-003.png', blob: new Uint8Array([4, 5]) },
    ]);
    const bytes = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsArrayBuffer(zipBlob); });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toEqual(['page-001.png', 'page-003.png']);
    expect(await zip.file('page-003.png').async('uint8array')).toEqual(new Uint8Array([4, 5]));
  });
  it('starts a named download and releases its temporary URL afterward', () => {
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { expect(this.download).toBe('page.png'); });
    downloadBlob(new Blob(['image']), 'page.png');
    expect(click).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-image');
    vi.useRealTimers();
  });
  it('encodes a converter URL for four social services without including document data', () => {
    const url = 'https://pagepress.example/?a=1&b=2';
    const links = shareLinks(url);
    expect(links.map((link) => link.name)).toEqual(['WhatsApp', 'Telegram', 'Facebook', 'X']);
    for (const link of links) expect(link.href).toContain(encodeURIComponent(url));
  });
});
