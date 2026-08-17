/* ============================================================
   HYPNOSHUB — şikayet ve öneri
   ------------------------------------------------------------
   Kullanıcılar buradan yazıyor, mesajlar diske düşüyor.

   Giriş şartı var: kim yazdığı belli olsun ve anonim spam
   olmasın. Ayrıca kullanıcı başına saatlik bir sınır var —
   form açık bırakılıp döngüye sokulamasın.

   Mesaj metni HAM tutulur ve hiçbir yerde HTML olarak
   basılmaz; okurken düz metin olarak gösterilir.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const { veriYolu } = require("./veriyolu");

/* Yol DATA_DIR ile taşınabilir — buluttaki geçici diskte veri kaybını
   önlemek için. Bkz. veriyolu.js */
const FILE = veriYolu("feedback.json");
const MAX_LEN = 2000;
const PER_HOUR = 5;

let db = { items: [] };
try { db = JSON.parse(fs.readFileSync(FILE, "utf8")) || { items: [] }; } catch {}
let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, FILE);
    } catch (e) { console.warn("⚠️  Geri bildirim kaydedilemedi:", String(e)); }
  }, 300);
}

const recent = new Map();
function tooMany(userId) {
  const now = Date.now();
  const list = (recent.get(userId) || []).filter((t) => now - t < 3600e3);
  recent.set(userId, list);
  return list.length >= PER_HOUR;
}
function note(userId) {
  const list = recent.get(userId) || [];
  list.push(Date.now());
  recent.set(userId, list);
}

/*
  Kim yönetici?

  Varsayılan: SİTEYE İLK KAYIT OLAN hesap. Site senin bilgisayarında
  çalıştığı için ilk hesabı açan sensin; ayrıca bir şey ayarlaman
  gerekmiyor. İstersen .env içine yazarak değiştirebilirsin:

      ADMIN_USERS=Ahmet23,BaskaBiri

  Yönetici kontrolü her istekte SUNUCUDA yapılır; istemciden gelen
  "ben yöneticiyim" bilgisine bakılmaz.
*/
/* Yöneticilik tanımı auth.js'e taşındı — puan tablosu ve mesajlaşma da
   aynı kontrolü kullanıyor, üç ayrı kopya tutmanın anlamı yok. */
