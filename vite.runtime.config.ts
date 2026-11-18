import { defineConfig } from 'vite';

// Builds the in-game runtime as a single self-contained IIFE. The app embeds it
// (via ?raw) into the "Send to FRS" bookmarklet.
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify('0.1.0+' + Date.now().toString(36)) },
  build: {
    lib: { entry: 'runtime/main.ts', name: 'FRSAuto', formats: ['iife'], fileName: () => 'frs-auto-runtime.js' },
    outDir: 'runtime-dist',
    emptyOutDir: true,
    minify: true,
    target: 'es2020',
  },
});
