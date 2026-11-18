import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'app',
  // relative asset paths so the build works at https://<user>.github.io/frs-auto-planner/
  base: './',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../dist', emptyOutDir: true },
  test: { root: '.', include: ['shared/**/*.test.ts'] },
} as never);
