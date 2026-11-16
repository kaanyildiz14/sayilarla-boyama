import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const ORNEK = path.join(import.meta.dirname, 'ornek', 'manzara.jpg');
const IKI_RENK = path.join(import.meta.dirname, 'ornek', 'iki-renk.png');

/** Ekrandaki tuvalden, verilen CSS noktalarının renklerini okur. */
async function pikseller(page: Page, noktalar: [number, number][]): Promise<number[][]> {
  return page.locator('#canvas').evaluate((c: HTMLCanvasElement, pts) => {
    const ctx = c.getContext('2d')!;
    const oran = c.width / c.clientWidth;
    return pts.map(([x, y]) => Array.from(ctx.getImageData(Math.round(x * oran), Math.round(y * oran), 1, 1).data));
  }, noktalar);
}

const beyazMi = (p: number[]) => p[0] > 245 && p[1] > 245 && p[2] > 245;

/** nasil: 'git' = baştan aç, 'bos' = boş galeriden, 'yeni' = galerideki ＋ düğmesiyle */
async function sablonOlustur(page: Page, nasil: 'git' | 'bos' | 'yeni' = 'git') {
  if (nasil === 'git') await page.goto('/');
  if (nasil === 'yeni') await page.locator('#new').click();
  else await page.locator('#empty-new').click();
  await expect(page.locator('#start')).toBeVisible();
  await page.locator('#file').setInputFiles(ORNEK);
  await page.locator('label:has(input[value=sade])').click();
  await page.locator('#make').click();
  await expect(page.locator('#paint')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.swatch').first()).toBeVisible();
}

test('fotoğraftan şablon oluşur, boyanır ve yenileyince boya yerinde kalır', async ({ page }) => {
  await sablonOlustur(page);
  await expect(page).toHaveURL(/#\/boya\/.+/);
  const kutu = (await page.locator('#canvas').boundingBox())!;

  // tuvalin ortasında, kalın fırçayla kısa bir darbe
  await page.locator('#tool-brush').click();
  await page.locator('#brush').fill('80');
  const x = kutu.width * 0.3, y = kutu.height * 0.25;
  const noktalar: [number, number][] = [0, 4, 8, 12].map((d) => [x + d, y]);
  const once = await pikseller(page, noktalar);
  expect(once.filter(beyazMi).length).toBeGreaterThanOrEqual(3);

  await page.mouse.move(kutu.x + x, kutu.y + y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(kutu.x + x + i * 2, kutu.y + y);
  await page.mouse.up();

  await expect(page.locator('#undo')).toBeEnabled();
  const sonra = await pikseller(page, noktalar);
  expect(sonra.filter((p) => !beyazMi(p)).length).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#saved')).toHaveText('Kaydedildi ✓', { timeout: 10_000 });

  // sayfa yenilenince aynı çalışma, aynı boyayla açılır
  await page.reload();
  await expect(page.locator('#paint')).toBeVisible();
  await expect(page.locator('#saved')).toHaveText('Kayıttan açıldı');
  const yenilenince = await pikseller(page, noktalar);
  expect(yenilenince.filter((p) => !beyazMi(p)).length).toBeGreaterThanOrEqual(3);
});

test('galeri: boş halden ilk resme, birden fazla resim, yeniden adlandırma ve silme', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gallery')).toBeVisible();
  await expect(page.locator('#empty')).toBeVisible();

  await sablonOlustur(page, 'bos');
  const ilkAdres = page.url();
  await page.locator('#back').click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('.work')).toHaveCount(1);
  await expect(page.locator('.work img')).toHaveCount(1); // kapak var

  await sablonOlustur(page, 'yeni');
  await page.locator('#back').click();
  await expect(page.locator('.work')).toHaveCount(2);

  // en son açılan başta; ilk resme dokununca aynı çalışma açılır
  await page.locator('.work').nth(1).locator('.work-open').click();
  await expect(page.locator('#paint')).toBeVisible();
  expect(page.url()).toBe(ilkAdres);
  await page.goBack();
  await expect(page.locator('#gallery')).toBeVisible();

  // yeniden adlandır
  const kart = page.locator('.work').first();
  await kart.locator('.work-menu').click();
  page.once('dialog', (d) => d.accept('Eşimle düğünde'));
  await kart.getByRole('button', { name: 'Adını değiştir' }).click();
  await expect(page.locator('.work-title').first()).toHaveText('Eşimle düğünde');

  // sil (önce vazgeç, sonra onayla)
  await page.locator('.work').first().locator('.work-menu').click();
  page.once('dialog', (d) => d.dismiss());
  await page.locator('.work').first().getByRole('button', { name: 'Sil' }).click();
  await expect(page.locator('.work')).toHaveCount(2);
  page.once('dialog', (d) => d.accept());
  await page.locator('.work').first().getByRole('button', { name: 'Sil' }).click();
  await expect(page.locator('.work')).toHaveCount(1);
  await expect(page.locator('.work-title')).not.toHaveText('Eşimle düğünde');

  // yenileyince galeri aynı
  await page.reload();
  await expect(page.locator('.work')).toHaveCount(1);
});

test('olmayan bir çalışmanın adresi galeriye döner', async ({ page }) => {
  await page.goto('/#/boya/olmayan-id');
  await expect(page.locator('#gallery')).toBeVisible();
  await expect(page.locator('#gallery-error')).toHaveText('Bu çalışma bulunamadı.');
});

test('v1.0 kaydı olan kullanıcı boyamasını kaybetmez', async ({ page }) => {
  // uygulama yüklenmeden aynı adreste eski (sürüm 1) veritabanını kur
  await page.goto('/manifest.webmanifest');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const istek = indexedDB.open('sayilarla-boyama', 1);
        istek.onupgradeneeded = () => istek.result.createObjectStore('kayit');
        istek.onsuccess = () => {
          const db = istek.result;
          const w = 40, h = 30;
          const regionMap = new Int32Array(w * h).map((_, p) => (p % w < w / 2 ? 0 : 1));
          const template = {
            width: w,
            height: h,
            regionMap,
            regions: [
              { color: 0, labelX: 10, labelY: 15, labelR: 9, minX: 0, minY: 0, maxX: 19, maxY: 29 },
              { color: 1, labelX: 30, labelY: 15, labelR: 9, minX: 20, minY: 0, maxX: 39, maxY: 29 },
            ],
            palette: [
              { r: 230, g: 80, b: 60, hex: '#E6503C' },
              { r: 40, g: 90, b: 200, hex: '#285AC8' },
            ],
          };
          const tx = db.transaction('kayit', 'readwrite');
          tx.objectStore('kayit').put(template, 'template');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        istek.onerror = () => reject(istek.error);
      }),
  );

  await page.goto('/');
  await expect(page.locator('.work')).toHaveCount(1);
  await expect(page.locator('.work-title')).toHaveText('İlk boyamam');
  await page.locator('.work-open').click();
  await expect(page.locator('#paint')).toBeVisible();
  await expect(page.locator('.swatch')).toHaveCount(2);
  // açılınca kapak üretilir; galeride görünür
  await page.locator('#back').click();
  await expect(page.locator('.work img')).toHaveCount(1);
});