function mount(app, { readSession, listUsers, banUser, unbanUser, userInfo, banSteps, isAdmin, adminLabel }) {
  app.use("/api/feedback", require("express").json({ limit: "16kb" }));

  const needAdmin = (req, res) => {
    const s = readSession(req);
    if (!s || !isAdmin(s.user)) { res.status(403).json({ error: "forbidden" }); return null; }
    return s;
  };

  app.post("/api/feedback", (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth", message: "Yazmak için giriş yapmalısın." });
    if (tooMany(s.user.id))
      return res.status(429).json({ error: "rate", message: "Saatte en fazla 5 mesaj gönderebilirsin." });

    const kind = ["sikayet", "oneri", "hata"].includes(String(req.body?.kind)) ? String(req.body.kind) : "oneri";
    const text = String(req.body?.text || "").trim();
    if (text.length < 10)
      return res.status(400).json({ error: "short", message: "Biraz daha ayrıntı yazar mısın? (en az 10 karakter)" });
    if (text.length > MAX_LEN)
      return res.status(400).json({ error: "long", message: `En fazla ${MAX_LEN} karakter.` });

    note(s.user.id);
    db.items.push({
      id: require("crypto").randomUUID(),
      kind, text: text.slice(0, MAX_LEN),
      username: s.user.username, userId: s.user.id,
      at: Date.now(), page: String(req.body?.page || "").slice(0, 200),
    });
    save();
    res.json({ ok: true, message: "Mesajın bize ulaştı, teşekkürler!" });
  });

  /* Kullanıcı kendi gönderdiklerini görebilir — başkasınınkini göremez. */
  app.get("/api/feedback/mine", (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth", items: [] });
    res.json({
      items: db.items.filter((x) => x.userId === s.user.id)
        .sort((a, b) => b.at - a.at).slice(0, 20)
        .map((x) => ({ kind: x.kind, text: x.text, at: x.at })),
    });
  });

  /* ---------- yönetim ---------- */

  /* Oturum sahibinin yönetici olup olmadığı; menüde "Gelen Mesajlar"
     satırını göstermek için. Okunmamış sayısını da verir. */
  app.get("/api/feedback/admin", (req, res) => {
    const s = readSession(req);
    const admin = s ? isAdmin(s.user) : false;
    res.json({ admin, unread: admin ? db.items.filter((x) => !x.read).length : 0 });
  });

  app.get("/api/feedback/all", (req, res) => {
    if (!needAdmin(req, res)) return;
    const kind = String(req.query.kind || "");
    const items = db.items
      .filter((x) => !kind || x.kind === kind)
      .sort((a, b) => b.at - a.at)
      .slice(0, 300)
      /* Gönderenin yasak durumunu da ekle: yönetici mesaja bakarken
         "bu kişi zaten yasaklı mı, bir sonraki ceza ne" görsün. */
      .map((x) => {
        const info = userInfo(x.userId);
        return { ...x, sender: info ? { banned: !!info.ban, banCount: info.banCount, next: info.next, owner: info.owner } : null };
      });
    res.json({
      items, total: db.items.length,
      unread: db.items.filter((x) => !x.read).length,
      counts: {
        oneri: db.items.filter((x) => x.kind === "oneri").length,
        sikayet: db.items.filter((x) => x.kind === "sikayet").length,
        hata: db.items.filter((x) => x.kind === "hata").length,
      },
    });
  });

  app.post("/api/feedback/read", (req, res) => {
    if (!needAdmin(req, res)) return;
    const id = String(req.body?.id || "");
    if (id === "*") db.items.forEach((x) => { x.read = true; });
    else { const it = db.items.find((x) => x.id === id); if (it) it.read = !it.read; }
    save();
    res.json({ ok: true, unread: db.items.filter((x) => !x.read).length });
  });

  app.post("/api/feedback/delete", (req, res) => {
    if (!needAdmin(req, res)) return;
    const id = String(req.body?.id || "");
    const before = db.items.length;
    db.items = db.items.filter((x) => x.id !== id);
    save();
    res.json({ ok: true, removed: before - db.items.length, unread: db.items.filter((x) => !x.read).length });
  });

  /* ---------- yasaklama (yönetici) ----------
     Mesaj kutusundan tek tıkla. Süre kademeli ve SUNUCU belirler;
     yönetici "şu kadar süre" diye seçmez, sıradaki basamak uygulanır. */
  app.get("/api/feedback/user/:id", (req, res) => {
    if (!needAdmin(req, res)) return;
    const info = userInfo(String(req.params.id));
    if (!info) return res.status(404).json({ error: "notfound" });
    res.json({ ...info, steps: banSteps.map((s) => s.label) });
  });

  app.post("/api/feedback/ban", (req, res) => {
    if (!needAdmin(req, res)) return;
    const r = banUser(String(req.body?.userId || ""), req.body?.reason);
    if (!r) return res.status(404).json({ error: "notfound", message: "Kullanıcı bulunamadı." });
    if (r.error === "owner") return res.status(400).json({ error: "owner", message: "Site sahibi yasaklanamaz." });
    res.json({ ...r, message: r.ban.until
      ? `Yasaklandı — ${r.ban.label}. Bir dahaki sefere: ${r.next}.`
      : "Kalıcı olarak yasaklandı." });
  });

  app.post("/api/feedback/unban", (req, res) => {
    if (!needAdmin(req, res)) return;
    const r = unbanUser(String(req.body?.userId || ""), !!req.body?.reset);
    if (!r) return res.status(404).json({ error: "notfound" });
    res.json({ ...r, message: req.body?.reset ? "Yasak kaldırıldı ve sayaç sıfırlandı." : "Yasak kaldırıldı." });
  });

  console.log(`💬  Şikayet/öneri ucu hazır (/api/feedback) — ${db.items.length} mesaj kayıtlı.` +
    ` Yönetici: ${adminLabel()}.`);
}

module.exports = { mount };
