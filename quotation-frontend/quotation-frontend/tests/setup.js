import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom has no object URLs; the app uses them for PDF previews and downloads
URL.createObjectURL = vi.fn(() => 'blob:mock-url');
URL.revokeObjectURL = vi.fn();
window.scrollTo = vi.fn();
