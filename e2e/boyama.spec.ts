import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const ORNEK = path.join(import.meta.dirname, 'ornek', 'manzara.jpg');

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
