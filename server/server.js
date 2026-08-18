/* ============================================================
   HYPNOSHUB — Clash Royale API proxy
   ------------------------------------------------------------
   The official Clash Royale API cannot be called from the
   browser: it requires a secret bearer token and it whitelists
   requests by server IP (browsers are blocked by CORS anyway).
   This Express server holds your token and forwards a small set
   of safe, read-only endpoints to the frontend.

   Run:  npm install  &&  npm start
   Docs: see README.md in this folder.
   ============================================================ */

const express = require("express");
const path = require("path");
const fs = require("fs");
// .env her zaman bu klasörden okunur — sunucu hangi dizinden başlatılırsa başlatılsın.
require("dotenv").config({ path: path.join(__dirname, ".env") });

/* ============================================================
   SAAT DİLİMİ — her şeyden ÖNCE ayarlanmalı
   ------------------------------------------------------------
   Sitedeki bütün saatler TÜRKİYE saatine göre: yarışma 20 Ağustos
   18.00'da açılıyor, oyun hakları her gün 18.00'da yenileniyor,
   dönemler 18.00'da dönüyor.

   Ama sunucu Türkiye'de çalışmıyor. Railway kabı UTC ile açılıyor ve
   yerel saatle kurulan bir tarih orada 18.00 UTC üretiyor — yani
   Türkiye'de 21.00. Ölçüldü: ilk yayında açılış saati canlıda 21.00
   göründü. Aynı kayma günlük sıfırlamayı ve dönem sınırlarını da
   üç saat öteliyordu.

   Bu satır saat dilimini sabitliyor. En üstte olmak ZORUNDA: Node
   ilk Date işleminden sonra saat dilimini önbelleğe alıyor, sonradan
   ayarlamak geç kalır. Bu yüzden takvim.js dahil hiçbir modül bu
   satırdan önce yüklenmiyor.

   SITE_TZ ile değiştirilebilir (ör. site başka bir ülkeye açılırsa).
   ============================================================ */
process.env.TZ = process.env.SITE_TZ || "Europe/Istanbul";

const app = express();
const PORT = process.env.PORT || 8787;
const TOKEN = process.env.CR_API_TOKEN;
/* Clash Royale API adresi.

   Neden ayarlanabilir: Supercell anahtarı IP'ye bağlıdır — anahtarı
   oluştururken hangi IP'den çağrılacağını yazarsın ve başka bir IP'den
   gelen istek 403 alır. Railway/Render gibi bulut sağlayıcılarında
   sunucunun dışa çıkış IP'si SABİT DEĞİLDİR, her yeniden başlatmada
   değişebilir. Yani bilgisayarda çalışan anahtar bulutta çalışmaz.

   Bunun bilinen çözümü RoyaleAPI'nin vekil sunucusu: anahtarı onların
   sabit IP'sine (45.79.218.79) kayıtlı açarsın, istekleri de
   https://proxy.royaleapi.dev/v1 üzerine gönderirsin. Yol ve yanıtlar
   birebir aynı, sadece adres değişiyor.

   Yerelde ayar gerekmiyor: boşsa doğrudan Supercell'e gidilir. */
const CR_BASE = (process.env.CR_API_BASE || "https://api.clashroyale.com/v1").replace(/\/+$/, "");

if (!TOKEN) {
  console.warn("\n⚠️  CR_API_TOKEN is not set. Copy .env.example to .env and add your key.");
  console.warn("   Until then the frontend will show demo data.\n");
}

/* ============================================================
   GÜVENLİK BAŞLIKLARI
   ------------------------------------------------------------
   Sitede giriş, parola ve KVKK kapsamında kişisel veri var; tarayıcıya
   birkaç temel kuralı söylemek gerekiyor. Ölçüldü — yayında bunların
   HİÇBİRİ yoktu.

   · HSTS: tarayıcı bu siteye bir daha ASLA http ile bağlanmasın. Yalnız
     https üzerinden gönderiliyor, yoksa yerelde (http) tarayıcıyı
     kilitleyip geliştirmeyi bozardı.
   · nosniff: tarayıcı dosya türünü tahmin etmeye çalışmasın.
   · SAMEORIGIN: site başka bir sayfanın içine <iframe> ile gömülemesin.
     Giriş kutusu olan bir sitede tıklama hırsızlığının önündeki engel bu.
   · Referrer-Policy: başka siteye geçerken tam adres sızmasın (oyuncu
     etiketi arama adreslerinde geçiyor).

   İçerik Güvenlik Politikası (CSP) BİLEREK eklenmedi: sayfalar satır içi
   script kullanıyor, katı bir CSP siteyi anında bozar. Doğru yapılması
   ayrı ve dikkatli bir iş.
   ============================================================ */
const GUVENLIK_BASLIKLARI = true;
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  /* Kullanılmayan güçlü tarayıcı özellikleri kapalı olsun. */
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
  if (req.secure || req.headers["x-forwarded-proto"] === "https")
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  next();
});

