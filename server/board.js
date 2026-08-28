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
/* Açılış anı ve dönem uzunluğu artık takvim.js'de — oyun hakları, tablo ve
   kilit aynı saati kullanmak zorunda. Açılış 20 Ağustos 18.00 olduğu için
   dönemler de 18.00'da dönüyor (1. dönem 20 Ağu 18.00 → 27 Ağu 18.00). */
const takvim = require("./takvim");
const BASLANGIC = takvim.ACILIS;
const DONEM_GUN = takvim.DONEM_GUN;

/* ---------- ödül duyurusu ----------
   Belirli bir dönemi 1. sırada bitirene verilecek ödül. Tabloda not olarak
   görünür ve o dönem bittiği anda KENDİLİĞİNDEN kaybolur — sonradan silmeyi
   unutup "hediye var" yazısını aylarca ekranda bırakmayalım diye.

   `hafta` o dönemin BAŞLANGIÇ tarihi (weekKey ile aynı biçim).
   Duyuru dönem başlamadan da görünür ("gelecek hafta"), böylece önceden
   ilan edilebiliyor. Ödülü kaldırmak için: hafta: null. */
/* ODUL.hafta GERÇEK bir dönem başlangıcı olmak zorunda. Yanlış bir tarih
   yazılırsa ödül hiçbir döneme bağlanmaz ve kimse fark etmez; açılışta
   kontrol edip uyarıyoruz. */
function odulAnahtariGecerliMi(anahtar) {
  const [y, ay, g] = String(anahtar || "").split("-").map(Number);
  if (!y || !ay || !g) return false;
  const d = new Date(y, ay - 1, g, takvim.GUN_SAATI, 0, 0, 0);
  return takvim.donemAnahtari(d) === anahtar;
}
/* `haftalar` bir LİSTE — aynı ödüller birden çok döneme bağlanabiliyor.

   Önce tek bir `hafta` alanı vardı ve 1. dönem bitince ödül kutusu
   ekrandan düşüyordu. 2. dönemde AYNI ödüller verilecek; tek alanı
   "2026-08-28" yapsaydık 1. dönem daha bitmeden ödül duyurusu
   kaybolurdu. Liste olunca sıradaki dönem kendiliğinden devralıyor.

   Her giriş GERÇEK bir dönem başlangıcı olmak zorunda; açılışta
   kontrol ediliyor (bkz. odulAnahtariGecerliMi). */
const ODUL = {
  haftalar: [
    "2026-08-20",                      // 1. dönem · 20–27 Ağustos 2026
    "2026-08-28",                      // 2. dönem · 28 Ağustos – 4 Eylül 2026
  ],
  baslik: "Açılış ödülleri",
  baslikEn: "Opening rewards",
  /* Ödüller TEK CÜMLE değil, SIRAYA bağlı bir liste.

     Başta yalnızca birinciye Pass Royale vardı ve tek bir metin
     yetiyordu. Üç ödül olunca tek cümleye sıkıştırmak okunmaz hâle
     gelirdi: yarışan kişinin "ben şu an kaçıncıyım, bana ne düşüyor"
     sorusunu tek bakışta cevaplaması gerekiyor.

     Ödül eklemek/çıkarmak için yalnızca bu liste değişiyor; ön yüz
     kaç ödül olduğunu saymıyor, listeyi olduğu gibi çiziyor. */
  /* Her ödül İKİ DİLDE. Önceden yalnızca Türkçesi vardı ve site
     İngilizceye alındığında ödüller Türkçe kalıyordu (kullanıcı
     bildirdi). Ödül metinleri sunucudan geldiği için ön yüzdeki
     sözlükle çözülemiyor; karşılığı burada duruyor. */
  siralar: [
    { sira: 1, simge: "🥇", ne: "Pass Royale",             en: "Pass Royale" },
    { sira: 2, simge: "🥈", ne: "Klana katılım hakkı",     en: "A spot in the clan" },
    { sira: 3, simge: "🥉", ne: "İstediği emoji",          en: "Emote of their choice" },
  ],
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
/* Dönem başlangıcı. Hesap takvim.js'de: gün farkını değil GERÇEK ZAMANI
   ölçüyor, çünkü sınır artık gece yarısı değil 18.00 ve gün farkı
   yuvarlaması 18.00'dan önceki saatleri yanlış döneme atıyordu. */
const weekStart = (d = new Date()) => takvim.donemBasi(d);
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
    /* Kapalıyız. İKİ ayrı sebep olabilir ve ön yüz farklı cümle yazıyor:
         · henüz hiç açılmadı  → "yarış başlamadı"
         · ARA veriliyor       → "2. hafta ... başlayacak"

       Geri sayım her iki durumda da BİR SONRAKİ başlangıcı gösteriyor.
       Eskiden hep BASLANGIC yazılıyordu; ara sırasında bu, geçmiş bir
       tarihe eksi geri sayım demek olurdu. */
    /* Belirsiz arada BİR SONRAKİ BAŞLANGIÇ YOK. Eskiden bu durumda
       BASLANGIC'a düşülüyordu ve ekranda GEÇMİŞ bir tarih ile eksiye
       giden bir geri sayım çıkardı. Artık start null gidiyor; ön yüz
       null görünce tarih yerine "yakında" yazıyor. */
    const belirsiz = takvim.belirsizMi() && takvim.aradaMi();
    const sonraki = takvim.sonrakiBasi() || (belirsiz ? null : BASLANGIC);
    return { key: null, acik: false,
             start: sonraki ? sonraki.toISOString() : null,
             end: null, endsInMs: null,
             acilisMs: sonraki ? Math.max(0, sonraki - Date.now()) : null,
             ara: takvim.aradaMi(), belirsiz, sonrakiNo: takvim.sonrakiNo() };
  }
  const e = new Date(s); e.setDate(e.getDate() + DONEM_GUN);
  /* Dönem sürerken de "sonrasında ara var mı" bilgisi gidiyor:
     ön yüz bunu ÖNCEDEN duyurabilsin. Boşluk yoksa null. */
  const gelen = takvim.araGeliyor();
  return { key: tarihAnahtari(s), acik: true, start: s.toISOString(),
           end: e.toISOString(), endsInMs: e - Date.now(), acilisMs: 0,
           ara: false, no: takvim.donemNo(),
           /* Belirsiz arada gelen.basi null: uyarı yine gidiyor ama
              tarihsiz. `araVar` olmasa ön yüz "ara yok" sanırdı. */
           araVar: !!gelen,
           araBelirsiz: !!(gelen && gelen.belirsiz),
           araGeliyor: gelen && gelen.basi ? gelen.basi.toISOString() : null,
           araNo: gelen ? gelen.no : null };
}

