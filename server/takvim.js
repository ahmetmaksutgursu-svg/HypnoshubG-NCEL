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

     ACILIS         "2026-08-20T18:00"  → yarışmanın açılış anı
     GUN_SAATI      18                  → günün döndüğü saat (0-23)
     DONEM_GUN      7                   → bir dönem kaç gün
     DONEM_BASLARI  "2026-09-05T18:00"  → elle konmuş dönem başlangıçları
                                          (virgülle ayrılır; "belirsiz"
                                          yazılırsa yarışma durur)

   ------------------------------------------------------------
   ARA VERME

   Dönemler varsayılan olarak birbirini kesintisiz izliyor: biri
   bitince diğeri o anda başlıyor. Ama 1. dönem 27 Ağustos perşembe
   18.00'da bitiyor ve 2. dönemin 28 Ağustos CUMA 18.00'da başlaması
   istendi — arada 24 saatlik bir boşluk var.

   Bu yüzden dönem başlangıçları artık bir LİSTE. Listeye elle bir
   başlangıç yazıldığında, ondan önceki dönem bittiği anda ARA
   başlıyor: yarışma kapanıyor, puanlı oyunlar kilitleniyor ve geri
   sayım bir sonraki başlangıcı gösteriyor.

   Son elle başlangıçtan SONRASI kendiliğinden dönüyor — yani liste
   sonsuza kadar uzatılmak zorunda değil, yalnızca boşluk bırakılacak
   yerler yazılıyor.

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

/* Elle konmuş dönem başlangıçları. Açılış zaten 1. dönemin başı
   olduğu için listede yer almıyor; buraya yalnızca ÖNCESİNDE ara
   verilecek başlangıçlar yazılıyor. */
/* BELİRSİZ ARA — "ne zaman" cevabı olmayan ara.

   Normal ara bir tarihe kadar sürüyor. Ama yarışma, bitişi BİLİNMEYEN
   bir sebeple de durdurulabiliyor (reklamların onaylanmasını beklemek
   gibi). Öne uydurma bir tarih yazmak en kötüsü olurdu: o tarih gelip
   yarışma yine başlamazsa verilmiş söz tutulmamış olur.

   `DONEM_BASLARI=belirsiz` denince: içinde bulunulan dönem normal
   süresinde biter, sonrasında ara BAŞLAR ve BİTMEZ. Geri sayım yok,
   tarih yok; ekranda "yakında" yazıyor. Yeniden başlatmak için bu
   değişkene gerçek tarihi yazmak yetiyor — kod değişmiyor. */
let BELIRSIZ = false;

const ELLE_BASLAR = (() => {
  /* VARSAYILAN ARTIK "belirsiz" DEĞİL — 5 EYLÜL 2026, 18.00.

   Yarışma, reklam onayı beklenirken bitişi bilinmeyen bir araya
   alınmıştı ("belirsiz"). 5 Eylül 2026'da yeniden başlatılmasına
   karar verildi: tablo ve puanlı oyun hakları AYNI ANDA, 18.00'da
   açılıyor (bkz. server/board.js → ODUL).

   Tarih ortam değişkenine değil KODA yazıldı: Railway'de
   DONEM_BASLARI tanımlı değil, dolayısıyla canlıyı belirleyen şey
   bu varsayılan. Ortamda tanımlanırsa yine o kazanır.

   Saat SUNUCUNUN yerel saati; server.js TZ'yi Europe/Istanbul'a
   sabitliyor, yani 18.00 = Türkiye saati.

   5 Eylül'den sonrası kendiliğinden dönüyor: listede daha ileri bir
   başlangıç kalmadığı ve "belirsiz" yazmadığı için dönemler yedi
   günde bir kesintisiz yenileniyor (12 Eylül, 19 Eylül, …).
   Yarışmayı yeniden durdurmak için buraya "belirsiz" eklemek yeter. */
const ham = String(process.env.DONEM_BASLARI || "2026-09-05T18:00").trim();
  const cikan = [];
  for (const parca of ham.split(",")) {
    const t = parca.trim();
    if (!t) continue;
    if (/^(belirsiz|yakinda|yakında)$/i.test(t)) { BELIRSIZ = true; continue; }
    const d = new Date(t);
    if (isNaN(d)) { console.warn(`⚠️  DONEM_BASLARI okunamadı ("${t}") — atlandı.`); continue; }
    if (d.getTime() <= ACILIS.getTime()) {
      console.warn(`⚠️  Dönem başlangıcı açılıştan önce/aynı ("${t}") — atlandı.`);
      continue;
    }
    cikan.push(d);
  }
  return cikan.sort((a, b) => a - b);
})();

