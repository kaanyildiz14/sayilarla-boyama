# Mimari özeti

## Ekran akışı

```
Başlangıç ──(fotoğraf + detay)──▶ Hazırlanıyor ──▶ Boyama ──▶ Resmi kaydet
    ▲                                                  │
    └────────────── Kaldığın yerden devam ◀────────────┘ (otomatik kayıt)
```

## Dosyalar

| Dosya | Görevi |
|---|---|
| `src/main.ts` | Ekranlar arası geçiş, düğmeler, otomatik kayıt zamanlaması |
| `src/isci.ts` | Web Worker: şablon üretimini arayüzü dondurmadan yapar |
| `src/islem/sablon.ts` | Şablon üretiminin ana akışı ve detay ayarları |
| `src/islem/kmeans.ts` | Renk azaltma (k-means++, sabit tohum) |
| `src/islem/renk.ts` | sRGB → CIELAB, hex |
| `src/islem/filtre.ts` | Kutu bulanıklığı, çoğunluk filtresi |
| `src/islem/bolge.ts` | Bağlı bileşenler, bölge birleştirme, uzaklık dönüşümü, numara yeri |
| `src/cizim.ts` | Çizgi ve numara katmanları, indirilebilir şablon, bitmiş resim |
| `src/boyama.ts` | Boyama ekranı: taşmayan fırça, yakınlaştırma, geri al |
| `src/kayit.ts` | IndexedDB ile kaydetme / açma |

## Veri yapısı

```ts
Template {
  width, height
  regionMap: Int32Array   // her pikselin bölge numarası
  regions: Region[]       // renk, numara yeri, sınır kutusu
  palette: PaletteColor[] // r, g, b, hex (açıktan koyuya)
}
Region { color, labelX, labelY, labelR, minX, minY, maxX, maxY }
```

Boyama ayrı bir tuvalde (`paint`) tutulur. Ekrana sırasıyla beyaz zemin, boya, o anki fırça darbesi, çizgiler ve numaralar çizilir.

## En zor üç kısım

1. **Bölge birleştirme.** K-means sonrası binlerce küçük adacık oluşur. Önce alanı `minArea`'dan küçük olanlar, sonra numara sığmayacak kadar ince olanlar (iç yarıçapı `minRadius`'tan küçük) en uzun ortak sınırı paylaştıkları komşu renge katılır. Bu en fazla 12 tur tekrarlanır.
2. **Numara yeri.** Ağırlık merkezi kıvrık bir bölgenin dışına düşebilir. Bunun yerine 3-4 chamfer uzaklık dönüşümüyle her pikselin sınıra uzaklığı hesaplanır; bölgedeki en büyük değer, sığan en büyük dairenin merkezidir. Yazı boyutu bu yarıçapa göre seçilir.
3. **Taşmayan fırça.** Darbe başladığı pikselin bölgesine bağlanır. Darbe, bölgenin sınır kutusu kadar bir tuvale çizilir ve her harekette bölge maskesiyle `destination-in` uygulanır. Bırakıldığında ana boya tuvaline eklenir; geri alma için o kutunun önceki hali saklanır.

## Detay ayarları

| Seviye | Renk | En küçük alan | En küçük iç yarıçap |
|---|---|---|---|
| Sade | 16 | 1400 px | 9 px |
| Orta | 24 | 600 px | 7 px |
| Detaylı | 32 | 250 px | 5 px |
