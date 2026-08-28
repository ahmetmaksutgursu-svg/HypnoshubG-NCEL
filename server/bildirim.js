/* ============================================================
   HYPNOSHUB — BİLDİRİMLER (Web Push)
   ------------------------------------------------------------
   İstenen: tablo yenilendiğinde, yani puanlı oyunlar tekrar
   oynanabilir hâle geldiğinde, bildirimi açan kullanıcılara haber
   gitsin.

   Neden GERÇEK push, sayfa içi uyarı değil:
   Sayfa içi bir uyarı yalnızca site AÇIKKEN görülür. Ama haber
   verilmek istenen şey tam olarak "sitede değilken haberin olsun"
   — kişi 18.00'da siteye bakmıyorsa hakkının yenilendiğini
   öğrenemez. Web Push tarayıcı kapalıyken de ulaşıyor.

   ------------------------------------------------------------
   ANAHTARLAR
   VAPID anahtar çifti, push servislerine "bu bildirimi gerçekten
   bu site gönderdi" demenin yolu. Ortam değişkeni olarak
   verilebilir (VAPID_PUBLIC / VAPID_PRIVATE); verilmemişse ilk
   çalıştırmada üretilip KALICI DİSKE yazılıyor.

   Diske yazmak şart: anahtar değişirse mevcut bütün abonelikler
   geçersiz olur ve herkesin yeniden izin vermesi gerekir. Railway'de
   dosya sistemi geçici, o yüzden veriYolu() kullanılıyor — kalıcı
   birime düşüyor.

   ------------------------------------------------------------
   KVKK
   Abonelik kaydı bir kişisel veri: hangi kullanıcının hangi cihazı
   bildirim alıyor. Bu yüzden `veriKaydet` ile silme/görüntüleme
   zincirine bağlanıyor — "hesabımı sil" dendiğinde abonelikler de
   gidiyor. Kayıtta IP ya da tarayıcı parmak izi TUTULMUYOR; yalnızca
   push servisinin verdiği adres ve şifreleme anahtarları.
   ============================================================ */

const fs = require("fs");
const crypto = require("crypto");
const { veriYolu } = require("./veriyolu");

let webpush = null;
try { webpush = require("web-push"); }
catch { console.warn("⚠️  web-push kurulu değil — bildirimler kapalı."); }

const DOSYA = veriYolu("push-subs.json");
const ANAHTAR_DOSYA = veriYolu("push-keys.json");

/* userId -> [ { endpoint, keys:{p256dh,auth}, at, ad } ] */
let abonelikler = {};
try { abonelikler = JSON.parse(fs.readFileSync(DOSYA, "utf8")) || {}; } catch { abonelikler = {}; }

let yazZaman = null;
function kaydet() {
  clearTimeout(yazZaman);
  yazZaman = setTimeout(() => {
    try {
      const tmp = DOSYA + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(abonelikler));
      fs.renameSync(tmp, DOSYA);
    } catch (e) { console.warn("⚠️  Bildirim abonelikleri kaydedilemedi:", String(e)); }
  }, 400);
}

/* ---------- VAPID ---------- */
let VAPID = null;
function anahtarlar() {
  if (VAPID) return VAPID;
  const ortamAcik = process.env.VAPID_PUBLIC, ortamGizli = process.env.VAPID_PRIVATE;
  if (ortamAcik && ortamGizli) {
    VAPID = { publicKey: ortamAcik, privateKey: ortamGizli, kaynak: "ortam değişkeni" };
    return VAPID;
  }
  try {
    const d = JSON.parse(fs.readFileSync(ANAHTAR_DOSYA, "utf8"));
    if (d && d.publicKey && d.privateKey) { VAPID = { ...d, kaynak: "kalıcı disk" }; return VAPID; }
  } catch { /* ilk çalıştırma */ }
  if (!webpush) return null;
  const yeni = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(ANAHTAR_DOSYA, JSON.stringify(yeni));
    console.log("🔔  VAPID anahtarları üretildi ve kalıcı diske yazıldı.");
  } catch (e) {
    /* Yazılamazsa da çalışmaya devam ediyoruz ama uyarıyoruz: süreç her
       yeniden başladığında anahtar değişir ve abonelikler düşer. */
    console.warn("⚠️  VAPID anahtarları diske yazılamadı — yeniden başlatmada abonelikler düşer:", String(e));
  }
  VAPID = { ...yeni, kaynak: "yeni üretildi" };
  return VAPID;
}

function hazirMi() { return !!(webpush && anahtarlar()); }

function kur() {
  if (!hazirMi()) return false;
  const a = anahtarlar();
  /* İletişim adresi zorunlu: push servisleri sorun çıktığında buraya
     yazıyor. mailto: biçiminde olmalı. */
  webpush.setVapidDetails(process.env.VAPID_MAIL || "mailto:iletisim@hypnoshub.pro", a.publicKey, a.privateKey);
  return true;
}

