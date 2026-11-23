import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const JSZip = createRequire(import.meta.url)('jszip');

test('cancels real PDF opening while the worker is loading and can retry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try a sample PDF' })).toBeVisible();
  const workerPattern = '**/*pdf.worker*.mjs*';
  let pendingWorker;
  await page.route(workerPattern, (route) => { pendingWorker = route; });
  await page.getByRole('button', { name: 'Try a sample PDF' }).click();
  await expect.poll(() => Boolean(pendingWorker)).toBe(true);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose a PDF' })).toBeEnabled();
  await expect(page.getByText('Opening cancelled. Choose a PDF when you are ready.', { exact: true }).last()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await pendingWorker.abort().catch(() => {});
  await page.unroute(workerPattern);
  await page.getByRole('button', { name: 'Try a sample PDF' }).click();
  await expect(page.getByText('Field notes.pdf', { exact: true })).toBeVisible();
});

test('converts a real PDF selection, previews it, and downloads valid PNGs and a ZIP', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Convert to PNG/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Try a sample PDF' }).click();
  await expect(page.getByText('Field notes.pdf', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select pages' }).click();
  await page.getByRole('textbox', { name: 'Page numbers or ranges' }).fill('1, 3');
  await page.getByRole('button', { name: /Convert to PNG/ }).click();
  await expect(page.getByRole('button', { name: 'Preview page 3', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview page 2', exact: true })).toHaveCount(0);
  const image = page.getByAltText('Converted PDF page 1', { exact: true });
  await expect.poll(() => image.evaluate((node) => node.naturalWidth)).toBe(840);
  await page.getByRole('button', { name: 'Preview page 1', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const imageDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download page 1', exact: true }).click();
  const download = await imageDownload;
  expect(download.suggestedFilename()).toBe('Field notes-page-001.png');
  expect((await readFile(await download.path())).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const zipDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download all/ }).click();
  const zip = await JSZip.loadAsync(await readFile(await (await zipDownload).path()));
  expect(Object.keys(zip.files)).toEqual(['Field notes-page-001.png', 'Field notes-page-003.png']);
  await page.getByText('Share in…', { exact: true }).click();
  await expect(page.getByRole('link', { name: /Telegram/ })).toHaveAttribute('href', /t\.me\/share\/url/);
  await expect(page.getByText(/These links share the converter/)).toBeVisible();
  await page.screenshot({ path: 'test-results/converted-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('encodes actual JPG and WebP output at standard resolution', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample PDF' }).click();
  await expect(page.getByText('Field notes.pdf', { exact: true })).toBeVisible();
  await page.getByLabel('Resolution', { exact: true }).selectOption('72');
  await page.getByRole('button', { name: 'Select pages' }).click();
  await page.getByRole('textbox', { name: 'Page numbers or ranges' }).fill('2');
  for (const format of ['JPG', 'WebP']) {
    await page.getByRole('button', { name: format, exact: true }).click();
    await page.getByRole('slider', { name: 'Image quality' }).fill('80');
    await page.getByRole('button', { name: new RegExp(`Convert to ${format}`) }).click();
    // A previous conversion can still be visible while its replacement renders.
    await expect(page.getByText(new RegExp(`^${format} images`))).toBeVisible();
    const preview = page.getByAltText('Converted PDF page 2', { exact: true });
    await expect.poll(() => preview.evaluate((image) => image.naturalWidth)).toBe(420);
    await expect.poll(async () => preview.evaluate(async (image) => (await fetch(image.src)).headers.get('Content-Type'))).toBe(format === 'JPG' ? 'image/jpeg' : 'image/webp');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download page 2', exact: true }).click();
    expect((await downloading).suggestedFilename()).toMatch(format === 'JPG' ? /\.jpg$/ : /\.webp$/);
  }
});

test('handles invalid uploads and stays usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Choose PDF document').setInputFiles({ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await expect(page.getByRole('alert')).toContainText('does not appear to be a PDF');
  await page.getByRole('button', { name: 'Dismiss error' }).click();
  await page.getByRole('button', { name: 'Try a sample PDF' }).click();
  await expect(page.getByText('Field notes.pdf', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select pages' }).click();
  await page.getByRole('textbox', { name: 'Page numbers or ranges' }).fill('4');
  await expect(page.getByRole('button', { name: /Convert to PNG/ })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Page numbers or ranges' }).fill('1');
  await page.getByRole('button', { name: /Convert to PNG/ }).click();
  await expect(page.getByRole('button', { name: 'Preview page 1', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/converted-mobile.png', fullPage: true });
});
