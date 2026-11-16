// Başlangıç ekranı: fotoğraf seç, detay seç, şablon oluştur; ya da son çalışmaya devam et.

import { calismaOlustur, sonCalismaId } from '../depo/calismalar';
import { sablonUret } from '../islem/calistir';
import type { Detail } from '../islem/sablon';
import { $, bekle, ekraniGoster } from './ekran';

export interface BaslangicOlaylari {
  /** yeni ya da devam edilecek çalışmayı aç */
  calismayiAc: (id: string) => void;
}

let secilen: File | null = null;

export function baslangicKur(olaylar: BaslangicOlaylari): void {
  const dosya = $<HTMLInputElement>('file');
  const olustur = $<HTMLButtonElement>('make');
  const devam = $<HTMLButtonElement>('resume');
  const onizleme = $<HTMLImageElement>('thumb');

  dosya.addEventListener('change', () => {
    secilen = dosya.files?.[0] ?? null;
    olustur.disabled = !secilen;
    $('error').hidden = true;
    if (secilen) {
      if (onizleme.src) URL.revokeObjectURL(onizleme.src);
      onizleme.src = URL.createObjectURL(secilen);
      onizleme.hidden = false;
      $('file-label').textContent = 'Başka fotoğraf seç';
    }
  });

  olustur.addEventListener('click', async () => {
    if (!secilen) return;
    const detail = (document.querySelector('input[name=detail]:checked') as HTMLInputElement).value as Detail;
    try {
      const template = await sablonUret(secilen, detail, (m) => bekle(m + '…'));
      bekle('Kaydediliyor…');
      const id = await calismaOlustur(template, detail);
      olaylar.calismayiAc(id);
    } catch (err) {
      hataGoster('Şablon oluşturulamadı: ' + (err instanceof Error ? err.message : String(err)));
    }
  });

  devam.addEventListener('click', async () => {
    const id = await sonCalismaId();
    if (id) olaylar.calismayiAc(id);
  });
}

export async function baslangiciGoster(): Promise<void> {
  ekraniGoster('start');
  $('resume').hidden = !(await sonCalismaId());
}

export function hataGoster(mesaj: string): void {
  void baslangiciGoster();
  const e = $('error');
  e.textContent = mesaj;
  e.hidden = false;
}
