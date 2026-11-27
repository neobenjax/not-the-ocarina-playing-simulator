import { defineConfig } from 'vite';

export default defineConfig({
  base: '/not-the-ocarina-playing-simulator/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
