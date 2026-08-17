/* ============================================================
   HYPNOSHUB — ROZET VERME ve PRO BAŞVURULARI
   ------------------------------------------------------------
   Rozetlerin dört kaynağı var:

     1) verified.js       — kodda duran elle liste (kalıcı)
     2) dünya ilk 100     — canlı sıralamadan, kendiliğinden döner
     3) madalyon eşiği    — belli madalyonu gören herkes (PRO_MIN)
     4) BU DOSYA          — yöneticinin siteden verdiği rozetler

   4. madde kodda değil diskte tutulur (.cache/badges.json), çünkü
   yönetici siteden verip alabilmeli; sunucu yeniden başlayınca da
   kaybolmamalı.

   Başvurular da burada: oyuncu etiketini yazıp başvurur, yönetici
   kabul ya da reddeder. Kabul edilen başvuru doğrudan rozete
   dönüşür — yöneticinin ayrıca bir yere etiket yazması gerekmez.

   GÜVENLİK: bu modül yetki kontrolü YAPMAZ. Hangi çağrının
   yönetici gerektirdiği server.js'te belirlenir.
   ============================================================ */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { veriYolu } = require("./veriyolu");

/* Yol DATA_DIR ile taşınabilir — buluttaki geçici diskte veri kaybını
   önlemek için. Bkz. veriyolu.js */
const FILE = veriYolu("badges.json");

/* Rozet türleri. "yayinci" mavi tik + "Yayıncı" notu demek;
   "pro" altın PRO rozeti. Bir hesapta ikisi birden olabilir. */
const KINDS = ["pro", "yayinci"];
const KIND_TR = { pro: "PRO", yayinci: "Yayıncı" };

const db = {
  granted: {},        // "#TAG" -> { pro:bool, yayinci:bool, note, at, by }
  apps: [],           // başvurular
  /* Kodda SABİT yazılı rozetlerin (server/verified.js) gizlenmesi.
     Neden gerekli: o liste bir kaynak dosya, çalışırken değiştirilemez.
     Yönetici siteden "kaldır" dediğinde eskiden hiçbir şey olmuyordu —
     revoke() rozeti `granted` içinde arıyor, orada olmadığı için
     "notfound" dönüyordu ve ekranda sebepsiz bir hata çıkıyordu.
     Artık etiket buraya yazılıyor ve rozet dağıtımı bu listeyi atlıyor;
     yani kaldırma yayına yeni kod göndermeden çalışıyor. */
  gizli: {},          // "#TAG" -> { pro:bool, yayinci:bool, at, by }
};

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (d && typeof d.granted === "object") db.granted = d.granted;
    if (d && typeof d.gizli === "object") db.gizli = d.gizli;
    if (d && Array.isArray(d.apps)) db.apps = d.apps;
    const n = Object.keys(db.granted).length;
    console.log(`🏅  Verilen rozetler yüklendi (${n} hesap, ${db.apps.filter((a) => a.status === "bekliyor").length} bekleyen başvuru).`);
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
    } catch (e) { console.warn("⚠️  Rozetler kaydedilemedi:", String(e)); }
  }, 300);
}
load();

