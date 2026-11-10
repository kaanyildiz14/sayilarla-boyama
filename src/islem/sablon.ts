// Fotoğraftan boyama şablonu üreten ana akış.
// Adımlar: bulanıklaştır → Lab'a çevir → K renge indir → lekeleri temizle
// → küçük / ince bölgeleri komşuya kat → numara yerlerini bul → paleti çıkar.

import { boxBlur, majorityFilter } from './filtre';
import { kmeans } from './kmeans';
import { imageToLab, rgbToLab, toHex } from './renk';
import { connectedComponents, distanceToBorder, labelSpots, mergeInto } from './bolge';

export type Detail = 'sade' | 'orta' | 'detayli';

export interface DetailOptions {
  colors: number;
  /** bundan küçük alanlı bölgeler komşuya katılır (piksel) */
  minArea: number;
  /** numaranın sığması için gereken en küçük yarıçap (piksel) */
  minRadius: number;
}

export const DETAIL: Record<Detail, DetailOptions> = {
  sade: { colors: 16, minArea: 1400, minRadius: 9 },
  orta: { colors: 24, minArea: 600, minRadius: 7 },
  detayli: { colors: 32, minArea: 250, minRadius: 5 },
};

export interface PaletteColor {
  r: number;
  g: number;
  b: number;
  hex: string;
}

export interface Region {
  /** palet sırası (0'dan başlar; ekranda +1 ile gösterilir) */
  color: number;
  labelX: number;
  labelY: number;
  labelR: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Template {
  width: number;
  height: number;
  /** her pikselin bölge numarası */
  regionMap: Int32Array;
  regions: Region[];
  palette: PaletteColor[];
}

export type Progress = (message: string) => void;

export function buildTemplate(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  opts: DetailOptions,
  progress: Progress = () => {},
  seed = 1,
): Template {
  const n = w * h;
  progress('Fotoğraf yumuşatılıyor');
  const rgb = boxBlur(rgba, w, h, 2);

  progress('Renkler azaltılıyor');
  const lab = imageToLab(rgb, n);
  const { labels: raw, k } = kmeans(lab, opts.colors, seed);

  progress('Küçük lekeler temizleniyor');
  let labels = majorityFilter(raw, w, h, k, 2);
  labels = majorityFilter(labels, w, h, k, 1);

  progress('Bölgeler birleştiriliyor');
  for (let round = 0; round < 12; round++) {
    const cc = connectedComponents(labels, w, h);
    const merge = new Uint8Array(cc.count);
    let any = 0;
    for (let r = 0; r < cc.count; r++) if (cc.area[r] < opts.minArea) { merge[r] = 1; any++; }
    if (!any) {
      // alanı yeten ama numara sığmayacak kadar ince bölgeler
      const dist = distanceToBorder(cc.map, w, h);
      const spots = labelSpots(cc.map, cc.count, w, dist);
      for (let r = 0; r < cc.count; r++) if (spots[r].r < opts.minRadius) { merge[r] = 1; any++; }
    }
    if (!any || cc.count === 1) break;
    if (mergeInto(labels, w, cc, merge) === 0) break;
  }

  progress('Numaralar yerleştiriliyor');
  const cc = connectedComponents(labels, w, h);
  const dist = distanceToBorder(cc.map, w, h);
  const spots = labelSpots(cc.map, cc.count, w, dist);

  // Palet: her renk etiketinin piksellerinin ortalaması (orijinal, bulanık olmayan)
  const sums = new Float64Array(k * 3);
  const counts = new Uint32Array(k);
  for (let p = 0; p < n; p++) {
    const l = labels[p];
    counts[l]++;
    sums[l * 3] += rgba[p * 4];
    sums[l * 3 + 1] += rgba[p * 4 + 1];
    sums[l * 3 + 2] += rgba[p * 4 + 2];
  }
  const used: number[] = [];
  for (let l = 0; l < k; l++) if (counts[l] > 0) used.push(l);
  const mean = (l: number) => [sums[l * 3] / counts[l], sums[l * 3 + 1] / counts[l], sums[l * 3 + 2] / counts[l]];
  // açıktan koyuya sırala
  used.sort((a, b) => rgbToLab(...(mean(b) as [number, number, number]))[0] - rgbToLab(...(mean(a) as [number, number, number]))[0]);
  const order = new Int32Array(k).fill(-1);
  const palette: PaletteColor[] = used.map((l, i) => {
    order[l] = i;
    const [r, g, b] = mean(l).map(Math.round);
    return { r, g, b, hex: toHex(r, g, b) };
  });

  const regions: Region[] = Array.from({ length: cc.count }, (_, r) => ({
    color: order[cc.color[r]],
    labelX: spots[r].x,
    labelY: spots[r].y,
    labelR: spots[r].r,
    minX: w,
    minY: h,
    maxX: 0,
    maxY: 0,
  }));
  for (let p = 0; p < n; p++) {
    const reg = regions[cc.map[p]];
    const x = p % w, y = (p / w) | 0;
    if (x < reg.minX) reg.minX = x;
    if (x > reg.maxX) reg.maxX = x;
    if (y < reg.minY) reg.minY = y;
    if (y > reg.maxY) reg.maxY = y;
  }

  return { width: w, height: h, regionMap: cc.map, regions, palette };
}