/* Ödül hâlâ geçerli mi? Anahtardan o haftanın başını/sonunu çözüp
   bakıyoruz; hafta bitince null döner ve duyuru ekrandan düşer. */
/* Listedeki İLK geçerli dönemi seçiyoruz: bitmemiş olan en erken
   dönem. Böylece 1. dönem sürerken 1. dönemin ödülü, o bitince
   kendiliğinden 2. dönemin ödülü görünüyor. */
function odulHaftasi() {
  const liste = Array.isArray(ODUL && ODUL.haftalar) ? ODUL.haftalar : [];
  const simdi = Date.now();

  /* BELİRSİZ ARADA ÖDÜL DUYURUSU ZAMANLA DÜŞMÜYOR.

     Aşağıdaki döngü "bitişi henüz geçmemiş ilk hafta"yı seçiyor.
     Yarışma bitişi bilinmeyen bir ara verdiğinde bu kural duyuruyu
     4 Eylül 18.00'da sessizce yok ederdi: ödüller hâlâ geçerli,
     yarışma hâlâ başlamayı bekliyor, ama kutu ekrandan düşmüş olurdu.

     Ara sürerken takvim durduğu için ödül seçimi de duruyor: listenin
     SON kaydı (en ileri tarihli, yani sırada bekleyen dönem) veriliyor
     ve zaman filtresi hiç uygulanmıyor. Yarışma gerçek bir tarihle
     başlatıldığında normal davranış kendiliğinden geri geliyor. */
  if (takvim.belirsizMi() && takvim.aradaMi()) {
    const sirali = [...liste].sort();
    return sirali[sirali.length - 1] || null;
  }

  for (const h of [...liste].sort()) {
    const [y, ay, g] = String(h).split("-").map(Number);
    if (!y || !ay || !g) continue;
    const bas = new Date(y, ay - 1, g, takvim.GUN_SAATI, 0, 0, 0);
    const bit = new Date(bas); bit.setDate(bit.getDate() + DONEM_GUN);
    if (simdi < bit.getTime()) return h;
  }
  return null;
}
function odulDurumu() {
  const hafta = odulHaftasi();
  if (!hafta) return null;
  const [y, ay, g] = hafta.split("-").map(Number);
  if (!y || !ay || !g) return null;
  /* Pencere GECE YARISINDAN değil dönem saatinden (18.00) başlıyor.
     Eskiden gece yarısı alınıyordu ve iki hata birden çıkıyordu:
       · ekranda "20 Ağustos 00.00 – 27 Ağustos 00.00" yazıyordu, oysa
         dönem 18.00'da başlayıp 18.00'da bitiyor,
       · ödül notu "Date.now() >= bit" kontrolüyle 27 Ağustos 00.00'da
         kayboluyordu — yani dönem hâlâ sürerken 18 SAAT ÖNCE. Yarışan
         insan ödülün durduğunu göremezdi. */
  const bas = new Date(y, ay - 1, g, takvim.GUN_SAATI, 0, 0, 0);
  const bit = new Date(bas); bit.setDate(bit.getDate() + DONEM_GUN);
  /* İKİNCİ ZAMAN AŞIMI. odulHaftasi() düzeltildi ama burada AYRI bir
     bitiş kontrolü daha vardı; yalnızca birini düzeltmek yetmezdi,
     duyuru yine 4 Eylül'de düşerdi. Ara sürerken ödülün ömrü yok. */
  const belirsizAra = takvim.belirsizMi() && takvim.aradaMi();
  if (!belirsizAra && Date.now() >= bit) return null; // dönem geçti
  return {
    baslik: ODUL.baslik,
    /* İngilizce başlık da gidiyor: ön yüz dile göre seçiyor. Yalnızca
       ödül satırlarını çevirip başlığı unutmak, kutunun yarısını Türkçe
       bırakırdı. */
    baslikEn: ODUL.baslikEn || null,
    siralar: Array.isArray(ODUL.siralar) ? ODUL.siralar : [],
    /* `metin` UYUMLULUK İÇİN duruyor. Sayfa bir dakika önbelleğe
       alınıyor, yani yeni sunucu yayına girdiğinde bazı ziyaretçilerin
       elinde hâlâ eski index.html olur ve o `odul.metin` okuyor. Alan
       kaldırılsaydı o kısa pencerede ödül kutusu boş görünürdü.
       Listeden türetiliyor, yani iki yeri ayrı ayrı güncellemek
       gerekmiyor — birbirinden ayrı düşemezler. */
    metin: (ODUL.siralar || []).map((o) => `<b>${o.sira}.</b> ${o.ne}`).join(" · "),
    hafta, start: bas.toISOString(), end: bit.toISOString(),
    buHafta: weekKey() === hafta,                     // "bu hafta" mı "gelecek hafta" mı
  };
}

