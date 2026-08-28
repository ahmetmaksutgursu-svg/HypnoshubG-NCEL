/* ============================================================
   HYPNOSHUB — ZİYARETÇİNİN GERÇEK ADRESİ
   ------------------------------------------------------------
   Hız sınırları, bot yasakları ve "şu an sitede" sayacı ziyaretçiyi
   IP'siyle ayırt ediyor. Yanlış okunursa hiçbir hata çıkmaz — site
   çalışmaya devam eder, ama bütün ziyaretçiler tek kişi gibi
   görünür: sınırlar herkesi keser, yasaklar masumu vurur. Yayın
   gününde tam bu yaşandı.

   ÖLÇÜM (Cloudflare açıldıktan sonra, canlıda): zincir şöyle geliyor

     [0] özel ağ     — Railway'in iç vekili
     [1] genel       — Railway kenarı
     [2] cloudflare  — Cloudflare kenarı
     CF-Connecting-IP — GERÇEK ZİYARETÇİ, zincirde HİÇ YOK

   Yani Express'in `trust proxy` ayarı bu adresi hangi sayıya
   ayarlanırsa ayarlansın bulamıyor: X-Forwarded-For zincirinde
   ziyaretçi yok. Önce 2 denendi, ölçüm "YANLIS" dedi ve zincirin
   hangi sırasında ne olduğu tek tek çıkarıldı.

   ÇÖZÜM: Cloudflare gerçek ziyaretçiyi `CF-Connecting-IP` başlığında
   bildiriyor; istek Cloudflare'den geldiyse onu kullanıyoruz.
   Gelmediyse (yerel geliştirme, doğrudan Railway) `req.ip` zaten
   doğru.

   BU SINIR ARTIK KAPALI — nasıl kapandığı aşağıda.

   Eskiden burada "bilerek kabul edilen sınır" yazıyordu: kaynak sunucu
   doğrudan da erişilebilir olduğu için Cloudflare'i atlayıp gelen biri
   bu başlığı uydurabilirdi. ÖLÇÜLDÜ ve gerçekten sömürülebilirdi:
   başlığa her seferinde başka bir adres yazarak 150 isteğin 150'si
   IP sınırından geçti (gerçek sınır 15 dakikada 120). Yani hesap açma
   ve giriş için koyduğumuz bütün IP sınırları tek satırlık bir başlıkla
   etkisizdi.

   ÇÖZÜM — paylaşılan gizli başlık. Cloudflare her isteğe X-HS-KAYNAK
   başlığını ekliyor (Transform Rule); sunucu bu başlığı doğrulamadan
   CF-Connecting-IP'ye GÜVENMİYOR. Doğrudan kaynağa bağlanan biri gizli
   değeri bilemediği için başlığı uyduramıyor.

   Neden IP aralığı kontrolü değil: ziyaretçi adresi zincirde hiç yok
   (yukarıdaki ölçüm), zincirin hangi basamağının sahtelenemeyeceği ise
   Railway'in kaç vekil eklediğine bağlı. Bir kez yanlış tahmin edildi
   (TRUST_PROXY=2) ve yayında bir saat bozuk kaldı. Paylaşılan gizli
   değer bu belirsizliklerin hiçbirine bağlı değil.

   ANAHTAR KURULMAMIŞSA eski davranış sürüyor. Bu bilerek: önce sunucu
   anahtarı zorunlu kılsaydı, Cloudflare kuralı yayına alınana kadar
   BÜTÜN ziyaretçiler tek adres görünür ve sınırlar herkesi keserdi —
   yayın gününde yaşanan hatanın aynısı. Doğru sıra: önce Cloudflare
   kuralı, sonra ORIGIN_ANAHTAR.
   ============================================================ */

/* Cloudflare'in IPv4 aralıkları (kaba önek eşlemesi — tanı amaçlı,
   güvenlik kararı buna dayanmıyor). */
