import { describe, expect, it } from 'vitest';
import { bolgeKapsamasi, tumKapsamalar } from '../src/oyun/kapsama';
import { Ilerleme } from '../src/oyun/ilerleme';

// 4x2 görüntü: sol iki sütun bölge 0, sağ iki sütun bölge 1
const W = 4;
const harita = Int32Array.from([0, 0, 1, 1, 0, 0, 1, 1]);
const kirmizi = { r: 200, g: 30, b: 30 };
const mavi = { r: 30, g: 30, b: 200 };

function boya(pikseller: ([number, number, number, number] | null)[]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(pikseller.length * 4);
  pikseller.forEach((p, i) => p && d.set(p, i * 4));
  return d;
}

describe('kapsama', () => {
  it('bölgenin doğru renkle boyanan oranını verir', () => {
    // bölge 0'ın 4 pikselinden 3'ü kırmızı, biri boş
    const rgba = boya([[200, 30, 30, 255], [205, 28, 33, 255], [30, 30, 200, 255], null, [200, 30, 30, 255], null, null, null]);
    const kapsamalar = tumKapsamalar(harita, rgba, [0, 1], [kirmizi, mavi]);
    expect(kapsamalar[0]).toBeCloseTo(0.75);
    expect(kapsamalar[1]).toBeCloseTo(0.25);
  });

  it('yanlış renk, soluk renk ve çok saydam piksel sayılmaz', () => {
    const rgba = boya([[30, 30, 200, 255], [200, 30, 30, 60], [0, 0, 0, 0], [0, 0, 0, 0], [180, 30, 30, 255], [200, 30, 30, 200], null, null]);
    expect(tumKapsamalar(harita, rgba, [0, 1], [kirmizi, mavi])[0]).toBeCloseTo(0.25);
  });

  it('tek bölge hesabı, kutu içindeki piksellerle aynı sonucu verir', () => {
    const tam = boya([null, null, [30, 30, 200, 255], [30, 30, 200, 255], null, null, [30, 30, 200, 255], null]);
    // bölge 1'in kutusu: x 2..3, y 0..1 → kutudaki pikseller
    const kutu = { minX: 2, minY: 0, maxX: 3, maxY: 1 };
    const kutuPiksel = new Uint8ClampedArray(4 * 4);
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) kutuPiksel.set(tam.subarray(((y * W) + 2 + x) * 4, ((y * W) + 3 + x) * 4), (y * 2 + x) * 4);
    expect(bolgeKapsamasi(harita, W, 1, kutu, kutuPiksel, mavi)).toBeCloseTo(0.75);
  });
});

describe('ilerleme', () => {
  // 4 bölge: renk 0'da iki, renk 1'de iki bölge
  const renkler = [0, 0, 1, 1];

  it('başlangıç kapsamalarından durumu kurar', () => {
    const i = new Ilerleme(renkler, 2, [1, 0.95, 0.5, 0]);
    expect(i.biten).toBe(2);
    expect(i.oran).toBe(0.5);
    expect(i.renkTamamMi(0)).toBe(true);
    expect(i.kalanBolge(1)).toBe(2);
    expect(i.tamamMi).toBe(false);
  });

  it('bölge bitince renk ve resim tamamlanma olaylarını üretir', () => {
    const i = new Ilerleme(renkler, 2);
    let d = i.guncelle(new Map([[0, 1]]));
    expect(d.degisenBolgeler).toEqual([0]);
    expect(d.bitenRenkler).toEqual([]);
    d = i.guncelle(new Map([[1, 0.92]]));
    expect(d.bitenRenkler).toEqual([0]);
    d = i.guncelle(new Map([[2, 1], [3, 1]]));
    expect(d.bitenRenkler).toEqual([1]);
    expect(d.resimBitti).toBe(true);
    expect(i.oran).toBe(1);
  });

  it('%90 altı bitmiş sayılmaz; geri alınca renk tamamlığı bozulur', () => {
    const i = new Ilerleme(renkler, 2, [1, 1, 0, 0]);
    expect(i.guncelle(new Map([[2, 0.89]])).degisenBolgeler).toEqual([]);
    const d = i.guncelle(new Map([[1, 0.3]]));
    expect(d.bozulanRenkler).toEqual([0]);
    expect(i.kalanBolge(0)).toBe(1);
    expect(i.biten).toBe(1);
  });

  it('sonraki bitmemiş rengi sırayla bulur', () => {
    const i = new Ilerleme([0, 1, 2], 3, [0, 1, 0]);
    expect(i.sonrakiRenk(0)).toBe(2);
    expect(i.sonrakiRenk(2)).toBe(0);
    i.guncelle(new Map([[0, 1], [2, 1]]));
    expect(i.sonrakiRenk(0)).toBeNull();
  });
});

