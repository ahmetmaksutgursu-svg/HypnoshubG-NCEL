/* ============================================================
   HYPNOSHUB — TOKMAKÇILAR 🔨  (haftalık puan tablosu)
   ------------------------------------------------------------
   Oyunlar oynandıkça puan birikir ve o haftanın tablosuna
   yazılır. Hafta PAZARTESİ 00:00'da (yerel saat) döner; yeni
   hafta sıfırdan başlar, eski haftalar saklanır.

   Puan ekleme yalnızca sunucu tarafında yapılır ve oturum
   çerezine bakar — istemciden gelen "ben şu kullanıcıyım"
   bilgisine güvenilmez. Ayrıca:

   · Bir istekte verilebilecek puan sınırlıdır (MAX_PER_CALL),
     böylece konsoldan "bana 1 milyon puan" denemesi işe yaramaz.
   · Oyun başına dakikalık bir tavan var; sekmede döngü kurup
     puan pompalamayı engeller.
   · Puan değerleri SUNUCUDA tanımlıdır (GAME_POINTS); istemci
     yalnızca "şu oyunu şu sonuçla bitirdim" der.

   NOT: Puanlama değerleri henüz konuşulmadı — GAME_POINTS
   şimdilik boş. Tablo, uçlar ve arayüz hazır; bir oyuna puan
   bağlamak için tek yapılacak şey aşağıya bir satır eklemek.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const { veriYolu } = require("./veriyolu");

/* Yol DATA_DIR ile taşınabilir — buluttaki geçici diskte veri kaybını
   önlemek için. Bkz. veriyolu.js */
const FILE = veriYolu("scores.json");

/* Basit "bitirdim → şu kadar puan" oyunları için tablo. Puanı merdivene
   göre değişen oyunlar (Tokmak Yarışması) bunu kullanmaz; onlar kendi
   hesaplarını yapıp award() çağırır. */
/* ⚠️ DİKKAT — buraya bir satır eklemeden önce oku:

   Bu tablodaki oyunlar için puanı istemcinin "bitirdim" demesi tetikler.
   Yani giriş yapmış biri hiç oynamadan doğrudan /api/board/score isteği
   atıp puan toplayabilir (dakikada 300 puan tavanına kadar).

   Şu an tablo BOŞ, yani bu uç hiçbir şey vermiyor — puan veren oyunların
   hepsi (yarışma, günün kartı, düello) cevabı sunucuda tutup
   award() çağırıyor. Yeni bir oyuna puan bağlarken de aynısını yap:
   burayı doldurma, oyunun kendi modülünde award() çağır. */
const GAME_POINTS = {
  // "tahmin":  { win: 0 },
  // "siralama":{ win: 0 },
};
/* award() ile puan veren oyunlar. Tablo "puanlama açık mı" derken buna da
   bakar, yoksa yarışma puan verdiği hâlde tablo "kapalı" derdi. */
const WIRED_GAMES = ["yarisma"];
const MAX_PER_CALL = 100;          // tek istekte en fazla
const RATE_PER_MIN = 300;          // kullanıcı başına dakikalık tavan

/* ---------- tablonun açılış tarihi ----------
   Site bu tarihe kadar kapalı geliştiriliyor; o yüzden ondan ÖNCE oynanan
   oyunlar puan yazmıyor. Aksi hâlde yarış, sitede tek başına test yapan
   hesabın biriktirdiği puanlarla başlardı.

   Dönemler artık pazartesiye değil BU TARİHE göre sayılıyor: 20 Ağustos
   perşembe ve ödül "20–27 Ağustos" olarak ilan edildi. Pazartesi haftası
   kullansaydık o aralık iki ayrı haftaya bölünür, hiçbir tablo tam olarak
   o aralığı göstermezdi. Yedi günlük dönemler başlangıçtan itibaren
   sayılınca 1. dönem tam olarak 20–27 Ağustos oluyor. */
const BASLANGIC = new Date(2026, 7, 20);          // 20 Ağustos 2026, yerel 00:00
const DONEM_GUN = 7;

