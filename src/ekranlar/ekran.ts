// Ekranları gösterip gizleyen ortak yardımcılar.

export type EkranAdi = 'gallery' | 'start' | 'busy' | 'paint';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function ekraniGoster(ad: EkranAdi): void {
  for (const e of ['gallery', 'start', 'busy', 'paint'] as EkranAdi[]) $(e).hidden = e !== ad;
}

export function bekle(mesaj: string): void {
  ekraniGoster('busy');
  $('busy-text').textContent = mesaj;
}