const CF_ARALIK = /^(104\.1[6-9]|104\.2[0-7]|172\.6[4-9]|172\.7[01]|162\.15[89]|108\.162|188\.114|141\.101|103\.2[123]|131\.0\.72|173\.245|190\.93|197\.234|198\.41)/;

const crypto = require("crypto");
const sade = (x) => String(x || "").replace(/^::ffff:/, "").trim();

/* Cloudflare Transform Rule ile eklenen gizli değer. Boşsa doğrulama
   yapılmaz (bkz. başlıktaki "ANAHTAR KURULMAMIŞSA"). */
const ORIGIN_ANAHTAR = String(process.env.ORIGIN_ANAHTAR || "").trim();
const BASLIK = "x-hs-kaynak";

/* Sabit süreli karşılaştırma: değerin doğruluğu cevap süresinden
   anlaşılmasın. Uzunluk farklıysa zaten yanlış, erken çıkılıyor —
   timingSafeEqual eşit uzunluk istiyor. */
function anahtarDogru(req) {
  const gelen = Buffer.from(String((req.headers && req.headers[BASLIK]) || ""), "utf8");
  const dogru = Buffer.from(ORIGIN_ANAHTAR, "utf8");
  if (gelen.length !== dogru.length) return false;
  return crypto.timingSafeEqual(gelen, dogru);
}

/* İstek gerçekten Cloudflare üzerinden mi geldi?
   Anahtar kuruluysa TEK ölçüt gizli başlık; kurulu değilse eski
   davranış (yalnızca CF-Connecting-IP'nin varlığı). */
function cloudflaredenMi(req) {
  if (!req || !req.headers || !req.headers["cf-connecting-ip"]) return false;
  if (!ORIGIN_ANAHTAR) return true;
  return anahtarDogru(req);
}

/* Doğrulanmamış isteklerin ORTAK adresi. Gerçek bir IP değil; sayaçlar
   için tek bir kimlik. */
const DOGRUDAN = "dogrudan-kaynak";

function gercekIp(req) {
  if (!req) return "?";
  /* CF-Connecting-IP YALNIZCA doğrulanmış istekte okunuyor. */
  if (cloudflaredenMi(req)) {
    const cf = sade(req.headers["cf-connecting-ip"]);
    if (cf) return cf;
  }

  /* ANAHTAR KURULUYKEN Cloudflare'den gelmeyen istek — yani doğrudan
     kaynağa bağlanan biri.

     Burada req.ip'e DÜŞMÜYORUZ ve sebebi ölçüldü: o yolda req.ip her
     istekte DEĞİŞİYOR (Railway kenar adresi zincirde sabit değil).
     Sahte başlık reddedildikten sonra bile 135 istek üst üste geçti,
     çünkü her biri kendi sayacını açıyordu. Yani req.ip orada bir kimlik
     değil, gürültü.

     Çözüm: doğrulanmamış her isteği TEK kovaya koymak. Meşru ziyaretçi
     zaten Cloudflare'den geliyor ve etkilenmiyor; doğrudan gelen herkes
     tek bir kimlik gibi sayılıyor, dolayısıyla sınırsız sayaç üretmek
     mümkün olmuyor.

     403 ile büsbütün reddetmek de olurdu ama Cloudflare bir gün araya
     giremezse site tümden kapanırdı. Bu hâlde en kötü ihtimalle
     doğrudan gelenler ortak sınırı paylaşır — site ayakta kalır. */
  if (ORIGIN_ANAHTAR) return DOGRUDAN;

  return sade(req.ip) || sade(req.socket && req.socket.remoteAddress) || "?";
}

/* Yönetim ekranı "koruma açık mı" diye sorabilsin diye dışarı veriliyor;
   anahtarın KENDİSİ hiçbir yerde yayımlanmıyor. */
const korumaAcik = () => !!ORIGIN_ANAHTAR;

module.exports = { gercekIp, cloudflaredenMi, korumaAcik, CF_ARALIK };
