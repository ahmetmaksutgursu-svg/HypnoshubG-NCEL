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
/* Kalkan EN ÜSTTE yükleniyor: cr() sarmalayıcısı bu dosyanın epey
   başında (~190. satır) kuruluyor, diğer modüller ise çok aşağıda. */
const kalkan = require("./kalkan");
const onay = require("./onay");
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

/* ============================================================
   VEKİLE GÜVEN  —  req.ip GERÇEKTEN ZİYARETÇİNİN Mİ?
   ------------------------------------------------------------
   Bu satır yokken Express, `req.ip` olarak soketin karşı ucunu
   döndürür. Railway'de o uç ziyaretçi DEĞİL, Railway'in kendi
   kenar vekilidir. Yani bütün ziyaretçiler tek ve aynı IP olarak
   görünür.

   Yayında bunun bedeli görüldü: hız sınırları IP başına yazılmıştı
   ama tek IP olduğu için SİTE GENELİNE uygulandı. Video çıkınca
   ilk beş kayıttan sonra kimse hesap açamadı, insanlar "bu
   bağlantıdan çok fazla hesap açıldı" hatası aldı. Sınır kötü
   niyetliyi değil, sıradaki herkesi kesiyordu.

   `1` = yalnızca İLK vekile güven. `true` demek zincirdeki bütün
   adresleri kabul etmek olurdu ve o zaman istemci kendi
   X-Forwarded-For başlığını uydurup sınırı atlayabilirdi.
   Railway'de trafik tek kenar vekilinden geldiği için doğru sayı 1.

   CLOUDFLARE AÇILIRSA BU SAYI 2 OLMALI.
   Zincir "ziyaretçi → Cloudflare → Railway" olur ve Railway,
   Cloudflare'in adresini X-Forwarded-For'a ekler. Ölçüldü:

     XFF: "203.0.113.9, 172.68.1.1"   (ziyaretçi, Cloudflare)
       trust=1 → 172.68.1.1   ← CLOUDFLARE'İN adresi, ziyaretçinin değil
       trust=2 → 203.0.113.9  ← doğru

   Turuncu bulut açılıp bu sayı 1'de kalırsa BÜTÜN ziyaretçiler
   avuç içi kadar Cloudflare adresi olarak görünür — yukarıda
   anlatılan yayın günü olayının birebir aynısı. Üstelik yarışmadaki
   bot koruması IP başına 3 GÜN yasak veriyor; masum kullanıcılar
   toplu hâlde yasaklanırdı.

   Ters yönü de tehlikeli, o da ölçüldü: Cloudflare KAPALIYKEN sayı 2
   olursa istemcinin uydurduğu X-Forwarded-For kabul ediliyor
   (deneyde "1.2.3.4" olduğu gibi geçti) — hız sınırı ve yasaklar
   atlatılabilir hâle gelir.

   Bu yüzden sayı sabit değil: turuncu bulut açıldığı GÜN Railway
   Variables'ta TRUST_PROXY=2 yapılır, ikisi birlikte çevrilir.
   Varsayılan 1 — bugünkü kurulum (yalnızca Railway) için doğru olan.
   ============================================================ */
const TRUST_PROXY = (() => {
  const ham = parseInt(process.env.TRUST_PROXY, 10);
  return Number.isFinite(ham) && ham >= 0 ? ham : 1;
})();
app.set("trust proxy", TRUST_PROXY);
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

   İçerik Güvenlik Politikası (CSP) — KISMİ.

   `script-src` hâlâ eklenmiyor ve sebebi değişmedi: sayfalar satır içi
   olay işleyicileri kullanıyor (onclick="openGame('duello')" gibi
   yüzlerce yer). Katı bir script-src bunları öldürür; 'unsafe-inline'
   ile yazılan bir script-src ise KORUMA SAĞLAMAZ, yalnızca korunuyormuş
   görüntüsü verir. İkisi de yanlış olacağı için o kısım dürüstçe boş
   bırakıldı — düzgün yapılması satır içi işleyicilerin tamamının
   ayıklanmasını gerektiriyor, ayrı ve büyük bir iş.

   Ama CSP'nin script'ten BAĞIMSIZ çalışan kısımları var ve onlar satır
   içi kodu hiç ilgilendirmiyor. Eklendiler:

     · base-uri 'self'     — sayfaya <base href="kotusite"> sokulmasını
       engelliyor. Bu, tek başına küçük görünen ama ciddi bir kaldıraç:
       bir saldırgan <base> yerleştirebilirse sayfadaki BÜTÜN göreli
       adresler (script, form, istek) kendi sunucusuna yönelir.
     · object-src 'none'   — eklenti tabanlı (<object>, <embed>) saldırı
       yollarını tamamen kapatıyor. Sitede hiç kullanılmıyor.
     · form-action 'self'  — enjekte edilmiş bir formun parolayı başka
       bir sunucuya göndermesini engelliyor.
     · frame-ancestors 'self' — X-Frame-Options'ın modern karşılığı;
       eski başlık dursun diye ikisi birden veriliyor.

   Bunların hiçbiri satır içi script'i etkilemediği için siteyi bozma
   riski yok; ölçüldü (bkz. t_gorunum, 130 denetim).
   ============================================================ */
const GUVENLIK_BASLIKLARI = true;
/* Sunucunun ne olduğunu söylemeye gerek yok. Express sürümüne özel bir
   açık çıktığında, tarayıp "Express" yazan siteleri toplayan otomatik
   araçların listesine girmemek küçük ama bedava bir kazanç. */
