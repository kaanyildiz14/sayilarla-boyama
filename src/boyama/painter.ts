// Boyama ekranı: taşmayan fırça, dokun-doldur, iki parmakla yakınlaştırma/kaydırma, geri al.
//
// Araçlar:
//   dokun  parmak/fare ile dokununca bölge tek seferde dolar (yalnızca doğru renkle);
//          sürükleyince resim kayar. Apple Pencil her zaman fırça gibi boyar.
//   firca  parmak/fare da fırça gibi boyar (Pencil kullanıldıysa parmak sadece kaydırır).
//
// Taşmayan fırçanın fikri: fırça darbesi önce ayrı bir tuvale çizilir, sonra
// darbenin başladığı bölgenin "maskesi" ile kesilir (destination-in). Böylece
// boya ne kadar kalın olursa olsun bölge sınırının dışına çıkamaz.

import { makeCanvas } from './katmanlar';
import type { Template } from '../islem/sablon';
import { numaraBoyutu, numaraGorunurMu, odakOlcegi, type Gorus } from '../oyun/yardimcilar';

interface Stroke {
  region: number;
  x0: number;
  y0: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mask: HTMLCanvasElement;
  last: { x: number; y: number };
  pointerId: number;
}

interface UndoPatch {
  regions: number[];
  x: number;
  y: number;
  data: ImageData;
}

type Mode = 'idle' | 'stroke' | 'tap' | 'pinch' | 'pan' | 'wait';

export type Arac = 'dokun' | 'firca';

/** Dokunuşun "sürükleme" sayılması için gereken hareket (ekran pikseli) */
const DOKUNMA_TOLERANSI = 8;

const MAX_UNDO = 25;
/** vurgulanan bölgelerin koyuluğu (0-255) */
const VURGU_ALFA = 60;
const YANIP_SURE = 1400;

export class Painter {
  color = '#000000';
  /** seçili rengin palet sırası (dokun-doldur doğru renk denetimi için) */
  colorIndex = 0;
  arac: Arac = 'dokun';
  /** bir bölgenin boyası değişti (fırça, doldurma ya da geri alma) */
  onBolge: (region: number) => void = () => {};
  /** dokun-doldur'da yanlış renkle dokunuldu */
  onYanlisRenk: (region: number) => void = () => {};
  /** fırça kalınlığı, ekran pikseli cinsinden */
  brush = 14;
  showNumbers = true;
  /** bölge başına bitti bayrağı (ekran ilerlemeden verir); biten bölgenin numarası gizlenir */
  bitti: Uint8Array | null = null;
  onChange: () => void = () => {};

  private ctx: CanvasRenderingContext2D;
  private paintCtx: CanvasRenderingContext2D;
  private scale = 1;
  private tx = 0;
  private ty = 0;
  private dpr = 1;
  private mode: Mode = 'idle';
  private stroke: Stroke | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart: { dist: number; px: number; py: number; scale: number } | null = null;
  private penSeen = false;
  private tapStart: { x: number; y: number; pointerId: number } | null = null;
  private masks = new Map<number, HTMLCanvasElement>();
  private undoStack: UndoPatch[] = [];
  private frame = 0;
  private fitted = false;
  private bolgeRengi: Uint16Array;
  /** seçili rengin bitmemiş bölgelerini gösteren yarı saydam katman */
  private vurgu: HTMLCanvasElement;
  private vurguVeri: ImageData;
  private vurguRenk: number | null = null;
  /** bulucunun yanıp söndürdüğü bölge */
  private yanip: { region: number; mask: HTMLCanvasElement; baslangic: number } | null = null;
  private animasyon = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private t: Template,
    readonly paint: HTMLCanvasElement,
    private lines: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.paintCtx = paint.getContext('2d', { willReadFrequently: true })!;
    this.bolgeRengi = Uint16Array.from(t.regions, (r) => r.color);
    this.vurgu = makeCanvas(t.width, t.height);
    this.vurguVeri = this.vurgu.getContext('2d')!.createImageData(t.width, t.height);
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  undo(): void {
    const p = this.undoStack.pop();
    if (!p) return;
    this.paintCtx.putImageData(p.data, p.x, p.y);
    this.render();
    for (const r of p.regions) this.onBolge(r);
    this.onChange();
  }

