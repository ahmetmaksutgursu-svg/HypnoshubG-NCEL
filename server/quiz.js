/* ============================================================
   HYPNOSHUB — TOKMAK YARIŞMASI  (13 soruluk bilgi yarışması)
   ------------------------------------------------------------
   Kurallar (istenen tasarım):

   · 13 soru, her biri 4 şıklı, sorular gitgide zorlaşır.
   · Puan merdiveni: N. soruyu bilirsen puanın N olur.
     (Toplama değil — 4. soruyu bilen 4 puandadır.)
   · Barajlar 2. ve 7. soruda. Barajı geçtikten sonra elenirsen
     puanın son geçtiğin baraja düşer: 6. soruda elenen 2 puan
     alır, 9. soruda elenen 7 puan alır, 2. sorudan önce elenen
     0 alır.
   · Çekilirsen o ana kadar bildiğin soru sayısı kadar puan
     alırsın (baraja düşmezsin).
   · Bir hesap günde 3 kez oynayabilir.

   Neden sorular ve cevaplar SUNUCUDA tutuluyor:
   Doğru şık istemciye hiç gönderilmez. Gönderilseydi, sayfanın
   kaynağına bakan herkes 13/13 yapardı ve puan tablosu anlamsız
   olurdu. İstemci yalnızca soruyu ve dört şıkkı görür; hangisinin
   doğru olduğunu sunucu bilir ve cevabı o değerlendirir.

   Sorular kart verisinden ÜRETİLİR, elle yazılmaz: her sorunun
   cevabı canlı API'den ve oyunun kendi veri dosyalarından
   doğrulanabilir, yani yanlış cevap anahtarı olamaz.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const { veriYolu } = require("./veriyolu");

const TOTAL_Q = 13;
const CHECKPOINTS = [2, 7];          // barajlar
const DAILY_LIMIT = 3;               // hesap başına günlük hak

/* Haklar gece yarısı yenileniyor. Hakkı bitene "yarın gel" demek yerine
   ne kadar kaldığını gösterebilmek için o anı da veriyoruz. */
function resetAt() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}
const SESSION_TTL = 40 * 60e3;       // yarım saatten uzun süren oturum düşer

/* ---------- bot koruması ----------
   Tabloda ödül olduğu için yarışmayı elle değil betikle oynamaya çalışan
   olacak. Bir betiğin insandan ayrıldığı en net yer CEVAP SÜRESİ.

   Süre sunucuda ölçülüyor: soruyu gönderdiğim an ile cevabın bana ulaştığı
   an arasındaki fark. İçinde ağ gidiş-dönüşü de var, yani ölçtüğüm süre
   kullanıcının gerçekte harcadığından HER ZAMAN uzun — bu yönde yanılmak
   güvenli, çünkü hata payı suçsuzun lehine.

   İki eşik var ve ikisi de bilerek geniş tutuldu; yanlış ceza vermek, bir
   botu kaçırmaktan çok daha kötü:

   · SERT (300 ms). Arayüz yeni soruyu çizdikten sonra şıkları KILIT_MS
     boyunca kapalı tutuyor (bkz. eglence.html). Yani gerçek sayfadan bu
     kadar hızlı bir cevap fiziksel olarak çıkamaz; çıkıyorsa arayüz devre
     dışı bırakılmış demektir. Tek örnek yeter.
   · DESEN (900 ms × 3). Soruyu okuyup dört şıkkı tarayıp tıklamak insanda
     saniyeler sürer. Bir turda üç kez 900 ms'nin altına inmek tek başına
     "çok hızlıyım" ile açıklanamaz.

   Ceza: 3 gün ve o turun puanı yazılmaz. Süre auth.js'teki merdivenden
   değil buradan geliyor; merdiven daha ağırsa (tekrar eden hesap) o
   uygulanır. */
const BOT_SERT_MS = 300;
const BOT_DESEN_MS = 900;
const BOT_DESEN_ADET = 3;
/* Doğru cevaptan sonra arayüz, yeni soruyu çizmeden önce şıkkı yeşile
   boyayıp bu kadar bekliyor. Süreyi sunucu söylüyor (cevabın içinde `araMs`)
   ki iki taraf aynı sayıyı kullansın: soruyu göndermiş sayılan an, ekrana
   gerçekten geldiği an olsun. Yoksa ölçtüğüm "düşünme süresi" hep bu kadar
   şişik çıkar ve eşikler anlamını kaybeder. */
