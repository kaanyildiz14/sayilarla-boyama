// Galerim: bütün çalışmalar kart kart. Karta dokununca boyama açılır;
// ⋯ menüsünden yeniden adlandırılır veya silinir.

import { calismaSil, calismalariListele, kapakBlob, yenidenAdlandir, type Calisma } from '../depo/calismalar';
import { $, ekraniGoster } from './ekran';

export interface GaleriOlaylari {
  ac: (id: string) => void;
  yeni: () => void;
}

let olaylar: GaleriOlaylari;
let kapakAdresleri: string[] = [];

export function galeriKur(o: GaleriOlaylari): void {
  olaylar = o;
  $('new').addEventListener('click', () => olaylar.yeni());
  $('empty-new').addEventListener('click', () => olaylar.yeni());
}

export async function galeriyiGoster(hata?: string): Promise<void> {
  ekraniGoster('gallery');
  const hataEl = $('gallery-error');
  hataEl.textContent = hata ?? '';
  hataEl.hidden = !hata;
  await kartlariCiz();
}

async function kartlariCiz(): Promise<void> {
  const liste = await calismalariListele();
  for (const a of kapakAdresleri) URL.revokeObjectURL(a);
  kapakAdresleri = [];
  const kartlar = $('cards');
  kartlar.replaceChildren(...liste.map(kart));
  $('empty').hidden = liste.length > 0;
  $('new').hidden = liste.length === 0;
}

/** "Bugün 21:40", "Dün 09:15" ya da "3 Kasım" */
export function sonDuzenleme(ms: number, simdi = Date.now()): string {
  const gun = (t: number) => new Date(t).toDateString();
  const saat = new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (gun(ms) === gun(simdi)) return `Bugün ${saat}`;
  if (gun(ms) === gun(simdi - 86_400_000)) return `Dün ${saat}`;
  return new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

function kart(c: Calisma): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'work';
  li.dataset.id = c.id;

  const ac = document.createElement('button');
  ac.className = 'work-open';
  ac.setAttribute('aria-label', `${c.title} resmini aç`);
  const kapak = kapakBlob(c);
  if (kapak) {
    const img = document.createElement('img');
    const adres = URL.createObjectURL(kapak);
    kapakAdresleri.push(adres);
    img.src = adres;
    img.alt = '';
    ac.appendChild(img);
  } else {
    const yer = document.createElement('span');
    yer.className = 'placeholder';
    ac.appendChild(yer);
  }
  ac.addEventListener('click', () => olaylar.ac(c.id));

  const bilgi = document.createElement('div');
  bilgi.className = 'work-info';
  const metin = document.createElement('div');
  metin.className = 'work-text';
  const baslik = document.createElement('div');
  baslik.className = 'work-title';
  baslik.textContent = c.title;
  const zaman = document.createElement('div');
  zaman.className = 'work-date';
  const durum = c.completedAt ? '✓ Bitti' : `%${Math.floor((c.progress ?? 0) * 100)}`;
  zaman.textContent = `${sonDuzenleme(c.updatedAt)} · ${durum}`;
  if (c.completedAt) li.classList.add('bitti');
  metin.append(baslik, zaman);

  const menu = document.createElement('button');
  menu.className = 'work-menu';
  // metin simgesi ('⋯') bazı iOS sürümlerinde soru işareti kutusu olarak çıkıyor
  menu.innerHTML =
    '<svg class="ikon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>';
  menu.setAttribute('aria-label', `${c.title} için seçenekler`);
  menu.setAttribute('aria-expanded', 'false');
  bilgi.append(metin, menu);

  const islemler = document.createElement('div');
  islemler.className = 'work-actions';
  islemler.hidden = true;
  const adlandir = document.createElement('button');
  adlandir.textContent = 'Adını değiştir';
  const sil = document.createElement('button');
  sil.textContent = 'Sil';
  sil.className = 'danger';
  islemler.append(adlandir, sil);

  menu.addEventListener('click', () => {
    islemler.hidden = !islemler.hidden;
    menu.setAttribute('aria-expanded', String(!islemler.hidden));
  });
  adlandir.addEventListener('click', async () => {
    const yeni = prompt('Resmin yeni adı:', c.title);
    if (yeni && yeni.trim() && yeni.trim() !== c.title) {
      await yenidenAdlandir(c.id, yeni);
      await kartlariCiz();
    }
  });
  sil.addEventListener('click', async () => {
    if (!confirm(`"${c.title}" silinsin mi? Boyaman da silinir ve geri alınamaz.`)) return;
    await calismaSil(c.id);
    await kartlariCiz();
  });

  const cubuk = document.createElement('div');
  cubuk.className = 'work-progress';
  const dolu = document.createElement('span');
  dolu.style.width = `${(c.progress ?? 0) * 100}%`;
  cubuk.appendChild(dolu);

  li.append(ac, cubuk, bilgi, islemler);
  return li;
}
