// Yeni resim ekranı: fotoğraf seç, detay seç, şablon oluştur.

import { drawLines, kapakResmi, makeCanvas, toBlob } from '../boyama/katmanlar';
import { calismaOlustur } from '../depo/calismalar';
import { sablonUret } from '../islem/calistir';
import type { Detail, Template } from '../islem/sablon';
import { $, bekle, ekraniGoster } from './ekran';

export interface YeniResimOlaylari {
  /** oluşturulan çalışmayı aç */
  calismayiAc: (id: string) => void;
}

let secilen: File | null = null;

export function yeniResimKur(olaylar: YeniResimOlaylari): void {
  const dosya = $<HTMLInputElement>('file');
  const olustur = $<HTMLButtonElement>('make');
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
      const id = await calismaOlustur(template, detail, await bosKapak(template));
      formuSifirla();
      olaylar.calismayiAc(id);
    } catch (err) {
      yeniResimGoster();
      const e = $('error');
      e.textContent = 'Şablon oluşturulamadı: ' + (err instanceof Error ? err.message : String(err));
      e.hidden = false;
    }
  });
}

/** Henüz boyanmamış şablonun galeri kapağı: sadece çizgiler. */
function bosKapak(t: Template): Promise<Blob> {
  return toBlob(kapakResmi(t, makeCanvas(t.width, t.height), drawLines(t)), 'image/jpeg', 0.8);
}

function formuSifirla(): void {
  secilen = null;
  $<HTMLInputElement>('file').value = '';
  $<HTMLButtonElement>('make').disabled = true;
  const onizleme = $<HTMLImageElement>('thumb');
  if (onizleme.src) URL.revokeObjectURL(onizleme.src);
  onizleme.removeAttribute('src');
  onizleme.hidden = true;
  $('file-label').textContent = 'Fotoğraf seç';
}

export function yeniResimGoster(): void {
  ekraniGoster('start');
}