test('oyun: yanlış renk, dokun-doldur, renk tamam, resim tamam, geri al', async ({ page }) => {
  await page.goto('/');
  await page.locator('#empty-new').click();
  await page.locator('#file').setInputFiles(IKI_RENK);
  await page.locator('label:has(input[value=sade])').click();
  await page.locator('#make').click();
  await expect(page.locator('#paint')).toBeVisible({ timeout: 30_000 });

  // sol yarı açık sarı (1), sağ yarı koyu mavi (2)
  await expect(page.locator('.swatch')).toHaveCount(2);
  await expect(page.locator('#progress-text')).toHaveText('%0');
  await expect(page.locator('#tool-tap')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.swatch').nth(0)).toHaveClass(/selected/);

  const k = (await page.locator('#canvas').boundingBox())!;
  const sol = { x: k.x + k.width * 0.3, y: k.y + k.height / 2 };
  const sag = { x: k.x + k.width * 0.7, y: k.y + k.height / 2 };

  // yanlış renk: dolmaz, ipucu verir
  await page.mouse.click(sag.x, sag.y);
  await expect(page.locator('#toast')).toHaveText('Bu bölge 2 numara');
  await expect(page.locator('#progress-text')).toHaveText('%0');

  // doğru renk: dolar, renk tamamlanır, sıradaki renge geçilir
  await page.mouse.click(sol.x, sol.y);
  await expect(page.locator('#progress-text')).toHaveText('%50');
  await expect(page.locator('#toast')).toHaveText('1 numara tamam ✓');
  await expect(page.locator('.swatch').nth(0)).toHaveClass(/tamam/);
  await expect(page.locator('.swatch').nth(1)).toHaveClass(/selected/);

  // son bölge: resim tamam → tamamlandı ekranı ve tekrar animasyonu
  await expect(page.locator('#replay-open')).toBeHidden();
  await page.mouse.click(sag.x, sag.y);
  await expect(page.locator('#progress-text')).toHaveText('✓');
  await expect(page.locator('#done')).toBeVisible();
  await expect(page.locator('#done-title')).toContainText('Tamamlandı');
  await expect(page.locator('#done')).toHaveAttribute('data-durum', 'bitti', { timeout: 15_000 });
  await page.locator('#done-close').click();
  await expect(page.locator('#done')).toBeHidden();

  // geri al: tamamlanma bozulur, tekrar doldurunca geri gelir
  await page.locator('#undo').click();
  await expect(page.locator('#progress-text')).toHaveText('%50');
  await expect(page.locator('.swatch').nth(1)).not.toHaveClass(/tamam/);
  await expect(page.locator('#replay-open')).toBeHidden();
  await page.mouse.click(sag.x, sag.y);
  await expect(page.locator('#done')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#done')).toBeHidden();
  await expect(page.locator('#saved')).toHaveText('Kaydedildi ✓', { timeout: 10_000 });

  // galeride bitti olarak görünür; tekrar açınca ilerleme boyadan hesaplanır
  await page.locator('#back').click();
  await expect(page.locator('.work-date')).toContainText('✓ Bitti');
  await page.locator('.work-open').click();
  await expect(page.locator('#progress-text')).toHaveText('✓');
  await expect(page.locator('.swatch.tamam')).toHaveCount(2);

  // bitmiş resim sonradan da izlenebilir; kayıtlı hamlelerle resim yeniden oluşur
  await expect(page.locator('#done')).toBeHidden();
  await page.locator('#menu-btn').click();
  await page.locator('#replay-open').click();
  await expect(page.locator('#menu')).toBeHidden(); // düğmeye basınca menü kapanır
  await expect(page.locator('#done')).toHaveAttribute('data-durum', 'bitti', { timeout: 15_000 });
  const renkler = await page.locator('#replay').evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d')!;
    const al = (x: number) => Array.from(ctx.getImageData(Math.round(c.width * x), Math.round(c.height / 2), 1, 1).data);
    return [al(0.25), al(0.75)];
  });
  expect(renkler[0][0]).toBeGreaterThan(200); // sol: açık sarı
  expect(renkler[1][2]).toBeGreaterThan(renkler[1][0]); // sağ: mavi
  await page.locator('#done-gallery').click();
  await expect(page.locator('#gallery')).toBeVisible();
});

