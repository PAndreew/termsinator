import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
      '@application': resolve(__dirname, 'src/application'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@presentation': resolve(__dirname, 'src/presentation'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    // All logic units are DOM-free (sanitizer is regex-based so it also runs in
    // the MV3 service worker), so the fast node environment is sufficient.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/application/**', 'src/infrastructure/**'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/*.d.ts'],
      reporter: ['text', 'html'],
    },
  },
});
