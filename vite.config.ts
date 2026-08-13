import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        viewer: 'index.html',
        editor: 'editor.html',
      },
    },
  },
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    coverage: { reporter: ['text', 'html'] },
  },
});
