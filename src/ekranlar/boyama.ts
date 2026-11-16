// Boyama ekranı: tuval, araç çubuğu, kartela, ilerleme ve otomatik kayıt.

import { drawLines, drawNumbers, finalImage, kapakResmi, makeCanvas, templateImage, toBlob } from '../boyama/katmanlar';
import { Painter, type Arac } from '../boyama/painter';
import { boyaKaydet, kapakKaydet, type AcikCalisma } from '../depo/calismalar';
import type { Template } from '../islem/sablon';
import { Ilerleme, type Degisim } from '../oyun/ilerleme';
import { bolgeKapsamasi, tumKapsamalar } from '../oyun/kapsama';
import { saveImage } from '../platform';
import { $, ekraniGoster } from './ekran';

const KAYIT_GECIKMESI = 1200;

let painter: Painter | null = null;
let aktifId: string | null = null;
let aktifTemplate: Template | null = null;
let aktifCizgiler: HTMLCanvasElement | null = null;
let ilerleme: Ilerleme | null = null;
let seciliRenk = 0;
let kayitZamanlayici = 0;
let bildirimZamanlayici = 0;
const ARAC_ANAHTARI = 'sayilarla-boyama:arac';
/** açılışta üretilen kapak; galeriye dönmeden önce bitmesi beklenir */
let bekleyenKapak: Promise<void> | null = null;

export function aktifCalismaId(): string | null {
  return aktifId;
}

export async function boyamayiAc(acik: AcikCalisma): Promise<void> {
  await bekleyenKaydiYaz();
  const { calisma, template: t, paint: paintBlob } = acik;
  const paint = makeCanvas(t.width, t.height);
  // ilk getContext ayarları belirler; boya sık okunacağı için willReadFrequently
  const paintCtx = paint.getContext('2d', { willReadFrequently: true })!;
  if (paintBlob) {
    const img = await createImageBitmap(paintBlob);
    paintCtx.drawImage(img, 0, 0);
    img.close();
  }
  // ilerleme boyanın kendisinden hesaplanır (ayrı bir "bitti" listesi tutulmaz)
  const bolgeRengi = t.regions.map((r) => r.color);
  const kapsamalar = paintBlob
    ? tumKapsamalar(t.regionMap, paintCtx.getImageData(0, 0, t.width, t.height).data, bolgeRengi, t.palette)
    : undefined;
  ilerleme = new Ilerleme(bolgeRengi, t.palette.length, kapsamalar);
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
  painter.arac = kayitliArac();
  aracDugmeleriniGuncelle();
  painter.onBolge = (region) => bolgeDegisti(t, region);
  painter.onYanlisRenk = (region) => yanlisRenk(t, region);
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
  ilerlemeyiGoster();
  renkSec(ilerleme.kalanBolge(0) > 0 ? 0 : (ilerleme.sonrakiRenk(0) ?? 0));
  bildirimiGizle();
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
    const oyun = ilerleme ? { progress: ilerleme.oran, tamam: ilerleme.tamamMi } : undefined;
    await boyaKaydet(aktifId, await toBlob(painter.paint), await kapakOlustur(), oyun);
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

// ---- ilerleme ----

function bolgeDegisti(t: Template, region: number): void {
  if (!painter || !ilerleme) return;
  const reg = t.regions[region];
  const k = bolgeKapsamasi(t.regionMap, t.width, region, reg, painter.bolgePikselleri(region).data, t.palette[reg.color]);
  const d = ilerleme.guncelle(new Map([[region, k]]));
  if (d.degisenBolgeler.length) olaylariIsle(d);
}

function olaylariIsle(d: Degisim): void {
  ilerlemeyiGoster();
  if (d.resimBitti) {
    bildir('🎉 Tebrikler! Resim tamamlandı.', 4000);
    return;
  }
  if (d.bitenRenkler.length) {
    const renk = d.bitenRenkler[0];
    const sonraki = ilerleme!.sonrakiRenk(renk);
    bildir(`${renk + 1} numara tamam ✓`);
    // bitmiş rengi boyuyorsak sıradakine geç
    if (renk === seciliRenk && sonraki !== null) renkSec(sonraki);
  }
}

function yanlisRenk(t: Template, region: number): void {
  const stage = $('stage');
  stage.classList.remove('yanlis');
  void stage.offsetWidth; // animasyonu yeniden başlat
  stage.classList.add('yanlis');
  navigator.vibrate?.(40);
  bildir(`Bu bölge ${t.regions[region].color + 1} numara`);
}

function ilerlemeyiGoster(): void {
  if (!ilerleme) return;
  const yuzde = Math.floor(ilerleme.oran * 100);
  $('progress-fill').style.width = `${ilerleme.oran * 100}%`;
  $('progress-text').textContent = ilerleme.tamamMi ? '✓' : `%${yuzde}`;
  $('palette').querySelectorAll<HTMLButtonElement>('.swatch').forEach((b, i) => {
    const toplam = ilerleme!.toplamBolge(i), kalan = ilerleme!.kalanBolge(i);
    const tamam = ilerleme!.renkTamamMi(i);
    b.style.setProperty('--p', String(toplam ? (toplam - kalan) / toplam : 0));
    b.classList.toggle('tamam', tamam);
    b.querySelector('.renk')!.textContent = tamam ? '✓' : String(i + 1);
    b.querySelector('.kalan')!.textContent = String(kalan);
    b.setAttribute('aria-label', `Renk ${i + 1}${tamam ? ', tamamlandı' : `, ${kalan} bölge kaldı`}`);
  });
}

function bildir(mesaj: string, sure = 1800): void {
  const t = $('toast');
  t.textContent = mesaj;
  t.hidden = false;
  clearTimeout(bildirimZamanlayici);
  bildirimZamanlayici = window.setTimeout(bildirimiGizle, sure);
}

function bildirimiGizle(): void {
  $('toast').hidden = true;
}

// ---- kartela ve araçlar ----

function kartelaKur(t: Template): void {
  const bar = $('palette');
  bar.replaceChildren();
  t.palette.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.title = `${i + 1} · ${p.hex}`;
    const renk = document.createElement('span');
    renk.className = 'renk';
    renk.style.background = p.hex;
    // açık renklerde koyu, koyu renklerde açık yazı
    renk.style.color = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b > 150 ? '#222' : '#fff';
    const kalan = document.createElement('span');
    kalan.className = 'kalan';
    b.append(renk, kalan);
    b.onclick = () => renkSec(i);
    bar.appendChild(b);
  });
}

