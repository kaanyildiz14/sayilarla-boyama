import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_ADI, dbKapat } from '../src/depo/db';
import { boyaKaydet, calismaAc, calismalariListele, calismaOlustur, sonCalismaId } from '../src/depo/calismalar';
import type { Template } from '../src/islem/sablon';

const sablon: Template = {
  width: 2,
  height: 1,
  regionMap: Int32Array.from([0, 1]),
  regions: [
    { color: 0, labelX: 0, labelY: 0, labelR: 1, minX: 0, minY: 0, maxX: 0, maxY: 0 },
    { color: 1, labelX: 1, labelY: 0, labelR: 1, minX: 1, minY: 0, maxX: 1, maxY: 0 },
  ],
  palette: [
    { r: 255, g: 255, b: 255, hex: '#FFFFFF' },
    { r: 0, g: 0, b: 0, hex: '#000000' },
  ],
};

beforeEach(async () => {
  await dbKapat();
  globalThis.indexedDB = new IDBFactory();
});

/** v1.0'daki gibi tek "kayit" deposu olan eski veritabanını kurar. */
function eskiVeritabaniKur(icerik: { template?: Template; paint?: Blob }): Promise<void> {
  return new Promise((resolve, reject) => {
    const istek = indexedDB.open(DB_ADI, 1);
    istek.onupgradeneeded = () => istek.result.createObjectStore('kayit');
    istek.onsuccess = () => {
      const db = istek.result;
      const tx = db.transaction('kayit', 'readwrite');
      if (icerik.template) tx.objectStore('kayit').put(icerik.template, 'template');
      if (icerik.paint) tx.objectStore('kayit').put(icerik.paint, 'paint');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

describe('çalışmalar', () => {
  it('oluşturulan çalışma açılır ve son çalışma olur', async () => {
    const id = await calismaOlustur(sablon, 'orta');
    const acik = await calismaAc(id);
    expect(acik?.calisma.detail).toBe('orta');
    expect(acik?.template.regionMap).toEqual(sablon.regionMap);
    expect(acik?.paint).toBeNull();
    expect(await sonCalismaId()).toBe(id);
  });

  it('birden fazla çalışma saklanır, en yeni başta listelenir', async () => {
    const a = await calismaOlustur(sablon, 'sade');
    await new Promise((r) => setTimeout(r, 5));
    const b = await calismaOlustur(sablon, 'detayli');
    const liste = await calismalariListele();
    expect(liste.map((c) => c.id)).toEqual([b, a]);
  });

  it('boya kaydedilir ve çalışmanın tarihi güncellenir', async () => {
    const id = await calismaOlustur(sablon, 'orta');
    const once = (await calismaAc(id))!.calisma.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await boyaKaydet(id, new Blob(['boya']));
    const acik = await calismaAc(id);
    expect(acik?.paint).toBeTruthy();
    expect(acik!.calisma.updatedAt).toBeGreaterThan(once);
  });

  it('olmayan çalışma için null döner', async () => {
    expect(await calismaAc('yok')).toBeNull();
  });
});

describe('sürüm 1 → 2 göçü', () => {
  it('eski tek kayıt silinmeden ilk çalışmaya taşınır', async () => {
    await eskiVeritabaniKur({ template: sablon, paint: new Blob(['eski boya']) });
    const liste = await calismalariListele();
    expect(liste).toHaveLength(1);
    expect(liste[0].title).toBe('İlk boyamam');
    const acik = await calismaAc(liste[0].id);
    expect(acik?.template.palette).toEqual(sablon.palette);
    expect(acik?.paint).toBeTruthy();
    expect(await sonCalismaId()).toBe(liste[0].id);
  });

  it('eski veritabanı boşsa çalışma oluşmaz', async () => {
    await eskiVeritabaniKur({});
    expect(await calismalariListele()).toEqual([]);
    expect(await sonCalismaId()).toBeNull();
  });
});