const UI_ARA_MS = 750;
/* Arayüz şıkları yeni soru çizildikten sonra bu kadar kapalı tutuyor.
   Çift tıklamanın bir sonraki soruya sıçrayıp haksız yere ceza almasını da
   engelliyor — kilit olmasaydı ilk eşik masum bir çift tıklamayı yakalardı. */
const KILIT_MS = 400;
const BOT_BAN = { ms: 3 * 24 * 3600e3, label: "3 gün" };
const BOT_SEBEP = "Otomatik tespit: yarışma soruları insan hızının altında cevaplandı";

/* Yol DATA_DIR ile taşınabilir — buluttaki geçici diskte veri kaybını
   önlemek için. Bkz. veriyolu.js */
const PLAYS_FILE = veriYolu("quiz-plays.json");

/* ---------- günlük hak ---------- */
let plays = {};                       // { "userId|2026-08-15": adet }
try { plays = JSON.parse(fs.readFileSync(PLAYS_FILE, "utf8")) || {}; } catch {}
let saveTimer = null;
function savePlays() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(PLAYS_FILE), { recursive: true });
      // Sadece son iki günü sakla; dosya sonsuza kadar büyümesin.
      const keep = [dayKey(), dayKey(new Date(Date.now() - 864e5))];
      plays = Object.fromEntries(Object.entries(plays).filter(([k]) => keep.some((d) => k.endsWith("|" + d))));
      fs.writeFileSync(PLAYS_FILE, JSON.stringify(plays));
    } catch (e) { console.warn("⚠️  Yarışma hakları kaydedilemedi:", String(e)); }
  }, 500);
}
function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const playsToday = (userId) => plays[`${userId}|${dayKey()}`] || 0;
function notePlay(userId) {
  const k = `${userId}|${dayKey()}`;
  plays[k] = (plays[k] || 0) + 1;
  savePlays();
}