function renkSec(i: number): void {
  if (!painter || !aktifTemplate) return;
  seciliRenk = i;
  painter.color = aktifTemplate.palette[i].hex;
  painter.colorIndex = i;
  const kartlar = $('palette').querySelectorAll<HTMLButtonElement>('.swatch');
  kartlar.forEach((s, j) => s.classList.toggle('selected', j === i));
  kartlar[i]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

function kayitliArac(): Arac {
  try {
    return localStorage.getItem(ARAC_ANAHTARI) === 'firca' ? 'firca' : 'dokun';
  } catch {
    return 'dokun';
  }
}

function aracSec(a: Arac): void {
  if (painter) painter.arac = a;
  try {
    localStorage.setItem(ARAC_ANAHTARI, a);
  } catch {
    // gizli sekmede saklanamayabilir; sorun değil
  }
  aracDugmeleriniGuncelle();
}

function aracDugmeleriniGuncelle(): void {
  const a = painter?.arac ?? 'dokun';
  $('tool-tap').setAttribute('aria-pressed', String(a === 'dokun'));
  $('tool-brush').setAttribute('aria-pressed', String(a === 'firca'));
}

/** Araç çubuğu düğmeleri bir kez bağlanır; o an açık olan çalışmaya etki eder. */
export function boyamaAraclariniKur(geri: () => void): void {
  const geriAl = $<HTMLButtonElement>('undo');
  geriAl.addEventListener('click', () => {
    painter?.undo();
    geriAl.disabled = !painter?.canUndo;
  });
  $('fit').addEventListener('click', () => painter?.fit());
  $('tool-tap').addEventListener('click', () => aracSec('dokun'));
  $('tool-brush').addEventListener('click', () => aracSec('firca'));
  $('stage').addEventListener('animationend', () => $('stage').classList.remove('yanlis'));
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
