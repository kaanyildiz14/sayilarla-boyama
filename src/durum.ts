// Küçük, kütüphanesiz durum kabı: bir değer tutar, değişince abonelere haber verir.
// Ekranlar durumu buradan okur; böylece "şu an hangi ekrandayız" tek yerde durur.

export type Dinleyici<T> = (yeni: T, eski: T) => void;

export class Durum<T> {
  private dinleyiciler = new Set<Dinleyici<T>>();

  constructor(private deger: T) {}

  get(): T {
    return this.deger;
  }

  set(yeni: T): void {
    const eski = this.deger;
    if (Object.is(eski, yeni)) return;
    this.deger = yeni;
    for (const d of [...this.dinleyiciler]) d(yeni, eski);
  }

  /** Abone olur; aboneliği bitiren fonksiyonu döndürür. */
  abone(d: Dinleyici<T>): () => void {
    this.dinleyiciler.add(d);
    return () => this.dinleyiciler.delete(d);
  }
}
