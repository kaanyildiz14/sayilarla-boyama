// Şablondan görüntü katmanları üretir: sınır çizgileri, numaralar,
// indirilebilir şablon (kartelalı) ve bitmiş resim.

import type { Template } from '../islem/sablon';

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Komşu pikselin bölgesi farklıysa orası sınırdır. */
export function drawLines(t: Template, color: [number, number, number] = [70, 70, 70]): HTMLCanvasElement {
  const { width: w, height: h, regionMap: m } = t;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let p = 0; p < w * h; p++) {
    const x = p % w;
    const edge = (x < w - 1 && m[p + 1] !== m[p]) || (p + w < w * h && m[p + w] !== m[p]);
    if (edge) {
      d[p * 4] = color[0];
      d[p * 4 + 1] = color[1];
      d[p * 4 + 2] = color[2];
      d[p * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Her bölgenin en iç noktasına renk numarasını yazar. */
export function drawNumbers(t: Template): HTMLCanvasElement {
  const c = makeCanvas(t.width, t.height);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6a6a6a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const reg of t.regions) {
    const label = String(reg.color + 1);
    const size = Math.max(8, Math.min(28, reg.labelR * (label.length > 1 ? 1.05 : 1.3)));
    ctx.font = `${size.toFixed(1)}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(label, reg.labelX + 0.5, reg.labelY + 0.5);
  }
  return c;
}

/** Yazdırılabilir / paylaşılabilir şablon: çizgiler + numaralar + altta kartela. */
export function templateImage(t: Template, lines: HTMLCanvasElement, numbers: HTMLCanvasElement): HTMLCanvasElement {
  const cols = 5;
  const rowH = Math.round(t.width / 22);
  const rows = Math.ceil(t.palette.length / cols);
  const c = makeCanvas(t.width, t.height + rows * rowH + rowH / 2);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(lines, 0, 0);
  ctx.drawImage(numbers, 0, 0);
  const cell = t.width / cols;
  const sw = rowH * 0.9, sh = rowH * 0.65;
  ctx.font = `${Math.round(rowH * 0.38)}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  t.palette.forEach((p, i) => {
    const x = (i % cols) * cell + rowH * 0.3;
    const y = t.height + rowH * 0.25 + Math.floor(i / cols) * rowH;
    ctx.fillStyle = p.hex;
    ctx.fillRect(x, y, sw, sh);
    ctx.strokeStyle = '#888';
    ctx.strokeRect(x, y, sw, sh);
    ctx.fillStyle = '#333';
    ctx.fillText(`${i + 1}  ${p.hex}`, x + sw + rowH * 0.2, y + sh / 2);
  });
  return c;
}

/** Bitmiş resim: boya + ince çizgiler (numarasız). */
export function finalImage(t: Template, paint: HTMLCanvasElement, lines: HTMLCanvasElement, withLines: boolean): HTMLCanvasElement {
  const c = makeCanvas(t.width, t.height);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(paint, 0, 0);
  if (withLines) {
    ctx.globalAlpha = 0.5;
    ctx.drawImage(lines, 0, 0);
  }
  return c;
}

/** Galeri kartı için küçük resim: boya + soluk çizgiler. */
export function kapakResmi(t: Template, paint: HTMLCanvasElement, lines: HTMLCanvasElement, genislik = 360): HTMLCanvasElement {
  const c = makeCanvas(genislik, Math.round((genislik * t.height) / t.width));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(paint, 0, 0, c.width, c.height);
  ctx.globalAlpha = 0.6;
  ctx.drawImage(lines, 0, 0, c.width, c.height);
  return c;
}

export function toBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Resim oluşturulamadı'))), type, quality),
  );
}
