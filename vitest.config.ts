import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@app': resolve(__dirname, 'src/app'),
    },
  },
});
