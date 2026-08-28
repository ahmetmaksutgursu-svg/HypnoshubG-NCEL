/* ============================================================
   HYPNOSHUB — kayıt / giriş
   ------------------------------------------------------------
   Kendi kendine yeten bir hesap katmanı: harici bir bağımlılık
   yok, Node'un kendi `crypto` modülü yetiyor.

   Güvenlik kararları ve nedenleri:

   · Şifreler ASLA saklanmaz. Kullanıcı başına 16 baytlık rastgele
     bir tuz üretilir ve şifre scrypt ile 64 baytlık bir anahtara
     dönüştürülür. scrypt bellek-zor bir algoritmadır; SHA-256
     gibi hızlı özetlerin aksine GPU ile toplu kırmayı pahalı
     kılar.
   · Karşılaştırma `timingSafeEqual` ile yapılır. Normal `===`
     ilk farklı bayta kadar geçen süreyi sızdırır ve bu, doğru
     özeti bayt bayt tahmin etmeye yarayabilir.
   · Oturum çerezi HttpOnly'dir, yani sayfadaki JavaScript onu
     okuyamaz. Bir XSS açığı bile oturumu doğrudan çalamaz.
     SameSite=Lax, başka sitelerden gelen isteklerde çerezin
     gönderilmemesini sağlar (CSRF).
   · Girişte hız sınırı var. Aksi hâlde şifre denemesi ücretsiz
     olurdu.
   · Kullanıcı adı VEYA şifre yanlış olduğunda aynı mesaj döner;
     "böyle bir kullanıcı yok" demek, hangi hesapların var
     olduğunu sızdırır.

   · Çerezin `Secure` bayrağı isteğe göre KENDİLİĞİNDEN ekleniyor:
     bağlantı HTTPS ise (ya da HTTPS sonlandıran bir vekilin
     arkasındaysak) çerez yalnızca şifreli bağlantıda gider.
     localhost düz HTTP olduğu için orada eklenmiyor.
   · Kayıt olma da hız sınırlı: aksi hâlde tek bir betikle binlerce
     sahte hesap açılıp puan tablosu doldurulabilirdi.
   ============================================================ */

const crypto = require("crypto");
/* Ziyaretçinin GERÇEK adresi. Cloudflare arkasında req.ip Cloudflare'in
   kenar sunucusunu gösteriyor — ölçüldü, bkz. gercekip.js. */
const { gercekIp } = require("./gercekip");
const mail = require("./mail");
const fs = require("fs");
const path = require("path");
const { veriYolu } = require("./veriyolu");

/* Yol DATA_DIR ile taşınabilir — buluttaki geçici diskte veri kaybını
   önlemek için. Bkz. veriyolu.js */
const USERS_FILE = veriYolu("users.json");

/* scrypt parametreleri. N=16384 masaüstünde ~50-100 ms sürer:
   kullanıcı fark etmez, saldırgan için pahalıdır. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SALT_BYTES = 16;
const SESSION_BYTES = 32;
const SESSION_TTL = 30 * 24 * 3600e3;      // 30 gün
const COOKIE = "hs_session";

/* Giriş denemesi sınırı: 15 dakikada 8 başarısız deneme. */
const RATE_WINDOW = 15 * 60e3;
/* Kullanıcı ADI başına deneme tavanı. Kaba kuvvete karşı asıl koruma bu:
   saldırgan hangi IP'den gelirse gelsin tek hesaba 15 dakikada 8 denemeden
   fazlasını yapamıyor. Sıkı kalması gerekiyor. */
const RATE_MAX = 8;

/* IP başına giriş tavanı AYRI ve çok daha gevşek.

   Yayında öğrenildi: aynı sayı (15 dakikada 8) IP'ye de uygulanıyordu ve
   video yayınlandığında insanlar "çok giriş yapıldı, 1 saat sonra tekrar
   dene" hatası aldı. Sebep basit — mobil operatörler binlerce aboneyi tek
   genel IP'nin arkasına koyuyor (CGNAT); okul ve iş ağları da öyle. Yani
   IP başına sıkı bir tavan, kalabalık bir ağdaki HERKESİ birbirine
   kilitliyor.

   Kaba kuvvet koruması kullanıcı adı tavanında duruyor; buradaki tavan
   yalnızca tek IP'den gelen makineli deneme akışını kesmek için. */
const GIRIS_IP_MAX = (() => {
  const n = parseInt(process.env.GIRIS_IP_MAX, 10);
  return Number.isFinite(n) && n > 0 ? n : 120;
})();

/* ---------- KVKK: aydınlatma ve onay ----------
   6698 sayılı kanun, kişisel veri toplanmadan ÖNCE kişinin
   aydınlatılmasını istiyor (m.10). Onayın alındığını sonradan
   ispatlamak da veri sorumlusunun yükümlülüğü — bu yüzden onayın
   kendisi değil, hangi METNİN hangi ANDA kabul edildiği kaydediliyor.

   Metin değişirse bu sürüm de değişmeli; o zaman eski onaylar
   "eski sürüme verilmiş" olarak görünür ve kimin neye onay verdiği
   karışmaz. Tarih biçimi bilinçli: sıralanabilir ve okunabilir. */
const KVKK_SURUM = "2026-08-17";

/* ---------- kalıcı depolama ---------- */
const db = { users: [], sessions: {} };

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    db.users = Array.isArray(d.users) ? d.users : [];
    db.sessions = d.sessions && typeof d.sessions === "object" ? d.sessions : {};
    // Süresi geçmiş oturumları açılışta at.
    const now = Date.now();
    for (const [t, s] of Object.entries(db.sessions)) if (!s || s.exp < now) delete db.sessions[t];
    console.log(`👤  Hesap veritabanı yüklendi (${db.users.length} kullanıcı).`);
  /* Katlanmış anahtar kuralı SONRADAN geldi. Ondan önce açılmış iki hesap
     aynı anahtara düşüyor olabilir; bu bir hata değil ama bilinmeli:
     girişte birebir eşleşme öncelikli olduğu için ikisi de çalışmaya
     devam ediyor. Yine de sessizce geçmiyoruz. */
  {
    const gorulen = new Map();
    const cakisan = [];
    for (const u of db.users) {
      const k = adAnahtari(u.username);
      if (gorulen.has(k)) cakisan.push(`${gorulen.get(k)} ↔ ${u.username}`);
      else gorulen.set(k, u.username);
    }
    if (cakisan.length)
      console.warn(`⚠️  Aynı anahtara düşen ${cakisan.length} kullanıcı adı çifti: ` +
                   cakisan.slice(0, 5).join(", ") + (cakisan.length > 5 ? " …" : ""));
  }
  } catch { /* ilk çalıştırma: dosya yok, boş başla */ }
}
let saveTimer = null;
function save() {
  // Yazmayı topla: arka arkaya birkaç değişiklik tek diske yazma olsun.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
      const tmp = USERS_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, USERS_FILE);          // atomik: yarım dosya kalmaz
    } catch (e) { console.warn("⚠️  Hesaplar kaydedilemedi:", String(e)); }
  }, 300);
}
load();

