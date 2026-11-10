// Görüntü filtreleri: renk azaltmadan önce hafif bulanıklık (gürültüyü
// azaltır), sonra da "çoğunluk filtresi" (tek tük piksellik lekeleri siler).

/** RGBA dizisinden RGB Float32 dizisi üretir, ayrılabilir kutu bulanıklığı uygular. */
export function boxBlur(rgba: Uint8ClampedArray, w: number, h: number, radius: number): Float32Array {
  const n = w * h;
  let src = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    src[i * 3] = rgba[i * 4];
    src[i * 3 + 1] = rgba[i * 4 + 1];
    src[i * 3 + 2] = rgba[i * 4 + 2];
  }
  if (radius <= 0) return src;
  const tmp = new Float32Array(n * 3);
  // yatay
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, c = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const j = (y * w + xx) * 3;
        r += src[j]; g += src[j + 1]; b += src[j + 2]; c++;
      }
      const o = (y * w + x) * 3;
      tmp[o] = r / c; tmp[o + 1] = g / c; tmp[o + 2] = b / c;
    }
  }
  // dikey
  const out = new Float32Array(n * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, c = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const j = (yy * w + x) * 3;
        r += tmp[j]; g += tmp[j + 1]; b += tmp[j + 2]; c++;
      }
      const o = (y * w + x) * 3;
      out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c;
    }
  }
  src = out;
  return src;
}

/** Her pikseli, çevresindeki pencerede en çok görülen renk etiketiyle değiştirir. */
export function majorityFilter(labels: Uint16Array, w: number, h: number, k: number, radius: number): Uint16Array {
  const out = new Uint16Array(labels.length);
  const counts = new Uint32Array(k);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w - 1, x + radius);
      let best = labels[y * w + x];
      let bestC = 0;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const l = labels[yy * w + xx];
          const c = ++counts[l];
          if (c > bestC) {
            bestC = c;
            best = l;
          }
        }
      }
      out[y * w + x] = best;
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) counts[labels[yy * w + xx]] = 0;
    }
  }
  return out;
}
