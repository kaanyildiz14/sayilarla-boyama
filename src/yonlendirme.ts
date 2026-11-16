// Ekranlar arası geçiş, adres çubuğundaki # kısmıyla yapılır:
//   #/            başlangıç
//   #/boya/<id>   bir çalışmayı boyama
// Böylece sayfa yenilense de aynı ekrana dönülür; geri tuşu da çalışır.

export type Rota = { ad: 'baslangic' } | { ad: 'boya'; id: string };

export function rotayiCoz(hash: string): Rota {
  const yol = hash.replace(/^#/, '');
  const boya = /^\/boya\/([^/]+)$/.exec(yol);
  if (boya) return { ad: 'boya', id: decodeURIComponent(boya[1]) };
  return { ad: 'baslangic' };
}

export function rotaAdresi(r: Rota): string {
  return r.ad === 'boya' ? `#/boya/${encodeURIComponent(r.id)}` : '#/';
}

export function ayniRota(a: Rota, b: Rota): boolean {
  return rotaAdresi(a) === rotaAdresi(b);
}
