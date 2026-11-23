import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { convertPdf, openPdf } from './lib/pdf';
import { createZip, downloadBlob } from './lib/files';

vi.mock('./lib/pdf', () => ({ openPdf: vi.fn(), convertPdf: vi.fn() }));
vi.mock('./lib/files', async (importOriginal) => ({ ...await importOriginal(), createZip: vi.fn(), downloadBlob: vi.fn() }));

beforeEach(() => {
  openPdf.mockResolvedValue({ numPages: 3, destroy: vi.fn() });
  convertPdf.mockResolvedValue([{ page: 2, name: 'Field notes-page-002.png', width: 840, height: 1120, blob: new Blob(['image'], { type: 'image/png' }), url: 'blob:result' }]);
  createZip.mockResolvedValue(new Blob(['zip']));
});

afterEach(() => {
  delete navigator.share;
  delete navigator.canShare;
});

it('shares the converted image files through the native share sheet when supported', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Try a sample PDF' }));
  await screen.findByText('Field notes.pdf');
  await user.click(screen.getByRole('button', { name: /Convert to PNG/ }));
  await screen.findByRole('button', { name: 'Download page 2' });
  await user.click(screen.getByText('Share in…'));
  await user.click(screen.getByRole('button', { name: 'Share image files…' }));
  expect(share).toHaveBeenCalledWith({ files: [expect.any(File)], title: 'Images from Pagepress' });
  expect(share.mock.calls[0][0].files[0].name).toBe('Field notes-page-002.png');
});

it('keeps conversion disabled until a PDF is loaded, then validates custom pages', async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByRole('button', { name: /Convert to PNG/ })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Try a sample PDF' }));
  await screen.findByText('Field notes.pdf');
  await user.click(screen.getByRole('button', { name: 'Select pages' }));
  const range = screen.getByRole('textbox', { name: 'Page numbers or ranges' });
  await user.type(range, '4');
  expect(screen.getByRole('button', { name: /Convert to PNG/ })).toBeDisabled();
  await user.clear(range); await user.type(range, '2');
  await user.click(screen.getByRole('button', { name: /Convert to PNG/ }));
  await screen.findByRole('button', { name: 'Download page 2' });
  expect(convertPdf).toHaveBeenCalledWith(expect.any(Object), 'Field notes.pdf', [2], expect.objectContaining({ format: 'png', dpi: 144 }), expect.any(Function));
});

it('supports downloads and offers social sharing with an honest file-attachment fallback', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Try a sample PDF' }));
  await screen.findByText('Field notes.pdf');
  await user.click(screen.getByRole('button', { name: /Convert to PNG/ }));
  await user.click(await screen.findByRole('button', { name: 'Download page 2' }));
  expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Field notes-page-002.png');
  await user.click(screen.getByRole('button', { name: /Download all/ }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Field notes-images.zip'));
  await user.click(screen.getByText('Share in…'));
  for (const name of ['WhatsApp', 'Telegram', 'Facebook', 'X']) expect(screen.getByRole('link', { name: `${name} (opens in a new tab)` })).toHaveAttribute('target', '_blank');
  expect(screen.getByText(/Download your images first/)).toBeVisible();
});

it('announces unreadable PDFs without enabling conversion', async () => {
  openPdf.mockRejectedValue(new Error('We could not read this PDF.'));
  render(<App />);
  fireEvent.change(screen.getByLabelText('Choose PDF document'), { target: { files: [new File(['bad'], 'broken.pdf')] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('We could not read this PDF.');
  expect(screen.getByRole('button', { name: /Convert to PNG/ })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('offers cancellation while opening a PDF and returns to the upload state', async () => {
  openPdf.mockImplementationOnce((_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Try a sample PDF' }));
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(screen.getByRole('button', { name: 'Choose a PDF' })).toBeEnabled();
  expect(screen.getByRole('button', { name: /Convert to PNG/ })).toBeDisabled();
  expect(screen.getByText('Opening cancelled. Choose a PDF when you are ready.', { selector: 'p' })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('resets the facade when removing a document and clears the displayed results', async () => {
  const user = userEvent.setup();
  const destroy = vi.fn();
  openPdf.mockResolvedValueOnce({ numPages: 3, destroy });
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Try a sample PDF' }));
  await screen.findByText('Field notes.pdf');
  await user.click(screen.getByRole('button', { name: /Convert to PNG/ }));
  await screen.findByRole('button', { name: 'Download page 2' });
  await user.click(screen.getByRole('button', { name: 'Remove document' }));
  expect(destroy).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Download page 2' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Convert to PNG/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Choose a PDF' })).toBeVisible();
});
