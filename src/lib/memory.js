export const MAX_MEMORY_BYTES = 256 * 1024 * 1024;

export function estimateImagesMemory(images) {
  // Decoded previews plus the encoded original and two ZIP working/output copies.
  return images.reduce((bytes, image) => bytes
    + (image.width || 0) * (image.height || 0) * 4
    + (image.blob.size ?? image.blob.byteLength) * 3, 0);
}

export function checkMemoryBudget(bytes) {
  if (bytes > MAX_MEMORY_BYTES) {
    throw new Error('This export would exceed the estimated 256 MB memory budget. Select fewer pages or lower the resolution.');
  }
}
