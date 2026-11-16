// Yardımcılar: bulucu, sihirli değnek ve numaraların görünürlüğü için saf hesaplar.

export interface Etiketli {
  color: number;
  labelX: number;
  labelY: number;
  labelR: number;
}

export interface Gorus {
  /** görünen alanın resim koordinatlarındaki sınırları */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Seçili renkte bitmemiş bölgeler. */
export function kalanBolgeler(bolgeler: Etiketli[], bitti: ArrayLike<number>, renk: number): number[] {
  const sonuc: number[] = [];
  for (let r = 0; r < bolgeler.length; r++) if (bolgeler[r].color === renk && !bitti[r]) sonuc.push(r);
  return sonuc;
}

/** Bulucu: verilen noktaya (ör. ekranın ortası) numarası en yakın bölge. */
export function enYakinBolge(bolgeler: Etiketli[], adaylar: number[], x: number, y: number): number | null {
  let en: number | null = null;
  let enUzaklik = Infinity;
  for (const r of adaylar) {
    const b = bolgeler[r];
    const d = (b.labelX - x) ** 2 + (b.labelY - y) ** 2;
    if (d < enUzaklik) {
      enUzaklik = d;
      en = r;
    }
  }
  return en;
}

/** Sihirli değnek: numarası ekranda görünen adaylar. */
export function gorunenBolgeler(bolgeler: Etiketli[], adaylar: number[], g: Gorus): number[] {
  return adaylar.filter((r) => {
    const b = bolgeler[r];
    return b.labelX >= g.x0 && b.labelX <= g.x1 && b.labelY >= g.y0 && b.labelY <= g.y1;
  });
}

/** Ekranda numaranın okunabilmesi için gereken en küçük yarıçap (ekran pikseli). */
export const NUMARA_ESIGI = 6;

/**
 * Numara gösterilsin mi? Bölge bittiyse gizlenir; uzaktan bakınca (bölge ekranda
 * çok küçükse) gizlenir, yakınlaştıkça belirir.
 */
export function numaraGorunurMu(labelR: number, olcek: number, bittiMi: boolean): boolean {
  return !bittiMi && labelR * olcek >= NUMARA_ESIGI;
}

/** Ekrandaki numara yazı boyutu (piksel): bölge büyüdükçe büyür, sınırlar içinde kalır. */
export function numaraBoyutu(labelR: number, olcek: number, haneSayisi: number): number {
  const r = labelR * olcek;
  return Math.max(9, Math.min(22, r * (haneSayisi > 1 ? 1.05 : 1.3)));
}

/**
 * Bulucunun kamerası: bölge rahatça görünsün ve numarası okunsun diye ölçek.
 * @param ekran görünen alanın kısa kenarı (ekran pikseli)
 */
export function odakOlcegi(kutuW: number, kutuH: number, labelR: number, ekran: number, enAz: number): number {
  const sigdir = (ekran * 0.4) / Math.max(kutuW, kutuH, 1);
  const okunur = 16 / Math.max(labelR, 1);
  return Math.max(enAz, Math.min(40, Math.max(Math.min(sigdir, 8), okunur)));
}