/* ---------- gönderim ---------- */

/* Bir aboneliğe gönder. Dönen değer: "ok" | "dustu" | "hata"

   `dustu`, push servisinin "bu adres artık geçersiz" demesi (404/410):
   kullanıcı bildirimleri kapatmış ya da tarayıcı verisini silmiş.
   O kaydı listeden çıkarıyoruz, yoksa liste ölü adreslerle şişer ve
   her gönderimde boşuna beklenir. */
async function tekGonder(abone, yuk) {
  try {
    await webpush.sendNotification(abone, JSON.stringify(yuk));
    return "ok";
  } catch (e) {
    const kod = e && e.statusCode;
    if (kod === 404 || kod === 410) return "dustu";
    return "hata";
  }
}

async function herkeseGonder(yuk) {
  if (!kur()) return { gonderildi: 0, dusen: 0, hata: 0, kapali: true };
  let gonderildi = 0, dusen = 0, hata = 0;
  for (const [uid, liste] of Object.entries(abonelikler)) {
    const kalan = [];
    for (const a of liste) {
      const s = await tekGonder(a, yuk);
      if (s === "ok") { gonderildi++; kalan.push(a); }
      else if (s === "dustu") dusen++;
      else { hata++; kalan.push(a); }        // geçici hata: kaydı tutuyoruz
    }
    if (kalan.length) abonelikler[uid] = kalan;
    else delete abonelikler[uid];
  }
  if (dusen) kaydet();
  return { gonderildi, dusen, hata };
}

/* ---------- günlük yenilenme duyurusu ----------

   Tetikleme SAATE bağlı, aralığa değil. `setInterval(24 saat)` yazmak
   kolay olurdu ama süreç her yeniden başladığında sayaç sıfırlanır ve
   duyuru kayar; sunucu günde birkaç kez dağıtım aldığında hiç
   gönderilmeyebilir ya da iki kez gönderilebilir.

   Bunun yerine bir sonraki 18.00'a kalan süre hesaplanıyor ve o an
   geldiğinde gönderilip yeniden kuruluyor. Ayrıca hangi GÜN için
   gönderildiği diske yazılıyor: süreç 18.00'dan hemen sonra yeniden
   başlarsa aynı gün ikinci kez bildirim gitmesin. */
const SON_DOSYA = veriYolu("push-son.json");
function sonGonderim() {
  try { return JSON.parse(fs.readFileSync(SON_DOSYA, "utf8")).gun || ""; } catch { return ""; }
}
function sonGonderimYaz(gun) {
  try { fs.writeFileSync(SON_DOSYA, JSON.stringify({ gun, at: Date.now() })); } catch { /* önemsiz */ }
}

let zamanlayici = null;
function zamanlayiciKur(takvim) {
  clearTimeout(zamanlayici);
  const simdi = new Date();
  const hedef = takvim.sifirlanmaAni(simdi);        // bir sonraki 18.00
  const kalan = Math.max(1000, hedef - simdi);
  /* setTimeout üst sınırı ~24,8 gün; günlük aralık bunun çok altında
     ama yine de güvenli tarafta kalıyoruz. */
  zamanlayici = setTimeout(async () => {
    await gunlukDuyuru(takvim);
    zamanlayiciKur(takvim);
  }, Math.min(kalan, 2147483647));
}

const gunAnahtari = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function gunlukDuyuru(takvim) {
  const gun = gunAnahtari();
  if (sonGonderim() === gun) return { atlandi: "bugün zaten gönderildi" };
  if (!aboneSayisi()) { sonGonderimYaz(gun); return { atlandi: "abone yok" }; }
  const r = await herkeseGonder({
    baslik: "Haklar yenilendi!",
    govde: "Puanlı oyunlar yeniden oynanabilir. Tokmakçılar tablosunda sıranı yükselt.",
    adres: "/eglence.html",
  });
  sonGonderimYaz(gun);
  console.log(`🔔  Günlük bildirim: ${r.gonderildi} gönderildi, ${r.dusen} ölü abonelik silindi, ${r.hata} hata.`);
  return r;
}

function aboneSayisi() {
  return Object.values(abonelikler).reduce((n, l) => n + l.length, 0);
}