/* ---------- şifre ---------- */
function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, SCRYPT, (err, key) =>
      err ? reject(err) : resolve(key.toString("hex")));
  });
}
async function verifyPassword(password, user) {
  const key = await hashPassword(password, Buffer.from(user.salt, "hex"));
  const a = Buffer.from(key, "hex"), b = Buffer.from(user.hash, "hex");
  // Uzunluklar farklıysa timingSafeEqual hata atar; önce onu ele.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ---------- doğrulama ----------
   Kurallar bilerek dar: kullanıcı adı URL'de ve ekranda görünüyor. */
/* Kullanıcı adı — TÜRKÇE HARFLER DE GEÇERLİ.

   Kural yalnızca A-Z kabul ediyordu ve bir kullanıcı "SİNYORBABBA46."
   yazınca kayıt reddedildi. Hata metni "harf, rakam, nokta ve alt çizgi
   kullanılabilir" diyordu — kullanıcı tam da bunları kullanmıştı. Türkçe
   bir sitede İ, Ş, Ğ, Ü, Ö, Ç harf DEĞİLMİŞ gibi davranmak yanlıştı. */
const USERNAME_RE = /^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_.]{3,20}$/;

/* AYNI GÖRÜNEN ADLAR ÇAKIŞMALI.

   Benzersizlik için küçük harfe çevirmek yetmiyor; ölçüldü:
     toLowerCase()            → "IŞIK" ile "ışık" AYRI hesap olurdu
     toLocaleLowerCase("tr")  → "ALI" ile "Ali" AYRI hesap olurdu
   İkisi de insanın aynı gördüğü iki adı ayırıyor.

   Bu yüzden anahtarda Türkçe harfler ASCII karşılığına katlanıyor:
   ALI, Ali, ALİ, alı hepsi "ali". Yan etkisi bilinçli — "Şükrü" ile
   "Sukru" da çakışıyor. Puanlı bir yarışmada taklit riski buna değer:
   birinciye çok benzeyen bir ad alıp ödül isteyen biri engelleniyor.

   GÖRÜNEN ad olduğu gibi korunuyor; katlama yalnızca karşılaştırma
   anahtarı. */
const adAnahtari = (x) => String(x || "")
  .replace(/[İIı]/g, "i").replace(/[Şş]/g, "s").replace(/[Ğğ]/g, "g")
  .replace(/[Üü]/g, "u").replace(/[Öö]/g, "o").replace(/[Çç]/g, "c")
  .toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

function validate({ username, email, password }) {
  if (!USERNAME_RE.test(String(username || "")))
    return "Kullanıcı adı 3-20 karakter olmalı; Türkçe dahil harfler, rakam, nokta ve alt çizgi kullanılabilir. Boşluk ve diğer işaretler kabul edilmiyor.";
  if (!EMAIL_RE.test(String(email || "")))
    return "Geçerli bir e-posta adresi girin.";
  if (String(password || "").length < MIN_PASSWORD)
    return `Şifre en az ${MIN_PASSWORD} karakter olmalı.`;
  if (String(password).length > 200)
    return "Şifre çok uzun.";
  return null;
}

/* ---------- oturum ---------- */
function newSession(userId) {
  const token = crypto.randomBytes(SESSION_BYTES).toString("hex");
  db.sessions[token] = { userId, exp: Date.now() + SESSION_TTL };
  save();
  return token;
}
function readSession(req) {
  const raw = req.headers.cookie || "";
  const hit = raw.split(";").map((s) => s.trim()).find((s) => s.startsWith(COOKIE + "="));
  if (!hit) return null;
  const token = decodeURIComponent(hit.slice(COOKIE.length + 1));
  const s = db.sessions[token];
  if (!s) return null;
  if (s.exp < Date.now()) { delete db.sessions[token]; save(); return null; }
  const user = db.users.find((u) => u.id === s.userId);
  if (!user) return null;
  return { token, user };
}

/* Yasaklanınca oturum silinir; ama kişi o sırada sitede geziniyorsa
   sebepsizce çıkış yapmış gibi görünür. Silinen jetonu kısa süre burada
   tutuyoruz ki bir sonraki istekte "neden" diye söyleyebilelim.
   Bellekte durur, diske yazılmaz — yetki değil, sadece bir açıklama. */
const killed = new Map();                       // token -> { userId, at }
function noteKilled(token, userId) {
  killed.set(token, { userId, at: Date.now() });
  if (killed.size > 500) for (const [k, v] of killed) if (Date.now() - v.at > 864e5) killed.delete(k);
}
function killedBan(req) {
  const raw = req.headers.cookie || "";
  const hit = raw.split(";").map((s) => s.trim()).find((s) => s.startsWith(COOKIE + "="));
  if (!hit) return null;
  const rec = killed.get(decodeURIComponent(hit.slice(COOKIE.length + 1)));
  if (!rec) return null;
  const u = db.users.find((x) => x.id === rec.userId);
  return u ? banState(u) : null;
}

/* Özellik modüllerinin kullandığı sürüm: yasaklı hesabı OTURUMSUZ sayar.
   Varsayılanı bu yapmak bilinçli — yeni bir özellik eklerken "acaba ban
   kontrolü koydum mu" diye düşünmek gerekmesin. */
function readActiveSession(req) {
  const s = readSession(req);
  if (!s) return null;
  return banState(s.user) ? null : s;
}
/* `Secure` bayrağı artık KENDİLİĞİNDEN açılıyor: istek HTTPS ile geldiyse
   (ya da HTTPS sonlandıran bir vekilin arkasındaysak, `x-forwarded-proto`)
   çerez yalnızca şifreli bağlantıda gönderilir. Elle açılması gereken bir
   ayar olarak bırakmak, yayına çıkarken unutulacak türden bir açıktı:
   o zaman oturum çerezi ağda açık gider. localhost'ta düz HTTP olduğu için
   bayrak eklenmiyor, yoksa geliştirirken giriş hiç çalışmazdı. */
const httpsMi = (req) =>
  req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
const cerez = (req, deger, omur) =>
  `${COOKIE}=${deger}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${omur}` +
  (httpsMi(req) ? "; Secure" : "");

function setCookie(res, token, req) {
  res.setHeader("Set-Cookie", cerez(req, token, Math.floor(SESSION_TTL / 1000)));
}
function clearCookie(res, req) {
  res.setHeader("Set-Cookie", cerez(req, "", 0));
}

/* ---------- hız sınırı ----------
   Pencere ve tavan artık parametre: giriş denemeleri (15 dk / 8) ile hesap
   açma (1 saat / 5) aynı sayaç mantığını farklı eşiklerle kullanıyor. */
const KAYIT_PENCERE = 3600e3;
/* Aynı bağlantıdan saatte kaç hesap açılabilir. Kötüye kullanıma karşı
   gerçek bir koruma, o yüzden YAYINDA 5 kalıyor.

   Ortam değişkeniyle ayarlanabilir olmasının tek sebebi test: hesap açan
   dört ayrı test paketi arka arkaya koşunca sınır doluyor ve paketler ürün
   sağlamken kırmızı yanıyordu — yani sınır, kendi doğruluğunu ölçmeyi
   engelliyordu. Yerelde KAYIT_MAX=200 ile koşuluyor; yayında ayar yok,
   yani 5.

   Sınırın KENDİSİ ayrıca sınanıyor (t_guvenlik → "Hesap açma hız sınırı"),
   o test kendi eşiğini okuyarak çalışıyor. */
