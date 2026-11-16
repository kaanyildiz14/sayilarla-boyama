# Sayılarla Boyama → Oyun: Plan ve Geliştirme Hattı

> Hazırlanma: 2026-11-16 · Durum: taslak, Kaan'ın onayını bekliyor
> Karar: önce ücretsiz web oyunu (PWA), sonra aynı kodla App Store ve Google Play (Capacitor).

## İçindekiler

1. [Hedef](#1-hedef)
2. [Rakip incelemesi](#2-rakip-incelemesi)
3. [Türün oyun döngüsü](#3-türün-oyun-döngüsü)
4. [Kullanıcıların şikâyetleri = bizim fırsatlarımız](#4-kullanıcıların-şikâyetleri--bizim-fırsatlarımız)
5. [Bizi farklı kılacak şey](#5-bizi-farklı-kılacak-şey)
6. [Özellikler ve öncelikleri](#6-özellikler-ve-öncelikleri)
7. [Oyun kuralları](#7-oyun-kuralları)
8. [Ekran akışı](#8-ekran-akışı)
9. [Veri modeli](#9-veri-modeli)
10. [Teknik mimari](#10-teknik-mimari)
11. [Geliştirme hattı (pipeline)](#11-geliştirme-hattı-pipeline)
12. [Aşamalar](#12-aşamalar)
13. [Mağaza aşaması](#13-mağaza-aşaması)
14. [Riskler](#14-riskler)
15. [İlk aşama](#15-ilk-aşama)
16. [Kaynaklar](#16-kaynaklar)

---

## 1. Hedef

Bugünkü uygulamayı (fotoğraf → numaralı şablon → taşmadan boyama) **telefonda ve tablette keyifle oynanan bir boyama oyununa** çevirmek.

Başarı ölçütleri:

- Bir fotoğraf iPad'de **8 saniyenin altında** şablona dönüşür.
- Boyarken ekran takılmaz (60 kare/sn hedef). Kalem izi parmağın/kalemin hemen altında görünür.
- Oyuncu "son bölgeyi bulamadım" diye takılmaz.
- Reklam yok, internet gerekmez, fotoğraf cihazdan çıkmaz.
- Önce web'de ücretsiz yayınlanır, olgunlaşınca mağazaya çıkar.

---

## 2. Rakip incelemesi

Kaynak: App Store sayfaları, mağaza açıklamaları ve kullanıcı yorumları (bkz. [Kaynaklar](#16-kaynaklar)). Uygulamaları tek tek indirip oynamadım; aşağıdakiler mağaza sayfalarında ve yorumlarda yazanlardır.

| Uygulama | Tür | Nasıl oynanıyor | Güçlü yanı | Zayıf yanı |
|---|---|---|---|---|
| **Happy Color** | Bölgeli sayılarla boyama | Hazır resim seç → renk seç → bölgelere dokun | 40.000+ ücretsiz resim, arama, temalar, başarımlar ("5 resim boya" gibi) | Her resim arası reklam; ipucu bitince reklam izlemek gerekiyor |
| **Pixel Art (Easybrain)** | Piksel (kare ızgara) | Kareleri numaraya göre doldur | **Sihirli değnek:** aynı numaralı komşu kareleri tek dokunuşla doldurur; **renk patlaması:** çevredeki tüm kareleri doldurur; tek dokunuşla paylaşılan tekrar videosu | Kare ızgara fotoğrafları "pikselli" gösterir |
| **Color by Number∘ / Paint Pixel** | Piksel | Aynı | **Bomba** (çevredeki kareleri boyar), **bulucu** (kalan kareyi gösterir), ipucu seçili numaraya yakınlaşır | Reklam |
| **Paint.ly** | Bölgeli | Aynı | Boyama sürecinin **tekrar videosu** | Reklam / abonelik |
| **Pigment** | Serbest boyama kitabı | Kalemle serbest boyama veya dokun-doldur | 30+ fırça (kuru boya, sulu boya, sim…), Apple Pencil basınç ve açı desteği | Pahalı abonelik (haftalık 4,99 $ / yıllık 59,99 $), ücretsiz kayıtlarda filigran |
| **Fotoğraftan şablon yapanlar** (culur, ColorCrafter, Pixel Paint, Color Tree) | Fotoğraf → şablon | Fotoğraf seç → detay seç → boya | Kendi fotoğrafın, detay seviyesi | Çoğu kare ızgara kullanıyor; karmaşık arka planda bozuluyor; beyaz alanlar soluk çıkıyor; kayıt ve yazdırma ücretli |

**Özet:** Türün iki kolu var:

1. **Hazır resim + reklam** (Happy Color, Pixel Art): devasa kütüphane, ipuçları ve günlük içerikle oyuncuyu her gün geri getiriyorlar. Para reklamdan geliyor.
2. **Sanatsal serbest boyama** (Pigment): gerçek fırça hissi var, para abonelikten geliyor.

Kendi fotoğrafını çevirenler genelde **kare ızgara** kullanıyor ve sonuç pikselli. Bizim yöntemimizde bölgeler fotoğrafın gerçek şekillerini izliyor. Bu bizim en net farkımız.

---

## 3. Türün oyun döngüsü

Bütün başarılı oyunlarda aynı döngü var:

```
  Resim seç ──▶ Renk seç ──▶ Bölgeleri boya ──▶ Renk bitti ✓ ──▶ Resim bitti 🎉
      ▲                                                               │
      └──────────── Galeride biriktir, paylaş, yenisine başla ◀───────┘
```

Döngüyü güçlendiren ortak parçalar:

| Parça | Ne işe yarıyor |
|---|---|
| **Seçili rengin bölgelerini vurgulama** | Hangi bölgelere boyanacağı hemen görünür |
| **Renk bitince ✓ ve kartelada ilerleme halkası** | Küçük ve sık başarı hissi |
| **İpucu / bulucu** | En büyük şikâyet olan "son hücreyi bulamıyorum" sorununu çözer |
| **Hızlandırıcılar** (sihirli değnek, bomba) | Büyük ve sıkıcı alanları hızlı geçmek |
| **Bitiş kutlaması + tekrar videosu** | Ödül anı ve paylaşma isteği |
| **Galeri / koleksiyon** | Biriktirme hissi |
| **Günlük resim, başarımlar** | Her gün geri gelme sebebi |

---

## 4. Kullanıcıların şikâyetleri = bizim fırsatlarımız

| Şikâyet (yorumlarda en sık) | Bizim çözümümüz |
|---|---|
| Reklamlar çok, 30 saniyeden uzun, her resimden sonra çıkıyor | **Hiç reklam yok.** Para kazanma modeli yok; ücretsiz kişisel proje |
| "%97'deyim, son numarayı bulamıyorum" | **Bulucu düğmesi** (sınırsız, ücretsiz): seçili renkte boyanmamış en yakın bölgeye kamera kayar ve bölge yanıp söner. Kartelada her rengin kalan bölge sayısı yazar |
| Hücreler çok küçük, ipucu gösterse bile görünmüyor | Şablon üretimi zaten **her bölgeye numara sığmasını garanti ediyor** (en küçük iç yarıçap kuralı). Bulucu bölgeyi okunabilir boyuta kadar yakınlaştırır |
| Boyarken başka numaraya atlıyor | Renk değişimi sadece kullanıcı seçince olur, otomatik atlama yok (isteğe bağlı ayar) |
| İnternet olmadan çalışmıyor | Tamamen çevrimdışı (service worker + IndexedDB) |
| Fotoğraf dönüştürmede beyaz alanlar soluk, arka plan bozuk | Palet, piksellerin gerçek ortalamasından çıkıyor; beyaz beyaz kalır. Arka planı sadeleştirme seçeneği (v2.2) |
| Kayıt ve yazdırma ücretli | Galeriye kaydetme, şablon indirme, yazdırma ücretsiz |

---

## 5. Bizi farklı kılacak şey

1. **Kendi fotoğrafın, gerçek şekillerle:** Kare ızgara yerine fotoğrafın hatlarını izleyen bölgeler. Eşinle bir fotoğrafın boyandıkça gerçekten size benziyor.
2. **İki oyun modu tek resimde:**
   - **Hızlı mod (parmak):** dokun-doldur, değnek, bulucu. Klasik oyun hissi.
   - **Sanat modu (Pencil):** taşmayan fırça. Pigment'teki "elle boyama" keyfi, ama taşma derdi olmadan.
3. **Reklamsız, ücretsiz, gizli:** Fotoğraf hiçbir sunucuya gitmez.

Bir cümleyle: *"Kendi fotoğraflarını, taşırmadan, reklamsız boya."*

---

## 6. Özellikler ve öncelikleri

**M** = şart, **S** = olmalı, **C** = olursa iyi, **W** = bu planda yok

### v2.0: Oyunlaşma (web)

| # | Özellik | Öncelik | Not |
|---|---|---|---|
| 1 | **Galerim:** birden fazla çalışma, kapak görseli, % ilerleme | M | IndexedDB'de çoklu kayıt |
| 2 | **Bölge tamamlanma takibi** ve üstte **% ilerleme** | M | Bkz. [Oyun kuralları](#7-oyun-kuralları) |
| 3 | **Seçili rengin bölgelerini vurgulama** (diğerleri soluklaşır) | M | Türün temel özelliği |
| 4 | **Kartelada ilerleme halkası, kalan bölge sayısı, bitince ✓** | M | |
| 5 | **Dokun-doldur** (doğru renkle tek dokunuşla bölge dolar) | M | Parmakla oynayanlar için |
| 6 | **Bulucu:** kalan en yakın bölgeye git, yanıp sönsün | M | En büyük şikâyetin çözümü |
| 7 | **Bitiş kutlaması** + **tekrar animasyonu** | M | Boyama kaydı oynatılır |
| 8 | **Telefon arayüzü** (dar ekran, alttan kayan kartela) | M | |
| 9 | **Çevrimdışı çalışma** (PWA, service worker) | M | Mağaza aşaması için de gerekli |
| 10 | **Numara gösterimi yakınlaşmaya göre** (uzaktayken gizle) | S | Uzaktan bakınca resim temiz görünür |
| 11 | **Sihirli değnek:** seçili renkteki komşu bölgeleri doldurur | S | |
| 12 | **Renk tamamlanınca otomatik sonraki renk** (ayarla kapatılabilir) | S | |
| 13 | Dokunsal geri bildirim (titreşim) ve hafif sesler | C | Web'de kısıtlı, mağazada tam |
| 14 | Ayarlar: sol el modu, ses, titreşim, numara boyutu | S | |

### v2.1: Paylaşma ve parlatma

| # | Özellik | Öncelik |
|---|---|---|
| 15 | **Tekrar videosunu MP4 / GIF olarak kaydet ve paylaş** | S |
| 16 | **Yazdırılabilir PDF şablonu** (A4, kartelalı) | S |
| 17 | **Serbest mod:** numarasız, istediğin renkle | S |
| 18 | **Fırça çeşitleri:** kuru boya, keçeli, sulu boya dokusu | C |
| 19 | Apple Pencil **basınç** ile fırça kalınlığı | C |

### v2.2: İçerik ve geri gelme sebebi

| # | Özellik | Öncelik |
|---|---|---|
| 20 | **Hazır resim kütüphanesi** (telif güvenli, bkz. Riskler) | S |
| 21 | **Günün resmi** | C |
| 22 | **Başarımlar / rozetler** ("ilk resmin", "10 resim", "1000 bölge") | C |
| 23 | Arka planı sadeleştirme (kişileri öne çıkar) | C |

### v3.0: Mağaza (Capacitor)

| # | Özellik | Öncelik |
|---|---|---|
| 24 | iOS + Android paketleri | M |
| 25 | Yerel fotoğraf seçici, galeriye kaydet, paylaş menüsü, titreşim | M |
| 26 | Mağaza görselleri, açıklama, gizlilik politikası | M |

### Kapsam dışı (W)

Reklam, abonelik, uygulama içi satın alma, hesap/giriş, bulut senkronu, sosyal akış. Hepsi gizlilik ve "ücretsiz" kararıyla çelişiyor veya sunucu gerektiriyor.

---

## 7. Oyun kuralları

| Kural | Karar |
|---|---|
| **Bölge ne zaman "bitti" sayılır?** | Dokun-doldur ile doğru renk verildiyse hemen. Fırça ile boyandıysa: bölgenin **en az %90'ı doğru renkle** boyanınca. Fırça bırakıldığında maskenin içinde sayılır |
| **Yanlış renk** | Dokun-doldur'da yanlış renkle dokunulursa bölge dolmaz, kısa bir sarsılma olur. Fırçada serbest, ama bölge "bitti" sayılmaz |
| **İlerleme yüzdesi** | Biten bölge sayısı / toplam bölge sayısı |
| **Renk tamamlandı** | O renkteki bütün bölgeler bitince kartelada ✓ |
| **Resim tamamlandı** | Bütün bölgeler bitince kutlama + tekrar animasyonu, galeride "bitti" rozeti |
| **İpucu / bulucu** | Sınırsız ve ücretsiz. Para yok, reklam yok |
| **Sihirli değnek** | Sınırsız; seçili renkteki, dokunulan bölgeye komşu aynı renk bölgeleri doldurur |

---

## 8. Ekran akışı

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Galerim    │────▶│ Fotoğraf seç │────▶│ Hazırlanıyor│────▶│   Boyama     │
│ (kapaklar,  │     │ + detay seç  │     │ (%, iptal)  │     │ (oyun ekranı)│
│  % ilerleme)│     └──────────────┘     └─────────────┘     └──────┬───────┘
└─────▲───────┘                                                    │ son bölge
      │                                                            ▼
      │                                                    ┌──────────────┐
      └──────────────── Galeriye dön ◀─────────────────────│  Tamamlandı  │
                                                           │ 🎉 + tekrar  │
                                                           │ kaydet/paylaş│
                                                           └──────────────┘
```

**Boyama ekranı yerleşimi:**

```
┌────────────────────────────────────────────┐
│ ‹  %37 ████████░░░░░░  ↶  ⚙               │  üst çubuk: geri, ilerleme, geri al, ayarlar
│                                            │
│              [ resim ]                     │  seçili rengin bölgeleri vurgulu
│                                            │
│                         🔍 bulucu  🪄 değnek │  sağ alt: yüzen araç düğmeleri
├────────────────────────────────────────────┤
│ ✓1  (2)  (3)  (4) …  ← kaydırılabilir      │  kartela: ilerleme halkası, kalan sayı
│ Mod: [Dokun] [Fırça]   Fırça ●──────       │  mod ve fırça boyutu
└────────────────────────────────────────────┘
```

---

## 9. Veri modeli

```ts
// Bir boyama çalışması (galerideki her kart)
Work {
  id: string               // rastgele kimlik
  title: string            // varsayılan: tarih
  createdAt, updatedAt: number
  detail: 'sade' | 'orta' | 'detayli'
  templateId: string
  progress: number         // 0..1, kapakta gösterilir
  completedAt?: number
  thumbnail: Blob          // küçük kapak görseli
}

// Şablon (bugünkü yapı + renk başına bölge listesi)
Template {
  id, width, height
  regionMap: Int32Array
  regions: Region[]        // color, label, bbox, area, neighbors[]
  palette: PaletteColor[]
  regionsByColor: number[][]
}

// Oyun durumu
Progress {
  workId: string
  done: Uint8Array         // bölge başına 0/1
  coverage: Float32Array   // fırça ile boyanan oran
  paint: Blob              // boya katmanı (PNG)
}

// Tekrar animasyonu için hamle kaydı
Move =
  | { t: number, kind: 'fill', region: number, color: number }
  | { t: number, kind: 'stroke', region: number, color: number, width: number, points: Float32Array }
  | { t: number, kind: 'undo' }
```

IndexedDB depoları: `works`, `templates`, `progress`, `moves`, `settings`.

---

## 10. Teknik mimari

**Kalanlar:** TypeScript, Vite, Canvas 2D, Web Worker, Vitest. Görüntü işleme (`src/islem/`) olduğu gibi kalır.

**Yeni yapı:**

```
src/
  islem/           görüntü işleme (bugünkü, saf TS, test edilebilir)
  oyun/            oyun kuralları: tamamlanma, ilerleme, bulucu, değnek (saf TS, test edilebilir)
  depo/            IndexedDB katmanı (works, templates, progress, moves)
  ekranlar/        galeri, yeni, hazırlanıyor, boyama, tamamlandı
  boyama/          tuval, fırça, dokun-doldur, vurgulama, kamera (yakınlaştırma)
  tekrar/          hamle kaydı ve oynatma
  platform/        web ↔ Capacitor farkları (fotoğraf seçme, kaydetme, titreşim) tek arayüzde
  durum.ts         küçük olay tabanlı durum yönetimi (kütüphanesiz)
  yonlendirme.ts   ekranlar arası geçiş (#/galeri, #/boya/:id)
```

**Kararlar ve gerekçeleri:**

| Karar | Gerekçe |
|---|---|
| Çerçeve (React vb.) **yok**, düz TS + küçük durum modülü | Ekran sayısı az; asıl iş tuvalde. Paket küçük kalır, Kaan her satırı anlar |
| `platform/` katmanı | Mağaza aşamasında sadece bu klasör değişir, oyun kodu değişmez |
| Vurgulama için **ayrı katman tuvali** | Seçili rengin maskesi bir kere üretilir, renk değişince yenilenir; her karede hesap yok |
| Numaralar **yakınlaşmaya göre** çizilir | Uzakta gizli, yakında görünür; büyük resimde performans |
| Service worker (vite-plugin-pwa) | Çevrimdışı çalışma; mağaza incelemesinde "web sitesi kılıfı" izlenimini azaltır |
| Tekrar videosu: `MediaRecorder` + tuval akışı | Tarayıcıda ek kütüphane olmadan WebM/MP4 |

**Performans bütçesi (iPad'de ölçülecek):**

| Ölçü | Hedef |
|---|---|
| Şablon üretimi (Detaylı, 1800 px) | < 8 sn |
| Fırça darbesi gecikmesi | < 1 kare (16 ms) |
| Galeri açılışı (20 çalışma) | < 1 sn |
| Bellek | < 400 MB |

---

## 11. Geliştirme hattı (pipeline)

### Dal ve PR akışı

```
main (her zaman yayında, çalışır durumda)
  └─ ozellik/galeri        → PR → inceleme → CI yeşil → birleştir → otomatik yayın
  └─ ozellik/ilerleme      → PR → …
```

- Her aşama **ayrı bir dal ve ayrı bir PR**. PR açıklamasında "ne öğrendim" notu olur (mülakatta anlatmak için).
- `main`'e doğrudan commit yok.
- Commit mesajları Türkçe, kısa ve "ne + neden" şeklinde.

### Otomatik kontroller (GitHub Actions)

| Adım | Ne zaman | Ne yapar |
|---|---|---|
| Tür denetimi (`tsc`) | Her push/PR | Tür hatası varsa kırmızı |
| Birim testleri (Vitest) | Her push/PR | `islem/`, `oyun/`, `depo/` |
| Uçtan uca testler (Playwright) | Her PR | Fotoğraf yükle → boya → %100 → galeri; iPad ve telefon boyutunda |
| Paket boyutu kontrolü | Her PR | Ana paket > 150 KB olursa uyar |
| Yayın (GitHub Pages) | `main`'e birleşince | Otomatik |
| Mağaza derlemesi (v3) | Etiket (`v3.*`) atılınca | Android `.aab`, iOS için Xcode arşivi |

### Sürümleme

- **Anlamsal sürüm:** `2.0.0`, `2.1.0`… Her aşama bitince etiket ve GitHub Release.
- `CHANGELOG.md`: her sürümde ne değişti, Türkçe.
- Kayıt formatı değişirse **göç (migration)** kodu: eski kayıtlar silinmeden yeni formata çevrilir. Kimsenin boyaması kaybolmaz.

### Her aşamanın "bitti" tanımı

1. Özellik çalışıyor ve PR birleşti.
2. Yeni kod için testler var ve CI yeşil.
3. **Gerçek cihazda denendi:** iPad (Pencil + parmak) ve bir telefon. Aşağıdaki kontrol listesi dolduruldu.
4. README / ekran görüntüleri güncel.

### Cihaz deneme listesi (her sürümde)

- [ ] iPad Safari: fotoğraf seç, 3 detay seviyesi
- [ ] Pencil ile fırça, parmakla dokun-doldur, avuç içi boya bırakmıyor
- [ ] İki parmakla yakınlaştırma, döndürme yok, kaydırma akıcı
- [ ] Uygulamayı kapat/aç → galeri ve ilerleme yerinde
- [ ] Uçak modunda açılıyor ve çalışıyor
- [ ] Telefon (dar ekran) düzeni
- [ ] Tamamlandı ekranı, tekrar animasyonu, kaydet/paylaş

---

## 12. Aşamalar

Süreler, Kaan'ın adım adım kendisinin yazacağı varsayımıyla kabaca tahmindir.

| Aşama | Kapsam | Çıktı | Tahmin |
|---|---|---|---|
| **A1. Altyapı** | Klasör yapısı, yönlendirme, durum modülü, IndexedDB katmanı ve eski kaydı göç ettirme, Playwright kurulumu | Davranış değişmeden yeni iskelet, testler yeşil | 1 gün |
| **A2. Galerim** | Çoklu çalışma, kapaklar, sil/yeniden adlandır | Galeri ekranı | 1 gün |
| **A3. Oyun çekirdeği** | Bölge tamamlanma, % ilerleme, kartela halkası/✓, dokun-doldur, yanlış renk tepkisi | Oynanabilir oyun | 1,5 gün |
| **A4. Yardımcılar** | Vurgulama, bulucu, sihirli değnek, yakınlaşmaya göre numaralar | "Son bölgeyi bulamıyorum" çözüldü | 1,5 gün |
| **A5. Ödül anı** | Hamle kaydı, tamamlandı ekranı, tekrar animasyonu | Kutlama + tekrar | 1 gün |
| **A6. Telefon + PWA** | Dar ekran düzeni, ayarlar, service worker, simge/açılış ekranı | **v2.0.0 yayında** | 1,5 gün |
| **A7. Paylaşma** | Tekrar videosu MP4/GIF, PDF şablon, serbest mod | **v2.1.0** | 1,5 gün |
| **A8. İçerik** | Hazır resim kütüphanesi (20–30 resim), günün resmi, rozetler | **v2.2.0** | 2 gün |
| **A9. Mağaza** | Capacitor, `platform/` yerel sürümleri, TestFlight, Play iç test, mağaza sayfaları | **v3.0.0 mağazada** | 3–4 gün + inceleme süresi |

```
A1 ─▶ A2 ─▶ A3 ─▶ A4 ─▶ A5 ─▶ A6 (v2.0) ─▶ A7 (v2.1) ─▶ A8 (v2.2) ─▶ A9 (v3.0 mağaza)
```

---

## 13. Mağaza aşaması

| Gerekli | Ayrıntı | Para |
|---|---|---|
| Apple Developer Program | Hesabı Kaan açar | **Yıllık 99 $** |
| Google Play Console | Hesabı Kaan açar | **Bir kerelik 25 $** |
| Gizlilik politikası sayfası | "Veri toplamıyoruz, fotoğraf cihazdan çıkmaz" (GitHub Pages'te) | Ücretsiz |
| Mağaza görselleri | iPhone, iPad ve Android boyutlarında ekran görüntüleri | Ücretsiz |
| Yaş derecelendirmesi | 4+ (kullanıcı içeriği yalnızca cihazda) | |
| Test | iOS: TestFlight · Android: iç test kanalı | |

**App Store'un 4.2 kuralı ("asgari işlevsellik") riski:** Apple, sadece bir web sitesini kılıfa sokan uygulamaları reddedebiliyor. Bizim önlemlerimiz:

- Tamamen çevrimdışı çalışıyor (web sitesi gibi davranmıyor).
- Yerel özellikler: fotoğraf seçici, galeriye kaydetme, paylaş menüsü, titreşim, Pencil.
- Asıl iş (görüntü işleme, boyama) cihazda yapılıyor; uygulama sunucuya bağlı değil.
- Reddedilirse Apple hangi kurala takıldığını yazar; düzeltip yeniden gönderilebilir.

---

## 14. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Hazır resim kütüphanesinde **telif** | Mağazadan kaldırılma | Sadece kendi ürettiğimiz veya açıkça serbest lisanslı (CC0) resimler; her resmin kaynağı `icerik/lisanslar.md` dosyasında |
| iPad Safari **bellek sınırı** (büyük tuvaller) | Çökme | Çalışma çözünürlüğü 1800 px'te sabit; geri al geçmişi sınırlı; galeride sadece küçük kapaklar |
| Eski kayıtların bozulması | Kullanıcı emeği kaybolur | Sürümlü kayıt formatı + göç testleri |
| Apple 4.2 reddi | Mağazaya çıkış gecikir | Bkz. Mağaza aşaması |
| Kapsamın büyümesi | Proje bitmez | Her aşama ayrı sürüm; v2.0 yayınlanmadan v2.1'e geçilmez |
| Tekrar videosu Safari'de desteklenmeyebilir | Özellik eksik kalır | Destek yoksa animasyonlu GIF'e düş; mağazada yerel kayıt |

---

## 15. İlk aşama

**A1. Altyapı**: kullanıcının gördüğü hiçbir şey değişmez, ama sonraki her aşama bunun üzerine kurulur.

Yapılacaklar:

1. `ozellik/altyapi` dalını aç.
2. Klasör yapısını [Teknik mimari](#10-teknik-mimari)'deki gibi düzenle; mevcut dosyaları taşı.
3. `durum.ts` (olay tabanlı küçük durum modülü) ve `yonlendirme.ts` (`#/galeri`, `#/yeni`, `#/boya/:id`).
4. `depo/`: `works`, `templates`, `progress` depoları; **sürüm 1 → 2 göçü** (bugünkü tek kayıt, galerideki ilk çalışma olur).
5. Playwright kurulumu ve ilk uçtan uca test: fotoğraf yükle → şablon oluşsun → boya → sayfayı yenile → boyama yerinde.
6. CI'ya Playwright adımını ekle.

Bitti sayılması için:

- Uygulama bugünkü gibi çalışıyor (gerilemesiz).
- Eski kayıt silinmeden yeni yapıya taşınıyor (testle doğrulanmış).
- Birim + uçtan uca testler CI'da yeşil.

---

## 16. Kaynaklar

- Happy Color, App Store: https://apps.apple.com/app/1407852246
- Pixel Art – Color by Number (Easybrain), App Store: https://apps.apple.com/app/1274972321
- Color by Number∘, App Store: https://apps.apple.com/us/app/id1326764484
- Paint Pixel – Color by Number, App Store: https://apps.apple.com/us/app/-/id6751739974
- Paint.ly, App Store: https://apps.apple.com/app/id1441501929
- Paint Me: Color By Number, App Store: https://apps.apple.com/us/app/id6473821129
- Pigment, App Store: https://apps.apple.com/app/id1062006344 · MacStories incelemesi: https://www.macstories.net/reviews/pigment-brings-adult-coloring-books-to-ipad-pro-with-apple-pencil-support/
- Fotoğraftan şablon: culur https://apps.apple.com/app/id1568546440 · Color by Number: Coloring Games https://apps.apple.com/us/app/id1317978215 · ColorCrafter https://mwm.ai/apps/colorcrafter-paint-by-numbers/6745644936 · Pixel Paint https://apps.apple.com/app/id6765738643 · Color Tree https://bestappsforkids.com/color-tree-coloring-book/
- Kullanıcı yorumları: https://justuseapp.com/en/app/1420058690/paint-by-number-coloring-games/reviews · https://grand-screen.com/apps/animal-color-coloring-games/reviews/ · https://grand-screen.com/games/halloween-color-by-number-game/reviews/
- App Store 4.2 ve web kılıfı uygulamalar: https://developer.apple.com/forums/thread/126359 · https://capgo.app/blog/how-to-pass-app-store-review-2026/ · https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper
