// Hamle kaydı: boyarken yapılan her iş (doldurma, fırça darbesi, değnek) sırayla
// saklanır. Resim bitince bu kayıt baştan oynatılarak "nasıl boyandı" animasyonu
// gösterilir. Geri alınan hamle kayıttan da silinir.

export type Hamle =
  /** dokun-doldur: bölge r, renk c */
  | { k: 'f'; r: number; c: number }
  /** sihirli değnek: bölgeler rs, renk c */
  | { k: 'm'; rs: number[]; c: number }
  /** fırça darbesi: bölge r, renk c, kalınlık w (resim pikseli), noktalar p = [x0,y0,x1,y1,...] */
  | { k: 's'; r: number; c: number; w: number; p: number[] };

export interface HamleKaydi {
  /**
   * Kayıt resmin başından beri eksiksiz mi? Hamle kaydı gelmeden önce boyanmış
   * eski çalışmalarda değildir; o zaman tekrar, bitmiş boyadan bölge bölge gösterilir.
   */
  tam: boolean;
  liste: Hamle[];
}

export function bosKayit(tam = true): HamleKaydi {
  return { tam, liste: [] };
}

/**
 * Tekrarın toplam süresi (ms): hamle başına ~150 ms, en az 1,5 en çok 6 saniye.
 * Süre saate bağlıdır; kare hızına değil. Yavaş cihazda da aynı sürede biter.
 */
export function tekrarSuresi(hamleSayisi: number): number {
  return Math.min(6000, Math.max(1500, hamleSayisi * 150));
}

/** Geçen süreye göre o ana kadar uygulanmış olması gereken hamle sayısı. */
export function uygulanacakHamle(gecen: number, sure: number, hamleSayisi: number): number {
  if (sure <= 0) return hamleSayisi;
  return Math.min(hamleSayisi, Math.max(0, Math.floor((gecen / sure) * hamleSayisi)));
}

/** Eksik kayıtlar için: bölgeleri renk numarası sırasıyla gösteren sıra. */
export function bolgeSirasi(bolgeRengi: ArrayLike<number>): number[] {
  return Array.from({ length: bolgeRengi.length }, (_, i) => i).sort((a, b) => bolgeRengi[a] - bolgeRengi[b] || a - b);
}
