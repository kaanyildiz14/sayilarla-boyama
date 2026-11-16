# Değişiklik günlüğü

## 2.0.0 (2026-11-17): Oyun

Uygulama, fotoğraftan şablon çıkaran bir araçtan telefonda ve tablette oynanan bir boyama oyununa dönüştü.

### Yeni
- **Galerim:** birden fazla resim, kapak görseli, ilerleme çubuğu, ad değiştirme, silme
- **Dokun-doldur:** bölgeye dokununca doğru renkle dolar; yanlış renkte hangi numara olduğunu söyler
- **İlerleme:** yüzde, kartelada ilerleme halkası ve kalan bölge sayısı, renk bitince ✓ ve sıradaki renge geçiş
- **Yardımcılar:** seçili rengin bölgelerini vurgulama, bulucu, sihirli değnek, yakınlaştıkça beliren numaralar
- **Ödül anı:** tamamlandı ekranı ve resmin nasıl boyandığını gösteren tekrar animasyonu
- **Telefon desteği:** tek satır araç çubuğu, menü, fırça çubuğu, dar ekran düzeni
- **Ayarlar:** renk bitince sıradakine geç, sol el modu, titreşim
- **Çevrimdışı:** bir kez açıldıktan sonra internet olmadan çalışır; ana ekrana eklenebilir

### Düzeltilen
- iPad Safari: arayüze iki parmak değince sayfanın tamamı büyüyordu
- iPad Safari: emoji simgeler soru işareti kutusu olarak çıkıyordu
- Safari: boyama kaydı başarısız oluyordu (IndexedDB'ye Blob yazılamıyor)
- Ekran yan çevrilince resim ekranın dışına kayıyordu

### Uyumluluk
- 1.0.0'daki kayıtlı boyama silinmez; galeride "İlk boyamam" olarak görünür.

## 1.0.0 (2026-11-10)

- Fotoğraftan numaralı boyama şablonu (16 / 24 / 32 renk)
- Taşmayan fırça, yakınlaştırma, geri al, otomatik kayıt, PNG olarak kaydetme