/* ---------- ödül duyurusu ----------
   Belirli bir dönemi 1. sırada bitirene verilecek ödül. Tabloda not olarak
   görünür ve o dönem bittiği anda KENDİLİĞİNDEN kaybolur — sonradan silmeyi
   unutup "hediye var" yazısını aylarca ekranda bırakmayalım diye.

   `hafta` o dönemin BAŞLANGIÇ tarihi (weekKey ile aynı biçim).
   Duyuru dönem başlamadan da görünür ("gelecek hafta"), böylece önceden
   ilan edilebiliyor. Ödülü kaldırmak için: hafta: null. */
const ODUL = {
  hafta: "2026-08-20",                 // 20–27 Ağustos 2026 (1. dönem)
  baslik: "Açılış ödülü",
  metin: "Dönemi <b>1. sırada</b> bitiren tokmakçıya <b>Pass Royale</b> hediye!",
};

const db = { weeks: {} };          // { "2026-W33": { userId: {points, games, at} } }

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (d && d.weeks) db.weeks = d.weeks;
    console.log(`🔨  Tokmakçılar tablosu yüklendi (${Object.keys(db.weeks).length} hafta).`);
  } catch { /* ilk çalıştırma */ }
}
let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, FILE);
    } catch (e) { console.warn("⚠️  Puanlar kaydedilemedi:", String(e)); }
  }, 400);
}
load();

/* ---------- hafta ----------
   Pazartesi başlangıçlı ISO haftası. Tarayıcının değil sunucunun
   saatine göre, yoksa herkes kendi haftasında olurdu. */
const gunFarki = (a, b) =>
  Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate())
            - new Date(b.getFullYear(), b.getMonth(), b.getDate())) / 864e5);

/* İçinde bulunulan yedi günlük dönemin başlangıcı. Başlangıç tarihinden
   önceyse null — tablo henüz açılmamış demektir. */
