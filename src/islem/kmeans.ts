// K-means ile renk azaltma: binlerce farklı rengi K tane "boya"ya indirir.
// Hız için merkezleri piksellerden alınan bir örnek üzerinde bulur,
// sonra her pikseli en yakın merkeze atar.

/** Her çalıştırmada aynı sonucu veren basit rastgele sayı üreteci. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist2(data: Float32Array, i: number, centers: Float32Array, c: number): number {
  const d0 = data[i * 3] - centers[c * 3];
  const d1 = data[i * 3 + 1] - centers[c * 3 + 1];
  const d2 = data[i * 3 + 2] - centers[c * 3 + 2];
  return d0 * d0 + d1 * d1 + d2 * d2;
}

function nearest(data: Float32Array, i: number, centers: Float32Array, k: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let c = 0; c < k; c++) {
    const d = dist2(data, i, centers, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export interface KMeansResult {
  labels: Uint16Array;
  k: number;
}

/**
 * @param data piksel başına 3 değer (Lab)
 * @param k    istenen renk sayısı
 */
export function kmeans(data: Float32Array, k: number, seed = 1, sampleSize = 40000, iterations = 20): KMeansResult {
  const n = data.length / 3;
  const rand = mulberry32(seed);

  // 1) Örnek seç
  const m = Math.min(n, sampleSize);
  const sample = new Float32Array(m * 3);
  for (let s = 0; s < m; s++) {
    const i = m === n ? s : Math.floor(rand() * n);
    sample.set(data.subarray(i * 3, i * 3 + 3), s * 3);
  }

  // 2) k-means++ başlangıcı: merkezleri birbirinden uzak seç
  k = Math.max(1, Math.min(k, m));
  const centers = new Float32Array(k * 3);
  const first = Math.floor(rand() * m);
  centers.set(sample.subarray(first * 3, first * 3 + 3), 0);
  const minD = new Float64Array(m).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let s = 0; s < m; s++) {
      const d = dist2(sample, s, centers, c - 1);
      if (d < minD[s]) minD[s] = d;
      total += minD[s];
    }
    let pick = 0;
    if (total > 0) {
      let r = rand() * total;
      for (pick = 0; pick < m - 1; pick++) {
        r -= minD[pick];
        if (r <= 0) break;
      }
    }
    centers.set(sample.subarray(pick * 3, pick * 3 + 3), c * 3);
  }

  // 3) Lloyd adımları (örnek üzerinde)
  const assign = new Uint16Array(m);
  const sums = new Float64Array(k * 3);
  const counts = new Uint32Array(k);
  for (let it = 0; it < iterations; it++) {
    sums.fill(0);
    counts.fill(0);
    let moved = 0;
    for (let s = 0; s < m; s++) {
      const c = nearest(sample, s, centers, k);
      if (c !== assign[s]) moved++;
      assign[s] = c;
      counts[c]++;
      sums[c * 3] += sample[s * 3];
      sums[c * 3 + 1] += sample[s * 3 + 1];
      sums[c * 3 + 2] += sample[s * 3 + 2];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      centers[c * 3] = sums[c * 3] / counts[c];
      centers[c * 3 + 1] = sums[c * 3 + 1] / counts[c];
      centers[c * 3 + 2] = sums[c * 3 + 2] / counts[c];
    }
    if (it > 0 && moved === 0) break;
  }

  // 4) Tüm pikselleri ata
  const labels = new Uint16Array(n);
  for (let i = 0; i < n; i++) labels[i] = nearest(data, i, centers, k);
  return { labels, k };
}