/* Bütün başlangıçlar, sırayla. İlki her zaman açılış. */
const BASLANGICLAR = [ACILIS, ...ELLE_BASLAR];

/* ---------- açılış ---------- */
/* "Açık" artık "açılış geçti" demek DEĞİL: ara verilen saatlerde de
   kapalıyız. Puanlı oyunlar bunu okuyor — ara sırasında oynanıp hiçbir
   döneme yazılmayan puan, oyuncu açısından kaybolmuş puan olurdu. */
const acikMi = (d = new Date()) => donemBasi(d) !== null;

/* SERBEST OYUN — "tablo kapalı" ile "oyunlar kapalı" AYRI ŞEYLER.

   Önce tek bayrak vardı: dönem kapalıysa oyunlar da oynanamıyordu.
   Bu, ara verilen her saatte sitenin ana içeriğini görünmez yapıyor —
   ziyaretçi de, Google incelemecisi de kilit ekranından başkasını
   görmüyor. Ölçüldü: AdSense sitenin kapalı olduğu pencerede inceledi
   ve "düşük değere sahip içerik" ile reddetti.

   Artık iki soru ayrı yanıtlanıyor:

     acikMi()         → puan HAFTAYA YAZILIYOR mu?  (tablo)
     oynanabilirMi()  → oyun OYNANABİLİR mi?        (içerik)

   Serbest modda oyun açık ama puan hiçbir haftaya yazılmıyor;
   board.js zaten kapalıyken addPoints() null döndürüyor, yani
   tabloyu kirletme riski yok. Kullanıcıya bunun SÖYLENMESİ şart —
   ön yüzde "puan yazılmıyor" uyarısı olmadan bu, insanı kandırmak olur.

   Günlük hak serbest modda da harcanıyor. Bilerek: harcanmasaydı,
   hafta açılmadan önce oynayıp Günün Kartı'nı ya da soruların
   cevabını öğrenen biri, açılış saatinde bilerek oynardı.

   SERBEST_OYUN=hayir ile kapatılabilir. */
const SERBEST = !/^(0|hayir|hayır|kapali|kapalı|false)$/i
  .test(String(process.env.SERBEST_OYUN || "").trim());

const oynanabilirMi = (d = new Date()) => acikMi(d) || SERBEST;

/* Serbest mod YALNIZCA tablo kapalıyken anlamlı; dönem açıkken
   puan zaten yazılıyor ve uyarı gösterilmemeli. */
const serbestMi = (d = new Date()) => SERBEST && !acikMi(d);

/* Bir sonraki dönem ne zaman başlıyor? Dönem açıkken null döner.
   Açılıştan önce açılışı, ara sırasında aranın bitişini verir —
   geri sayım tek bir yerden besleniyor. */
function sonrakiBasi(d = new Date()) {
  const t = d.getTime();
  if (donemBasi(d)) return null;
  return BASLANGICLAR.find((x) => x.getTime() > t) || null;
}

/* Ara mı, yoksa henüz hiç açılmadı mı? İkisi de "kapalı" ama
   ekrana yazılan cümle farklı. */
const aradaMi = (d = new Date()) =>
  d.getTime() >= ACILIS.getTime() && donemBasi(d) === null;

/* Kapalıysa bir sonraki başlangıca kalan süre (ms). Açıksa 0. */
const kalanMs = (d = new Date()) => {
  const s = sonrakiBasi(d);
  return s ? Math.max(0, s.getTime() - d.getTime()) : 0;
};

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
/* Hangi dönemin içindeyiz? Ara sırasında null.

   Yürüyen mantık: verilen ana kadar başlamış SON başlangıcı bul.
   Ondan sonra elle konmuş bir başlangıç varsa, o dönem bitince ARA
   başlar (kendiliğinden bir sonraki döneme geçilmez) — istenen boşluk
   tam olarak bu. Elle başlangıç kalmadıysa dönemler DONEM_GUN'de bir
   kendiliğinden döner. */
function donemBasi(d = new Date()) {
  const t = d.getTime();
  let bas = null, sonraki = null;
  for (const x of BASLANGICLAR) {
    if (x.getTime() <= t) bas = x;
    else { sonraki = x; break; }
  }
  if (!bas) return null;                         // açılıştan önce

  if (sonraki) {
    /* Sırada elle konmuş bir başlangıç var: bu dönem bitince ara. */
    const bit = new Date(bas); bit.setDate(bit.getDate() + DONEM_GUN);
    return t < bit.getTime() ? bas : null;
  }

  /* BELİRSİZ ara: son dönem bitince zincir DURUYOR, kendiliğinden yeni
     dönem açılmıyor. Bu bayrak olmasa 2. hafta kendiliğinden başlardı. */
  if (BELIRSIZ) {
    const bit = new Date(bas); bit.setDate(bit.getDate() + DONEM_GUN);
    return t < bit.getTime() ? bas : null;
  }

  /* Son elle başlangıçtan sonrası kendiliğinden dönüyor. */
  const gecen = t - bas.getTime();
  const donem = Math.floor(gecen / (DONEM_GUN * 864e5));
  const s = new Date(bas);
  s.setDate(s.getDate() + donem * DONEM_GUN);
  return s;
}

