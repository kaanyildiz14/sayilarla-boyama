// Kullanıcı ayarları: cihazda (localStorage) saklanır.

export interface Ayarlar {
  /** yardımcı düğmeler (bul, değnek) solda dursun */
  solEl: boolean;
  /** dokunsal geri bildirim (destekleyen cihazlarda) */
  titresim: boolean;
  /** bir renk bitince sıradaki bitmemiş renge kendiliğinden geç */
  otoRenk: boolean;
}

export const VARSAYILAN: Ayarlar = { solEl: false, titresim: true, otoRenk: true };
const ANAHTAR = 'sayilarla-boyama:ayarlar';

/** Saklanan metni ayarlara çevirir; eksik ya da bozuk alanlarda varsayılanı kullanır. */
export function ayarlariCoz(metin: string | null): Ayarlar {
  if (!metin) return { ...VARSAYILAN };
  try {
    const o = JSON.parse(metin) as Partial<Record<keyof Ayarlar, unknown>>;
    const sonuc = { ...VARSAYILAN };
    for (const k of Object.keys(VARSAYILAN) as (keyof Ayarlar)[]) if (typeof o?.[k] === 'boolean') sonuc[k] = o[k] as boolean;
    return sonuc;
  } catch {
    return { ...VARSAYILAN };
  }
}

let onbellek: Ayarlar | null = null;

export function ayarlar(): Ayarlar {
  if (!onbellek) {
    try {
      onbellek = ayarlariCoz(localStorage.getItem(ANAHTAR));
    } catch {
      onbellek = { ...VARSAYILAN }; // gizli sekmede depolama kapalı olabilir
    }
  }
  return onbellek;
}

export function ayarDegistir<K extends keyof Ayarlar>(ad: K, deger: Ayarlar[K]): void {
  const a = ayarlar();
  a[ad] = deger;
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(a));
  } catch {
    // saklanamazsa bu oturum için geçerli kalır
  }
}

/** Ayar açıksa ve cihaz destekliyorsa titreşim verir (iOS Safari desteklemez). */
export function titret(desen: number | number[]): void {
  if (ayarlar().titresim) navigator.vibrate?.(desen);
}
