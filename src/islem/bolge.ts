// Bölgeler: aynı renkteki ve birbirine değen piksellerin oluşturduğu adacıklar.
// Boyanacak her alan bir bölgedir; içine bir numara yazılır.

export interface Components {
  /** Her pikselin bölge numarası */
  map: Int32Array;
  count: number;
  /** bölge -> renk etiketi */
  color: Uint16Array;
  area: Uint32Array;
}

/** 4-komşuluk ile bağlı bileşenleri bulur (taşma doldurma). */
export function connectedComponents(labels: Uint16Array, w: number, h: number): Components {
  const n = w * h;
  const map = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const colors: number[] = [];
  const areas: number[] = [];
  let count = 0;
  for (let start = 0; start < n; start++) {
    if (map[start] !== -1) continue;
    const col = labels[start];
    let sp = 0;
    stack[sp++] = start;
    map[start] = count;
    let area = 0;
    while (sp > 0) {
      const p = stack[--sp];
      area++;
      const x = p % w;
      if (x > 0 && map[p - 1] === -1 && labels[p - 1] === col) { map[p - 1] = count; stack[sp++] = p - 1; }
      if (x < w - 1 && map[p + 1] === -1 && labels[p + 1] === col) { map[p + 1] = count; stack[sp++] = p + 1; }
      if (p >= w && map[p - w] === -1 && labels[p - w] === col) { map[p - w] = count; stack[sp++] = p - w; }
      if (p < n - w && map[p + w] === -1 && labels[p + w] === col) { map[p + w] = count; stack[sp++] = p + w; }
    }
    colors.push(col);
    areas.push(area);
    count++;
  }
  return { map, count, color: Uint16Array.from(colors), area: Uint32Array.from(areas) };
}

/**
 * Seçilen bölgeleri, en uzun sınırı paylaştıkları komşunun rengine boyar.
 * Etiket dizisini yerinde değiştirir; kaç bölgenin birleştiğini döndürür.
 */
export function mergeInto(labels: Uint16Array, w: number, cc: Components, merge: Uint8Array): number {
  const n = labels.length;
  // küçük bölge -> (komşu renk -> ortak kenar uzunluğu)
  const contacts = new Map<number, Map<number, number>>();
  const add = (region: number, neighborColor: number) => {
    let m = contacts.get(region);
    if (!m) contacts.set(region, (m = new Map()));
    m.set(neighborColor, (m.get(neighborColor) ?? 0) + 1);
  };
  for (let p = 0; p < n; p++) {
    const r = cc.map[p];
    const x = p % w;
    if (x < w - 1) {
      const q = cc.map[p + 1];
      if (q !== r) {
        if (merge[r]) add(r, cc.color[q]);
        if (merge[q]) add(q, cc.color[r]);
      }
    }
    if (p < n - w) {
      const q = cc.map[p + w];
      if (q !== r) {
        if (merge[r]) add(r, cc.color[q]);
        if (merge[q]) add(q, cc.color[r]);
      }
    }
  }
  const target = new Int32Array(cc.count).fill(-1);
  for (const [region, m] of contacts) {
    let best = -1, bestC = -1;
    for (const [col, c] of m) if (c > bestC) { bestC = c; best = col; }
    target[region] = best;
  }
  let merged = 0;
  for (let p = 0; p < n; p++) {
    const t = target[cc.map[p]];
    if (t >= 0) labels[p] = t;
  }
  for (let r = 0; r < cc.count; r++) if (target[r] >= 0) merged++;
  return merged;
}

/**
 * Her pikselin en yakın bölge sınırına uzaklığı (3-4 chamfer, piksel cinsinden).
 * Bir bölgedeki en büyük değer, o bölgeye sığan en büyük dairenin yarıçapıdır:
 * numara oraya yazılır.
 */
export function distanceToBorder(map: Int32Array, w: number, h: number): Float32Array {
  const n = w * h;
  const INF = 1e9;
  const d = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const x = p % w, y = (p / w) | 0;
    const r = map[p];
    const border =
      x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
      map[p - 1] !== r || map[p + 1] !== r || map[p - w] !== r || map[p + w] !== r;
    d[p] = border ? 0 : INF;
  }
  // ileri geçiş
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (d[p] === 0) continue;
      const r = map[p];
      let v = d[p];
      if (x > 0 && map[p - 1] === r) v = Math.min(v, d[p - 1] + 3);
      if (y > 0) {
        if (map[p - w] === r) v = Math.min(v, d[p - w] + 3);
        if (x > 0 && map[p - w - 1] === r) v = Math.min(v, d[p - w - 1] + 4);
        if (x < w - 1 && map[p - w + 1] === r) v = Math.min(v, d[p - w + 1] + 4);
      }
      d[p] = v;
    }
  }
  // geri geçiş
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x;
      if (d[p] === 0) continue;
      const r = map[p];
      let v = d[p];
      if (x < w - 1 && map[p + 1] === r) v = Math.min(v, d[p + 1] + 3);
      if (y < h - 1) {
        if (map[p + w] === r) v = Math.min(v, d[p + w] + 3);
        if (x < w - 1 && map[p + w + 1] === r) v = Math.min(v, d[p + w + 1] + 4);
        if (x > 0 && map[p + w - 1] === r) v = Math.min(v, d[p + w - 1] + 4);
      }
      d[p] = v;
    }
  }
  for (let p = 0; p < n; p++) d[p] /= 3;
  return d;
}

export interface LabelSpot {
  x: number;
  y: number;
  /** sığan en büyük dairenin yarıçapı (piksel) */
  r: number;
}

/** Her bölge için numaranın yazılacağı en iç noktayı bulur. */
export function labelSpots(map: Int32Array, count: number, w: number, dist: Float32Array): LabelSpot[] {
  const spots: LabelSpot[] = Array.from({ length: count }, () => ({ x: 0, y: 0, r: -1 }));
  for (let p = 0; p < map.length; p++) {
    const s = spots[map[p]];
    if (dist[p] > s.r) {
      s.r = dist[p];
      s.x = p % w;
      s.y = (p / w) | 0;
    }
  }
  return spots;
}
