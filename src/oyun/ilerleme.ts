// İlerleme: hangi bölgeler bitti, her renkte kaç bölge kaldı, yüzde kaç tamam.
// Kurallar (docs/oyun-plani.md §7):
//   - bölgenin en az %90'ı doğru renkle boyanınca "bitti"
//   - ilerleme = biten bölge / toplam bölge
//   - bir rengin bütün bölgeleri bitince renk tamam; hepsi bitince resim tamam

export const BITTI_ESIGI = 0.9;

export interface Degisim {
  /** bitti → bitmedi ya da tersi olan bölgeler */
  degisenBolgeler: number[];
  /** bu değişiklikle tamamlanan renkler */
  bitenRenkler: number[];
  /** geri alma ile tamamlanmışlığı bozulan renkler */
  bozulanRenkler: number[];
  resimBitti: boolean;
}

export class Ilerleme {
  readonly bitti: Uint8Array;
  private kalan: Uint32Array;
  private toplamRenk: Uint32Array;
  private bitenSayisi = 0;

  constructor(
    private bolgeRengi: ArrayLike<number>,
    renkSayisi: number,
    kapsamalar?: ArrayLike<number>,
  ) {
    const n = bolgeRengi.length;
    this.bitti = new Uint8Array(n);
    this.kalan = new Uint32Array(renkSayisi);
    this.toplamRenk = new Uint32Array(renkSayisi);
    for (let r = 0; r < n; r++) {
      this.toplamRenk[bolgeRengi[r]]++;
      if (kapsamalar && kapsamalar[r] >= BITTI_ESIGI) {
        this.bitti[r] = 1;
        this.bitenSayisi++;
      } else {
        this.kalan[bolgeRengi[r]]++;
      }
    }
  }

  get toplam(): number {
    return this.bitti.length;
  }

  get biten(): number {
    return this.bitenSayisi;
  }

  /** 0..1 */
  get oran(): number {
    return this.toplam ? this.bitenSayisi / this.toplam : 0;
  }

  get tamamMi(): boolean {
    return this.toplam > 0 && this.bitenSayisi === this.toplam;
  }

  kalanBolge(renk: number): number {
    return this.kalan[renk];
  }

  toplamBolge(renk: number): number {
    return this.toplamRenk[renk];
  }

  renkTamamMi(renk: number): boolean {
    return this.toplamRenk[renk] > 0 && this.kalan[renk] === 0;
  }

  /** Verilen renkten sonra (sırayla dönerek) bitmemiş ilk renk; hepsi bittiyse null. */
  sonrakiRenk(renk: number): number | null {
    const n = this.kalan.length;
    for (let i = 1; i <= n; i++) {
      const c = (renk + i) % n;
      if (this.kalan[c] > 0) return c;
    }
    return null;
  }

  /** Bölgelerin yeni kapsamalarını uygular; neyin değiştiğini döndürür. */
  guncelle(kapsamalar: Map<number, number>): Degisim {
    const once = this.tamamMi;
    const d: Degisim = { degisenBolgeler: [], bitenRenkler: [], bozulanRenkler: [], resimBitti: false };
    for (const [r, k] of kapsamalar) {
      const yeni = k >= BITTI_ESIGI ? 1 : 0;
      if (yeni === this.bitti[r]) continue;
      const renk = this.bolgeRengi[r];
      const renkOnce = this.renkTamamMi(renk);
      this.bitti[r] = yeni;
      this.bitenSayisi += yeni ? 1 : -1;
      this.kalan[renk] += yeni ? -1 : 1;
      d.degisenBolgeler.push(r);
      const renkSonra = this.renkTamamMi(renk);
      if (!renkOnce && renkSonra) d.bitenRenkler.push(renk);
      if (renkOnce && !renkSonra) d.bozulanRenkler.push(renk);
    }
    d.resimBitti = !once && this.tamamMi;
    return d;
  }
}
