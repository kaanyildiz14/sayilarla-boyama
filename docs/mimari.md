# Mimari özeti

## Ekran akışı

```
Galerim ──(＋ Yeni resim)──▶ Fotoğraf + detay ──▶ Hazırlanıyor ──▶ Boyama ──▶ Resmi kaydet
   ▲  │                                                            │
   │  └──────────────────── karta dokun ──────────────────────────▶│
   └──────────────────────── ‹ Galerim (otomatik kayıt + kapak) ◀──┘
```

## Dosyalar

| Dosya | Görevi |
|---|---|
| `src/main.ts` | Giriş: adres (#) değişince doğru ekranı açar |
| `src/yonlendirme.ts` | `#/` (Galerim), `#/yeni` ve `#/boya/<id>` adreslerini çözer / üretir |
| `src/durum.ts` | Küçük durum kabı (değişince abonelere haber verir) |
| `src/ekranlar/` | Galerim (`galeri.ts`), yeni resim (`baslangic.ts`), boyama (`boyama.ts`), ekran geçişi |
| `src/islem/` | Görüntü işleme (saf TS): şablon, k-means, renk, filtre, bölge; `isci.ts` Web Worker, `calistir.ts` fotoğrafı hazırlayıp işçiyi çalıştırır |
| `src/boyama/painter.ts` | Boyama tuvali: taşmayan fırça, dokun-doldur, yakınlaştırma, geri al |
| `src/oyun/kapsama.ts` | Bir bölgenin ne kadarının doğru renkle boyandığı (boya piksellerinden) |
| `src/oyun/ilerleme.ts` | Biten bölgeler, renk başına kalan, yüzde, renk/resim tamamlanma olayları |
| `src/boyama/katmanlar.ts` | Çizgi ve numara katmanları, indirilebilir şablon, bitmiş resim |
| `src/depo/` | IndexedDB: bağlantı, sürüm göçü (`db.ts`), çalışmalar (`calismalar.ts`) |
| `src/platform/` | Web ile mağaza uygulaması arasında farklı çalışan işler (kaydet/paylaş) |

## Kayıt (IndexedDB, sürüm 2)

| Depo | Anahtar | İçerik |
|---|---|---|
| `works` | id | başlık, tarihler, detay, ilerleme, galeri kapağı (JPEG baytları) |
| `templates` | çalışma id | şablon |
| `progress` | çalışma id | boya katmanı (PNG baytları) |
| `settings` | ad | `sonCalisma` |

Sürüm 1'deki tek kayıt, açılışta silinmeden ilk çalışmaya ("İlk boyamam") taşınır. Boya katmanı Blob yerine ham bayt (ArrayBuffer) olarak yazılır; Safari bazı ortamlarda IndexedDB'ye Blob yazamıyor.

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

## Oyun kuralları ve ilerleme

İlerleme ayrı bir "bitti" listesi olarak saklanmaz; **boyanın kendisinden** hesaplanır. Çalışma açılırken bütün boya katmanı tek geçişte taranır (`tumKapsamalar`), sonra her fırça darbesi, doldurma ya da geri almada yalnızca o bölgenin kutusu yeniden sayılır (`bolgeKapsamasi`). Böylece geri alma, eski kayıtlar ve fırçayla elle boyama aynı kuralla çalışır; kayıt ile ekran birbirinden kopamaz. Galeri için yalnızca özet (`progress`, `completedAt`) saklanır.

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
