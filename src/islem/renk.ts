// sRGB <-> CIELAB dönüşümü. Lab'da iki renk arasındaki mesafe,
// gözün algıladığı farka RGB'den çok daha yakındır; renkleri
// gruplarken bu yüzden Lab kullanıyoruz.

function toLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function f(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
}

/** Tek bir rengi Lab'a çevirir: [L, a, b] */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  // D65 beyaz noktasına göre XYZ
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** RGB(A) piksel dizisini Lab dizisine çevirir (piksel başına 3 sayı). */
export function imageToLab(rgb: Float32Array, pixelCount: number): Float32Array {
  const out = new Float32Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    const [L, a, b] = rgbToLab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    out[i * 3] = L;
    out[i * 3 + 1] = a;
    out[i * 3 + 2] = b;
  }
  return out;
}

export function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}