/* ---------- uçlar ---------- */
function mount(app, { readSession, isAdmin, veriKaydet, takvim }) {
  app.use("/api/bildirim", require("express").json({ limit: "8kb" }));

  /* Ön yüz açık anahtarı buradan alıyor. Anahtarı gömmek yerine uçtan
     vermek, anahtar değiştiğinde HTML'e dokunmayı gereksiz kılıyor. */
  app.get("/api/bildirim/anahtar", (req, res) => {
    const a = anahtarlar();
    res.set("Cache-Control", "public, max-age=300");
    res.json({ acik: !!a, anahtar: a ? a.publicKey : null });
  });

  app.get("/api/bildirim/durum", (req, res) => {
    const s = readSession(req);
    const liste = s ? (abonelikler[s.user.id] || []) : [];
    res.json({ acik: hazirMi(), girisli: !!s, cihaz: liste.length });
  });

  app.post("/api/bildirim/abone", (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth", message: "Bildirim için giriş yapmalısın." });
    if (!hazirMi()) return res.status(503).json({ error: "kapali", message: "Bildirimler şu an kapalı." });
    const { endpoint, keys } = req.body || {};
    if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) ||
        !keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string")
      return res.status(400).json({ error: "abone", message: "Abonelik bilgisi geçersiz." });
    /* Adres uzunluğuna üst sınır: gövde sınırı zaten 8 KB ama tek bir
       kaydın dosyayı şişirmesini de istemiyoruz. */
    if (endpoint.length > 1000) return res.status(400).json({ error: "abone" });

    const liste = abonelikler[s.user.id] || [];
    /* AYNI CİHAZ İKİ KEZ KAYDEDİLMESİN. Tarayıcı aynı adresi yeniden
       verebiliyor (izin tekrar sorulduğunda, sayfa yenilendiğinde);
       kontrol olmasaydı aynı kişiye aynı bildirimden birkaç tane
       giderdi. Adres cihazın kimliği sayılıyor. */
    const i = liste.findIndex((a) => a.endpoint === endpoint);
    const kayit = { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, at: Date.now() };
    if (i >= 0) liste[i] = kayit; else liste.push(kayit);
    /* Cihaz başına üst sınır: kötü niyetli bir istemcinin listeyi
       şişirmesini engelliyor. */
    abonelikler[s.user.id] = liste.slice(-10);
    kaydet();
    res.json({ ok: true, cihaz: abonelikler[s.user.id].length });
  });

  app.post("/api/bildirim/cik", (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth" });
    const { endpoint } = req.body || {};
    const liste = abonelikler[s.user.id] || [];
    /* Adres verilmişse yalnız o cihaz, verilmemişse hepsi. Kullanıcı
       telefonundan kapattığında bilgisayarındaki bildirimi susturmak
       istemeyebilir. */
    const kalan = endpoint ? liste.filter((a) => a.endpoint !== endpoint) : [];
    if (kalan.length) abonelikler[s.user.id] = kalan; else delete abonelikler[s.user.id];
    kaydet();
    res.json({ ok: true, cihaz: kalan.length });
  });

  /* Yönetici: elle deneme gönderimi. Bildirimin gerçekten ulaşıp
     ulaşmadığını yayına çıkmadan görmenin tek yolu. */
  app.post("/api/bildirim/dene", async (req, res) => {
    const s = readSession(req);
    if (!s || !isAdmin(s.user)) return res.status(403).json({ error: "forbidden" });
    if (!kur()) return res.status(503).json({ error: "kapali", message: "Bildirimler kapalı." });
    const liste = abonelikler[s.user.id] || [];
    if (!liste.length) return res.status(400).json({ error: "abone", message: "Önce kendi cihazından bildirimi aç." });
    let n = 0;
    for (const a of liste) if (await tekGonder(a, {
      baslik: "Deneme bildirimi", govde: "Bildirimler çalışıyor.", adres: "/eglence.html",
    }) === "ok") n++;
    res.json({ ok: true, gonderildi: n });
  });

  /* Yönetici: günlük duyuruyu elle tetikle (aynı gün koruması dahil). */
  app.post("/api/bildirim/duyur", async (req, res) => {
    const s = readSession(req);
    if (!s || !isAdmin(s.user)) return res.status(403).json({ error: "forbidden" });
    const r = await gunlukDuyuru(takvim);
    res.json({ ok: true, ...r });
  });

  /* KVKK zinciri: hesap silindiğinde abonelikler de gitsin. */
  if (veriKaydet) veriKaydet("bildirim",
    (userId) => ({ ad: "Bildirim abonelikleri", adet: (abonelikler[userId] || []).length }),
    (userId) => {
      const n = (abonelikler[userId] || []).length;
      delete abonelikler[userId];
      if (n) kaydet();
      return n;
    });

  if (hazirMi()) {
    kur();
    zamanlayiciKur(takvim);
    const a = anahtarlar();
    console.log(`🔔  Bildirimler hazır (/api/bildirim/*) — ${aboneSayisi()} abonelik, anahtar: ${a.kaynak}.`);
  } else {
    console.log("🔕  Bildirimler kapalı (web-push yok ya da anahtar üretilemedi).");
  }
}

module.exports = { mount, herkeseGonder, aboneSayisi, hazirMi };
