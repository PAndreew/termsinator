import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import webExtension from 'vite-plugin-web-extension';
import { generateManifest, type BuildTarget } from './manifest.config';

const target = (process.env.TARGET as BuildTarget) ?? 'chrome';

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
  build: {
    outDir: `dist/${target}`,
    emptyOutDir: true,
    sourcemap: true,
  },
  plugins: [
    preact(),
    webExtension({
      // popup + options HTML are discovered from the manifest (action.default_popup,
      // options_ui.page); background and content scripts likewise.
      manifest: () => generateManifest(target),
      browser: target,
      disableAutoLaunch: true,
    }),
  ],
});
