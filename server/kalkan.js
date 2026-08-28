/* ============================================================
   HYPNOSHUB — KALKAN  🛡️
   ------------------------------------------------------------
   Supercell anahtarını ve sunucuyu, çok fazla istekten koruyor.

   ------------------------------------------------------------
   NEDEN GEREKLİ — ÖLÇÜLDÜ

   `/api/player/:tag` HİÇ önbelleğe alınmıyordu. Aynı etiket için
   art arda dört istek atıldı, dördü de ~0,7 saniye sürdü: yani
   dördü de Supercell'e gitti. Var olmayan bir etiket (404) bile
   önbelleğe alınmıyordu — rastgele etiket üreten bir bot, her
   istekte bize bir yukarı akış çağrısı ödetiyordu.

   Daha kötüsü `/api/clan/:tag`: kulüp sayfası üyelerin her birini
   ayrı ayrı çözüyor, yani TEK bir kulüp isteği ~50 yukarı akış
   çağrısı demek. Onbellek 10 dakikalıktı ama her FARKLI kulüp
   etiketi yeniden 50 çağrı üretiyordu.

   Kısacası: sitede hiçbir sınır yoktu. Anahtarın kotasını
   tüketmek için özel bir araç bile gerekmiyordu.

   ------------------------------------------------------------
   ÜÇ KATMAN

   1) ÖNBELLEK  — aynı şeyi iki kez sormuyoruz.
      Bulunamayan etiketler de saklanıyor (negatif önbellek);
      rastgele etiket taraması artık bedava değil, ama BİZE de
      bir şeye mal olmuyor.

   2) ZİYARETÇİ SINIRI — IP başına, kayan pencerede PUAN.
      Her uç aynı maliyette değil: profil 1, kulüp 25 puan
      (ölçülmüş gerçek maliyetlere göre, aşağıya bak).
      Sınır "kaç istek" değil "ne kadar yük" sayıyor, çünkü
      asıl mesele istek sayısı değil yukarı akışa binen yük.
      Önbellekten dönen istekler puan YEMİYOR.

   3) GENEL BÜTÇE — dakikada toplam yukarı akış çağrısı tavanı.
      Bu, botnet'e karşı son savunma: saldırı yüz ayrı IP'den
      gelse bile anahtar bu tavanın üstüne çıkamaz. Tavan
      dolduğunda yukarı akışa hiç gidilmiyor.

   ------------------------------------------------------------
   DÜRÜSTLÜK NOTU

   Supercell'in yayımlanmış kesin bir istek tavanı DOĞRULANAMADI;
   API aşırı istekte 429 döndürüyor (sunucu bunu zaten yeniden
   deniyor, bkz. crRetry). Buradaki GENEL_TAVAN bizim seçtiğimiz
   GÜVENLİK tavanıdır, Supercell'in ilan ettiği bir sayı değil.
   Ortam değişkeniyle değiştirilebiliyor.

   ------------------------------------------------------------
   AYARLAR

     KALKAN_PENCERE    600   → ziyaretçi penceresi (saniye)
     KALKAN_PUAN       120   → pencere başına IP puanı
     KALKAN_ANI        25    → 10 saniyelik ani yükseliş tavanı
     KALKAN_TAVAN     1500   → dakikada toplam yukarı akış çağrısı
     KALKAN_KAPALI     ""    → "1" ise kalkan devre dışı (acil durum)
   ============================================================ */

const { gercekIp } = require("./gercekip");

const sayi = (v, varsayilan, alt, ust) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return varsayilan;
  return Math.min(ust, Math.max(alt, n));
};