  /** Bölgenin sınır kutusundaki boya pikselleri (kapsama hesabı için). */
  bolgePikselleri(region: number): ImageData {
    const r = this.t.regions[region];
    return this.paintCtx.getImageData(r.minX, r.minY, r.maxX - r.minX + 1, r.maxY - r.minY + 1);
  }

  /** Bölgeyi seçili renkle tamamen doldurur; renk yanlışsa doldurmaz. */
  doldur(region: number): boolean {
    if (this.t.regions[region].color !== this.colorIndex) {
      this.onYanlisRenk(region);
      return false;
    }
    const reg = this.t.regions[region];
    const mask = this.mask(region);
    const c = makeCanvas(mask.width, mask.height);
    const cx = c.getContext('2d')!;
    cx.fillStyle = this.color;
    cx.fillRect(0, 0, c.width, c.height);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(mask, 0, 0);
    this.yamaKaydet([region], reg.minX, reg.minY, c.width, c.height);
    this.paintCtx.drawImage(c, reg.minX, reg.minY);
    this.render();
    this.onBolge(region);
    this.onChange();
    return true;
  }

  /** Sihirli değnek: bölgeleri tek seferde doldurur; tek "geri al" ile geri gelir. */
  toplucaDoldur(regions: number[]): void {
    if (!regions.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const r of regions) {
      const b = this.t.regions[r];
      x0 = Math.min(x0, b.minX); y0 = Math.min(y0, b.minY);
      x1 = Math.max(x1, b.maxX); y1 = Math.max(y1, b.maxY);
    }
    this.yamaKaydet(regions, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    for (const r of regions) {
      const reg = this.t.regions[r];
      const mask = this.mask(r);
      const c = makeCanvas(mask.width, mask.height);
      const cx = c.getContext('2d')!;
      cx.fillStyle = this.color;
      cx.fillRect(0, 0, c.width, c.height);
      cx.globalCompositeOperation = 'destination-in';
      cx.drawImage(mask, 0, 0);
      this.paintCtx.drawImage(c, reg.minX, reg.minY);
    }
    this.render();
    for (const r of regions) this.onBolge(r);
    this.onChange();
  }

  private yamaKaydet(regions: number[], x: number, y: number, w: number, h: number): void {
    this.undoStack.push({ regions, x, y, data: this.paintCtx.getImageData(x, y, w, h) });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
  }

  // ---- vurgulama ----

  /** Seçili rengin bitmemiş bölgelerini koyulaştırır (null: vurgu yok). */
  vurguAyarla(renk: number | null): void {
    this.vurguRenk = renk;
    const d = this.vurguVeri.data;
    const map = this.t.regionMap;
    for (let p = 0; p < map.length; p++) d[p * 4 + 3] = this.vurguluMu(map[p]) ? VURGU_ALFA : 0;
    this.vurgu.getContext('2d')!.putImageData(this.vurguVeri, 0, 0);
    this.render();
  }

  /** Bir bölgenin durumu değişince (bitti / bitmedi) yalnızca onun kutusunu yeniler. */
  vurguBolge(region: number): void {
    if (this.vurguRenk === null || this.bolgeRengi[region] !== this.vurguRenk) return;
    const b = this.t.regions[region];
    const W = this.t.width, d = this.vurguVeri.data, map = this.t.regionMap;
    const goster = this.vurguluMu(region) ? VURGU_ALFA : 0;
    for (let y = b.minY; y <= b.maxY; y++)
      for (let x = b.minX; x <= b.maxX; x++) {
        const p = y * W + x;
        if (map[p] === region) d[p * 4 + 3] = goster;
      }
    this.vurgu.getContext('2d')!.putImageData(this.vurguVeri, 0, 0, b.minX, b.minY, b.maxX - b.minX + 1, b.maxY - b.minY + 1);
    this.render();
  }

  private vurguluMu(region: number): boolean {
    return this.vurguRenk !== null && this.bolgeRengi[region] === this.vurguRenk && !this.bitti?.[region];
  }

  // ---- bulucu ----

  /** Görünen alan, resim koordinatlarında. */
  gorus(): Gorus {
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    return { x0: -this.tx / this.scale, y0: -this.ty / this.scale, x1: (w - this.tx) / this.scale, y1: (h - this.ty) / this.scale };
  }

  /** Kamerayı bölgeye kaydırıp yakınlaştırır, sonra bölgeyi yanıp söndürür. */
  odakla(region: number): void {
    const b = this.t.regions[region];
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    const sigdir = Math.min(w / this.t.width, h / this.t.height) * 0.96;
    const hedefOlcek = odakOlcegi(b.maxX - b.minX + 1, b.maxY - b.minY + 1, b.labelR, Math.min(w, h), sigdir);
    const hedef = { s: hedefOlcek, tx: w / 2 - b.labelX * hedefOlcek, ty: h / 2 - b.labelY * hedefOlcek };
    const bas = { s: this.scale, tx: this.tx, ty: this.ty };
    const sure = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450;
    const t0 = performance.now();
    cancelAnimationFrame(this.animasyon);
    const adim = (simdi: number) => {
      const k = sure ? Math.min(1, (simdi - t0) / sure) : 1;
      const e = 1 - (1 - k) ** 3; // yavaşlayarak dur
      this.scale = bas.s + (hedef.s - bas.s) * e;
      this.tx = bas.tx + (hedef.tx - bas.tx) * e;
      this.ty = bas.ty + (hedef.ty - bas.ty) * e;
      this.draw();
      if (k < 1) this.animasyon = requestAnimationFrame(adim);
      else this.yanSon(region);
    };
    this.animasyon = requestAnimationFrame(adim);
  }

  private yanSon(region: number): void {
    this.yanip = { region, mask: this.mask(region), baslangic: performance.now() };
    const dongu = () => {
      if (!this.yanip) return;
      this.draw();
      if (performance.now() - this.yanip.baslangic < YANIP_SURE) requestAnimationFrame(dongu);
      else {
        this.yanip = null;
        this.render();
      }
    };
    requestAnimationFrame(dongu);
  }

  private bolgeAt(screen: { x: number; y: number }): number | null {
    const p = this.toImage(screen);
    const x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= this.t.width || y >= this.t.height) return null;
    return this.t.regionMap[y * this.t.width + x];
  }