const KAYIT_MAX = (() => {
  const n = parseInt(process.env.KAYIT_MAX, 10);
  /* Varsayılan 5'ti ve YAYINDA YETMEDİ: video çıkınca insanlar "bu
     bağlantıdan çok fazla hesap açıldı" hatası aldı. Mobil operatörler
     binlerce aboneyi tek IP'nin arkasına koyduğu için IP başına beş
     hesap, o ağdaki altıncı kişiyi kapının dışında bırakıyor.

     60 seçildi: tek betikle yüzlerce hesap açmayı hâlâ engelliyor ama
     kalabalık bir ağdaki gerçek kullanıcıları kilitlemiyor. Ortam
     değişkeniyle taşınabiliyor, çünkü doğru sayı trafiğe göre değişir. */
  return Number.isFinite(n) && n > 0 ? n : 60;
})();
const attempts = new Map();          // anahtar -> [zaman damgaları]
function tooManyAttempts(key, pencere = RATE_WINDOW, tavan = RATE_MAX) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < pencere);
  attempts.set(key, list);
  return list.length >= tavan;
}
function noteAttempt(key) {
  const list = attempts.get(key) || [];
  list.push(Date.now());
  attempts.set(key, list);
}
function clearAttempts(key) { attempts.delete(key); }

/* ---------- yasaklama (ban) ----------
   Kademeli: her yeni yasak bir üst süreye geçer. Süre dolunca hesap
   kendiliğinden açılır; sayaç sıfırlanmaz, bir dahaki sefere bir üst
   basamaktan devam eder. */
const BAN_STEPS = [
  { ms: 5 * 60e3,          label: "5 dakika" },
  { ms: 30 * 60e3,         label: "30 dakika" },
  { ms: 24 * 3600e3,       label: "1 gün" },
  { ms: 7 * 24 * 3600e3,   label: "1 hafta" },
  { ms: 180 * 24 * 3600e3, label: "6 ay" },
  { ms: 0,                 label: "kalıcı" },     // 0 = süresiz
];
function nextBanStep(user) {
  const i = Math.min(user.banCount || 0, BAN_STEPS.length - 1);
  return { index: i, ...BAN_STEPS[i] };
}
/* Yasak hâlâ sürüyor mu? Süresi dolmuşsa kaydı temizler. */
function banState(user) {
  if (!user || !user.ban) return null;
  if (user.ban.until && user.ban.until < Date.now()) { delete user.ban; save(); return null; }
  return user.ban;
}

/* Dışarıya asla hash, tuz veya e-posta dışındaki iç alanlar verilmez. */
const publicUser = (u) => ({
  id: u.id, username: u.username, email: u.email, createdAt: u.createdAt,
  playerTag: u.playerTag || "",
  ban: banState(u) ? { until: u.ban.until, label: u.ban.label, reason: u.ban.reason || "" } : null,
});

function banMessage(ban) {
  if (!ban.until) return "Hesabın kalıcı olarak askıya alındı." + (ban.reason ? " Sebep: " + ban.reason : "");
  const kalan = Math.max(0, ban.until - Date.now());
  const dk = Math.ceil(kalan / 60e3);
  const sure = dk < 60 ? `${dk} dakika` : dk < 1440 ? `${Math.ceil(dk / 60)} saat` : `${Math.ceil(dk / 1440)} gün`;
  return `Hesabın askıya alındı — ${sure} sonra açılacak.` + (ban.reason ? " Sebep: " + ban.reason : "");
}

/* ---------- yasak yönetimi ----------
   Yalnızca sunucu tarafından çağrılır; yönetici kontrolü çağıran
   modülde yapılır. */
/* `sabit` verilirse merdiven yerine o süre uygulanır ({ms, label}).
   Otomatik cezalar (bot tespiti) bunu kullanıyor: ceza uzunluğu kuralın
   kendisinde yazılı olsun, kullanıcının geçmişine göre 5 dakikaya düşmesin.
   Yine de merdiven daha AĞIRSA o kazanır — tekrar eden biri hafif ceza almaz. */
function banUser(userId, reason, sabit) {
  const u = db.users.find((x) => x.id === userId);
  if (!u) return null;
  if (u.owner) return { error: "owner" };          // sahip yasaklanamaz
  const step = nextBanStep(u);
  const merdivenAgir = !step.ms || (sabit && step.ms > sabit.ms);
  const ceza = sabit && !merdivenAgir ? sabit : step;
  u.banCount = (u.banCount || 0) + 1;
  u.ban = {
    until: ceza.ms ? Date.now() + ceza.ms : 0,     // 0 = kalıcı
    label: ceza.label, reason: String(reason || "").slice(0, 200), at: Date.now(),
  };
  // Açık oturumlarını da kapat, yoksa mevcut sekmesiyle devam eder.
  for (const [t, sess] of Object.entries(db.sessions))
    if (sess.userId === userId) { noteKilled(t, userId); delete db.sessions[t]; }
  save();
  return { ok: true, ban: u.ban, count: u.banCount, next: nextBanStep(u).label };
}
function unbanUser(userId, resetCount) {
  const u = db.users.find((x) => x.id === userId);
  if (!u) return null;
  delete u.ban;
  if (resetCount) u.banCount = 0;
  save();
  return { ok: true, count: u.banCount || 0, next: nextBanStep(u).label };
}
function userInfo(userId) {
  const u = db.users.find((x) => x.id === userId);
  if (!u) return null;
  return { id: u.id, username: u.username, owner: !!u.owner,
           banCount: u.banCount || 0, ban: banState(u) || null, next: nextBanStep(u).label };
}

/* ---------- diğer modüllerdeki kişisel kayıtlar ----------
   Kullanıcı verisi tek dosyada durmuyor: puan tablosu, mesajlar, oyun
   hakları ayrı modüllerde. Silme ve görüntüleme haklarının EKSİKSİZ
   çalışması için her modül kendini buraya kaydediyor.

   Kayıt yöntemi bilinçli: yeni bir modül eklendiğinde auth.js'i
   düzenlemek gerekmesin, modül kendi sorumluluğunu kendi bildirsin.
   Aksi hâlde "silindi" denip bir köşede veri kalma riski var. */
const veriToplayicilar = [];
function veriKaydet(ad, ozet, sil) { veriToplayicilar.push({ ad, ozet, sil }); }

