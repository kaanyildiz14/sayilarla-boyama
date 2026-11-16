import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Çevrimdışı çalışma için service worker üretir.
 * Derleme sonunda oluşan bütün dosyaların listesini sw.js içine yazar; tarayıcı
 * ilk açılışta hepsini önbelleğe alır, sonra internet olmadan da uygulama açılır.
 * Her derleme yeni bir önbellek sürümü üretir; eski sürümün önbelleği silinir.
 */
function cevrimdisi(): Plugin {
  return {
    name: 'cevrimdisi',
    apply: 'build',
    generateBundle(_secenekler, paket) {
      const dosyalar = [
        './',
        ...Object.keys(paket).filter((ad) => ad !== 'sw.js'),
        ...readdirSync('public'), // simge ve bildirim dosyaları olduğu gibi kopyalanır
      ].sort();
      // Her derlemede yeni sürüm: index.html gibi adı değişmeyen dosyalar da yenilensin
      const surum = createHash('sha256').update(dosyalar.join('|')).update(String(Date.now())).digest('hex').slice(0, 12);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `// Otomatik üretilir (vite.config.ts). Elle düzenlemeyin.
const ONBELLEK = 'sayilarla-boyama-${surum}';
const DOSYALAR = ${JSON.stringify(dosyalar)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(ONBELLEK).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // eski sürümlerin önbelleklerini sil
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a.startsWith('sayilarla-boyama-') && a !== ONBELLEK).map((a) => caches.delete(a))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const istek = e.request;
  if (istek.method !== 'GET' || new URL(istek.url).origin !== location.origin) return;
  // önce önbellek, yoksa ağ; sayfa isteğinde (adres çubuğu) her zaman ana sayfa
  e.respondWith(
    // ignoreVary: sunucunun Vary başlığı (Origin, Accept-Encoding) yüzünden
    // önbellekteki dosya "farklı istek" sayılıp bulunamıyordu (Chrome'da görüldü)
    caches.match(istek.mode === 'navigate' ? './' : istek, { ignoreSearch: istek.mode === 'navigate', ignoreVary: true })
      .then((yanit) => yanit || fetch(istek)),
  );
});
`,
      });
    },
  };
}

export default defineConfig({
  // GitHub Pages alt klasörde yayınlandığı için göreli yollar
  base: './',
  worker: { format: 'es' },
  plugins: [cevrimdisi()],
  // birim testleri; uçtan uca testler (e2e/) Playwright ile ayrı çalışır
  test: { include: ['tests/**/*.test.ts'] },
});
