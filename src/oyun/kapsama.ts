// Kapsama: bir bölgenin ne kadarı DOĞRU renkle boyanmış?
// Boya katmanının piksellerine bakarak hesaplanır; ayrıca bir "bitti" listesi
// saklamaya gerek kalmaz, ilerleme her zaman boyanın kendisinden çıkar.

/** Boyalı piksel, hedef renge her kanalda bu kadar yakınsa doğru sayılır. */
const TOLERANS = 10;
/** Kenarlardaki yarı saydam pikseller de sayılsın diye */
const MIN_ALFA = 128;

export interface RGB {
  r: number;
  g: number;
  b: number;
}

function dogruMu(d: Uint8ClampedArray, i: number, c: RGB): boolean {
  return (
    d[i + 3] >= MIN_ALFA &&
    Math.abs(d[i] - c.r) <= TOLERANS &&
    Math.abs(d[i + 1] - c.g) <= TOLERANS &&
    Math.abs(d[i + 2] - c.b) <= TOLERANS
  );
}

export interface Kutu {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Tek bir bölgenin kapsaması (0..1).
 * @param rgba bölgenin sınır kutusu kadar boya pikseli (getImageData)
 */
export function bolgeKapsamasi(
  regionMap: Int32Array,
  width: number,
  region: number,
  kutu: Kutu,
  rgba: Uint8ClampedArray,
  renk: RGB,
): number {
  const w = kutu.maxX - kutu.minX + 1, h = kutu.maxY - kutu.minY + 1;
  let alan = 0, dogru = 0;
  for (let y = 0; y < h; y++) {
    const satir = (kutu.minY + y) * width + kutu.minX;
    for (let x = 0; x < w; x++) {
      if (regionMap[satir + x] !== region) continue;
      alan++;
      if (dogruMu(rgba, (y * w + x) * 4, renk)) dogru++;
    }
  }
  return alan ? dogru / alan : 0;
}

/** Bütün bölgelerin kapsaması, tek geçişte (çalışma açılırken). */
export function tumKapsamalar(
  regionMap: Int32Array,
  rgba: Uint8ClampedArray,
  bolgeRengi: ArrayLike<number>,
  palet: RGB[],
): Float32Array {
  const n = bolgeRengi.length;
  const alan = new Uint32Array(n), dogru = new Uint32Array(n);
  for (let p = 0; p < regionMap.length; p++) {
    const r = regionMap[p];
    alan[r]++;
    if (dogruMu(rgba, p * 4, palet[bolgeRengi[r]])) dogru[r]++;
  }
  const sonuc = new Float32Array(n);
  for (let r = 0; r < n; r++) sonuc[r] = alan[r] ? dogru[r] / alan[r] : 0;
  return sonuc;
}
