// Uygulamanın girişi: adres (#) değişince doğru ekranı açar.

import { calismaAc } from './depo/calismalar';
import { Durum } from './durum';
import { yeniResimGoster, yeniResimKur } from './ekranlar/baslangic';
import { aktifCalismaId, bekleyenKaydiYaz, boyamaAraclariniKur, boyamayiAc } from './ekranlar/boyama';
import { bekle } from './ekranlar/ekran';
import { galeriKur, galeriyiGoster } from './ekranlar/galeri';
import { ayniRota, rotaAdresi, rotayiCoz, type Rota } from './yonlendirme';

const rota = new Durum<Rota>(rotayiCoz(location.hash));
let bekleyenHata: string | undefined;

function git(r: Rota): void {
  if (ayniRota(r, rota.get())) return;
  location.hash = rotaAdresi(r);
}

window.addEventListener('hashchange', () => {
  const yeni = rotayiCoz(location.hash);
  if (!ayniRota(yeni, rota.get())) rota.set(yeni);
});

async function ciz(r: Rota): Promise<void> {
  if (r.ad !== 'boya') await bekleyenKaydiYaz();
  if (r.ad === 'galeri') {
    const hata = bekleyenHata;
    bekleyenHata = undefined;
    await galeriyiGoster(hata);
    return;
  }
  if (r.ad === 'yeni') {
    yeniResimGoster();
    return;
  }
  if (aktifCalismaId() === r.id && !document.getElementById('paint')!.hidden) return;
  bekle('Çalışma açılıyor…');
  const acik = await calismaAc(r.id);
  if (!acik) {
    bekleyenHata = 'Bu çalışma bulunamadı.';
    git({ ad: 'galeri' });
    return;
  }
  await boyamayiAc(acik);
}

galeriKur({ ac: (id) => git({ ad: 'boya', id }), yeni: () => git({ ad: 'yeni' }) });
yeniResimKur({ calismayiAc: (id) => git({ ad: 'boya', id }) });
boyamaAraclariniKur(() => git({ ad: 'galeri' }));
rota.abone((r) => void ciz(r));
void ciz(rota.get());
