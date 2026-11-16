import { expect, test } from '@playwright/test';
import path from 'node:path';

const IKI_RENK = path.join(import.meta.dirname, 'ornek', 'iki-renk.png');

// Gerçek dokunma olaylarıyla (fare tıklaması değil) temel akış.
test('dokunarak: resim oluştur, galeriden aç, hızlı dokunuşlar da çalışır', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'yalnızca dokunmatik cihaz profillerinde');
  await page.goto('/');
  await page.locator('#empty-new').tap();
  await page.locator('#file').setInputFiles(IKI_RENK);
  await page.locator('label:has(input[value=sade])').tap();
  await page.locator('#make').tap();
  await expect(page.locator('#paint')).toBeVisible({ timeout: 30_000 });

  await page.locator('#back').tap();
  await expect(page.locator('.work')).toHaveCount(1);
  await page.locator('.work-open').tap();
  await expect(page.locator('#paint')).toBeVisible();

  // art arda iki hızlı dokunuş: ikisi de işlenmeli (iki renk de değnekle boyanır)
  await page.locator('#wand').tap();
  await page.locator('#wand').tap();
  await expect(page.locator('#progress-text')).toHaveText('✓');
});

// iOS Safari'de sayfanın büyümesini engelleyen ayarın yanlışlıkla silinmesine karşı
test('sayfa büyütme kapalı: arayüz pan-x pan-y, tuval none', async ({ page }) => {
  await page.goto('/');
  const ta = (secici: string) => page.locator(secici).evaluate((el) => getComputedStyle(el).touchAction);
  expect(await ta('body')).toBe('pan-x pan-y');
  expect(await ta('#empty-new')).toBe('pan-x pan-y');
  expect(await ta('#wand')).toBe('pan-x pan-y');
  expect(await ta('#canvas')).toBe('none');
});

// Emoji ve özel metin simgeleri bazı iOS sürümlerinde soru işareti kutusu çıkıyor
test('düğmelerde emoji yok, simgeler SVG', async ({ page }) => {
  await page.goto('/');
  const metin = await page.locator('button').allInnerTexts();
  for (const t of metin) expect(t).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{25A0}-\u{25FF}\u{FF00}-\u{FFEF}]/u);
  for (const id of ['undo', 'tool-tap', 'tool-brush', 'finder', 'wand', 'replay-open', 'replay-again', 'new', 'menu-btn', 'back'])
    await expect(page.locator(`#${id} svg.ikon`)).toHaveCount(1);
});
