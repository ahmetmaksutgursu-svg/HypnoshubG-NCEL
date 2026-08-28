/* ============================================================
   HYPNOSHUB — puan veren oyunlar
   ------------------------------------------------------------
   Üç oyun, ortak kurallarla:

   1) GÜNÜN KARTI      — herkese aynı gün aynı kart, 6 hak.
   2) DESTE DÜELLOSU   — iki meta destesinden hangisi daha çok
                         kazanıyor?

   Ortak ilkeler (yarışmadaki gibi):
   · Doğru cevap istemciye HİÇ gönderilmez; her cevabı sunucu
     değerlendirir.
   · Puanı sunucu hesaplar, istemci "bana şu kadar ver" diyemez.
   · Her oyunun günlük hakkı var, farm edilemez.
   · Cevaplar canlı veriden doğrulanır: kart verisi, meta
     galibiyet oranları ve ilk 100'ün gerçek maç kayıtları.
   ============================================================ */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { veriYolu } = require("./veriyolu");

/* Yol DATA_DIR ile taşınabilir — buluttaki geçici diskte veri kaybını
   önlemek için. Bkz. veriyolu.js */
const FILE = veriYolu("game-plays.json");

/* Günlük haklar ve puan tavanları.
   Amaç: hiçbir oyun tek başına tabloyu ele geçirmesin. */
const RULES = {
  gunun:  { perDay: 1,  maxPoints: 12 },   // tek deneme, az tahminde bulan çok alır
  duello: { perDay: 10, maxPoints: 1  },   // tur başına 1 puan
  eksik:  { perDay: 3,  maxPoints: 3  },   // tur başına 3 puan → günde en fazla 9
  kapisma:{ perDay: 3,  maxPoints: 3  },   // 3 soru × 1 puan → günde en fazla 9
  iksir:  { perDay: 3,  maxPoints: 5  },   // 5 soru × 1 puan → günde en fazla 15
};

/* İKSİR HESABI — süre ve tur sayısı.
   Süre yarışmadakiyle aynı (7 sn) ve aynı gerekçeyle bir TOLERANS var:
   sayaç istemcide bitiyor, cevabın ağdan dönmesi zaman alıyor. Tolerans
   olmasa kötü bağlantıdaki oyuncu son saniyede bastığında haksız yere
   süre aşımına düşerdi. */
const IKSIR_TUR = 5;
const IKSIR_SURE_MS = Math.max(3000, parseInt(process.env.IKSIR_SURE_MS, 10) || 7000);
const IKSIR_TOLERANS = 2000;

/* ---------- günlük hak sayacı ---------- */
let plays = {};
try { plays = JSON.parse(fs.readFileSync(FILE, "utf8")) || {}; } catch {}
let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const keep = [dayKey(), dayKey(new Date(Date.now() - 864e5))];
      plays = Object.fromEntries(Object.entries(plays).filter(([k]) => keep.some((d) => k.endsWith("|" + d))));
      fs.writeFileSync(FILE, JSON.stringify(plays));
    } catch (e) { console.warn("⚠️  Oyun hakları kaydedilemedi:", String(e)); }
  }, 500);
}
const dayKey = (d = new Date()) => takvim.gunAnahtari(d);
/* SINIRSIZ OYUN KİPİ — yalnızca sınama içindir.

   `SINIRSIZ_OYUN=1` ile başlatılan sunucuda günlük hak sayacı okunmuyor,
   yani puanlı oyunlar sınırsız oynanabiliyor. Amaç, oyunları elle sınarken
   günde üç hakla kısıtlı kalmamak.

   Canlı sunucuda bu değişken TANIMLI DEĞİL, dolayısıyla davranış hiç
   değişmiyor. Değişken bilerek ortamdan okunuyor: kodda sabit bir anahtar
   olsaydı yanlışlıkla açık dağıtılabilirdi. Açıkken sunucu başlarken
   büyük harflerle uyarı yazıyor ki fark edilmeden kalmasın.

   Hak KAYDI yine tutuluyor (notePlay/note çalışıyor); yalnızca kontrol
   sırasında sıfır sayılıyor. Böylece sayaç mantığı da sınanmış oluyor. */
const SINIRSIZ = process.env.SINIRSIZ_OYUN === "1";
const used = (uid, game) => SINIRSIZ ? 0 : (plays[`${game}|${uid}|${dayKey()}`] || 0);
function note(uid, game) {
  const k = `${game}|${uid}|${dayKey()}`;
  plays[k] = (plays[k] || 0) + 1;
  save();
}
const left = (uid, game) => Math.max(0, RULES[game].perDay - used(uid, game));

/* Haklar günlük ve gün sunucunun yerel saatine göre dönüyor (dayKey).
   Hakkı biten kişiye "yarın gel" demek yerine kaç saat kaldığını
   söyleyebilmek için bir sonraki gece yarısını da veriyoruz. */
/* Günlük haklar GECE YARISI değil 18.00'da sıfırlanıyor; kural takvim.js'de
   (tek kaynak — eskiden burada, quiz.js'de ve board.js'de üç ayrı kopyaydı). */
const takvim = require("./takvim");
const resetAt = () => takvim.sifirlanmaAni();