const PENCERE   = sayi(process.env.KALKAN_PENCERE, 600, 10, 86400) * 1000;
const PUAN      = sayi(process.env.KALKAN_PUAN, 120, 1, 100000);
const ANI_SURE  = 10_000;
const ANI       = sayi(process.env.KALKAN_ANI, 25, 1, 100000);
/* TAVAN NEDEN 1500 — ölçülmüş bir sayıya dayanıyor.

   İlk denemede 600 seçilmişti. Ölçüm bunun ÇOK DÜŞÜK olduğunu
   gösterdi: sunucu açılırken tabloları ve meta veriyi ısıtıyor ve
   ilk yarım dakikada 595 çağrı/dk tepe yapıyor. Yani her dağıtımda
   sunucu kendi bütçesini neredeyse tüketiyor, o sırada gelen
   ziyaretçi 429 yiyordu.

   Boştayken sayaç 0'a düşüyor — sürekli bir yük yok, yalnızca
   açılış tepesi var.

   1500, bilinen-iyi davranışın (~600) iki katından fazlası; yani
   normal işleyişi hiç kısıtlamıyor ama sınırsız bir saldırıyı
   (dakikada on binlerce çağrı olabilirdi) kesiyor. Supercell'in
   ilan ettiği bir sayı DEĞİL — bizim güvenlik tavanımız. */
const GENEL_TAVAN = sayi(process.env.KALKAN_TAVAN, 1500, 1, 1000000);

/* ---------- GENEL İSTEK SINIRI ----------
   Yukarıdaki bütçe YUKARI AKIŞ maliyetini sayıyor: yalnızca Supercell'e
   çağrı doğuran uçlar (MALIYET listesi) puan yiyor. Önbellekten dönen
   uçlar bilerek bedava bırakılmıştı — CPU açısından ucuzlar.

   AMA "ucuz" sınırsız demek değil. Ölçüldü (canlı, 2026-08-28):
   /api/cards ucuna arka arkaya 40 istek atıldı, 40'ı da 200 döndü;
   aynı anda /api/clan/ 40 istekten 38'ini 429 ile kesti. Yani korunan
   uçlar sağlamdı, önbellekli uçlarda hiçbir tavan yoktu. /api/cards
   yanıtı 64 KB: dakikada birkaç bin istek, veri sızdırmasa da bant
   genişliği ve yanıt üretme yükü demek.

   Bu yüzden İKİNCİ ve BAĞIMSIZ bir bütçe var: ham istek sayısı. Maliyet
   bütçesinden ayrı tutuluyor çünkü ölçtükleri şey farklı — biri
   Supercell kotasını, bu ise sunucunun kendi kapasitesini koruyor.

   Sayılar BİLEREK cömert: sınır, gerçek kullanıcıyı değil betiği
   durdurmak için. Bir sayfa açılışı 10-20 uç çağırıyor ve ortak IP
   arkasında (okul, kurum, mobil operatör CGNAT) onlarca kişi
   olabiliyor. 600/dk ~20 kişilik bir NAT'ı bile rahat taşır; saniyede
   yüzlerce istek atan bir betik ise ilk saniyelerde duvara çarpar. */
const GENEL_PENCERE = sayi(process.env.KALKAN_GENEL_PENCERE, 60, 5, 3600) * 1000;
const GENEL_ISTEK   = sayi(process.env.KALKAN_GENEL_ISTEK, 600, 10, 1000000);
const GENEL_ANI     = sayi(process.env.KALKAN_GENEL_ANI, 100, 5, 1000000);
const GENEL_ANI_SURE = 5000;
const KAPALI    = String(process.env.KALKAN_KAPALI || "") === "1";

/* ---------- uç maliyetleri ----------
   Sayılar YUKARI AKIŞ ÇAĞRISI cinsinden ve ÖLÇÜLDÜ (yerel sunucu,
   sağlık ucundaki sayaç farkı):

     tek profil        →  1 çağrı  (469 ms)
     tek kulüp sayfası → 51 çağrı  (5.216 ms)
     aynı kulüp 2. kez →  0 çağrı  (2 ms, önbellek)

   Kulüp önce 10 puan sayılıyordu; ölçüm bunun gerçeğin beşte biri
   olduğunu gösterdi. 25'e çıkarıldı: bir ziyaretçi on dakikada
   dört kulüp sayfası açabiliyor (~204 çağrı), gerçek maliyetin
   yarısı sayılmış oluyor ama gezinme de tıkanmıyor.

   ÖNBELLEKTEN dönen kulüp/profil PUAN YEMİYOR (bkz. bedava),
   yani aynı sayfalar arasında gidip gelmek bedava. */