test('oyun: dokun modunda sürüklemek resmi kaydırır, boyamaz', async ({ page }) => {
  await page.goto('/');
  await page.locator('#empty-new').click();
  await page.locator('#file').setInputFiles(IKI_RENK);
  await page.locator('label:has(input[value=sade])').click();
  await page.locator('#make').click();
  await expect(page.locator('#paint')).toBeVisible({ timeout: 30_000 });
  const k = (await page.locator('#canvas').boundingBox())!;
  const x = k.x + k.width * 0.3, y = k.y + k.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 10, y);
  await page.mouse.up();
  await expect(page.locator('#progress-text')).toHaveText('%0');
  await expect(page.locator('#undo')).toBeDisabled();
});

test('ekran boyutu değişince (cihaz yan çevrilince) resim ekranda kalır', async ({ page }) => {
  await sablonOlustur(page);
  const ortadakiRenk = async () => {
    const k = (await page.locator('#canvas').boundingBox())!;
    return (await pikseller(page, [[k.width / 2, k.height / 2]]))[0];
  };
  // sahne arka planı #e9e7e2; resim ekrandaysa ortada o renk olmamalı
  const sahneMi = (p: number[]) => p[0] === 0xe9 && p[1] === 0xe7 && p[2] === 0xe2;
  expect(sahneMi(await ortadakiRenk())).toBe(false);
  const v = page.viewportSize()!;
  await page.setViewportSize({ width: v.height, height: v.width });
  await page.waitForTimeout(300);
  expect(sahneMi(await ortadakiRenk())).toBe(false);
  await page.setViewportSize(v);
  await page.waitForTimeout(300);
  expect(sahneMi(await ortadakiRenk())).toBe(false);
});

