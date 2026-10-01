/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` lets the same build live at a GitHub Pages sub-path (e.g. /billpdfeditor/v2/).
export default defineConfig({
  plugins: [react()],
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  optimizeDeps: { exclude: ['@embedpdf/pdfium'] },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
