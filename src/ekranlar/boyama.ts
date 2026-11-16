// Boyama ekranı: tuval, araç çubuğu, kartela ve otomatik kayıt.

import { drawLines, drawNumbers, finalImage, kapakResmi, makeCanvas, templateImage, toBlob } from '../boyama/katmanlar';
import { Painter } from '../boyama/painter';
import { boyaKaydet, kapakKaydet, type AcikCalisma } from '../depo/calismalar';
import type { Template } from '../islem/sablon';
import { saveImage } from '../platform';
import { $, ekraniGoster } from './ekran';

const KAYIT_GECIKMESI = 1200;

let painter: Painter | null = null;
let aktifId: string | null = null;
let aktifTemplate: Template | null = null;
let aktifCizgiler: HTMLCanvasElement | null = null;
let kayitZamanlayici = 0;
/** açılışta üretilen kapak; galeriye dönmeden önce bitmesi beklenir */
let bekleyenKapak: Promise<void> | null = null;

export function aktifCalismaId(): string | null {
  return aktifId;
}

export async function boyamayiAc(acik: AcikCalisma): Promise<void> {
  await bekleyenKaydiYaz();
  const { calisma, template: t, paint: paintBlob } = acik;
  const paint = makeCanvas(t.width, t.height);
  if (paintBlob) {
    const img = await createImageBitmap(paintBlob);
    paint.getContext('2d')!.drawImage(img, 0, 0);
    img.close();
  }
  const lines = drawLines(t);
  const numbers = drawNumbers(t);
  ekraniGoster('paint');

  // eski tuvalin olay dinleyicileri kalmasın diye tuvali yenisiyle değiştir
  const eski = $<HTMLCanvasElement>('canvas');
  const canvas = eski.cloneNode() as HTMLCanvasElement;
  eski.replaceWith(canvas);

  aktifId = calisma.id;
  aktifTemplate = t;
  aktifCizgiler = lines;
  painter = new Painter(canvas, t, paint, lines, numbers);
  // v1.0'dan taşınan çalışmaların henüz kapağı yok
  if (!calisma.thumbnail) {
    bekleyenKapak = kapakOlustur()
      .then((k) => kapakKaydet(calisma.id, k))
      .catch(() => {})
      .finally(() => (bekleyenKapak = null));
  }
  if (import.meta.env.DEV) Object.assign(window, { __painter: painter, __template: t });
  painter.brush = Number($<HTMLInputElement>('brush').value);
  painter.showNumbers = $<HTMLInputElement>('nums').checked;
  $('saved').textContent = paintBlob ? 'Kayıttan açıldı' : '';
  $<HTMLButtonElement>('undo').disabled = true;

  painter.onChange = () => {
    $<HTMLButtonElement>('undo').disabled = !painter?.canUndo;
    $('saved').textContent = 'Kaydediliyor…';
    clearTimeout(kayitZamanlayici);
    kayitZamanlayici = window.setTimeout(simdiKaydet, KAYIT_GECIKMESI);
  };

  kartelaKur(t);
  $('dl-template').onclick = async () => saveImage(await toBlob(templateImage(t, lines, numbers)), 'boyama-sablonu.png');
  $('dl-final').onclick = async () => saveImage(await toBlob(finalImage(t, paint, lines, true)), 'boyamam.png');
}

function kapakOlustur(): Promise<Blob> {
  return toBlob(kapakResmi(aktifTemplate!, painter!.paint, aktifCizgiler!), 'image/jpeg', 0.8);
}

async function simdiKaydet(): Promise<void> {
  kayitZamanlayici = 0;
  if (!painter || !aktifId) return;
  try {
    await boyaKaydet(aktifId, await toBlob(painter.paint), await kapakOlustur());
    $('saved').textContent = 'Kaydedildi ✓';
  } catch {
    $('saved').textContent = 'Kaydedilemedi';
  }
}

/** Bekleyen otomatik kayıt varsa hemen yazar (ekrandan çıkarken, sekme gizlenirken). */
export async function bekleyenKaydiYaz(): Promise<void> {
  if (bekleyenKapak) await bekleyenKapak;
  if (!kayitZamanlayici) return;
  clearTimeout(kayitZamanlayici);
  await simdiKaydet();
}

function kartelaKur(t: Template): void {
  const bar = $('palette');
  bar.innerHTML = '';
  t.palette.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = p.hex;
    // açık renklerde koyu, koyu renklerde açık yazı
    const acik = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b > 150;
    b.style.color = acik ? '#222' : '#fff';
    b.textContent = String(i + 1);
    b.title = `${i + 1} · ${p.hex}`;
    b.onclick = () => {
      bar.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
      b.classList.add('selected');
      if (painter) painter.color = p.hex;
    };
    bar.appendChild(b);
    if (i === 0) b.click();
  });
}

/** Araç çubuğu düğmeleri bir kez bağlanır; o an açık olan çalışmaya etki eder. */
export function boyamaAraclariniKur(geri: () => void): void {
  const geriAl = $<HTMLButtonElement>('undo');
  geriAl.addEventListener('click', () => {
    painter?.undo();
    geriAl.disabled = !painter?.canUndo;
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
  $('back').addEventListener('click', geri);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && painter && !$('paint').hidden) {
      e.preventDefault();
      geriAl.click();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void bekleyenKaydiYaz();
  });
}
