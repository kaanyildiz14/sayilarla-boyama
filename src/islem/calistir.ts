// Seçilen fotoğrafı çalışma çözünürlüğüne getirir ve şablon üretimini
// Web Worker'da çalıştırır.

import type { Detail, Template } from './sablon';
import type { WorkerRequest, WorkerResponse } from './isci';

/** Çalışma çözünürlüğü: uzun kenar bu kadar piksel (küçük fotoğraflar büyütülür). */
export const MAX_SIDE = 1800;

export async function sablonUret(dosya: Blob, detail: Detail, ilerleme: (mesaj: string) => void): Promise<Template> {
  ilerleme('Fotoğraf okunuyor');
  const bitmap = await createImageBitmap(dosya);
  // bölge ayarları bu çözünürlüğe göre seçildiği için her fotoğraf aynı boyuta getirilir
  const s = MAX_SIDE / Math.max(bitmap.width, bitmap.height);
  const w = Math.round(bitmap.width * s), h = Math.round(bitmap.height * s);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const rgba = ctx.getImageData(0, 0, w, h).data;
  return isciyleUret({ rgba, width: w, height: h, detail }, ilerleme);
}

function isciyleUret(req: WorkerRequest, ilerleme: (mesaj: string) => void): Promise<Template> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./isci.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') ilerleme(msg.message);
      else {
        worker.terminate();
        if (msg.type === 'done') resolve(msg.template);
        else reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage(req, [req.rgba.buffer]);
  });
}
