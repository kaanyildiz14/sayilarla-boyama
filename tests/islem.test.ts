import { describe, expect, it } from 'vitest';
import { rgbToLab, toHex } from '../src/islem/renk';
import { kmeans } from '../src/islem/kmeans';
import { majorityFilter } from '../src/islem/filtre';
import { connectedComponents, distanceToBorder, labelSpots } from '../src/islem/bolge';
import { buildTemplate } from '../src/islem/sablon';

/** w x h boyutunda, renk(x, y) fonksiyonuyla boyanmış RGBA görüntü */
function image(w: number, h: number, color: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = color(x, y);
      out.set([r, g, b, 255], (y * w + x) * 4);
    }
  return out;
}

describe('renk', () => {
  it('beyaz ve siyahı doğru çevirir', () => {
    expect(rgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 1);
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 1);
  });
  it('hex kodu üretir', () => {
    expect(toHex(255, 0, 10)).toBe('#FF000A');
  });
});

describe('kmeans', () => {
  it('iki belirgin rengi iki gruba ayırır', () => {
    const data = new Float32Array([0, 0, 0, 1, 1, 1, 90, 0, 0, 91, 1, 1]);
    const { labels } = kmeans(data, 2);
    expect(labels[0]).toBe(labels[1]);
    expect(labels[2]).toBe(labels[3]);
    expect(labels[0]).not.toBe(labels[2]);
  });
  it('aynı tohumla aynı sonucu verir', () => {
    const data = Float32Array.from({ length: 300 }, (_, i) => (i * 37) % 100);
    expect(kmeans(data, 4, 7).labels).toEqual(kmeans(data, 4, 7).labels);
  });
});

describe('filtre ve bölgeler', () => {
  it('çoğunluk filtresi tek piksellik lekeyi siler', () => {
    const labels = new Uint16Array(25);
    labels[12] = 1;
    expect(majorityFilter(labels, 5, 5, 2, 1)[12]).toBe(0);
  });
  it('bağlı bileşenleri sayar', () => {
    // 0 0 1
    // 1 1 1
    // 0 0 0   -> üstteki 0'lar ile alttaki 0'lar ayrı bölge
    const labels = Uint16Array.from([0, 0, 1, 1, 1, 1, 0, 0, 0]);
    const cc = connectedComponents(labels, 3, 3);
    expect(cc.count).toBe(3);
    expect(Array.from(cc.area).sort()).toEqual([2, 3, 4]);
  });
  it('numara yeri bölgenin ortasına düşer', () => {
    const map = new Int32Array(21 * 21);
    const dist = distanceToBorder(map, 21, 21);
    const [spot] = labelSpots(map, 1, 21, dist);
    expect(spot.x).toBe(10);
    expect(spot.y).toBe(10);
    expect(spot.r).toBeGreaterThan(8);
  });
});

describe('şablon', () => {
  const w = 120, h = 80;
  // sol yarı kırmızı, sağ yarı mavi, arada tek tük gürültü noktaları
  const rgba = image(w, h, (x, y) => {
    if ((x * 7 + y * 13) % 97 === 0) return [0, 255, 0];
    return x < w / 2 ? [220, 30, 30] : [30, 30, 220];
  });
  const t = buildTemplate(rgba, w, h, { colors: 3, minArea: 100, minRadius: 4 });

  it('iki büyük bölge ve iki renk çıkarır', () => {
    expect(t.regions.length).toBe(2);
    expect(t.palette.length).toBe(2);
  });
  it('her bölge yeterince büyük ve numarası kendi içinde', () => {
    for (let r = 0; r < t.regions.length; r++) {
      const reg = t.regions[r];
      expect(reg.labelR).toBeGreaterThanOrEqual(4);
      expect(t.regionMap[reg.labelY * w + reg.labelX]).toBe(r);
    }
  });
  it('palet renkleri fotoğraftaki renklere yakın', () => {
    const hexes = t.palette.map((p) => p.hex);
    expect(hexes.some((x) => x.startsWith('#D'))).toBe(true); // kırmızı
    expect(t.palette.every((p) => p.g < 80)).toBe(true); // yeşil gürültü palete girmedi
  });
});