/* Kaçıncı dönem (1'den başlar). Ara sırasında null. */
function donemNo(d = new Date()) {
  const bas = donemBasi(d);
  if (!bas) return null;
  let no = 0;
  for (const x of BASLANGICLAR) {
    if (x.getTime() > bas.getTime()) break;
    no++;
  }
  /* Son elle başlangıçtan sonra kendiliğinden dönen dönemleri de say. */
  const son = BASLANGICLAR[BASLANGICLAR.length - 1];
  if (bas.getTime() > son.getTime())
    no += Math.round((bas.getTime() - son.getTime()) / (DONEM_GUN * 864e5));
  return no;
}

/* Bir dönem başlangıcının ÖNCEKİ dönem başlangıcı.

   Sabit "7 gün geri" ile bulunamıyor: ara verilince zincir kırılıyor.
   1. dönem 20 Ağustos'ta, 2. dönem 28 Ağustos'ta başlıyor — aralarında
   8 gün var. Yedi gün geri gidersek 21 Ağustos'a düşeriz ve öyle bir
   dönem hiç yaşanmadı; "geçen haftanın şampiyonları" boş çıkardı.

   Kural: elle konmuş bir başlangıçtan SONRA bir başlangıç daha varsa,
   o zincir tek dönemlik olur (bkz. donemBasi). Dolayısıyla:
     · dönem zincirin ortasındaysa → bir dilim geri
     · dönem zincirin BAŞIYSA      → bir önceki elle başlangıç */
function oncekiBasi(bas) {
  if (!bas) return null;
  const t = bas.getTime();
  let kok = null, onceki = null;
  for (const x of BASLANGICLAR) {
    if (x.getTime() < t) { onceki = kok; kok = x; }
    else if (x.getTime() === t) { onceki = kok; kok = x; }
    else break;
  }
  if (!kok) return null;
  if (t > kok.getTime()) {
    const d = new Date(bas); d.setDate(d.getDate() - DONEM_GUN);
    return d.getTime() >= kok.getTime() ? d : kok;
  }
  return onceki;                       // zincirin başı → önceki elle başlangıç
}

/* BU DÖNEMDEN SONRA ARA VAR MI — ve varsa ne zaman biter?

   Ara uyarısı yalnızca ara BAŞLADIKTAN sonra görünüyordu; bugün
   oynayan kimse yarın oyunların kilitleneceğini bilmiyordu. Önceden
   haber verebilmek için dönem sürerken de sorulabilmesi gerekiyor.

   Boşluk YOKSA (zincir kendiliğinden devam ediyorsa) null döner —
   yani 3. haftadan sonrası için hiçbir uyarı çıkmaz. */
function araGeliyor(d = new Date()) {
  const bas = donemBasi(d);
  if (!bas) return null;                       // zaten kapalıyız
  const bit = donemSonu(d);
  const sonraki = BASLANGICLAR.find((x) => x.getTime() > bas.getTime());
  if (!sonraki) {
    /* Belirsiz ara da ÖNCEDEN duyuruluyor — yalnızca tarihi yok. */
    if (BELIRSIZ)
      return { bitis: bit, basi: null, no: (donemNo(d) || 1) + 1, belirsiz: true,
               kalanMs: Math.max(0, bit.getTime() - d.getTime()) };
    return null;                               // elle başlangıç yok: kesintisiz
  }
  if (sonraki.getTime() <= bit.getTime()) return null;   // boşluk yok
  let no = 0;
  for (const x of BASLANGICLAR) { if (x.getTime() > sonraki.getTime()) break; no++; }
  return { bitis: bit, basi: sonraki, no: no || 2,
           kalanMs: Math.max(0, bit.getTime() - d.getTime()) };
}

