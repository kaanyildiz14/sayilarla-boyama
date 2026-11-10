// Otomatik kayıt: şablon ve boyama, tarayıcının kendi veritabanında
// (IndexedDB) saklanır. Hiçbir şey internete gönderilmez.

import type { Template } from './islem/sablon';

const DB = 'sayilarla-boyama';
const STORE = 'kayit';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export interface SavedWork {
  template: Template;
  paint: Blob | null;
}

export async function saveTemplate(template: Template): Promise<void> {
  await run('readwrite', (s) => {
    s.put(template, 'template');
    s.delete('paint');
  });
}

export async function savePaint(paint: Blob): Promise<void> {
  await run('readwrite', (s) => s.put(paint, 'paint'));
}

export async function loadWork(): Promise<SavedWork | null> {
  try {
    const template = await run<Template>('readonly', (s) => s.get('template'));
    if (!template) return null;
    const paint = (await run<Blob>('readonly', (s) => s.get('paint'))) ?? null;
    return { template, paint };
  } catch {
    return null;
  }
}
