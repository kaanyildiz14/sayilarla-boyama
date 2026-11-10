import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages alt klasörde yayınlandığı için göreli yollar
  base: './',
  worker: { format: 'es' },
});