test('yardımcılar: sihirli değnek, bulucu ve geri al', async ({ page }) => {
  await page.goto('/');
  await page.locator('#empty-new').click();
  await page.locator('#file').setInputFiles(IKI_RENK);
  await page.locator('label:has(input[value=sade])').click();
  await page.locator('#make').click();
  await expect(page.locator('#paint')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.swatch')).toHaveCount(2);

  // bulucu: kalan bölgeyi söyler
  await page.locator('#finder').click();
  await expect(page.locator('#toast')).toHaveText('1 numara: 1 bölge kaldı');

  // değnek: ekranda görünen bütün 1'leri boyar; renk bitince sıradakine geçer
  await page.locator('#wand').click();
  await expect(page.locator('#progress-text')).toHaveText('%50');
  await expect(page.locator('.swatch').nth(1)).toHaveClass(/selected/);
  await page.locator('#wand').click();
  await expect(page.locator('#progress-text')).toHaveText('✓');
  await page.locator('#done-close').click();

  // değnek tek "geri al" ile geri gelir
  await page.locator('#undo').click();
  await expect(page.locator('#progress-text')).toHaveText('%50');

  // bitmiş renkte bulucu "kalan yok" der
  await page.locator('.swatch').nth(0).click();
  await page.locator('#finder').click();
  await expect(page.locator('#toast')).toHaveText('1 numarada kalan bölge yok');
  await page.locator('#wand').click();
  await expect(page.locator('#toast')).toHaveText('1 numarada kalan bölge yok');
});

test('menü ve ayarlar: tek satır araç çubuğu, fırça çubuğu, otomatik renk, sol el', async ({ page }) => {
  await page.goto('/');
  await page.locator('#empty-new').click();
  await page.locator('#file').setInputFiles(IKI_RENK);
  await page.locator('label:has(input[value=sade])').click();
  await page.locator('#make').click();
  await expect(page.locator('#paint')).toBeVisible({ timeout: 30_000 });

  // araç çubuğu tek satır: bütün düğmeler aynı hizada ve ekranın içinde
  const kutular = await page.locator('.toolbar > *').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => ({ ust: Math.round(r.top + r.height / 2), sag: r.right })),
  );
  const ortalar = kutular.map((k) => k.ust);
  expect(Math.max(...ortalar) - Math.min(...ortalar)).toBeLessThan(6);
  expect(Math.max(...kutular.map((k) => k.sag))).toBeLessThanOrEqual(page.viewportSize()!.width);

  // fırça çubuğu yalnızca fırça aracında
  await expect(page.locator('#brush-bar')).toBeHidden();
  await page.locator('#tool-brush').click();
  await expect(page.locator('#brush-bar')).toBeVisible();
  await page.locator('#tool-tap').click();

  // menü: aç, dışarı dokununca kapanır
  await page.locator('#menu-btn').click();
  await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#palette').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#menu')).toBeHidden();

  // "renk bitince sıradakine geç" kapalıyken seçili renk değişmez
  await page.locator('#menu-btn').click();
  await expect(page.locator('#set-oto')).toBeChecked();
  await page.locator('#set-oto').uncheck();
  await page.locator('#set-sol').check();
  await expect(page.locator('body')).toHaveClass(/sol-el/);
  await page.keyboard.press('Escape');
  await page.locator('#wand').click();
  await expect(page.locator('.swatch').nth(0)).toHaveClass(/tamam/);
  await expect(page.locator('.swatch').nth(0)).toHaveClass(/selected/);

  // ayarlar yenilemeden sonra da geçerli
  await page.reload();
  await expect(page.locator('#paint')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/sol-el/);
  await page.locator('#menu-btn').click();
  await expect(page.locator('#set-oto')).not.toBeChecked();
});