/* Tablo hangi tarihte açılıyor / açık mı — oyunlar bunu kullanıcıya
   söyleyebilsin diye dışarıya veriliyor. */
/* `acilis` artık "20 Ağustos" değil, BİR SONRAKİ başlangıç: ara
   sırasında oyun sayfası da doğru tarihe geri sayabilsin diye. */
const acilisBilgisi = () => {
  const sonraki = takvim.sonrakiBasi();
  const belirsiz = takvim.belirsizMi() && takvim.aradaMi();
  return {
    acik: acikMi(),
    /* Belirsizse null — uydurma tarih yollamaktansa tarihsiz kalıyor. */
    acilis: sonraki ? sonraki.toISOString() : (belirsiz ? null : BASLANGIC.toISOString()),
    ara: takvim.aradaMi(),
    belirsiz,
    sonrakiNo: takvim.sonrakiNo(),
  };
};

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
  /* Elle yapılan düzeltme OYNANMIŞ OYUN sayılmıyor: tablodaki "kaç oyun"
     sayısı gerçekten oynananları göstermeli, yoksa telafi alan kişi daha
     çok oynamış gibi görünür. */
  if (game !== "elle") row.games += 1;
  row.byGame[game] = (row.byGame[game] || 0) + points;
  row.at = Date.now();
  db.weeks[key][userId] = row;
  save();
  return row;
}

/* ---------- geçen dönem ----------
   Kullanıcı isteği: ana sayfada "geçen haftanın Tokmakçıları" —
   dönemi ilk üçte bitirenler, kullanıcı adı ve puanıyla.

   Sıfırlama zaten kendiliğinden oluyor: dönem değişince anahtar
   değişiyor ve yeni tablo boş başlıyor. ESKİ DÖNEM SİLİNMİYOR,
   `db.weeks` içinde duruyor — bu uç da onu okuyor. Yani 27 Ağustos
   18.00'da ana tablo sıfırlanırken veri kaybolmuyor, sadece yan
   tabloya geçiyor.

   TAMAMLANMIŞ dönem aranıyor: içinde bulunduğumuz dönemden geriye
   doğru gidip veri bulunan ilk dönem veriliyor. Böylece arada boş
   geçen bir hafta olsa bile son gerçek şampiyonlar görünür. */