const MALIYET = [
  [/^\/api\/clan\//, 25, "kulüp"],
  [/^\/api\/clans\/search/, 3, "kulüp arama"],
  [/^\/api\/players\/search/, 2, "oyuncu arama"],
  [/^\/api\/player\/[^/]+\/battlelog/, 1, "savaş günlüğü"],
  [/^\/api\/player\//, 1, "profil"],
  [/^\/api\/oneri\//, 2, "deste önerisi"],
];

function maliyet(yol) {
  for (const [kalip, p, ad] of MALIYET) if (kalip.test(yol)) return { puan: p, ad };
  return null;                                  // korunan uç değil
}

/* ---------- ziyaretçi sayacı ----------
   Kayan pencere: pencereden düşen kayıtlar okuma sırasında
   siliniyor, ayrı bir temizlik zamanlayıcısı yok. */
const kayitlar = new Map();                     // ip -> [{t, p}]
/* Ham istek sayacı — maliyet sayacından AYRI harita. Aynı haritayı
   paylaşsalardı önbellekten dönen istek `bedava` ile geri alınırken
   ham sayaçtan da düşerdi; oysa istek gerçekten yapıldı. */
const istekKayit = new Map();                   // ip -> [zaman damgaları]

/* Ham istek bütçesi. `true` dönerse istek geçer. */
function istekHarca(ip) {
  const simdi = Date.now();
  const liste = (istekKayit.get(ip) || []).filter((t) => simdi - t < GENEL_PENCERE);
  const ani = liste.filter((t) => simdi - t < GENEL_ANI_SURE).length;
  if (ani >= GENEL_ANI) {
    istekKayit.set(ip, liste);
    return { tamam: false, sebep: "ani", bekle: Math.ceil(GENEL_ANI_SURE / 1000) };
  }
  if (liste.length >= GENEL_ISTEK) {
    istekKayit.set(ip, liste);
    /* En eski kayıt pencereden düşünce yer açılıyor; bekleme süresi o. */
    const bekle = Math.ceil((GENEL_PENCERE - (simdi - liste[0])) / 1000);
    return { tamam: false, sebep: "pencere", bekle: Math.max(1, bekle) };
  }
  liste.push(simdi);
  istekKayit.set(ip, liste);
  return { tamam: true };
}

/* ---------- HARİTA TEMİZLİĞİ ----------
   İki harita da yalnızca OKUNURKEN kendi IP'sini süzüyordu; bir daha
   hiç istek atmayan IP'nin kaydı sonsuza kadar kalıyordu. Normal
   trafikte fark etmez ama IP değiştirerek istek atan biri haritayı
   sınırsız büyütebilirdi — korumanın kendisi bellek sızıntısına
   dönüşürdü. Beş dakikada bir ölü kayıtlar siliniyor. */
let temizlikZaman = null;
function temizle() {
  const simdi = Date.now();
  for (const [ip, liste] of kayitlar) {
    const kalan = liste.filter((x) => simdi - x.t < PENCERE);
    if (kalan.length) kayitlar.set(ip, kalan); else kayitlar.delete(ip);
  }
  for (const [ip, liste] of istekKayit) {
    const kalan = liste.filter((t) => simdi - t < GENEL_PENCERE);
    if (kalan.length) istekKayit.set(ip, kalan); else istekKayit.delete(ip);
  }
}
if (!KAPALI) {
  temizlikZaman = setInterval(temizle, 5 * 60e3);
  /* Süreç kapanışını bu zamanlayıcı geciktirmesin. */
  if (temizlikZaman.unref) temizlikZaman.unref();
}

function harca(ip, puan) {
  const simdi = Date.now();
  const liste = (kayitlar.get(ip) || []).filter((x) => simdi - x.t < PENCERE);
  const toplam = liste.reduce((a, x) => a + x.p, 0);
  const aniToplam = liste.filter((x) => simdi - x.t < ANI_SURE).reduce((a, x) => a + x.p, 0);

  if (toplam + puan > PUAN) {
    kayitlar.set(ip, liste);
    const enEski = liste.length ? liste[0].t : simdi;
    return { tamam: false, sebep: "pencere", bekle: Math.ceil((PENCERE - (simdi - enEski)) / 1000) };
  }
  if (aniToplam + puan > ANI) {
    kayitlar.set(ip, liste);
    return { tamam: false, sebep: "ani", bekle: Math.ceil(ANI_SURE / 1000) };
  }
  liste.push({ t: simdi, p: puan });
  kayitlar.set(ip, liste);
  return { tamam: true, kalan: PUAN - (toplam + puan) };
}

/* Sayaç sonsuza kadar büyümesin: pencere geçmiş IP'leri arada bir at. */
setInterval(() => {
  const simdi = Date.now();
  for (const [ip, liste] of kayitlar) {
    const kalan = liste.filter((x) => simdi - x.t < PENCERE);
    if (kalan.length) kayitlar.set(ip, kalan);
    else kayitlar.delete(ip);
  }
}, 60_000).unref?.();

/* ---------- genel bütçe ----------
   Son 60 saniyedeki YUKARI AKIŞ çağrılarını sayıyoruz. Bu sayı
   ziyaretçi sayısından bağımsız: kulüp sayfası tek ziyaretçiden
   gelse bile 50 çağrı olarak görünüyor, çünkü gerçekten öyle. */
let damga = [];                                  // son çağrıların zaman damgaları
let engellenen = 0;                              // bütçe dolduğu için gitmeyen çağrı

function butceMusait() {
  const simdi = Date.now();
  damga = damga.filter((t) => simdi - t < 60_000);
  return damga.length < GENEL_TAVAN;
}
function butceDus() { damga.push(Date.now()); }

/* `cr()` sarmalayıcısı. Her gerçek yukarı akış çağrısı buradan
   geçiyor — kulüp sayfasının içindeki 50 çağrı dâhil. */
function olc(crHam) {
  return async function cr(path) {
    if (!KAPALI && !butceMusait()) {
      engellenen++;
      if (engellenen === 1 || engellenen % 100 === 0)
        console.warn(`🛡️  Genel bütçe doldu (${GENEL_TAVAN}/dk) — ` +
                     `${engellenen} çağrı yukarı akışa gönderilmedi.`);
      /* 429: çağıran taraf bunu zaten "üst akış bizi kısıtladı"
         diye ele alıyor. Yeni bir hata yolu açmıyoruz. */
      return { status: 429, body: { error: "butce", message: "Sunucu şu an çok yoğun." } };
    }
    butceDus();
    return crHam(path);
  };
}

/* ---------- ara katman ----------
   Korunan uçların ÖNÜNE giriyor. Önbellekten dönecek istekler de
   buradan geçiyor; onları bedava saymak için uç kendi içinde
   `bedava(req)` çağırıyor (aşağıda). */
function katman(req, res, next) {
  if (KAPALI) return next();

  /* ÖNCE ham istek bütçesi: bu, MALIYET listesinde olsun olmasın BÜTÜN
     /api uçlarını kapsıyor. Maliyet kontrolünden önce duruyor çünkü
     tıkanmayı en ucuz yerde kesmek gerekiyor.

     YALNIZCA /api. Bu ara katman yol verilmeden takılı (server.js:
     `app.use(kalkan.katman)`) ve express.static ONDAN SONRA geliyor
     (server.js:3716) — yani CSS, JS, kart görselleri, logolar da
     buradan geçiyor. Guard olmasaydı tek bir sayfa açılışı onlarca
     görsel isteğiyle ani tavanı doldurur, korumanın kendisi siteyi
     kullanılmaz hâle getirirdi. Statik dosyalar sunucuya yük bindiren
     şey değil; sınır API'ye ait. */
  if (!req.path.startsWith("/api/")) return next();

  const ipHam = gercekIp(req);
  const genel = istekHarca(ipHam);
  if (!genel.tamam) {
    res.set("Retry-After", String(genel.bekle));
    return res.status(429).json({
      error: "cok_istek",
      message: genel.sebep === "ani"
        ? "Çok hızlı istek gönderiyorsun. Birkaç saniye bekleyip tekrar dene."
        : "Kısa sürede çok fazla istek yaptın. Biraz sonra tekrar dene.",
      bekleSaniye: genel.bekle,
    });
  }

  const m = maliyet(req.path);
  if (!m) return next();

  const ip = gercekIp(req);
  const sonuc = harca(ip, m.puan);
  if (sonuc.tamam) {
    req._kalkan = { ip, puan: m.puan };
    return next();
  }

  res.set("Retry-After", String(Math.max(1, sonuc.bekle)));
  return res.status(429).json({
    error: "cok_istek",
    message: sonuc.sebep === "ani"
      ? "Çok hızlı istek gönderiyorsun. Birkaç saniye bekleyip tekrar dene."
      : "Kısa sürede çok fazla sorgu yaptın. Biraz sonra tekrar dene.",
    bekleSaniye: Math.max(1, sonuc.bekle),
  });
}

/* Önbellekten karşılanan istekten puanı GERİ VER. Böylece aynı
   profili tekrar tekrar açan kişi cezalandırılmıyor; sınır yalnızca
   gerçekten yukarı akışa yük bindiren isteklere işliyor. */
function bedava(req) {
  const k = req && req._kalkan;
  if (!k) return;
  const liste = kayitlar.get(k.ip);
  if (!liste || !liste.length) return;
  /* En son eklenen kaydı geri al — bu isteğin kaydı o. */
  for (let i = liste.length - 1; i >= 0; i--) {
    if (liste[i].p === k.puan) { liste.splice(i, 1); break; }
  }
  req._kalkan = null;
}

/* ---------- durum ----------
   /api/health ve yönetim ekranı okuyabilsin diye. */
function durum() {
  const simdi = Date.now();
  damga = damga.filter((t) => simdi - t < 60_000);
  return {
    acik: !KAPALI,
    dakikalikCagri: damga.length,
    genelTavan: GENEL_TAVAN,
    /* Ham istek bütçesi — önbellekli uçlar dâhil her /api çağrısı. */
    genelIstek: GENEL_ISTEK,
    genelPencereSaniye: Math.round(GENEL_PENCERE / 1000),
    genelAni: GENEL_ANI,
    izlenenIstekIp: istekKayit.size,
    engellenenCagri: engellenen,
    izlenenZiyaretci: kayitlar.size,
    pencereSaniye: PENCERE / 1000,
    pencerePuani: PUAN,
    aniTavan: ANI,
  };
}

function banner() {
  if (KAPALI) { console.log("🛡️  Kalkan KAPALI (KALKAN_KAPALI=1) — sınır uygulanmıyor."); return; }
  console.log(`🛡️  Kalkan açık · ziyaretçi ${PUAN} puan/${PENCERE / 1000}sn ` +
              `(ani ${ANI}/10sn) · genel tavan ${GENEL_TAVAN} çağrı/dk`);
  console.log(`    Ham istek sınırı: IP başına ${GENEL_ISTEK}/${Math.round(GENEL_PENCERE / 1000)}sn ` +
              `(ani ${GENEL_ANI}/${GENEL_ANI_SURE / 1000}sn) — önbellekli uçlar dâhil TÜM /api.`);
}

module.exports = { katman, olc, bedava, durum, banner, maliyet, MALIYET };