/* Sıradaki dönemin numarası — ara ekranında "2. hafta" yazabilmek için. */
function sonrakiNo(d = new Date()) {
  const s = sonrakiBasi(d);
  /* Belirsiz arada TARİH yok ama NUMARA var: "2. hafta yakında"
     diyebilmek için sıradaki numara zincirin uzunluğundan geliyor. */
  if (!s) return (BELIRSIZ && aradaMi(d)) ? BASLANGICLAR.length + 1 : null;
  let no = 0;
  for (const x of BASLANGICLAR) {
    if (x.getTime() > s.getTime()) break;
    no++;
  }
  return no || 1;
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

/* KİLİT MESAJI — "ne zaman açılıyor" cümlesi.

   games.js ve quiz.js bu cümleyi SABİT yazıyordu: "20 Ağustos 18.00'da
   açılıyor". Ara verilince o cümle yanlış oluyor — oyuncu 28 Ağustos'u
   bekliyor ama ekranda 20 Ağustos yazıyor. Tarih artık takvimden.

   `ne` oyunun adı: "Puanlı oyunlar", "Tokmak Yarışması"… */
function kilitMesaji(ne = "Puanlı oyunlar") {
  const s = sonrakiBasi();
  if (!s) {
    if (BELIRSIZ && aradaMi())
      return `${sonrakiNo()}. hafta yakında başlayacaktır. ${ne} o ana kadar oynanamıyor.`;
    return `${ne} şu an açık.`;
  }
  const nezaman = s.toLocaleString("tr-TR",
    { day: "numeric", month: "long", weekday: "long", hour: "2-digit", minute: "2-digit" });
  return aradaMi()
    ? `${sonrakiNo()}. hafta ${nezaman}'da başlayacaktır. ${ne} o ana kadar oynanamıyor.`
    : `${ne} ${nezaman}'da açılıyor.`;
}

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
    /* Ara: açılış geçmiş ama şu an açık dönem yok. Ön yüz bunu
       "henüz başlamadı"dan ayırt edip farklı cümle yazıyor. */
    ara: aradaMi(d),
    /* Ara bitişi bilinmiyor mu? Ön yüz tarih yerine "yakında" yazıyor. */
    belirsiz: BELIRSIZ && aradaMi(d),
    sonrakiBasi: (() => { const s = sonrakiBasi(d); return s ? s.toISOString() : null; })(),
    donemNo: donemNo(d),
    sonrakiNo: sonrakiNo(d),
    /* Ön yüz artık kilidi `acik`e göre değil buna göre çiziyor:
       tablo kapalıyken de oyunlar açık olabiliyor. */
    oynanabilir: oynanabilirMi(d),
    serbest: serbestMi(d),
  };
}

function banner() {
  /* Saat dilimini de yazıyoruz: "18.00" hangi ülkenin 18.00'ı olduğu
     günlükten görülebilsin. Kap UTC ile açılırsa saatler üç saat kayar
     ve bu satır olmadan fark edilmesi zor (server.js en üstte sabitliyor). */
  const dilim = Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log(`    Saat dilimi: ${dilim} · sunucu saati ${new Date().toLocaleString("tr-TR")}`);
  const tr = (x) => x.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  const sure = () => {
    const s = Math.round(kalanMs() / 1000);
    const g = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return `${g} gün ${h} saat ${m} dk`;
  };
  if (acikMi()) {
    console.log(`🗓️  Yarışma AÇIK · ${donemNo()}. dönem · ` +
                `gün ${String(GUN_SAATI).padStart(2, "0")}.00'da dönüyor · ` +
                `${tr(donemBasi())} → ${tr(donemSonu())}`);
  } else if (aradaMi()) {
    if (BELIRSIZ)
      console.log(`🗓️  Yarışma DURDURULDU — ${sonrakiNo()}. dönem "yakında" (tarih yok).`);
    else
      console.log(`🗓️  Yarışma ARADA — ${sonrakiNo()}. dönem ${tr(sonrakiBasi())} ` +
                  `başlıyor (${sure()} kaldı).`);
    console.log(SERBEST
      ? `    Ara boyunca oyunlar SERBEST oynanıyor; puan hiçbir döneme yazılmıyor.`
      : `    Ara boyunca puanlı oyunlar kilitli; puan hiçbir döneme yazılmıyor.`);
  } else {
    console.log(`🗓️  Yarışma KAPALI — açılış ${tr(ACILIS)} (${sure()} kaldı).`);
    console.log(`    Puanlı oyunlar o ana kadar oynanamaz; puan tablosu da o an başlıyor.`);
  }
}

module.exports = {
  ACILIS, GUN_SAATI, DONEM_GUN, BASLANGICLAR,
  belirsizMi: () => BELIRSIZ,
  acikMi, oynanabilirMi, serbestMi, aradaMi, kalanMs, gunBasi, gunAnahtari, sifirlanmaAni,
  donemBasi, donemSonu, donemAnahtari, tarihAnahtari,
  sonrakiBasi, oncekiBasi, donemNo, sonrakiNo, kilitMesaji, araGeliyor,
  durum, banner,
};