/* ---------- yardımcılar ---------- */
const rnd = (n) => Math.floor(Math.random() * n);
function shuffle(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = rnd(i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; }
const pick = (a) => a[rnd(a.length)];
/* Aynı sorunun iki kez çıkmaması için imza. */
const sig = (q) => q.q + "|" + q.options.join(",");

const RARITY_TR = { common: "Sıradan", rare: "Ender", epic: "Destansı", legendary: "Efsanevi", champion: "Şampiyon" };
const KIND_TR = { Troop: "Asker", Building: "Bina", Spell: "Büyü" };

/* ---------- soru üreticileri ----------
   Her biri {q, options[4], answer} döner ya da üretemezse null.
   `pool` = o zorluk için uygun kart listesi. */
const MAKERS = {
  elixir: (pool) => {
    const c = pick(pool.filter((x) => x.elixir));
    if (!c) return null;
    const opts = new Set([c.elixir]);
    let guard = 40;
    while (opts.size < 4 && guard--) {
      const v = Math.max(1, Math.min(9, c.elixir + (rnd(5) - 2)));
      opts.add(v);
    }
    if (opts.size < 4) return null;
    return { q: `<b>${c.tr}</b> kaç iksire mal olur?`, options: shuffle([...opts]).map(String), answer: String(c.elixir) };
  },

  rarity: (pool) => {
    const c = pick(pool.filter((x) => x.rarity));
    if (!c) return null;
    const all = Object.values(RARITY_TR);
    const right = RARITY_TR[c.rarity];
    const opts = shuffle([right, ...shuffle(all.filter((r) => r !== right)).slice(0, 3)]);
    return { q: `<b>${c.tr}</b> kartının enderliği nedir?`, options: opts, answer: right };
  },

  kind: (pool) => {
    const c = pick(pool.filter((x) => x.type));
    if (!c) return null;
    const right = KIND_TR[c.type];
    // Üç tür var, dördüncü şık için oyunda olmayan ama makul bir seçenek.
    const wrong = Object.values(KIND_TR).filter((k) => k !== right).concat("Kule Askeri");
    return { q: `<b>${c.tr}</b> hangi tür bir karttır?`,
             options: shuffle([right, ...wrong.slice(0, 3)]), answer: right };
  },

  cheapest: (pool) => {
    const four = shuffle(pool.filter((x) => x.elixir)).slice(0, 4);
    if (four.length < 4) return null;
    const min = Math.min(...four.map((x) => x.elixir));
    if (four.filter((x) => x.elixir === min).length > 1) return null;   // beraberlik olmasın
    const win = four.find((x) => x.elixir === min);
    return { q: "Bu kartlardan hangisi <b>en ucuz</b>?", options: four.map((x) => x.tr), answer: win.tr };
  },

  priciest: (pool) => {
    const four = shuffle(pool.filter((x) => x.elixir)).slice(0, 4);
    if (four.length < 4) return null;
    const max = Math.max(...four.map((x) => x.elixir));
    if (four.filter((x) => x.elixir === max).length > 1) return null;
    const win = four.find((x) => x.elixir === max);
    return { q: "Bu kartlardan hangisi <b>en pahalı</b>?", options: four.map((x) => x.tr), answer: win.tr };
  },

  hasEvo: (pool, all) => {
    const yes = pick(all.filter((x) => x.evo));
    const no = shuffle(all.filter((x) => !x.evo)).slice(0, 3);
    if (!yes || no.length < 3) return null;
    return { q: "Bu kartlardan hangisinin <b>evrimi</b> var?", options: shuffle([yes, ...no]).map((x) => x.tr), answer: yes.tr };
  },

  air: (pool, all) => {
    const t = all.filter((x) => x.tr && x.traits && x.type === "Troop" && !x.traits.onlyBuildings);
    const yes = pick(t.filter((x) => x.traits.air));
    const no = shuffle(t.filter((x) => !x.traits.air)).slice(0, 3);
    if (!yes || no.length < 3) return null;
    return { q: "Hangisi <b>hava birimlerini</b> vurabilir?", options: shuffle([yes, ...no]).map((x) => x.tr), answer: yes.tr };
  },

  flying: (pool, all) => {
    const t = all.filter((x) => x.traits && x.type === "Troop");
    const yes = pick(t.filter((x) => x.traits.flying));
    const no = shuffle(t.filter((x) => !x.traits.flying)).slice(0, 3);
    if (!yes || no.length < 3) return null;
    return { q: "Hangisi <b>uçar</b>?", options: shuffle([yes, ...no]).map((x) => x.tr), answer: yes.tr };
  },

  onlyBuildings: (pool, all) => {
    const t = all.filter((x) => x.traits && x.type === "Troop");
    const yes = pick(t.filter((x) => x.traits.onlyBuildings));
    const no = shuffle(t.filter((x) => !x.traits.onlyBuildings)).slice(0, 3);
    if (!yes || no.length < 3) return null;
    return { q: "Hangisi <b>yalnızca binaları</b> hedefler?", options: shuffle([yes, ...no]).map((x) => x.tr), answer: yes.tr };
  },

  squad: (pool, all) => {
    const t = all.filter((x) => x.traits && x.type === "Troop");
    const yes = pick(t.filter((x) => (x.traits.count || 0) >= 3));
    const no = shuffle(t.filter((x) => (x.traits.count || 0) <= 1)).slice(0, 3);
    if (!yes || no.length < 3) return null;
    return { q: "Hangisi oynandığında <b>en az üç birim</b> çıkar?", options: shuffle([yes, ...no]).map((x) => x.tr), answer: yes.tr };
  },

  tanky: (pool, all) => {
    const t = shuffle(all.filter((x) => x.traits && x.traits.hp > 0)).slice(0, 4);
    if (t.length < 4) return null;
    const max = Math.max(...t.map((x) => x.traits.hp));
    if (t.filter((x) => x.traits.hp === max).length > 1) return null;
    const win = t.find((x) => x.traits.hp === max);
    return { q: "Bu birimlerden hangisinin <b>canı en yüksek</b>?", options: t.map((x) => x.tr), answer: win.tr };
  },

  fastest: (pool, all) => {
    const t = shuffle(all.filter((x) => x.traits && x.traits.speed > 0)).slice(0, 4);
    if (t.length < 4) return null;
    const max = Math.max(...t.map((x) => x.traits.speed));
    if (t.filter((x) => x.traits.speed === max).length > 1) return null;
    const win = t.find((x) => x.traits.speed === max);
    return { q: "Bu birimlerden hangisi <b>en hızlı</b> hareket eder?", options: t.map((x) => x.tr), answer: win.tr };
  },

  ranged: (pool, all) => {
    const t = all.filter((x) => x.traits && x.traits.range > 0 && x.type === "Troop");
    const yes = pick(t.filter((x) => x.traits.range > 1200));
    const no = shuffle(t.filter((x) => x.traits.range <= 1200)).slice(0, 3);
    if (!yes || no.length < 3) return null;
    return { q: "Hangisi <b>menzilli</b> saldırır (yakın dövüş değil)?", options: shuffle([yes, ...no]).map((x) => x.tr), answer: yes.tr };
  },

  arena: (pool, all) => {
    const c = pick(all.filter((x) => x.arena > 0));
    if (!c) return null;
    const opts = new Set([c.arena]);
    let guard = 40;
    while (opts.size < 4 && guard--) opts.add(Math.max(1, Math.min(23, c.arena + (rnd(7) - 3))));
    if (opts.size < 4) return null;
    return { q: `<b>${c.tr}</b> hangi arenada açılır?`, options: shuffle([...opts]).map((n) => `Arena ${n}`), answer: `Arena ${c.arena}` };
  },
};

/* Zorluk basamakları: her soru için hangi üreticiler ve hangi kart havuzu.
   "Tanıdık" = düşük arenada açılan, sıradan/ender kartlar. */
const LADDER = [
  { makers: ["elixir", "kind"],                    pool: "easy" },   // 1
  { makers: ["kind", "rarity"],                    pool: "easy" },   // 2  ← BARAJ
  { makers: ["elixir", "cheapest"],                pool: "easy" },   // 3
  { makers: ["rarity", "priciest"],                pool: "easy" },   // 4
  { makers: ["cheapest", "priciest", "elixir"],    pool: "mid" },    // 5
  { makers: ["hasEvo", "air"],                     pool: "mid" },    // 6
  { makers: ["rarity", "kind", "air"],             pool: "mid" },    // 7  ← BARAJ
  { makers: ["flying", "onlyBuildings"],           pool: "mid" },    // 8
  { makers: ["squad", "ranged"],                   pool: "hard" },   // 9
  { makers: ["elixir", "rarity"],                  pool: "hard" },   // 10
  { makers: ["tanky", "fastest"],                  pool: "hard" },   // 11
  { makers: ["arena", "tanky"],                    pool: "hard" },   // 12
  { makers: ["fastest", "arena", "tanky"],         pool: "hard" },   // 13
];

/* ---------- kart havuzu ---------- */
let cardCache = null, cardAt = 0;
async function cards(deps) {
  if (cardCache && Date.now() - cardAt < 3600e3) return cardCache;
  const [body, kinds, traits, tr, arenas] = await Promise.all([
    deps.cardsBody(), deps.cardKinds(), deps.cardTraits(), deps.cardNamesTR(), deps.cardArenas(),
  ]);
  const key = deps.chrKey;
  cardCache = (body.items || []).map((c) => ({
    name: c.name,
    tr: tr.get(c.name) || c.name,
    elixir: c.elixirCost || 0,
    rarity: c.rarity || "",
    type: kinds.get(key(c.name)) || "",
    traits: traits.get(key(c.name)) || null,
    evo: !!(c.maxEvolutionLevel || c.iconUrls?.evolutionMedium),
    arena: arenas.get(key(c.name)) || 0,
  })).filter((c) => c.tr);
  cardAt = Date.now();
  return cardCache;
}
function pools(all) {
  const easy = all.filter((c) => (c.rarity === "common" || c.rarity === "rare") && c.arena > 0 && c.arena <= 8);
  const mid = all.filter((c) => c.rarity !== "champion");
  return { easy: easy.length >= 8 ? easy : mid, mid, hard: all };
}

/* ---------- oturumlar ---------- */
const sessions = new Map();          // id -> {userId, questions:[], step, score, done}
function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.at > SESSION_TTL) sessions.delete(id);
}

