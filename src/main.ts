// Uygulamanın girişi: adres (#) değişince doğru ekranı açar.

import { calismaAc } from './depo/calismalar';
import { Durum } from './durum';
import { baslangicKur, baslangiciGoster, hataGoster } from './ekranlar/baslangic';
import { aktifCalismaId, bekleyenKaydiYaz, boyamaAraclariniKur, boyamayiAc } from './ekranlar/boyama';
import { bekle } from './ekranlar/ekran';
import { ayniRota, rotaAdresi, rotayiCoz, type Rota } from './yonlendirme';

const rota = new Durum<Rota>(rotayiCoz(location.hash));

export function git(r: Rota): void {
  if (ayniRota(r, rota.get())) return;
  location.hash = rotaAdresi(r);
}

window.addEventListener('hashchange', () => {
  const yeni = rotayiCoz(location.hash);
  if (!ayniRota(yeni, rota.get())) rota.set(yeni);
});

async function ciz(r: Rota): Promise<void> {
  if (r.ad === 'baslangic') {
    await bekleyenKaydiYaz();
    await baslangiciGoster();
    return;
  }
  if (aktifCalismaId() === r.id && !document.getElementById('paint')!.hidden) return;
  bekle('Çalışma açılıyor…');
  const acik = await calismaAc(r.id);
  if (!acik) {
    git({ ad: 'baslangic' });
    hataGoster('Bu çalışma bulunamadı.');
    return;
  }
  await boyamayiAc(acik);
}

baslangicKur({ calismayiAc: (id) => git({ ad: 'boya', id }) });
boyamaAraclariniKur(() => git({ ad: 'baslangic' }));
rota.abone((r) => void ciz(r));
void ciz(rota.get());
