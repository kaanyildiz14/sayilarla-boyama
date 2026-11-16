import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages alt klasörde yayınlandığı için göreli yollar
  base: './',
  worker: { format: 'es' },
  // birim testleri; uçtan uca testler (e2e/) Playwright ile ayrı çalışır
  test: { include: ['tests/**/*.test.ts'] },
});