async function buildQuestions(deps) {
  const all = await cards(deps);
  const P = pools(all);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < TOTAL_Q; i++) {
    const step = LADDER[i];
    let q = null, guard = 60;
    while (!q && guard--) {
      const maker = MAKERS[pick(step.makers)];
      const cand = maker(P[step.pool], all);
      if (!cand) continue;
      if (cand.options.length !== 4) continue;
      if (new Set(cand.options).size !== 4) continue;      // tekrar eden şık olmasın
      if (!cand.options.includes(cand.answer)) continue;   // cevap şıklarda olmalı
      if (seen.has(sig(cand))) continue;
      seen.add(sig(cand));
      q = cand;
    }
    if (!q) return null;                                    // üretilemedi: oyunu başlatma
    out.push(q);
  }
  return out;
}

/* Baraj kuralı: elenince son geçilen baraja düşersin. */
function checkpointScore(answered) {
  let best = 0;
  for (const c of CHECKPOINTS) if (answered >= c) best = c;
  return best;
}

/* Bu cevap bir botu ele veriyor mu? Ele veriyorsa sebebini de döndürür ki
   günlüğe ne olduğu yazılabilsin. */
function botMu(g, ms) {
  if (ms < BOT_SERT_MS)
    return { kod: "sert", detay: `${ms} ms — arayüzün ${KILIT_MS} ms kilidinin altında` };
  if (ms < BOT_DESEN_MS) {
    g.hizli = (g.hizli || 0) + 1;
    if (g.hizli >= BOT_DESEN_ADET)
      return { kod: "desen", detay: `${g.hizli} cevap ${BOT_DESEN_MS} ms altında` };
  }
  return null;
}