app.disable("x-powered-by");
const CSP = [
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", CSP);
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
/* HAM çağrı. Doğrudan KULLANILMIYOR — aşağıdaki `cr` kalkanla
   sarmalanmış hâli. Kulüp sayfasının içindeki ~50 çağrı da bu
   sarmalayıcıdan geçiyor, yani genel bütçe gerçek maliyeti görüyor. */
async function crHam(path) {
  const res = await fetch(CR_BASE + path, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
const cr = kalkan.olc(crHam);

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

/* ============================================================
   KART LİSTESİ — tek kapı
   ------------------------------------------------------------
   Altı ayrı yerde `cached("cards", …, () => cr("/cards").body)` yazılıydı
   ve hiçbiri gelen gövdeyi DOĞRULAMIYORDU.

   Yayında yakalandı: RoyaleAPI vekili Cloudflare'in "Error 525: SSL
   handshake failed" JSON'unu döndürdü. O gövdede `items` yok ama hata da
   fırlatılmadığı için doğrudan önbelleğe yazıldı — ve önbellek ömrü BİR
   SAAT. Yani birkaç saniyelik bir yukarı akış kesintisi, sitedeki bütün
   kartları bir saat boyunca boşaltıyordu.

   Artık gövde doğrulanıyor: `items` bir dizi değilse ya da boşsa HATA
   fırlatılıyor. `cached()` reddedilen işi silmediği için bozuk yanıt
   önbelleğe girmiyor ve bir sonraki istek yeniden deniyor. Çağıran uçlar
   da boş liste yerine 502 görüyor, yani sorun sessizce yutulmuyor. */
async function kartListesi() {
  return cached("cards", 3600e3, async () => {
    const body = (await cr(`/cards`)).body;
    if (!body || !Array.isArray(body.items) || !body.items.length)
      throw new Error("kart listesi boş geldi — yukarı akış hatası: " +
                      String(body && (body.title || body.detail || body.reason) || "bilinmiyor"));
    return body;
  });
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
/* `/api/admin` ve `/api/bildirim` SONRADAN eklendi. İkisi de bu dosyada
   değil, ayrı modüllerde kaydediliyor (auth.js, bildirim.js) ve listeye hiç
   girmemişlerdi — ölçüldü, ikisi de Cache-Control başlığı OLMADAN yanıt
   veriyordu. `/api/admin` yönetici ekranının verisini (kullanıcı listesi,
   e-postalar, mesajlar) döndürüyor; `/api/bildirim/durum` ise kişiye özel
   (`girisli`, `cihaz`). Yukarıda anlatılan olayın aynısının bu uçlarda
   yaşanmaması için kapsama alındılar. Kenar önbelleği (Cloudflare) devreye
   girdiğinde bu başlık daha da kritik. */
app.use(["/api/auth", "/api/admin", "/api/bildirim", "/api/games", "/api/quiz",
         "/api/feedback", "/api/board", "/api/messages", "/api/pro"], (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

/* Sağlık ucu ayrıca VEKİL ZİNCİRİNİ bildiriyor.

   Neden: `req.ip` yanlış okunursa hiçbir hata çıkmaz — site çalışmaya
   devam eder, ama bütün ziyaretçiler tek adres gibi görünür ve hız
   sınırları herkesi keser, bot yasakları masum kullanıcıları vurur.
   Yayın gününde tam bu yaşandı. Cloudflare devreye girince zincir bir
   adım uzuyor ve TRUST_PROXY buna göre ayarlanmazsa aynı hata döner.

   Cloudflare gerçek ziyaretçiyi `CF-Connecting-IP` başlığında bildiriyor.
   Bizim okuduğumuz adres ona eşitse zincir doğrudur. IP'nin KENDİSİ
   yazılmıyor — yalnızca eşleşip eşleşmediği. Böylece kimsenin adresi
   açığa çıkmadan ayarın doğruluğu dışarıdan denetlenebiliyor. */
/* Sağlık ucu ayrıca ZİYARETÇİ ADRESİNİN doğru okunduğunu bildiriyor.

   Neden gerekli: adres yanlış okunursa hiçbir hata çıkmaz — site
   çalışır ama bütün ziyaretçiler tek kişi gibi görünür ve hız
   sınırları herkesi keser. Sessizce bozulabilecek türden bir ayar,
   o yüzden dışarıdan denetlenebilir olması önemli.

   ADRES YAZILMIYOR — yalnızca Cloudflare'in bildirdiği ziyaretçiyle
   bizim okuduğumuzun aynı olup olmadığı. */
app.get("/api/health", (req, res) => {
  const cf = String(req.headers["cf-connecting-ip"] || "").replace(/^::ffff:/, "");
  const vekil = !cf ? "cloudflare-yok"          // yerel ya da doğrudan Railway
    : (cf === gercekIp(req) ? "dogru" : "YANLIS");
  /* Posta ayarı TANIMLI mı — şifre değil, yalnızca var/yok. Parola
     sıfırlama buna bağlı ve sessizce kapanabilir: değişken silinirse
     akış çalışmaya devam eder ama kod hiç gitmez, kullanıcı da sebebini
     anlamaz. Dışarıdan denetlenebilir olması bu yüzden. */
  res.json({ ok: true, hasToken: !!TOKEN, vekil, trustProxy: TRUST_PROXY,
             /* Kaynak doğrulaması KURULU mu — anahtarın kendisi değil,
                yalnızca var/yok. Kurulu değilken CF-Connecting-IP
                sahtelenebiliyor ve bütün IP sınırları etkisiz kalıyor
                (ölçüldü: 150/150 istek geçti), o yüzden dışarıdan
                denetlenebilir olması gerekiyor. */
             kaynakKorumasi: require("./gercekip").korumaAcik(),
             posta: require("./mail").hazirMi(),
             /* GERÇEKTEN gönderebiliyor muyuz? `posta` yalnızca ayarın
                tanımlı olduğunu söylüyor; Railway giden SMTP'yi engellediği
                için ayar tanımlı olsa da gönderim yapılamıyor. Arayüzdeki
                "Şifremi unuttum" bağlantısı buna bakıyor. */
             postaCalisiyor: require("./mail").calisiyorMu(),
             /* Kalkanın o anki yükü. Saldırı sırasında dışarıdan
                bakıp "bütçe doldu mu, kaç çağrı engellendi" diye
                görebilmek için; sayılar kimlik değil, yalnızca yük. */
             kalkan: kalkan.durum(),
             /* Çerez onay oranı — reklam gelirinin doğrudan çarpanı.
                Kimlik yok, yalnızca iki sayaç (bkz. onay.js). */
             onay: onay.durum() });
});

/* Yedek durumu — YÖNETİCİYE ÖZEL. Yedeklerin gerçekten alındığı
   panelden görülebilsin; "alınıyordur" varsaymak kaybın en yaygın
   sebebi. */
/* HABERLER — herkese açık okuma.

   `?yer=anasayfa` öne çıkanları önde tutup ilk üçü veriyor;
   parametresiz çağrı tam listeyi. Önbellek KISA: yönetici bir haber
   eklediğinde ziyaretçinin onu dakikalarca görmemesi anlamsız. */
app.get("/api/haberler", (req, res) => {
  res.set("Cache-Control", "public, max-age=60");
  const yer = String(req.query.yer || "");
  if (yer === "anasayfa") return res.json({ items: haber.anasayfa() });
  const tur = String(req.query.tur || "");
  res.json({ items: haber.liste({ tur }) });
});

/* GÖVDE AYRIŞTIRICISI BURADA AYRICA KURULUYOR — sıralama yüzünden.

   Bu uçlar dosyanın başında tanımlı; `/api/admin` için JSON ayrıştırıcısı
   ise auth.mount() içinde, çok daha SONRA kuruluyor. Express ara yazılımı
   kayıt sırasına göre çalıştırdığı için rota, ayrıştırıcı daha yokken
   devreye giriyordu ve req.body BOŞ kalıyordu: gönderilen başlık sunucuya
   hiç ulaşmadan "Başlık boş olamaz" hatası dönüyordu.

   express.json gövde zaten ayrıştırılmışsa atlıyor, yani ikinci kez
   kurulması zarar vermiyor. */
app.use("/api/admin/haber", require("express").json({ limit: "8kb" }));

/* Haber EKLE / SİL — yalnızca yönetici. */
app.post("/api/admin/haber", (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;
  const r = haber.ekle(req.body || {});
  if (r.hata) {
    const mesaj = { baslik: "Başlık boş olamaz.", tur: "Tür geçersiz.",
                    tarih: "Tarih GG biçiminde olmalı (YYYY-AA-GG)." }[r.hata] || "Eklenemedi.";
    return res.status(400).json({ error: r.hata, message: mesaj });
  }
  console.log(`📰  Haber eklendi (${s.user.username}): [${r.haber.tur}] ${r.haber.baslik}`);
  res.json(r);
});

/* DUYURUYU AYRIŞTIR — oyun içi metni düzenli listeye çevirir.

   Yalnızca metni dönüştürüyor, hiçbir şey KAYDETMİYOR: yönetici
   sonucu görüp beğenirse yayınlıyor. Kaydetmeden önce görmek,
   yanlış ayrıştırılmış bir duyurunun siteye düşmesini engelliyor. */
app.post("/api/admin/haber/ayristir", async (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;
  const ham = String((req.body && req.body.metin) || "");
  if (!ham.trim()) return res.status(400).json({ error: "bos", message: "Yapıştırılacak metin yok." });

  let sozluk = null;
  try {
    const harita = await cardNamesTR();
    const trTr = new Map(), enTr = new Map();
    for (const [en, tr] of harita) {
      trTr.set(String(tr).toLocaleLowerCase("tr"), tr);
      enTr.set(String(en).toLowerCase(), tr);
    }
    sozluk = { trTr, enTr };
  } catch { /* sözlük yoksa adlar olduğu gibi kalır */ }

  const cikti = duyuru.ayristir(ham, sozluk);
  if (!cikti) return res.status(422).json({ error: "cozulemedi",
    message: "Metinden kart listesi çıkarılamadı. Duyuruyu olduğu gibi yapıştırdığından emin ol." });
  res.json({ ok: true, metin: cikti });
});

/* Haberi DÜZENLE — akış sayısal ayrıntı veremediği için yönetici
   oyun içi duyurudaki değerleri buradan tamamlıyor. */
app.patch("/api/admin/haber/:kimlik", (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;
  const r = haber.guncelle(req.params.kimlik, req.body || {});
  if (r.hata) {
    const mesaj = { yok: "Haber bulunamadı.", baslik: "Başlık boş olamaz.",
                    tur: "Tür geçersiz.", tarih: "Tarih YYYY-AA-GG olmalı." }[r.hata] || "Güncellenemedi.";
    return res.status(r.hata === "yok" ? 404 : 400).json({ error: r.hata, message: mesaj });
  }
  console.log(`📰  Haber düzenlendi (${s.user.username}): ${r.haber.baslik}`);
  res.json(r);
});

app.delete("/api/admin/haber/:kimlik", (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;
  const r = haber.sil(req.params.kimlik);
  if (r.hata) return res.status(404).json({ error: "yok", message: "Haber bulunamadı." });
  console.log(`📰  Haber silindi (${s.user.username}): ${r.haber.baslik}`);
  res.json(r);
});

app.get("/api/admin/yedek", (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;
  res.json(yedek.durum());
});

/* YEDEĞİ İNDİR — yönetici, tarayıcıdan tek tıkla.

   NEDEN GEREKLİ: günlük yedekler /data/yedek altında, yani VERİNİN
   DURDUĞU DİSKİN ÜSTÜNDE. Disk bozulur ya da birim silinirse yedekler
   de onunla gider — "yedeğimiz var" duygusu verip hiçbir şey
   kurtarmayan tam olarak bu düzendir. Gerçek yedek, kopyanın
   sunucudan ÇIKMIŞ olanıdır.

   `?yeni=1` önce taze bir yedek alır, sonra onu gönderir; parametresiz
   çağrı en son alınanı verir.

   Dosya kullanıcı hesaplarını ve parola özetlerini taşıyor: yanıt
   hiçbir ara bellekte durmasın diye no-store, indirme olarak işaretli
   ve yalnızca yöneticiye açık. */
app.get("/api/admin/yedek/indir", (req, res) => {
  const s = proNeedAdmin(req, res); if (!s) return;

  if (String(req.query.yeni || "") === "1") yedek.al();

  const ad = String(req.query.ad || "") || yedek.sonuncu();
  if (!ad) return res.status(404).json({ error: "yok", message: "Henüz yedek alınmamış. ?yeni=1 ile taze yedek al." });

  const govde = yedek.oku(ad);
  if (!govde) return res.status(404).json({ error: "yok", message: "Yedek bulunamadı." });

  res.set("Cache-Control", "no-store");
  res.set("Content-Type", "application/gzip");
  res.set("Content-Disposition", `attachment; filename="${ad}"`);
  res.send(govde);
});

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

/* KALKAN — pahalı uçlara ziyaretçi sınırı.

   Sayaçtan SONRA takılıyor: engellenen istek de bir ziyaret sayılsın,
   yoksa saldırı anında sitede kimse yokmuş gibi görünürdü.

   İKİ ayrı bütçe işletiyor (bkz. kalkan.js):

     · MALIYET — yukarı akışa (Supercell) yük bindiren uçlar. Kulüp,
       profil, arama… Önbellekten dönen istek puanını geri alıyor.
     · GENEL İSTEK — ham istek sayısı, TÜM /api uçları için. Önbellekli
       uçlar da dâhil.

   İkincisi sonradan eklendi. Burada eskiden "tabloya, habere, kart
   verisine dokunmuyor — onlar zaten önbellekten dönüyor" yazıyordu ve
   bu doğruydu ama eksikti: ucuz olmak sınırsız olmak değil. Ölçüldü
   (canlı, 28.08.2026) — /api/cards ucuna 40 istek, 40'ı da geçti;
   aynı anda /api/clan/ 40 istekten 38'ini kesti. 64 KB'lık bir yanıtı
   dakikada binlerce kez üretmek veri sızdırmasa da sunucuyu meşgul
   eder. Artık ham istek de sayılıyor.

   Statik dosyalar (CSS, JS, kart görselleri) SAYILMIYOR: bu katman yol
   verilmeden takılı ve express.static ondan sonra geliyor, o yüzden
   kalkan içinde /api guard'ı var. Olmasaydı tek bir sayfa açılışı
   onlarca görselle ani tavanı doldururdu. */
app.use(kalkan.katman);

/*
  Player search. Returns a LIST — it never guesses a single profile.
  An exact tag short-circuits to the real lookup; a name is matched against the
  index above (exact name > prefix > substring, strongest ladder rating first).
*/
app.get("/api/players/search", async (req, res) => {
  try {
    const q = String(req.query.name || "").trim();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    /* Tur bitti: eski kayıtları at, diske yaz. */
  modmeta.turBitti();

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

/* PROFİL ÖNBELLEĞİ. Önce hiç yoktu: aynı etiket için art arda dört
   istek atıldığında dördü de ~0,7 sn sürüyordu, yani dördü de
   Supercell'e gidiyordu (ölçüldü).

   Süre KISA (60 sn) çünkü oyuncu maç yapınca kupası değişiyor ve
   profilin bayat görünmesi istenmiyor. Bir dakika, sayfayı yenileyip
   duran ya da sekmeler arasında gidip gelen kişiyi tamamen karşılıyor.

   BULUNAMAYAN etiket de saklanıyor (negatif önbellek) ve daha UZUN:
   var olmayan bir etiket birden var olmaz. Rastgele etiket tarayan
   bot bize bir yukarı akış çağrısına mal oluyordu; artık ikinci
   denemesi bedava — ama bize de bedava. */
const PROFIL_SURE = 60e3;
const YOK_SURE = 300e3;

app.get("/api/player/:tag", async (req, res) => {
  try {
    const etiket = normTag(req.params.tag);
    const onbellekli = cache.get("pl:" + etiket);
    const taze = onbellekli && (Date.now() - onbellekli.t <
      (onbellekli.v && onbellekli.v.status === 200 ? PROFIL_SURE : YOK_SURE));
    if (taze) { kalkan.bedava(req); return res.status(onbellekli.v.status).json(onbellekli.v.body); }
    const { status, body } = await cr(`/players/${etiket}`);
    if (status === 200 && body.clan) body.clan.badge = (await badgeLookup())(body.clan.badgeId);
    // Profil başlığındaki arena adı da Türkçe olsun (bkz. arenaNames).
    if (status === 200 && body.arena?.name) body.arena.nameTR = arenaTR(await arenaNames(), body.arena.name);
    // Rozetler profilde de görünsün (resmi hesap tiki + pro).
    if (status === 200 && body.tag) {
      /* ÖNCE öğren, SONRA rozetle: oyuncu ilk kez açıldığında rozeti aynı
         istekte çıksın, bir sonraki ziyareti beklemesin. */
      prosezon.ogren(body);
      const rz = rozetle({}, body.tag, await proPlayers(),
                         body.currentPathOfLegendSeasonResult?.trophies);
      if (rz.verified) { body.verified = true; body.verifiedNote = rz.note; }
      if (rz.pro) { body.pro = true; body.proRank = rz.proRank; if (rz.proSezon) body.proSezon = true; }
    }
    /* 429 SAKLANMIYOR: üst akış bizi kısıtladıysa ya da genel bütçe
       dolduysa bu geçici bir durum; beş dakika boyunca herkese hata
       döndürmek olurdu. */
    if (status !== 429) cache.set("pl:" + etiket, { t: Date.now(), v: { status, body } });
    res.status(status).json(body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/* Savaş günlüğü de önbellekli. Süre profille aynı mantıkta: yeni maç
   bir dakika içinde görünür. */
app.get("/api/player/:tag/battlelog", async (req, res) => {
  try {
    const etiket = normTag(req.params.tag);
    const onbellekli = cache.get("bl:" + etiket);
    if (onbellekli && Date.now() - onbellekli.t < PROFIL_SURE) {
      kalkan.bedava(req);
      return res.status(onbellekli.v.status).json(onbellekli.v.body);
    }
    const { status, body } = await cr(`/players/${etiket}/battlelog`);
    /* Savaş günlüğündeki her oyuncuya rozetlerini iliştir: karşına pro bir
       oyuncu ya da tanınmış bir hesap çıktıysa günlükte de görünsün. */
    if (status === 200 && Array.isArray(body)) {
      const pro = await proPlayers();
      for (const b of body)
        for (const taraf of [...(b.team || []), ...(b.opponent || [])])
          if (taraf && taraf.tag) rozetle(taraf, taraf.tag, pro);
      /* Her tarafa rakibin kulelerine vurduğu hasarı yaz. Anahtar
         tanınmıyorsa alan hiç eklenmiyor — arayüz de o zaman yazmıyor. */
      for (const b of body) kule.isle(b);
    }
    if (status !== 429) cache.set("bl:" + etiket, { t: Date.now(), v: { status, body } });
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
    /* Önbellekte TAZE kopya varsa ziyaretçinin puanını geri ver:
       kulüp sayfaları arasında gidip gelmek yukarı akışa hiçbir şeye
       mal olmuyor, o yüzden kotadan da düşmemeli. (Ölçüldü: aynı
       kulüp ikinci kez 0 çağrı, 2 ms.) */
    const kopya = cache.get("clan:" + tag);
    if (kopya && Date.now() - kopya.t < 600e3) kalkan.bedava(req);
    const data = await cached("clan:" + tag, 600e3, async () => {
      const { status, body } = await cr(`/clans/${tag}`);
      if (status !== 200 || !body.tag) return { status, body };
      const badge = await badgeLookup();
      body.badge = badge(body.badgeId);

      const details = await pool(body.memberList || [], 8, async (m) => {
        try { const r = await crRetry(`/players/${normTag(m.tag)}`); return r.status === 200 ? r.body : null; }
        catch { return null; }
      });
      /* Rozetler üye listesinde de görünsün. Eksikti: profilde PRO yazan
         oyuncu klan listesinde rozetsiz çıkıyordu (kullanıcı bildirdi).
         Yalnızca yeni sezon PRO'su değil, resmi hesap tiki ve dünya ilk 100
         rozeti de hiç basılmıyordu — eski bir boşluk.

         SIRA ÖNEMLİ: önce yukarıda çekilen profillerden "en iyi sezon"
         öğreniliyor, sonra rozet basılıyor. Tersi olsaydı liste ilk açılışta
         rozetsiz çıkar, ancak o üyenin profili ayrıca açıldıktan SONRA
         düzelirdi — sınama tam bu uyuşmazlığı yakaladı. Profiller zaten
         çekiliyor (seviye ve lig için), ek API maliyeti yok. */
      /* ÖĞRENME önbelleğin içinde kalıyor (profiller zaten burada çekiliyor);
         ROZET BASMA ise dışarı taşındı — bkz. Nihai sıralamasındaki not.
         Bu sezonki madalyon da kurala giriyor, o yüzden üyeye yazılıyor. */
      for (const p of details) if (p) prosezon.ogren(p);
      (body.memberList || []).forEach((m, i) => {
        m.__sezonMadalyon = details[i]?.currentPathOfLegendSeasonResult?.trophies ?? null;
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
    const proKlan = await proPlayers();
    (data.body?.memberList || []).forEach((m) => {
      if (!m.tag) return;
      rozetle(m, m.tag, proKlan, m.__sezonMadalyon);
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
    /* Yanıt zaten sunucuda önbellekli; bu başlık tarayıcının da aynı
       saniyeler içinde tekrar sormasını engelliyor. Video trafiği için
       ölçüldü: sunucu ~275 istek/sn'de doyuyor, en ucuz kazanç tekrar
       eden isteği hiç yaptırmamak. */
    res.set("Cache-Control", "public, max-age=60");
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
      return { status, body };
    });
    /* ROZETLER ÖNBELLEĞİN DIŞINDA. Eskiden yukarıdaki derleyicinin içindeydi
       ve karara 10 dakikalığına mühürleniyordu: bir oyuncunun profili
       açılıp "en iyi sezon" öğrenildiğinde bile sıralama onu rozetsiz
       göstermeye devam ediyordu (kullanıcı bildirdi). Aynı sorun yönetici
       bir rozeti verdiğinde/kaldırdığında da yaşanıyordu.

       Maliyeti yok: rozet kararı bellekteki listelere bakıyor, ağ isteği
       içermiyor. */
    const pro = await proPlayers();
    (data.body?.items || []).forEach((p) => { if (p.tag) rozetle(p, p.tag, pro, p.eloRating); });
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

/* ============================================================
   DIŞ VERİ ÖNBELLEKLERİNİN TAZELENME SÜRESİ
   ------------------------------------------------------------
   Kart türleri, özellikleri, Türkçe adları, savaş değerleri ve
   ARENA bilgisi dışarıdaki veri dosyalarından geliyor. Altısı da
   bir kez çekilip SÜRESİZ saklanıyordu: `if (harita) return harita`.

   Bunun bedeli kullanıcı tarafından bildirildi — Bomba Kulesi'nin
   4. arenada açıldığı, sistemin 3 dediği. Ölçüldüğünde veri kaynağı
   4 diyordu, yani dosya düzelmişti; süreç eski kopyayı tutuyordu.
   Supercell bir kart eklediğinde ya da bir değer düzeltildiğinde,
   site YENİDEN DAĞITIM yapılana kadar eski sayıyı söylemeye devam
   ediyordu. Yeniden dağıtım da veri düzeltmek için değil, kod
   değiştiğinde yapıldığı için arada haftalar geçebiliyordu.

   Altı saat seçildi: oyun verisi bu hızda değişmiyor, ama bir
   düzeltme en geç yarım günde kendiliğinden yerine oturuyor.

   Tazeleme BAŞARISIZ olursa eski kopya korunuyor. Ağ kesintisinde
   haritayı boşaltmak, sorunun kendisinden daha kötü olurdu: kart
   türü bilinmeyince oyunlar soru üretemez, site sessizce boşalır. */
const DIS_VERI_TTL = 6 * 3600e3;
const tazeMi = (an) => an && Date.now() - an < DIS_VERI_TTL;

/*
  Card kinds. The Clash Royale API's /cards has no type field at all (just
  name/id/maxLevel/elixirCost/iconUrls/rarity), so "is this a character or a
  spell?" cannot be answered from it. RoyaleAPI's card data has `type`
  (Troop 87 / Building 14 / Spell 19), which is what the Kahramanlar section
  needs: a spell like Arrows or The Log has no hero to show.
*/
const CARD_DATA = "https://royaleapi.github.io/cr-api-data/json/cards.json";
let kindMap = null, kindAn = 0;
/* KART TÜRÜ DÜZELTMELERİ.

   Kaynak veri (cr-api-data) oyunun dengeleme güncellemelerinin gerisinde
   kalabiliyor: Supercell bir kartı yeniden tasarlayıp türünü değiştirdiğinde
   veri günlerce eski hâlini göstermeye devam ediyor. Yarışmada bunun bedeli
   doğrudan: "Fırın hangi tür bir karttır?" sorusunda oyuncu oyunda gördüğü
   doğru cevabı veriyor ve yanlış sayılıyor (kullanıcı bildirdi).

   Buradaki liste kaynak veriyi EZER. Kaynak düzeldiğinde satır silinebilir;
   silinmezse de zarar vermez, aynı değeri söylemiş olur. */
const TUR_DUZELTME = new Map([
  ["furnace", "Troop"],          // Fırın: yeniden tasarımla binadan birliğe geçti
]);

/* KAYNAKTA HİÇ OLMAYAN KARTLAR — kimlik bloğundan tamamlanıyor.

   TUR_DUZELTME yanlış türü düzeltiyor; bu ise türü HİÇ OLMAYAN kartlar
   için. Ölçüldü: 122 kartın 13ünde tür boş — Küçük Prens, Goblinstein,
   Ronin, Boşluk, Sarmaşıklar gibi yeni kartlar kaynak veride yok.

   Boş tür sessiz bir hata değil, GERÇEK bir arıza: deste önerisi yedek
   kartı aynı türden seçiyor ve "" hiçbir türle eşleşmediği için o kart
   destede KİLİTLİ kalıyordu. Kullanıcı bildirdi — "önerdiğin desteler
   düşük seviyeli geldi"; sebebi buydu, Goblinstein sv13 ile kilitliydi
   ve 54 adayın hepsi "tür uyuşmuyor" diye eleniyordu.

   ÖLÇÜM: Clash Royale kart kimlikleri türe göre bloklanmış.
     26xxxxxx -> Troop     77/77 doğru
     27xxxxxx -> Building  12/13 doğru  (istisna: Fırın)
     28xxxxxx -> Spell     18/19 doğru  (istisna: İyileştirici Ruh)
   Türü bilinen 108 kartta 106 doğru. İki istisna da zaten TUR_DUZELTME
   ile ya da kaynaktan doğru geliyor.

   Tahmin değil ölçüm, ama %100 de değil — o yüzden yalnızca BOŞLUĞU
   dolduruyor, kaynağı hiçbir yerde ezmiyor. */
const turBlogu = (id) =>
  ({ 26: "Troop", 27: "Building", 28: "Spell" })[Math.floor(Number(id) / 1000000)] || "";

async function cardKinds() {
  if (kindMap && tazeMi(kindAn)) return kindMap;
  /* Tazeleme başarısız olursa ELDEKİ kopya korunuyor ve damga
     kurulmuyor, yani bir sonraki istek yeniden deniyor. Boş bir
     haritayı önbelleğe almak, tek bir ağ kesintisini kalıcı hasara
     çevirirdi. */
  const eski_kindMap = kindMap;
  kindMap = new Map();
  try {
    const j = await (await fetch(CARD_DATA)).json();
    j.forEach((c) => {
      const k = chrKey(c.name);
      kindMap.set(k, TUR_DUZELTME.get(k) || c.type);
    });
    /* Kaynakta HİÇ olmayan kartların türünü kimlik bloğundan tamamla.
       Var olan bir değeri asla ezmiyor. */
    let tamamlanan = 0;
    try {
      const resmi = await kartListesi();
      for (const c of resmi.items || []) {
        const k = chrKey(c.name);
        if (kindMap.get(k)) continue;
        const t = TUR_DUZELTME.get(k) || turBlogu(c.id);
        if (t) { kindMap.set(k, t); tamamlanan++; }
      }
    } catch (e) { console.warn("⚠️  Eksik kart türleri tamamlanamadı:", String(e)); }
    console.log(`🃏  Kart tipi eşlemesi yüklendi (${kindMap.size} kart` +
                (tamamlanan ? `, ${tamamlanan} tanesi kimlik bloğundan` : "") + ").");
  } catch (e) { console.warn("⚠️  Kart tipleri alınamadı:", String(e)); }
  /* Ölçüt "boş değil" DEĞİL, "eskisinden küçük değil".
     cardNamesTR haritayı elle yazılan çevirilerle tohumluyor: çekim
     başarısız olsa bile harita boş görünmüyor ve "boş değil" ölçütü
     bozuk hâli 6 saat önbelleğe alırdı. Küçülme her zaman kayıp
     demektir; o durumda eldeki kopya korunuyor. */
  if (kindMap && kindMap.size && (!eski_kindMap || kindMap.size >= eski_kindMap.size)) kindAn = Date.now();
  else if (eski_kindMap) kindMap = eski_kindMap;
  return kindMap;
}

let chrMap = null, chrAn = 0;
async function characterArt() {
  if (chrMap && tazeMi(chrAn)) return chrMap;
  /* Yeni bir kart çıktığında görseli de bu listeden geliyor; süresiz
     önbellek, kart eklendiğinde görselinin çıkmaması demekti. */
  const eski_chrMap = chrMap;
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
  if (chrMap.size && (!eski_chrMap || chrMap.size >= eski_chrMap.size)) chrAn = Date.now();
  else if (eski_chrMap) chrMap = eski_chrMap;
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
/* Kahramanların EKRANDAKİ SIRASI — oyundaki sırayla.

   Bu liste artık "kimler kahramandır" sorusunu CEVAPLAMIYOR, yalnızca
   sıralamayı veriyor. Kimlik sorusunun cevabı API'de: kahraman
   kartları `iconUrls.heroMedium` taşıyor ve tam 16 tane.

   Ayrım önemli, çünkü liste elle yazıldığında kayıyordu: içinde
   "Bandit" vardı ve Haydut kahraman değil — kullanıcı ekran
   görüntüsüyle bildirdi, Kartlar > Kahramanlar sekmesinde Yaramaz'ın
   yerinde Haydut duruyordu. API 16 kahramanı doğru sayıyordu; yanlış
   olan tek yer bu listeydi.

   Supercell yeni bir kahraman eklediğinde de kendiliğinden geliyor:
   listede olmayan kahramanlar sona ekleniyor. */
const HERO_SIRA = [
  "Valkyrie", "Barbarian Barrel", "Wizard", "Mini P.E.K.K.A",
  "Knight", "Goblins", "Berserker", "Tombstone",
  "Magic Archer", "Balloon", "Dark Prince", "Bowler",
  "Giant", "Musketeer", "Ice Golem", "Mega Minion",
];

/* Gerçek kahraman listesi: API söylüyor, sıra yukarıdan geliyor.

   API'den okuyamazsak elimizdeki sırayı kullanıyoruz — kahraman sekmesini
   tamamen boş bırakmaktansa eski liste daha iyi. */
async function heroRoster() {
  let apiKahraman = null;
  try { apiKahraman = await heroAllCards(); } catch { /* API yoksa yedeğe düş */ }
  if (!apiKahraman || !apiKahraman.size) return HERO_SIRA;
  const sirali = HERO_SIRA.filter((n) => apiKahraman.has(n));
  const eksik = [...apiKahraman].filter((n) => !HERO_SIRA.includes(n));
  if (eksik.length) console.log(`🦸  Sırada olmayan kahraman sona eklendi: ${eksik.join(", ")}`);
  const fazla = HERO_SIRA.filter((n) => !apiKahraman.has(n));
  if (fazla.length) console.warn(`⚠️  Sıradaki bu kartlar API'ye göre kahraman DEĞİL: ${fazla.join(", ")}`);
  return [...sirali, ...eksik];
}

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

/* Kahraman portresi.

   ÖNCE DİSK, SONRA API. Diskteki dosya tercih ediliyor (dış bir sunucuya
   bağımlı olmadan, tek istekte gelir); yoksa API'nin kendi kahraman
   görseline düşülüyor.

   Bu yedek bilerek eklendi. Portreler bir zamanlar SADECE diskten
   geliyordu ve dosya adı elle konuyordu; bir dosya yanlış karta
   adlandırıldığı için Haydut'un yerine Berserker'ın portresi çizildi
   (kullanıcı "aynı destede iki Yaramaz var" diye bildirdi). Artık yanlış
   ya da eksik bir dosya kahramanı boş bırakmıyor: doğru görsel API'den
   geliyor.

   Diskteki dosyaların adı kartın İNGİLİZCE adından türetiliyor. Türkçe
   ada göre adlandırmayın — o hatanın kaynağı buydu. */
function heroPortrait(name, kart) {
  const slug = heroSlug(name);
  for (const ext of ["png", "webp", "jpg", "jpeg"]) {
    if (fs.existsSync(path.join(HERO_IMG_DIR, `${slug}.${ext}`)))
      return `assets/img/heroes/${slug}.${ext}`;
  }
  return kart?.iconUrls?.heroMedium || "";
}

app.get("/api/heroes", async (req, res) => {
  try {
    /* Short cache on purpose: the portraits are read off disk, so dropping a
       new file into assets/img/heroes/ has to show up without a restart. */
    const data = await cached("heroes:roster", 15e3, async () => {
      const [cards, art, kinds] = await Promise.all([
        kartListesi(),
        characterArt(),
        cardKinds(),
      ]);
      const byName = new Map((cards.items || []).map((c) => [c.name, c]));
      /* Roster order is the game's, so no sort. Four of the sixteen (Tombstone,
         Dark Prince, Mega Minion and — as a spell — Barbarian Barrel) have no
         standalone character render in the asset index; those fall back to the
         card art rather than being dropped or given another unit's picture. */
      /* Liste API'den geliyor, sıra HERO_SIRA'dan. Eskiden doğrudan
         elle yazılmış listeydi ve içindeki "Bandit" yüzünden Kahramanlar
         sekmesinde Yaramaz yerine Haydut görünüyordu. */
      const roster = await heroRoster();
      const heroes = roster.map((name) => {
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
          heroes: heroes.length, roster: roster.length,
          withArt: heroes.filter((h) => h.art).length,
          portraits: have,
          // Which files the site is still waiting for, so the UI can say so.
          missingPortraits: heroes.filter((h) => !h.portrait).map((h) => h.slug + ".png"),
          missing: roster.filter((n) => !byName.has(n)),
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
/* En iyi sezonu barajı geçen oyuncular (bkz. prosezon.js). */
const prosezon = require("./prosezon");
/* Ziyaretçinin gerçek adresi (Cloudflare arkasında req.ip yanlış — bkz. gercekip.js). */
const { gercekIp } = require("./gercekip");
/* Günlük yedek: /data tek kopya, kaybı geri dönüşsüz (bkz. yedek.js). */
const yedek = require("./yedek");
/* Haberler / son güncellemeler — elle girilen akış, bkz. haber.js */
const haber = require("./haber");
/* Denge/güncelleme duyurularını kendiliğinden çeken akış — bkz. akis.js */
const akis = require("./akis");
/* Oyun içi denge duyurusunu ayrıştıran yardımcı — bkz. duyuru.js */
const duyuru = require("./duyuru");
/* Kule hasarı: kulelerin azami canını gözleyerek öğreniyor (bkz. kule.js). */
const kule = require("./kule");
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
  /* ÖNCE TEMİZLE. Bu fonksiyon artık önbellekten çıkan gövdeye HER İSTEKTE
     yeniden uygulanıyor; eski karar üstünde kalırsa rozet kaldırıldığında
     ekrandan silinmez. Sıfırdan karar vermek tek doğru davranış. */
  delete nesne.verified; delete nesne.note;
  delete nesne.pro; delete nesne.proRank; delete nesne.proMedals; delete nesne.proSezon;
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
  /* EN İYİ SEZONU barajı geçmiş oyuncu. Liste profil okundukça doluyor,
     o yüzden rozet savaş listesinde ve akışta da çıkabiliyor — oralarda
     "en iyi sezon" alanı hiç gelmiyor (bkz. prosezon.js). */
  else if (prosezon.varMi(t)) { nesne.pro = true; nesne.proSezon = true; }
  return nesne;
}

const CARD_STATS = "https://royaleapi.github.io/cr-api-data/json/cards_stats.json";
/* Aynı dosyayı iki yer okuyor (özellikler + savaş değerleri); bir kez indir.
   Hata olursa null kalır, sonraki çağrı yeniden dener. */
let statsRaw = null, statsAn = 0;
async function cardStatsJson() {
  /* Bu dosya kart özelliklerinin ve savaş değerlerinin kaynağı; o
     yüzden onun da tazelenmesi gerekiyor, yoksa üsttekilere süre
     eklemenin bir anlamı kalmaz — hep aynı eski gövdeyi işlerlerdi. */
  if (!statsRaw || !tazeMi(statsAn)) {
    try {
      const y = await (await fetch(CARD_STATS)).json();
      if (y && (y.troop || y.characters)) { statsRaw = y; statsAn = Date.now(); }
    } catch (e) { if (!statsRaw) throw e; console.warn("⚠️  Kart veri dosyası tazelenemedi:", String(e)); }
  }
  return statsRaw;
}
let traitMap = null, traitAn = 0;
/* SEVİYEYE GÖRE DEĞER.

   Oyun verisindeki `hitpoints` alanı kartın 1. SEVİYE değeri; nadirlikler
   farklı seviyeden başladığı için bu sayılar BİRBİRİYLE KARŞILAŞTIRILAMAZ.
   Şampiyon 11'den, Efsanevi 9'dan, Destansı 6'dan, Nadir 3'ten başlıyor —
   yani bir Şampiyonun "temel" canı zaten 11. seviyesi, bir Nadir'inki ise
   3. seviyesi.

   Yayında bunun bedeli görüldü (kullanıcı bildirdi): "hangisinin canı en
   yüksek" sorusunda Okçu Kraliçe (Şampiyon, temel 1000) Felaket Kulesi'ni
   (Nadir, temel 825) yeniyordu. Oysa ikisi de 11. seviyede karşılaştığında
   Felaket Kulesi 1749 canla açık ara önde. Cevap yanlıştı.

   Bütün kartları TURNUVA STANDARDINA (11. seviye) çekiyoruz — Kart
   Kapışması oyunu zaten bunu yapıyordu (bkz. cardCombat, ILK_SEVIYE);
   özellik tablosunda atlanmıştı. `*_per_level` dizisi yoksa temel değere
   düşülüyor: yanlış sayı üretmektense eldekiyle devam etmek daha az zararlı,
   ama o kart karşılaştırmaya girerse yine yanılabilir — bu yüzden dizi
   olmayan kart soruya SOKULMUYOR (bkz. quiz.js → hpDogru). */
function seviyeliDeger(nesne, alan, nadirlik) {
  const ilk = ILK_SEVIYE[String(nadirlik || "").toLowerCase()];
  const dizi = nesne && nesne[alan + "_per_level"];
  if (ilk == null || !Array.isArray(dizi)) return null;
  const i = KAPISMA_SEVIYE - ilk;
  return (i >= 0 && dizi[i] != null) ? dizi[i] : null;
}

/* SAVAŞ DEĞERİ DÜZELTMELERİ — kaynak veri geride kaldığında.

   `cards_stats.json` denge güncellemelerinin gerisinde kalabiliyor;
   Fırın'ın türünde, kart türlerinde ve Elit Barbarlar'ın evriminde
   aynı gecikme yaşandı. Bir oyuncu yanlış değer bildirdiğinde
   düzeltme buraya bir satır olarak giriyor.

   İKİ VERİ YOLUNA DA uygulanıyor (cardTraits ve cardCombat). Bu şart:
   yarışma soruları birinciden, Kart Kapışması ikinciden besleniyor ve
   ölçüldü — 43 ortak kartta ikisi birebir aynı. Tek yola düzeltme
   koymak o eşitliği bozar, iki oyun farklı sayı gösterir.

   ANAHTAR: chrKey(kart adı). Değerler oyun içi kart ekranındaki
   birimlerde: can 11. seviye, vuruş hızı MİLİSANİYE.

   Kaynak düzelince satır silinebilir; silinmezse de zarar vermez,
   aynı değeri söylemiş olur. */
const SAVAS_DUZELTME = new Map([
  ["battlehealer", { hitSpeed: 2000 }],   // Şifacı: oyuncu bildirdi, kaynak 1500 diyordu
]);

/* Bir kartın düzeltmesini uygula. Yalnızca VERİLEN alanlar değişiyor. */
function savasDuzelt(ad, deger) {
  const d = SAVAS_DUZELTME.get(chrKey(ad));
  return d ? { ...deger, ...d } : deger;
}

async function cardTraits() {
  if (traitMap && tazeMi(traitAn)) return traitMap;
  /* Tazeleme başarısız olursa ELDEKİ kopya korunuyor ve damga
     kurulmuyor, yani bir sonraki istek yeniden deniyor. Boş bir
     haritayı önbelleğe almak, tek bir ağ kesintisini kalıcı hasara
     çevirirdi. */
  const eski_traitMap = traitMap;
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
      /* İKİNCİ BİRİM. Bazı kartlar TEK TİP birim çıkarmıyor; oyunun verisinde
         bunun için ayrı bir alan var (`summon_character_second`) ve kod onu
         hiç okumuyordu. Ölçüldü: iki kartı etkiliyor, ikisi de yanlış
         çıkıyordu —

           Goblin Çetesi = 3 Goblin (havaya vurmaz) + 3 Mızraklı Goblin (vurur)
           Serseriler    = 1 Serseri Oğlan (vurmaz)  + 2 Serseri Kız (vurur)

         Yalnızca ilk birim okunduğu için ikisi de "havaya vuramaz" sayılıyordu.
         Kullanıcı bildirdi: "hangisi havaya vurur" sorusunda Goblin Çetesi
         çeldirici olarak çıkıyor, halbuki çetedeki mızraklılar havaya vuruyor —
         yani sorunun iki doğru cevabı oluyordu.

         `air` iki birimin BİRLEŞİMİ: kartın çıkardığı herhangi bir birim havaya
         vurabiliyorsa kart havaya vurabiliyor demektir. `count` de toplam.

         `karma` işareti, tek bir sayıyla anlatılamayan kartları belli ediyor:
         Goblin Çetesi'nin "menzili" yok — içinde hem yakın dövüşçü hem menzilli
         var. Menzil sorusu bu kartları eliyor (bkz. quiz.js → ranged). */
      const ch2 = t.summon_character_second ? chars.get(chrKey(t.summon_character_second)) : null;
      const sayi = (t.summon_number || 0) + (ch2 ? (t.summon_character_second_count || 0) : 0);
      traitMap.set(chrKey(t.name), savasDuzelt(t.name, {
        air: !!ch.attacks_air || !!(ch2 && ch2.attacks_air),
        flying: (ch.flying_height || 0) > 0,
        onlyBuildings: !!ch.target_only_buildings,
        speed: ch.speed || 0,                    // 45 slow · 60 medium · 90/120 fast
        // summon_number 0 or 1 is a single figure; 2+ is a squad.
        count: sayi,
        karma: !!ch2,                            // birden fazla TİP birim çıkarıyor
        // Menzil kademeleri için bkz. quiz.js → MENZIL_YAKIN / MENZIL_UZAK.
        range: ch.range || 0,
        /* 11. seviyeye çekilmiş can — bkz. seviyeliDeger. Ham `hitpoints`
           nadirlikler arasında karşılaştırılamaz. */
        hp: seviyeliDeger(ch, "hitpoints", ch.rarity) || 0,
        hpSeviyeli: seviyeliDeger(ch, "hitpoints", ch.rarity) != null,
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
      }));
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
        hp: seviyeliDeger(bld, "hitpoints", bld.rarity) || 0,
        hpSeviyeli: seviyeliDeger(bld, "hitpoints", bld.rarity) != null,
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
  /* Ölçüt "boş değil" DEĞİL, "eskisinden küçük değil".
     cardNamesTR haritayı elle yazılan çevirilerle tohumluyor: çekim
     başarısız olsa bile harita boş görünmüyor ve "boş değil" ölçütü
     bozuk hâli 6 saat önbelleğe alırdı. Küçülme her zaman kayıp
     demektir; o durumda eldeki kopya korunuyor. */
  if (traitMap && traitMap.size && (!eski_traitMap || traitMap.size >= eski_traitMap.size)) traitAn = Date.now();
  else if (eski_traitMap) traitMap = eski_traitMap;
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
let combatMap = null, combatAn = 0;
async function cardCombat() {
  if (combatMap && tazeMi(combatAn)) return combatMap;
  /* Tazeleme başarısız olursa ELDEKİ kopya korunuyor ve damga
     kurulmuyor, yani bir sonraki istek yeniden deniyor. Boş bir
     haritayı önbelleğe almak, tek bir ağ kesintisini kalıcı hasara
     çevirirdi. */
  const eski_combatMap = combatMap;
  combatMap = new Map();
  try {
    const j = await cardStatsJson();
    const chars = new Map((j.characters || []).map((c) => [chrKey(c.name), c]));
    const projs = new Map((j.projectile || []).map((p) => [chrKey(p.name), p]));
    for (const t of j.troop || []) {
      if ((t.summon_number || 0) >= 2) continue;              // yığın kartları elensin
      /* KARMA BİRİM çıkaran kartlar da elensin.

         Kart Kapışması iki kartın canını, hasarını ve vuruş hızını
         karşılaştırıyor — yani her karta TEK bir sayı atfediyor.
         Serseriler bu elemeden kaçıyordu: `summon_number` 1 (bir oğlan),
         ama kart ayrıca iki Serseri Kız çıkarıyor ve onların değerleri
         tamamen farklı (oğlan 1500 ms / 758 can, kız 1000 ms / 102 can).
         Kullanıcı bildirdi: "Serseriler kaç saniyede vurur, 1,5 diyor —
         kızdan mı oğlandan mı bahsediyor?"

         Böyle bir kartı karşılaştırmaya sokmak, hangi birimden
         bahsedildiğini söylemeden "hangisi daha güçlü" diye sormak
         olurdu. Yığın kartları zaten aynı sebeple eleniyordu. */
      if (t.summon_character_second) continue;
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
      combatMap.set(chrKey(t.name),
        savasDuzelt(t.name, { hp, dmg, hitSpeed: hiz, level: KAPISMA_SEVIYE }));
    }
    console.log(`⚔️  Kart savaş değerleri hazır (${combatMap.size} kart, ${KAPISMA_SEVIYE}. seviye).`);
  } catch (e) { console.warn("⚠️  Kart savaş değerleri alınamadı:", String(e)); }
  /* Ölçüt "boş değil" DEĞİL, "eskisinden küçük değil".
     cardNamesTR haritayı elle yazılan çevirilerle tohumluyor: çekim
     başarısız olsa bile harita boş görünmüyor ve "boş değil" ölçütü
     bozuk hâli 6 saat önbelleğe alırdı. Küçülme her zaman kayıp
     demektir; o durumda eldeki kopya korunuyor. */
  if (combatMap && combatMap.size && (!eski_combatMap || combatMap.size >= eski_combatMap.size)) combatAn = Date.now();
  else if (eski_combatMap) combatMap = eski_combatMap;
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
   Turkish client, plus the cards it is simply too old to know.

   BURAYA YAZMADAN ÖNCE OKU. Bu tablo yayımlanan çeviriyi EZİYOR, yani buraya
   konan her yanlış doğrudan ekrana çıkıyor ve doğrulaması zor. Bir kartın
   Türkçe adını buraya yalnızca oyunun kendi ekranında GÖRDÜKTEN sonra ekle.

   Düzeltildi (kullanıcı bildirimi + oyundan doğrulandı): "Bandit" burada
   "Yaramaz" yazıyordu. Kullanıcı desteyi oyuna yapıştırdığında kartın
   "Haydut" olduğunu gördü. Supercell'in kendi çeviri tablosu da
   TID_SPELL_ASSASSIN için "Haydut" diyor ve "Yaramaz" hiçbir kartın adı
   değil — kelime yalnızca Serseriler'in AÇIKLAMA metninde geçiyor.
   Satır kaldırıldı, yayımlanan ad kullanılıyor.

   Düzeltildi: "Boss Bandit" burada "Patron Haydut" diye tahmin edilmişti;
   Türkçe istemcide "Boss Haydut" yazıyor (oyundan doğrulandı).

   Aşağıda yayımlanan tabloyla ÇELİŞEN iki satır kaldı; ikisi de yalnızca
   yazım farkı ve ikisi de oyun ekranından teyit bekliyor:
     "Barbarian Barrel" → bizde "Barbar Fıçısı", tabloda "Barbar Varili"
     "Musketeer"        → bizde "Silahşör",      tabloda "Silahşor"
*/
const TR_NAME_EXTRA = {
  "Barbarian Barrel": "Barbar Fıçısı", "Musketeer": "Silahşör",
  "Little Prince": "Küçük Prens", "Goblin Demolisher": "Goblin Yıkıcı",
  "Goblin Machine": "Goblin Makinesi", "Suspicious Bush": "Şüpheli Çalı",
  "Goblinstein": "Goblinstein", "Rune Giant": "Rün Devi", "Berserker": "Yaramaz",
  "Boss Bandit": "Boss Haydut", "Ronin": "Ronin", "Void": "Boşluk",
  "Goblin Curse": "Goblin Laneti", "Spirit Empress": "Ruh İmparatoriçe",
  "Vines": "Sarmaşıklar",
};
let trNameMap = null, trNameAn = 0;
async function cardNamesTR() {
  if (trNameMap && tazeMi(trNameAn)) return trNameMap;
  /* Tazeleme başarısız olursa ELDEKİ kopya korunuyor ve damga
     kurulmuyor, yani bir sonraki istek yeniden deniyor. Boş bir
     haritayı önbelleğe almak, tek bir ağ kesintisini kalıcı hasara
     çevirirdi. */
  const eski_trNameMap = trNameMap;
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
  /* Ölçüt "boş değil" DEĞİL, "eskisinden küçük değil".
     cardNamesTR haritayı elle yazılan çevirilerle tohumluyor: çekim
     başarısız olsa bile harita boş görünmüyor ve "boş değil" ölçütü
     bozuk hâli 6 saat önbelleğe alırdı. Küçülme her zaman kayıp
     demektir; o durumda eldeki kopya korunuyor. */
  if (trNameMap && trNameMap.size && (!eski_trNameMap || trNameMap.size >= eski_trNameMap.size)) trNameAn = Date.now();
  else if (eski_trNameMap) trNameMap = eski_trNameMap;
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
let arenaMap = null, arenaAn = 0;
async function cardArenas() {
  if (arenaMap && tazeMi(arenaAn)) return arenaMap;
  /* Harita YERELDE kuruluyor, ancak dolduğunda değiştiriliyor.

     Eskiden `arenaMap = new Map()` en başta yapılıyordu: çekim
     başarısız olursa geriye BOŞ harita kalıyor ve süresiz önbellek
     yüzünden site, süreç yeniden başlayana kadar hiçbir kartın
     arenasını bilmiyordu. Tek bir ağ kesintisi kalıcı hasar
     veriyordu. Şimdi hata olursa elde ne varsa o kalıyor; yoksa boş
     harita dönüyor ama DAMGA KURULMUYOR, yani bir sonraki istek
     yeniden deniyor. */
  try {
    const j = await (await fetch(CARD_DATA)).json();
    const yeni = new Map();
    j.forEach((c) => { if (c.arena != null) yeni.set(chrKey(c.name), c.arena); });
    if (yeni.size) { arenaMap = yeni; arenaAn = Date.now(); }
  } catch (e) { console.warn("⚠️  Arena bilgisi alınamadı:", String(e)); }
  return arenaMap || new Map();
}

/* Card list, with the Troop/Building/Spell kind and the combat traits
   attached — the official payload has neither, and the card game needs both. */
app.get("/api/cards", async (req, res) => {
  try {
    /* Yanıt zaten sunucuda önbellekli; bu başlık tarayıcının da aynı
       saniyeler içinde tekrar sormasını engelliyor. Video trafiği için
       ölçüldü: sunucu ~275 istek/sn'de doyuyor, en ucuz kazanç tekrar
       eden isteği hiç yaptırmamak. */
    res.set("Cache-Control", "public, max-age=600");
    const data = await cached("cards+kind+traits+tr", 3600e3, async () => {
      const [body, kinds, traits, tr, heroSet] = await Promise.all([
        kartListesi(),
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
          heroImg: heroPortrait(c.name, c),
          /* Kahraman yuvası bilgisi ARTIK SUNUCUDAN geliyor. Ön yüz bunu
             kendisi `maxEvolutionLevel` üzerinden çıkarıyordu ve kuralın
             kaçırdığı kartlarda (Yaramaz) yanılıyordu; tek doğru burada. */
          heroOnly: heroSet.has(c.name),
          heroDual: HERO_DUAL.has(c.name),
          /* API'de hiç işaret taşımayan kahraman (Yaramaz). Ön yüz savaş
             günlüklerini kendi eşlediği için aynı kuralı orada da uygulaması
             gerekiyor; "işaretli mi" diye bakmak bu kartlarda çalışmıyor. */
          /* Eskiden "API’de işaret taşımayan kahraman" (Haydut) için vardı;
             Haydut kahraman olmadığı anlaşıldı, alan uyumluluk için kalıyor. */
          heroNoFlag: false,
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
    heroImg: isHero ? heroPortrait(c.name, c) : "",
  };
}

const modmeta = require("./modmeta");
/* "Bu kartın evrimi var mı" tek yerde cevaplanıyor — bkz. evrim.js */
const evrim = require("./evrim");
const oneri = require("./oneri");

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
      /* Nihai DIŞINDAKİ takip edilen modlar burada birikiyor.

         Bu satırdan önce bu maçlar sessizce atılıyordu. Büyük Mücadele
         için ayrı bir meta kurmanın maliyeti, ölçüldüğünde, SIFIR ek API
         çağrısı çıktı: aynı günlükleri zaten okuyoruz, yalnızca ikinci
         kez değerlendiriyoruz. Örneklemi büyütmek 1000 çağrı/tazeleme
         demek olurdu ve yine deste başına yeterli maç vermezdi. */
      if (b.type !== "pathOfLegend") { modmeta.macEkle(b, sampledTags); continue; }
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
/* KAHRAMAN LİSTESİ — API'nin kendi işaretinden.

   Bu liste bir zamanlar tahminle kuruluyordu ("maxEvolutionLevel taşıyıp evrim
   görseli olmayan kart kahramandır") ve kuralın kaçırdığı sanılan Haydut
   (Bandit) elle eklenmişti. İKİSİ DE YANLIŞTI.

   Kullanıcı bildirdi: aynı destede iki "Yaramaz" çıkıyor, biri 3 iksir.
   İncelenince görüldü ki:
     · assets/img/heroes/bandit.jpeg dosyasının içine "Yaramaz" yazısı basılı
       ve karakter sarı saçlı bir çocuk. Haydut ise yeşil kapüşonlu, maskeli,
       beyaz saçlı bir kadın (kart görselinden doğrulandı).
     · O portredeki karakter 26000102 Berserker'ın ta kendisi.
   Yani oyunun "Yaramaz" adlı kahramanı Berserker; Haydut ise kahraman DEĞİL.

   Kesin ölçüt API'nin kendisinde: `iconUrls.heroMedium`. Bu alanı tam 16 kart
   taşıyor ve oyunun kahraman sayısı da 16. Haydut'ta bu alan yok, üstelik
   `maxEvolutionLevel` de yok — hiçbir işareti yokken listeye zorlanmıştı.
   Berserker'da ise var.

   Artık tahmin yok: kahraman = heroMedium taşıyan kart. "Yalnızca kahraman" =
   heroMedium var, evrim görseli yok (Şövalye, Valkür, Silahşör ve Büyücü
   ikisini birden taşıdığı için bu listeye girmez). */
let heroOnly = null;
let heroAll = null;
async function heroOnlyCards() {
  if (heroOnly) return heroOnly;
  const body = await kartListesi();
  const items = body.items || [];
  heroAll = new Set(items.filter((c) => c.iconUrls?.heroMedium).map((c) => c.name));
  /* "YALNIZCA KAHRAMAN" KÜMESİ GERÇEKTE BOŞ.

     Ölçüt eskiden "kahraman çizimi var ama evrim çizimi yok" idi ve 12
     kartı buraya sokuyordu. Ölçüldü: kahraman görseli olan 16 kartın
     HEPSİNİN evrimi de var (bkz. evrim.js). Yani o 12 kart yanlış
     sınıflanıyordu; küme doğru ölçütle boş çıkıyor.

     Kümeyi kaldırmıyoruz: ileride evrimi olmayan bir kahraman kartı
     çıkarsa burası kendiliğinden doğru çalışsın. */
  heroOnly = new Set(items
    .filter((c) => c.iconUrls?.heroMedium && !evrim.evrimiVar(c))
    .map((c) => c.name));
  console.log(`🦸  Kahraman kuralı hazır (${heroAll.size} kahraman · ${heroOnly.size} yalnızca kahraman).`);
  return heroOnly;
}
/* BÜTÜN kahramanlar (evrimi de olanlar dahil).

   `heroOnlyCards` evrimi olanları AYIKLIYOR — deste jeneratöründe
   kahraman yuvası ile evrim yuvasını ayırmak için. Ama "kimler
   kahramandır" sorusunun cevabı ayıklanmamış küme; Kartlar sayfasındaki
   Kahramanlar sekmesi bunu istiyor. İki kümeyi karıştırmak, Şövalye ve
   Silahşör gibi hem kahraman hem evrimi olan kartları listeden düşürürdü. */
async function heroAllCards() {
  await heroOnlyCards();          // heroAll'u dolduran yer burası
  return heroAll || new Set();
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
              kahramanlar tanım gereği `flagged` içinde olmuyor.
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

  /* Buradaki "işaretsiz kahraman" kuralı KALDIRILDI. Tek amacı Haydut’u
     kahraman yuvasına oturtmaktı; Haydut’un kahraman olmadığı anlaşıldı
     (API’de heroMedium taşımıyor — bkz. heroOnlyCards). Kural kalsaydı her
     Haydut’lu destede boş kahraman yuvasına Haydut yazılırdı. */
  return { evos: evos.slice(0, MAX_EVO_SLOTS), heroes };
}

app.get("/api/meta", async (req, res) => {
  try {
    /* Yanıt zaten sunucuda önbellekli; bu başlık tarayıcının da aynı
       saniyeler içinde tekrar sormasını engelliyor. Video trafiği için
       ölçüldü: sunucu ~275 istek/sn'de doyuyor, en ucuz kazanç tekrar
       eden isteği hiç yaptırmamak. */
    res.set("Cache-Control", "public, max-age=120");

    /* MOD SEÇİMİ. Varsayılan Nihai — adres parametresi olmadan gelen
       eski istemciler ve önbellekteki eski sayfalar bugünkü davranışı
       görmeye devam etsin. */
    const mod = String(req.query.mod || "nihai").toLowerCase();
    if (mod !== "nihai") {
      if (!Object.values(modmeta.MODLAR).includes(mod))
        return res.status(400).json({ error: "mod", message: "Bilinmeyen mod." });
      /* Kart çözümü burada yapılıyor: modmeta yalnızca kart KİMLİĞİ
         saklıyor, ad ve görsel her zaman güncel kart listesinden
         geliyor. Kopyalasaydı kart adı değiştiğinde eski ad donardı. */
      const body = await kartListesi();
      const kartlar = new Map((body.items || []).map((c) => [c.id, c]));
      const tr = await cardNamesTR();
      const coz = (id) => {
        const c = kartlar.get(id);
        if (!c) return null;
        return { id: c.id, name: c.name, nameTR: tr.get(c.name) || c.name,
                 elixir: c.elixirCost || 0, rarity: c.rarity || "",
                 icon: c.iconUrls?.medium || "", evoIcon: c.iconUrls?.evolutionMedium || "" };
      };
      return res.json({ mod, ...modmeta.liste(mod, coz) });
    }

    const { all, ...rest } = await metaCached();   // `all` is served separately
    res.json({ mod: "nihai", ...rest });
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/* Hangi modlarda ne kadar veri birikti — arayüz sekmeyi buna göre
   açıyor ve "biriktiriliyor" uyarısını buradan yazıyor. */
app.get("/api/meta/modlar", (req, res) => {
  res.set("Cache-Control", "public, max-age=60");
  res.json(modmeta.durum());
});

/* Eşleşme tablosu: "bu karşılaşmada kim kazanıyor?".
   Tablo arka planda birikiyor (bkz. eslesme.js), burada sadece okunuyor —
   yani uç nokta her zaman anında yanıtlıyor, hiç API çağırmıyor.
   5 dakikalık tarayıcı önbelleği: tablo zaten 10 dakikada bir değişiyor. */
const eslesme = require("./eslesme");
/* ============================================================
   OYUN KAPAK GÖRSELLERİ
   ------------------------------------------------------------
   assets/img/oyunlar/ klasörüne bir dosya konunca site onu kendiliğinden
   kullanmaya başlasın diye var. Dosya adı oyunun KİMLİĞİ: gunun.png,
   duello.webp gibi.

   Neden kimlik, görünen ad değil: kahraman portrelerinde dosyalar Türkçe
   ada göre adlandırılmıştı ve bir portre yanlış karta bağlanıp ekranda
   yanlış kart gösterilmişti. Kimlik değişmez, çeviriye bağlı değil.

   Klasör HER İSTEKTE değil, 60 saniyede bir taranıyor: dosya koyunca bir
   dakika içinde görünüyor ama trafik altında disk sürekli okunmuyor.
   ============================================================ */
/* ============================================================
   KAPAK GÖRSELİ KLASÖRLERİ
   ------------------------------------------------------------
   İki klasör var ve ikisi aynı kurallarla okunuyor:

     oyunlar/  — Eğlence sayfasındaki oyunların kapakları
     arayuz/   — Sıralamalar, Meta, Son Maçlar gibi BÖLÜM kapakları

   Tarama mantığı tek bir yerde: uzantı önceliği, sürüm damgası ve
   önbellek. İkinci klasör için kodu kopyalasaydım, ileride birinde
   düzeltilen bir hata ötekinde yaşamaya devam ederdi — nitekim uzantı
   önceliği bir kez zaten sessizce bozulmuştu. */
const IMG_UZANTI = ["png", "webp", "jpg", "jpeg", "gif"];
const KAPAK_KLASOR = {
  oyun:   path.join(__dirname, "..", "assets", "img", "oyunlar"),
  arayuz: path.join(__dirname, "..", "assets", "img", "arayuz"),
  /* Meta sayfasındaki mod kutucukları (Nihai, Mücadele, Kupa Yolu). */
  modlar: path.join(__dirname, "..", "assets", "img", "modlar"),
};
const KAPAK_YOL = { oyun: "assets/img/oyunlar/", arayuz: "assets/img/arayuz/",
                    modlar: "assets/img/modlar/" };
const kapakOnbellek = {};       // tur -> { harita, an }

function kapaklariOku(tur) {
  const o = kapakOnbellek[tur];
  if (o && Date.now() - o.an < 60e3) return o.harita;
  const harita = {};
  const uzantiSecimi = {};
  try {
    for (const dosya of fs.readdirSync(KAPAK_KLASOR[tur])) {
      const nokta = dosya.lastIndexOf(".");
      if (nokta <= 0) continue;
      const kimlik = dosya.slice(0, nokta);
      const uzanti = dosya.slice(nokta + 1).toLowerCase();
      if (!IMG_UZANTI.includes(uzanti)) continue;
      /* Aynı kimlik için iki uzantı varsa listedeki ÖNCE geleni kazanır;
         yoksa hangisinin çıkacağı klasör sırasına kalırdı.

         Öncelik ADRESTEN değil, ayrıca tutulan uzantıdan okunuyor:
         adresin sonunda sürüm damgası var ve "png?v=123" hiçbir
         uzantıya eşleşmediğinden karşılaştırma sessizce bozulurdu. */
      const eskiU = uzantiSecimi[kimlik];
      if (eskiU && IMG_UZANTI.indexOf(eskiU) <= IMG_UZANTI.indexOf(uzanti)) continue;
      uzantiSecimi[kimlik] = uzanti;
      /* SÜRÜM DAMGASI. Görseller bir gün önbelleğe alınıyor (bilinçli:
         46 piksellik simgeler için her ziyarette yeniden indirmek
         israf). Ama adres sabit kalırsa, klasördeki dosya değişse bile
         tarayıcı bir gün boyunca eski baytları gösterir — yeni kapak
         yüklendiği hâlde "güncellenmedi" görünür. Adrese dosyanın
         değişim zamanı ekleniyor: içerik aynı kaldıkça adres de aynı
         kalıp önbellek çalışıyor, dosya değiştiği anda adres değişip
         yeni kapak anında iniyor. */
      let damga = "";
      try { damga = "?v=" + Math.floor(fs.statSync(path.join(KAPAK_KLASOR[tur], dosya)).mtimeMs); } catch {}
      harita[kimlik] = KAPAK_YOL[tur] + dosya + damga;
    }
  } catch { /* klasör yoksa boş harita */ }
  kapakOnbellek[tur] = { harita, an: Date.now() };
  return harita;
}
const oyunGorselleriOku = () => kapaklariOku("oyun");
app.get("/api/oyun-gorselleri", (req, res) => {
  res.set("Cache-Control", "public, max-age=60");
  /* Oyun ve arayüz kapakları TEK YANITTA. İki ayrı uç açmak, her sayfa
     açılışında ikinci bir gidiş-dönüş demekti; ikisi de aynı anda ve
     aynı yerde kullanılıyor. Eski `oyun-gorselleri` adı korunuyor:
     tarayıcıda önbellekte duran eski sayfalar bu adresi çağırmaya devam
     ediyor ve alan adı değişseydi kapaklar bir süre kaybolurdu.

     Eski biçim de korunuyor — yanıtın kökündeki alanlar hâlâ oyun
     kapakları. Yeni sayfalar `arayuz` alanına bakıyor. */
  res.json({ ...kapaklariOku("oyun"), arayuz: kapaklariOku("arayuz"),
             modlar: kapaklariOku("modlar") });
});
app.get("/api/eslesme", (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(eslesme.durum());
});

/* ============================================================
   MAÇ ANALİZİ  —  /api/analiz?a=…&b=…
   ------------------------------------------------------------
   İki somut destenin karşılaşma oranı. Örneklem kademeli aranıyor
   (tam deste → ≥7 → ≥6 → ≥5 ortak kart → arketip); hangi kademeden
   geldiği ve kaç maça dayandığı yanıtta yazıyor.

   Sayı ne kadar sağlam, onu SAKLAMIYORUZ: `pay` alanı %95 güven
   payını puan cinsinden veriyor. 12 maçlık bir ölçüm ±25 puan
   oynuyor; bunu göstermeden yüzde basmak okuyucuyu yanıltır.
   ============================================================ */
const analizKimlik = (s) =>
  String(s || "").split(",").map((x) => parseInt(x, 10)).filter(Number.isFinite);

app.get("/api/analiz", (req, res) => {
  const a = analizKimlik(req.query.a), b = analizKimlik(req.query.b);
  const tekil = (d) => new Set(d).size === 8;
  if (a.length !== 8 || b.length !== 8 || !tekil(a) || !tekil(b))
    return res.status(400).json({ error: "deste", mesaj: "Her iki deste de 8 farklı kart içermeli." });

  /* `sadeceDeste=1` ile arketip yedeği kapanıyor: beş kart eşleşen
     deste yoksa tahmin yürütmek yerine "bulunamadı" dönüyor. */
  const s = eslesme.analiz(a, b, { sadeceDeste: String(req.query.sadeceDeste || "") === "1" });
  res.set("Cache-Control", "public, max-age=120");
  const yuzde = (v) => (v == null ? null : Math.round(v * 1000) / 10);
  res.json({
    kaynak: s.kaynak,                     // "deste" | "arketip" | "yok"
    katman: s.katman ?? null,             // kaç ortak kartla eşlendi (8..5), arketipte 0
    mac: s.mac || 0,
    /* Bu ucun kullandığı eşik ANALIZ_MIN (30); MIN_ORNEK (40) meta
       ekranlarının eşiği. Yanlış sayıyı bildirmek arayüze "30 maç
       bulundu, eşik 40" gibi tutarsız bir cümle kurdururdu. */
    minOrnek: eslesme.ANALIZ_MIN || eslesme.MIN_ORNEK,
    oran: yuzde(s.oran),                  // senin deste yüzden
    alt: yuzde(s.alt), ust: yuzde(s.ust), // %95 aralık
    pay: yuzde(s.pay),                    // ± puan
    arketip: s.arketip || null,
    /* Hangi kademede kaç maç bulundu — arayüz "tam eşleşme yoktu,
       6 ortak karta düşüldü" diyebilsin diye. */
    denenen: s.denenen || [],
    hata: s.hata || null,
  });
});


/* ============================================================
   ANTİ DESTE — yeniden kuruldu
   ------------------------------------------------------------
   Eski hâli iki KAZANMA KOŞULU arasında ölçüyordu ve kullanıcı haklı
   olarak şunu bildirdi: iki bambaşka Mega Şövalye destesi aynı ada
   düşüp "ayna eşleşme" görünüyordu.

   Yeni zincir (bkz. eslesme.js başındaki ölçüm):
     1. Seçilen destenin ARKETİPİ bulunuyor (katman 1 kazanma koşulu).
        Bulunamazsa analiz YOK — "random bir destenin analizi zaten
        yapılmaz".
     2. Tabloda her META DESTESİNİN o arketibe karşı kendi oranı var.
     3. %55 ve üstündekiler, kesinliğe göre sıralanıp veriliyor.

   Yani artık "Kraliyet Devi destesi %63" değil, "ŞU deste, Yaban
   Domuzu destelerine karşı %63" deniyor — oran destenin kendisine ait.
   ============================================================ */
/* Kart kimliği → kart nesnesi. Anti uçları desteyi yalnızca kimlik
   listesi olarak alıyor; adı, iksiri ve görseli buradan geliyor. */
let kartHaritasi = null;
async function kartlarIdIle() {
  if (kartHaritasi) return kartHaritasi;
  const body = await kartListesi();
  kartHaritasi = new Map((body.items || []).map((c) => [c.id, c]));
  return kartHaritasi;
}

const ANTI_ESIK = 55;      // bu orandan itibaren "anti" sayılıyor
const ANTI_SAYI = 8;       // en çok kaç deste döndürülsün


/* Bir meta destesini (kart kimlikleri) ekranda çizilebilir hâle getirir.
   Evrim/kahraman yuvaları burada BİLİNMİYOR — deste anahtarı yalnızca
   kimlik taşıyor — o yüzden meta derlemesinden aynı desteyi bulup
   yuvalarını ondan alıyoruz; bulunamazsa düz kartlar çiziliyor. */
async function antiDesteCiz(ids, metaAll) {
  const harita = await kartlarIdIle();
  const anahtar = [...ids].sort((a, b) => a - b).join(",");
  const eslesen = (metaAll || []).find(
    (d) => d.cards.map((c) => c.id).sort((a, b) => a - b).join(",") === anahtar);
  if (eslesen) return { cards: eslesen.cards, usage: eslesen.usage, winrate: eslesen.winrate,
                        battles: eslesen.battles, key: eslesen.key };
  return {
    cards: ids.map((id) => { const c = harita.get(id); return c ? metaCard(c, false, false) : null; })
              .filter(Boolean),
    usage: null, winrate: null, battles: null, key: anahtar,
  };
}

/* Seçilebilecek desteler = tablodaki ARKETİPLERİN ta kendisi.
   Eskiden meta derlemesinden geliyordu ve listede olup tabloda olmayan
   desteler seçilebiliyordu; seçince de "veri yok" çıkıyordu. */
app.get("/api/anti/desteler", async (req, res) => {
  try {
    const tablo = eslesme.durum();
    const meta = await metaCached().catch(() => ({ all: [] }));
    const harita = await kartlarIdIle();
    const items = [];
    for (const m of tablo.metalar || []) {
      const ciz = await antiDesteCiz(m.ids, meta.all);
      const kartlar = m.ids.map((id) => harita.get(id)).filter(Boolean);
      const koc = eslesme.kosulSec(kartlar);
      items.push({ ...ciz, oynanma: m.n, koc: koc ? { id: koc.id, ad: koc.ad, k: koc.katman } : null });
    }
    res.set("Cache-Control", "public, max-age=300");
    res.json({
      sezon: tablo.sezon, ortusme: tablo.ortusme,
      items,
      /* Arketip kısayolu: yalnızca katman 1. */
      koclar: (tablo.koc || []).map((c) => ({ id: c.id, ad: c.ad })),
    });
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/* ============================================================
   DESTE ÖNERİSİ  —  /api/oneri/:tag
   ------------------------------------------------------------
   Oyuncunun KENDİ kart seviyelerine göre, metaya yakın bir deste.
   Kararın tamamı server/oneri.js içinde ve saf bir fonksiyon —
   ağ olmadan sınanabilsin diye orada duruyor.

   Burada yalnızca üç veri toplanıyor: oyuncunun kartları, meta
   desteler ve kart künyeleri (tür/iksir/ad/görsel). Tür bilgisi
   önemli: yedek kart aynı türden seçiliyor, yoksa binanın yerine
   büyü koyup desteyi bozardık.
   ============================================================ */
app.get("/api/oneri/:tag", async (req, res) => {
  try {
    const { status, body } = await cr(`/players/${normTag(req.params.tag)}`);
    if (status !== 200) return res.status(status).json(body || { error: "player" });
    if (!Array.isArray(body.cards) || !body.cards.length)
      return res.status(422).json({ error: "kart", message: "Bu hesabın kart listesi okunamadı." });

    const { items: metaDesteler } = await metaCached();
    const liste = await kartListesi();
    const tr = await cardNamesTR();
    const kinds = await cardKinds();
    const traits = await cardTraits();

    const kartBilgi = new Map();
    for (const c of liste.items || []) {
      kartBilgi.set(c.id, {
        name: c.name,
        nameTR: tr.get(c.name) || c.name,
        elixir: c.elixirCost || 0,
        rarity: c.rarity || "",
        tur: kinds.get(chrKey(c.name)) || "",
        /* Kazanma koşulu ayrımı için: yalnızca binaları hedefleyen kart mı.
           oneri.js bunu kule yıkan kartı destekle değiştirmemek için
           kullanıyor. */
        hedefBina: !!(traits.get(chrKey(c.name)) || {}).onlyBuildings,
        icon: c.iconUrls?.medium || "",
        evoIcon: c.iconUrls?.evolutionMedium || "",
        /* Kahraman portresi: kahraman yuvasındaki kart kendi görseliyle
           çizilsin, sıradan hâliyle değil. */
        heroImg: c.iconUrls?.heroMedium || "",
      });
    }

    /* TEK DEĞİL LİSTE: tek deste önermek oyuncuya seçme hakkı
       bırakmıyordu — beğenmediği bir arketip çıktığında yapabileceği
       bir şey yoktu. */
    const oneriler = oneri.onerListe({ oyuncuKartlari: body.cards, metaDesteler, kartBilgi });
    if (!oneriler.length)
      return res.status(503).json({ error: "veri", message: "Meta verisi henüz hazır değil, birazdan tekrar dene." });

    /* Kişiye özel: paylaşılan bir ara bellekte durmasın. */
    res.set("Cache-Control", "private, max-age=120");
    /* `oneriler` yeni biçim. Kökteki alanlar İLKİNİ tekrar ediyor:
       tarayıcıda önbellekte duran eski oyuncu.html tek deste bekliyor
       ve alan kaldırılsaydı o pencerede öneri hiç çizilmezdi. */
    res.json({ tag: body.tag, name: body.name, oneriler, ...oneriler[0] });
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

app.get("/api/anti", async (req, res) => {
  try {
    const harita = await kartlarIdIle();
    const tablo = eslesme.durum();

    /* Seçilen tarafın ARKETİPİ. İki giriş biçimi: deste ya da doğrudan koç. */
    let hedef = null;
    let secilenAnahtar = null;   // seçilen destenin kart anahtarı (bkz. aşağısı)
    if (req.query.koc) {
      const kart = harita.get(parseInt(req.query.koc, 10));
      const k = kart ? eslesme.kosulSec([kart]) : null;
      if (!k || k.katman !== 1)
        return res.status(400).json({ error: "bad_koc", mesaj: "Bu kart bir kazanma koşulu olarak tanınmıyor." });
      hedef = k;
    } else {
      const ids = String(req.query.deste || "").split(",")
        .map((x) => parseInt(x, 10)).filter(Number.isFinite);
      /* Kullanıcının SEÇTİĞİ destenin kendisi. Aşağıda listeden çıkarılıyor:
         bir deste kendisinin antisi olamaz. Kullanıcı bildirdi — koçbaşı
         destesinin antileri arasında birebir aynı deste görünüyordu.

         Neden oluyordu: eşleşme tablosu "deste × kazanma koşulu" çiftinde
         tutuluyor. Seçilen destenin KOÇBAŞI ARKETİPİNE karşı oranı da
         tabloda bir hücre ve o hücre listeye giriyordu. Sayı yanlış değil
         (kendi destesinin öbür koçbaşı destelerine karşı oranı), ama
         "bu deste seni yener" diye okunuyor; anlamsız. */
      if (ids.length < 1 || ids.length > 8)
        return res.status(400).json({ error: "bad_deck", mesaj: "Deste 1–8 kart kimliği olmalı." });
      const k = eslesme.kosulSec(ids.map((id) => harita.get(id)).filter(Boolean));
      /* Katman 2'ye düşen desteler (Mega Şövalye vb.) analiz ALMIYOR —
         kullanıcının bildirdiği anlamsız etiketler tam olarak bunlardı. */
      hedef = k && k.katman === 1 ? k : null;
      /* Yalnızca TAM deste verildiyse (8 kart) dışlıyoruz. Eksik kartla
         gelen sorgu bir desteyi değil bir yaklaşımı tarif ediyor. */
      if (ids.length === 8) secilenAnahtar = [...ids].sort((x, y) => x - y).join(",");
    }
    if (!hedef) return res.json({ hazir: true, kocYok: true, sayac: [],
      mesaj: "Bu deste tanıdığımız bir arketipe girmiyor, o yüzden eşleşme istatistiği çıkarılamıyor. Analiz yalnızca meta destelerinde yapılıyor." });

    const meta = await metaCached().catch(() => ({ all: [] }));
    const sayac = [];
    for (const m of tablo.metalar || []) {
      /* Seçilen destenin ta kendisi listeye girmesin. */
      if (secilenAnahtar && [...m.ids].sort((x, y) => x - y).join(",") === secilenAnahtar) continue;
      const kayit = tablo.hucreler[`${m.k}||${hedef.id}`];
      if (!kayit || kayit[0] < tablo.minOrnek) continue;
      const [n, w] = kayit;
      const oran = w / n * 100;
      const kartlar = m.ids.map((id) => harita.get(id)).filter(Boolean);
      const kendiKoc = eslesme.kosulSec(kartlar);
      /* Kendi arketibine karşı olan satır "ayna" değil, geçerli bir
         hücre; ama seçilenle AYNI arketipse ayrıca işaretliyoruz. */
      const ciz = await antiDesteCiz(m.ids, meta.all);
      sayac.push({
        ...ciz, oynanma: m.n, n, yuzde: +oran.toFixed(1),
        pay: +(1.96 * Math.sqrt((oran / 100) * (1 - oran / 100) / n) * 100).toFixed(1),
        koc: kendiKoc ? { id: kendiKoc.id, ad: kendiKoc.ad } : null,
        ayniArketip: !!(kendiKoc && kendiKoc.id === hedef.id),
      });
    }
    /* Ham yüzdeye göre DEĞİL güven alt sınırına göre: 45 maçlık bir %64
       (±14), 240 maçlık bir %63'ten (±6) daha az kesindir. */
    sayac.sort((x, y) => (y.yuzde - y.pay) - (x.yuzde - x.pay) || y.n - x.n);

    res.set("Cache-Control", "public, max-age=120");
    res.json({
      hazir: tablo.hazir,
      secilen: { koc: { id: hedef.id, ad: hedef.ad, e: hedef.e } },
      esik: ANTI_ESIK, minOrnek: tablo.minOrnek,
      sezon: tablo.sezon, savas: tablo.savas, karma: tablo.karma,
      sayac: sayac.slice(0, ANTI_SAYI * 3),
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
    /* Yanıt zaten sunucuda önbellekli; bu başlık tarayıcının da aynı
       saniyeler içinde tekrar sormasını engelliyor. Video trafiği için
       ölçüldü: sunucu ~275 istek/sn'de doyuyor, en ucuz kazanç tekrar
       eden isteği hiç yaptırmamak. */
    res.set("Cache-Control", "public, max-age=20");
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
      /* Rozetler burada DEĞİL, önbellekten çıkarken basılıyor (aşağıda) —
         bkz. Nihai sıralamasındaki not. */
      /* Canlı akışta da kule hasarı görünsün. */
      for (const b of sonuc) kule.isle(b);
      return { items: sonuc, scanned: players.length, top: LIVE_TOP };
    });
    /* Rozetler önbelleğin DIŞINDA basılıyor: akış 60 sn önbellekli, rozet
       kararı ise her istekte tazelenmeli (bkz. Nihai sıralamasındaki not).
       Burada, feed hazır olduktan sonra. */
    const proAkis = await proPlayers();
    for (const b of (feed?.items || []))
      for (const taraf of [...(b?.team || []), ...(b?.opponent || [])])
        if (taraf && taraf.tag) rozetle(taraf, taraf.tag, proAkis);
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
onay.mount(app);
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
  cardsBody: () => kartListesi(),
  cardKinds, cardTraits, cardNamesTR, cardArenas, chrKey,
});
/* Oyunların ortak veri kaynakları. Hepsi zaten hesapladığımız şeyler:
   kart listesi, meta desteleri ve ilk 100'ün son maç desteleri. */
const gameDeps = {
  readSession: auth.readActiveSession,
  addPoints: board.award,
  allCards: async () => {
    const [body, kinds, traits, tr, arenas, heroSet] = await Promise.all([
      kartListesi(),
      cardKinds(), cardTraits(), cardNamesTR(), cardArenas(), heroOnlyCards(),
    ]);
    return (body.items || []).map((c) => ({
      id: c.id,
      name: c.name, tr: tr.get(c.name) || c.name, elixir: c.elixirCost || 0,
      rarity: c.rarity || "", type: kinds.get(chrKey(c.name)) || "",
      traits: traitBul(traits, c.name),
      /* EVRİM = yalnızca yayımlanmış evrim çizimi (41 kart).

         Burada `maxEvolutionLevel` de sayılıyordu ve o alan KAHRAMAN
         mekaniğini de işaretliyor (53 kart, 16'sı kahraman). Sonuç: Günün
         Kartı oyununda "Evrimi var mı → Evet" ipucu, evrimi olmayan 16
         kahraman kartı için yalan söylüyordu. Mega Minyon bir kahraman;
         evrimi yok ama o alanı taşıyor.

         Kahraman bilgisi zaten aşağıda ayrı duruyor (`kahraman`), yani
         ikisini tek alanda birleştirmeye gerek yok. */
      evo: evrim.evrimiVar(c),
      evoIcon: c.iconUrls?.evolutionMedium || "",
      kahraman: heroSet.has(c.name) || HERO_DUAL.has(c.name),
      kahramanTek: heroSet.has(c.name),          // evrimi yok, yalnızca kahraman
      heroImg: heroPortrait(c.name, c),             // gerçek kahraman görseli (varsa)
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
const feedback = require("./feedback");
feedback.mount(app, {
  readSession: auth.readActiveSession, listUsers: auth.listUsers,
  banUser: auth.banUser, unbanUser: auth.unbanUser, userInfo: auth.userInfo, banSteps: auth.BAN_STEPS,
  isAdmin: auth.isAdmin, adminLabel: auth.adminLabel,
});
const messages = require("./messages");
messages.mount(app, {
  readSession: auth.readActiveSession, listUsers: auth.listUsers,
  isAdmin: auth.isAdmin, userInfo: auth.userInfo,
});
const bildirim = require("./bildirim");
bildirim.mount(app, {
  readSession: auth.readActiveSession, isAdmin: auth.isAdmin,
  veriKaydet: auth.veriKaydet,
  /* takvim.js server.js icinde ust duzey degisken degil, satir icinde
     cagriliyor. Adiyla gecirmek `undefined` gonderirdi ve zamanlayici
     ilk kurulumda patlardi. */
  takvim: require("./takvim"),
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
/* Bu ikisi eksikti: kullanıcı kimliğiyle kayıt tutuyorlardı ama hesap
   silindiğinde temizlenmiyorlardı. */
auth.veriKaydet("Geri bildirimler", feedback.kullaniciOzeti, feedback.kullaniciSil);
auth.veriKaydet("Rozet başvuruları", badges.kullaniciOzeti, badges.kullaniciSil);

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
/* ============================================================
   ÖNBELLEK BAŞLIKLARI
   ------------------------------------------------------------
   Ölçüldü (yayında, video öncesi): her dosya `Cache-Control: public,
   max-age=0` ile çıkıyordu. Yani bir ziyaretçi sayfayı her açtığında
   CSS, JS ve bütün görseller için sunucuya YENİDEN geliyordu. ETag
   sayesinde gövde tekrar inmiyor ama her dosya için tam bir gidiş-dönüş
   yapılıyor — 20 dosyalık bir sayfada 20 istek.

   Yük testi ölçümü: sunucu ~275 istek/sn'de doyuyor (400 eşzamanlıya
   kadar çökmüyor, kuyruğa giriyor). Trafiği azaltmanın en ucuz yolu
   tekrar eden istekleri hiç yaptırmamak.

   Süreler bilerek KISA tutuldu; yayın sırasında bir düzeltme çıkarsa
   kullanıcıya hızla ulaşsın diye:
     · görsel/font — 1 gün (içerik değişince dosya adı değişiyor)
     · CSS/JS      — 5 dakika (acil düzeltme 5 dakikada yayılır)
     · HTML        — 1 dakika (giriş noktası, taze kalmalı)
   `stale-while-revalidate` ile tarayıcı süresi dolmuş kopyayı ANINDA
   gösterip tazelemeyi arka planda yapıyor: kullanıcı beklemiyor.

   Not: bu başlıklar Cloudflare açıldığında (turuncu bulut) kenar
   önbelleğinin de dayanağı olur; başlıklar olmadan CF hiçbir şeyi
   önbelleğe almaz. */
const ONBELLEK = [
  [/\.(webp|avif|png|jpe?g|gif|svg|ico|woff2?|ttf)$/i, "public, max-age=86400, stale-while-revalidate=604800"],
  [/\.(css|js|mjs)$/i,                                 "public, max-age=300, stale-while-revalidate=3600"],
  [/\.html?$/i,                                        "public, max-age=60, stale-while-revalidate=600"],
];
/* ============================================================
   CSS/JS SÜRÜM DAMGASI
   ------------------------------------------------------------
   Yukarıdaki başlıkta CSS/JS için `stale-while-revalidate=3600` var:
   5 dakikalık tazelik dolunca tarayıcı BİR SAAT boyunca eski kopyayı
   ekrana basıp tazelemeyi arka planda yapabiliyor. Görsellerde bu
   zararsız çünkü adreslerine zaten `?v=<mtime>` ekleniyor; CSS/JS'te
   eklenmiyordu.

   Bedeli yayında görüldü: desteler sayfası çıktığında düzen kuralı yeni
   CSS'teydi, sunucu doğru dosyayı veriyordu, önbelleksiz tarayıcıda
   ölçüm doğruydu — ama açık duran Chrome eski CSS'i gösterdiği için
   kartlar alt alta ve tam genişlikte duruyordu. Kullanıcının elle
   yenilemesi gerekiyordu.

   Çözüm: HTML içindeki `assets/css/*.css` ve `assets/js/*.js`
   adreslerine dosyanın değişim zamanını ekliyoruz. Dosya değişince
   ADRES değişiyor, tarayıcının eski kaydı o adrese ait olmadığı için
   yeni dosya hemen iniyor — elle yenileme gerekmiyor.

   Maliyet: HTML dosyaları bellekte, mtime'a göre anahtarlanmış olarak
   tutuluyor. Dosya değişmediği sürece disk okuması yok. */
const HTML_ONBELLEK = new Map();   // yol → { htmlMtime, varliklar, govde }
const DAMGA_KALIP = /\b(href|src)="(assets\/(?:css|js)\/[A-Za-z0-9._-]+\.(?:css|m?js))"/g;

/* Damgalanmış gövdeyi ve dayandığı dosyaların zamanlarını birlikte üretir.

   `varliklar` ŞART: ilk yazımda önbellek yalnızca HTML'in değişim
   zamanına bakıyordu. HTML'e dokunmadan sadece `app.js` ya da
   `styles.css` değiştirildiğinde — ki olağan durum bu — gövde
   önbellekten geliyor ve ESKİ damgayı taşıyordu. Yani düzeltme çıkıyor,
   adres değişmiyor, tarayıcı eski dosyayı kullanmaya devam ediyordu:
   damganın önlemesi gereken hatanın ta kendisi. Sınama yakaladı
   (t_damga: "dosya değişince damga da değişiyor"). */
function damgaliGovde(kok, tam) {
  const govde = fs.readFileSync(tam, "utf8");
  const varliklar = [];
  const yeniGovde = govde.replace(DAMGA_KALIP, (hepsi, nitelik, yol) => {
    try {
      const v = Math.floor(fs.statSync(path.join(kok, yol)).mtimeMs);
      varliklar.push({ yol, v });
      return nitelik + '="' + yol + "?v=" + v + '"';
    } catch { return hepsi; }   // dosya yoksa adresi olduğu gibi bırak
  });
  return { varliklar, govde: yeniGovde };
}

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  /* Yalnızca .html ve klasör kökü. Sorgu dizesi req.path'e girmiyor. */
  let yol;
  try { yol = decodeURIComponent(req.path); } catch { return next(); }
  if (yol.endsWith("/")) yol += "index.html";
  if (!/.html?$/i.test(yol)) return next();

  const kok = path.join(__dirname, "..");
  const tam = path.join(kok, yol);
  /* Kök dışına çıkma denemesi statik katmana bırakılıyor (o da reddeder). */
  if (!tam.startsWith(kok)) return next();

  let st;
  try { st = fs.statSync(tam); } catch { return next(); }   // yoksa 404 katmanına
  if (!st.isFile()) return next();

  let kayit = HTML_ONBELLEK.get(tam);
  const bayat = !kayit || kayit.htmlMtime !== st.mtimeMs || kayit.varliklar.some((x) => {
    try { return Math.floor(fs.statSync(path.join(kok, x.yol)).mtimeMs) !== x.v; }
    catch { return true; }
  });
  if (bayat) {
    kayit = Object.assign({ htmlMtime: st.mtimeMs }, damgaliGovde(kok, tam));
    HTML_ONBELLEK.set(tam, kayit);
  }
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
  res.type("html").send(kayit.govde);
});


app.use(express.static(path.join(__dirname, ".."), {
  dotfiles: "deny",
  setHeaders(res, dosya) {
    const tur = EK_MIME[path.extname(dosya).toLowerCase()];
    if (tur) res.type(tur);
    for (const [kalip, deger] of ONBELLEK) {
      if (kalip.test(dosya)) { res.set("Cache-Control", deger); return; }
    }
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
  yedek.basla();
  haber.yukle();
  /* Akışa KART ADI ÇEVİRİCİSİ veriliyor: haber metnindeki ad,
     sitenin geri kalanında yazan adla aynı olsun. */
  akis.basla(haber, () => cardNamesTR());
  require("./mail").acilistaSina();
  /* Yayında hangi ayarlarla çalıştığını açılışta yazıyoruz: kalıcı disk
     bağlanmadıysa ya da vekil ayarlanmadıysa bunu günlükten görmek,
     kullanıcılar "hesabım silinmiş" demeden önce fark etmeyi sağlıyor. */
  const { DATA_DIR } = require("./veriyolu");
  console.log(`    Veri klasörü: ${DATA_DIR}${process.env.DATA_DIR ? "" : "  ⚠️  DATA_DIR ayarlı değil — bulutta veri kalıcı OLMAZ"}`);
  console.log(`    CR API: ${CR_BASE}${/royaleapi/.test(CR_BASE) ? "  (vekil)" : "  (doğrudan — IP beyaz listesi gerekir)"}`);
  if (process.env.SINIRSIZ_OYUN === "1")
    console.log("    ⚠️  SINIRSIZ OYUN KİPİ AÇIK — günlük hak sayılmıyor. Bu, canlıda ASLA açık olmamalı.");
  if (!CRAWL_CLANS) console.log("    Oyuncu adı indeksi KAPALI (CRAWL_CLANS=0) — arama yalnızca etiketle.");
  require("./takvim").banner();
  kalkan.banner();
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
