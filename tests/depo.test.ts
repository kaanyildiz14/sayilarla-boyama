import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_ADI, dbKapat } from '../src/depo/db';
import {
  boyaKaydet,
  calismaAc,
  calismaSil,
  calismalariListele,
  calismaOlustur,
  kapakBlob,
  kapakKaydet,
  sonCalismaId,
  yenidenAdlandir,
} from '../src/depo/calismalar';
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

  it('kapak oluştururken ve boyarken kaydedilir', async () => {
    const id = await calismaOlustur(sablon, 'orta', new Blob(['kapak1']));
    let c = (await calismaAc(id))!.calisma;
    expect(await kapakBlob(c)!.text()).toBe('kapak1');
    await boyaKaydet(id, new Blob(['boya']), new Blob(['kapak2']));
    c = (await calismaAc(id))!.calisma;
    expect(await kapakBlob(c)!.text()).toBe('kapak2');
  });

  it('sadece kapak güncellenince tarih değişmez', async () => {
    const id = await calismaOlustur(sablon, 'orta');
    const once = (await calismaAc(id))!.calisma;
    expect(kapakBlob(once)).toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    await kapakKaydet(id, new Blob(['k']));
    const sonra = (await calismaAc(id))!.calisma;
    expect(sonra.updatedAt).toBe(once.updatedAt);
    expect(kapakBlob(sonra)).not.toBeNull();
  });

  it('yeniden adlandırılır; boş ad yok sayılır, uzun ad kısaltılır', async () => {
    const id = await calismaOlustur(sablon, 'orta');
    await yenidenAdlandir(id, '  Eşimle düğünde  ');
    expect((await calismaAc(id))!.calisma.title).toBe('Eşimle düğünde');
    await yenidenAdlandir(id, '   ');
    expect((await calismaAc(id))!.calisma.title).toBe('Eşimle düğünde');
    await yenidenAdlandir(id, 'x'.repeat(100));
    expect((await calismaAc(id))!.calisma.title).toHaveLength(60);
  });

  it('silinen çalışma şablonu ve boyasıyla gider; son çalışma da temizlenir', async () => {
    const a = await calismaOlustur(sablon, 'orta');
    const b = await calismaOlustur(sablon, 'orta');
    await boyaKaydet(b, new Blob(['boya']));
    await calismaSil(b);
    expect(await calismaAc(b)).toBeNull();
    expect((await calismalariListele()).map((c) => c.id)).toEqual([a]);
    expect(await sonCalismaId()).toBeNull();
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

describe('oyun özeti', () => {
  it('ilerleme ve tamamlanma kaydedilir; geri alınınca tamamlanma kalkar', async () => {
    const id = await calismaOlustur(sablon, 'orta');
    await boyaKaydet(id, new Blob(['b']), undefined, { progress: 0.5, tamam: false });
    let c = (await calismaAc(id))!.calisma;
    expect(c.progress).toBe(0.5);
    expect(c.completedAt).toBeUndefined();
    await boyaKaydet(id, new Blob(['b']), undefined, { progress: 1, tamam: true });
    c = (await calismaAc(id))!.calisma;
    const ilk = c.completedAt;
    expect(ilk).toBeTypeOf('number');
    await boyaKaydet(id, new Blob(['b']), undefined, { progress: 1, tamam: true });
    expect((await calismaAc(id))!.calisma.completedAt).toBe(ilk);
    await boyaKaydet(id, new Blob(['b']), undefined, { progress: 0.75, tamam: false });
    expect((await calismaAc(id))!.calisma.completedAt).toBeUndefined();
  });
});

describe('hamle kaydı', () => {
  it('yeni çalışmada kayıt tam ve boş başlar; kaydedilip geri okunur', async () => {
    const id = await calismaOlustur(sablon, 'orta');
    expect((await calismaAc(id))!.hamleler).toEqual({ tam: true, liste: [] });
    const kayit = { tam: true, liste: [{ k: 'f' as const, r: 0, c: 0 }, { k: 's' as const, r: 1, c: 1, w: 4, p: [1, 0, 1, 0] }] };
    await boyaKaydet(id, new Blob(['b']), undefined, undefined, kayit);
    expect((await calismaAc(id))!.hamleler).toEqual(kayit);
  });

  it('hamle kaydı olmayan boyalı (eski) çalışma eksik sayılır', async () => {
    const id = await calismaOlustur(sablon, 'orta');
    await boyaKaydet(id, new Blob(['eski boya']));
    expect((await calismaAc(id))!.hamleler).toEqual({ tam: false, liste: [] });
  });

  it('çalışma silinince hamle kaydı da silinir', async () => {
    const id = await calismaOlustur(sablon, 'orta');
    await boyaKaydet(id, new Blob(['b']), undefined, undefined, { tam: true, liste: [{ k: 'f', r: 0, c: 0 }] });
    await calismaSil(id);
    const yeni = await calismaOlustur(sablon, 'orta');
    expect((await calismaAc(yeni))!.hamleler.liste).toEqual([]);
  });
});

describe('sürüm 2 → 3 göçü', () => {
  it('sürüm 2 veritabanındaki çalışmalar korunur, hamle deposu eklenir', async () => {
    // sürüm 2'yi elle kur
    await new Promise<void>((resolve, reject) => {
      const istek = indexedDB.open(DB_ADI, 2);
      istek.onupgradeneeded = () => {
        const db = istek.result;
        db.createObjectStore('works', { keyPath: 'id' });
        db.createObjectStore('templates');
        db.createObjectStore('progress');
        db.createObjectStore('settings');
      };
      istek.onsuccess = () => {
        const db = istek.result;
        const tx = db.transaction(['works', 'templates', 'progress'], 'readwrite');
        tx.objectStore('works').put({ id: 'eski', title: 'Eski resim', createdAt: 1, updatedAt: 1, detail: 'orta', progress: 0.5 });
        tx.objectStore('templates').put(sablon, 'eski');
        tx.objectStore('progress').put({ paint: new ArrayBuffer(4) }, 'eski');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    const acik = await calismaAc('eski');
    expect(acik?.calisma.title).toBe('Eski resim');
    expect(acik?.calisma.progress).toBe(0.5);
    expect(acik?.paint).toBeTruthy();
    expect(acik?.hamleler).toEqual({ tam: false, liste: [] });
    // yeni depoya yazılabiliyor
    await boyaKaydet('eski', new Blob(['b']), undefined, undefined, { tam: false, liste: [{ k: 'f', r: 0, c: 0 }] });
    expect((await calismaAc('eski'))!.hamleler.liste).toHaveLength(1);
  });
});
