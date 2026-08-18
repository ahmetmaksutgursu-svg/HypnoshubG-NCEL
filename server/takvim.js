/* ============================================================
   HYPNOSHUB — TAKVİM  🗓️
   ------------------------------------------------------------
   Sitedeki bütün zaman kuralları burada. İki şey söylüyor:

     1) YARIŞMA NE ZAMAN AÇILIYOR?
        20 Ağustos 2026, saat 18.00. O ana kadar puanlı oyunların
        hiçbiri oynanamaz ve puan tablosu başlamaz.

     2) GÜN NE ZAMAN DÖNÜYOR?
        Gece yarısı değil, 18.00'da. Yani günlük oyun hakları her
        gün 18.00'da sıfırlanıyor ve dönemler de 18.00'da değişiyor.

   ------------------------------------------------------------
   NEDEN AYRI BİR DOSYA

   Bu kurallar üç ayrı yerde ÜÇ AYRI KOPYA hâlinde duruyordu:
   games.js ve quiz.js kendi `dayKey()`/`resetAt()` fonksiyonlarını
   yazmıştı (ikisi de gece yarısına göre), board.js ise dönem
   başlangıcını kendi hesaplıyordu. Üçü aynı şeyi söylemek zorunda
   ama birbirlerini bilmiyorlardı — biri değişince diğerleri sessizce
   geride kalırdı. Örneğin "gün 18.00'da dönsün" isteğini üç yerde
   ayrı ayrı yapmak gerekirdi ve biri atlanınca oyun hakları gece
   yarısı, tablo 18.00'da sıfırlanırdı.

   Artık tek doğru burada; üç modül de buraya soruyor.

   ------------------------------------------------------------
   AYARLAR (ortam değişkeni ile taşınabilir, kod değişmez)

     ACILIS      "2026-08-20T18:00"  → yarışmanın açılış anı
     GUN_SAATI   18                  → günün döndüğü saat (0-23)
     DONEM_GUN   7                   → bir dönem kaç gün

   Saatler SUNUCUNUN yerel saatine göre. Tarayıcının saatine
   güvenilmiyor: yoksa saat dilimini değiştiren biri hakkını
   yeniden alırdı.
   ============================================================ */

const sayi = (v, varsayilan, alt, ust) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return varsayilan;
  return Math.min(ust, Math.max(alt, n));
};

const GUN_SAATI = sayi(process.env.GUN_SAATI, 18, 0, 23);
const DONEM_GUN = sayi(process.env.DONEM_GUN, 7, 1, 60);

/* Açılış anı. Ortamdan gelmezse 20 Ağustos 2026, 18.00 (yerel). */
const ACILIS = (() => {
  const ham = String(process.env.ACILIS || "").trim();
  if (ham) {
    const d = new Date(ham);
    if (!isNaN(d)) return d;
    console.warn(`⚠️  ACILIS okunamadı ("${ham}") — varsayılana dönülüyor.`);
  }
  return new Date(2026, 7, 20, GUN_SAATI, 0, 0, 0);
})();

/* ---------- açılış ---------- */
const acikMi = (d = new Date()) => d.getTime() >= ACILIS.getTime();
/* Açılışa kalan süre (ms). Açıldıysa 0. */
const kalanMs = (d = new Date()) => Math.max(0, ACILIS.getTime() - d.getTime());

/* ---------- gün ----------
   "Oyun günü" 18.00'da başlar. Saat 18.00'dan ÖNCEYSE hâlâ dünün
   günündeyiz: 21 Ağustos 09.00, "20 Ağustos" gününe aittir. */
function gunBasi(d = new Date()) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), GUN_SAATI, 0, 0, 0);
  if (d.getTime() < s.getTime()) s.setDate(s.getDate() - 1);
  return s;
}
/* Bir sonraki sıfırlama anı (ms) — arayüz geri sayımı buradan alıyor. */
function sifirlanmaAni(d = new Date()) {
  const s = gunBasi(d);
  s.setDate(s.getDate() + 1);
  return s.getTime();
}
const tarihAnahtari = (s) =>
  `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
/* Günlük hakların anahtarı. Gece yarısı değil 18.00'da değişiyor. */
const gunAnahtari = (d = new Date()) => tarihAnahtari(gunBasi(d));

/* ---------- dönem ----------
   Dönemler AÇILIŞ anından itibaren yedi günlük. Açılış 18.00 olduğu
   için dönem sınırları da 18.00'a düşüyor: 1. dönem 20 Ağustos 18.00
   → 27 Ağustos 18.00. Gece yarısına yuvarlasaydık ilan edilen aralık
   ile tablonun aralığı birbirini tutmazdı. */
function donemBasi(d = new Date()) {
  if (!acikMi(d)) return null;
  const gecen = d.getTime() - ACILIS.getTime();
  const donem = Math.floor(gecen / (DONEM_GUN * 864e5));
  const s = new Date(ACILIS);
  s.setDate(s.getDate() + donem * DONEM_GUN);
  return s;
}
function donemSonu(d = new Date()) {
  const s = donemBasi(d);
  if (!s) return null;
  const e = new Date(s);
  e.setDate(e.getDate() + DONEM_GUN);
  return e;
}
/* Dönem anahtarı = dönemin başlangıç tarihi. Yıl dönümlerinde
   "yılın kaçıncı haftası" belirsizleşiyor, tarih belirsizleşmiyor. */
const donemAnahtari = (d = new Date()) => {
  const s = donemBasi(d);
  return s ? tarihAnahtari(s) : null;
};

/* Arayüze ve uçlara verilen tek özet. */
function durum(d = new Date()) {
  const acik = acikMi(d);
  return {
    acik,
    acilis: ACILIS.toISOString(),
    acilisMs: kalanMs(d),
    gunSaati: GUN_SAATI,
    sifirlanma: sifirlanmaAni(d),
    donemGun: DONEM_GUN,
    donemBasi: acik ? donemBasi(d).toISOString() : null,
    donemSonu: acik ? donemSonu(d).toISOString() : null,
  };
}

function banner() {
  /* Saat dilimini de yazıyoruz: "18.00" hangi ülkenin 18.00'ı olduğu
     günlükten görülebilsin. Kap UTC ile açılırsa saatler üç saat kayar
     ve bu satır olmadan fark edilmesi zor (server.js en üstte sabitliyor). */
  const dilim = Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log(`    Saat dilimi: ${dilim} · sunucu saati ${new Date().toLocaleString("tr-TR")}`);
  const tr = (x) => x.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  if (acikMi()) {
    console.log(`🗓️  Yarışma AÇIK · gün ${String(GUN_SAATI).padStart(2, "0")}.00'da dönüyor · ` +
                `dönem ${tr(donemBasi())} → ${tr(donemSonu())}`);
  } else {
    const s = Math.round(kalanMs() / 1000);
    const g = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    console.log(`🗓️  Yarışma KAPALI — açılış ${tr(ACILIS)} (${g} gün ${h} saat ${m} dk kaldı).`);
    console.log(`    Puanlı oyunlar o ana kadar oynanamaz; puan tablosu da o an başlıyor.`);
  }
}

module.exports = {
  ACILIS, GUN_SAATI, DONEM_GUN,
  acikMi, kalanMs, gunBasi, gunAnahtari, sifirlanmaAni,
  donemBasi, donemSonu, donemAnahtari, tarihAnahtari,
  durum, banner,
};
