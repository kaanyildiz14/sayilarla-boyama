// Service worker'ı kaydeder: uygulama bir kez açıldıktan sonra internetsiz de çalışır.
// Yalnızca derlenmiş sürümde; geliştirme sunucusunda önbellek kafa karıştırır.

export function cevrimdisiKur(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // kayıt başarısız olursa uygulama çevrimiçi çalışmaya devam eder
    });
  });
}
