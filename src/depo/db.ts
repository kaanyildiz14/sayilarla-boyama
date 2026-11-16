// IndexedDB bağlantısı ve sürüm göçleri.
//
// Sürüm 1 (v1.0): tek bir "kayit" deposu vardı; içinde 'template' ve 'paint'.
// Sürüm 2 (oyun): birden fazla çalışma için ayrı depolar:
//   works      çalışma kartı (başlık, tarih, ilerleme)        anahtar: id
//   templates  şablon                                          anahtar: çalışma id
//   progress   boya katmanı ve oyun durumu                     anahtar: çalışma id
//   settings   küçük ayarlar (son açılan çalışma vb.)         anahtar: ad
//
// Eski kayıt silinmeden önce yeni depolara taşınır; kimsenin boyaması kaybolmaz.

export const DB_ADI = 'sayilarla-boyama';
export const DB_SURUM = 2;

export const DEPOLAR = ['works', 'templates', 'progress', 'settings'] as const;
export type DepoAdi = (typeof DEPOLAR)[number];

function yeniId(): string {
  return crypto.randomUUID();
}

/** Sürüm 1'deki tek kaydı ilk çalışmaya dönüştürür. */
function surum1denGoc(tx: IDBTransaction, db: IDBDatabase): void {
  const eski = tx.objectStore('kayit');
  const sablonIstek = eski.get('template');
  const boyaIstek = eski.get('paint');
  boyaIstek.onsuccess = () => {
    const template = sablonIstek.result;
    if (template) {
      const id = yeniId();
      const simdi = Date.now();
      tx.objectStore('works').put({
        id,
        title: 'İlk boyamam',
        createdAt: simdi,
        updatedAt: simdi,
        detail: null, // v1 detay seviyesini saklamıyordu
        progress: 0,
      });
      tx.objectStore('templates').put(template, id);
      tx.objectStore('progress').put({ paint: boyaIstek.result ?? null }, id);
      tx.objectStore('settings').put(id, 'sonCalisma');
    }
    db.deleteObjectStore('kayit');
  };
}

let acik: Promise<IDBDatabase> | null = null;

export function dbAc(): Promise<IDBDatabase> {
  if (acik) return acik;
  acik = new Promise((resolve, reject) => {
    const istek = indexedDB.open(DB_ADI, DB_SURUM);
    istek.onupgradeneeded = (e) => {
      const db = istek.result;
      const tx = istek.transaction!;
      db.createObjectStore('works', { keyPath: 'id' });
      db.createObjectStore('templates');
      db.createObjectStore('progress');
      db.createObjectStore('settings');
      if (e.oldVersion === 1 && db.objectStoreNames.contains('kayit')) surum1denGoc(tx, db);
    };
    istek.onsuccess = () => {
      const db = istek.result;
      // başka sekme daha yeni sürüm açarsa bağlantıyı bırak
      db.onversionchange = () => {
        db.close();
        acik = null;
      };
      resolve(db);
    };
    istek.onerror = () => {
      acik = null;
      reject(istek.error);
    };
  });
  return acik;
}

/** Testler için: açık bağlantıyı kapatır. */
export async function dbKapat(): Promise<void> {
  if (!acik) return;
  const db = await acik.catch(() => null);
  db?.close();
  acik = null;
}

/** Bir veya birden fazla depoda tek işlem çalıştırır; işlem bitince sonucu döndürür. */
export async function islem<T>(
  depolar: DepoAdi | DepoAdi[],
  mod: IDBTransactionMode,
  fn: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await dbAc();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(depolar, mod);
    const istek = fn(tx);
    tx.oncomplete = () => resolve(istek ? istek.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