  fit(): void {
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    this.scale = Math.min(w / this.t.width, h / this.t.height) * 0.96;
    this.tx = (w - this.t.width * this.scale) / 2;
    this.ty = (h - this.t.height * this.scale) / 2;
    this.render();
  }

  render(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw(): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#e9e7e2';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.tx, this.dpr * this.ty);
    // yakınlaşınca pikselleri bulanıklaştırma; çizgiler net kalsın
    ctx.imageSmoothingEnabled = this.scale * this.dpr < 2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.t.width, this.t.height);
    ctx.drawImage(this.paint, 0, 0);
    if (this.stroke) ctx.drawImage(this.stroke.canvas, this.stroke.x0, this.stroke.y0);
    if (this.vurguRenk !== null) ctx.drawImage(this.vurgu, 0, 0);
    if (this.yanip) {
      // üç kez yanıp sönen turuncu
      const t = (performance.now() - this.yanip.baslangic) / YANIP_SURE;
      const b = this.t.regions[this.yanip.region];
      ctx.globalAlpha = 0.55 * Math.abs(Math.sin(t * Math.PI * 3));
      ctx.drawImage(this.yanipKatmani(), b.minX, b.minY);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.lines, 0, 0);
    if (this.showNumbers) this.numaralariCiz();
  }

  private yanipOnbellek: { region: number; c: HTMLCanvasElement } | null = null;
  private yanipKatmani(): HTMLCanvasElement {
    const y = this.yanip!;
    if (this.yanipOnbellek?.region === y.region) return this.yanipOnbellek.c;
    const c = makeCanvas(y.mask.width, y.mask.height);
    const cx = c.getContext('2d')!;
    cx.fillStyle = '#e8590c';
    cx.fillRect(0, 0, c.width, c.height);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(y.mask, 0, 0);
    this.yanipOnbellek = { region: y.region, c };
    return c;
  }

  /** Numaralar ekran pikselinde çizilir: yakınlaştıkça belirir, bölge bitince kaybolur. */
  private numaralariCiz(): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#5f5d58';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    let sonBoyut = 0;
    const regions = this.t.regions;
    for (let r = 0; r < regions.length; r++) {
      const b = regions[r];
      if (!numaraGorunurMu(b.labelR, this.scale, !!this.bitti?.[r])) continue;
      const x = this.tx + (b.labelX + 0.5) * this.scale, y = this.ty + (b.labelY + 0.5) * this.scale;
      if (x < -30 || y < -30 || x > w + 30 || y > h + 30) continue;
      const yazi = String(b.color + 1);
      const boyut = Math.round(numaraBoyutu(b.labelR, this.scale, yazi.length));
      if (boyut !== sonBoyut) {
        ctx.font = `${boyut}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
        sonBoyut = boyut;
      }
      ctx.fillText(yazi, x, y);
    }
  }

  private resize(): void {
    const parent = this.canvas.parentElement!;
    // boyut değişince (ör. iPad yan çevrilince) ekranın ortasındaki nokta yerinde kalsın;
    // yoksa resim ekranın dışına kayıp tuval boş görünür
    const eskiW = this.canvas.width / this.dpr, eskiH = this.canvas.height / this.dpr;
    const merkezX = (eskiW / 2 - this.tx) / this.scale, merkezY = (eskiH / 2 - this.ty) / this.scale;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(parent.clientWidth * this.dpr);
    this.canvas.height = Math.round(parent.clientHeight * this.dpr);
    if (this.fitted && this.canvas.width > 0 && this.canvas.height > 0) {
      const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
      const sigdir = Math.min(w / this.t.width, h / this.t.height) * 0.96;
      // yeni ekranda resim çok küçük kaldıysa sığdır boyutuna getir
      if (this.scale < sigdir) this.scale = sigdir;
      this.tx = w / 2 - merkezX * this.scale;
      this.ty = h / 2 - merkezY * this.scale;
    }
    // ekran ilk açıldığında alan henüz ölçülmemiş olabilir; ilk gerçek boyutta sığdır
    if (!this.fitted && this.canvas.width > 0 && this.canvas.height > 0) {
      this.fitted = true;
      this.fit();
    }
    this.render();
  }

  // ---- koordinatlar ----

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private toImage(p: { x: number; y: number }): { x: number; y: number } {
    return { x: (p.x - this.tx) / this.scale, y: (p.y - this.ty) / this.scale };
  }

  private zoomAt(px: number, py: number, newScale: number): void {
    const min = Math.min(this.canvas.width / this.dpr / this.t.width, this.canvas.height / this.dpr / this.t.height) * 0.5;
    newScale = Math.max(min, Math.min(40, newScale));
    const ix = (px - this.tx) / this.scale, iy = (py - this.ty) / this.scale;
    this.scale = newScale;
    this.tx = px - ix * newScale;
    this.ty = py - iy * newScale;
  }

  // ---- bölge maskesi ----

  private mask(region: number): HTMLCanvasElement {
    let m = this.masks.get(region);
    if (m) return m;
    const reg = this.t.regions[region];
    const w = reg.maxX - reg.minX + 1, h = reg.maxY - reg.minY + 1;
    m = makeCanvas(w, h);
    const mctx = m.getContext('2d')!;
    const img = mctx.createImageData(w, h);
    const map = this.t.regionMap, W = this.t.width;
    for (let y = 0; y < h; y++) {
      const row = (reg.minY + y) * W + reg.minX;
      for (let x = 0; x < w; x++) if (map[row + x] === region) img.data[(y * w + x) * 4 + 3] = 255;
    }
    mctx.putImageData(img, 0, 0);
    this.masks.set(region, m);
    return m;
  }

  // ---- fırça ----

  private startStroke(e: PointerEvent): void {
    const p = this.toImage(this.local(e));
    const x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= this.t.width || y >= this.t.height) {
      this.mode = 'wait';
      return;
    }
    const region = this.t.regionMap[y * this.t.width + x];
    const reg = this.t.regions[region];
    const mask = this.mask(region);
    const canvas = makeCanvas(mask.width, mask.height);
    const ctx = canvas.getContext('2d')!;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.stroke = { region, x0: reg.minX, y0: reg.minY, canvas, ctx, mask, last: p, pointerId: e.pointerId };
    this.mode = 'stroke';
    this.segment(p, p);
  }

  private segment(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const s = this.stroke!;
    const { ctx } = s;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.brush / this.scale;
    ctx.beginPath();
    ctx.moveTo(a.x - s.x0, a.y - s.y0);
    ctx.lineTo(b.x - s.x0 + 0.01, b.y - s.y0);
    ctx.stroke();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(s.mask, 0, 0);
    s.last = b;
    this.render();
  }

  private commitStroke(): void {
    const s = this.stroke;
    if (!s) return;
    this.yamaKaydet([s.region], s.x0, s.y0, s.canvas.width, s.canvas.height);
    this.paintCtx.drawImage(s.canvas, s.x0, s.y0);
    this.stroke = null;
    this.render();
    this.onBolge(s.region);
    this.onChange();
  }

  // ---- işaretçi olayları ----

  private down = (e: PointerEvent): void => {
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // bazı tarayıcılar yapay olaylarda hata verir; yakalama şart değil
    }
    if (e.pointerType === 'pen') this.penSeen = true;
    this.pointers.set(e.pointerId, this.local(e));

    if (this.pointers.size === 2) {
      // ikinci parmak geldi: boyamayı / dokunmayı iptal et, yakınlaştırmaya geç
      this.stroke = null;
      this.tapStart = null;
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), px: (a.x + b.x) / 2, py: (a.y + b.y) / 2, scale: this.scale };
      this.mode = 'pinch';
      this.render();
      return;
    }
    if (this.pointers.size > 2 || this.mode !== 'idle') return;

    if (e.pointerType === 'pen') {
      this.startStroke(e);
    } else if (e.pointerType === 'mouse' && e.button !== 0) {
      this.mode = 'pan';
    } else if (this.arac === 'dokun') {
      // dokunma mı sürükleme mi? Parmak kalkınca ya da hareket edince belli olur
      const p = this.local(e);
      this.tapStart = { x: p.x, y: p.y, pointerId: e.pointerId };
      this.mode = 'tap';
    } else if (e.pointerType === 'touch' && this.penSeen) {
      this.mode = 'pan';
    } else {
      this.startStroke(e);
    }
  };

  private move = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = this.local(e);
    this.pointers.set(e.pointerId, cur);

    if (this.mode === 'pinch' && this.pointers.size >= 2 && this.pinchStart) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
      // önce orta noktanın kaymasını uygula, sonra yakınlaştır
      this.tx += px - this.pinchStart.px;
      this.ty += py - this.pinchStart.py;
      this.zoomAt(px, py, this.pinchStart.scale * (dist / this.pinchStart.dist));
      this.pinchStart.px = px;
      this.pinchStart.py = py;
      this.render();
    } else if (this.mode === 'tap' && this.tapStart) {
      if (Math.hypot(cur.x - this.tapStart.x, cur.y - this.tapStart.y) > DOKUNMA_TOLERANSI) {
        this.mode = 'pan';
        this.tx += cur.x - this.tapStart.x;
        this.ty += cur.y - this.tapStart.y;
        this.tapStart = null;
        this.render();
      }
    } else if (this.mode === 'pan') {
      this.tx += cur.x - prev.x;
      this.ty += cur.y - prev.y;
      this.render();
    } else if (this.mode === 'stroke' && this.stroke && e.pointerId === this.stroke.pointerId) {
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) {
        const p = this.toImage(this.local(ev));
        this.segment(this.stroke.last, p);
      }
    }
  };

  private up = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.mode === 'stroke' && this.stroke?.pointerId === e.pointerId) {
      if (e.type === 'pointercancel') this.stroke = null;
      else this.commitStroke();
    }
    if (this.mode === 'tap' && this.tapStart?.pointerId === e.pointerId) {
      const yer = this.tapStart;
      this.tapStart = null;
      if (e.type !== 'pointercancel') {
        const region = this.bolgeAt(yer);
        if (region !== null) this.doldur(region);
      }
    }
    if (this.pointers.size === 0) {
      this.mode = 'idle';
      this.pinchStart = null;
    } else if (this.mode !== 'pan') {
      // yakınlaştırma bitti ama bir parmak hâlâ ekranda: o parmak boyamasın
      this.mode = 'wait';
    }
    this.render();
  };

  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.local(e);
    if (e.ctrlKey || e.metaKey) {
      // Mac trackpad'de iki parmakla sıkıştırma ctrl+wheel olarak gelir
      this.zoomAt(p.x, p.y, this.scale * Math.exp(-e.deltaY * 0.01));
    } else {
      this.tx -= e.deltaX;
      this.ty -= e.deltaY;
    }
    this.render();
  };
}
