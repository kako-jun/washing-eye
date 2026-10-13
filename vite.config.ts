import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // three.js 単体で 500kB を超えるため、警告の閾値だけ上げる
  build: { chunkSizeWarningLimit: 700 },
  server: { host: true },
  preview: { host: true },
});