/* --- CORS (allow the static frontend to call this proxy) --- */
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.ALLOW_ORIGIN || "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* --- Helper: call the Clash Royale API --- */
async function cr(path) {
  const res = await fetch(CR_BASE + path, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// Clash Royale tags start with '#', which must be encoded as %23.
const normTag = (t) => "%23" + decodeURIComponent(String(t)).replace(/^#/, "").toUpperCase();

/* --- Tiny in-memory cache (protects your rate limit) --- */
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  /* Aynı anahtar için ikinci bir istek gelirse ONU DA aynı işe bağla.
     Yoksa önbellek soğukken art arda gelen üç ziyaretçi, aynı pahalı
     derlemeyi (ör. /live 4,2 sn) üç kez birden başlatıyordu. */
  if (hit && hit.p) return hit.p;
  const p = (async () => {
    const v = await fn();
    cache.set(key, { t: Date.now(), v });
    return v;
  })();
  cache.set(key, { ...(hit || {}), p });
  p.catch(() => cache.delete(key));
  return p;
}

/*
  Bayatını ver, arkada tazele.

  Ölçtük: /live önbelleği soğukken 4,2 sn sürüyor (100 oyuncunun savaş
  günlüğü) ama ömrü 60 sn. Yani sayfayı açan çoğu ziyaretçi tam o 4 saniyeyi
  bekliyordu. Burada elimizde eski bir kopya varsa onu ANINDA veriyoruz ve
  yenilemeyi arka planda yapıyoruz; bir sonraki ziyaretçi taze veriyi hazır
  buluyor. Bedeli: veri en fazla `bayat` kadar eskimiş olabilir.
*/
async function cachedSWR(key, tazeMs, bayatMs, fn) {
  const hit = cache.get(key);
  const yas = hit && hit.v !== undefined ? Date.now() - hit.t : Infinity;
  if (yas < tazeMs) return hit.v;
  if (yas < bayatMs) {                       // elde eski kopya var
    if (!hit.p) {
      const p = (async () => {
        const v = await fn();
        cache.set(key, { t: Date.now(), v });
        return v;
      })();
      cache.set(key, { ...hit, p });
      p.catch(() => { const h = cache.get(key); if (h) delete h.p; });
    }
    return hit.v;                            // beklemeden bayat kopya
  }
  return cached(key, 0, fn);                 // hiç kopya yok: beklemek şart
}

/* --- Retry once when Supercell throttles us (429) --- */
async function crRetry(path, tries = 2) {
  for (let i = 0; i < tries; i++) {
    const r = await cr(path);
    if (r.status !== 429) return r;
    await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
  }
  return { status: 429, body: {} };
}

/* --- Bounded-concurrency map (keeps bulk fetches under the rate limit) --- */
async function pool(items, width, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/*
  Clan badges.

  A clan object from the API carries only a numeric `badgeId` (16000000‑16000179)
  — unlike cards, there is no `badgeUrls` field anywhere in the API, so the
  artwork cannot be derived from the payload alone. RoyaleAPI publishes the
  id → asset-name mapping and hosts the images, so we fetch the mapping once
  (180 entries, covers every id the API hands out) and hand the frontend a
  ready-made URL. If the fetch fails, `badge` comes back empty and the UI
  falls back to its generic crest.
*/
const BADGE_DATA = "https://royaleapi.github.io/cr-api-data/json/alliance_badges.json";
const BADGE_IMG = (name) => `https://cdn.royaleapi.com/static/img/badge/${name}.png`;
let badgeMap = null;
async function badgeLookup() {
  if (!badgeMap) {
    try {
      const r = await fetch(BADGE_DATA);
      badgeMap = new Map((await r.json()).map((b) => [b.id, b.name]));
      console.log(`🛡️  Klan rozeti eşlemesi yüklendi (${badgeMap.size} rozet).`);
    } catch (e) {
      badgeMap = new Map();
      console.warn("⚠️  Klan rozeti eşlemesi alınamadı:", String(e));
    }
  }
  return (id) => { const n = badgeMap.get(id); return n ? BADGE_IMG(n) : ""; };
}

/*
  Player name index.

  The official API has NO player-name search — /players?name=… and
  /players/search?name=… both answer 404 ("Not found with tag search").
  /players/{tag} is the only player lookup, and it needs an exact tag.

  Two endpoints hand out (name, tag) pairs in bulk, and the index is built from
  both: the Path of Legends ladder per location, and clan rosters. Trophy Road
  rankings are NOT a source — /locations/{id}/rankings/players returns an empty
  list this season.

  It is still partial by construction: a player who is neither ranked nor in a
  crawled clan cannot appear. The frontend says so, and an exact tag always
  bypasses the index. See buildPlayerIndex below for the two phases.
*/
const INDEX_TTL = 24 * 3600e3;
/*
  Oyuncu indeksi nereye yazılsın?

  Bu dosya birkaç yüz megabayt ve tarama sırasında birkaç dakikada bir
  TAMAMEN yeniden yazılıyor. Proje bir bulut klasöründe duruyorsa (burada
  OneDrive\Desktop) her yazma koca bir yüklemeyi tetikler, üstelik sürüm
  geçmişi de birikir. Hesap/puan dosyaları küçük olduğu için yerinde kalır;
  yalnızca bu dev dosya taşınabilir.

  INDEX_DIR ayarlanmışsa oraya, ayarlanmamışsa eskisi gibi server/.cache'e.
*/
const INDEX_DIR = process.env.INDEX_DIR || require("./veriyolu").DATA_DIR;
const INDEX_FILE = path.join(INDEX_DIR, "players.json");
const INDEX_NDJSON = path.join(INDEX_DIR, "players.ndjson");
/*
  Clans whose rosters get pulled into the index. ~45 members each, ~32 clans/s.
  12k klan 468k oyuncu verdi ve hesapların çoğunu kaçırıyordu; 60k ile 2.0M
  oyuncuya çıktık — ama arama hâlâ eksikti.

  Ölçtük: konum bazlı klan sıralamaları toplam **192.556 farklı klan**
  gösteriyor. Yani 60k sınırı, keşfedilebilir klanların yalnızca %31'iydi.
  Sınır artık o tavanın üstünde: API ne kadar klan gösteriyorsa hepsi
  taranır. Tarama arka planda ilerler, site bu sırada çalışmaya devam eder
  ve indeks yol boyunca diske yazıldığı için yeniden başlatma iş kaybettirmez.
*/
/* `|| 250000` yazılamaz: JavaScript'te 0 da yanlış (falsy) sayıldığı için
   CRAWL_CLANS=0 sessizce 250.000'e dönüyordu, yani indeksi kapatmanın yolu
   yoktu. Küçük bir sunucuda bu ~1,5 GB fazladan bellek demek. Sayı olarak
   çözülebiliyorsa onu kullanıyoruz, çözülemiyorsa varsayılana düşüyoruz. */
const CRAWL_CLANS = (() => {
  const ham = parseInt(process.env.CRAWL_CLANS, 10);
  return Number.isFinite(ham) ? Math.max(0, ham) : 250000;
})();
const CRAWLED_FILE = path.join(INDEX_DIR, "clans-crawled.json");
const pIndex = {
  rows: [], byTag: null, at: 0, building: null,
  phase: "", done: 0, total: 0, clans: 0,
  /* Taranmış klanların ETİKETLERİ. Eskiden yalnızca bir SAYI tutuluyordu ve
     "ilk N tanesi zaten tarandı" varsayılıyordu — ama o sıralama her turda
     değişiyor (rütbeler eşit, istekler paralel), yani devam ederken bazı
     klanlar iki kez taranıyor, bazıları hiç taranmıyordu. Küme tutmak bunu
     kesin olarak çözüyor. */
  crawled: new Set(),
};

function loadCrawled() {
  try {
    const a = JSON.parse(fs.readFileSync(CRAWLED_FILE, "utf8"));
    if (Array.isArray(a)) pIndex.crawled = new Set(a);
  } catch {}
  /* Eski kurulumdan geliyorsak hangi klanın tarandığı kayıtlı değil, sadece
     bir sayı var. "İndekste geçen her klan tarandı" demek yanlış olurdu:
     bu klanların bir kısmı yalnızca tek bir sıralama oyuncusu üzerinden
     görüldü, kadrosu hiç çekilmedi.

     Ayırt edici ölçü üye sayısı. Ölçtük: indekste geçen 67.130 klanın
     7.521'inde tek bir oyuncu var (sıralamadan gelme), 55.257'sinde ise
     5 veya daha fazla — bunların kadrosu gerçekten çekilmiş demektir.
     Onları tekrar taramak yaklaşık yarım saat sürüyor ve tek bir yeni
     oyuncu getirmiyor.

     Bu kısayol yalnızca indeks TAZEYKEN geçerli. Bayatladıysa küme
     sıfırlanır ve her klan yeniden gezilir; yoksa kadrolar hiç
     yenilenmezdi. */
  const taze = pIndex.at && Date.now() - pIndex.at < INDEX_TTL;
  if (taze && pIndex.rows.length) {
    const uye = new Map();
    for (const r of pIndex.rows) if (r.clanTag) uye.set(r.clanTag, (uye.get(r.clanTag) || 0) + 1);
    let eklenen = 0;
    for (const [t, n] of uye) if (n >= 5 && !pIndex.crawled.has(t)) { pIndex.crawled.add(t); eklenen++; }
    if (eklenen) console.log(`   ↳ ${eklenen} klanın kadrosu indekste zaten tam; tekrar taranmayacak.`);
  }
  pIndex.clans = pIndex.crawled.size;
}
function saveCrawled() {
  try {
    fs.mkdirSync(path.dirname(CRAWLED_FILE), { recursive: true });
    fs.writeFileSync(CRAWLED_FILE + ".tmp", JSON.stringify([...pIndex.crawled]));
    fs.renameSync(CRAWLED_FILE + ".tmp", CRAWLED_FILE);
  } catch (e) { console.warn("⚠️  Taranan klan listesi kaydedilemedi:", String(e)); }
}

/*
  Persist as NDJSON, one row per line.

  JSON.stringify of the whole array cannot survive this size: at 2.5M rows the
  string alone is ~350MB, held as UTF-16 while the array is still live, which
  blows the heap before the write starts. Streaming a line at a time keeps the
  peak flat regardless of how far the crawl got. The old single-blob
  players.json is still read on startup so an existing index is not thrown away.
*/
function saveIndex() {
  try {
    fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
    const tmp = INDEX_NDJSON + ".tmp";
    const fd = fs.openSync(tmp, "w");
    /* "done" da yazılıyor: yeniden başlatınca tam turun bittiğini bilelim,
       yoksa her açılışta ~500 sıralama isteğiyle baştan keşfe çıkardık. */
    fs.writeSync(fd, JSON.stringify({ at: pIndex.at, clans: pIndex.clans,
      n: pIndex.rows.length, done: pIndex.phase === "done" }) + "\n");
    let buf = "";
    for (const r of pIndex.rows) {
      buf += JSON.stringify(r) + "\n";
      if (buf.length > 4e6) { fs.writeSync(fd, buf); buf = ""; }
    }
    if (buf) fs.writeSync(fd, buf);
    fs.closeSync(fd);
    fs.renameSync(tmp, INDEX_NDJSON);           // atomic: never a half-written index
    console.log(`💾  İndeks diske yazıldı (${pIndex.rows.length} oyuncu).`);
  } catch (e) { console.warn("⚠️  İndeks kaydedilemedi:", String(e)); }
}

function loadIndex() {
  if (loadNdjson()) return true;
  try {                                          // legacy single-blob format
    const d = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
    if (!Array.isArray(d.rows) || !d.rows.length) return false;
    pIndex.rows = d.rows; pIndex.at = d.at || 0; pIndex.clans = d.clans || 0;
    console.log(`💾  İndeks diskten yüklendi: ${pIndex.rows.length} oyuncu (${new Date(pIndex.at).toLocaleString("tr-TR")}).`);
    return true;
  } catch { return false; }
}

function loadNdjson() {
  try {
    if (!fs.existsSync(INDEX_NDJSON)) return false;
    /* Read in chunks and split on newlines rather than slurping the file into
       one string: at this size the whole-file read is itself the problem. */
    const fd = fs.openSync(INDEX_NDJSON, "r");
    const chunk = Buffer.alloc(1 << 22);
    const rows = [];
    let tail = "", head = null, bytes;
    while ((bytes = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      const lines = (tail + chunk.toString("utf8", 0, bytes)).split("\n");
      tail = lines.pop();
      for (const ln of lines) {
        if (!ln) continue;
        const o = JSON.parse(ln);
        if (head === null) head = o; else rows.push(o);
      }
    }
    if (tail) { const o = JSON.parse(tail); if (head === null) head = o; else rows.push(o); }
    fs.closeSync(fd);
    if (!rows.length) return false;
    /* Eski dosyalarda sadeleştirilmiş ad (`b`) yok — bir kez burada
       tamamlıyoruz ki arama sıcak döngüsünde regex kalmasın. */
    let eklenen = 0;
    for (const r of rows) {
      if (r.b !== undefined) continue;
      if (!r.f) r.f = fold(r.name);
      const b = r.f.replace(/[^a-z0-9]/g, "");
      if (b !== r.f) { r.b = b; eklenen++; }
    }
    if (eklenen) console.log(`   ↳ ${eklenen} süslü ad için arama biçimi hazırlandı.`);
    pIndex.rows = rows; pIndex.at = head?.at || 0; pIndex.clans = head?.clans || 0;
    if (head?.done) pIndex.phase = "done";
    console.log(`💾  İndeks diskten yüklendi: ${rows.length} oyuncu / ${pIndex.clans} klan (${new Date(pIndex.at).toLocaleString("tr-TR")}).`);
    return true;
  } catch (e) { console.warn("⚠️  İndeks okunamadı:", String(e)); return false; }
}

/*
  Build the searchable player index.

  Phase 1 — Path of Legends ladders, one call per location. These are the only
  rows that carry ladder medals and a world rank.
  Phase 2 — clan rosters. Clan rankings enumerate ~218k distinct clans across
  all locations; pulling the top CRAWL_CLANS of them yields several hundred
  thousand named players that no ranking endpoint would ever list.

  This is still not "every player in the game" — no public Supercell endpoint
  enumerates accounts, and /players only resolves an exact tag. It is the
  largest index the official API can produce. Results are written to disk so a
  restart does not re-crawl.
*/
async function buildPlayerIndex() {
  /* İndeks bayatladıysa (24 saat) taranmış klan kümesini sıfırlıyoruz.
     Yoksa küme kalıcı olduğu için hiçbir kadro bir daha çekilmez ve
     kulüp değiştiren, ad değiştiren oyuncular indekste eski hâlleriyle
     donup kalırdı. */
  if (pIndex.crawled.size && pIndex.at && Date.now() - pIndex.at >= INDEX_TTL) {
    console.log(`🔄  İndeks bayatladı — ${pIndex.crawled.size} klan yeniden taranacak.`);
    pIndex.crawled.clear();
  }

  /* Seed from whatever is already indexed. The crawl is additive: a restart,
     or a later run with a bigger CRAWL_CLANS, extends the index instead of
     throwing away work that took half an hour to collect. */
  const byTag = new Map(pIndex.rows.map((r) => [r.tag, r]));
  const startedWith = byTag.size;
  const put = (row) => {
    const prev = byTag.get(row.tag);
    if (!prev) { byTag.set(row.tag, row); return; }
    // Ladder rows are richer (medals, rank); never let a roster row erase them.
    if (row.elo && !prev.elo) byTag.set(row.tag, { ...prev, ...row });
    else if (!row.elo && !prev.trophies && row.trophies) byTag.set(row.tag, { ...prev, trophies: row.trophies });
  };

  const locs = await cr("/locations?limit=1000");
  const countries = (locs.body.items || []).filter((l) => l.isCountry).map((l) => l.id);

  // ---- Phase 1: ranked ladders -------------------------------------------
  pIndex.phase = "ladder"; pIndex.total = countries.length + 1; pIndex.done = 0;
  await pool(["global", ...countries], 6, async (id) => {
    const r = await crRetry(`/locations/${id}/pathoflegend/players?limit=1000`);
    pIndex.done++;
    for (const p of r.body.items || []) put({
      tag: p.tag, name: p.name, ...names(p.name), level: p.expLevel, elo: p.eloRating,
      rank: id === "global" ? p.rank : null,
      clanName: p.clan?.name || "", clanTag: p.clan?.tag || "", badgeId: p.clan?.badgeId || 0,
    });
  });
  pIndex.rows = [...byTag.values()];
  pIndex.at = Date.now();
  console.log(`🔎  Sıralama indeksi hazır: ${pIndex.rows.length} oyuncu / ${countries.length + 1} bölge.`);
  if (!CRAWL_CLANS) { saveIndex(); return pIndex.rows; }

  // ---- Phase 2: clan rosters ---------------------------------------------
  pIndex.phase = "clans"; pIndex.done = 0; pIndex.total = countries.length;
  const clanRank = new Map();          // clan tag -> best rank seen anywhere
  await pool(countries, 6, async (id) => {
    for (const board of ["clans", "clanwars"]) {
      const r = await crRetry(`/locations/${id}/rankings/${board}?limit=1000`);
      for (const c of r.body.items || []) {
        const best = clanRank.get(c.tag);
        if (best == null || c.rank < best) clanRank.set(c.tag, c.rank);
      }
    }
    pIndex.done++;
  });
  /* Sıra: en iyi rütbe önce, eşitlikte etiket — böylece liste turdan tura
     aynı sırayla çıkar. Neyin tarandığını ise sıraya değil, kaydedilmiş
     etiket kümesine soruyoruz. */
  const ordered = [...clanRank.entries()]
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map((e) => e[0]);
  const kalan = ordered.filter((t) => !pIndex.crawled.has(t));
  const clanTags = kalan.slice(0, Math.max(0, CRAWL_CLANS - pIndex.crawled.size));
  console.log(`🏰  ${clanRank.size} farklı klan bulundu; ${pIndex.crawled.size} tanesi zaten tarandı, ` +
              `${clanTags.length} tanesi taranıyor…`);

  pIndex.phase = "roster"; pIndex.done = 0; pIndex.total = clanTags.length;
  const basladi = Date.now();
  await pool(clanTags, 8, async (tag) => {
    const r = await crRetry(`/clans/${normTag(tag)}`);
    pIndex.done++;
    /* Yalnızca gerçekten cevap veren klan taranmış sayılır; 404/500 alan
       klan bir dahaki tura kalsın. */
    if (r.status === 200) pIndex.crawled.add(tag);
    const badgeId = r.body.badgeId || 0, cName = r.body.name || "", cTag = r.body.tag || tag;
    for (const m of r.body.memberList || []) put({
      tag: m.tag, name: m.name, ...names(m.name), trophies: m.trophies || 0,
      clanName: cName, clanTag: cTag, badgeId,
    });
    /* Publish and checkpoint as we go. Searches use pIndex.rows, so this is
       what makes the growing index usable during the crawl instead of only at
       the end — and what makes a crash cost minutes, not the lot. */
    /* Ara kayıt diski senkron yazıyor, yani o sırada sunucu duruyor.
       2M satırda ~1.2 sn, 5.5M satırda ~3 sn ölçüldü — indeks büyüdükçe
       daha seyrek kaydediyoruz ki arama yapan biri donmayla karşılaşmasın.
       Kaybedilebilecek en fazla iş yine birkaç dakika. */
    const adim = pIndex.rows.length > 3e6 ? 8000 : 2000;
    if (pIndex.done % adim === 0) {
      pIndex.rows = [...byTag.values()];
      pIndex.clans = pIndex.crawled.size;
      pIndex.at = Date.now();
      const gecen = (Date.now() - basladi) / 1000;
      const kalanSn = Math.round((clanTags.length - pIndex.done) / (pIndex.done / gecen));
      console.log(`   … ${pIndex.done}/${clanTags.length} klan · ${pIndex.rows.length} oyuncu · ` +
                  `tahmini kalan ${Math.round(kalanSn / 60)} dk`);
      saveIndex(); saveCrawled();
    }
  });

  pIndex.rows = [...byTag.values()];
  pIndex.byTag = null;
  pIndex.clans = pIndex.crawled.size;
  pIndex.at = Date.now();
  pIndex.phase = "done";
  console.log(`🔎  Oyuncu adı indeksi TAMAM: ${pIndex.rows.length} oyuncu ` +
              `(+${pIndex.rows.length - startedWith}, ${pIndex.clans} klan kadrosu dahil).`);
  saveIndex(); saveCrawled();
  return pIndex.rows;
}
let triedDisk = false;
function ensureIndex() {
  if (!triedDisk && !pIndex.rows.length) { triedDisk = true; loadIndex(); loadCrawled(); }
  const fresh = pIndex.rows.length && Date.now() - pIndex.at < INDEX_TTL;
  /* Taze bir indeks, TAMAMLANMIŞ indeks demek değil: CRAWL_CLANS yükseltilince
     tarama kaldığı yerden devam edebilmeli, yoksa yeni hedef ancak 24 saatlik
     tazelik dolduğunda geçerli olurdu.

     Ama "hedef sayıya ulaştık mı" diye sormak yanlıştı: CRAWL_CLANS (250.000)
     API'nin gösterebildiği klan sayısının (~192.800) ÜSTÜNDE olduğu için bu
     koşul hiç sağlanmıyor ve tarama bitip bitip yeniden başlıyordu —
     her turda ~500 sıralama isteği, boşuna. Doğru soru şu: bir tam tur
     tamamlandı mı? `phase === "done"` bunu söylüyor. */
  const complete = pIndex.phase === "done" || pIndex.clans >= CRAWL_CLANS;
  if (fresh && complete) return null;
  if (!pIndex.building) {
    pIndex.building = buildPlayerIndex()
      .catch((e) => { console.warn("⚠️  Oyuncu indeksi kurulamadı:", String(e)); return []; })
      .finally(() => { pIndex.building = null; });
  }
  return pIndex.building;
}

/* Aramanın kullandığı iki hazır biçim:
     f — katlanmış ad (küçük harf, aksansız, Türkçe uyumlu)
     b — harf/rakam dışı atılmış hâli; yalnızca f ile aynı DEĞİLSE saklanır.
   Süssüz adlar (çoğunluk) için b hiç yer kaplamaz. Bunu indeks kurulurken
   bir kez hesaplamak, her tuş vuruşunda milyonlarca regex çalıştırmaktan
   ölçülebilir biçimde ucuz. */
function names(raw) {
  const f = fold(raw);
  const b = f.replace(/[^a-z0-9]/g, "");
  return b === f ? { f } : { f, b };
}

/* Case- and diacritic-insensitive, Turkish-aware ("İNCİ" === "inci"). */
function fold(s) {
  return String(s || "").toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim();
}

/* Does `name` contain a run matching `q` with at most one edit? Used to catch
   single typos ("cigkofte" vs "cigkofta"). Deliberately cheap: it only tests
   windows of length q, q-1 and q+1 rather than a full edit-distance matrix,
   because this runs against ~470k names on every keystroke. */
function withinOneEdit(name, q) {
  if (name.length > q.length + 12) {
    // long names: only look for the query near a matching first character
    let idx = -1;
    while ((idx = name.indexOf(q[0], idx + 1)) !== -1) {
      if (oneEdit(name.substr(idx, q.length), q) || oneEdit(name.substr(idx, q.length + 1), q)
          || oneEdit(name.substr(idx, q.length - 1), q)) return true;
    }
    return false;
  }
  return oneEdit(name, q);
}
function oneEdit(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/* Clash Royale tags use a 14-character alphabet (no O/I/S/…), which makes a
   pasted tag distinguishable from a name even without the leading '#'. */
const TAG_CHARS = /^[0289PYLQGRJCUV]+$/;
function looksLikeTag(s) {
  const raw = String(s).trim();
  const body = raw.replace(/^#/, "").toUpperCase();
  if (raw.startsWith("#")) return body.length >= 3 && TAG_CHARS.test(body);
  return body.length >= 7 && TAG_CHARS.test(body);
}

/* --- Routes --- */

/* Kişiye özel uçlar tarayıcı önbelleğine girmesin.

   Express bu yanıtlara ETag koyuyor ama Cache-Control koymuyordu; tarayıcı
   da böyle bir yanıtı yeniden kullanabiliyor. Sonuç ölçüldü: hesap
   değiştirdikten sonra ekranda ÖNCEKİ kullanıcının kalan oyun hakları
   yazıyordu (API 3 derken arayüz 2 gösteriyordu), /api/auth/me için de
   aynı risk vardı — ortak bilgisayarda önceki kişinin adı görünebilirdi.
   Sıralama/kart gibi herkese aynı olan uçlar bunun dışında. */
app.use(["/api/auth", "/api/games", "/api/quiz", "/api/feedback", "/api/board", "/api/messages", "/api/pro"], (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.get("/api/health", (req, res) => res.json({ ok: true, hasToken: !!TOKEN }));

/* ---------- anlık kullanıcı sayacı ----------
   Her API isteği işaretleniyor. Sayfa dosyaları (HTML/CSS) sayılmıyor;
   önbellekten açılan bir sekme "kullanıcı geldi" demek olmadığı gibi,
   her görsel isteği de ayrı ziyaret sayılmamalı. Site zaten açılışta
   API çağırıyor, yani gerçek ziyaretçi kaçmıyor.

   Sayaç bellekte, ham IP tutmuyor — ayrıntı ve gerekçe anlik.js'te. */
const anlik = require("./anlik");
app.use("/api", (req, res, next) => {
  /* `auth` bu dosyanın çok aşağısında tanımlı; burada doğrudan ada
     başvurmak yerine modülü istek anında alıyoruz (require önbellekli,
     maliyeti yok). Böylece dosyadaki sıralama değişse de kırılmıyor. */
  try { anlik.isaretle(req, require("./auth").readSession(req)); }
  catch { /* sayaç hiçbir koşulda isteği düşürmemeli */ }
  next();
});

/*
  Player search. Returns a LIST — it never guesses a single profile.
  An exact tag short-circuits to the real lookup; a name is matched against the
  index above (exact name > prefix > substring, strongest ladder rating first).
*/
app.get("/api/players/search", async (req, res) => {
  try {
    const q = String(req.query.name || "").trim();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const badge = await badgeLookup();
    const base = { query: q, indexed: pIndex.rows.length, ready: true, items: [] };

    if (!q) return res.json(base);

    if (looksLikeTag(q)) {
      const { status, body } = await cr(`/players/${normTag(q)}`);
      if (status === 200 && body.tag) return res.json({
        ...base, exact: true, items: [{
          tag: body.tag, name: body.name, level: body.expLevel, trophies: body.trophies,
          elo: body.currentPathOfLegendSeasonResult?.trophies ?? null,
          clanName: body.clan?.name || "", clanTag: body.clan?.tag || "",
          badge: badge(body.clan?.badgeId),
        }],
      });
      return res.json({ ...base, exact: true, notFound: true });
    }

    if (q.length < 2) return res.json(base);

    // Index still warming up: answer immediately with progress, don't hang.
    const building = ensureIndex();
    if (building && !pIndex.rows.length) {
      return res.json({ ...base, ready: false, progress: { phase: pIndex.phase, done: pIndex.done, total: pIndex.total } });
    }

    /* Folded names are precomputed at index time (`f`); folding half a million
       names on every keystroke would not be survivable. */
    const f = fold(q);
    /* Players decorate their names heavily ("2.6❄️자전거", "Rin✨安之"), so a
       plain substring test misses obvious matches. Alongside exact / prefix /
       substring we compare an alphanumeric-only form of both sides, and for
       short queries allow one edit (a typo or a missing letter). */
    const bare = f.replace(/[^a-z0-9]/g, "");
    const rows = pIndex.rows;
    let hits = [];                       // rozetli ayrımında yeniden atanıyor

    /* ANA GEÇİŞ — gerçek eşleşmelerin hepsi.
       Önce katlanmış ad (`f`), sonra süsleri atılmış ad (`b`). `b` yalnızca
       ada süs girmişse saklanıyor; girmemişse iki biçim aynı olur ve ikinci
       test boşuna dönmez. İkisi de indeks kurulurken hesaplandığı için bu
       döngüde tek bir regex bile çalışmıyor — eskiden her satır için her tuş
       vuruşunda bir regex vardı ve aramanın çoğu oraya gidiyordu. */
    /* "ab" gibi iki harflik aramalar 28 binden fazla satır tutturuyor.
       Hepsini toplayıp sıralamak, kullanıcının hiç göremeyeceği sonuçlar
       için yapılan saf iş. Sayımı tam tutuyoruz ama alt katmanlarda
       (içeriyor / süslü-içeriyor) belli sayıdan sonra biriktirmiyoruz;
       eşit ve baştan eşleşenler her zaman toplanır, yani en iyi sonuç
       hiçbir koşulda elenmez. */
    const KATMAN_TAVANI = 3000;
    let alt3 = 0, alt2 = 0, total = 0;
    const bakBare = bare.length >= 3;
    for (let i = 0; i < rows.length; i++) {
      const p = rows[i];
      const n = p.f || (p.f = fold(p.name));
      let score = n === f ? 5 : n.startsWith(f) ? 4 : n.includes(f) ? 3 : 0;
      if (!score && bakBare) {
        const nb = p.b;                    // yalnızca süslü adlarda dolu
        if (nb !== undefined)
          score = nb === bare ? 5 : nb.startsWith(bare) ? 4 : nb.includes(bare) ? 2 : 0;
      }
      if (!score) continue;
      total++;
      if (score >= 4) hits.push({ score, p });
      else if (score === 3) { if (alt3++ < KATMAN_TAVANI) hits.push({ score, p }); }
      else if (alt2++ < KATMAN_TAVANI) hits.push({ score, p });
    }

    /* YAZIM HATASI GEÇİŞİ — "cigkofte" yazıp "cigkofta"yı bulmak için.
       Pahalı olduğu için yalnızca gerçek eşleşmeler sayfayı dolduramadıysa
       çalışır; "ahmet" gibi binlerce sonucu olan aramalarda hiç girilmez.
       En düşük öncelikli katman zaten bu, yani bir şey kaybettirmiyor. */
    if (hits.length < limit && bare.length >= 4) {
      const bulundu = new Set(hits.map((h) => h.p.tag));
      for (let i = 0; i < rows.length; i++) {
        const p = rows[i];
        if (bulundu.has(p.tag)) continue;
        if (withinOneEdit(p.b !== undefined ? p.b : p.f, bare)) { hits.push({ score: 1, p }); total++; }
      }
    }
    // Best match first; within a tier, ranked players outrank roster-only ones.
    hits.sort((a, b) => b.score - a.score
      || (b.p.elo || 0) - (a.p.elo || 0)
      || (b.p.trophies || 0) - (a.p.trophies || 0));
    const pro = await proPlayers();
    /* Rozetli hesaplar sayfanın DIŞINDA kalmasın: 100 sonuçluk kesitten
       önce, eşleşenlerin hepsi arasından rozetlileri öne çekiyoruz.
       Yoksa 145 sonuçlu bir aramada ilk 100'e girmeyen bir pro hiç
       görünmezdi.

       Sıralama DEĞİL tek geçişli ayırma, üstelik hazır bir küme üzerinden.
       Önce sort denendi: her karşılaştırmada etiket yeniden normalize
       edildiği için arama ortancası 344 ms'den 482 ms'e çıktı. Ayırmaya
       geçince 426 ms oldu, çünkü satır başına hâlâ bir normalize vardı.
       Şimdi küme önceden kuruluyor ve döngüde yalnızca Set araması var —
       etiketler zaten API'den büyük harfle geldiği için dönüştürme gerekmiyor. */
    if (hits.length && rozetliTaglar(pro).size) {
      const kume = rozetliTaglar(pro);
      const on = [], arka = [];
      for (const h of hits) (kume.has(h.p.tag) ? on : arka).push(h);
      if (on.length) hits = on.concat(arka);
    }

    let items = hits.slice(0, limit).map(({ p }) => rozetle({
      tag: p.tag, name: p.name, level: p.level ?? null, elo: p.elo ?? null,
      trophies: p.trophies ?? null, rank: p.rank ?? null,
      clanName: p.clanName || "", clanTag: p.clanTag || "", badge: badge(p.badgeId),
    }, p.tag, pro, p.elo));

    /* RESMİ HESAPLAR EN ÜSTE.

       Ölçüldü: "hypnos" aramasında aynı adı taşıyan 100 hesap çıkıyor ve
       aranan gerçek hesap 26. sıradaydı — pratikte bulunamıyor. Bu yüzden
       tanınmış hesaplar listenin başına alınıyor. İndekste hiç olmasalar
       bile görünsünler diye bilgileri canlı çekilip önbelleğe alınıyor. */
    const resmi = verified.matches(q);
    if (resmi.length) {
      const ustler = [];
      for (const v of resmi) {
        const t = verified.normTag(v.tag);
        const mevcut = items.find((x) => verified.normTag(x.tag) === t);
        if (mevcut) { items = items.filter((x) => x !== mevcut); ustler.push({ ...mevcut, verified: true, note: v.note }); continue; }
        const canli = await cached("vp:" + t, 600e3, async () => {
          const r = await cr(`/players/${encodeURIComponent(t).replace("%23", "%23")}`);
          return r.status === 200 ? r.body : null;
        }).catch(() => null);
        if (!canli) continue;
        ustler.push({
          tag: canli.tag, name: canli.name, level: canli.expLevel ?? null,
          elo: canli.currentPathOfLegendSeasonResult?.trophies ?? null,
          trophies: canli.trophies ?? null, rank: null,
          clanName: canli.clan?.name || "", clanTag: canli.clan?.tag || "",
          badge: badge(canli.clan?.badgeId), verified: true, note: v.note,
        });
      }
      items = [...ustler, ...items].slice(0, limit);
    }

    res.json({
      ...base, total,
      partial: pIndex.phase !== "done" && pIndex.phase !== "",
      items,
    });
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

app.get("/api/players/index", (req, res) => {
  ensureIndex();
  res.json({
    indexed: pIndex.rows.length, ready: !!pIndex.rows.length,
    phase: pIndex.phase, done: pIndex.done, total: pIndex.total,
    clans: pIndex.clans, builtAt: pIndex.at,
  });
});

app.get("/api/player/:tag", async (req, res) => {
  try {
    const { status, body } = await cr(`/players/${normTag(req.params.tag)}`);
    if (status === 200 && body.clan) body.clan.badge = (await badgeLookup())(body.clan.badgeId);
    // Profil başlığındaki arena adı da Türkçe olsun (bkz. arenaNames).
    if (status === 200 && body.arena?.name) body.arena.nameTR = arenaTR(await arenaNames(), body.arena.name);
    // Rozetler profilde de görünsün (resmi hesap tiki + pro).
    if (status === 200 && body.tag) {
      const rz = rozetle({}, body.tag, await proPlayers(),
                         body.currentPathOfLegendSeasonResult?.trophies);
      if (rz.verified) { body.verified = true; body.verifiedNote = rz.note; }
      if (rz.pro) { body.pro = true; body.proRank = rz.proRank; }
    }
    res.status(status).json(body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

app.get("/api/player/:tag/battlelog", async (req, res) => {
  try {
    const { status, body } = await cr(`/players/${normTag(req.params.tag)}/battlelog`);
    /* Savaş günlüğündeki her oyuncuya rozetlerini iliştir: karşına pro bir
       oyuncu ya da tanınmış bir hesap çıktıysa günlükte de görünsün. */
    if (status === 200 && Array.isArray(body)) {
      const pro = await proPlayers();
      for (const b of body)
        for (const taraf of [...(b.team || []), ...(b.opponent || [])])
          if (taraf && taraf.tag) rozetle(taraf, taraf.tag, pro);
    }
    res.status(status).json(body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Clan detail.

  `memberList` is missing data the clan screen needs: `expLevel` comes back as
  0 for every member (an upstream quirk — the same player reports level 69 via
  /players/{tag}), and there is no ranked-league information at all. So each
  member is resolved individually and merged in. That is ~50 extra calls per
  clan, which is why the result is cached.
*/
app.get("/api/clan/:tag", async (req, res) => {
  try {
    const tag = normTag(req.params.tag);
    const data = await cached("clan:" + tag, 600e3, async () => {
      const { status, body } = await cr(`/clans/${tag}`);
      if (status !== 200 || !body.tag) return { status, body };
      const badge = await badgeLookup();
      body.badge = badge(body.badgeId);

      const details = await pool(body.memberList || [], 8, async (m) => {
        try { const r = await crRetry(`/players/${normTag(m.tag)}`); return r.status === 200 ? r.body : null; }
        catch { return null; }
      });
      (body.memberList || []).forEach((m, i) => {
        const p = details[i];
        if (!p) return;
        m.expLevel = p.expLevel ?? m.expLevel;
        const pol = p.currentPathOfLegendSeasonResult;
        m.leagueMedals = pol?.trophies ?? null;   // ranked medals this season
        m.leagueRank = pol?.rank ?? null;         // world rank, if ranked
        m.bestTrophies = p.bestTrophies ?? null;
      });
      /* Arena adını Türkçeleştir. API "Spirit Square" diyor, oyun ise
         Türkçede başka bir ad gösteriyor; kullanıcı ekranda gördüğü adı
         tanısın diye çeviriyoruz. Çevirisi olmayan yeni arenalar
         İngilizce kalır. */
      const arenaAd = await arenaNames();
      (body.memberList || []).forEach((m) => {
        if (m.arena?.name) m.arena.nameTR = arenaTR(arenaAd, m.arena.name);
      });
      return { status, body };
    });
    res.status(data.status).json(data.body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Search clans by NAME. This one the API really does support (unlike players),
  but it rejects anything shorter than 3 characters with a 400, so short
  queries are answered locally instead of burning a request.
*/
app.get("/api/clans/search", async (req, res) => {
  try {
    const q = String(req.query.name || "").trim();
    if (q.length < 3) return res.json({ items: [], query: q, tooShort: true });

    const badge = await badgeLookup();

    // A pasted clan tag should resolve to that clan, not to a name match.
    if (looksLikeTag(q)) {
      const { status, body } = await cr(`/clans/${normTag(q)}`);
      if (status === 200 && body.tag) return res.json({
        query: q, exact: true,
        items: [{ tag: body.tag, name: body.name, members: body.members, score: body.clanScore,
                  type: body.type, required: body.requiredTrophies, warTrophies: body.clanWarTrophies,
                  region: body.location?.name || "", badge: badge(body.badgeId) }],
      });
      return res.json({ query: q, exact: true, notFound: true, items: [] });
    }

    const { status, body } = await cr(`/clans?name=${encodeURIComponent(q)}&limit=30`);
    if (status !== 200) return res.status(status).json({ ...body, query: q, items: [] });
    res.json({
      query: q,
      items: (body.items || []).map((c) => ({
        tag: c.tag, name: c.name, members: c.members, score: c.clanScore,
        type: c.type, required: c.requiredTrophies, warTrophies: c.clanWarTrophies,
        region: c.location?.name || "", badge: badge(c.badgeId),
      })),
    });
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

// Attach the clan crest to every ranking row that names a clan.
async function withPlayerBadges(body) {
  const badge = await badgeLookup();
  (body.items || []).forEach((p) => { if (p.clan) p.clan.badge = badge(p.clan.badgeId); });
  return body;
}

/* Sıralama uçlarının ömrü. Bu tablolar dakikada bir değişmiyor; önbelleksiz
   bırakıldıklarında her sayfa açılışı Supercell'e gidiyordu ve ölçtüğümüz
   gecikme tek başına 240–800 ms idi. */
const RANK_TTL = 600e3;   // 10 dk

// Trophy Road / global trophy rankings
app.get("/api/rankings/global", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const loc = req.query.location || "global";
    const data = await cachedSWR(`glb:${loc}:${limit}`, RANK_TTL, 3600e3, async () => {
      const { status, body } = await cr(`/locations/${loc}/rankings/players?limit=${limit}`);
      return { status, body: await withPlayerBadges(body) };
    });
    res.status(data.status).json(data.body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Path of Legends (Nihai Kademe) ranked ladder.

  The ranking payload has no deck in it — the "aktif deste" column was empty
  because there is nothing to fill it with. Each listed player is therefore
  resolved to pick up `currentDeck`, which also gives the exact evolution
  slots. That is one call per row, so it is cached and capped.
*/
app.get("/api/rankings/pathoflegend", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const loc = req.query.location || "global";
    const withDecks = req.query.decks !== "0";
    /* Soğukken ölçülen süre 4,9 sn — 100 oyuncunun son maç destesi toplanıyor.
       Bayat kopya beklemeden verilir, yenileme arkada döner. */
    const data = await cachedSWR(`pol:${loc}:${limit}:${withDecks}`, 600e3, 3600e3, async () => {
      const { status, body } = await cr(`/locations/${loc}/pathoflegend/players?limit=${limit}`);
      await withPlayerBadges(body);
      if (!withDecks || status !== 200) return { status, body };

      const rows = (body.items || []).slice(0, Math.min(limit, 100));
      const heroSet = await heroOnlyCards();
      /*
        The deck comes from the player's LAST RANKED BATTLE, not their profile's
        `currentDeck`. Two reasons, and both matter here:

        · `currentDeck` is whatever is sitting in the slot right now, which is
          not necessarily what they played — and its `evolutionLevel` means
          "unlocked", not "slotted", so a top account flags ~53 of 122 cards and
          the evolutions had to be guessed at.
        · A battle log says exactly what was played, so evolutions are real and
          the hero slot can be separated out properly.

        Same cost as before: one call per row.
      */
      const logs = await pool(rows, 8, async (p) => {
        try {
          const r = await crRetry(`/players/${normTag(p.tag)}/battlelog`);
          if (!Array.isArray(r.body)) return null;
          return r.body.find((b) => b.type === "pathOfLegend" && b.team?.[0]?.cards?.length === 8)
              || r.body.find((b) => b.team?.[0]?.cards?.length === 8) || null;
        } catch { return null; }
      });
      rows.forEach((p, i) => {
        const b = logs[i];
        const cards = b?.team?.[0]?.cards;
        if (!cards) return;
        p.deck = playedDeck(cards, heroSet);
        p.deckAt = b.battleTime || "";
        p.deckRanked = b.type === "pathOfLegend";
      });
      // Sıralama satırlarında da rozetler görünsün (madalyon kuralı dahil).
      const pro = await proPlayers();
      (body.items || []).forEach((p) => { if (p.tag) rozetle(p, p.tag, pro, p.eloRating); });
      return { status, body };
    });
    res.status(data.status).json(data.body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Shape the deck from one battle for display.

  Ordered so the three special slots come first: evolutions, then the hero,
  then a champion if there is one, then the rest by elixir. Coming from a
  battle log, every flag here is what was actually played rather than what the
  account happens to own.
*/
function playedDeck(cards, heroSet) {
  // Exactly the split used for meta decks: evolutions and the hero slot are
  // both flagged `evolutionLevel` by the API and have to be told apart.
  const { evos, heroes } = splitSlots(cards.filter((c) => c.evolutionLevel), heroSet, cards, true);
  const special = new Set([...evos, ...heroes].map((c) => c.id));
  const champ = cards.filter((c) => !special.has(c.id) && c.rarity === "champion");
  champ.forEach((c) => special.add(c.id));
  const rest = cards.filter((c) => !special.has(c.id))
    .sort((a, b) => (a.elixirCost || 0) - (b.elixirCost || 0));
  return [...evos.map((c) => metaCard(c, true, false)),
          ...heroes.map((c) => metaCard(c, false, true)),
          ...champ.map((c) => metaCard(c, false, false)),
          ...rest.map((c) => metaCard(c, false, false))];
}

// Clan trophy rankings
app.get("/api/rankings/clans", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const loc = req.query.location || "global";
    const data = await cachedSWR(`klan:${loc}:${limit}`, RANK_TTL, 3600e3, async () => {
      const { status, body } = await cr(`/locations/${loc}/rankings/clans?limit=${limit}`);
      const badge = await badgeLookup();
      (body.items || []).forEach((c) => { c.badge = badge(c.badgeId); });
      return { status, body };
    });
    res.status(data.status).json(data.body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Clan WAR rankings — a separate ladder from clan score. Note that its
  `clanScore` field carries WAR trophies, not the regular clan score, so the
  frontend must label it accordingly.
*/
app.get("/api/rankings/clanwars", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const loc = req.query.location || "global";
    const data = await cachedSWR(`savas:${loc}:${limit}`, RANK_TTL, 3600e3, async () => {
      const { status, body } = await cr(`/locations/${loc}/rankings/clanwars?limit=${limit}`);
      const badge = await badgeLookup();
      (body.items || []).forEach((c) => { c.badge = badge(c.badgeId); });
      return { status, body };
    });
    res.status(data.status).json(data.body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

// Locations, so the frontend can offer a country filter (cached a day).
app.get("/api/locations", async (req, res) => {
  try {
    const data = await cached("locations", 864e5, async () => {
      const { body } = await cr("/locations?limit=1000");
      return { items: (body.items || []).filter((l) => l.isCountry || l.id === 57000006)
        .map((l) => ({ id: l.id, name: l.name, code: l.countryCode || "" })) };
    });
    res.json(data);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Character renders ("kahraman görselleri") — the full-body art of the unit on
  a card, as opposed to the card frame. The Clash Royale API does not ship
  these at all; RoyaleAPI publishes them, so we read its asset index once and
  match by exact card name.

  Matching is deliberately EXACT. Loose/contains matching looked tempting (it
  lifted coverage from 76 to 89) but every rescue it found was a different
  unit: Royal Giant -> giant, Zap -> zappies, Boss Bandit -> bandit,
  Cannon -> cannon_cart, Golem -> elixir_golem. Showing the wrong character is
  worse than showing none, so cards without their own render simply fall back
  to the card artwork.

  Spells, buildings and several newer troops have no render; that is expected.
*/
const CHR_BASE = "https://royaleapi.github.io/cr-api-assets";
const CHR_INDEX = (dir) => `https://api.github.com/repos/RoyaleAPI/cr-api-assets/contents/${dir}`;
const chrKey = (s) => String(s).toLowerCase().replace(/\.png$/, "").replace(/[^a-z0-9]/g, "");

/*
  Card kinds. The Clash Royale API's /cards has no type field at all (just
  name/id/maxLevel/elixirCost/iconUrls/rarity), so "is this a character or a
  spell?" cannot be answered from it. RoyaleAPI's card data has `type`
  (Troop 87 / Building 14 / Spell 19), which is what the Kahramanlar section
  needs: a spell like Arrows or The Log has no hero to show.
*/
const CARD_DATA = "https://royaleapi.github.io/cr-api-data/json/cards.json";
let kindMap = null;
async function cardKinds() {
  if (kindMap) return kindMap;
  kindMap = new Map();
  try {
    const j = await (await fetch(CARD_DATA)).json();
    j.forEach((c) => kindMap.set(chrKey(c.name), c.type));
    console.log(`🃏  Kart tipi eşlemesi yüklendi (${kindMap.size} kart).`);
  } catch (e) { console.warn("⚠️  Kart tipleri alınamadı:", String(e)); }
  return kindMap;
}

let chrMap = null;
async function characterArt() {
  if (chrMap) return chrMap;
  chrMap = new Map();
  try {
    const [chr, champs] = await Promise.all(
      ["chr", "chr_champions"].map(async (d) =>
        (await (await fetch(CHR_INDEX(d))).json()).map((x) => x.name).filter((n) => n.endsWith(".png"))));
    // "_dl" files are byte-identical duplicates of the plain render — skip them.
    chr.filter((f) => !/_dl\.png$/.test(f))
       .forEach((f) => chrMap.set(chrKey(f), `${CHR_BASE}/chr/${f}`));
    champs.forEach((f) =>
      chrMap.set(chrKey(f.replace(/^champion_hires_/, "").replace(/_dl$/, "")), `${CHR_BASE}/chr_champions/${f}`));
    console.log(`🦸  Karakter görseli eşlemesi yüklendi (${chrMap.size} karakter).`);
  } catch (e) {
    console.warn("⚠️  Karakter görselleri alınamadı:", String(e));
  }
  return chrMap;
}

/*
  The "Kahramanlar" collection.

  "Kahraman" is a specific in-game feature, not a category anything in the API
  exposes: a fixed set of cards you unlock with hero gold ("200 kahraman altını
  topladığında istediğin kahramanı açabilirsin"). It is NOT "every card that
  happens to have a character render" — that earlier guess pulled in ~60 cards
  and still missed Barbarian Barrel, Tombstone and Mega Minion, which the game
  does list. There is no endpoint and no dataset for it, so the roster is the
  one the game shows, in the game's own order.

  Champions (Archer Queen, Golden Knight, …) are a card rarity and belong to
  the "Şampiyon" filter, not here.
*/
const HERO_ROSTER = [
  "Valkyrie", "Barbarian Barrel", "Wizard", "Mini P.E.K.K.A",
  "Knight", "Goblins", "Bandit", "Tombstone",
  "Magic Archer", "Balloon", "Dark Prince", "Bowler",
  "Giant", "Musketeer", "Ice Golem", "Mega Minion",
];

/*
  Real hero portraits, dropped in by hand.

  The gold-framed portrait the game shows for a hero is not published anywhere:
  it is not in RoyaleAPI's asset repo (no heroes/, hero/, prestige/ or
  cards-prestige/ directory exists), and `cards-gold` is a different cosmetic —
  the ordinary card art in a gold frame, not the hero's own artwork. In the
  game's data the feature is called "prestige" and the images live inside
  Supercell's packed .sc files, so there is nothing to fetch.

  So the site simply looks for them on disk. Anything present in
  assets/img/heroes/ is used as-is (it already carries its own frame); anything
  missing falls back to the character render with a CSS frame drawn around it.
  Adding a file is enough — no code change, no restart needed beyond the cache.
*/
const HERO_IMG_DIR = path.join(__dirname, "..", "assets", "img", "heroes");
const heroSlug = (name) => String(name).toLowerCase()
  .replace(/[.'’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function heroPortrait(name) {
  const slug = heroSlug(name);
  for (const ext of ["png", "webp", "jpg", "jpeg"]) {
    if (fs.existsSync(path.join(HERO_IMG_DIR, `${slug}.${ext}`)))
      return `assets/img/heroes/${slug}.${ext}`;
  }
  return "";
}

app.get("/api/heroes", async (req, res) => {
  try {
    /* Short cache on purpose: the portraits are read off disk, so dropping a
       new file into assets/img/heroes/ has to show up without a restart. */
    const data = await cached("heroes:roster", 15e3, async () => {
      const [cards, art, kinds] = await Promise.all([
        cached("cards", 3600e3, async () => (await cr(`/cards`)).body),
        characterArt(),
        cardKinds(),
      ]);
      const byName = new Map((cards.items || []).map((c) => [c.name, c]));
      /* Roster order is the game's, so no sort. Four of the sixteen (Tombstone,
         Dark Prince, Mega Minion and — as a spell — Barbarian Barrel) have no
         standalone character render in the asset index; those fall back to the
         card art rather than being dropped or given another unit's picture. */
      const heroes = HERO_ROSTER.map((name) => {
        const c = byName.get(name);
        if (!c) return null;
        return {
          id: c.id, name: c.name, rarity: c.rarity, elixir: c.elixirCost,
          champion: false, kind: kinds.get(chrKey(c.name)) || "",
          cardArt: c.iconUrls?.medium || "",
          art: art.get(chrKey(c.name)) || "",
          // The real in-game portrait, if one has been placed on disk.
          portrait: heroPortrait(name),
          slug: heroSlug(name),
        };
      }).filter(Boolean);
      const have = heroes.filter((h) => h.portrait).length;
      return {
        champions: [], heroes,
        counts: {
          heroes: heroes.length, roster: HERO_ROSTER.length,
          withArt: heroes.filter((h) => h.art).length,
          portraits: have,
          // Which files the site is still waiting for, so the UI can say so.
          missingPortraits: heroes.filter((h) => !h.portrait).map((h) => h.slug + ".png"),
          missing: HERO_ROSTER.filter((n) => !byName.has(n)),
        },
      };
    });
    res.json(data);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Card traits, for the guessing game.

  The official /cards payload is only name/id/maxLevel/elixirCost/iconUrls/
  rarity — nothing you could build a question out of beyond cost and rarity,
  which is why the game ran out of things to ask and started guessing early.
  RoyaleAPI's cards_stats.json carries the combat model: whether a unit can hit
  air, whether it flies, how fast it moves, whether it only attacks buildings,
  and how many figures the card deploys. Joined by card id.
*/
/* Resmi / tanınmış hesaplar (aramada en üstte + tik). Liste server/verified.js. */
const verified = require("./verified");
/* Yöneticinin siteden verdiği rozetler + PRO başvuruları (diskte). */
const badges = require("./badges");

/* ---------- PRO rozeti: Nihai Kademe dünya ilk 100 ----------

   Elle tutulan "resmi hesap" listesinden farklı: bu liste her gün
   değişiyor, o yüzden sabit yazılamaz — canlı sıralamadan okunup 10
   dakika önbellekte tutuluyor. Rozet "bu oyuncu şu an dünyada ilk
   100'de" demektir; sıra numarası da taşınıyor.

   Sıralama ucunu değil doğrudan API'yi çağırıyoruz: sıralama ucu her
   oyuncunun destesini de topluyor (100 ek istek), burada gereksiz. */
const PRO_TOP = 100;
let proMap = new Map(), proAt = 0;
async function proPlayers() {
  if (proMap.size && Date.now() - proAt < 600e3) return proMap;
  try {
    const r = await cr(`/locations/global/pathoflegend/players?limit=${PRO_TOP}`);
    if (r.status === 200 && Array.isArray(r.body.items)) {
      proMap = new Map(r.body.items.map((p, i) => [verified.normTag(p.tag), p.rank ?? i + 1]));
      proAt = Date.now();
    }
  } catch (e) { console.warn("⚠️  Pro listesi alınamadı:", String(e)); }
  return proMap;
}
/* Rozetli etiketlerin kümesi (resmi + pro), aramada hızlı ayırma için.
   Pro listesi 10 dakikada bir yenilendiği için küme de onunla birlikte
   yeniden kuruluyor; arada her istekte hazır kümeden okunuyor. */
let rozetKume = null, rozetKumeAt = 0;
function rozetliTaglar(pro) {
  if (rozetKume && rozetKumeAt === proAt) return rozetKume;
  rozetKume = new Set(pro.keys());
  for (const v of verified.PLAYERS) rozetKume.add(verified.normTag(v.tag));
  for (const t of verified.PRO_SET) rozetKume.add(t);
  // Yöneticinin verdiği rozetler de aramada öne çıksın.
  for (const g of badges.listGranted()) rozetKume.add(g.tag);
  rozetKumeAt = proAt;
  return rozetKume;
}
/* Yönetici rozet verince küme bayatlıyor; elle tazeleyebilelim. */
const rozetKumeSifirla = () => { rozetKume = null; };

/* Bir oyuncuya rozetleri ekler. Hem arama satırında hem savaş
   günlüğünde hem canlı akışta aynı işlev kullanılıyor ki rozet
   kuralları tek yerde kalsın. */
/* Rozetler DÖRT kaynaktan gelebilir; hepsi burada birleşiyor:
     1) verified.js listesi          — kodda, kalıcı
     2) yöneticinin verdiği rozet    — diskte (badges.js), siteden yönetilir
     3) o anki dünya ilk 100         — canlı sıralamadan, sıra numarasıyla
     4) madalyon eşiği               — PRO_MIN_MEDALS ve üstü herkes
   `elo` biliniyorsa 4. kural da işler; bilinmiyorsa atlanır. */
function rozetle(nesne, tag, pro, elo) {
  const t = verified.normTag(tag);
  const verilen = badges.get(t);
  /* Yönetici siteden kaldırdıysa kodda sabit yazılı rozet de gösterilmiyor.
     verified.js bir kaynak dosya, çalışırken değiştirilemiyor; gizleme
     listesi bu yüzden var (bkz. badges.js). */
  const yayinciGizli = badges.gizliMi(t, "yayinci");
  const proGizli = badges.gizliMi(t, "pro");

  if (verified.isVerified(t) && !yayinciGizli) {
    nesne.verified = true;
    nesne.note = verified.info(t)?.note || "";
  } else if (verilen && verilen.yayinci) {
    nesne.verified = true;
    nesne.note = badges.KIND_TR.yayinci;
  }

  const r = pro.get(t);
  /* Dünya ilk 100 sıralaması canlı bir gerçek, gizlenemez — o rozet
     "şu an ilk 100'de" demek, bizim verdiğimiz bir ödül değil. */
  if (r) { nesne.pro = true; nesne.proRank = r; }
  else if (proGizli) { /* elle verilen/sabit PRO gizlenmiş */ }
  else if (verified.isPro(t) || (verilen && verilen.pro)) nesne.pro = true;
  else if (elo != null && elo >= verified.PRO_MIN_MEDALS) { nesne.pro = true; nesne.proMedals = true; }
  return nesne;
}

const CARD_STATS = "https://royaleapi.github.io/cr-api-data/json/cards_stats.json";
/* Aynı dosyayı iki yer okuyor (özellikler + savaş değerleri); bir kez indir.
   Hata olursa null kalır, sonraki çağrı yeniden dener. */
let statsRaw = null;
async function cardStatsJson() {
  if (!statsRaw) statsRaw = await (await fetch(CARD_STATS)).json();
  return statsRaw;
}
let traitMap = null;
async function cardTraits() {
  if (traitMap) return traitMap;
  traitMap = new Map();
  try {
    const j = await cardStatsJson();
    /* Joined by NAME, not id: only 18 of the 125 character rows carry a card
       id and none of the 93 troop rows do, so an id join silently matched
       almost nothing. Names are stable across both files.

       `troop` is the card (how many figures it deploys); `characters` is the
       unit it deploys (what it can hit, whether it flies, how fast it moves),
       reached through summon_character. Evolution is NOT taken from here —
       the game data lists only 7 evolutions where the live API knows 53. */
    const chars = new Map((j.characters || []).map((c) => [chrKey(c.name), c]));
    for (const t of j.troop || []) {
      const ch = chars.get(chrKey(t.summon_character || t.name));
      if (!ch) continue;
      traitMap.set(chrKey(t.name), {
        air: !!ch.attacks_air,
        flying: (ch.flying_height || 0) > 0,
        onlyBuildings: !!ch.target_only_buildings,
        speed: ch.speed || 0,                    // 45 slow · 60 medium · 90/120 fast
        // summon_number 0 or 1 is a single figure; 2+ is a squad.
        count: t.summon_number || 0,
        // <=1200 is melee reach; anything beyond it is a ranged attacker.
        range: ch.range || 0,
        hp: ch.hitpoints || 0,
        /* Tahmin oyunu için ek ayırt ediciler. Eskiden yalnızca yukarıdaki
           yedi alan vardı; tür/enderlik/iksir tükenince sorulacak bir şey
           kalmıyor, motor da körlemesine tahmine düşüyordu. Bunlar oyuncunun
           gözle bildiği, "evet/hayır" ile net cevaplanan özellikler. */
        hitSpeed: ch.hit_speed || 0,             // ms; küçük = daha seri
        area: (ch.area_damage_radius || 0) > 0,  // alan hasarı veriyor mu
        shield: (ch.shield_hitpoints || 0) > 0,  // kalkanı var mı
        charge: (ch.charge_range || 0) > 0,      // hızlanarak vuruyor mu
        deathSpawn: !!ch.death_spawn_character,  // ölünce birim bırakıyor mu
        spawner: !!ch.spawn_character,           // sürekli birim üretiyor mu
      });
    }
    /* BİNALAR ve BÜYÜLER de özellik alsın.

       Ölçüldü: yalnız `troop` tablosu okunurken 122 kartın sadece 58'inde
       özellik vardı. Tahmin oyununda bina/büyü çıktığında sorulacak hiçbir
       şey kalmıyor, motor "şunlardan hangisi seninki?" kısayoluna düşüyordu
       (kartların %40'ında). Bu iki tablo o boşluğu dolduruyor. */
    for (const bld of j.building || []) {
      const k = chrKey(bld.name);
      if (traitMap.has(k)) continue;                       // asker kaydı önceliklidir
      traitMap.set(k, {
        kind: "building",
        hp: bld.hitpoints || 0,
        hitSpeed: bld.hit_speed || 0,
        range: bld.range || 0,
        air: !!bld.attacks_air,
        saldirir: (bld.range || 0) > 0,                    // bazı binalar vurmaz, birim üretir
        spawner: !!bld.spawn_character,
        deathDamage: (bld.death_damage || 0) > 0,          // yıkılınca patlıyor mu
        omur: bld.life_time || 0,
      });
    }
    for (const sp of j.spell || []) {
      const k = chrKey(sp.name);
      if (traitMap.has(k)) continue;
      traitMap.set(k, {
        kind: "spell",
        hasar: (sp.damage || 0) > 0,                       // hasar mı veriyor, etki mi
        radius: sp.radius || 0,
        surekli: (sp.life_duration || 0) > 1000,           // anlık mı, süreli mi
        cagirir: !!sp.summon_character,                    // birim çağırıyor mu
        kuleAz: (sp.crown_tower_damage_percent || 0) < 0,  // kuleye az hasar
      });
    }
    console.log(`🎯  Kart özellikleri yüklendi (${traitMap.size} kayıt: asker + bina + büyü).`);
  } catch (e) { console.warn("⚠️  Kart özellikleri alınamadı:", String(e)); }
  return traitMap;
}

/*
  Kart savaş değerleri — "Kart Kapışması" oyunu için: 11. seviyede can ve
  tek vuruş hasarı, bir de vuruş hızı.

  DİKKAT — seviye dizilerinin ölçeği. cards_stats.json her karta
  hitpoints_per_level / damage_per_level diziyor, ama bu diziler birleşik
  seviye ölçeğine göre DEĞİL, kartın kendi enderlik ölçeğine göre: sıradan
  1'den, ender 3'ten, destansı 6'dan, efsanevi 9'dan, şampiyon 11'den
  başlıyor ve hepsi 19'da bitiyor. Dizi uzunlukları bunu doğruluyor
  (19/17/14/11/9). Yani düz index 10 almak efsanevi bir kartın 19.
  seviyesini 11 sanmak olurdu — soruların cevabı yanlış çıkardı.

  Menzilli birimlerin hasarı karakterde değil MERMİDE duruyor (Silahşör,
  Okçu, Büyücü…), bu yüzden mermiye de bakılıyor: 93 birimin 88'i böyle
  kapsanıyor, yalnız karakterle 54'ü kapsanırdı.

  Birden fazla figür çıkaran kartlar (İskelet Ordusu, Barbarlar…) dışarıda:
  "canı daha fazla" sorusu figür başına mı yığın toplamı mı belirsiz kalır.
  Belirsiz soru sormaktansa sormuyoruz.
*/
/* Kartın veri dosyasındaki adı ile API'deki adı her zaman birebir değil:
   API "Archers" derken veri "Archer", API "Fireball" derken veri
   "FireballSpell" diyor. Yalnızca KESİN dönüşümleri deniyoruz — tekil/çoğul
   ve "Spell" son eki.

   Parça eşleme (içeriyor/içeriliyor) bilerek YAPILMIYOR: denendi ve
   "Ice Golem"→"Golem", "Magic Archer"→"Archer", "Little Prince"→"Prince",
   "Giant Snowball"→"Giant" gibi yanlış eşleşmeler üretti. Yanlış özellik,
   tahmin oyununun yanlış cevap vermesi demek; verisi olmayan kartı
   özelliksiz bırakmak buna yeğdir. */
function traitAdaylari(k) {
  const a = [k];
  if (k.endsWith("s")) a.push(k.slice(0, -1)); else a.push(k + "s");
  if (k.endsWith("ies")) a.push(k.slice(0, -3) + "y");
  if (k.endsWith("y")) a.push(k.slice(0, -1) + "ies");
  a.push(k + "spell");
  return a;
}
function traitBul(harita, ad) {
  for (const k of traitAdaylari(chrKey(ad))) { const v = harita.get(k); if (v) return v; }
  return null;
}

const ILK_SEVIYE = { common: 1, rare: 3, epic: 6, legendary: 9, champion: 11 };
const KAPISMA_SEVIYE = 11;
let combatMap = null;
async function cardCombat() {
  if (combatMap) return combatMap;
  combatMap = new Map();
  try {
    const j = await cardStatsJson();
    const chars = new Map((j.characters || []).map((c) => [chrKey(c.name), c]));
    const projs = new Map((j.projectile || []).map((p) => [chrKey(p.name), p]));
    for (const t of j.troop || []) {
      if ((t.summon_number || 0) >= 2) continue;              // yığın kartları elensin
      const ch = chars.get(chrKey(t.summon_character || t.name));
      if (!ch) continue;
      const ilk = ILK_SEVIYE[String(ch.rarity || "").toLowerCase()];
      if (ilk == null) continue;
      const i = KAPISMA_SEVIYE - ilk;                         // enderliğe göre kaydırma
      if (i < 0) continue;
      const hp = ch.hitpoints_per_level?.[i];
      let dmg = ch.damage_per_level?.[i];
      if (dmg == null && ch.projectile) dmg = projs.get(chrKey(ch.projectile))?.damage_per_level?.[i];
      const hiz = ch.hit_speed || 0;
      if (hp == null || dmg == null || !hiz) continue;
      combatMap.set(chrKey(t.name), { hp, dmg, hitSpeed: hiz, level: KAPISMA_SEVIYE });
    }
    console.log(`⚔️  Kart savaş değerleri hazır (${combatMap.size} kart, ${KAPISMA_SEVIYE}. seviye).`);
  } catch (e) { console.warn("⚠️  Kart savaş değerleri alınamadı:", String(e)); }
  return combatMap;
}

/*
  Turkish card names.

  The Clash Royale API answers in English only — there is no Accept-Language
  and no localized name field. The game's own translation table is published as
  texts.json (TID_SPELL_<CARD> → one row per language), which covers 109 of the
  122 cards. The 13 it misses are all cards newer than that snapshot, so they
  are filled in by hand below.
*/
const TEXTS_DATA = "https://royaleapi.github.io/cr-api-data/json/texts.json";
/* Names the published table gets wrong or spells differently from the current
   Turkish client, plus the cards it is simply too old to know. Checked against
   the game's own Kahramanlar screen: "Barbar Fıçısı" (not Varili), "Yaramaz"
   (not Haydut), "Silahşör" (not Silahşor). If one of these ever reads wrong
   in game, this is the line to fix.
   Düzeltildi: "Boss Bandit" burada "Patron Haydut" diye tahmin edilmişti;
   Türkçe istemcide "Boss Haydut" yazıyor (oyundan doğrulandı). */
const TR_NAME_EXTRA = {
  "Barbarian Barrel": "Barbar Fıçısı", "Bandit": "Yaramaz", "Musketeer": "Silahşör",
  "Little Prince": "Küçük Prens", "Goblin Demolisher": "Goblin Yıkıcı",
  "Goblin Machine": "Goblin Makinesi", "Suspicious Bush": "Şüpheli Çalı",
  "Goblinstein": "Goblinstein", "Rune Giant": "Rün Devi", "Berserker": "Cengâver",
  "Boss Bandit": "Boss Haydut", "Ronin": "Ronin", "Void": "Boşluk",
  "Goblin Curse": "Goblin Laneti", "Spirit Empress": "Ruh İmparatoriçe",
  "Vines": "Sarmaşıklar",
};
let trNameMap = null;
async function cardNamesTR() {
  if (trNameMap) return trNameMap;
  trNameMap = new Map(Object.entries(TR_NAME_EXTRA));
  try {
    const j = await (await fetch(TEXTS_DATA)).json();
    let n = 0;
    for (const [tid, v] of Object.entries(j)) {
      if (!/^TID_SPELL_[A-Z0-9_]+$/.test(tid)) continue;
      if (v.en && v.tr && !TR_NAME_EXTRA[v.en]) { trNameMap.set(v.en, v.tr); n++; }
    }
    console.log(`🇹🇷  Türkçe kart adları yüklendi (${n} çeviri + ${Object.keys(TR_NAME_EXTRA).length} elle).`);
  } catch (e) { console.warn("⚠️  Türkçe kart adları alınamadı:", String(e)); }
  return trNameMap;
}


/* ============================================================
   LİG ROZETLERİ — assets/img/ligler/
   ------------------------------------------------------------
   Ligleri artık bir klasör tanımlıyor. Sebebi: RoyaleAPI'deki league1..10
   görselleri bugünkü YEDİ ligle örtüşmüyor ve alt liglerin bugünkü Türkçe
   adları için doğrulanabilir bir kaynak yok. Uydurmak yerine dosya adını
   tek doğru kabul ediyoruz — resmi de adı da oradan geliyor.

   Beklenen ad:  "<numara> - <ad>.<uzantı>"   ör. "7 - Nihai Şampiyon.png"
   Sadece numara da olur ("7.png"): o zaman resim değişir, ad varsayılan kalır.

   Klasör her istekte baştan taranıyor. Önbelleklemek cazip ama yanlış:
   klasörün değişiklik damgası yalnızca dosya EKLENİP silindiğinde değişir,
   var olan bir dosyanın üzerine aynı adla yenisi yazıldığında değişmez —
   yani "7 - Nihai Şampiyon.png"i değiştiren biri değişikliği göremezdi.
   Tarama zaten yedi dosyalık bir dizin okuması; sayfa başına bir kez
   çağrılıyor ve ölçülen süresi 1 ms'nin altında.

   Her dosyanın kendi damgası adresin sonuna ekleniyor (?v=…) ki aynı adla
   değiştirilen bir görsel tarayıcı önbelleğinde takılı kalmasın.
   ============================================================ */
const LIG_KLASOR = path.join(__dirname, "..", "assets", "img", "ligler");
const LIG_UZANTI = /\.(png|webp|avif|jpe?g|gif|svg|bmp)$/i;
/* "7 - Nihai Şampiyon.png" · "lig7_Nihai Şampiyon.webp" · "7.png" */
const LIG_DESEN = /^(?:lig)?\s*(\d{1,2})\s*(?:[-_–—]\s*(.+?))?$/i;

function ligleriOku() {
  const veri = {};
  try {
    for (const dosya of fs.readdirSync(LIG_KLASOR)) {
      if (!LIG_UZANTI.test(dosya)) continue;
      const m = dosya.replace(LIG_UZANTI, "").match(LIG_DESEN);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      if (!(n >= 1 && n <= 20)) continue;
      let sur = 0;
      try { sur = Math.round(fs.statSync(path.join(LIG_KLASOR, dosya)).mtimeMs); } catch {}
      veri[n] = {
        n,
        ad: (m[2] || "").trim(),                       // boşsa: varsayılan ad kalır
        gorsel: `assets/img/ligler/${encodeURIComponent(dosya)}?v=${sur}`,
      };
    }
  } catch { /* klasör yoksa varsayılana düşülür */ }
  return veri;
}

/* Ligler. Klasör boşsa {} döner ve ön yüz eski davranışını sürdürür. */
app.get("/api/leagues", (req, res) => {
  const veri = ligleriOku();
  const items = Object.values(veri).sort((a, b) => a.n - b.n);
  res.set("Cache-Control", "no-store");     // klasör değişince anında görünsün
  res.json({
    items,
    count: items.length,
    klasor: "assets/img/ligler",
    /* Yükleme yapılmadıysa ne yapılacağını uç noktanın kendisi söylesin —
       tarayıcıdan bakan biri de anlasın diye. */
    not: items.length
      ? "Bu ligler klasörden okunuyor."
      : "Klasör boş. 'assets/img/ligler' içine '7 - Nihai Şampiyon.png' biçiminde dosya koyun.",
  });
});


/* ============================================================
   ARKA PLAN FİLİGRANLARI — assets/img/filigran/
   ------------------------------------------------------------
   Ana sayfadaki saydam tokmak gibi, sayfaların boş arka planına oturan
   dekoratif görseller. Kod içine sabit yazmak yerine klasörden okunuyor:
   yeni bir resim eklemek dosyayı klasöre atmaktan ibaret olsun, HTML'e
   dokunmak gerekmesin.

   Adlandırma:
     "1 - tokmak.png"  → sıra numarası verir (hangi sayfaya düşeceğini
                         belirler; aşağıdaki dağıtıma bak)
     "tokmak.png"      → numarasız da olur, alfabetik sıraya girer

   Dosyalar sayfalara SIRAYLA dağıtılıyor (ön yüzdeki filigranYerlestir).
   İki dosya varsa sayfalar arasında dönüşümlü kullanılır — yani bir dosya
   birden çok sayfada görünebilir, hiçbir sayfa boş kalmaz.

   Klasör her istekte taranıyor; sebebi liglerdekiyle aynı (aynı adla üzerine
   yazılan dosya klasör damgasını değiştirmiyor). Damga adresin sonuna
   ekleniyor ki değiştirilen görsel önbellekte takılı kalmasın.
   ============================================================ */
const FILIGRAN_KLASOR = path.join(__dirname, "..", "assets", "img", "filigran");
const FILIGRAN_UZANTI = /\.(png|webp|avif|jpe?g|gif|svg)$/i;

function filigranlariOku() {
  const liste = [];
  try {
    for (const dosya of fs.readdirSync(FILIGRAN_KLASOR)) {
      if (!FILIGRAN_UZANTI.test(dosya)) continue;
      const taban = dosya.replace(FILIGRAN_UZANTI, "");
      const m = taban.match(/^(\d{1,2})\s*[-_–—]\s*(.+)$/);
      let sur = 0;
      try { sur = Math.round(fs.statSync(path.join(FILIGRAN_KLASOR, dosya)).mtimeMs); } catch {}
      liste.push({
        sira: m ? parseInt(m[1], 10) : 999,
        ad: (m ? m[2] : taban).trim(),
        gorsel: `assets/img/filigran/${encodeURIComponent(dosya)}?v=${sur}`,
      });
    }
  } catch { /* klasör yoksa boş liste: sayfalar filigransız çalışır */ }
  return liste.sort((a, b) => a.sira - b.sira || a.ad.localeCompare(b.ad, "tr"));
}

app.get("/api/filigran", (req, res) => {
  const items = filigranlariOku();
  res.set("Cache-Control", "no-store");
  res.json({
    items, count: items.length, klasor: "assets/img/filigran",
    not: items.length
      ? "Bu görseller klasörden okunuyor; sayfalara sırayla dağıtılıyor."
      : "Klasör boş. 'assets/img/filigran' içine '1 - tokmak.png' biçiminde dosya koyun.",
  });
});


/* ---------- Arena adları ----------
   Resmî API arena adını yalnızca İNGİLİZCE veriyor ("Spirit Square"), oysa
   oyun Türkçe oynanınca ekranda "Ruh Meydanı" yazıyor. Kart adlarında
   yaptığımızın aynısını yapıyoruz: oyunun kendi metin dosyasındaki
   TID_INFO_ARENA* satırlarından İngilizce → Türkçe eşlemesi çıkarıyoruz.
   43 arenanın resmî çevirisi orada var; listede olmayanlar için aşağıdaki
   ARENA_TR_EXTRA devreye giriyor. */
/* Metin dosyası biraz geride: ÜST arenalar orada yok. Yeniden ölçtük —
   220 canlı profilde 15 ayrı arena geçiyor, 7'si dosyadan çevriliyor,
   aşağıdaki 8'i hiç yok ve bu 8'i profillerin %91'ini kaplıyor (en sık
   görüleni "Spirit Square", 220 oyuncunun 77'si).

   DİKKAT — aşağıdaki satırlar oyunun resmî metni DEĞİL, bizim çevirimiz.
   Kaynak dosyada bu arenalar bulunmadığı için başka yolu yok. Oyunun
   Türkçesinde başka yazıyorsa buradaki tek satırı düzeltmek yeterli;
   dosyaya bir gün eklenirse resmî çeviri yine de bunları ezmez, çünkü
   arenaNames() önce bu listeyi kuruyor. */
const ARENA_TR_EXTRA = {
  "Spirit Square": "Ruh Meydanı",
  "Little Prince's Tavern": "Küçük Prens'in Meyhanesi",
  "Ultimate Clash Pit": "Nihai Clash Çukuru",
  "Summit of Heroes": "Kahramanlar Zirvesi",
  "Magic Academy": "Sihir Akademisi",
  "Musketeer Street": "Silahşör Sokağı",       // Musketeer = Silahşör (kart adı)
  "Royal Road": "Kraliyet Yolu",
  "Lumberlove Cabin": "Oduncu Kulübesi",       // Lumberjack = Oduncu (kart adı)
  "Valkalla": "Valkalla",                      // özel ad, çevrilmiyor
};
let arenaNameTR = null;
async function arenaNames() {
  if (arenaNameTR) return arenaNameTR;
  arenaNameTR = new Map(Object.entries(ARENA_TR_EXTRA).filter(([, v]) => v));
  try {
    const j = await (await fetch(TEXTS_DATA)).json();
    for (const [tid, v] of Object.entries(j)) {
      if (!/^TID_INFO_ARENA/.test(tid)) continue;
      if (v.en && v.tr && !ARENA_TR_EXTRA[v.en]) arenaNameTR.set(v.en, v.tr);
    }
    console.log(`🏟️  Türkçe arena adları yüklendi (${arenaNameTR.size} arena).`);
  } catch (e) { console.warn("⚠️  Arena adları alınamadı:", String(e)); }
  return arenaNameTR;
}
const arenaTR = (map, name) => (name && map.get(name)) || name || "";

/* Kartın açıldığı arena — bilgi yarışmasının zor soruları için.
   /cards bunu vermiyor; oyunun kendi veri dosyasında var. */
let arenaMap = null;
async function cardArenas() {
  if (arenaMap) return arenaMap;
  arenaMap = new Map();
  try {
    const j = await (await fetch(CARD_DATA)).json();
    j.forEach((c) => { if (c.arena != null) arenaMap.set(chrKey(c.name), c.arena); });
  } catch (e) { console.warn("⚠️  Arena bilgisi alınamadı:", String(e)); }
  return arenaMap;
}

/* Card list, with the Troop/Building/Spell kind and the combat traits
   attached — the official payload has neither, and the card game needs both. */
app.get("/api/cards", async (req, res) => {
  try {
    const data = await cached("cards+kind+traits+tr", 3600e3, async () => {
      const [body, kinds, traits, tr, heroSet] = await Promise.all([
        cached("cards", 3600e3, async () => (await cr(`/cards`)).body),
        cardKinds(),
        cardTraits(),
        cardNamesTR(),
        heroOnlyCards(),
      ]);
      return {
        ...body,
        items: (body.items || []).map((c) => ({
          ...c,
          type: kinds.get(chrKey(c.name)) || "",
          traits: traitBul(traits, c.name),
          nameTR: tr.get(c.name) || c.name,
          // The in-game hero portrait, when one has been placed on disk.
          heroImg: heroPortrait(c.name),
          /* Kahraman yuvası bilgisi ARTIK SUNUCUDAN geliyor. Ön yüz bunu
             kendisi `maxEvolutionLevel` üzerinden çıkarıyordu ve kuralın
             kaçırdığı kartlarda (Yaramaz) yanılıyordu; tek doğru burada. */
          heroOnly: heroSet.has(c.name),
          heroDual: HERO_DUAL.has(c.name),
          /* API'de hiç işaret taşımayan kahraman (Yaramaz). Ön yüz savaş
             günlüklerini kendi eşlediği için aynı kuralı orada da uygulaması
             gerekiyor; "işaretli mi" diye bakmak bu kartlarda çalışmıyor. */
          heroNoFlag: HERO_EXTRA.has(c.name),
        })),
      };
    });
    res.json(data);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Current-season META, derived entirely from ranked BATTLE LOGS.

  Earlier this was built from each top player's `currentDeck`, which cannot
  support win rates and — worse — gets evolutions wrong: in a player profile
  `evolutionLevel` means "this player has UNLOCKED this evolution", so a top
  account flags ~53 of 122 cards and a single deck appears to run 6 of them.

  A battle log says what was actually PLAYED. Measured over 2568 ranked decks
  from live logs:
    · evolutions sit at card index 0-2 and NOWHERE else   (0 outside)
    · the champion sits at index 1-2 and nowhere else     (0 outside)
    · at most one champion per deck
    · 3 evo + 0 champ = 72.6% · 2 evo + 1 champ = 25.0% · 2 evo = 2.3%
  So a deck has three "special" slots, at most one of which is a champion.

  Reading both sides of every battle also yields, per deck: win rate, and per
  player the peak ranked medals reached plus how many games they played on it.
*/
const META_TOP_PLAYERS = 160;  // ladder accounts whose logs we read (~1 call each)
const META_DECKS = 16;         // decks returned
const META_DECK_PLAYERS = 12;  // players listed per deck
const META_MIN_BATTLES = 40;   // below this a win rate is noise, not a signal

function metaCard(c, isEvo, isHero) {
  return {
    id: c.id, name: c.name, elixir: c.elixirCost,
    icon: c.iconUrls?.medium, evoIcon: c.iconUrls?.evolutionMedium,
    evo: !!isEvo, hero: !!isHero,
    champion: c.rarity === "champion", rarity: c.rarity,
    heroImg: isHero ? heroPortrait(c.name) : "",
  };
}

async function buildMeta(count) {
  /*
    Whose battle logs to read.

    Reading only the world top 50 wrecked the win rates: those accounts won
    61.7% of their games while their opponents won 25.1%, so a deck's rate
    mostly recorded who happened to be holding it. Spreading the sample evenly
    across the whole 1000-deep ladder halves that gap (to ~19.6 points); the
    remainder is removed by the expected-wins adjustment further down.
  */
  const ladder = (await cr(`/locations/global/pathoflegend/players?limit=1000`)).body.items || [];
  const step = Math.max(1, Math.floor(ladder.length / count));
  const players = [];
  for (let i = 0; i < ladder.length && players.length < count; i += step) players.push(ladder[i]);
  const sampledTags = new Set(players.map((p) => p.tag));

  const logs = await pool(players, 6, async (p) => {
    try { return (await crRetry(`/players/${normTag(p.tag)}/battlelog`)).body; }
    catch { return []; }
  });

  const heroSet = await heroOnlyCards();
  const decks = new Map();
  const seenBattles = new Set();   // the same battle appears in both players' logs
  const slotMix = new Map();       // "3e0c" -> how many decks ran that mix
  let observations = 0;
  // Base win rates of the two sides, used to de-bias each deck below.
  let sampN = 0, sampW = 0, oppN = 0, oppW = 0;

  for (const log of logs) {
    if (!Array.isArray(log)) continue;
    for (const b of log) {
      if (b.type !== "pathOfLegend") continue;
      const t = b.team?.[0], o = b.opponent?.[0];
      if (!t || !o) continue;
      const id = [b.battleTime, ...[t.tag, o.tag].sort()].join("|");
      if (seenBattles.has(id)) continue;
      seenBattles.add(id);

      for (const [me, them] of [[t, o], [o, t]]) {
        const cards = me.cards || [];
        if (cards.length !== 8) continue;
        observations++;

        /* How many special slots a real deck actually runs. Reported to the UI
           because the answer is surprising: three evolutions is the NORM, not
           an error in our labelling. */
        {
          /* Counted AFTER separating the hero slot from the evolutions, so the
             mix reported to the UI is the real one (2 evo + 1 hero), not the
             API's raw view that calls all three evolutions. */
          const { evos, heroes } = splitSlots(cards.filter((c) => c.evolutionLevel), heroSet, cards, true);
          const ch = cards.filter((c) => c.rarity === "champion").length;
          const key = `${evos.length}e${heroes.length}h${ch}c`;
          slotMix.set(key, (slotMix.get(key) || 0) + 1);
        }

        const key = cards.map((c) => c.id).sort((a, b2) => a - b2).join(",");
        let d = decks.get(key);
        if (!d) { d = { key, n: 0, w: 0, sn: 0, sw: 0, on: 0, ow: 0, byId: new Map(), evoTally: new Map(), players: new Map() }; decks.set(key, d); }
        d.n++;
        /* Equal crowns is a draw (0.4% of ranked games). Scoring it with
           `crowns >` alone marked BOTH sides as losers, which is why the
           overall win rate came out at 48.3% instead of exactly 50%. */
        const mine = me.crowns || 0, theirs = them.crowns || 0;
        const won = mine === theirs ? 0.5 : mine > theirs ? 1 : 0;
        d.w += won;
        const isSampled = sampledTags.has(me.tag);
        if (isSampled) { d.sn++; d.sw += won; sampN++; sampW += won; }
        else { d.on++; d.ow += won; oppN++; oppW += won; }

        cards.forEach((c) => {
          if (!d.byId.has(c.id)) d.byId.set(c.id, c);
          if (c.evolutionLevel) d.evoTally.set(c.id, (d.evoTally.get(c.id) || 0) + 1);
        });

        const pk = d.players.get(me.tag) ||
          { tag: me.tag, name: me.name, clanName: me.clan?.name || "", clanTag: me.clan?.tag || "",
            badgeId: me.clan?.badgeId || 0, peak: 0, n: 0, w: 0 };
        pk.n++; if (won) pk.w++;
        // Medals after the game = what they were on + what the game moved them.
        pk.peak = Math.max(pk.peak, (me.startingTrophies || 0) + (me.trophyChange || 0));
        d.players.set(me.tag, pk);
      }
    }
  }

  const badge = await badgeLookup();
  /*
    De-bias the win rates.

    Our sampled accounts and the opponents they happened to face do not win at
    the same rate — being in the top 1000 right now selects for a winning run,
    so sampled-side games sit near 59% and opponent-side games near 40%. A deck
    seen mostly on the sampled side therefore looks strong for reasons that
    have nothing to do with the deck.

    So compare each deck against what an AVERAGE deck would have scored given
    the same mix of sides: expected = sn*sampledRate + on*oppRate, and report
    50% + (actual - expected)/n. A deck that merely matches its pilots' base
    rate lands on 50%; anything above is the deck actually outperforming.
  */
  const sampRate = sampN ? sampW / sampN : 0.5;
  const oppRate = oppN ? oppW / oppN : 0.5;
  const adjusted = (d) => {
    const expected = d.sn * sampRate + d.on * oppRate;
    return Math.max(0, Math.min(100, (0.5 + (d.w - expected) / d.n) * 100));
  };

  const ranked = [...decks.values()].sort((a, b) => b.n - a.n);
  const shape = (d, withPlayers) => {
      const all = [...d.byId.values()];
      /* A card counts as an evolution slot when it was played evolved in at
         least half this deck's games (different pilots slot different evos).
         Champions can never be evolutions — they are a separate mechanic — so
         they are excluded outright rather than trusted to the tally. */
      const flaggedAll = all.filter((c) => c.rarity !== "champion" && (d.evoTally.get(c.id) || 0) * 2 >= d.n);
      // The API lumps the hero slot in with the evolutions; separate them.
      const { evos: evo, heroes: hero } = splitSlots(flaggedAll, heroSet, all);
      const special = new Set([...evo, ...hero].map((c) => c.id));
      const champ = all.filter((c) => !special.has(c.id) && c.rarity === "champion");
      const rest = all.filter((c) => !special.has(c.id) && c.rarity !== "champion")
        .sort((a, b) => (a.elixirCost || 0) - (b.elixirCost || 0) || a.name.localeCompare(b.name));
      // Ordered so the three special slots come first — see the note above.
      const ordered = [...evo.map((c) => metaCard(c, true, false)),
                       ...hero.map((c) => metaCard(c, false, true)),
                       ...champ.map((c) => metaCard(c, false, false)),
                       ...rest.map((c) => metaCard(c, false, false))];

      return {
        key: d.key,
        battles: d.n,
        wins: d.w,
        usage: +(d.n / observations * 100).toFixed(1),
        // Headline number, de-biased. `raw` is kept so the UI can be honest
        // about what was actually observed. Below META_MIN_BATTLES neither is
        // meaningful, so the win rate is withheld rather than guessed at.
        winrate: d.n >= META_MIN_BATTLES ? +adjusted(d).toFixed(1) : null,
        rawWinrate: +(d.w / d.n * 100).toFixed(1),
        enoughData: d.n >= META_MIN_BATTLES,
        cards: ordered,
        pilots: d.players.size,
        players: !withPlayers ? [] : [...d.players.values()]
          .sort((a, b) => b.peak - a.peak || b.n - a.n)
          .slice(0, META_DECK_PLAYERS)
          .map((p) => ({
            tag: p.tag, name: p.name, clan: p.clanName, clanTag: p.clanTag,
            badge: badge(p.badgeId), peak: p.peak, battles: p.n, wins: p.w,
            winrate: +(p.w / p.n * 100).toFixed(1),   // a pilot's own raw record
          })),
      };
  };

  const items = ranked.slice(0, META_DECKS).map((d) => shape(d, true));
  /* Every deck we saw, not just the headline 16. The card pages look up "which
     decks play this card" here — searching only the top 16 left most cards
     with no decks at all. Pilot lists are omitted to keep this cheap. */
  const all = ranked.map((d) => shape(d, false));

  return {
    items,
    all,
    sampled: observations,
    battles: seenBattles.size,
    distinctDecks: decks.size,
    accounts: players.length,
    rankRange: players.length ? [players[0].rank, players[players.length - 1].rank] : null,
    minBattles: META_MIN_BATTLES,
    // Exposed so the UI can explain the correction instead of hiding it.
    baseRates: { sampled: +(sampRate * 100).toFixed(1), opponents: +(oppRate * 100).toFixed(1) },
    /* The observed evolution/champion mix, so the page can show that three
       evolutions in one deck is what the game actually allows. */
    slotMix: [...slotMix.entries()].sort((a, b) => b[1] - a[1])
      .map(([mix, n]) => ({ mix, n, pct: +(n / observations * 100).toFixed(1) })),
    season: seasonLabel(),
  };
}

/* "SEZON 2026-08" — the ranked season is the calendar month. */
function seasonLabel() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* Meta derlemesi ölçülen en pahalı iş: soğukken 8,9 sn (yüzlerce savaş
   günlüğü okunuyor). 20 dk taze, 2 saate kadar bayat kopya beklemeden
   verilir; yani süre dolduğunda sıradaki ziyaretçi 9 saniye beklemez,
   yenileme arkada döner. Sunucu açılışında da bir kez ısıtılıyor. */
const metaCached = () => cachedSWR(`meta:${META_TOP_PLAYERS}`, 1200e3, 7200e3, () => buildMeta(META_TOP_PLAYERS));

/*
  Evolution slots vs HERO slots.

  This is the correction to what the site showed before. A deck has three
  special slots, but they are NOT all evolutions: at most two are, and the
  third is the hero. The Clash Royale API hides this — it reports the hero
  slot with the same `evolutionLevel` field as an evolution — which is why
  decks appeared to run three evolutions.

  Verified against an independent source: 1084 Clash Royale League decks, where
  Liquipedia records heroes and evolutions separately, are 73% "2 evolutions +
  1 hero" and essentially never three evolutions.

  The tell is in /cards. Twelve cards carry `maxEvolutionLevel` but have NO
  evolution artwork published — and eleven of them are exactly the game's hero
  cards. They have no evolution art because they have no evolution: the field
  is the hero mechanic. Four cards (Knight, Valkyrie, Musketeer, Wizard) are
  both — a real evolution AND a hero, which is why the game shows them with two
  gems, one purple and one gold.

  So: a flagged card with no evolution art is always a hero; a flagged card
  with evolution art is an evolution, unless the deck would then hold more than
  two, in which case one of the dual cards is the hero. Applying this to 1302
  live ranked decks leaves ZERO decks with more than two evolutions and
  reproduces the CRL distribution.
*/
const MAX_EVO_SLOTS = 2;
const HERO_DUAL = new Set(["Knight", "Valkyrie", "Musketeer", "Wizard"]);
/* Kuralın kaçırdığı kahramanlar: API'de HİÇBİR işaret taşımayanlar.

   Yaramaz (Bandit) savaş günlüğünde sıradan bir kart gibi geliyor — ne
   `evolutionLevel`, ne `maxEvolutionLevel`, ne evrim görseli. Yani yukarıdaki
   kural onu göremiyor, `heroOnly` listesine eklemek de tek başına yetmiyor:
   ayıklama yalnızca İŞARETLİ kartlara bakıyordu, Yaramaz hiç işaretlenmiyor.

   Ölçüm (3.058 sıralamalı deste, 70 oyuncunun günlüğü):
     · Yaramaz 86 destede geçti, HİÇBİRİNDE işaretli değildi.
     · O destelerin 66'sında yalnızca 2 işaretli kart vardı, yani üçüncü özel
       yuva boştu. Genel oran %30,5 — Yaramaz'lı destelerde %76,7.
     · Kalan 20 destede üç yuva zaten doluydu.
   Yani Yaramaz çoğu zaman kahraman yuvasını dolduruyor ama her zaman değil.
   Bu yüzden kural "her Yaramaz kahramandır" değil: bir destede en fazla BİR
   kahraman yuvası olduğu için, yuva doluysa kart düz kart sayılıyor. */
const HERO_EXTRA = new Set(["Bandit"]);
let heroOnly = null;
async function heroOnlyCards() {
  if (heroOnly) return heroOnly;
  const body = await cached("cards", 3600e3, async () => (await cr(`/cards`)).body);
  heroOnly = new Set((body.items || [])
    .filter((c) => c.maxEvolutionLevel && !c.iconUrls?.evolutionMedium)
    .map((c) => c.name));
  for (const ad of HERO_EXTRA) heroOnly.add(ad);
  console.log(`🦸  Kahraman yuvası kuralı hazır (${heroOnly.size} kart yalnızca kahraman).`);
  return heroOnly;
}

/* Savaş günlüğünde kahraman yuvası destenin 1. sırasında duruyor, evrimler
   0. ve 2. sırada. Ölçüm — 2.652 sıralamalı deste:
     · tek kahraman adayı olan 1.414 destenin 1.390'ında aday 1. sıradaydı (%98,3)
     · evrimler: 0. sıra 2.651 kez, 2. sıra 2.485 kez, 1. sıra 455 kez
       (1. sıra ancak destede kahraman YOKSA evrime kalıyor)
   Yani iki aday çıktığında hangisinin kahraman olduğu tahmin edilmiyor,
   destenin kendi dizilişinden okunuyor. */
const HERO_SLOT_INDEX = 1;

/* İşaretli kartları evrim ve kahraman yuvalarına ayırır.

   `deste`  = o destenin TÜM kartları. Ayrı bir parametre çünkü işaretsiz
              kahramanlar (HERO_EXTRA) tanım gereği `flagged` içinde olmuyor.
              Meta destelerinde "işaretli" listesi bir oylamayla çıkıyor
              (evoTally), destenin kendisiyle aynı şey değil.
   `sirali` = `deste` gerçek yuva sırasında mı? Savaş günlüğünde öyle, meta
              destelerinde değil (orada kartlar tekilleştirilmiş bir Map'ten
              geliyor), o yüzden sıra kuralı yalnızca izin verildiğinde
              uygulanıyor. */
function splitSlots(flagged, heroSet, deste = flagged, sirali = false) {
  let heroes = flagged.filter((c) => heroSet.has(c.name));
  let evos = flagged.filter((c) => !heroSet.has(c.name));

  while (!heroes.length && evos.length > MAX_EVO_SLOTS) {
    const i = evos.findIndex((c) => HERO_DUAL.has(c.name));
    if (i < 0) break;                       // nothing left that could be a hero
    heroes.push(evos.splice(i, 1)[0]);
  }

  /* Bir destede en fazla BİR kahraman yuvası var. İki aday birden çıkabiliyor
     çünkü ikisinin de evrim sanatı yayınlanmamış olabiliyor (ör. Dev + Mega
     Minyon); o zaman biri kahraman, diğeri sanatsız bir evrimdir. Hangisi
     olduğuna deste sırası karar veriyor. */
  if (heroes.length > 1) {
    let sec = 0;
    if (sirali) {
      const i = heroes.findIndex((c) => deste.indexOf(c) === HERO_SLOT_INDEX);
      if (i >= 0) sec = i;
    }
    const dusen = heroes.filter((_, i) => i !== sec);
    heroes = [heroes[sec]];
    evos = [...evos, ...dusen].sort((a, b) => deste.indexOf(a) - deste.indexOf(b));
  }

  /* İşaretsiz kahraman (bkz. HERO_EXTRA). Yuva doluysa kart kahraman olarak
     oynanmış olamaz, boşsa oraya oturduğu sonucuna varıyoruz. Üç evrimli bir
     deste de kahraman alamaz, o yüzden evrim sayısı da kontrol ediliyor. */
  if (!heroes.length && evos.length <= MAX_EVO_SLOTS) {
    const c = deste.find((x) => HERO_EXTRA.has(x.name) && !flagged.includes(x));
    if (c) heroes.push(c);
  }
  return { evos: evos.slice(0, MAX_EVO_SLOTS), heroes };
}

app.get("/api/meta", async (req, res) => {
  try {
    const { all, ...rest } = await metaCached();   // `all` is served separately
    res.json(rest);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/* Eşleşme tablosu: "bu karşılaşmada kim kazanıyor?".
   Tablo arka planda birikiyor (bkz. eslesme.js), burada sadece okunuyor —
   yani uç nokta her zaman anında yanıtlıyor, hiç API çağırmıyor.
   5 dakikalık tarayıcı önbelleği: tablo zaten 10 dakikada bir değişiyor. */
const eslesme = require("./eslesme");
app.get("/api/eslesme", (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(eslesme.durum());
});

/* ============================================================
   ANTİ DESTE  🛡️
   ------------------------------------------------------------
   "Bu desteyi ne yener?" — kullanıcı bir meta destesi seçiyor,
   ona karşı üstün olan desteler sıralanıyor.

   NASIL ÇALIŞIYOR (ve neyi vaat ETMİYOR)

   Elimizdeki istatistik deste-deste değil, KAZANMA KOŞULU
   çiftleri üzerinden (bkz. eslesme.js). Sebebi örneklem: 996
   farklı meta destesi var, yani ~500.000 deste çifti — hiçbirine
   anlamlı sayıda maç düşmez. Kazanma koşulu çiftinde ise 328
   eşleşme var ve popüler olanlar yüzlerce maç topluyor.

   O yüzden zincir şu: seçilen destenin kazanma koşulu bulunuyor →
   o koşula karşı ÜSTÜN olan koşullar sıralanıyor → her koşul için
   onu ana kart olarak oynayan gerçek meta desteleri listeleniyor.

   Yani sayı "şu deste bu desteyi %71 yener" demiyor;
   "Kraliyet Devi desteleri, Yaban Domuzu destelerini %71 yeniyor;
   işte Kraliyet Devi oynayan meta desteleri" diyor. Arayüz de
   tam olarak böyle yazıyor — daha fazlasını iddia etmek, elimizde
   olmayan bir ölçümü varmış gibi göstermek olurdu.
   ============================================================ */
const ANTI_ESIK = 55;      // bu orandan itibaren "anti" sayılıyor (istekle: %55)
const ANTI_DESTE = 6;      // her karşı koşul için gösterilen en çok deste
/* Meta havuzundan hangi desteler listeye girsin. 996 destenin çoğu bir-iki
   kez görülmüş; onları "anti deste" diye önermek, kullanıcıyı kimsenin
   oynamadığı bir desteye yollamak olurdu. */
const ANTI_MIN_MAC = 10;

let kartHaritasi = null;
async function kartlarIdIle() {
  if (kartHaritasi) return kartHaritasi;
  const body = await cached("cards", 3600e3, async () => (await cr(`/cards`)).body);
  kartHaritasi = new Map((body.items || []).map((c) => [c.id, c]));
  return kartHaritasi;
}

/* Meta destelerini ana kartlarına göre gruplar. Bir deste yalnızca kendi
   ANA kartının grubuna girer: Madenci taşıyan bir Yaban Domuzu destesi
   "Madenci antisi" diye listelenirse, ölçtüğümüz şey o deste olmaz. */
async function metaKocGruplari() {
  const meta = await metaCached();
  const grup = new Map();
  for (const d of meta.all || []) {
    if ((d.battles || 0) < ANTI_MIN_MAC) continue;
    const k = eslesme.kosulSec(d.cards);
    if (!k) continue;
    if (!grup.has(k.id)) grup.set(k.id, []);
    grup.get(k.id).push(d);
  }
  for (const [, liste] of grup) liste.sort((a, b) => (b.usage || 0) - (a.usage || 0) || (b.battles || 0) - (a.battles || 0));
  return { grup, meta };
}

/* Seçilebilecek desteler.

   Manşetteki 16 meta destesi yetmiyor: kullanıcı KENDİ karşılaştığı desteyi
   arıyor ve o çoğu zaman ilk 16'da olmuyor. Havuz, yeterince oynanmış bütün
   destelere açılıyor (ölçüm: 1.018 farklı desteden ~%X'i eşiği geçiyor),
   kullanıma göre sıralanıp ANTI_SECIM tanesi veriliyor.

   Ayrıca kazanma koşulu listesi de gönderiliyor: destesini bulamayan
   "Yaban Domuzu" diye doğrudan arketip seçebilsin. */
const ANTI_SECIM = 30;
app.get("/api/anti/desteler", async (req, res) => {
  try {
    const { grup, meta } = await metaKocGruplari();
    const secilebilir = [];
    for (const [kocId, liste] of grup) for (const d of liste) secilebilir.push({ d, kocId });
    secilebilir.sort((a, b) => (b.d.usage || 0) - (a.d.usage || 0) || (b.d.battles || 0) - (a.d.battles || 0));

    const kocSayaci = new Map();
    for (const [kocId, liste] of grup)
      kocSayaci.set(kocId, liste.reduce((a, d) => a + (d.battles || 0), 0));
    const tablo = eslesme.durum();

    res.set("Cache-Control", "public, max-age=300");
    res.json({
      sezon: meta.season,
      items: secilebilir.slice(0, ANTI_SECIM).map(({ d, kocId }) => {
        const bilgi = (tablo.koc || []).find((c) => c.id === kocId);
        const { players, ...rest } = d;
        return { ...rest, koc: { id: kocId, ad: bilgi?.ad || "" } };
      }),
      /* Arketip kısayolu: en çok oynanan kazanma koşulları. */
      koclar: [...kocSayaci.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, mac]) => {
          const bilgi = (tablo.koc || []).find((c) => c.id === id);
          return { id, ad: bilgi?.ad || String(id), mac, desteSayisi: grup.get(id).length };
        }),
    });
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

app.get("/api/anti", async (req, res) => {
  try {
    const harita = await kartlarIdIle();
    /* İki giriş biçimi: `deste` (8 kart kimliği) ya da `koc` (doğrudan
       arketip). İkisi de aynı yere varıyor — hesap zaten kazanma koşulu
       üzerinden yapılıyor. */
    let kendi = null;
    if (req.query.koc) {
      const kid = parseInt(req.query.koc, 10);
      const kart = harita.get(kid);
      kendi = kart ? eslesme.kosulSec([kart]) : null;
      if (!kendi) return res.status(400).json({ error: "bad_koc", mesaj: "Bu kart bir kazanma koşulu olarak tanınmıyor." });
    } else {
      const ids = String(req.query.deste || "").split(",")
        .map((s) => parseInt(s, 10)).filter(Number.isFinite);
      if (ids.length < 1 || ids.length > 8) return res.status(400).json({ error: "bad_deck", mesaj: "Deste 1–8 kart kimliği olmalı." });
      kendi = eslesme.kosulSec(ids.map((id) => harita.get(id)).filter(Boolean));
    }
    if (!kendi) return res.json({ hazir: true, kocYok: true, sayac: [],
      mesaj: "Bu destede tanıdığımız bir kazanma koşulu yok, bu yüzden eşleşme istatistiği çıkarılamıyor." });

    const tablo = eslesme.durum();
    const { grup } = await metaKocGruplari();

    const sayac = [];
    for (const anahtar of Object.keys(tablo.ciftler)) {
      const [a, b] = anahtar.split("|").map(Number);
      if (a !== kendi.id && b !== kendi.id) continue;
      const digerId = a === kendi.id ? b : a;
      const [n, w] = tablo.ciftler[anahtar];
      if (n < tablo.minOrnek) continue;
      /* `w` küçük kimlikli koşulun galibiyeti; bize KARŞI TARAFIN oranı lazım. */
      const oran = (digerId === a ? w / n : 1 - w / n) * 100;
      const kart = harita.get(digerId);
      const bilgi = (tablo.koc || []).find((c) => c.id === digerId);
      sayac.push({
        koc: { id: digerId, ad: bilgi?.ad || kart?.name || String(digerId), e: bilgi?.e || kart?.elixirCost || 0 },
        n, yuzde: +oran.toFixed(1),
        // %95 güven aralığının yarı genişliği — 40 maçlık bir oran ±15 puan oynayabiliyor.
        pay: +(1.96 * Math.sqrt((oran / 100) * (1 - oran / 100) / n) * 100).toFixed(1),
        desteler: (grup.get(digerId) || []).slice(0, ANTI_DESTE)
          .map(({ players, ...d }) => d),
      });
    }
    /* SIRALAMA — ham orana göre DEĞİL, güven aralığının alt sınırına göre.

       Sebebi ölçülmüş bir tuzak: 45 maçlık bir %64'ün payı ±14 puan, yani
       gerçek değeri %50 de olabilir; 240 maçlık bir %63'ün payı ±6. Ham orana
       göre sıralayınca gürültülü olan üste çıkıyor ve "en iyi anti" diye
       gösterdiğimiz şey aslında en az bildiğimiz şey oluyordu.

       Alt sınır (oran − pay) ikisini de doğru yere koyuyor: X-Yay %64−14=50,
       Yaban Domuzu %63−6=57 → Yaban Domuzu önde. Ekranda yine HAM oran
       yazıyor (kullanıcı %64 istedi, %50 değil) ama sıra güvene göre; arayüz
       bunu bir cümleyle açıklıyor ki "63 neden 64'ün üstünde" diye
       sorulmasın. */
    sayac.sort((x, y) => (y.yuzde - y.pay) - (x.yuzde - x.pay) || y.n - x.n);

    res.set("Cache-Control", "public, max-age=120");
    res.json({
      hazir: tablo.hazir,
      secilen: { koc: { id: kendi.id, ad: kendi.ad, e: kendi.e } },
      esik: ANTI_ESIK, minOrnek: tablo.minOrnek,
      sezon: tablo.sezon, savas: tablo.savas, karma: tablo.karma,
      /* Hepsi gönderiliyor (eşiğin altındakiler dahil): eşiği geçen hiç
         yoksa arayüz "en yakınları" gösterebilsin, boş ekran kalmasın. */
      sayac,
    });
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

// Which decks play a given card, most-played first, across the whole sample.
app.get("/api/decks/card/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const limit = Math.min(parseInt(req.query.limit) || 8, 20);
    const meta = await metaCached();
    const hits = (meta.all || []).filter((d) => d.cards.some((c) => c.id === id));
    res.json({
      id, total: hits.length, items: hits.slice(0, limit),
      searched: (meta.all || []).length, season: meta.season,
    });
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Global "Son Maçlar" feed. The Clash Royale API has no single
  global battle stream, so we aggregate: take the current Path of
  Legends top players and merge their most recent battles into one
  reverse-chronological feed. Cached ~45s to stay well under the
  rate limit.
*/
const LIVE_TOP = 100;   // the ranked top-100 whose games make the feed
const LIVE_MAX = 24;    // battles shown

app.get("/api/live", async (req, res) => {
  try {
    /* Bayat-ver-arkada-tazele: derleme 100 oyuncunun günlüğünü okuyor ve
       ölçülen süresi ~4,2 sn. 60 sn'lik kopya taze sayılır; 60–300 sn arası
       eski kopya BEKLETMEDEN verilir, yenilemesi arka planda döner. Yani
       kimse o 4 saniyeyi görmüyor, veri de en fazla 5 dk eskiyor. */
    const feed = await cachedSWR("live", 60e3, 300e3, async () => {
      const top = await cr(`/locations/global/pathoflegend/players?limit=${LIVE_TOP}`);
      const players = (top.body.items || []).slice(0, LIVE_TOP);
      const logs = await pool(players, 8, async (p) => {
        try { return (await crRetry(`/players/${normTag(p.tag)}/battlelog`)).body || []; }
        catch { return []; }
      });

      const seen = new Set();
      const battles = [];
      for (const log of logs) {
        if (!Array.isArray(log)) continue;
        for (const b of log) {
          /* Ranked only. A top player's log is full of friendlies, clan-war
             games and challenges (`friendly`, `clanMate`, `riverRacePvP`,
             `trail`, `PvP`); those are not ranked results and do not belong in
             a ranked feed. `pathOfLegend` is the ranked mode. */
          if (b.type !== "pathOfLegend") continue;
          const t = b.team?.[0], o = b.opponent?.[0];
          if (!t || !o) continue;
          // At least one side must actually be in the top 100 at match time.
          const best = Math.min(t.globalRank ?? 1e9, o.globalRank ?? 1e9);
          if (best > LIVE_TOP) continue;
          const id = [b.battleTime, ...[t.tag, o.tag].sort()].join("|");
          if (seen.has(id)) continue;
          seen.add(id);
          battles.push(b);
        }
      }
      // newest first by battleTime (format: 20240101T120000.000Z)
      battles.sort((a, b) => (b.battleTime || "").localeCompare(a.battleTime || ""));
      const sonuc = battles.slice(0, LIVE_MAX);
      // Canlı akışta da rozetler görünsün.
      const pro = await proPlayers();
      for (const b of sonuc)
        for (const taraf of [...(b.team || []), ...(b.opponent || [])])
          if (taraf && taraf.tag) rozetle(taraf, taraf.tag, pro);
      return { items: sonuc, scanned: players.length, top: LIVE_TOP };
    });
    res.json(feed);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Latest YouTube uploads for the HYPNOSHUB channel, via the
  public RSS feed (no API key needed). Parsed server-side so the
  browser isn't blocked by CORS/robots. Cached ~10 min.
*/
function decodeXml(s){
  return String(s||"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#x27;/g,"'");
}
/* HYPNOS CR kanalı (@hypnoscr). Açık bilgi — bkz. aşağıdaki not. */
const YT_VARSAYILAN = "UC5pUCwGNR9rnoWLfweHcnRw";
app.get("/api/youtube", async (req, res) => {
  try {
    /* Kanal kimliği gizli bir bilgi değil (herkese açık bir YouTube kanalı),
       o yüzden varsayılanı kodda duruyor. Ortam değişkeni olarak bırakılmıştı
       ve yayına alırken girilmediği için "Son Videolar" bölümü boş kalıyordu —
       ayarlanması unutulabilecek her şeyin makul bir varsayılanı olmalı.
       Başka bir kanal göstermek isteyen YT_CHANNEL_ID ile değiştirebilir. */
    const id = process.env.YT_CHANNEL_ID || req.query.channel_id || YT_VARSAYILAN;
    if (!id) return res.status(400).json({ error: "no_channel" });
    const data = await cached("yt:" + id, 600e3, async () => {
      const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: { "User-Agent": "Mozilla/5.0 (HYPNOSHUB)" } });
      const xml = await r.text();
      const items = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 8).map((m) => {
        const e = m[1];
        const g = (re) => (e.match(re) || [])[1];
        const vid = g(/<yt:videoId>(.*?)<\/yt:videoId>/);
        return {
          videoId: vid,
          title: decodeXml(g(/<title>([\s\S]*?)<\/title>/)),
          published: g(/<published>(.*?)<\/published>/),
          thumb: g(/<media:thumbnail url="(.*?)"/) || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : ""),
          views: g(/<media:statistics views="(.*?)"/),
          url: vid ? `https://www.youtube.com/watch?v=${vid}` : "",
        };
      });
      return { items };
    });
    res.json(data);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/* Accounts. Mounted before the static handler so /api/auth/* is not shadowed. */
const auth = require("./auth");
auth.mount(app);
const board = require("./board");
board.mount(app, {
  readSession: auth.readActiveSession, listUsers: auth.listUsers,
  isAdmin: auth.isAdmin, banUser: auth.banUser, userInfo: auth.userInfo,
});
const quiz = require("./quiz");
quiz.mount(app, {
  readSession: auth.readActiveSession,
  addPoints: board.award,
  banUser: auth.banUser,                 // bot tespitinde otomatik ceza
  cardsBody: () => cached("cards", 3600e3, async () => (await cr(`/cards`)).body),
  cardKinds, cardTraits, cardNamesTR, cardArenas, chrKey,
});
/* Oyunların ortak veri kaynakları. Hepsi zaten hesapladığımız şeyler:
   kart listesi, meta desteleri ve ilk 100'ün son maç desteleri. */
const gameDeps = {
  readSession: auth.readActiveSession,
  addPoints: board.award,
  allCards: async () => {
    const [body, kinds, traits, tr, arenas, heroSet] = await Promise.all([
      cached("cards", 3600e3, async () => (await cr(`/cards`)).body),
      cardKinds(), cardTraits(), cardNamesTR(), cardArenas(), heroOnlyCards(),
    ]);
    return (body.items || []).map((c) => ({
      id: c.id,
      name: c.name, tr: tr.get(c.name) || c.name, elixir: c.elixirCost || 0,
      rarity: c.rarity || "", type: kinds.get(chrKey(c.name)) || "",
      traits: traitBul(traits, c.name),
      evo: !!(c.maxEvolutionLevel || c.iconUrls?.evolutionMedium),
      /* Deste jeneratörü evrim ile kahraman yuvasını AYIRMAK zorunda; yukarıdaki
         `evo` ikisini birden kapsıyor (ipucu için öyle isteniyor). Ayrım kuralı
         heroOnlyCards()'ta ölçülmüş: evrim sanatı yayınlanmamış ama işaretli
         kart = kahraman. Knight/Valkyrie/Musketeer/Wizard ikisi birden. */
      evoIcon: c.iconUrls?.evolutionMedium || "",
      kahraman: heroSet.has(c.name) || HERO_DUAL.has(c.name),
      kahramanTek: heroSet.has(c.name),          // evrimi yok, yalnızca kahraman
      heroImg: heroPortrait(c.name),             // gerçek kahraman görseli (varsa)
      arena: arenas.get(chrKey(c.name)) || 0,
      icon: c.iconUrls?.medium || "",
    }));
  },
  /* Kart Kapışması: yalnızca savaş değeri bilinen kartlar. */
  combatCards: async () => {
    const [cards, combat] = await Promise.all([gameDeps.allCards(), cardCombat()]);
    return cards.map((c) => {
      const s = combat.get(chrKey(c.name));
      return s ? { ...c, hp: s.hp, dmg: s.dmg, hitSpeed: s.hitSpeed, level: s.level } : null;
    }).filter(Boolean);
  },
  metaDecks: async () => (await metaCached()).items,
  /* Sıralama ucunu kendi üstümüzden çağırıyoruz: o uç son maç destelerini
     zaten toplayıp 10 dakika önbelleğe alıyor, aynı işi ikinci kez yapmanın
     anlamı yok. Yalnızca localhost'a gider. */
  topPlayers: async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/rankings/pathoflegend?limit=100`)
      .then((x) => x.json()).catch(() => null);
    return (r?.items || []).map((p) => ({ tag: p.tag, name: p.name, rank: p.rank, deck: p.deck }));
  },
};
require("./games").mount(app, gameDeps);
require("./feedback").mount(app, {
  readSession: auth.readActiveSession, listUsers: auth.listUsers,
  banUser: auth.banUser, unbanUser: auth.unbanUser, userInfo: auth.userInfo, banSteps: auth.BAN_STEPS,
  isAdmin: auth.isAdmin, adminLabel: auth.adminLabel,
});
const messages = require("./messages");
messages.mount(app, {
  readSession: auth.readActiveSession, listUsers: auth.listUsers,
  isAdmin: auth.isAdmin, userInfo: auth.userInfo,
});

/* ---------- KVKK: silme ve görüntüleme haklarının kapsamı ----------
   Kullanıcı verisi tek dosyada durmuyor. "Hesabımı sil" dendiğinde
   hangi modüllerin temizleneceği BURADA, tek yerde yazılı; auth.js
   bu listeyi gezip her birini çağırıyor.

   Yeni bir modül kişisel veri tutmaya başlarsa buraya bir satır
   eklenmeli — yoksa hesap silinir ama o modülde veri kalır. Listeyi
   tek noktada tutmanın sebebi tam olarak bunu gözden kaçırmamak. */
const games = require("./games");
auth.veriKaydet("Tokmakçılar puanları", board.kullaniciOzeti, board.kullaniciSil);
auth.veriKaydet("Yarışma hakları", quiz.kullaniciOzeti, quiz.kullaniciSil);
auth.veriKaydet("Oyun hakları", games.kullaniciOzeti, games.kullaniciSil);
auth.veriKaydet("Mesajlar", messages.kullaniciOzeti, messages.kullaniciSil);

/* ---------- PRO başvuruları ve rozet yönetimi ----------
   Oyuncu etiketini yazıp başvurur; yönetici kabul ya da reddeder.
   Kabul edilen başvuru doğrudan rozete dönüşür. Yönetici ayrıca
   etiket yazarak elle rozet verip alabilir. */
app.use("/api/pro", require("express").json({ limit: "8kb" }));

const proNeedAuth = (req, res) => {
  const s = auth.readActiveSession(req);
  if (!s) { res.status(401).json({ error: "auth", message: "Başvuru için giriş yapmalısın." }); return null; }
  return s;
};
const proNeedAdmin = (req, res) => {
  const s = proNeedAuth(req, res); if (!s) return null;
  if (!auth.isAdmin(s.user)) { res.status(403).json({ error: "forbidden" }); return null; }
  return s;
};

// Oyuncu: başvur
app.post("/api/pro/apply", async (req, res) => {
  const s = proNeedAuth(req, res); if (!s) return;
  const tag = badges.normTag(req.body?.tag);
  const kind = String(req.body?.kind || "pro");

  /* Etiketin gerçekten var olduğunu SUNUCU doğrular; olmayan bir
     etiketle başvuru kuyruğu doldurulamasın. */
  if (!badges.gecerliTag(tag))
    return res.status(400).json({ error: "tag", message: "Etiket geçersiz görünüyor. Oyun içindeki #etiketini birebir yaz." });
  const { status, body } = await cr(`/players/${normTag(tag)}`);
  if (status !== 200 || !body.name)
    return res.status(404).json({ error: "notfound", message: "Bu etiketle bir oyuncu bulunamadı." });

  const r = badges.apply({ userId: s.user.id, username: s.user.username, tag, kind, note: req.body?.note });
  if (r.error) return res.status(400).json(r);
  res.json({ ok: true, app: { ...r.app, playerName: body.name } });
});

// Oyuncu: kendi başvurularım
app.get("/api/pro/mine", (req, res) => {
  const s = proNeedAuth(req, res); if (!s) return;
  res.json({ items: badges.myApps(s.user.id) });
});

// Yönetici: bekleyen sayısı (rozet için)
app.get("/api/pro/count", (req, res) => {
  const s = auth.readActiveSession(req);
  const admin = s ? auth.isAdmin(s.user) : false;
  res.json({ admin, pending: admin ? badges.pendingCount() : 0 });
});

// Yönetici: başvuru listesi (oyuncu bilgisiyle birlikte)
app.get("/api/pro/applications", async (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;
  const items = badges.listApps(req.query.status || "");
  const pro = await proPlayers();
  /* Karar verirken oyuncunun gerçekten iyi olup olmadığı görünsün:
     madalyon, kupa ve klanı başvurunun yanına ekleniyor. */
  const zengin = await pool(items.slice(0, 60), 6, async (a) => {
    try {
      const r = await crRetry(`/players/${normTag(a.tag)}`);
      if (r.status !== 200 || !r.body.name) return { ...a, oyuncu: null };
      const elo = r.body.currentPathOfLegendSeasonResult?.trophies ?? null;
      return { ...a, oyuncu: {
        name: r.body.name, level: r.body.expLevel, trophies: r.body.trophies,
        best: r.body.bestTrophies, elo, rank: pro.get(badges.normTag(a.tag)) || null,
        clan: r.body.clan?.name || "", wins: r.body.wins, losses: r.body.losses,
      } };
    } catch { return { ...a, oyuncu: null }; }
  });
  res.json({ items: zengin, pending: badges.pendingCount(), esik: verified.PRO_MIN_MEDALS });
});

// Yönetici: kabul / red
app.post("/api/pro/decide", (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;
  const r = badges.decide(String(req.body?.id || ""),
    req.body?.karar === "kabul" ? "kabul" : "red",
    { by: s.user.username, note: req.body?.note });
  if (r.error) return res.status(400).json(r);
  rozetKumeSifirla();
  res.json({ ok: true, app: r.app,
    message: r.app.status === "kabul"
      ? `${r.app.tag} → ${badges.KIND_TR[r.app.kind]} rozeti verildi.`
      : "Başvuru reddedildi." });
});

// Yönetici: elle rozet ver / al
app.post("/api/pro/grant", async (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;
  const tag = badges.normTag(req.body?.tag);
  const kind = String(req.body?.kind || "pro");
  if (!badges.gecerliTag(tag)) return res.status(400).json({ error: "tag", message: "Etiket geçersiz." });
  const { status, body } = await cr(`/players/${normTag(tag)}`);
  if (status !== 200 || !body.name) return res.status(404).json({ error: "notfound", message: "Oyuncu bulunamadı." });
  const r = badges.grant(tag, kind, { by: s.user.username });
  if (r.error) return res.status(400).json(r);
  rozetKumeSifirla();
  res.json({ ok: true, message: `${body.name} (${tag}) → ${badges.KIND_TR[kind]} verildi.` });
});
app.post("/api/pro/revoke", (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;
  const tag = badges.normTag(req.body?.tag);
  const kind = req.body?.kind || "";
  if (!badges.gecerliTag(tag))
    return res.status(400).json({ error: "tag", message: `"${req.body?.tag || ""}" geçerli bir oyuncu etiketi değil.` });
  /* Kodda sabit yazılı mı? badges.js verified.js'i tanımıyor, cevabı buradan
     alıyor — böylece sabit rozetler de siteden kaldırılabiliyor. */
  const sabitVar = verified.isVerified(tag) || verified.isPro(tag);
  const r = badges.revoke(tag, kind, sabitVar);
  if (r.error) return res.status(404).json(r);
  rozetKumeSifirla();
  res.json({ ok: true, tag,
    message: r.kaynak === "sabit"
      ? `${tag} rozeti kaldırıldı (yerleşik listede olduğu için gizlendi; geri almak için "Gizlemeyi kaldır" kullanın).`
      : `${tag} rozeti kaldırıldı.` });
});
/* Yanlışlıkla gizlenen yerleşik rozeti geri getir. */
app.post("/api/pro/unhide", (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;
  const r = badges.gizlemeKaldir(badges.normTag(req.body?.tag), req.body?.kind || "");
  if (r.error) return res.status(404).json(r);
  rozetKumeSifirla();
  res.json({ ok: true, message: `${r.tag} rozeti geri getirildi.` });
});
app.get("/api/pro/hidden", (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;
  res.json({ items: badges.listGizli() });
});
app.get("/api/pro/granted", (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;
  res.json({ items: badges.listGranted() });
});


/* Statik sunucu proje KÖKÜNÜ veriyor (tek komutla site + API, aynı köken).
   Bunun bedeli: kökte site dosyalarının yanında sunucu kaynağı, .git ve
   .cache da duruyor. Bunlar tarayıcıya asla verilmemeli —
   server/.cache/users.json şifre özetlerini ve oturum jetonlarını,
   server/.env ise API anahtarını tutuyor.

   Bu yüzden statik katmandan ÖNCE kapıyı kapatıyoruz: izin listesi değil,
   açıkça yasak listesi + bütün gizli (nokta ile başlayan) yollar. */
/* `package.json` de kapalı. İçinde gizli bir şey YOK (ölçüldü: token/şifre
   araması sıfır sonuç) ama dışarıya vermenin de bir faydası yok: kullanılan
   Node sürümünü, başlatma komutlarını ve bellek ayarlarına dair iç notları
   yayınlıyor. Saldırıya uğramak için gereken bilgiyi bedavaya vermeyelim. */
const GIZLI_YOL = /^\/(server|node_modules|scripts|tools)(\/|$)|^\/package(-lock)?\.json$/i;
app.use((req, res, next) => {
  const parcalar = req.path.split("/");
  if (GIZLI_YOL.test(req.path) || parcalar.some((p) => p.length > 1 && p.startsWith(".")))
    return res.status(404).type("text/plain").send("Not found");
  next();
});

// Serve the static site (one command runs the whole thing, same-origin = LIVE)
/* Express'in mime tablosu AVIF'i tanımıyor — lig rozetleri .avif olarak
   yüklendiğinde dosya "application/octet-stream" olarak çıkıyordu. Tarayıcı
   <img> içinde çoğu zaman yine de çiziyor ama buna güvenilmez; türü açıkça
   söylüyoruz. Aynısı .webp için de emniyet olsun diye duruyor. */
const EK_MIME = { ".avif": "image/avif", ".webp": "image/webp" };
app.use(express.static(path.join(__dirname, ".."), {
  dotfiles: "deny",
  setHeaders(res, dosya) {
    const tur = EK_MIME[path.extname(dosya).toLowerCase()];
    if (tur) res.type(tur);
  },
}));

/* ============================================================
   BULUNAMAYAN ADRES
   ------------------------------------------------------------
   Eskiden Express'in kendi hatası çıkıyordu: İngilizce, başlığı "Error",
   gövdesi "Cannot GET /...". Adresi yanlış yazan ziyaretçi siteyi bozuk
   sanıyordu.

   /api/ AYRI tutuluyor: oradan HTML dönerse istemci JSON bekleyip
   çözümleme hatası alır. API için kısa bir JSON, insanlar için sayfa.
   ============================================================ */
app.use((req, res) => {
  if (req.path.startsWith("/api/"))
    return res.status(404).json({ error: "not_found", path: req.path });
  res.status(404).sendFile(path.join(__dirname, "..", "404.html"));
});

/* `0.0.0.0`: kap (container) içinde yalnız 127.0.0.1'e bağlanan bir sunucuya
   dışarıdan ulaşılamaz, sağlayıcı "uygulama ayağa kalkmadı" der. Yerelde
   davranış aynı. */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🔨  HYPNOSHUB çalışıyor → http://localhost:${PORT}`);
  console.log(`    Site:   http://localhost:${PORT}/index.html`);
  console.log(`    API:    http://localhost:${PORT}/api/health`);
  console.log(`    ${TOKEN ? "✅ API anahtarı yüklü — veriler CANLI." : "⚠️  API anahtarı yok — demo veri gösterilir."}`);
  /* Yayında hangi ayarlarla çalıştığını açılışta yazıyoruz: kalıcı disk
     bağlanmadıysa ya da vekil ayarlanmadıysa bunu günlükten görmek,
     kullanıcılar "hesabım silinmiş" demeden önce fark etmeyi sağlıyor. */
  const { DATA_DIR } = require("./veriyolu");
  console.log(`    Veri klasörü: ${DATA_DIR}${process.env.DATA_DIR ? "" : "  ⚠️  DATA_DIR ayarlı değil — bulutta veri kalıcı OLMAZ"}`);
  console.log(`    CR API: ${CR_BASE}${/royaleapi/.test(CR_BASE) ? "  (vekil)" : "  (doğrudan — IP beyaz listesi gerekir)"}`);
  if (!CRAWL_CLANS) console.log("    Oyuncu adı indeksi KAPALI (CRAWL_CLANS=0) — arama yalnızca etiketle.");
  require("./takvim").banner();
  console.log("");
  // Warm the badge map and the player-name index so the first search is instant
  // (~255 ladder requests, a few seconds) instead of making a user wait.
  if (TOKEN) {
    badgeLookup(); ensureIndex(); onIsitma();
    /* Eşleşme taraması: kendi zamanlayıcısı var, açılıştan 45 sn sonra
       başlıyor ki ısıtma ve klan taramasıyla aynı anda API'ye yüklenmesin. */
    eslesme.basla({ cr, crRetry, pool, normTag });
  }
});

/*
  Açılışta önden ısıtma.

  Ölçtük — önbellek soğukken: /meta 8,9 sn, /live 3,6 sn, /rankings/clans
  224 ms. Bu bedeli o an siteyi açan kişi ödüyordu ("veri gelmesi 5 saniye
  sürüyor" şikâyeti tam olarak buydu). Sunucu açılır açılmaz aynı işleri
  kendimiz bir kez yapıyoruz; ziyaretçi geldiğinde her şey hazır oluyor.
  Sessizce çalışır: başarısız olursa uç noktalar eskisi gibi kendi
  başlarına çeker, hiçbir şey kırılmaz.
*/
async function onIsitma() {
  const uc = (yol) => () => fetch(`http://127.0.0.1:${PORT}/api${yol}`);
  const isler = [
    ["meta desteleri", () => metaCached()],
    ["nihai kademe", uc("/rankings/pathoflegend?limit=100")],   // soğukken 4,9 sn
    ["son maçlar", uc("/live")],                                // soğukken 3,6 sn
    ["kart listesi", uc("/cards")],
    ["klan sıralaması", uc("/rankings/clans?limit=100")],
    ["kupa sıralaması", uc("/rankings/global?limit=100")],
    ["youtube", uc("/youtube")],
  ];
  const t0 = Date.now();
  await Promise.allSettled(isler.map(([, f]) => f().catch(() => null)));
  console.log(`🔥  Önbellek ısıtıldı (${((Date.now() - t0) / 1000).toFixed(1)} sn) — ilk ziyaretçi beklemiyor.`);
}
