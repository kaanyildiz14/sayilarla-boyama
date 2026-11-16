// Tekrar animasyonu: hamle kaydını boş tuvalde baştan oynatır.

import { makeCanvas } from '../boyama/katmanlar';
import type { Template } from '../islem/sablon';
import { bolgeSirasi, tekrarSuresi, uygulanacakHamle, type Hamle, type HamleKaydi } from './hamleler';

export interface TekrarKaynagi {
  t: Template;
  /** bitmiş (o anki) boya katmanı */
  paint: HTMLCanvasElement;
  lines: HTMLCanvasElement;
  mask: (region: number) => HTMLCanvasElement;
  hamleler: HamleKaydi;
}

export interface Tekrar {
  durdur: () => void;
  /** animasyon bitince (ya da durdurulunca) çözülür */
  bitti: Promise<void>;
}

/** Tek bir adımı tam çözünürlüklü tekrar tuvaline uygular. */
type Adim = (ctx: CanvasRenderingContext2D) => void;

function maskeliCiz(ctx: CanvasRenderingContext2D, k: TekrarKaynagi, region: number, ciz: (cx: CanvasRenderingContext2D, w: number, h: number) => void): void {
  const reg = k.t.regions[region];
  const mask = k.mask(region);
  const c = makeCanvas(mask.width, mask.height);
  const cx = c.getContext('2d')!;
  ciz(cx, c.width, c.height);
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(mask, 0, 0);
  ctx.drawImage(c, reg.minX, reg.minY);
}

function hamleAdimi(k: TekrarKaynagi, h: Hamle): Adim {
  const renk = k.t.palette[h.c]?.hex ?? '#000';
  const doldur = (ctx: CanvasRenderingContext2D, r: number) =>
    maskeliCiz(ctx, k, r, (cx, w, hh) => {
      cx.fillStyle = renk;
      cx.fillRect(0, 0, w, hh);
    });
  if (h.k === 'f') return (ctx) => doldur(ctx, h.r);
  if (h.k === 'm') return (ctx) => h.rs.forEach((r) => doldur(ctx, r));
  return (ctx) => {
    const reg = k.t.regions[h.r];
    maskeliCiz(ctx, k, h.r, (cx) => {
      cx.strokeStyle = renk;
      cx.lineWidth = h.w;
      cx.lineCap = 'round';
      cx.lineJoin = 'round';
      cx.beginPath();
      cx.moveTo(h.p[0] - reg.minX, h.p[1] - reg.minY);
      for (let i = 2; i < h.p.length; i += 2) cx.lineTo(h.p[i] - reg.minX + 0.01, h.p[i + 1] - reg.minY);
      if (h.p.length === 2) cx.lineTo(h.p[0] - reg.minX + 0.01, h.p[1] - reg.minY);
      cx.stroke();
    });
  };
}

/** Eksik kayıtlarda: bölgeyi bitmiş boyadan olduğu gibi kopyalar. */
function bolgeAdimi(k: TekrarKaynagi, region: number): Adim {
  const reg = k.t.regions[region];
  return (ctx) => maskeliCiz(ctx, k, region, (cx) => cx.drawImage(k.paint, -reg.minX, -reg.minY));
}

export function tekrarAdimlari(k: TekrarKaynagi): Adim[] {
  if (k.hamleler.tam && k.hamleler.liste.length) return k.hamleler.liste.map((h) => hamleAdimi(k, h));
  return bolgeSirasi(k.t.regions.map((r) => r.color)).map((r) => bolgeAdimi(k, r));
}

/** Animasyonu verilen tuvalde oynatır. */
export function tekrarOynat(hedef: HTMLCanvasElement, k: TekrarKaynagi): Tekrar {
  const { t } = k;
  const adimlar = tekrarAdimlari(k);
  const sure = tekrarSuresi(adimlar.length);
  const boya = makeCanvas(t.width, t.height);
  const boyaCtx = boya.getContext('2d')!;
  // gösterim tuvali: en fazla 1000 piksel genişlik yeter
  const olcek = Math.min(1, 1000 / t.width);
  hedef.width = Math.round(t.width * olcek);
  hedef.height = Math.round(t.height * olcek);
  const ctx = hedef.getContext('2d')!;

  const ciz = (son: boolean) => {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, hedef.width, hedef.height);
    // son karede, kayıtla küçük farklar kalmasın diye gerçek boyayı göster
    ctx.drawImage(son ? k.paint : boya, 0, 0, hedef.width, hedef.height);
    ctx.globalAlpha = 0.45;
    ctx.drawImage(k.lines, 0, 0, hedef.width, hedef.height);
  };

  let i = 0, durdu = false, id = 0, baslangic = 0;
  let coz!: () => void;
  const bitti = new Promise<void>((r) => (coz = r));
  const hareketsiz = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const dongu = (simdi: number) => {
    if (durdu) return;
    baslangic ||= simdi;
    const hedefAdim = uygulanacakHamle(simdi - baslangic, sure, adimlar.length);
    if (hedefAdim > i) {
      while (i < hedefAdim) adimlar[i++](boyaCtx);
      ciz(false);
    }
    if (i < adimlar.length) id = requestAnimationFrame(dongu);
    else {
      ciz(true);
      coz();
    }
  };

  if (hareketsiz || !adimlar.length) {
    ciz(true);
    coz();
  } else {
    ciz(false);
    id = requestAnimationFrame(dongu);
  }

  return {
    durdur: () => {
      durdu = true;
      cancelAnimationFrame(id);
      coz();
    },
    bitti,
  };
}
