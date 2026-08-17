/* ============================================================
   ANLIK KULLANICI SAYACI  (yalnızca yönetici görür)
   ------------------------------------------------------------
   "Şu an sitede kaç kişi var?" sorusunun cevabı.

   GİZLİLİK KARARLARI — bunlar tesadüf değil, aydınlatma metninde
   verdiğimiz sözün gereği:

   · Hiçbir şey DİSKE YAZILMIYOR. Sayaç yalnızca bellekte durur;
     sunucu yeniden başlarsa sıfırlanır. Ziyaret geçmişi diye bir
     kayıt oluşmaz.
   · Ham IP adresi TUTULMUYOR. Ziyaretçiyi ayırt etmek için IP ve
     tarayıcı imzası, süreç başına üretilen rastgele bir tuzla
     karıştırılıp özetleniyor. Tuz diske yazılmadığı ve her açılışta
     değiştiği için bu özetten IP'ye geri dönmek mümkün değil —
     yeniden başlatınca eski özetler anlamsız hâle gelir.
   · Kayıt PENCERE kadar yaşıyor, sonra siliniyor. Kimin ne zaman
     geldiğine dair bir iz kalmıyor.

   Yani sayaç "kaç kişi" sorusunu cevaplıyor, "kim, ne zaman, nereden"
   sorusunu cevaplayamıyor. Bilerek böyle.
   ============================================================ */
const crypto = require("crypto");

/* Son bu kadar süre içinde istek atan "şu an sitede" sayılıyor.
   5 dakika: bir sayfayı okuyup öbürüne geçen biri arada kaybolmasın,
   ama çoktan gitmiş biri de saatlerce sayılmasın. */
const PENCERE = 5 * 60e3;
/* Sekmeyi açık bırakıp uzaklaşanı "aktif" saymamak için daha dar bir
   ikinci pencere: son 60 saniyede istek atan gerçekten ekranda. */
const AKTIF = 60e3;

/* Süreç başına rastgele. Diske yazılmıyor, yeniden başlayınca değişiyor. */
const TUZ = crypto.randomBytes(16);
const kimlik = (req) => {
  const ip = req.ip || req.socket?.remoteAddress || "?";
  const ua = req.headers["user-agent"] || "";
  return crypto.createHash("sha256").update(TUZ).update(ip).update(ua).digest("hex").slice(0, 16);
};

const gorulen = new Map();          // anahtar -> { at, uyeId, ad }

function temizle() {
  const simdi = Date.now();
  for (const [k, v] of gorulen) if (simdi - v.at > PENCERE) gorulen.delete(k);
}
/* Bellek sınırsız büyümesin: yarım saatte bir süpürülüyor.
   `unref` — bu zamanlayıcı yüzünden süreç açık kalmasın. */
setInterval(temizle, 30 * 60e3).unref();

/* Her istekte çağrılır. Oturum varsa üye, yoksa misafir sayılır. */
function isaretle(req, oturum) {
  /* Giriş yapmış kişiyi KULLANICI KİMLİĞİYLE sayıyoruz: aynı kişi
     telefondan ve bilgisayardan girdiyse iki değil bir kişidir. */
  const anahtar = oturum ? "u:" + oturum.user.id : "z:" + kimlik(req);
  gorulen.set(anahtar, {
    at: Date.now(),
    uyeId: oturum ? oturum.user.id : null,
    ad: oturum ? oturum.user.username : null,
  });
  if (gorulen.size > 5000) temizle();      // beklenmedik yük altında da sınırlı kal
}

function durum() {
  temizle();
  const simdi = Date.now();
  const kayit = [...gorulen.values()];
  const uyeler = kayit.filter((v) => v.uyeId)
    .sort((a, b) => b.at - a.at)
    .map((v) => ({ ad: v.ad, saniyeOnce: Math.round((simdi - v.at) / 1000) }));
  const misafir = kayit.filter((v) => !v.uyeId).length;
  return {
    toplam: kayit.length,
    uye: uyeler.length,
    misafir,
    /* "Şu anda ekranda" — son bir dakikada istek atanlar. Toplamdan
       farkı, sekmeyi açık bırakıp gidenleri ayırt etmesi. */
    aktif: kayit.filter((v) => simdi - v.at < AKTIF).length,
    uyeler: uyeler.slice(0, 50),
    pencereDk: Math.round(PENCERE / 60e3),
  };
}

module.exports = { isaretle, durum, PENCERE };
