// Platform katmanı: web ile (ileride) mağaza uygulaması arasında farklı
// çalışan işler burada toplanır. Mağaza aşamasında yalnızca bu klasör değişir.

/** iPad'de paylaş menüsünü açar ("Resmi Kaydet" ile galeriye gider); bilgisayarda indirir. */
export async function saveImage(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