const normTag = (t) => "#" + String(t || "").replace(/^#/, "").toUpperCase().trim();
/* Clash Royale etiket alfabesi: O, I ve S yok. Başvuruda yanlış
   yazılmış etiketi baştan eleyelim. */
const TAG_OK = /^#[0289PYLQGRJCUV]{3,15}$/;
const gecerliTag = (t) => TAG_OK.test(normTag(t));

const newId = () => crypto.randomBytes(9).toString("hex");
const kisalt = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

/* ---------- rozet verme ---------- */
function grant(tag, kind, { note = "", by = "" } = {}) {
  const t = normTag(tag);
  if (!KINDS.includes(kind)) return { error: "kind" };
  const row = db.granted[t] || { at: Date.now() };
  row[kind] = true;
  row.at = Date.now();
  if (by) row.by = by;
  if (note) row.note = kisalt(note, 60);
  db.granted[t] = row;
  save();
  return { ok: true, tag: t, kind, row };
}
/* `sabitVar(t, kind)` — bu etiket kodda sabit yazılı listede mi?
   Çağıran taraf (server.js) veriyor; badges.js verified.js'i tanımıyor. */
function revoke(tag, kind, sabitVar) {
  const t = normTag(tag);
  const row = db.granted[t];

  if (row) {
    if (kind) delete row[kind]; else delete db.granted[t];
    if (db.granted[t] && !db.granted[t].pro && !db.granted[t].yayinci) delete db.granted[t];
    save();
    return { ok: true, tag: t, kaynak: "verilen" };
  }

  /* Siteden verilmemiş ama kodda sabit yazılı olabilir. O dosyayı çalışırken
     değiştiremeyiz; onun yerine etiketi gizleme listesine alıyoruz. */
  if (sabitVar) {
    const g = db.gizli[t] || { at: Date.now() };
    if (kind) g[kind] = true; else { g.pro = true; g.yayinci = true; }
    g.at = Date.now();
    db.gizli[t] = g;
    save();
    return { ok: true, tag: t, kaynak: "sabit" };
  }

  return { error: "notfound",
           message: `${t} için verilmiş ya da tanımlı bir rozet bulunamadı. Etiketi kontrol edin.` };
}

/* Gizlenmiş mi? `rozetle` bunu sorup sabit listeyi atlıyor. */
function gizliMi(tag, kind) {
  const g = db.gizli[normTag(tag)];
  return !!(g && (kind ? g[kind] : (g.pro || g.yayinci)));
}
/* Yanlışlıkla gizlenen bir rozeti geri getirmek için. */
function gizlemeKaldir(tag, kind) {
  const t = normTag(tag);
  const g = db.gizli[t];
  if (!g) return { error: "notfound", message: `${t} için gizleme kaydı yok.` };
  if (kind) delete g[kind]; else delete db.gizli[t];
  if (db.gizli[t] && !db.gizli[t].pro && !db.gizli[t].yayinci) delete db.gizli[t];
  save();
  return { ok: true, tag: t };
}
const listGizli = () => Object.entries(db.gizli).map(([tag, r]) => ({ tag, ...r }));
const get = (tag) => db.granted[normTag(tag)] || null;
const listGranted = () =>
  Object.entries(db.granted).map(([tag, r]) => ({ tag, ...r }))
    .sort((a, b) => (b.at || 0) - (a.at || 0));

/* ---------- başvurular ---------- */
const APP_LIMIT_MS = 24 * 3600e3;      // aynı kullanıcı günde bir başvuru

function apply({ userId, username, tag, kind, note }) {
  const t = normTag(tag);
  if (!gecerliTag(t)) return { error: "tag", message: "Etiket geçersiz görünüyor. Oyun içindeki #etiketini birebir yaz (O, I ve S harfi yoktur)." };
  if (!KINDS.includes(kind)) return { error: "kind", message: "Rozet türü geçersiz." };

  const varOlan = db.apps.find((a) => a.userId === userId && a.status === "bekliyor");
  if (varOlan) return { error: "pending", message: "Zaten bekleyen bir başvurun var." };

  const son = db.apps.filter((a) => a.userId === userId).sort((a, b) => b.at - a.at)[0];
  if (son && son.status === "red" && Date.now() - son.at < APP_LIMIT_MS)
    return { error: "cooldown", message: "Başvurun yakın zamanda reddedildi. 24 saat sonra tekrar deneyebilirsin." };

  const app = {
    id: newId(), userId, username: kisalt(username, 24), tag: t, kind,
    note: kisalt(note, 300), at: Date.now(), status: "bekliyor",
  };
  db.apps.unshift(app);
  save();
  return { ok: true, app };
}

const myApps = (userId) => db.apps.filter((a) => a.userId === userId).slice(0, 10);
const listApps = (status) =>
  (status ? db.apps.filter((a) => a.status === status) : db.apps).slice(0, 300);
const pendingCount = () => db.apps.filter((a) => a.status === "bekliyor").length;

/* Kabul: rozeti de verir. Ret: sadece işaretler. */
function decide(id, karar, { by = "", note = "" } = {}) {
  const app = db.apps.find((a) => a.id === id);
  if (!app) return { error: "notfound" };
  if (app.status !== "bekliyor") return { error: "done", message: "Bu başvuru zaten sonuçlanmış." };
  app.status = karar === "kabul" ? "kabul" : "red";
  app.decidedAt = Date.now();
  app.decidedBy = kisalt(by, 24);
  if (note) app.adminNote = kisalt(note, 200);
  if (app.status === "kabul") grant(app.tag, app.kind, { by, note: KIND_TR[app.kind] });
  save();
  return { ok: true, app };
}

module.exports = {
  KINDS, KIND_TR, normTag, gecerliTag,
  grant, revoke, get, listGranted,
  gizliMi, gizlemeKaldir, listGizli,
  apply, myApps, listApps, pendingCount, decide,
};
