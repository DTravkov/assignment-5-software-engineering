import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { TextEncoder, TextDecoder } from 'node:util';

globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
afterEach(cleanup);
Object.defineProperty(URL, 'createObjectURL', { writable: true, value: vi.fn(() => 'blob:test-image') });
Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: vi.fn() });
window.matchMedia = vi.fn(() => ({ matches: true }));
Element.prototype.scrollIntoView = vi.fn();
HTMLDialogElement.prototype.showModal = vi.fn();
