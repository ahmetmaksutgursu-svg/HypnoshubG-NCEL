/* ============================================================
   HYPNOSHUB — ÖZEL MESAJLAR 💌
   ------------------------------------------------------------
   Kural tek cümle: yazışma HER ZAMAN yönetici ile bir kullanıcı
   arasındadır. Kullanıcı kullanıcıya yazamaz.

   Bu yüzden bir sohbet, karşı taraftaki KULLANICI ile anılıyor
   (`peer`). Yönetici herkese yazabilir; kullanıcı yalnızca
   yöneticiye yazabilir ve alıcı seçemez — sunucu zaten tek bir
   alıcı tanıyor. İstemciden gelen "şuna gönder" bilgisi
   kullanıcı tarafında tamamen yok sayılır; böylece konsoldan
   başka bir kullanıcıya mesaj atmak mümkün değil.

   Kimin ne göreceği de sunucuda karar verilir: kullanıcı yalnız
   kendi sohbetini çeker, başkasınınkini isteyemez.
   ============================================================ */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { veriYolu } = require("./veriyolu");

/* Yol DATA_DIR ile taşınabilir — buluttaki geçici diskte veri kaybını
   önlemek için. Bkz. veriyolu.js */
const FILE = veriYolu("messages.json");
const MAX_LEN = 1000;
const RATE_PER_HOUR = 20;          // kullanıcı başına (yönetici hariç)

const db = { items: [] };          // {id, peerId, from:"user"|"admin", text, at, read}

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (d && Array.isArray(d.items)) db.items = d.items;
    console.log(`💌  Mesajlar yüklendi (${db.items.length} mesaj).`);
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
    } catch (e) { console.warn("⚠️  Mesajlar kaydedilemedi:", String(e)); }
  }, 400);
}
load();

/* Kullanıcı tarafı için saatlik sınır; yönetici bundan muaf. */
const sent = new Map();
function tooMany(userId) {
  const now = Date.now();
  const list = (sent.get(userId) || []).filter((t) => now - t < 3600e3);
  sent.set(userId, list);
  return list.length >= RATE_PER_HOUR;
}
function noteSent(userId) {
  const list = sent.get(userId) || [];
  list.push(Date.now());
  sent.set(userId, list);
}

const newId = () => crypto.randomBytes(12).toString("hex");
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, MAX_LEN);