function mount(app, deps) {
  const { readSession, addPoints, banUser } = deps;
  app.use("/api/quiz", require("express").json({ limit: "4kb" }));

  app.get("/api/quiz/status", (req, res) => {
    const s = readSession(req);
    res.json({
      total: TOTAL_Q, checkpoints: CHECKPOINTS, dailyLimit: DAILY_LIMIT,
      played: s ? playsToday(s.user.id) : 0,
      left: s ? Math.max(0, DAILY_LIMIT - playsToday(s.user.id)) : DAILY_LIMIT,
      loggedIn: !!s, resetAt: resetAt(),
    });
  });

  app.post("/api/quiz/start", async (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth", message: "Yarışmaya girmek için giriş yapmalısın." });
    if (playsToday(s.user.id) >= DAILY_LIMIT)
      return res.status(429).json({ error: "limit", resetAt: resetAt(), message: `Günlük hakkın doldu (${DAILY_LIMIT}/${DAILY_LIMIT}).` });

    const questions = await buildQuestions(deps).catch(() => null);
    if (!questions) return res.status(503).json({ error: "gen", message: "Sorular hazırlanamadı, birazdan tekrar dene." });

    sweep();
    const id = require("crypto").randomBytes(16).toString("hex");
    /* `soruAt` = ilk soruyu gönderdiğim an. Cevap süresi buradan ölçülüyor. */
    sessions.set(id, { userId: s.user.id, questions, step: 0, score: 0,
                       at: Date.now(), soruAt: Date.now(), hizli: 0, done: false });
    notePlay(s.user.id);

    const q = questions[0];
    res.json({
      sessionId: id, step: 1, total: TOTAL_Q, checkpoints: CHECKPOINTS,
      question: q.q, options: q.options,
      left: Math.max(0, DAILY_LIMIT - playsToday(s.user.id)),
      kilitMs: KILIT_MS,
    });
  });

  app.post("/api/quiz/answer", (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth" });
    const g = sessions.get(String(req.body?.sessionId || ""));
    if (!g || g.userId !== s.user.id || g.done)
      return res.status(400).json({ error: "session", message: "Yarışma oturumu bulunamadı." });

    const q = g.questions[g.step];
    const choice = String(req.body?.choice ?? "");
    const correct = choice === q.answer;
    const gecen = Date.now() - (g.soruAt || g.at);
    g.at = Date.now();

    /* Bot kontrolü puanlamadan ÖNCE: yakalanan tur hiç puan yazmaz. */
    const bot = botMu(g, gecen);
    if (bot) {
      g.done = true;
      sessions.delete(req.body.sessionId);
      const r = banUser ? banUser(s.user.id, BOT_SEBEP, BOT_BAN) : null;
      console.warn(`🚫  Bot tespiti — ${s.user.username} (${bot.kod}: ${bot.detay})` +
                   (r && r.ok ? ` → ${r.ban.label} yasak` : " → yasaklanamadı"));
      return res.status(403).json({
        error: "bot", finished: true, reason: "bot", points: 0, banned: !!(r && r.ok),
        message: "Sorular insan hızının çok altında cevaplandı. Bu tur iptal edildi ve " +
                 `hesabın ${(r && r.ok ? r.ban.label : BOT_BAN.label)} askıya alındı. ` +
                 "Hata olduğunu düşünüyorsan iletişim kısmından yaz.",
      });
    }

    if (!correct) {
      g.done = true;
      const answered = g.step;                       // kaç soruyu bilerek geçti
      const points = checkpointScore(answered);      // baraja düşer
      if (points) addPoints(s.user.id, points, "yarisma");
      sessions.delete(req.body.sessionId);
      return res.json({
        correct: false, answer: q.answer, finished: true, reason: "wrong",
        answered, points,
        message: points
          ? `Elendin! Son geçtiğin baraj ${points}. soru — <b>${points} puan</b> aldın.`
          : "Elendin! İlk barajı (2. soru) geçemediğin için puan alamadın.",
      });
    }

    g.step++;
    g.score = g.step;                                // merdiven: N. soruyu bilen N puanda
    if (g.step >= TOTAL_Q) {
      g.done = true;
      addPoints(s.user.id, TOTAL_Q, "yarisma");
      sessions.delete(req.body.sessionId);
      return res.json({
        correct: true, answer: q.answer, finished: true, reason: "complete",
        answered: TOTAL_Q, points: TOTAL_Q,
        message: `Hepsi doğru! <b>${TOTAL_Q} puan</b> kazandın. 🔨`,
      });
    }

    const next = g.questions[g.step];
    /* Soru ŞİMDİ değil, arayüz beklemesi bittiğinde ekrana gelecek. Süreyi
       oradan saymak gerekiyor; aksi hâlde her cevap 750 ms şişik ölçülür. */
    g.soruAt = Date.now() + UI_ARA_MS;
    res.json({
      correct: true, answer: q.answer, finished: false,
      step: g.step + 1, score: g.score,
      question: next.q, options: next.options,
      safe: checkpointScore(g.step),
      araMs: UI_ARA_MS, kilitMs: KILIT_MS,
    });
  });

  app.post("/api/quiz/withdraw", (req, res) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "auth" });
    const g = sessions.get(String(req.body?.sessionId || ""));
    if (!g || g.userId !== s.user.id || g.done)
      return res.status(400).json({ error: "session" });
    g.done = true;
    const points = g.step;                           // çekilende baraj yok, bildiği kadar
    if (points) addPoints(s.user.id, points, "yarisma");
    sessions.delete(req.body.sessionId);
    res.json({
      finished: true, reason: "withdraw", answered: g.step, points,
      message: points ? `Çekildin ve <b>${points} puan</b> ile ayrıldın.` : "Hiç soru bilmeden çekildin, puan yok.",
    });
  });

  console.log(`🎓  Tokmak Yarışması hazır (${TOTAL_Q} soru, baraj ${CHECKPOINTS.join(" ve ")}, günde ${DAILY_LIMIT} hak).`);
  console.log(`🚫  Bot koruması açık: <${BOT_SERT_MS} ms tek cevap ya da ${BOT_DESEN_ADET}× <${BOT_DESEN_MS} ms → ${BOT_BAN.label} yasak (şık kilidi ${KILIT_MS} ms).`);
}

module.exports = { mount, TOTAL_Q, CHECKPOINTS, DAILY_LIMIT };