/* ---------- yardımcılar ---------- */
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
function shuffle(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = rnd(i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; }

/* Günün kartı HER HESAPTA FARKLI.

   Eskiden kart yalnızca tarihten türetiliyordu, yani o gün herkese aynı
   kart geliyordu. Site sahibi bildirdi: insanlar ikinci bir hesap açıp
   oynuyor, cevabı öğreniyor ve asıl hesabında ilk denemede biliyor.
   Cevabı paylaşmak da aynı kapıya çıkıyordu — bir kişinin bulduğu kart
   herkesin cevabıydı.

   Artık özet TARİH + HESAP KİMLİĞİ üzerinden alınıyor. Üç özellik de
   korunuyor:
     · Gün boyu SABİT — aynı hesap sayfayı yenileyince kart değişmiyor,
       yani yeniden deneyerek kart çevirmek mümkün değil.
     · Hesaba özel — ikinci hesapta başka kart çıkıyor, öğrenilen cevap
       işe yaramıyor.
     · Tahmin edilemez — tuz gizli, yarının kartı bugünden hesaplanamaz.

   Not: bu değişiklik çok hesap açmayı engellemez, cevabın PAYLAŞILMASINI
   engeller. Çok hesap için ayrı koruma var (kayıt hız sınırı). */
const DAILY_SALT = process.env.DAILY_SALT || "hypnoshub-gunun-karti";
function dailyIndex(n, day = dayKey(), userId = "") {
  const h = crypto.createHash("sha256").update(DAILY_SALT + "|" + day + "|" + userId).digest();
  return h.readUInt32BE(0) % n;
}

/* DÖRT ŞIK — doğru ortalama + üç yakın çeldirici.

   Çeldiriciler BAŞKA DESTELERİN ortalamasından türetilmiyor: iki meta
   destesinin ortalaması aynı çıkabiliyor (ölçüldü: 16 destede birkaç
   çakışma var) ve o zaman iki şık birden doğru olurdu.

   Sapma en az 0,2: 0,1 fark tek bir kartın 1 iksirlik değişimine denk
   gelmiyor bile, oyuncu için yazı-tura olurdu. En çok 0,8: bundan
   uzağı bakar bakmaz eleniyor, soru kolaylaşırdı.

   Değerler METİN olarak dönüyor ("3.4"). Sayı olarak gönderilseydi
   3.40 ile 3.4 karşılaştırması ve kayan nokta yuvarlaması cevabı
   yanlış eleyebilirdi; karşılaştırma metin üzerinden kesin. */
function iksirSiklar(dogru) {
  const kume = new Set([dogru.toFixed(1)]);
  const sapmalar = shuffle([-0.8,-0.7,-0.6,-0.5,-0.4,-0.3,-0.2, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  for (const d of sapmalar) {
    if (kume.size >= 4) break;
    const v = Math.round((dogru + d) * 10) / 10;
    if (v < 1.0 || v > 9.9) continue;     // geçerli iksir aralığı dışına çıkma
    kume.add(v.toFixed(1));
  }
  return shuffle([...kume]);
}

const RARITY_TR = { common: "Sıradan", rare: "Ender", epic: "Destansı", legendary: "Efsanevi", champion: "Şampiyon" };
const KIND_TR = { Troop: "Asker", Building: "Bina", Spell: "Büyü" };

/* ---------- oturumlar ----------
   DEVAM EDEN OYUN SUNUCU YENİDEN BAŞLAYINCA KAYBOLMAMALI.

   Oturumlar yalnızca bellekteydi. Aynı hata yarışmada yaşandı: yayın
   günü birkaç kez dağıtım yapıldı, her dağıtım süreci yeniden başlattı
   ve o anda oynayanların oturumu silindi. Buradaki bedeli daha ağır —
   günlük hak oyun BAŞLARKEN düşülüyor (note), yani oturum kaybolunca
   kişi hakkını da kaybediyor ve Günün Kartı'nda hak günde bir tane.

   Oturumlar küçük ve kısa ömürlü (SESSION_TTL), diske yazmanın maliyeti
   yok. Yazım gecikmeli: her tahminde diske gitmek gereksiz. */
const SESSIONS_FILE = veriYolu("game-sessions.json");
const sessions = new Map();
const SESSION_TTL = 30 * 60e3;

let oturumZaman = null;
function oturumKaydet() {
  clearTimeout(oturumZaman);
  oturumZaman = setTimeout(() => {
    try {
      const tmp = SESSIONS_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify([...sessions]));
      fs.renameSync(tmp, SESSIONS_FILE);
    } catch (e) { console.warn("⚠️  Oyun oturumları kaydedilemedi:", String(e)); }
  }, 400);
}
function oturumYukle() {
  try {
    const ham = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
    const simdi = Date.now();
    let n = 0;
    for (const [id, g] of ham) {
      if (!g || simdi - (g.at || 0) > SESSION_TTL) continue;
      sessions.set(id, g); n++;
    }
    if (n) console.log(`🎮  ${n} yarım kalan oyun oturumu geri yüklendi.`);
  } catch { /* ilk çalıştırma */ }
}
oturumYukle();

function sweep() {
  const n = Date.now();
  let dustu = 0;
  for (const [k, v] of sessions) if (n - v.at > SESSION_TTL) { sessions.delete(k); oturumKaydet(); dustu++; }
  if (dustu) oturumKaydet();
}
const newId = () => crypto.randomBytes(16).toString("hex");

function mount(app, deps) {
  const { readSession, addPoints, allCards, metaDecks, topPlayers, combatCards } = deps;
  app.use("/api/games", require("express").json({ limit: "4kb" }));

  const needAuth = (req, res) => {
    const s = readSession(req);
    if (!s) { res.status(401).json({ error: "auth", message: "Puan kazanmak için giriş yapmalısın." }); return null; }
    return s;
  };

  /* AÇILIŞ KİLİDİ. Yarışma 20 Ağustos 18.00'da başlıyor; o ana kadar puanlı
     oyunlar OYNANAMAZ. Eskiden oynanıyor ama puan yazmıyordu — bu, tabloyu
     bozmuyordu ama insanlar hakkını boşa harcıyordu ve soruların cevabı da
     baştan öğrenilmiş oluyordu. Kilit SUNUCUDA: istemciyi gizlemek yetmez,
     uca doğrudan istek atılabilir. */
  /* Kilit artık "dönem açık mı"ya değil "oynanabilir mi"ye bakıyor.
     Serbest modda oyun açılıyor, puan yazılmıyor — puanı zaten
     board.js reddediyor (addPoints kapalıyken null döner). */
  const acikMi = (res) => {
    if (takvim.oynanabilirMi()) return true;
    /* Tarih SABİT yazılmıyor: ara verildiğinde "20 Ağustos" yanlış
       olurdu. Cümleyi takvim kuruyor. */
    res.status(423).json({ error: "kapali", ...takvim.durum(),
      message: takvim.kilitMesaji("Puanlı oyunlar") });
    return false;
  };

/* ---------- YARIDA KALAN OYUNU BULMA ----------

   Yarışmadaki sorunun aynısı bu dört oyunda da vardı: hak oyunun
   BAŞINDA harcanıyor (note), oturum diskte yaşamaya devam ediyor ama
   `sessionId` yalnızca sayfanın belleğinde duruyordu. Bağlantı koptuğunda
   ya da sunucu yeniden başladığında kullanıcı hem hakkını hem
   ilerlemesini kaybediyordu — Günün Kartı'nda 5 ipucu açmış biri için
   günün tek hakkı demek.

   Açılış yanıtı oturumda SAKLANIYOR (`acilis`). Devam ederken onu
   yeniden üretmeye çalışmıyoruz: dört oyunun yanıtı birbirinden farklı
   (kart listesi, deste çifti, tur dizisi…) ve yeniden üretmek hem
   kartların hem soruların DEĞİŞMESİ riskini taşırdı — kullanıcı devam
   ettiğinde başka bir soru görürdü. Saklanan yanıt, kullanıcının
   gördüğü ekranın birebir aynısını geri getiriyor. */
/* Eski oturumlarla uyum. Diskte Set olarak yazılmış (yani {} olmuş) ya
   da hiç bulunmayan kayıtlar olabilir; ilk dokunuşta diziye çeviriyoruz.
   Yükleme sırasında topluca dönüştürmek de olurdu ama o zaman yeni bir
   alan eklendiğinde aynı dönüşümü orada da hatırlamak gerekirdi — tek
   kapıdan geçirmek daha güvenli. */
function cevaplananDizi(g) {
  if (!Array.isArray(g.cevaplanan)) g.cevaplanan = [];
  return g.cevaplanan;
}

function aktifOyun(userId, kind) {
  const simdi = Date.now();
  for (const [id, g] of sessions) {
    /* Biten oturum zaten siliniyor (sessions.delete), ayrıca işaret aranmıyor. */
    if (g.userId !== userId || g.kind !== kind) continue;
    if (simdi - (g.at || 0) > SESSION_TTL) continue;
    if (!g.acilis) continue;                 // eski oturum: açılışı saklanmamış
    return { id, g };
  }
  return null;
}
/* Devam gövdesi: saklanan açılış + o ana kadarki ilerleme.

   İlerlemeyi ÇAĞIRAN hesaplıyor. İlk yazışımda oturuma bir işlev
   koymuştum (g.ilerleme); oturumlar diske JSON olarak yazıldığı için
   işlev orada kayboluyordu — yani tam da korumak istediğim durumda,
   sunucu yeniden başladığında, ilerleme yok olurdu. Oturumda yalnızca
   veri durur. */
function oyunDevam(id, g, ek = {}) {
  g.at = Date.now();
  oturumKaydet();
  return { ...g.acilis, sessionId: id, devam: true, ...ek };
}

  app.get("/api/games/status", (req, res) => {
    const s = readSession(req);
    const out = { loggedIn: !!s, resetAt: resetAt(), ...takvim.durum(), games: {} };
    for (const g of Object.keys(RULES))
      out.games[g] = { perDay: RULES[g].perDay, left: s ? left(s.user.id, g) : RULES[g].perDay };
    res.json(out);
  });

  /* ================= 1) GÜNÜN KARTI ================= */
  app.post("/api/games/gunun/start", async (req, res) => {
    if (!acikMi(res)) return;
    const s = needAuth(req, res); if (!s) return;

    /* YARIM OYUN VARSA ONU SÜRDÜR — hak kontrolünden ÖNCE.
       Hakkı zaten harcanmış bir oyuna dönmek yeni hak istemek değil;
       kontrolü öne almak, kopan kullanıcıyı kendi yarım oyunundan
       kilitlerdi. Açılan ipuçları da geri getiriliyor. */
    const yarim = aktifOyun(s.user.id, "gunun");
    if (yarim) {
      const ipuclari = [];
      for (let i = 0; i < yarim.g.tries; i++) ipuclari.push(hintFor(i, yarim.g.answer));
      return res.json(oyunDevam(yarim.id, yarim.g, { tries: yarim.g.tries, hints: ipuclari }));
    }

    if (left(s.user.id, "gunun") <= 0)
      return res.status(429).json({ error: "limit", resetAt: resetAt(), message: "Günün kartını bugün zaten oynadın." });

    const cards = (await allCards()).filter((c) => c.tr && c.elixir);
    if (cards.length < 20) return res.status(503).json({ error: "data" });
    const answer = cards[dailyIndex(cards.length, dayKey(), s.user.id)];

    sweep();
    const id = newId();
    /* Açılış yanıtı oturumda saklanıyor: devam ederken kullanıcı ekranın
       BİREBİR aynısını görsün. Yeniden üretmek, kart listesinin arada
       değişmesi hâlinde başka bir oyun göstermek olurdu. */
    const acilis = {
      tries: 0, maxTries: 6,
      names: cards.map((c) => c.tr).sort((a, b) => a.localeCompare(b, "tr")),
      hints: [],
    };
    sessions.set(id, { kind: "gunun", userId: s.user.id, answer, tries: 0, at: Date.now(), acilis }); oturumKaydet();
    note(s.user.id, "gunun");
    res.json({ sessionId: id, ...acilis });
  });

  /* İpuçları sırayla açılır: her yanlış tahmin bir ipucu getirir. */
  function hintFor(i, c) {
    switch (i) {
      case 0: return { k: "İksir", v: String(c.elixir) };
      case 1: return { k: "Enderlik", v: RARITY_TR[c.rarity] || c.rarity };
      case 2: return { k: "Tür", v: KIND_TR[c.type] || c.type || "—" };
      case 3: return { k: "Evrimi var mı", v: c.evo ? "Evet" : "Hayır" };
      case 4: return { k: "Arena", v: c.arena ? "Arena " + c.arena : "—" };
      default: return { k: "İlk harf", v: (c.tr[0] || "?").toUpperCase() };
    }
  }

  app.post("/api/games/gunun/guess", (req, res) => {
    const s = needAuth(req, res); if (!s) return;
    const g = sessions.get(String(req.body?.sessionId || ""));
    if (!g || g.kind !== "gunun" || g.userId !== s.user.id)
      return res.status(400).json({ error: "session" });

    const guess = String(req.body?.guess || "").trim();
    g.tries++; g.at = Date.now();
    oturumKaydet();                 // ilerleme diske yazılsın
    const right = guess.localeCompare(g.answer.tr, "tr", { sensitivity: "base" }) === 0;

    if (right) {
      // 1. denemede 12, sonra 10, 8, 6, 4, 2
      const points = Math.max(2, RULES.gunun.maxPoints - (g.tries - 1) * 2);
      addPoints(s.user.id, points, "gunun");
      sessions.delete(req.body.sessionId); oturumKaydet();
      return res.json({ correct: true, finished: true, tries: g.tries, points, answer: g.answer.tr,
        message: `${g.tries}. denemede bildin — <b>${points} puan</b>!` });
    }
    if (g.tries >= 6) {
      sessions.delete(req.body.sessionId); oturumKaydet();
      return res.json({ correct: false, finished: true, tries: g.tries, points: 0, answer: g.answer.tr,
        message: `Hakkın bitti. Kart <b>${g.answer.tr}</b> idi.` });
    }
    res.json({ correct: false, finished: false, tries: g.tries,
               hint: hintFor(g.tries - 1, g.answer) });
  });

  /* ================= 2) DESTE DÜELLOSU ================= */
  app.post("/api/games/duello/start", async (req, res) => {
    if (!acikMi(res)) return;
    const s = needAuth(req, res); if (!s) return;
    /* Yarım oyun varsa onu sürdür — hak kontrolünden ÖNCE, bkz. gunun. */
    {
      const yarim = aktifOyun(s.user.id, "duello");
      if (yarim) return res.json(oyunDevam(yarim.id, yarim.g));
    }

    if (left(s.user.id, "duello") <= 0)
      return res.status(429).json({ error: "limit", resetAt: resetAt(), message: "Bugünlük düello hakkın bitti." });

    const decks = (await metaDecks()).filter((d) => d.winrate != null && d.battles >= 40);
    if (decks.length < 4) return res.status(503).json({ error: "data", message: "Yeterli meta verisi yok." });

    /* İki deste seç ama aralarında anlamlı bir fark olsun — %50.1'e karşı
       %50.0 sorusu bilgi değil, yazı-tura olurdu. */
    let a = null, b = null, guard = 60;
    while (guard--) {
      const [x, y] = shuffle(decks).slice(0, 2);
      if (x && y && Math.abs(x.winrate - y.winrate) >= 3) { a = x; b = y; break; }
    }
    if (!a) return res.status(503).json({ error: "data" });

    sweep();
    const id = newId();
    const pair = shuffle([a, b]);
    /* Açılış yanıtı oturumda saklanıyor: devam ederken kullanıcı ekranın
       BİREBİR aynısını görsün. Yeniden üretmek, aradaki meta/kart
       değişiminde BAŞKA bir soru göstermek olurdu — kullanıcı kaldığı
       yere değil, yeni bir oyuna dönerdi. */
    const acilis = {
      decks: pair.map((d) => ({ key: d.key, cards: d.cards, usage: d.usage, battles: d.battles })),
      left: left(s.user.id, "duello"),
    };
    sessions.set(id, { kind: "duello", userId: s.user.id, winner: a.winrate > b.winrate ? a.key : b.key, at: Date.now(), acilis }); oturumKaydet();
    note(s.user.id, "duello");
    res.json({ sessionId: id, ...acilis });
  });

  app.post("/api/games/duello/answer", async (req, res) => {
    const s = needAuth(req, res); if (!s) return;
    const g = sessions.get(String(req.body?.sessionId || ""));
    if (!g || g.kind !== "duello" || g.userId !== s.user.id)
      return res.status(400).json({ error: "session" });
    sessions.delete(req.body.sessionId); oturumKaydet();

    const correct = String(req.body?.key || "") === g.winner;
    const points = correct ? RULES.duello.maxPoints : 0;
    if (points) addPoints(s.user.id, points, "duello");

    // Cevap verildikten SONRA oranları göster; öncesinde gönderilmiyor.
    const decks = await metaDecks();
    const rates = {};
    for (const d of decks) rates[d.key] = d.winrate;
    res.json({ correct, points, winner: g.winner, rates, left: left(s.user.id, "duello") });
  });

  /* ================= 3) EKSİK KARTI BUL =================
     Gerçek bir meta destesinin yedi kartı açık, biri gizli. Dört şıktan
     doğrusunu bul.

     Şıklar rastgele kartlardan değil, BAŞKA meta destelerinde geçen
     kartlardan seçiliyor. Rastgele olsaydı yanlış şıklar sırıtırdı
     ("bu destede Kral Devi ne arasın?") ve oyun tahmin bile
     gerektirmezdi; böyleyse dördü de makul görünüyor.

     Doğru cevap istemciye gitmiyor: gizli kartın kimliği sunucudaki
     oturumda duruyor, sayfanın kaynağında yok. */
  app.post("/api/games/eksik/start", async (req, res) => {
    if (!acikMi(res)) return;
    const s = needAuth(req, res); if (!s) return;
    /* Yarım oyun varsa onu sürdür — hak kontrolünden ÖNCE, bkz. gunun. */
    {
      const yarim = aktifOyun(s.user.id, "eksik");
      if (yarim) return res.json(oyunDevam(yarim.id, yarim.g));
    }

    if (left(s.user.id, "eksik") <= 0)
      return res.status(429).json({ error: "limit", resetAt: resetAt(),
        message: "Bugünlük \"Eksik Kartı Bul\" hakkın bitti." });

    const decks = (await metaDecks()).filter((d) => Array.isArray(d.cards) && d.cards.length === 8);
    if (decks.length < 3)
      return res.status(503).json({ error: "data", message: "Meta verisi henüz hazır değil." });

    const deck = pick(decks);
    const gizliIndex = rnd(8);
    const gizli = deck.cards[gizliIndex];
    const kalan = deck.cards.filter((_, i) => i !== gizliIndex);

    /* Yanlış şık havuzu: diğer destelerin kartları, bu destede olmayanlar. */
    const bunda = new Set(deck.cards.map((c) => c.id));
    const havuz = [];
    const gorulen = new Set();
    for (const d of decks) {
      if (d.key === deck.key) continue;
      for (const c of d.cards) {
        if (bunda.has(c.id) || gorulen.has(c.id)) continue;
        gorulen.add(c.id); havuz.push(c);
      }
    }
    if (havuz.length < 3)
      return res.status(503).json({ error: "data", message: "Yeterli meta çeşitliliği yok." });

    const yanlis = shuffle(havuz).slice(0, 3);
    const secenekler = shuffle([gizli, ...yanlis]);

    sweep();
    const id = newId();
    const sade = (c) => ({ id: c.id, name: c.name, elixir: c.elixir, icon: c.icon,
                           evoIcon: c.evoIcon, rarity: c.rarity, hero: c.hero, champion: c.champion });
    /* Açılış yanıtı oturumda saklanıyor: devam ederken kullanıcı ekranın
       BİREBİR aynısını görsün. Yeniden üretmek, aradaki meta/kart
       değişiminde BAŞKA bir soru göstermek olurdu — kullanıcı kaldığı
       yere değil, yeni bir oyuna dönerdi. */
    const acilis = {
      cards: kalan.map(sade),                 // ekranda duran yedi kart
      options: secenekler.map(sade),          // dört şık — hangisi doğru belli değil
      usage: deck.usage, winrate: deck.winrate, battles: deck.battles,
      left: left(s.user.id, "eksik"), resetAt: resetAt(),
    };
    sessions.set(id, { kind: "eksik", userId: s.user.id, answer: gizli.id, at: Date.now(), acilis }); oturumKaydet();
    note(s.user.id, "eksik");
    res.json({ sessionId: id, ...acilis });
  });

  app.post("/api/games/eksik/answer", (req, res) => {
    const s = needAuth(req, res); if (!s) return;
    const g = sessions.get(String(req.body?.sessionId || ""));
    if (!g || g.kind !== "eksik" || g.userId !== s.user.id)
      return res.status(400).json({ error: "session" });
    sessions.delete(req.body.sessionId); oturumKaydet();

    const correct = Number(req.body?.id) === g.answer;
    const points = correct ? RULES.eksik.maxPoints : 0;
    if (points) addPoints(s.user.id, points, "eksik");
    res.json({ correct, points, answer: g.answer,
               left: left(s.user.id, "eksik"), resetAt: resetAt() });
  });

  /* ================= 4) KART KAPIŞMASI =================
     İki kart yan yana, tek bir istatistik soruluyor. Her oyunda üç tur
     ve her turda farklı bir istatistik (can / hasar / vuruş hızı), tur
     başına 1 puan. Değerler 11. seviyeye göre — enderlikler arasında
     adil olan tek ortak seviye (şampiyonlar 11'de başlıyor).
     Doğru cevap istemciye gitmiyor; tur cevaplanınca iki değer birden
     açıklanıyor ki oyuncu neden kaybettiğini görsün. */
  const KAPISMA_TUR = 3;
  const KAPISMA_SORULARI = [
    { alan: "hp",       soru: "Hangisinin canı (HP) daha fazla?",          buyukKazanir: true,  birim: "hp"  },
    { alan: "dmg",      soru: "Hangisinin tek vuruş hasarı daha yüksek?",  buyukKazanir: true,  birim: "dmg" },
    { alan: "hitSpeed", soru: "Hangisinin vuruş hızı daha seri?",          buyukKazanir: false, birim: "sn"  },
  ];
  /* Çok yakın değerler yazı-turaya döner; en az %15 fark arıyoruz.
     Aynı kart iki turda çıkmasın diye kullanılanlar işaretleniyor. */
  const KAPISMA_FARK = 1.15;
  function kapismaEsle(cards, alan, kullanilan) {
    const uygun = cards.filter((c) => !kullanilan.has(c.name) && c[alan] > 0);
    for (let deneme = 0; deneme < 80 && uygun.length > 1; deneme++) {
      const a = pick(uygun), b = pick(uygun);
      if (a.name === b.name) continue;
      const buyuk = Math.max(a[alan], b[alan]), kucuk = Math.min(a[alan], b[alan]);
      if (kucuk <= 0 || buyuk / kucuk < KAPISMA_FARK) continue;
      return { a, b };
    }
    return null;
  }

  app.post("/api/games/kapisma/start", async (req, res) => {
    if (!acikMi(res)) return;
    const s = needAuth(req, res); if (!s) return;
    /* Yarım oyun varsa onu sürdür — hak kontrolünden ÖNCE, bkz. gunun. */
    {
      const yarim = aktifOyun(s.user.id, "kapisma");
      if (yarim) return res.json(oyunDevam(yarim.id, yarim.g, { dogru: yarim.g.dogru || 0, cevaplanan: cevaplananDizi(yarim.g) }));
    }

    if (left(s.user.id, "kapisma") <= 0)
      return res.status(429).json({ error: "limit", resetAt: resetAt(),
        message: "Bugünlük \"Kart Kapışması\" hakkın bitti." });

    const cards = (await combatCards()).filter((c) => c.tr && c.icon);
    if (cards.length < 12)
      return res.status(503).json({ error: "data", message: "Kart verisi henüz hazır değil." });

    const kullanilan = new Set();
    const turlar = [];
    for (const q of shuffle(KAPISMA_SORULARI).slice(0, KAPISMA_TUR)) {
      const e = kapismaEsle(cards, q.alan, kullanilan);
      if (!e) continue;
      kullanilan.add(e.a.name); kullanilan.add(e.b.name);
      const va = e.a[q.alan], vb = e.b[q.alan];
      // Vuruş hızında KÜÇÜK olan daha seri; diğerlerinde büyük olan kazanır.
      const kazanan = q.buyukKazanir ? (va > vb ? e.a : e.b) : (va < vb ? e.a : e.b);
      turlar.push({ q, a: e.a, b: e.b, va, vb, answer: kazanan.id });
    }
    if (turlar.length < KAPISMA_TUR)
      return res.status(503).json({ error: "data", message: "Yeterli kart çeşitliliği yok." });

    sweep();
    const id = newId();
    oturumKaydet();
    const g = {
      /* DİZİ, Set DEĞİL. Oturumlar diske JSON olarak yazılıyor ve
         JSON.stringify bir Set'i {} yapıyor. Yani sunucu yeniden
         başladığında `cevaplanan` boş bir NESNE olarak geri geliyor ve
         ilk cevapta "cevaplanan.has is not a function" ile patlıyordu —
         kullanıcının bildirdiği "sistem hatası" tam olarak bu: oyun
         ölüyor, hak da yanıyordu. Dizi hem yazılıyor hem okunuyor. */
      kind: "kapisma", userId: s.user.id, at: Date.now(), dogru: 0, cevaplanan: [],
      turlar: turlar.map((t) => ({ answer: t.answer, aId: t.a.id, bId: t.b.id, va: t.va, vb: t.vb, birim: t.q.birim })),
    };
    sessions.set(id, g);
    note(s.user.id, "kapisma");

    const sade = (c) => ({ id: c.id, name: c.tr, elixir: c.elixir, icon: c.icon, rarity: c.rarity });
    /* Açılış yanıtı oturumda saklanıyor — turların kendisi de burada.
       Devam eden kullanıcı AYNI üç turu görüyor; yeniden üretilse
       cevapladığı turlar başka sorulara dönerdi. */
    const acilis = {
      level: cards[0].level,
      rounds: turlar.map((t) => ({ soru: t.q.soru, birim: t.q.birim, a: sade(t.a), b: sade(t.b) })),
      left: left(s.user.id, "kapisma"), resetAt: resetAt(),
    };
    g.acilis = acilis;
    oturumKaydet();
    res.json({ sessionId: id, ...acilis });
  });

  app.post("/api/games/kapisma/answer", (req, res) => {
    const s = needAuth(req, res); if (!s) return;
    const g = sessions.get(String(req.body?.sessionId || ""));
    if (!g || g.kind !== "kapisma" || g.userId !== s.user.id)
      return res.status(400).json({ error: "session" });

    const i = Number(req.body?.round);
    if (!Number.isInteger(i) || i < 0 || i >= g.turlar.length)
      return res.status(400).json({ error: "round" });
    // Aynı tur iki kez cevaplanıp puan çoğaltılmasın.
    if (cevaplananDizi(g).includes(i))
      return res.status(400).json({ error: "done", message: "Bu tur zaten cevaplandı." });
    cevaplananDizi(g).push(i); g.at = Date.now();

    const t = g.turlar[i];
    const correct = Number(req.body?.id) === t.answer;
    if (correct) { g.dogru++; addPoints(s.user.id, 1, "kapisma"); }
    const finished = cevaplananDizi(g).length >= g.turlar.length;
    const dogru = g.dogru;
    if (finished) sessions.delete(String(req.body.sessionId));

    res.json({
      correct, answer: t.answer, finished,
      values: { [t.aId]: t.va, [t.bId]: t.vb },     // tur bitti, iki değeri de göster
      dogru, toplam: g.turlar.length, points: dogru,
      left: left(s.user.id, "kapisma"), resetAt: resetAt(),
    });
  });

  /* ================= 6) İKSİR HESABI =================
     Ekranda bir META DESTESİNİN sekiz kartı; oyuncu destenin ORTALAMA
     İKSİR maliyetini dört şıktan seçiyor. 5 soru, her doğru +1 puan.

     YANLIŞ CEVAP ELEMİYOR. Tokmak Yarışması'nda yanlış = tur biter;
     burada beş sorunun beşi de soruluyor. Bilerek farklı: bu oyun
     hız ve göz kararı ölçüyor, bir eleme sınavı değil. Elemeli
     olsaydı ilk soruda yanlış yapan 7 saniyede oyunu bitirirdi.

     SORULAR TEKER TEKER VERİLİYOR — Kart Kapışması'ndaki gibi hepsi
     birden değil. Sebep süre: 7 saniye ancak sorunun ekrana geldiği
     an sunucuda biliniyorsa ölçülebilir. Beşini birden gönderseydik
     istemci "hepsini 2 saniyede cevapladım" diyebilir, sunucunun
     doğrulayacağı bir şey olmazdı.

     KART İKSİRLERİ İSTEMCİYE GÖNDERİLMİYOR. Sekiz kartın tek tek
     maliyetini yollasaydık cevap toplama işlemine dönerdi: konsolu
     açan herkes 5/5 yapardı. İstemci yalnızca görselleri görüyor. */

  /* Sorunun gövdesi — hem açılışta hem devam ederken aynı yerden.
     Süre HER ÇAĞRIDA sıfırlanıyor: bağlantı koptuğu ya da sunucu
     yeniden başladığı için geri dönen oyuncu, kaybettiği saniyelerin
     bedelini ödememeli. */
  const iksirSoru = (id, g, userId, ek = {}) => {
    g.soruAt = Date.now();
    g.at = Date.now();
    oturumKaydet();
    const t = g.turlar[g.step];
    return {
      sessionId: id, step: g.step + 1, toplam: g.turlar.length,
      dogru: g.dogru, cards: t.cards, options: t.options,
      sureMs: IKSIR_SURE_MS, left: left(userId, "iksir"), resetAt: resetAt(), ...ek,
    };
  };

  app.post("/api/games/iksir/start", async (req, res) => {
    if (!acikMi(res)) return;
    const s = needAuth(req, res); if (!s) return;
    /* Yarım oyun varsa onu sürdür — hak kontrolünden ÖNCE, bkz. gunun. */
    {
      const yarim = aktifOyun(s.user.id, "iksir");
      if (yarim) return res.json(iksirSoru(yarim.id, yarim.g, s.user.id, { devam: true }));
    }

    if (left(s.user.id, "iksir") <= 0)
      return res.status(429).json({ error: "limit", resetAt: resetAt(),
        message: "Bugünlük \"İksir Hesabı\" hakkın bitti." });

    /* Sekiz kartı ve her kartın iksiri TAM olan desteler. Eksik veriyle
       ortalama yanlış çıkar ve oyuncu doğru cevabı işaretlediği hâlde
       yanlış sayılırdı. */
    const desteler = (await metaDecks()).filter((d) =>
      Array.isArray(d.cards) && d.cards.length === 8 &&
      d.cards.every((c) => Number.isFinite(c.elixir) && c.icon));
    if (desteler.length < IKSIR_TUR)
      return res.status(503).json({ error: "data", message: "Meta desteleri henüz hazır değil." });

    const turlar = shuffle(desteler).slice(0, IKSIR_TUR).map((d) => {
      const ort = Math.round((d.cards.reduce((a, c) => a + c.elixir, 0) / 8) * 10) / 10;
      return {
        answer: ort.toFixed(1),
        options: iksirSiklar(ort),
        /* elixir ALANI YOK — bkz. yukarıdaki not.

           evo / hero / champion GİDİYOR: deste ekranda evrim ve kahraman
           slotlarıyla, oyundaki görünümünün aynısıyla çizilsin. Bu üç
           alan cevabı ele vermiyor, yalnızca kartın hangi slotta
           durduğunu ve hangi görselin kullanılacağını söylüyor. */
        cards: d.cards.map((c) => ({
          id: c.id, name: c.name, icon: c.icon,
          evo: !!c.evo, evoIcon: c.evoIcon || "",
          hero: !!c.hero, champion: !!c.champion,
          rarity: c.rarity || "", heroImg: c.heroImg || "",
        })),
      };
    });

    sweep();
    const id = newId();
    const g = { kind: "iksir", userId: s.user.id, at: Date.now(), step: 0, dogru: 0, turlar };
    sessions.set(id, g);
    note(s.user.id, "iksir");
    /* aktifOyun() `acilis` alanı olmayan oturumu ESKİ sayıp atlıyor.
       Bu oyunda açılış diye sabit bir gövde yok (sorular teker teker
       veriliyor), ama devam edebilmek için işaretin bulunması gerek. */
    g.acilis = { kind: "iksir" };
    res.json(iksirSoru(id, g, s.user.id));
  });

  app.post("/api/games/iksir/answer", (req, res) => {
    const s = needAuth(req, res); if (!s) return;
    const id = String(req.body?.sessionId || "");
    const g = sessions.get(id);
    if (!g || g.kind !== "iksir" || g.userId !== s.user.id)
      return res.status(400).json({ error: "session" });

    /* Adım İSTEMCİDEN geliyor ama doğrulanıyor: eşleşmezse reddediliyor.
       Böylece aynı soru iki kez cevaplanıp puan çoğaltılamıyor. */
    const i = Number(req.body?.step);
    if (!Number.isInteger(i) || i !== g.step)
      return res.status(400).json({ error: "step", message: "Bu soru zaten cevaplandı." });

    const t = g.turlar[g.step];
    const secim = String(req.body?.choice ?? "");
    const gecen = Date.now() - (g.soruAt || Date.now());
    /* Süre iki yoldan dolabiliyor: istemci sayacı bitince boş cevap
       yolluyor (olağan yol), ya da hiç yollamıyor — o zaman arka duvar
       burada yakalıyor. */
    const zamanAsimi = secim === "" || gecen > IKSIR_SURE_MS + IKSIR_TOLERANS;
    const correct = !zamanAsimi && secim === t.answer;
    if (correct) { g.dogru++; addPoints(s.user.id, 1, "iksir"); }

    g.step++;
    const finished = g.step >= g.turlar.length;
    if (finished) { sessions.delete(id); oturumKaydet(); }

    const govde = {
      correct, answer: t.answer, zamanAsimi, finished,
      dogru: g.dogru, toplam: g.turlar.length, points: g.dogru,
      left: left(s.user.id, "iksir"), resetAt: resetAt(),
    };
    /* Bitmediyse SIRADAKİ soru aynı yanıtta geliyor: ayrı bir istek
       daha atmak, süre sayacının başlangıcını ağ gecikmesine bağlardı. */
    res.json(finished ? govde : { ...govde, ...iksirSoru(id, g, s.user.id) });
  });

  /* ================= 5) DESTE JENERATÖRÜ =================
     Sekiz yuva, her yuvada üç aday — toplam 24 kart. Oyuncu her yuvadan
     birini seçip kendi destesini kuruyor.

     PUANSIZ ve GİRİŞSİZ: kazanılacak bir şey olmadığı için korunacak bir
     cevap da yok. O yüzden burada ne oturum, ne günlük hak, ne de
     addPoints çağrısı var — diğer oyunlardan bilerek ayrılıyor.

     Yuvaların üçü kart verisinden doğrudan çıkıyor (evrim / kahraman /
     bina), üçü elle derlenmiş listeden (atak, büyük büyü, küçük büyü),
     ikisi de iksire göre. Elle derlenen üç liste aşağıda; hepsinin kart
     adları canlı /cards çıktısına karşı doğrulandı (42/42 tuttu). */

  /* ATAK KARTLARI — kuleyi yıkmayı üstlenen kartlar. Bu bilgi API'de yok;
     "kazanma koşulu" oyuncuların koyduğu bir sınıf, veri alanı değil.
     Uydurmamak için liste elle yazıldı ve tek tek kart listesine karşı
     doğrulandı. Yeni kart gelince buraya bir satır eklemek yeterli. */
  const ATAK_KARTLARI = [
    "Hog Rider", "Giant", "Golem", "Royal Giant", "Balloon", "Lava Hound",
    "Elixir Golem", "Miner", "Graveyard", "X-Bow", "Mortar", "Goblin Barrel",
    "Wall Breakers", "Ram Rider", "Battle Ram", "Goblin Drill", "Royal Hogs",
    "Skeleton Barrel", "Electro Giant", "Goblin Giant", "Three Musketeers",
    "Mega Knight", "P.E.K.K.A", "Sparky", "Goblin Demolisher", "Giant Skeleton",
    "Rune Giant", "Suspicious Bush",
  ];
  /* Büyüler iksire göre ayrılabilirdi ama ayrım yanlış olurdu: Goblin Fıçısı
     (3) ve Mezarlık (5) teknik olarak büyü, oynanışta ATAK kartı — ikisi de
     yukarıdaki listede. Geriye kalan gerçek büyüler: */
  const BUYUK_BUYULER = ["Fireball", "Poison", "Lightning", "Rocket", "Freeze"];
  const KUCUK_BUYULER = ["Zap", "The Log", "Barbarian Barrel", "Giant Snowball",
                         "Arrows", "Earthquake", "Royal Delivery", "Tornado", "Rage"];

  /* `rol` kartın O YUVADA nasıl çizileceğini söylüyor:
       evrim    → mor çerçeve + evrim görseli
       kahraman → altın çerçeve + gerçek kahraman görseli
       normal   → düz kart
     Buna ihtiyaç var çünkü özel yuvalar İLK ÜÇÜ; 4–8 arası yuvalarda aynı
     kart çıksa bile artık evrim/kahraman değil, sıradan bir deste kartıdır.
     Eskiden rol yoktu ve evrim sanatı olan her kart, hangi yuvada olursa
     olsun EVRİM rozetiyle çiziliyordu. */
  const DESTE_YUVALARI = [
    { id: "evrim",    ic: "⚡",  ad: "Evrim",                 not: "Evrim yuvasına girecek kart",
      havuz: (c) => c.filter((x) => x.evoIcon), rol: () => "evrim" },
    { id: "kahraman", ic: "🦸", ad: "Kahraman",              not: "Kahraman yuvasına girecek kart",
      havuz: (c) => c.filter((x) => x.kahraman && x.heroImg), rol: () => "kahraman" },
    { id: "ozel",     ic: "✨", ad: "Kahraman ya da Evrim",  not: "Üçüncü özel yuva — ikisinden biri",
      havuz: (c) => c.filter((x) => x.evoIcon || (x.kahraman && x.heroImg)),
      /* Evrim görseli olan kart evrim, olmayan kahraman olarak çiziliyor —
         ikisi birden olan dörtlü (Şövalye, Valkür, Silahşör, Büyücü) burada
         evrim tarafında duruyor, kahraman yuvası bir önceki adımda zaten
         dolduruluyor. */
      rol: (c) => (c.evoIcon ? "evrim" : "kahraman") },
    { id: "atak",     ic: "🎯", ad: "Atak Kartı",            not: "Kuleyi yıkmayı üstlenen kart",
      havuz: (c) => c.filter((x) => ATAK_KARTLARI.includes(x.name)) },
    { id: "buyuk",    ic: "💥", ad: "Büyük Büyü",            not: "Ağır büyü — kalabalığı ve binayı temizler",
      havuz: (c) => c.filter((x) => BUYUK_BUYULER.includes(x.name)) },
    { id: "kucuk",    ic: "🪶", ad: "Küçük Büyü",            not: "Hafif büyü — ucuz ve hızlı cevap",
      havuz: (c) => c.filter((x) => KUCUK_BUYULER.includes(x.name)) },
    { id: "bina",     ic: "🏰", ad: "Bina",                  not: "Savunma yapısı",
      havuz: (c) => c.filter((x) => x.type === "Building") },
    { id: "ucuz",     ic: "🔁", ad: "Ucuz Döngü Kartı",      not: "3 iksir ve altı — desteyi döndürür",
      havuz: (c) => c.filter((x) => x.elixir > 0 && x.elixir <= 3) },
  ];
  const DESTE_ADAY = 3;               // yuva başına seçenek → 8 × 3 = 24 kart

  app.get("/api/games/deste/start", async (req, res) => {
    /* DESTE KURMA PUANSIZ ve tasarım gereği HER ZAMAN AÇIK — açılıştan
       önce de oynanabiliyordu, çünkü kimsenin hakkını ya da sırasını
       etkilemiyor.

       ARA bir dönem bunun istisnasıydı: boşlukta düzenleme yapılırken
       hiçbir oyunun açık olmaması istenmişti. Serbest mod geldiğinde o
       kural geri alındı — kapalı bir ara, sitenin içeriğini de yok
       ediyordu. Artık ara YALNIZCA serbest mod kapalıyken kapatıyor. */
    if (takvim.aradaMi() && !takvim.oynanabilirMi())
      return res.status(423).json({ error: "kapali", ...takvim.durum(),
        message: takvim.kilitMesaji("Oyunlar") });
    try {
      const cards = (await allCards()).filter((c) => c.tr && c.icon && c.elixir > 0);
      if (cards.length < 40)
        return res.status(503).json({ error: "data", message: "Kart verisi henüz hazır değil." });

      /* Havuzu KÜÇÜK olan yuva önce dolsun. Büyük büyü havuzunda beş kart var;
         serbest yuvalar önce dağıtılsaydı o beşten üçünü bulamayabilirdik. */
      const sira = DESTE_YUVALARI
        .map((y, i) => ({ y, i, havuz: y.havuz(cards) }))
        .sort((a, b) => a.havuz.length - b.havuz.length);

      const alinan = new Set();        // aynı kart iki yuvada çıkmasın
      const sonuc = new Array(DESTE_YUVALARI.length);
      for (const { y, i, havuz } of sira) {
        const uygun = shuffle(havuz.filter((c) => !alinan.has(c.id))).slice(0, DESTE_ADAY);
        if (uygun.length < DESTE_ADAY)
          return res.status(503).json({ error: "data",
            message: `"${y.ad}" yuvası için yeterli kart yok.` });
        uygun.forEach((c) => alinan.add(c.id));
        sonuc[i] = {
          id: y.id, ic: y.ic, ad: y.ad, not: y.not,
          cards: uygun.map((c) => ({
            id: c.id, name: c.tr, elixir: c.elixir, icon: c.icon,
            evoIcon: c.evoIcon || "", heroImg: c.heroImg || "", rarity: c.rarity,
            rol: y.rol ? y.rol(c) : "normal",       // bu yuvada nasıl çizilecek
          })),
        };
      }
      res.json({ slots: sonuc, toplamKart: DESTE_YUVALARI.length * DESTE_ADAY });
    } catch (e) { res.status(502).json({ error: "upstream", detail: String(e) }); }
  });

  console.log("🎮  Oyunlar hazır: Günün Kartı, Deste Düellosu, Eksik Kartı Bul, Kart Kapışması, Deste Jeneratörü (/api/games/*)");
}

/* ---------- KVKK: kişinin kendi verisi ----------
   Anahtar biçimi "oyun|kullaniciId|tarih", o yüzden kimlik ortada
   aranıyor — baştan eşleştirmek yanlış sonuç verirdi. */
function kullaniciOzeti(userId) {
  const n = Object.keys(plays).filter((k) => k.split("|")[1] === userId).length;
  return n ? `${n} oyun/gün hak kaydı` : "kayıt yok";
}
function kullaniciSil(userId) {
  let n = 0;
  for (const k of Object.keys(plays)) if (k.split("|")[1] === userId) { delete plays[k]; n++; }
  if (n) save();
  return `${n} oyun hakkı kaydı`;
}

module.exports = { mount, RULES, kullaniciOzeti, kullaniciSil };
