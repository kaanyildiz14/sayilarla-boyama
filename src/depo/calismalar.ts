// Çalışmalar (galerideki her boyama) için kaydetme / açma işlemleri.

import type { Detail, Template } from '../islem/sablon';
import { islem } from './db';

export interface Calisma {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** v1'den taşınan çalışmalarda bilinmiyor */
  detail: Detail | null;
  /** 0..1 (oyun aşamasında hesaplanacak) */
  progress: number;
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
}

function baslik(tarih: number): string {
  return new Date(tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Yeni bir çalışma oluşturur ve id'sini döndürür. */
export async function calismaOlustur(template: Template, detail: Detail): Promise<string> {
  const id = crypto.randomUUID();
  const simdi = Date.now();
  const calisma: Calisma = { id, title: baslik(simdi), createdAt: simdi, updatedAt: simdi, detail, progress: 0 };
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
  await islem(['works', 'templates', 'progress', 'settings'], 'readwrite', (tx) => {
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
  return { calisma, template, paint: blobaCevir(progress?.paint) };
}

export async function boyaKaydet(id: string, paint: Blob): Promise<void> {
  const bayt = await paint.arrayBuffer();
  await islem(['works', 'progress'], 'readwrite', (tx) => {
    tx.objectStore('progress').put({ paint: bayt } satisfies KayitliBoya, id);
    const w = tx.objectStore('works').get(id);
    w.onsuccess = () => {
      if (w.result) tx.objectStore('works').put({ ...w.result, updatedAt: Date.now() });
    };
  });
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