function weekStart(d = new Date()) {
  const gecen = gunFarki(d, BASLANGIC);
  if (gecen < 0) return null;
  const s = new Date(BASLANGIC);
  s.setDate(s.getDate() + Math.floor(gecen / DONEM_GUN) * DONEM_GUN);
  return s;
}
const tarihAnahtari = (s) =>
  `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
function weekKey(d = new Date()) {
  const s = weekStart(d);
  // Yılın kaçıncı haftası olduğunu değil, dönemin başlangıç tarihini
  // anahtar yapıyoruz: yıl dönümlerinde belirsizlik olmasın.
  return s ? tarihAnahtari(s) : null;
}
const acikMi = () => weekStart() !== null;
function weekInfo() {
  const s = weekStart();
  if (!s) {
    // Henüz açılmadı: ne zaman açılacağını söyleyebilelim.
    return { key: null, acik: false, start: BASLANGIC.toISOString(),
             end: null, endsInMs: null, acilisMs: BASLANGIC - Date.now() };
  }
  const e = new Date(s); e.setDate(e.getDate() + DONEM_GUN);
  return { key: tarihAnahtari(s), acik: true, start: s.toISOString(),
           end: e.toISOString(), endsInMs: e - Date.now(), acilisMs: 0 };
}

/* Ödül hâlâ geçerli mi? Anahtardan o haftanın başını/sonunu çözüp
   bakıyoruz; hafta bitince null döner ve duyuru ekrandan düşer. */
function odulDurumu() {
  if (!ODUL || !ODUL.hafta) return null;
  const [y, ay, g] = ODUL.hafta.split("-").map(Number);
  if (!y || !ay || !g) return null;
  const bas = new Date(y, ay - 1, g);
  const bit = new Date(bas); bit.setDate(bit.getDate() + 7);
  if (Date.now() >= bit) return null;                 // hafta geçti
  return {
    baslik: ODUL.baslik, metin: ODUL.metin,
    hafta: ODUL.hafta, start: bas.toISOString(), end: bit.toISOString(),
    buHafta: weekKey() === ODUL.hafta,                // "bu hafta" mı "gelecek hafta" mı
  };
}

/* Tablo hangi tarihte açılıyor / açık mı — oyunlar bunu kullanıcıya
   söyleyebilsin diye dışarıya veriliyor. */
const acilisBilgisi = () => ({ acik: acikMi(), acilis: BASLANGIC.toISOString() });

/* ---------- hız sınırı ---------- */
const recent = new Map();          // userId -> [{t, p}]
function withinRate(userId, points) {
  const now = Date.now();
  const list = (recent.get(userId) || []).filter((x) => now - x.t < 60e3);
  const sum = list.reduce((a, x) => a + x.p, 0);
  recent.set(userId, list);
  return sum + points <= RATE_PER_MIN;
}
function noteRate(userId, points) {
  const list = recent.get(userId) || [];
  list.push({ t: Date.now(), p: points });
  recent.set(userId, list);
}

function addPoints(userId, points, game) {
  const key = weekKey();
  if (!key) return null;                 // tablo henüz açılmadı — puan yazılmaz
  if (!db.weeks[key]) db.weeks[key] = {};
  const row = db.weeks[key][userId] || { points: 0, games: 0, byGame: {}, at: 0 };
  row.points += points;
  row.games += 1;
  row.byGame[game] = (row.byGame[game] || 0) + points;
  row.at = Date.now();
  db.weeks[key][userId] = row;
  save();
  return row;
}

function mount(app, { readSession, listUsers, isAdmin, banUser, userInfo }) {
  app.use("/api/board", require("express").json({ limit: "4kb" }));

  const needAdmin = (req, res) => {
    const s = readSession(req);
    if (!s || !isAdmin(s.user)) { res.status(403).json({ error: "forbidden" }); return null; }
    return s;
  };

  /* Haftanın tablosu. Kullanıcı adları hesap kayıtlarından çözülür;
     puan tablosunda e-posta gibi hiçbir özel alan bulunmaz. */
  app.get("/api/board/weekly", (req, res) => {
    const info = weekInfo();
    const rows = info.key ? (db.weeks[info.key] || {}) : {};
    const users = new Map(listUsers().map((u) => [u.id, u]));
    const s = readSession(req);
    const admin = s ? isAdmin(s.user) : false;

    const items = Object.entries(rows)
      .map(([id, r]) => {
        const u = users.get(id);
        if (!u) return null;
        /* Yasaklı hesaplar tablodan düşer. Küfürlü ad yüzünden yasaklanan
           biri listede kalmaya devam ederse yasaklamanın anlamı olmazdı;
           puanları siliniyor değil, yasak bitince geri geliyor. */
        const bilgi = userInfo(id);
        if (bilgi && bilgi.ban) return null;
        return {
          username: u.username, points: r.points, games: r.games, at: r.at,
          // userId SADECE yöneticiye gider: banlama düğmesi buna ihtiyaç duyuyor.
          /* `owner` yerine "yasaklanamaz mı" diye soruyoruz. `owner` bayrağı
             yalnızca kurulumda işaretlenmiş hesapta var; ADMIN_USERS ile ya
             da "ilk kayıtlı hesap" kuralıyla yönetici olan birinde yok, yani
             yönetici kendi satırının yanında yasaklama düğmesi görüyordu. */
          ...(admin ? { userId: id, banCount: bilgi ? bilgi.banCount : 0,
                        next: bilgi ? bilgi.next : "",
                        owner: bilgi ? (bilgi.owner || isAdmin(bilgi)) : false } : {}),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.points - a.points || a.at - b.at)   // eşitlikte önce ulaşan önde
      .map((x, i) => ({ rank: i + 1, ...x }));

    const me = s ? items.find((x) => x.username === s.user.username) || null : null;
    res.json({
      week: info, items: items.slice(0, 20), total: items.length, me, admin,
      odul: odulDurumu(),
      /* Puanlama açık mı? İki koşulu birden anlatıyor: puan veren bir oyun
         tanımlı mı VE tablo açılış tarihine gelmiş mi. */
      scoring: acikMi() && (Object.keys(GAME_POINTS).length + WIRED_GAMES.length > 0),
      acik: acikMi(), acilis: BASLANGIC.toISOString(),
    });
  });

  /* Tablodan yasaklama — yalnızca yönetici.
     Ceza kademesi auth.js'teki merdivenden geliyor (5 dk → … → kalıcı),
     yani buradan "süre" seçilemiyor; sunucu karar veriyor. */
  app.post("/api/board/ban", (req, res) => {
    if (!needAdmin(req, res)) return;
    const hedef = String(req.body?.userId || "");
    /* Yöneticiler yasaklanamaz. banUser yalnızca `owner` bayrağına bakıyor;
       o bayrak olmayan bir yönetici (ADMIN_USERS ya da "ilk kayıtlı hesap")
       buradan kendini kilitleyebilirdi. Görünürde düğme çıkmıyor ama karar
       sunucuda verilmeli. */
    const bilgi = userInfo(hedef);
    if (bilgi && isAdmin(bilgi))
      return res.status(400).json({ error: "admin", message: "Yönetici hesabı yasaklanamaz." });
    const r = banUser(hedef, req.body?.reason || "Uygunsuz kullanıcı adı");
    if (!r) return res.status(404).json({ error: "notfound", message: "Kullanıcı bulunamadı." });
    if (r.error === "owner") return res.status(400).json({ error: "owner", message: "Site sahibi yasaklanamaz." });
    res.json({ ...r, message: r.ban.until
      ? `Yasaklandı — ${r.ban.label}. Tablodan düştü. Bir dahaki sefere: ${r.next}.`
      : "Kalıcı olarak yasaklandı. Tablodan düştü." });
  });

  /* Oyun bitince çağrılır. Puanı İSTEMCİ SEÇMEZ — hangi oyun, hangi
     sonuç bilgisini yollar, puanı sunucudaki tablo belirler. */
  app.post("/api/board/score", (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth", message: "Puan için giriş yapmalısın." });

    const game = String(req.body?.game || "");
    const result = String(req.body?.result || "win");
    const rule = GAME_POINTS[game];
    if (!rule) return res.status(400).json({ error: "unknown_game", message: "Bu oyun için puanlama tanımlı değil." });

    const points = Math.min(MAX_PER_CALL, Math.max(0, rule[result] || 0));
    if (!points) return res.json({ ok: true, points: 0 });
    if (!withinRate(s.user.id, points))
      return res.status(429).json({ error: "rate", message: "Çok hızlı puan toplanıyor." });

    noteRate(s.user.id, points);
    const row = addPoints(s.user.id, points, game);
    /* Tablo henüz açılmadıysa addPoints null döner; `row.points` demek
       sunucuyu düşürürdü. Oyun yine oynanabiliyor, sadece puan yazılmıyor. */
    if (!row) return res.json({ ok: true, points: 0, yazilmadi: true, acilis: BASLANGIC.toISOString(),
      message: "Tokmakçılar tablosu 20 Ağustos'ta açılıyor — bu tur puan yazmadı." });
    res.json({ ok: true, points, total: row.points, week: weekKey() });
  });

  console.log("🔨  Tokmakçılar uçları hazır (/api/board/*). Puan veren oyun: " +
    [...Object.keys(GAME_POINTS), ...WIRED_GAMES].join(", "));
}

/* Yarışma gibi başka modüller de puan yazabilsin diye. Puan değerini
   çağıran modül belirler; buradaki tavanlar yine geçerlidir. */
function award(userId, points, game) {
  const p = Math.max(0, Math.min(50, Math.floor(points) || 0));
  if (!p) return null;
  if (!withinRate(userId, p)) return null;
  noteRate(userId, p);
  return addPoints(userId, p, game);
}

/* ---------- KVKK: kişinin kendi verisi ----------
   Puan kayıtları kullanıcı kimliğine bağlı ve auth.js bunları bilmiyor.
   Silme hakkı EKSİKSİZ çalışsın diye her modül kendi verisini kendisi
   özetliyor ve siliyor; auth.js yalnızca bu işlevleri çağırıyor.
   (Bkz. auth.js/veriKaydet — yeni modül eklendiğinde auth.js'e
   dokunulmasın, modül kendi sorumluluğunu bildirsin.) */
function kullaniciOzeti(userId) {
  let donem = 0, puan = 0;
  for (const h of Object.values(db.weeks)) {
    if (h[userId]) { donem++; puan += h[userId].points || 0; }
  }
  return donem ? `${donem} dönemde toplam ${puan} puan` : "kayıt yok";
}
function kullaniciSil(userId) {
  let n = 0;
  for (const h of Object.values(db.weeks)) if (h[userId]) { delete h[userId]; n++; }
  if (n) save();
  return `${n} dönem puan kaydı`;
}

module.exports = { mount, weekInfo, award, acilisBilgisi, kullaniciOzeti, kullaniciSil };