function mount(app, { readSession, listUsers, isAdmin, userInfo }) {
  app.use("/api/messages", require("express").json({ limit: "8kb" }));

  const needAuth = (req, res) => {
    const s = readSession(req);
    if (!s) { res.status(401).json({ error: "auth", message: "Mesajlaşmak için giriş yapmalısın." }); return null; }
    return s;
  };
  const needAdmin = (req, res) => {
    const s = needAuth(req, res); if (!s) return null;
    if (!isAdmin(s.user)) { res.status(403).json({ error: "forbidden" }); return null; }
    return s;
  };

  /* ---------- durum: rozet için okunmamış sayısı ---------- */
  app.get("/api/messages/status", (req, res) => {
    const s = readSession(req);
    if (!s) return res.json({ loggedIn: false, unread: 0, admin: false });
    const admin = isAdmin(s.user);
    const unread = admin
      ? db.items.filter((m) => m.from === "user" && !m.read).length
      : db.items.filter((m) => m.peerId === s.user.id && m.from === "admin" && !m.read).length;
    res.json({ loggedIn: true, admin, unread });
  });

  /* ---------- kullanıcı: kendi sohbeti ---------- */
  app.get("/api/messages/thread", (req, res) => {
    const s = needAuth(req, res); if (!s) return;
    if (isAdmin(s.user)) return res.status(400).json({ error: "admin", message: "Yönetici için /api/messages/threads kullanılır." });
    const items = db.items.filter((m) => m.peerId === s.user.id)
      .sort((a, b) => a.at - b.at)
      .map((m) => ({ id: m.id, from: m.from, text: m.text, at: m.at }));
    // Yöneticiden gelenler okundu sayılsın.
    let degisti = false;
    db.items.forEach((m) => { if (m.peerId === s.user.id && m.from === "admin" && !m.read) { m.read = true; degisti = true; } });
    if (degisti) save();
    res.json({ items });
  });

  /* ---------- kullanıcı: yöneticiye yaz ----------
     Alıcı ALINMIYOR. Kullanıcının yazabileceği tek adres yönetici;
     gövdede "userId" gönderse bile yok sayılıyor. Kullanıcıdan
     kullanıcıya mesaj bu yüzden yapısal olarak imkânsız. */
  app.post("/api/messages/send", (req, res) => {
    const s = needAuth(req, res); if (!s) return;
    if (isAdmin(s.user)) return res.status(400).json({ error: "admin", message: "Yönetici /api/messages/reply kullanır." });
    const text = clean(req.body?.text);
    if (!text) return res.status(400).json({ error: "empty", message: "Mesaj boş olamaz." });
    if (tooMany(s.user.id)) return res.status(429).json({ error: "rate", message: "Saatte en fazla 20 mesaj gönderebilirsin." });
    noteSent(s.user.id);
    const m = { id: newId(), peerId: s.user.id, from: "user", text, at: Date.now(), read: false };
    db.items.push(m); save();
    res.json({ ok: true, item: { id: m.id, from: m.from, text: m.text, at: m.at } });
  });

  /* ---------- yönetici: sohbet listesi ---------- */
  app.get("/api/messages/threads", (req, res) => {
    const s = needAdmin(req, res); if (!s) return;
    const users = new Map(listUsers().map((u) => [u.id, u]));
    const map = new Map();
    for (const m of db.items) {
      const t = map.get(m.peerId) || { peerId: m.peerId, son: 0, sonMetin: "", unread: 0, adet: 0 };
      t.adet++;
      if (m.at > t.son) { t.son = m.at; t.sonMetin = m.text; t.sonKim = m.from; }
      if (m.from === "user" && !m.read) t.unread++;
      map.set(m.peerId, t);
    }
    const items = [...map.values()]
      .map((t) => {
        const u = users.get(t.peerId);
        const bilgi = userInfo(t.peerId);
        return u ? { ...t, username: u.username, banned: !!(bilgi && bilgi.ban) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.son - a.son);
    res.json({ items, unread: items.reduce((a, x) => a + x.unread, 0) });
  });

  /* ---------- yönetici: bir kişinin sohbeti ---------- */
  app.get("/api/messages/with/:userId", (req, res) => {
    const s = needAdmin(req, res); if (!s) return;
    const peerId = String(req.params.userId || "");
    const u = listUsers().find((x) => x.id === peerId);
    if (!u) return res.status(404).json({ error: "notfound" });
    const items = db.items.filter((m) => m.peerId === peerId)
      .sort((a, b) => a.at - b.at)
      .map((m) => ({ id: m.id, from: m.from, text: m.text, at: m.at }));
    let degisti = false;
    db.items.forEach((m) => { if (m.peerId === peerId && m.from === "user" && !m.read) { m.read = true; degisti = true; } });
    if (degisti) save();
    res.json({ items, username: u.username, userId: peerId });
  });

  /* ---------- yönetici: yaz / cevapla ---------- */
  app.post("/api/messages/reply", (req, res) => {
    const s = needAdmin(req, res); if (!s) return;
    const peerId = String(req.body?.userId || "");
    const u = listUsers().find((x) => x.id === peerId);
    if (!u) return res.status(404).json({ error: "notfound", message: "Kullanıcı bulunamadı." });
    const text = clean(req.body?.text);
    if (!text) return res.status(400).json({ error: "empty", message: "Mesaj boş olamaz." });
    const m = { id: newId(), peerId, from: "admin", text, at: Date.now(), read: false };
    db.items.push(m); save();
    res.json({ ok: true, item: { id: m.id, from: m.from, text: m.text, at: m.at } });
  });

  /* ---------- yönetici: kime yazabilirim (kullanıcı listesi) ---------- */
  app.get("/api/messages/users", (req, res) => {
    const s = needAdmin(req, res); if (!s) return;
    const q = String(req.query.q || "").toLocaleLowerCase("tr").trim();
    const items = listUsers()
      .filter((u) => u.id !== s.user.id && (!q || u.username.toLocaleLowerCase("tr").includes(q)))
      .slice(0, 50)
      .map((u) => ({ id: u.id, username: u.username }));
    res.json({ items });
  });

  console.log("💌  Mesajlaşma hazır (/api/messages/*) — kullanıcılar yalnız yöneticiyle yazışır.");
}

/* ---------- KVKK: kişinin kendi verisi ----------
   Mesajlar serbest metin, yani kişinin kendi yazdığı her şey burada.
   Hesap silinince yöneticiyle olan yazışmanın tamamı da gidiyor —
   "hesabı sildim ama mesajlarım duruyor" olmamalı. */
function kullaniciOzeti(userId) {
  const n = db.items.filter((m) => m.peerId === userId).length;
  return n ? `${n} mesaj` : "kayıt yok";
}
function kullaniciSil(userId) {
  const once = db.items.length;
  db.items = db.items.filter((m) => m.peerId !== userId);
  const n = once - db.items.length;
  if (n) save();
  return `${n} mesaj`;
}

module.exports = { mount, kullaniciOzeti, kullaniciSil };
