// Çalışmalar (galerideki her boyama) için kaydetme / açma işlemleri.

import type { Detail, Template } from '../islem/sablon';
import { bosKayit, type HamleKaydi } from '../tekrar/hamleler';
import { islem } from './db';

export interface Calisma {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** v1'den taşınan çalışmalarda bilinmiyor */
  detail: Detail | null;
  /** 0..1: biten bölge / toplam bölge */
  progress: number;
  /** resim tamamlandıysa zamanı */
  completedAt?: number;
  /** galeri kartındaki küçük resim (JPEG baytları); henüz yoksa boş */
  thumbnail?: ArrayBuffer;
}

/** Kapak baytlarını galeride gösterilebilecek bir Blob'a çevirir. */
export function kapakBlob(c: Calisma): Blob | null {
  return c.thumbnail ? new Blob([c.thumbnail], { type: 'image/jpeg' }) : null;
}

/**
 * Boya katmanı veritabanında PNG baytları (ArrayBuffer) olarak durur.
 * Safari bazı durumlarda IndexedDB'ye Blob yazamıyor; ham bayt her yerde çalışır.
 * v1.0'dan taşınan kayıtlarda ise Blob olabilir; ikisi de okunur.
 */
interface KayitliBoya {
  paint: ArrayBuffer | Blob | null;
}

function blobaCevir(p: ArrayBuffer | Blob | null | undefined): Blob | null {
  if (!p) return null;
  return p instanceof Blob ? p : new Blob([p], { type: 'image/png' });
}

export interface AcikCalisma {
  calisma: Calisma;
  template: Template;
  paint: Blob | null;
  hamleler: HamleKaydi;
}

function baslik(tarih: number): string {
  return 'Resim · ' + new Date(tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

/** Yeni bir çalışma oluşturur ve id'sini döndürür. */
export async function calismaOlustur(template: Template, detail: Detail, kapak?: Blob): Promise<string> {
  const id = crypto.randomUUID();
  const simdi = Date.now();
  const calisma: Calisma = { id, title: baslik(simdi), createdAt: simdi, updatedAt: simdi, detail, progress: 0 };
  if (kapak) calisma.thumbnail = await kapak.arrayBuffer();
  await islem(['works', 'templates', 'progress', 'settings'], 'readwrite', (tx) => {
    tx.objectStore('works').put(calisma);
    tx.objectStore('templates').put(template, id);
    tx.objectStore('progress').put({ paint: null }, id);
    tx.objectStore('settings').put(id, 'sonCalisma');
  });
  return id;
}

export async function calismaAc(id: string): Promise<AcikCalisma | null> {
  let calisma: Calisma | undefined;
  let template: Template | undefined;
  let progress: KayitliBoya | undefined;
  let hamleler: HamleKaydi | undefined;
  await islem(['works', 'templates', 'progress', 'settings', 'moves'], 'readwrite', (tx) => {
    const m = tx.objectStore('moves').get(id);
    m.onsuccess = () => (hamleler = m.result);
    const w = tx.objectStore('works').get(id);
    const t = tx.objectStore('templates').get(id);
    const p = tx.objectStore('progress').get(id);
    w.onsuccess = () => {
      calisma = w.result;
      if (calisma) tx.objectStore('settings').put(id, 'sonCalisma');
    };
    t.onsuccess = () => (template = t.result);
    p.onsuccess = () => (progress = p.result);
  });
  if (!calisma || !template) return null;
  const paint = blobaCevir(progress?.paint);
  // hamle kaydı yoksa: boya da yoksa yeni başlıyor (tam), boya varsa eski çalışma (eksik)
  return { calisma, template, paint, hamleler: hamleler ?? bosKayit(!paint) };
}

export interface OyunOzeti {
  /** 0..1 */
  progress: number;
  tamam: boolean;
}

export async function boyaKaydet(
  id: string,
  paint: Blob,
  kapak?: Blob,
  oyun?: OyunOzeti,
  hamleler?: HamleKaydi,
): Promise<void> {
  const bayt = await paint.arrayBuffer();
  const kapakBayt = kapak ? await kapak.arrayBuffer() : undefined;
  await islem(['works', 'progress', 'moves'], 'readwrite', (tx) => {
    tx.objectStore('progress').put({ paint: bayt } satisfies KayitliBoya, id);
    if (hamleler) tx.objectStore('moves').put(hamleler, id);
    calismayiGuncelle(tx, id, (c) => {
      const yeni: Calisma = { ...c, updatedAt: Date.now() };
      if (kapakBayt) yeni.thumbnail = kapakBayt;
      if (oyun) {
        yeni.progress = oyun.progress;
        if (oyun.tamam) yeni.completedAt = c.completedAt ?? Date.now();
        else delete yeni.completedAt;
      }
      return yeni;
    });
  });
}

/** Sadece kapağı günceller (tarih değişmez; galerideki sıra bozulmasın). */
export async function kapakKaydet(id: string, kapak: Blob): Promise<void> {
  const bayt = await kapak.arrayBuffer();
  await islem('works', 'readwrite', (tx) => calismayiGuncelle(tx, id, (c) => ({ ...c, thumbnail: bayt })));
}

export async function yenidenAdlandir(id: string, title: string): Promise<void> {
  const temiz = title.trim().slice(0, 60);
  if (!temiz) return;
  await islem('works', 'readwrite', (tx) => calismayiGuncelle(tx, id, (c) => ({ ...c, title: temiz })));
}

/** Çalışmayı şablonu ve boyasıyla birlikte siler. */
export async function calismaSil(id: string): Promise<void> {
  await islem(['works', 'templates', 'progress', 'settings', 'moves'], 'readwrite', (tx) => {
    tx.objectStore('moves').delete(id);
    tx.objectStore('works').delete(id);
    tx.objectStore('templates').delete(id);
    tx.objectStore('progress').delete(id);
    const son = tx.objectStore('settings').get('sonCalisma');
    son.onsuccess = () => {
      if (son.result === id) tx.objectStore('settings').delete('sonCalisma');
    };
  });
}

function calismayiGuncelle(tx: IDBTransaction, id: string, fn: (c: Calisma) => Calisma): void {
  const depo = tx.objectStore('works');
  const istek = depo.get(id);
  istek.onsuccess = () => {
    if (istek.result) depo.put(fn(istek.result));
  };
}

/** Son güncellenenden eskiye bütün çalışmalar. */
export async function calismalariListele(): Promise<Calisma[]> {
  const hepsi = (await islem<Calisma[]>('works', 'readonly', (tx) => tx.objectStore('works').getAll())) ?? [];
  return hepsi.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** "Kaldığın yerden devam et" için en son açılan çalışma. */
export async function sonCalismaId(): Promise<string | null> {
  try {
    const id = await islem<string>('settings', 'readonly', (tx) => tx.objectStore('settings').get('sonCalisma'));
    return id ?? null;
  } catch {
    return null;
  }
}
