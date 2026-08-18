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
};

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
const used = (uid, game) => plays[`${game}|${uid}|${dayKey()}`] || 0;
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

/* Günün kartı herkese aynı olmalı ve tahmin edilebilir olmamalı.
   Tarihi gizli bir tuzla karıştırıp özetliyoruz: aynı gün herkeste
   aynı sonuç çıkar, ama yarının kartı bugünden hesaplanamaz. */
const DAILY_SALT = process.env.DAILY_SALT || "hypnoshub-gunun-karti";
function dailyIndex(n, day = dayKey()) {
  const h = crypto.createHash("sha256").update(DAILY_SALT + "|" + day).digest();
  return h.readUInt32BE(0) % n;
}

const RARITY_TR = { common: "Sıradan", rare: "Ender", epic: "Destansı", legendary: "Efsanevi", champion: "Şampiyon" };
const KIND_TR = { Troop: "Asker", Building: "Bina", Spell: "Büyü" };

/* ---------- oturumlar ---------- */
const sessions = new Map();
const SESSION_TTL = 30 * 60e3;
function sweep() { const n = Date.now(); for (const [k, v] of sessions) if (n - v.at > SESSION_TTL) sessions.delete(k); }
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
  const acikMi = (res) => {
    if (takvim.acikMi()) return true;
    res.status(423).json({ error: "kapali", ...takvim.durum(),
      message: "Puanlı oyunlar 20 Ağustos 18.00'da açılıyor." });
    return false;
  };

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
    if (left(s.user.id, "gunun") <= 0)
      return res.status(429).json({ error: "limit", resetAt: resetAt(), message: "Günün kartını bugün zaten oynadın." });

    const cards = (await allCards()).filter((c) => c.tr && c.elixir);
    if (cards.length < 20) return res.status(503).json({ error: "data" });
    const answer = cards[dailyIndex(cards.length)];

    sweep();
    const id = newId();
    sessions.set(id, { kind: "gunun", userId: s.user.id, answer, tries: 0, at: Date.now() });
    note(s.user.id, "gunun");
    res.json({
      sessionId: id, tries: 0, maxTries: 6,
      names: cards.map((c) => c.tr).sort((a, b) => a.localeCompare(b, "tr")),
      hints: [],
    });
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
    const right = guess.localeCompare(g.answer.tr, "tr", { sensitivity: "base" }) === 0;

    if (right) {
      // 1. denemede 12, sonra 10, 8, 6, 4, 2
      const points = Math.max(2, RULES.gunun.maxPoints - (g.tries - 1) * 2);
      addPoints(s.user.id, points, "gunun");
      sessions.delete(req.body.sessionId);
      return res.json({ correct: true, finished: true, tries: g.tries, points, answer: g.answer.tr,
        message: `${g.tries}. denemede bildin — <b>${points} puan</b>!` });
    }
    if (g.tries >= 6) {
      sessions.delete(req.body.sessionId);
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
    sessions.set(id, { kind: "duello", userId: s.user.id, winner: a.winrate > b.winrate ? a.key : b.key, at: Date.now() });
    note(s.user.id, "duello");
    res.json({
      sessionId: id,
      decks: pair.map((d) => ({ key: d.key, cards: d.cards, usage: d.usage, battles: d.battles })),
      left: left(s.user.id, "duello"),
    });
  });

  app.post("/api/games/duello/answer", async (req, res) => {
    const s = needAuth(req, res); if (!s) return;
    const g = sessions.get(String(req.body?.sessionId || ""));
    if (!g || g.kind !== "duello" || g.userId !== s.user.id)
      return res.status(400).json({ error: "session" });
    sessions.delete(req.body.sessionId);

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
    sessions.set(id, { kind: "eksik", userId: s.user.id, answer: gizli.id, at: Date.now() });
    note(s.user.id, "eksik");

    const sade = (c) => ({ id: c.id, name: c.name, elixir: c.elixir, icon: c.icon,
                           evoIcon: c.evoIcon, rarity: c.rarity, hero: c.hero, champion: c.champion });
    res.json({
      sessionId: id,
      cards: kalan.map(sade),                 // ekranda duran yedi kart
      options: secenekler.map(sade),          // dört şık — hangisi doğru belli değil
      usage: deck.usage, winrate: deck.winrate, battles: deck.battles,
      left: left(s.user.id, "eksik"), resetAt: resetAt(),
    });
  });

  app.post("/api/games/eksik/answer", (req, res) => {
    const s = needAuth(req, res); if (!s) return;
    const g = sessions.get(String(req.body?.sessionId || ""));
    if (!g || g.kind !== "eksik" || g.userId !== s.user.id)
      return res.status(400).json({ error: "session" });
    sessions.delete(req.body.sessionId);

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
    sessions.set(id, {
      kind: "kapisma", userId: s.user.id, at: Date.now(), dogru: 0, cevaplanan: new Set(),
      turlar: turlar.map((t) => ({ answer: t.answer, aId: t.a.id, bId: t.b.id, va: t.va, vb: t.vb, birim: t.q.birim })),
    });
    note(s.user.id, "kapisma");

    const sade = (c) => ({ id: c.id, name: c.tr, elixir: c.elixir, icon: c.icon, rarity: c.rarity });
    res.json({
      sessionId: id, level: cards[0].level,
      rounds: turlar.map((t) => ({ soru: t.q.soru, birim: t.q.birim, a: sade(t.a), b: sade(t.b) })),
      left: left(s.user.id, "kapisma"), resetAt: resetAt(),
    });
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
    if (g.cevaplanan.has(i))
      return res.status(400).json({ error: "done", message: "Bu tur zaten cevaplandı." });
    g.cevaplanan.add(i); g.at = Date.now();

    const t = g.turlar[i];
    const correct = Number(req.body?.id) === t.answer;
    if (correct) { g.dogru++; addPoints(s.user.id, 1, "kapisma"); }
    const finished = g.cevaplanan.size >= g.turlar.length;
    const dogru = g.dogru;
    if (finished) sessions.delete(String(req.body.sessionId));

    res.json({
      correct, answer: t.answer, finished,
      values: { [t.aId]: t.va, [t.bId]: t.vb },     // tur bitti, iki değeri de göster
      dogru, toplam: g.turlar.length, points: dogru,
      left: left(s.user.id, "kapisma"), resetAt: resetAt(),
    });
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