/* ---------- rotalar ---------- */
function mount(app) {
  app.use("/api/auth", require("express").json({ limit: "8kb" }));

  app.post("/api/auth/register", async (req, res) => {
    try {
      /* Kayıt olmanın hız sınırı. Girişte vardı, kayıtta yoktu — oysa asıl
         istismar burada: puan tablosunda ödül olduğu için tek betikle
         yüzlerce hesap açıp hepsiyle oynamak mümkündü. Aynı IP'den saatte
         KAYIT_MAX hesap. Başarısız denemeler sayılmıyor, yalnızca açılanlar. */
      const ip = gercekIp(req);
      if (tooManyAttempts("reg:" + ip, KAYIT_PENCERE, KAYIT_MAX))
        return res.status(429).json({ error: "rate",
          message: "Bu bağlantıdan çok fazla hesap açıldı. Bir saat sonra tekrar deneyin." });

      const { username, email, password, kvkk, kosullar, yas } = req.body || {};
      /* Sıra önemli: ÖNCE girdi denetimi. Onay kontrolünü öne almak,
         hem şifresi kısa hem onayı eksik olan birine önce "onaylayın"
         dedirtiyor; kişi onaylıyor, sonra "şifre kısa" duyuyor. Formu
         iki turda doldurtmak yerine asıl eksiği önce söylüyoruz. */
      const bad = validate({ username, email, password });
      if (bad) return res.status(400).json({ error: "invalid", message: bad });

      /* Aydınlatma metni onaylanmadan hesap açılmıyor (KVKK m.10).
         Sunucuda kontrol etmek şart: istemcideki onay kutusu yalnızca bir
         arayüz öğesi, doğrudan API'ye istek atan biri onu hiç görmez. */
      /* ÜÇ AYRI ONAY, üç ayrı sebep. Tek kutuda toplamak KVKK açısından
         da yanlış olurdu: farklı metinlere verilen onay ayrı ayrı
         alınmalı ve ayrı ayrı ispatlanabilmeli.

         Hepsi SUNUCUDA denetleniyor. İstemcideki kutular yalnızca arayüz;
         doğrudan API'ye istek atan biri onları hiç görmez. */
      if (kvkk !== true)
        return res.status(400).json({ error: "kvkk",
          message: "Hesap açmak için aydınlatma metnini okuyup onaylamanız gerekiyor." });
      if (kosullar !== true)
        return res.status(400).json({ error: "kosullar",
          message: "Kullanım koşullarını okuyup kabul etmeniz gerekiyor." });
      if (yas !== true)
        return res.status(400).json({ error: "yas",
          message: "Hesap açmak için 13 yaşından büyük olduğunuzu onaylamanız gerekiyor." });

      const uLower = String(username).toLowerCase();
      const eLower = String(email).toLowerCase();
      /* Karşılaştırma katlanmış anahtarla: aynı görünen ad ikinci kez alınamıyor. */
      const uKey = adAnahtari(username);
      if (db.users.some((u) => adAnahtari(u.username) === uKey))
        return res.status(409).json({ error: "taken", message: "Bu kullanıcı adı zaten alınmış." });
      if (db.users.some((u) => u.emailLower === eLower))
        return res.status(409).json({ error: "taken", message: "Bu e-posta ile bir hesap zaten var." });

      const salt = crypto.randomBytes(SALT_BYTES);
      const hash = await hashPassword(password, salt);
      const user = {
        id: crypto.randomUUID(),
        username: String(username), usernameLower: uLower,
        email: String(email), emailLower: eLower,
        salt: salt.toString("hex"), hash,
        createdAt: Date.now(), playerTag: "",
        /* Onayın ispatı: hangi metin sürümü, hangi anda kabul edildi.
           Onayın kendisini "true" diye saklamak yetmez — hangi metne
           onay verildiği sorulduğunda cevap verebilmemiz gerekiyor. */
        /* Hangi metin sürümüne, hangi anda onay verildi. Onayı yalnızca
           "true" diye saklamak yetmez: "hangi metne onay verdi" diye
           sorulduğunda cevap verebilmemiz gerekiyor. Üç onay ayrı ayrı
           kaydediliyor. */
        kvkk: { surum: KVKK_SURUM, at: Date.now() },
        onaylar: {
          aydinlatma: { surum: KVKK_SURUM, at: Date.now() },
          kosullar:   { surum: KVKK_SURUM, at: Date.now() },
          yas13:      { at: Date.now() },
        },
        /* İlk kayıt olan sitenin sahibi. Bayrak kalıcı: sonradan hesap
           silinse bile yöneticilik başka birine kaymasın. */
        owner: db.users.length === 0,
      };
      db.users.push(user);
      save();
      noteAttempt("reg:" + ip);        // sayaca yalnızca AÇILAN hesap yazılıyor

      setCookie(res, newSession(user.id), req);
      res.status(201).json({ ok: true, user: publicUser(user) });
    } catch (e) { res.status(500).json({ error: "server", message: "Kayıt tamamlanamadı." }); }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const uLower = String(username || "").toLowerCase();
      /* Sayaç anahtarı KATLANMIŞ adla tutuluyor, ham yazımla değil.
         Ölçüldü: aşağıdaki arama "Gızlı" ile "Gizli"yi aynı hesaba
         düşürüyor (adAnahtari ı→i katlıyor), ama sayaç ham yazımı anahtar
         alınca her yazım kendi 8 hakkını alıyordu — tek hesaba, tek IP'den,
         15 dakikada 8 yerine 64 deneme (medyan hesapta; en kötüsünde 384).
         Kaba kuvvete karşı asıl koruma bu sayaç, o yüzden anahtarı
         aramayla AYNI olmak zorunda. uLower yalnızca birebir eşleşme
         aramasında kalıyor. */
      const uKey = adAnahtari(username);
      const ip = gercekIp(req);
      if (tooManyAttempts("u:" + uKey) ||
          tooManyAttempts("ip:" + ip, RATE_WINDOW, GIRIS_IP_MAX))
        return res.status(429).json({ error: "rate", message: "Çok fazla deneme. 15 dakika sonra tekrar deneyin." });

      /* ÖNCE birebir, SONRA katlanmış anahtar. Türkçe harf kullanan biri
         adını farklı büyük/küçük yazdığında giriş yapamıyordu: "IŞIK"
         küçültünce "işik" oluyor, kayıtlı "ışık" ile eşleşmiyordu.
         Birebir eşleşme önce denenir ki iki hesap aynı anahtara düşerse
         doğru olan seçilsin. */
      const user = db.users.find((u) => u.usernameLower === uLower)
        || db.users.find((u) => adAnahtari(u.username) === adAnahtari(username));
      /* Kullanıcı yoksa bile scrypt'i çalıştır: aksi hâlde cevap süresi
         "bu kullanıcı var mı" sorusunu ele verir. */
      const ok = user
        ? await verifyPassword(String(password || ""), user)
        : (await hashPassword(String(password || ""), crypto.randomBytes(SALT_BYTES)), false);

      if (!ok) {
        noteAttempt("u:" + uKey); noteAttempt("ip:" + ip);
        // Hangisinin yanlış olduğunu söylemiyoruz.
        return res.status(401).json({ error: "bad", message: "Kullanıcı adı veya şifre hatalı." });
      }
      clearAttempts("u:" + uKey); clearAttempts("ip:" + ip);
      const ban = banState(user);
      if (ban) return res.status(403).json({ error: "banned", ban: { until: ban.until, label: ban.label, reason: ban.reason || "" },
        message: banMessage(ban) });
      setCookie(res, newSession(user.id), req);
      res.json({ ok: true, user: publicUser(user) });
    } catch (e) { res.status(500).json({ error: "server", message: "Giriş yapılamadı." }); }
  });

  app.post("/api/auth/logout", (req, res) => {
    const s = readSession(req);
    if (s) { delete db.sessions[s.token]; save(); }
    clearCookie(res, req);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const s = readSession(req);
    if (!s) {
      // Oturumu yasak yüzünden mi kapandı? Öyleyse sebebini söyle.
      const k = killedBan(req);
      if (k) return res.json({ user: null, banned: true,
        ban: { until: k.until, label: k.label, reason: k.reason || "" }, message: banMessage(k) });
      return res.json({ user: null });
    }
    const ban = banState(s.user);
    // Yasaklıya durumu söylüyoruz ki ne olduğunu anlasın.
    if (ban) return res.json({ user: null, banned: true, ban: { until: ban.until, label: ban.label, reason: ban.reason || "" }, message: banMessage(ban) });
    res.json({ user: publicUser(s.user) });
  });

  /* Hesaba bir Clash Royale etiketi bağla — profil sayfasına kısayol. */
  app.post("/api/auth/tag", (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth", message: "Önce giriş yapın." });
    const tag = String(req.body?.playerTag || "").trim().toUpperCase().replace(/^#/, "");
    if (tag && !/^[0289PYLQGRJCUV]{3,15}$/.test(tag))
      return res.status(400).json({ error: "invalid", message: "Etiket geçersiz görünüyor." });
    s.user.playerTag = tag ? "#" + tag : "";
    save();
    res.json({ ok: true, user: publicUser(s.user) });
  });

  /* ---------- KVKK m.11: kişinin kendi verisine erişmesi ----------
     "Hakkımda ne tutuyorsunuz?" sorusunun cevabı. Parola özeti ve tuz
     BİLEREK dışarıda: onlar kişinin verisi değil, kimlik doğrulamanın
     iç malzemesi; dışarı vermek kimseye fayda sağlamaz, riski artırır. */
  app.get("/api/auth/data", (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth", message: "Önce giriş yapın." });
    const u = s.user;
    const oturum = Object.values(db.sessions).filter((x) => x.userId === u.id).length;
    res.json({
      hesap: {
        kullaniciAdi: u.username, eposta: u.email,
        kayitTarihi: new Date(u.createdAt).toISOString(),
        oyuncuEtiketi: u.playerTag || null,
        favoriler: (u.favorites || []).map((f) => ({ etiket: f.tag, ad: f.name, eklenme: f.at })),
        acikOturum: oturum,
        kvkkOnayi: u.kvkk || null,
        onaylar: u.onaylar || null,
        adDegisimleri: u.adDegisim || [],
        yasak: banState(u) ? { bitis: u.ban.until, sebep: u.ban.reason || "" } : null,
      },
      /* Diğer modüllerdeki kayıtları da tek yerden gösteriyoruz; kişi
         verisinin nerelere dağıldığını bilmek hakkının parçası. */
      digerKayitlar: veriToplayicilar.map((m) => ({ alan: m.ad, ozet: m.ozet(u.id) })),
      not: "Parolanız hiçbir biçimde saklanmıyor; yalnızca geri döndürülemez bir özeti tutuluyor.",
    });
  });

/* Bir hesabı ve ona bağlı BÜTÜN kayıtları siler.

   Tek yerde duruyor çünkü iki yerden çağrılıyor: kişinin kendi
   silmesi (KVKK m.7) ve yöneticinin silmesi (uygunsuz kullanıcı adı).
   İki ayrı kopya olsaydı biri güncellenip diğeri geride kalırdı ve
   silinmemiş kayıt sessizce ortada dolaşırdı.

   Sıra önemli: önce diğer modüller, sonra hesabın kendisi. Ters
   olsaydı kimlik kaybolur, hangi kayıtların silineceği bilinemezdi. */
function hesabiSil(id, kim) {
  const u = db.users.find((x) => x.id === id);
  if (!u) return { ok: false, hata: "notfound" };
  const ad = u.username;
  const silinen = veriToplayicilar.map((m) => `${m.ad}: ${m.sil(id)}`);
  for (const [t, sess] of Object.entries(db.sessions)) if (sess.userId === id) delete db.sessions[t];
  db.users = db.users.filter((x) => x.id !== id);
  save();
  console.log(`🗑️  Hesap silindi (${kim}): ${ad} — ${silinen.join(", ")}`);
  return { ok: true, ad, silinen };
}
  /* ---------- kullanıcı adı değiştirme ----------
     Kayıt sırasında seçilen ad kalıcı olmak zorunda değil; insanlar
     yazım hatası yapıyor ya da fikir değiştiriyor.

     Dört kilit var ve her biri ayrı bir riski kapatıyor:

       PAROLA   — oturumu ele geçiren biri adı değiştirip hesabı
                  tanınmaz hâle getirmesin. Silmede de aynı kural var.
       BENZERSİZ— iki hesap aynı adı taşıyamaz; taklit için en kolay yol
                  bu olurdu.
       BEKLEME  — ad sık sık değişirse Tokmakçılar tablosunu takip eden
                  kimse kimin kim olduğunu bilemez. Ödül verilirken bu
                  ciddi bir sorun: birinci, ödül açıklandıktan sonra ad
                  değiştirip başkasıymış gibi görünebilir.
       YASAKLI  — yasaklı hesap ad değiştirip yasağı görünmez yapamaz.

     Eski adlar KAYDA GEÇİYOR. Bir taklit şüphesi olduğunda "bu hesap
     dün hangi addaydı" sorusunun cevabı olmalı. */
  const AD_BEKLEME_MS = (() => {
    const n = parseInt(process.env.AD_BEKLEME_SAAT, 10);
    return (Number.isFinite(n) && n >= 0 ? n : 24) * 3600e3;
  })();
  /* ============================================================
     PAROLA DEĞİŞTİRME  (giriş yapmış kullanıcı, profilden)
     ------------------------------------------------------------
     Sıfırlama akışından AYRI: orada kimliği e-postaya gelen kod
     kanıtlıyor, burada MEVCUT PAROLA kanıtlıyor.

     Mevcut parola neden şart: oturum çerezi ele geçirilmiş olabilir
     (ortak bilgisayarda açık kalmış oturum, çalınmış cihaz). Yalnızca
     oturuma güvenseydik, o çerezi eline geçiren kişi parolayı
     değiştirip hesabı tamamen ele geçirirdi. Mevcut parola sorulunca
     bunu yapamıyor.

     Hız sınırı da şart: bu uç, mevcut parolayı DENEME imkânı veriyor.
     Sınırsız olsaydı, oturumu ele geçiren biri parolayı buradan kaba
     kuvvetle bulabilirdi — giriş ekranındaki sınırı da atlayarak.

     Değişiklikten sonra ÖTEKİ oturumlar kapanıyor, bu oturum kalıyor:
     amaç zaten "başkası giriyorsa atılsın". Bu oturumu da kapatmak
     kullanıcıyı sebepsizce yeniden giriş yapmaya zorlardı.
     ============================================================ */
  app.post("/api/auth/password", async (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth", message: "Önce giriş yapın." });
    const u = s.user;

    if (banState(u))
      return res.status(403).json({ error: "ban", message: "Yasaklı hesabın parolası değiştirilemez." });

    /* Kullanıcı ADI başına sınır — giriş ekranıyla aynı sayaç. Saldırgan
       oturumu ele geçirse bile parola denemeleri aynı havuzdan sayılıyor. */
    const anahtar = "pw:" + adAnahtari(u.username);
    if (tooManyAttempts(anahtar, RATE_WINDOW, RATE_MAX))
      return res.status(429).json({ error: "cok_deneme",
        message: "Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin." });

    const eski = String(req.body?.current || "");
    const yeni = String(req.body?.password || "");

    if (!(await verifyPassword(eski, u))) {
      noteAttempt(anahtar);
      return res.status(401).json({ error: "bad_current",
        message: "Mevcut parolanız hatalı — parola değiştirilmedi." });
    }

    /* Yeni parola kayıt sırasındaki kurallardan geçmeli; parola
       değiştirme, kural atlamanın arka kapısı olmamalı. */
    const hata = validate({ username: u.username, email: u.email, password: yeni });
    if (hata && /parola|şifre/i.test(hata))
      return res.status(400).json({ error: "bad_password", message: hata });

    /* Aynı parolayı tekrar koymak bir şey değiştirmez; kullanıcı
       "değişti" sanıp yanılmasın. */
    if (await verifyPassword(yeni, u))
      return res.status(400).json({ error: "ayni",
        message: "Yeni parolanız eskisiyle aynı. Farklı bir parola seçin." });

    const tuz = crypto.randomBytes(SALT_BYTES);
    u.salt = tuz.toString("hex");
    u.hash = await hashPassword(yeni, tuz);

    /* ÖTEKİ oturumları kapat, bu oturumu koru. */
    let kapanan = 0;
    for (const [t, o] of Object.entries(db.sessions))
      if (o && o.userId === u.id && t !== s.token) { delete db.sessions[t]; kapanan++; }

    clearAttempts(anahtar);
    clearAttempts(adAnahtari(u.username));
    save();
    console.log(`🔑  Parola değişti: ${u.username}` +
                (kapanan ? ` (${kapanan} başka oturum kapatıldı)` : ""));
    res.json({ ok: true, kapanan,
      message: kapanan
        ? `Parolan değiştirildi. Güvenlik için diğer ${kapanan} oturum kapatıldı.`
        : "Parolan değiştirildi." });
  });

  app.post("/api/auth/username", async (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth", message: "Önce giriş yapın." });
    const u = s.user;

    if (banState(u))
      return res.status(403).json({ error: "ban",
        message: "Yasaklı hesabın kullanıcı adı değiştirilemez." });

    if (!(await verifyPassword(String(req.body?.password || ""), u)))
      return res.status(401).json({ error: "bad", message: "Parola hatalı — ad değiştirilmedi." });

    const yeni = String(req.body?.username || "").trim();
    if (!USERNAME_RE.test(yeni))
      return res.status(400).json({ error: "gecersiz",
        message: "Kullanıcı adı 3-20 karakter olmalı; harf, rakam, nokta ve alt çizgi kullanılabilir." });

    const yeniLower = yeni.toLowerCase();
    if (yeniLower === u.usernameLower && yeni === u.username)
      return res.status(400).json({ error: "ayni", message: "Bu zaten mevcut kullanıcı adınız." });
    /* Başkası almış mı? Kendi hesabımız sayılmaz — yalnızca büyük/küçük
       harf düzeltmek isteyen biri engellenmesin. */
    if (db.users.some((x) => adAnahtari(x.username) === adAnahtari(yeni) && x.id !== u.id))
      return res.status(409).json({ error: "alinmis", message: "Bu kullanıcı adı zaten alınmış." });

    const son = u.adDegisim && u.adDegisim.length ? u.adDegisim[u.adDegisim.length - 1].at : 0;
    const kalan = son + AD_BEKLEME_MS - Date.now();
    if (kalan > 0) {
      const saat = Math.ceil(kalan / 3600e3);
      return res.status(429).json({ error: "bekleme",
        message: `Kullanıcı adını çok sık değiştiremezsiniz. ${saat} saat sonra tekrar deneyin.` });
    }

    const eski = u.username;
    u.adDegisim = (u.adDegisim || []).concat({ eski, yeni, at: Date.now() }).slice(-10);
    u.username = yeni;
    u.usernameLower = yeniLower;
    save();
    console.log(`✏️  Kullanıcı adı değişti: ${eski} → ${yeni}`);
    res.json({ ok: true, username: yeni,
      message: `Kullanıcı adınız "${yeni}" olarak değiştirildi.` });
  });
  /* ---------- KVKK m.7: silme hakkı ----------
     Şu ana kadar hesap silmenin hiçbir yolu yoktu. Kanun bunu bir hak
     olarak tanımlıyor ve bir e-posta yazıp beklemeye bırakmak yerine
     kişinin kendi eliyle yapabilmesi doğrusu.

     Parola soruluyor: oturumu ele geçiren biri hesabı silememeli. */
  app.post("/api/auth/delete", async (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth", message: "Önce giriş yapın." });
    const u = s.user;
    if (!(await verifyPassword(String(req.body?.password || ""), u)))
      return res.status(401).json({ error: "bad", message: "Parola hatalı — hesap silinmedi." });
    if (isAdmin(u) || u.owner)
      return res.status(400).json({ error: "admin",
        message: "Yönetici hesabı buradan silinemez. Önce yöneticiliği başka bir hesaba devredin." });

    const sonuc = hesabiSil(u.id, "kendisi");
    clearCookie(res, req);
    res.json({ ok: true, message: "Hesabınız ve bağlı bütün kayıtlarınız silindi.", silinen: sonuc.silinen });
  });

  /* ---------- favori oyuncular ----------
     Hesaba yazılır, böylece başka tarayıcıda da durur. Giriş yoksa
     istemci kendi yerel listesini kullanır; burada 401 dönmek yeterli. */
  const MAX_FAVS = 200;

  /* ============================================================
     PAROLA SIFIRLAMA
     ------------------------------------------------------------
     Sıfırlama akışı, yanlış yazılırsa HER HESABI ele geçirmenin
     yolu olur. Buradaki kararlar bunun içindir:

     · Cevap HER ZAMAN aynı: "bilgiler doğruysa kod gönderildi".
       Kullanıcı adı ya da e-posta yanlışsa da aynı cevap dönüyor.
       Farklı cevap verseydik saldırgan hangi kullanıcı adının
       kayıtlı olduğunu ve hangi e-postaya bağlı olduğunu tek tek
       öğrenebilirdi.
     · Kod DÜZ METİN saklanmıyor. Veritabanı ele geçse bile
       koddan hesaba erişilemesin diye özetlenmiş tutuluyor —
       parolalarda olduğu gibi.
     · 15 dakika ömür, TEK kullanım, en fazla 5 deneme. Altı haneli
       kod 1.000.000 ihtimal; deneme sınırı olmasa kaba kuvvetle
       kırılırdı.
     · Kod isteme hız sınırlı: hesap başına ve IP başına. IP artık
       Cloudflare arkasında da doğru okunuyor (bkz. gercekip.js).
     · Parola değişince BÜTÜN OTURUMLAR kapanıyor. Hesap zaten ele
       geçirilmişse saldırganın açık oturumu da düşsün.
     ============================================================ */
  const KOD_OMUR = 15 * 60e3;
  const KOD_DENEME = 5;
  /* Aynı hesap için 15 dakikada en fazla 3 kod. Daha fazlası posta
     kutusunu doldurmaktan başka işe yaramaz (ve taciz aracı olur). */
  const KOD_ISTEK_MAX = 3;

  /* token -> { userId, ozet, exp, deneme } — bellekte.
     DİSKE YAZILMIYOR: sunucu yeniden başlarsa yarım kalmış sıfırlamalar
     düşer, kullanıcı yeniden kod ister. Kalıcı saklamanın getirisi yok,
     riski var. */
  const kodlar = new Map();
  const kodOzet = (kod, tuz) => crypto.createHash("sha256")
    .update(String(tuz)).update(String(kod)).digest("hex");

  setInterval(() => {
    const simdi = Date.now();
    for (const [k, v] of kodlar) if (v.exp < simdi) kodlar.delete(k);
  }, 5 * 60e3).unref?.();

  app.post("/api/auth/sifirla/iste", async (req, res) => {
    const { username, email } = req.body || {};
    const ip = gercekIp(req);
    const ad = adAnahtari(username);
    const posta = String(email || "").trim().toLowerCase();

    /* Hız sınırı — cevabı değiştirmeden. Sınıra takılan da aynı
       mesajı görüyor ki "bu hesap var" bilgisi sızmasın. */
    const bosuna = tooManyAttempts("sif:" + ad, RATE_WINDOW, KOD_ISTEK_MAX)
                || tooManyAttempts("sifip:" + ip, RATE_WINDOW, 10);

    const AYNI_CEVAP = { ok: true,
      mesaj: "Bilgiler doğruysa e-posta adresine bir kod gönderildi. " +
             "Gelen kutunda yoksa gereksiz (spam) klasörüne bak." };

    if (bosuna) return res.json(AYNI_CEVAP);
    noteAttempt("sif:" + ad);
    noteAttempt("sifip:" + ip);

    const user = db.users.find((u) => adAnahtari(u.username) === ad);
    /* Kullanıcı adı VE e-posta birlikte tutmalı. Yalnız e-posta yetseydi,
       adresi bilinen birinin hesabına kod göndertmek mümkün olurdu. */
    if (!user || !user.emailLower || user.emailLower !== posta || !mail.hazirMi())
      return res.json(AYNI_CEVAP);

    const kod = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const token = crypto.randomBytes(24).toString("hex");
    const tuz = crypto.randomBytes(8).toString("hex");
    kodlar.set(token, { userId: user.id, tuz, ozet: kodOzet(kod, tuz),
                        exp: Date.now() + KOD_OMUR, deneme: 0 });

    /* POSTA ARKA PLANDA. Yanıtı beklemiyoruz — iki sebeple:

       1) Yayında görüldü: Gmail'e bağlanılamayınca istek askıda kaldı ve
          kullanıcı "Gönderiliyor…" ekranında öylece bekledi.
       2) Daha sinsisi, ZAMAN SIZINTISI: eşleşmeyen hesap 0,5 saniyede
          dönerken eşleşen hesap posta gönderimini bekliyordu. Yanıt süresi
          "bu hesap var mı" sorusunu cevaplıyordu — aynı mesajı vermenin
          bütün anlamını yok eden bir açık. Artık iki durum da anında
          dönüyor. */
    mail.sifirlamaKodu(user.email, kod, user.username).catch((e) => {
      console.warn("⚠️  Sıfırlama postası gönderilemedi:",
                   String(e && e.message || e).slice(0, 160));
      kodlar.delete(token);   // gitmeyen kodun açık kalmasının anlamı yok
    });
    /* Jeton cevapta dönüyor: hangi sıfırlama olduğunu takip etmek için.
       Tek başına işe yaramaz — kod olmadan hiçbir şey yapılamıyor. */
    res.json({ ...AYNI_CEVAP, token });
  });

  app.post("/api/auth/sifirla/onayla", async (req, res) => {
    const { token, kod, password } = req.body || {};
    const kayit = kodlar.get(String(token || ""));
    const HATA = { error: "bad_code", mesaj: "Kod yanlış ya da süresi dolmuş. Yeniden kod iste." };

    if (!kayit || kayit.exp < Date.now()) { kodlar.delete(String(token || "")); return res.status(400).json(HATA); }
    if (kayit.deneme >= KOD_DENEME) { kodlar.delete(String(token)); return res.status(400).json(HATA); }
    kayit.deneme++;

    const verilen = kodOzet(String(kod || "").trim(), kayit.tuz);
    const a = Buffer.from(verilen, "hex"), b = Buffer.from(kayit.ozet, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json(HATA);

    const user = db.users.find((u) => u.id === kayit.userId);
    if (!user) { kodlar.delete(String(token)); return res.status(400).json(HATA); }

    /* Yeni parola kayıt sırasındaki kurallardan geçmeli — sıfırlama,
       kural atlamanın arka kapısı olmamalı. */
    const hata = validate({ username: user.username, email: user.email, password });
    if (hata && /parola|şifre/i.test(hata)) return res.status(400).json({ error: "bad_password", mesaj: hata });

    const salt = crypto.randomBytes(SALT_BYTES);
    user.salt = salt.toString("hex");
    user.hash = await hashPassword(String(password), salt);

    /* BÜTÜN OTURUMLARI KAPAT — bu hesabın açık her oturumu düşsün. */
    let kapanan = 0;
    for (const [t, s] of Object.entries(db.sessions))
      if (s && s.userId === user.id) { delete db.sessions[t]; kapanan++; }

    kodlar.delete(String(token));
    clearAttempts("sif:" + adAnahtari(user.username));
    clearAttempts(adAnahtari(user.username));       // giriş denemeleri de sıfırlansın
    save();
    console.log(`🔑  Parola sıfırlandı: ${user.username} (${kapanan} oturum kapatıldı).`);
    res.json({ ok: true, mesaj: "Parolan değiştirildi. Yeni parolanla giriş yapabilirsin.", kapanan });
  });

  /* Posta ayarı çalışıyor mu — YÖNETİCİYE ÖZEL. Şifreyi göstermez,
     yalnızca bağlantının kurulup kurulmadığını söyler. */
  app.get("/api/admin/mail", async (req, res) => {
    const s = readActiveSession(req);
    if (!s || !isAdmin(s.user)) return res.status(403).json({ error: "forbidden" });
    res.json(await mail.dene());
  });

  app.get("/api/auth/favorites", (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth", favorites: [] });
    res.json({ favorites: s.user.favorites || [] });
  });

  app.post("/api/auth/favorites", (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth", message: "Önce giriş yapın.", favorites: [] });
    const { action, tag, name, badge, clan } = req.body || {};
    const clean = String(tag || "").trim().toUpperCase().replace(/^#/, "");
    if (!/^[0289PYLQGRJCUV]{3,15}$/.test(clean))
      return res.status(400).json({ error: "invalid", message: "Etiket geçersiz." });
    const full = "#" + clean;
    const list = (s.user.favorites || []).filter((f) => f.tag !== full);

    if (action === "remove") {
      s.user.favorites = list;
    } else {
      if (list.length >= MAX_FAVS)
        return res.status(400).json({ error: "full", message: `En fazla ${MAX_FAVS} favori.`, favorites: list });
      // Kullanıcıdan gelen metni sınırla; ekranda gösterilecek.
      s.user.favorites = [...list, {
        tag: full,
        name: String(name || "").slice(0, 40),
        clan: String(clan || "").slice(0, 40),
        badge: String(badge || "").slice(0, 200),
        at: Date.now(),
      }];
    }
    save();
    res.json({ ok: true, favorites: s.user.favorites });
  });

  /* ---------- yönetici: kullanıcı adından yasaklama ----------
     Tokmakçılar tablosundaki yasaklama düğmesi yalnızca TABLODAKİLERE
     ulaşıyordu; hiç oyun oynamamış ya da tablodan zaten düşmüş birini
     yasaklamanın yolu yoktu. Burası ada göre arayıp yasaklıyor.

     Yetki HER İSTEKTE burada kontrol ediliyor; ceza süresini istemci
     seçemiyor, merdiven (5 dk → … → kalıcı) sunucuda. */
  app.use("/api/admin", require("express").json({ limit: "4kb" }));
  const yonetici = (req, res) => {
    const s = readSession(req);
    if (!s || !isAdmin(s.user)) { res.status(403).json({ error: "forbidden" }); return null; }
    return s;
  };
  /* Yasak durumunu da içeren kullanıcı satırı. E-posta bilerek YOK:
     yasaklamak için gerekmiyor, listede durmasının da âlemi yok. */
  const satir = (u) => ({
    id: u.id, username: u.username, owner: !!u.owner, admin: isAdmin(u),
    createdAt: u.createdAt, banCount: u.banCount || 0,
    /* Eski adlar: taklit şüphesinde "bu hesap dün hangi addaydı" sorusunun cevabı. */
    adDegisim: (u.adDegisim || []).slice(-3),
    ban: banState(u) ? { until: u.ban.until, label: u.ban.label, reason: u.ban.reason || "" } : null,
    next: nextBanStep(u).label,
  });

  /* Ada göre ara. Sorgu boşsa son kayıt olanlar gelir ki yönetici
     "kim var" diye bakabilsin. */
  /* Şu an sitede kaç kişi var — YALNIZCA yönetici.
     Ziyaretçi sayısı işletme bilgisidir, herkese açık olması gerekmez;
     ayrıca "kim çevrimiçi" bilgisi kullanıcıların mahremiyetine girer. */
  app.get("/api/admin/canli", (req, res) => {
    if (!yonetici(req, res)) return;
    res.json(require("./anlik").durum());
  });

  /* Sınama sırasında açılmış hesapların ön ekleri. Yayın öncesi
     temizlik için: yönetici bunları tek listede görüp silebilsin.
     Liste DAR tutuluyor — gerçek bir kullanıcının bu adlarla kayıt olma
     ihtimali yok denecek kadar düşük, üstelik silmeden önce hepsi
     ekranda gösteriliyor. */
  const DENEME_ONEK = ["guvtest", "bottest", "cztest", "hstest", "yuktest", "qtest"];
  app.get("/api/admin/users", (req, res) => {
    if (!yonetici(req, res)) return;
    const q = String(req.query.q || "").trim().toLowerCase();
    let list = db.users;
    if (String(req.query.deneme || "") === "1") {
      list = list.filter((u) => DENEME_ONEK.some((o) => u.usernameLower.startsWith(o)));
      /* Yönetici ve site sahibi asla bu listeye girmesin. */
      list = list.filter((u) => !(u.owner || isAdmin(u)));
      const items = list.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map(satir);
      return res.json({ items, total: items.length, query: "deneme", yasakli: 0, deneme: true });
    }
    if (q) list = list.filter((u) => u.usernameLower.includes(q));
    const items = list
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 30)
      .map(satir);
    res.json({ items, total: list.length, query: q, yasakli: db.users.filter((u) => banState(u)).length });
  });

  /* ---------- yönetici: hesap silme ----------
     Kullanıcı isteği: "kullanıcı adını küfür yapan kişilerin hesabını
     silmem için bana yetki ver".

     Yasaklamak zaten vardı ama yasak geçici; uygunsuz bir ad tabloya
     yasak bitince geri gelir. Silme kalıcı ve geri alınamaz, o yüzden
     iki kilit var: yönetici oturumu VE kullanıcı adının birebir
     yazılması. Yanlış satıra tıklamak tek başına hesap silemiyor.

     Yönetici ve site sahibi silinemez — kimse kendini ya da diğer
     yöneticiyi kilitleyemesin. */
  app.post("/api/admin/sil", (req, res) => {
    if (!yonetici(req, res)) return;
    const id = String(req.body?.userId || "");
    const onay = String(req.body?.username || "").trim();
    const hedef = db.users.find((x) => x.id === id);
    if (!hedef) return res.status(404).json({ error: "notfound", message: "Kullanıcı bulunamadı." });
    if (isAdmin(hedef) || hedef.owner)
      return res.status(400).json({ error: "admin", message: "Yönetici hesabı silinemez." });
    if (onay.toLowerCase() !== String(hedef.username).toLowerCase())
      return res.status(400).json({ error: "onay",
        message: "Silmek için kullanıcı adını birebir yazın." });
    const r = hesabiSil(id, "yönetici");
    if (!r.ok) return res.status(404).json({ error: "notfound", message: "Kullanıcı bulunamadı." });
    res.json({ ok: true, ad: r.ad, silinen: r.silinen,
      message: `"${r.ad}" hesabı ve bağlı bütün kayıtları kalıcı olarak silindi.` });
  });
  app.post("/api/admin/ban", (req, res) => {
    if (!yonetici(req, res)) return;
    const ad = String(req.body?.username || "").trim().toLowerCase();
    const u = db.users.find((x) => x.usernameLower === ad)
      || db.users.find((x) => adAnahtari(x.username) === adAnahtari(ad));
    if (!u) return res.status(404).json({ error: "notfound", message: `"${req.body?.username}" adlı kullanıcı yok.` });

    /* Yöneticiler yasaklanamaz. banUser yalnızca `owner` bayrağına bakıyor;
       ADMIN_USERS ile yönetici yapılmış bir hesapta o bayrak olmayabilir ve
       iki yönetici birbirini (ya da kendini) kilitleyebilirdi. */
    if (isAdmin(u))
      return res.status(400).json({ error: "admin", message: `${u.username} bir yönetici hesabı — yasaklanamaz.` });

    const r = banUser(u.id, req.body?.reason || "Yönetici kararı");
    if (r && r.error === "owner")
      return res.status(400).json({ error: "owner", message: "Site sahibi yasaklanamaz." });
    res.json({ ...r, user: satir(u), message: r.ban.until
      ? `${u.username} yasaklandı — ${r.ban.label}. Bir dahaki sefere: ${r.next}.`
      : `${u.username} kalıcı olarak yasaklandı.` });
  });

  app.post("/api/admin/unban", (req, res) => {
    if (!yonetici(req, res)) return;
    const ad = String(req.body?.username || "").trim().toLowerCase();
    const u = db.users.find((x) => x.usernameLower === ad)
      || db.users.find((x) => adAnahtari(x.username) === adAnahtari(ad));
    if (!u) return res.status(404).json({ error: "notfound", message: `"${req.body?.username}" adlı kullanıcı yok.` });
    const r = unbanUser(u.id, !!req.body?.reset);
    res.json({ ...r, user: satir(u),
      message: `${u.username} serbest.` + (req.body?.reset ? " Ceza sayacı da sıfırlandı." : ` Sayaç ${r.count}'de kaldı — bir dahaki sefere: ${r.next}.`) });
  });

  console.log("🔐  Kayıt/giriş, favori ve yönetici uçları hazır (/api/auth/*, /api/admin/*).");
}

/* Puan tablosu kullanıcı adlarını çözebilsin diye; hash/tuz asla dışarı çıkmaz. */
const listUsers = () => db.users.map((u) => ({ id: u.id, username: u.username }));

/* ---------- yöneticilik ----------
   Tek tanım burada. Eskiden feedback.js'in içinde duruyordu; puan tablosu
   ve mesajlaşma da aynı kontrole ihtiyaç duyunca üç kopya olacaktı.
   ADMIN_USERS ortam değişkeni varsa o geçerli, yoksa ilk kayıtlı hesap.
   Kontrol HER İSTEKTE sunucuda yapılır; istemcinin "ben yöneticiyim"
   demesine asla bakılmaz. */
const ADMIN_ENV = String(process.env.ADMIN_USERS || "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
function isAdmin(user) {
  if (!user) return false;
  if (ADMIN_ENV.length) return ADMIN_ENV.includes(String(user.username).toLowerCase());
  return db.users.length > 0 && db.users[0].id === user.id;
}
const adminLabel = () => (ADMIN_ENV.length ? ADMIN_ENV.join(", ") : "ilk kayıtlı hesap");

module.exports = { mount, readSession, readActiveSession, listUsers, banUser, unbanUser,
                   veriKaydet, KVKK_SURUM,
                   userInfo, BAN_STEPS, isAdmin, adminLabel };
