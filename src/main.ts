// Ekranlar arası akış: Başlangıç → Hazırlanıyor → Boyama.

import { Painter } from './boyama';
import { drawLines, drawNumbers, finalImage, makeCanvas, saveImage, templateImage, toBlob } from './cizim';
import type { Detail, Template } from './islem/sablon';
import type { WorkerRequest, WorkerResponse } from './isci';
import { loadWork, savePaint, saveTemplate } from './kayit';

/** Çalışma çözünürlüğü: uzun kenar en fazla bu kadar piksel. */
const MAX_SIDE = 1800;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = { start: $('start'), busy: $('busy'), paint: $('paint') };
function show(name: keyof typeof screens) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
}

const fileInput = $<HTMLInputElement>('file');
const makeBtn = $<HTMLButtonElement>('make');
const resumeBtn = $<HTMLButtonElement>('resume');
const thumb = $<HTMLImageElement>('thumb');
const errorEl = $('error');
const busyText = $('busy-text');

let picked: File | null = null;
let hasSaved = false;
let painter: Painter | null = null;

function fail(message: string) {
  show('start');
  errorEl.textContent = message;
  errorEl.hidden = false;
}

// ---- başlangıç ----

fileInput.addEventListener('change', () => {
  picked = fileInput.files?.[0] ?? null;
  makeBtn.disabled = !picked;
  errorEl.hidden = true;
  if (picked) {
    thumb.src = URL.createObjectURL(picked);
    thumb.hidden = false;
    $('file-label').textContent = 'Başka fotoğraf seç';
  }
});

makeBtn.addEventListener('click', async () => {
  if (!picked) return;
  if (hasSaved && !confirm('Kayıtlı boyaman silinip yeni şablon oluşturulacak. Devam edilsin mi?')) return;
  const detail = (document.querySelector('input[name=detail]:checked') as HTMLInputElement).value as Detail;
  show('busy');
  busyText.textContent = 'Fotoğraf okunuyor';
  try {
    const bitmap = await createImageBitmap(picked);
    // küçük fotoğraflar da büyütülür: bölge ayarları bu çözünürlüğe göre
    const s = MAX_SIDE / Math.max(bitmap.width, bitmap.height);
    const w = Math.round(bitmap.width * s), h = Math.round(bitmap.height * s);
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const template = await runWorker({ rgba, width: w, height: h, detail });
    await saveTemplate(template).catch(() => {});
    hasSaved = true;
    openPainter(template, null);
  } catch (err) {
    fail('Şablon oluşturulamadı: ' + (err instanceof Error ? err.message : String(err)));
  }
});

function runWorker(req: WorkerRequest): Promise<Template> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./isci.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') busyText.textContent = msg.message + '…';
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

resumeBtn.addEventListener('click', async () => {
  show('busy');
  busyText.textContent = 'Kaydın açılıyor…';
  const work = await loadWork();
  if (!work) return fail('Kayıt bulunamadı.');
  openPainter(work.template, work.paint);
});

loadWork().then((work) => {
  hasSaved = !!work;
  resumeBtn.hidden = !work;
});

// ---- boyama ----

const savedEl = $('saved');
const undoBtn = $<HTMLButtonElement>('undo');
let saveTimer = 0;

async function openPainter(t: Template, paintBlob: Blob | null) {
  const paint = makeCanvas(t.width, t.height);
  if (paintBlob) {
    const img = await createImageBitmap(paintBlob);
    paint.getContext('2d')!.drawImage(img, 0, 0);
  }
  const lines = drawLines(t);
  const numbers = drawNumbers(t);
  show('paint');

  // eski ekranı temizlemek için tuvali yenisiyle değiştir
  const old = $<HTMLCanvasElement>('canvas');
  const canvas = old.cloneNode() as HTMLCanvasElement;
  old.replaceWith(canvas);

  painter = new Painter(canvas, t, paint, lines, numbers);
  if (import.meta.env.DEV) Object.assign(window, { __painter: painter, __template: t });
  painter.brush = Number($<HTMLInputElement>('brush').value);
  painter.showNumbers = $<HTMLInputElement>('nums').checked;
  savedEl.textContent = paintBlob ? 'Kayıttan açıldı' : '';
  undoBtn.disabled = true;

  painter.onChange = () => {
    undoBtn.disabled = !painter!.canUndo;
    savedEl.textContent = 'Kaydediliyor…';
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 1200);
  };

  buildPalette(t);

  $('dl-template').onclick = async () => {
    await saveImage(await toBlob(templateImage(t, lines, numbers)), 'boyama-sablonu.png');
  };
  $('dl-final').onclick = async () => {
    await saveImage(await toBlob(finalImage(t, paint, lines, true)), 'boyamam.png');
  };
}

async function saveNow() {
  if (!painter) return;
  try {
    await savePaint(await toBlob(painter.paint));
    savedEl.textContent = 'Kaydedildi ✓';
  } catch {
    savedEl.textContent = 'Kaydedilemedi';
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    saveNow();
  }
});

function buildPalette(t: Template) {
  const bar = $('palette');
  bar.innerHTML = '';
  t.palette.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = p.hex;
    // açık renklerde koyu, koyu renklerde açık yazı
    const light = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b > 150;
    b.style.color = light ? '#222' : '#fff';
    b.textContent = String(i + 1);
    b.title = `${i + 1} · ${p.hex}`;
    b.onclick = () => {
      bar.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
      b.classList.add('selected');
      painter!.color = p.hex;
    };
    bar.appendChild(b);
    if (i === 0) b.click();
  });
}

undoBtn.addEventListener('click', () => {
  painter?.undo();
  undoBtn.disabled = !painter?.canUndo;
});
$('fit').addEventListener('click', () => painter?.fit());
$<HTMLInputElement>('brush').addEventListener('input', (e) => {
  if (painter) painter.brush = Number((e.target as HTMLInputElement).value);
});
$<HTMLInputElement>('nums').addEventListener('change', (e) => {
  if (!painter) return;
  painter.showNumbers = (e.target as HTMLInputElement).checked;
  painter.render();
});
$('back').addEventListener('click', async () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    await saveNow();
  }
  resumeBtn.hidden = !hasSaved;
  show('start');
});
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && painter && !screens.paint.hidden) {
    e.preventDefault();
    undoBtn.click();
  }
});
