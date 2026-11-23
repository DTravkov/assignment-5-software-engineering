import { checkMemoryBudget, estimateImagesMemory } from './memory';

export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const FORMATS = {
  png: { label: 'PNG', mime: 'image/png', extension: 'png', description: 'Lossless · best for text' },
  jpeg: { label: 'JPG', mime: 'image/jpeg', extension: 'jpg', description: 'Smaller files · easy to share' },
  webp: { label: 'WebP', mime: 'image/webp', extension: 'webp', description: 'Compact · made for the web' },
};

export async function validatePdf(file) {
  if (!file || !/\.pdf$/i.test(file.name)) throw new Error('Choose a PDF document (.pdf) to get started.');
  if (!file.size) throw new Error('This file is empty. Choose another PDF.');
  if (file.size > MAX_FILE_SIZE) throw new Error('This PDF is too large. Choose a file under 100 MB.');
  const signature = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
  if (!signature.includes('%PDF-')) throw new Error('This file does not appear to be a PDF. Please choose another document.');
}

export function parsePages(value, total) {
  if (!Number.isInteger(total) || total < 1) throw new Error('No pages are available.');
  if (!value.trim()) throw new Error('Enter pages, for example 1, 3–5.');
  const pages = new Set();
  for (const part of value.replace(/[–—]/g, '-').split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Use page numbers or ranges, for example 1, 3–5.');
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start < 1 || end > total || end < start) throw new Error(`Choose pages between 1 and ${total}, with ranges in ascending order.`);
    for (let page = start; page <= end; page++) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

export function baseName(name) {
  return name.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'document';
}

export function imageName(name, page, format) {
  return `${baseName(name)}-page-${String(page).padStart(3, '0')}.${FORMATS[format].extension}`;
}

export function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to begin the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function createZip(images, reservedBytes = 0) {
  checkMemoryBudget(reservedBytes + estimateImagesMemory(images));
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const image of images) zip.file(image.name, image.blob);
  return zip.generateAsync({ type: 'blob' });
}

export function shareLinks(url) {
  const text = 'Turn PDF pages into pictures with Pagepress.';
  return [
    { name: 'WhatsApp', mark: 'W', href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { name: 'Telegram', mark: 'T', href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { name: 'Facebook', mark: 'f', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { name: 'X', mark: '𝕏', href: `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
  ];
}
