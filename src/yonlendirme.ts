// Ekranlar arası geçiş, adres çubuğundaki # kısmıyla yapılır:
//   #/            Galerim
//   #/yeni        yeni resim (fotoğraf seç)
//   #/boya/<id>   bir çalışmayı boyama
// Böylece sayfa yenilense de aynı ekrana dönülür; geri tuşu da çalışır.

export type Rota = { ad: 'galeri' } | { ad: 'yeni' } | { ad: 'boya'; id: string };

export function rotayiCoz(hash: string): Rota {
  const yol = hash.replace(/^#/, '');
  if (yol === '/yeni') return { ad: 'yeni' };
  const boya = /^\/boya\/([^/]+)$/.exec(yol);
  if (boya) return { ad: 'boya', id: decodeURIComponent(boya[1]) };
  return { ad: 'galeri' };
}

export function rotaAdresi(r: Rota): string {
  if (r.ad === 'boya') return `#/boya/${encodeURIComponent(r.id)}`;
  if (r.ad === 'yeni') return '#/yeni';
  return '#/';
}

export function ayniRota(a: Rota, b: Rota): boolean {
  return rotaAdresi(a) === rotaAdresi(b);
}
