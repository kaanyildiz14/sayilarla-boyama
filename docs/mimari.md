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
| `src/oyun/yardimcilar.ts` | Bulucu (en yakın bölge), değnek (görünen bölgeler), numara görünürlüğü ve boyutu, bulucu kamera ölçeği |
| `src/oyun/ilerleme.ts` | Biten bölgeler, renk başına kalan, yüzde, renk/resim tamamlanma olayları |
| `src/boyama/katmanlar.ts` | Çizgi ve numara katmanları, indirilebilir şablon, bitmiş resim |
| `src/tekrar/hamleler.ts` | Hamle kaydının biçimi, tekrar süresi ve zamanlaması (saf TS) |
| `src/tekrar/oynat.ts` | Hamle kaydını boş tuvalde baştan oynatan animasyon |
| `src/depo/` | IndexedDB: bağlantı, sürüm göçü (`db.ts`), çalışmalar (`calismalar.ts`) |
| `src/platform/` | Web ile mağaza uygulaması arasında farklı çalışan işler (kaydet/paylaş) |

## Kayıt (IndexedDB, sürüm 2)

| Depo | Anahtar | İçerik |
|---|---|---|
| `works` | id | başlık, tarihler, detay, ilerleme, galeri kapağı (JPEG baytları) |
| `templates` | çalışma id | şablon |
| `progress` | çalışma id | boya katmanı (PNG baytları) |
| `settings` | ad | `sonCalisma` |
| `moves` (sürüm 3) | çalışma id | hamle kaydı: `{ tam, liste }` |

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

**Ekrana çizim sırası:** beyaz zemin → boya → o anki fırça darbesi → vurgu katmanı (seçili rengin boş bölgeleri, yarı saydam) → bulucunun yanıp sönen bölgesi → çizgiler → numaralar. Numaralar önceden çizilmiş bir resim değil; her karede **ekran pikselinde** yazılır. Böylece yakınlaşınca keskin kalır, uzaktayken (bölge ekranda 6 pikselden küçükse) ve bölge bitince gizlenir. Vurgu katmanı renk seçilince bir kez üretilir, sonra yalnızca durumu değişen bölgenin kutusu yenilenir.

## Hamle kaydı ve tekrar animasyonu

Her boyama işi bir hamle olarak kaydedilir: doldurma (`f`: bölge, renk), değnek (`m`: bölgeler, renk), fırça darbesi (`s`: bölge, renk, kalınlık, noktalar). Geri alınan hamle kayıttan da silinir. Resim bitince kayıt boş bir tuvalde baştan oynatılır; fırça darbeleri de boyarken olduğu gibi bölge maskesiyle kesilir.

- **Süre saate bağlıdır** (1,5–6 sn), kare hızına değil: her karede "şu ana kadar kaç hamle uygulanmış olmalı" hesaplanır. Yavaş cihazda da aynı sürede biter.
- **Eski çalışmalar:** hamle kaydı gelmeden önce boyanmış resimlerde kayıt eksiktir (`tam: false`). Onlarda tekrar, bitmiş boyanın bölgeleri renk numarası sırasıyla açılarak gösterilir.
- Son karede kayıt yerine gerçek boya çizilir; böylece küçük farklar görünmez.

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

## Gerçek iOS Safari'de deneme (iPad simülatörü)

Playwright'ın WebKit'i gerçek iOS Safari ile birebir aynı değildir. Sürümden önce Xcode'un iPad simülatöründe elle denenir:

```bash
npm run build && npx vite preview --port 4179   # derlenmiş sürüm
xcrun simctl boot "iPad Pro 11-inch (M5)"
xcrun simctl openurl booted http://localhost:4179/
xcrun simctl addmedia booted e2e/ornek/manzara.jpg   # fotoğraf arşivine örnek resim
```

- **Geliştirme sunucusunu (`npm run dev`) simülatörde açma:** Vite'ın canlı yenileme bağlantısı (WebSocket) simülatörün tarayıcı motorunu çökertiyor ("Web Sayfası Çöktü"). Derlenmiş sürümde bu bağlantı yok.
- Simülatörde bulunan ve düzeltilenler: emoji/metin simgeler soru işareti kutusu çıkıyordu (SVG simgelere geçildi); arayüze iki parmak değince sayfanın tamamı büyüyordu (`touch-action: pan-x pan-y`).
- Simülatörde denenemeyenler: Apple Pencil, gerçek bellek sınırları, titreşim.