/* Dönemler artık EŞİT ARALIKLI DEĞİL: araya boşluk konabiliyor
   (1. dönem 20 Ağustos, 2. dönem 28 Ağustos). "Yedi gün geri" diye
   yürümek 21 Ağustos gibi hiç yaşanmamış bir anahtar üretir ve geçen
   haftanın şampiyonları kaybolurdu. Zinciri takvim.oncekiBasi()
   yürütüyor.

   ARA sırasında weekStart() null: o an açık dönem yok. Böyle
   zamanlarda SIRADAKİ dönemden geriye yürüyoruz — yoksa tam da
   şampiyonların merak edildiği 24 saatte kutu boş kalırdı. */
function oncekiDonem(enFazlaGeri = 8) {
  let d = weekStart() || takvim.sonrakiBasi();
  /* ÜÇÜNCÜ ÇIPA — BELİRSİZ ARA.

     Yukarıdaki iki yol da null verebiliyor: ara sırasında açık dönem
     yok (weekStart null) ve bitişi bilinmeyen arada SIRADAKİ başlangıç
     da yok (sonrakiBasi null). İkisi birden null olunca fonksiyon
     hiç yürümeden çıkıyordu ve kutu tam da şampiyonların merak
     edildiği anda boş kalıyordu — ölçüldü: /board/gecen {"var":false}.

     Çıpa olarak zincirdeki SON dönemin BİTİŞİ alınıyor; oradan bir
     adım geriye yürümek son tamamlanmış dönemi veriyor. */
  if (!d && takvim.aradaMi()) {
    const son = takvim.BASLANGICLAR[takvim.BASLANGICLAR.length - 1];
    if (son) { d = new Date(son); d.setDate(d.getDate() + DONEM_GUN); }
  }
  if (!d) return null;                        // tablo henüz açılmadı
  for (let i = 0; i < enFazlaGeri; i++) {
    d = takvim.oncekiBasi(d);
    if (!d || d < BASLANGIC) return null;     // açılıştan öncesi yok
    const anahtar = tarihAnahtari(d);
    const satirlar = db.weeks[anahtar];
    if (satirlar && Object.keys(satirlar).length) {
      const bit = new Date(d); bit.setDate(bit.getDate() + DONEM_GUN);
      /* Kaçıncı dönemdi? Başlık "geçen hafta" yerine "1. hafta"
         yazabilsin diye numara da gidiyor — "geçen", ara uzayınca
         yanlış oluyor (ay önceki dönem hâlâ "geçen hafta" görünürdü). */
      return { anahtar, no: takvim.donemNo(d),
               start: d.toISOString(), end: bit.toISOString(), satirlar };
    }
  }
  return null;
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
      acik: acikMi(),
      /* Ara sırasında BASLANGIC geçmişte kalıyor; sonraki başlangıcı
         veriyoruz ki geri sayım eksiye düşmesin. */
      acilis: (() => {
        const s = takvim.sonrakiBasi();
        if (s) return s.toISOString();
        /* Belirsiz ara: tarih yok. BASLANGIC'a düşmek geçmiş bir tarihi
           "başlangıç" diye göstermek olurdu. */
        return (takvim.belirsizMi() && takvim.aradaMi()) ? null : BASLANGIC.toISOString();
      })(),
      ara: takvim.aradaMi(),
      /* Tablo kapalı ama oyunlar açık olabiliyor (serbest mod).
         Ön yüz "oyunlar kapalı" mı yoksa "puan yazılmıyor" mu
         yazacağını buna bakarak seçiyor. */
      serbest: takvim.serbestMi(),
      oynanabilir: takvim.oynanabilirMi(),
      belirsiz: takvim.belirsizMi() && takvim.aradaMi(),
      sonrakiNo: takvim.sonrakiNo(),
      /* Dönem kaç gün — tablo henüz açılmadığında ön yüz ilk dönemin
         BİTİŞİNİ bundan hesaplıyor. Yoksa "dönem bitiminde" gibi bir
         yer tutucu yazmak zorunda kalıyordu. */
      donemGun: DONEM_GUN,
    });
  });


  /* Geçen dönemin ilk üçü — ana sayfadaki "Geçen Haftanın
     Tokmakçıları" bölümü bunu okuyor. Yasaklı hesaplar haftalık
     tabloda olduğu gibi burada da düşürülüyor: ödülü hak etmeyen biri
     arşivde de durmamalı. */
  app.get("/api/board/gecen", (req, res) => {
    res.set("Cache-Control", "public, max-age=120");
    const d = oncekiDonem();
    if (!d) return res.json({ var: false, items: [] });
    const users = new Map(listUsers().map((u) => [u.id, u]));
    const items = Object.entries(d.satirlar)
      .map(([id, r]) => {
        const u = users.get(id);
        if (!u) return null;
        const bilgi = userInfo(id);
        if (bilgi && bilgi.ban) return null;
        return { username: u.username, points: r.points, games: r.games, at: r.at };
      })
      .filter(Boolean)
      .sort((a, b) => b.points - a.points || a.at - b.at)
      .slice(0, 3)
      .map((x, i) => ({ rank: i + 1, ...x }));
    res.json({ var: items.length > 0, hafta: d.anahtar, no: d.no,
               start: d.start, end: d.end,
               items, toplam: Object.keys(d.satirlar).length });
  });

  /* ---------- yönetici: elle puan ekleme ----------
     Neden gerekli: yayın günü sunucu birkaç kez yeniden başlatıldı ve
     o anda yarışmayı sürdüren kullanıcıların oturumu silindi; biri 12
     soru bilip hiç puan alamadı. Oturumlar artık diske yazılıyor ama
     BİR KEZ YAŞANMIŞ kaybı telafi etmenin yolu yoktu.

     Bu uç o boşluğu kapatıyor. Kötüye kullanımı zorlaştıran üç şey var:
       · yalnızca yönetici çağırabiliyor,
       · sebep YAZILMAK ZORUNDA ve kayda geçiyor,
       · tek seferde verilebilecek puan sınırlı.
     Verilen puan normal puanla aynı yere yazılıyor, yani tablo tek
     doğruyu göstermeye devam ediyor. */
  const ELLE_TAVAN = 100;
  app.post("/api/board/elle", (req, res) => {
    if (!needAdmin(req, res)) return;
    const kullanici = String(req.body?.username || "").trim();
    const puan = parseInt(req.body?.points, 10);
    const sebep = String(req.body?.reason || "").trim();
    if (!kullanici) return res.status(400).json({ error: "kullanici", message: "Kullanıcı adı gerekli." });
    if (!Number.isFinite(puan) || puan === 0 || Math.abs(puan) > ELLE_TAVAN)
      return res.status(400).json({ error: "puan",
        message: `Puan 1 ile ${ELLE_TAVAN} arasında olmalı (eksi de verilebilir).` });
    if (sebep.length < 3)
      return res.status(400).json({ error: "sebep", message: "Sebep yazmadan puan verilemez." });
    if (!acikMi())
      return res.status(400).json({ error: "kapali", message: "Tablo henüz açılmadı." });
    const u = listUsers().find((x) => String(x.username).toLowerCase() === kullanici.toLowerCase());
    if (!u) return res.status(404).json({ error: "notfound", message: "Kullanıcı bulunamadı." });
    const satir = addPoints(u.id, puan, "elle");
    console.log(`🔧  Elle puan: ${u.username} ${puan >= 0 ? "+" : ""}${puan} — ${sebep}` +
                ` (yeni toplam ${satir ? satir.points : "?"})`);
    res.json({ ok: true, username: u.username, eklenen: puan,
      toplam: satir ? satir.points : null,
      message: `${u.username} → ${puan >= 0 ? "+" : ""}${puan} puan eklendi.` +
               (satir ? ` Yeni toplam: ${satir.points}.` : "") });
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
    /* Mesaj SABİT değil: ara sırasında "20 Ağustos'ta açılıyor" demek
       yanlış olurdu. Tarih sonraki başlangıçtan okunuyor. */
    if (!row) {
      const sonraki = takvim.sonrakiBasi() || BASLANGIC;
      const nezaman = sonraki.toLocaleString("tr-TR",
        { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
      return res.json({ ok: true, points: 0, yazilmadi: true,
        acilis: sonraki.toISOString(), ara: takvim.aradaMi(),
        message: takvim.aradaMi()
          ? `${takvim.sonrakiNo()}. hafta ${nezaman}'da başlıyor — bu tur puan yazmadı.`
          : `Tokmakçılar tablosu ${nezaman}'da açılıyor — bu tur puan yazmadı.` });
    }
    res.json({ ok: true, points, total: row.points, week: weekKey() });
  });

  for (const h of (ODUL && ODUL.haftalar) || [])
    if (!odulAnahtariGecerliMi(h))
      console.warn(`⚠️  ODUL haftası (${h}) bir dönem başlangıcı DEĞİL — ödül hiçbir döneme bağlanmaz.`);
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
