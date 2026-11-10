// Boyama ekranı: taşmayan fırça, iki parmakla yakınlaştırma/kaydırma, geri al.
//
// Taşmayan fırçanın fikri: fırça darbesi önce ayrı bir tuvale çizilir, sonra
// darbenin başladığı bölgenin "maskesi" ile kesilir (destination-in). Böylece
// boya ne kadar kalın olursa olsun bölge sınırının dışına çıkamaz.

import { makeCanvas } from './cizim';
import type { Template } from './islem/sablon';

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
  x: number;
  y: number;
  data: ImageData;
}

type Mode = 'idle' | 'stroke' | 'pinch' | 'pan' | 'wait';

const MAX_UNDO = 25;

export class Painter {
  color = '#000000';
  /** fırça kalınlığı, ekran pikseli cinsinden */
  brush = 14;
  showNumbers = true;
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
  private masks = new Map<number, HTMLCanvasElement>();
  private undoStack: UndoPatch[] = [];
  private frame = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private t: Template,
    readonly paint: HTMLCanvasElement,
    private lines: HTMLCanvasElement,
    private numbers: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.paintCtx = paint.getContext('2d', { willReadFrequently: true })!;
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
    this.fit();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  undo(): void {
    const p = this.undoStack.pop();
    if (!p) return;
    this.paintCtx.putImageData(p.data, p.x, p.y);
    this.render();
    this.onChange();
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
    ctx.drawImage(this.lines, 0, 0);
    if (this.showNumbers) ctx.drawImage(this.numbers, 0, 0);
  }

  private resize(): void {
    const parent = this.canvas.parentElement!;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(parent.clientWidth * this.dpr);
    this.canvas.height = Math.round(parent.clientHeight * this.dpr);
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
    const patch = this.paintCtx.getImageData(s.x0, s.y0, s.canvas.width, s.canvas.height);
    this.undoStack.push({ x: s.x0, y: s.y0, data: patch });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.paintCtx.drawImage(s.canvas, s.x0, s.y0);
    this.stroke = null;
    this.render();
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
      // ikinci parmak geldi: boyamayı iptal et, yakınlaştırmaya geç
      this.stroke = null;
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), px: (a.x + b.x) / 2, py: (a.y + b.y) / 2, scale: this.scale };
      this.mode = 'pinch';
      this.render();
      return;
    }
    if (this.pointers.size > 2 || this.mode !== 'idle') return;

    const panOnly = (e.pointerType === 'touch' && this.penSeen) || (e.pointerType === 'mouse' && e.button !== 0);
    if (panOnly) this.mode = 'pan';
    else this.startStroke(e);
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
