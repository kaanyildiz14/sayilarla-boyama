import { expect, test } from '@playwright/test';
import path from 'node:path';

const IKI_RENK = path.join(import.meta.dirname, 'ornek', 'iki-renk.png');

test('bir kez açıldıktan sonra internetsiz açılır ve resim oluşturulur', async ({ page, context }) => {
  await page.goto('/');
  // service worker kurulup sayfayı devralana kadar bekle
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#gallery')).toBeVisible();

  // şablon üretimi ayrı bir dosyadaki işçiyle yapılır; o da önbellekte olmalı
  await page.locator('#empty-new').click();
  await page.locator('#file').setInputFiles(IKI_RENK);
  await page.locator('label:has(input[value=sade])').click();
  await page.locator('#make').click();
  await expect(page.locator('#paint')).toBeVisible({ timeout: 30_000 });
  await page.locator('#wand').click();
  await expect(page.locator('#progress-text')).toHaveText('%50');

  // doğrudan bir çalışmanın adresiyle de internetsiz açılır
  await page.reload();
  await expect(page.locator('#paint')).toBeVisible();
});
