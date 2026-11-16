// Boyama ekranı: tuval, araç çubuğu, kartela, ilerleme ve otomatik kayıt.

import { drawLines, drawNumbers, finalImage, kapakResmi, makeCanvas, templateImage, toBlob } from '../boyama/katmanlar';
import { Painter, type Arac } from '../boyama/painter';
import { boyaKaydet, kapakKaydet, type AcikCalisma } from '../depo/calismalar';
import type { Template } from '../islem/sablon';
import { Ilerleme, type Degisim } from '../oyun/ilerleme';
import { bolgeKapsamasi, tumKapsamalar } from '../oyun/kapsama';
import { enYakinBolge, gorunenBolgeler, kalanBolgeler } from '../oyun/yardimcilar';
import { saveImage } from '../platform';
import { bosKayit, type HamleKaydi } from '../tekrar/hamleler';
import { tekrarOynat, type Tekrar } from '../tekrar/oynat';
import { $, ekraniGoster } from './ekran';

const KAYIT_GECIKMESI = 1200;

let painter: Painter | null = null;
let aktifId: string | null = null;
let aktifTemplate: Template | null = null;
let aktifCizgiler: HTMLCanvasElement | null = null;
let ilerleme: Ilerleme | null = null;
let hamleler: HamleKaydi = bosKayit();
let tekrar: Tekrar | null = null;
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
  hamleler = acik.hamleler;
  tamamlandiKapat();
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
  painter = new Painter(canvas, t, paint, lines);
  painter.bitti = ilerleme.bitti;
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
  painter.onHamle = (h) => hamleler.liste.push(h);
  painter.onGeriAl = () => void hamleler.liste.pop();
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
    await boyaKaydet(aktifId, await toBlob(painter.paint), await kapakOlustur(), oyun, hamleler);
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
  if (d.degisenBolgeler.length) {
    for (const r of d.degisenBolgeler) painter.vurguBolge(r);
    olaylariIsle(d);
  }
}

function olaylariIsle(d: Degisim): void {
  ilerlemeyiGoster();
  if (d.resimBitti) {
    bildirimiGizle();
    tamamlandiGoster(true);
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
  $('replay-open').hidden = !ilerleme.tamamMi;
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

// ---- tamamlandı ekranı ve tekrar ----

function tamamlandiGoster(kutlama: boolean): void {
  if (!painter || !aktifTemplate || !aktifCizgiler || !ilerleme) return;
  $('done').hidden = false;
  delete $('done').dataset.durum;
  $('done-text').textContent = `${ilerleme.toplam} bölge, ${aktifTemplate.palette.length} renk. Nasıl boyadığını izle:`;
  if (kutlama) konfeti();
  navigator.vibrate?.([60, 40, 60]);
  tekrariBaslat();
  $('replay-again').focus();
}

function tekrariBaslat(): void {
  if (!painter || !aktifTemplate || !aktifCizgiler) return;
  tekrar?.durdur();
  delete $('done').dataset.durum;
  const p = painter;
  const buTekrar = tekrarOynat($<HTMLCanvasElement>('replay'), {
    t: aktifTemplate,
    paint: p.paint,
    lines: aktifCizgiler,
    mask: (r) => p.mask(r),
    hamleler,
  });
  tekrar = buTekrar;
  void buTekrar.bitti.then(() => {
    if (tekrar === buTekrar) $('done').dataset.durum = 'bitti';
  });
}

function tamamlandiKapat(): void {
  tekrar?.durdur();
  tekrar = null;
  $('done').hidden = true;
  $('done').querySelector('.confetti')!.replaceChildren();
}

function konfeti(): void {
  const kap = $('done').querySelector('.confetti')!;
  // resmin kendi renklerinden küçük kâğıt parçaları
  const renkler = aktifTemplate?.palette.map((p) => p.hex) ?? ['#c8553d'];
  kap.replaceChildren(
    ...Array.from({ length: 28 }, (_, i) => {
      const s = document.createElement('span');
      s.style.background = renkler[(i * 5) % renkler.length];
      s.style.left = `${(i * 37) % 100}%`;
      s.style.animationDuration = `${2.2 + ((i * 13) % 10) / 5}s`;
      s.style.animationDelay = `${((i * 7) % 10) / 10}s`;
      return s;
    }),
  );
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
  painter.vurguAyarla(i);
}

// ---- yardımcılar ----

function bul(): void {
  if (!painter || !ilerleme || !aktifTemplate) return;
  const adaylar = kalanBolgeler(aktifTemplate.regions, ilerleme.bitti, seciliRenk);
  if (!adaylar.length) {
    bildir(`${seciliRenk + 1} numarada kalan bölge yok`);
    return;
  }
  const g = painter.gorus();
  const r = enYakinBolge(aktifTemplate.regions, adaylar, (g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2)!;
  painter.odakla(r);
  bildir(`${seciliRenk + 1} numara: ${adaylar.length} bölge kaldı`);
}

function degnek(): void {
  if (!painter || !ilerleme || !aktifTemplate) return;
  const adaylar = kalanBolgeler(aktifTemplate.regions, ilerleme.bitti, seciliRenk);
  const gorunen = gorunenBolgeler(aktifTemplate.regions, adaylar, painter.gorus());
  if (!gorunen.length) {
    bildir(adaylar.length ? `Ekranda boş ${seciliRenk + 1} yok. Bul düğmesiyle ara` : `${seciliRenk + 1} numarada kalan bölge yok`);
    return;
  }
  const renk = seciliRenk;
  painter.toplucaDoldur(gorunen);
  // renk o an bittiyse "tamam" bildirimi zaten çıktı; üstüne yazma
  if (!ilerleme.renkTamamMi(renk)) bildir(`${gorunen.length} bölge boyandı`);
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
  $('replay-open').addEventListener('click', () => tamamlandiGoster(false));
  $('replay-again').addEventListener('click', tekrariBaslat);
  $('done-close').addEventListener('click', tamamlandiKapat);
  $('done-save').addEventListener('click', () => $('dl-final').click());
  $('done-gallery').addEventListener('click', () => {
    tamamlandiKapat();
    geri();
  });
  $('finder').addEventListener('click', bul);
  $('wand').addEventListener('click', degnek);
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
    if (e.key === 'Escape' && !$('done').hidden) tamamlandiKapat();
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && painter && !$('paint').hidden && $('done').hidden) {
      e.preventDefault();
      geriAl.click();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void bekleyenKaydiYaz();
  });
}
