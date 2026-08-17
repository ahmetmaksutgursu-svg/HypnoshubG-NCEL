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
const RATE_MAX = 8;

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
const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

function validate({ username, email, password }) {
  if (!USERNAME_RE.test(String(username || "")))
    return "Kullanıcı adı 3-20 karakter olmalı; harf, rakam, nokta ve alt çizgi kullanılabilir.";
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
const KAYIT_MAX = 5;
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

/* ---------- rotalar ---------- */
function mount(app) {
  app.use("/api/auth", require("express").json({ limit: "8kb" }));

  app.post("/api/auth/register", async (req, res) => {
    try {
      /* Kayıt olmanın hız sınırı. Girişte vardı, kayıtta yoktu — oysa asıl
         istismar burada: puan tablosunda ödül olduğu için tek betikle
         yüzlerce hesap açıp hepsiyle oynamak mümkündü. Aynı IP'den saatte
         KAYIT_MAX hesap. Başarısız denemeler sayılmıyor, yalnızca açılanlar. */
      const ip = req.ip || req.socket?.remoteAddress || "?";
      if (tooManyAttempts("reg:" + ip, KAYIT_PENCERE, KAYIT_MAX))
        return res.status(429).json({ error: "rate",
          message: "Bu bağlantıdan çok fazla hesap açıldı. Bir saat sonra tekrar deneyin." });

      const { username, email, password } = req.body || {};
      const bad = validate({ username, email, password });
      if (bad) return res.status(400).json({ error: "invalid", message: bad });

      const uLower = String(username).toLowerCase();
      const eLower = String(email).toLowerCase();
      if (db.users.some((u) => u.usernameLower === uLower))
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
      const ip = req.ip || req.socket?.remoteAddress || "?";
      if (tooManyAttempts("u:" + uLower) || tooManyAttempts("ip:" + ip))
        return res.status(429).json({ error: "rate", message: "Çok fazla deneme. 15 dakika sonra tekrar deneyin." });

      const user = db.users.find((u) => u.usernameLower === uLower);
      /* Kullanıcı yoksa bile scrypt'i çalıştır: aksi hâlde cevap süresi
         "bu kullanıcı var mı" sorusunu ele verir. */
      const ok = user
        ? await verifyPassword(String(password || ""), user)
        : (await hashPassword(String(password || ""), crypto.randomBytes(SALT_BYTES)), false);

      if (!ok) {
        noteAttempt("u:" + uLower); noteAttempt("ip:" + ip);
        // Hangisinin yanlış olduğunu söylemiyoruz.
        return res.status(401).json({ error: "bad", message: "Kullanıcı adı veya şifre hatalı." });
      }
      clearAttempts("u:" + uLower); clearAttempts("ip:" + ip);
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

  /* ---------- favori oyuncular ----------
     Hesaba yazılır, böylece başka tarayıcıda da durur. Giriş yoksa
     istemci kendi yerel listesini kullanır; burada 401 dönmek yeterli. */
  const MAX_FAVS = 200;

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
    ban: banState(u) ? { until: u.ban.until, label: u.ban.label, reason: u.ban.reason || "" } : null,
    next: nextBanStep(u).label,
  });

  /* Ada göre ara. Sorgu boşsa son kayıt olanlar gelir ki yönetici
     "kim var" diye bakabilsin. */
  app.get("/api/admin/users", (req, res) => {
    if (!yonetici(req, res)) return;
    const q = String(req.query.q || "").trim().toLowerCase();
    let list = db.users;
    if (q) list = list.filter((u) => u.usernameLower.includes(q));
    const items = list
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 30)
      .map(satir);
    res.json({ items, total: list.length, query: q, yasakli: db.users.filter((u) => banState(u)).length });
  });

  app.post("/api/admin/ban", (req, res) => {
    if (!yonetici(req, res)) return;
    const ad = String(req.body?.username || "").trim().toLowerCase();
    const u = db.users.find((x) => x.usernameLower === ad);
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
    const u = db.users.find((x) => x.usernameLower === ad);
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
                   userInfo, BAN_STEPS, isAdmin, adminLabel };