describe('yardımcılar', async () => {
  const y = await import('../src/oyun/yardimcilar');
  const bolgeler = [
    { color: 0, labelX: 10, labelY: 10, labelR: 5 },
    { color: 1, labelX: 50, labelY: 50, labelR: 5 },
    { color: 0, labelX: 90, labelY: 90, labelR: 5 },
    { color: 0, labelX: 40, labelY: 45, labelR: 2 },
  ];

  it('seçili renkte bitmemiş bölgeleri bulur', () => {
    expect(y.kalanBolgeler(bolgeler, [0, 0, 1, 0], 0)).toEqual([0, 3]);
  });

  it('bulucu, noktaya en yakın bölgeyi seçer; aday yoksa null', () => {
    expect(y.enYakinBolge(bolgeler, [0, 2, 3], 80, 80)).toBe(2);
    expect(y.enYakinBolge(bolgeler, [0, 2, 3], 45, 45)).toBe(3);
    expect(y.enYakinBolge(bolgeler, [], 0, 0)).toBeNull();
  });

  it('değnek yalnızca görünen alandaki adayları alır', () => {
    expect(y.gorunenBolgeler(bolgeler, [0, 2, 3], { x0: 0, y0: 0, x1: 50, y1: 50 })).toEqual([0, 3]);
  });

  it('numara uzaktan ve bitince gizlenir', () => {
    expect(y.numaraGorunurMu(5, 2, false)).toBe(true);
    expect(y.numaraGorunurMu(5, 1, false)).toBe(false);
    expect(y.numaraGorunurMu(5, 2, true)).toBe(false);
  });

  it('yazı boyutu sınırlar içinde kalır', () => {
    expect(y.numaraBoyutu(1, 1, 1)).toBe(9);
    expect(y.numaraBoyutu(100, 1, 2)).toBe(22);
  });

  it('bulucu ölçeği küçük bölgede numarayı okunur yapar, büyük bölgeyi sığdırır', () => {
    // küçük bölge: yarıçap 4 → en az 16/4 = 4 kat
    expect(y.odakOlcegi(10, 10, 4, 800, 0.3)).toBeGreaterThanOrEqual(4);
    // büyük bölge: 2000 px'lik kutu 800 px ekranın %40'ına sığmalı
    expect(y.odakOlcegi(2000, 1000, 200, 800, 0.1)).toBeCloseTo(0.16, 2);
    // hiçbir zaman sığdır ölçeğinin altına inmez
    expect(y.odakOlcegi(2000, 1000, 200, 800, 0.3)).toBe(0.3);
  });
});

describe('tekrar', async () => {
  const { tekrarSuresi, uygulanacakHamle, bolgeSirasi } = await import('../src/tekrar/hamleler');

  it('süre hamle sayısına göre 1,5 ile 6 saniye arasında', () => {
    expect(tekrarSuresi(2)).toBe(1500);
    expect(tekrarSuresi(20)).toBe(3000);
    expect(tekrarSuresi(5000)).toBe(6000);
  });

  it('geçen süreye göre uygulanacak hamle sayısı', () => {
    expect(uygulanacakHamle(0, 3000, 20)).toBe(0);
    expect(uygulanacakHamle(1500, 3000, 20)).toBe(10);
    expect(uygulanacakHamle(9999, 3000, 20)).toBe(20); // süre aşılırsa hepsi
    expect(uygulanacakHamle(100, 0, 20)).toBe(20);
  });

  it('eksik kayıtta bölgeler renk numarası sırasıyla gösterilir', () => {
    expect(bolgeSirasi([2, 0, 1, 0])).toEqual([1, 3, 2, 0]);
  });
});
