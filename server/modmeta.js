/* ============================================================
   HYPNOSHUB — MOD BAZLI META (Büyük Mücadele)
   ------------------------------------------------------------
   Neden ayrı bir modül ve neden BİRİKTİRME:

   Meta listesi Nihai Kademe maçlarından kuruluyor ve orada veri bol:
   220 oyuncudan 10.410 maç, 59 deste 40+ maça ulaşıyor. Büyük
   Mücadele'de ise aynı örneklemden yalnızca 856 maç çıkıyor ve bunlar
   479 ayrı desteye dağılıyor — en çok oynanan deste bile 30 maçta
   kalıyor. Yani TEK BİR TAZELEMEDEN dürüst bir kazanma oranı
   yazılamıyor.

   Örneklemi büyütmek çözüm değil: 1000 oyuncuya çıkmak her tazelemede
   1000 API çağrısı demek ve yine deste başına ~136 maç veriyor.

   Çözüm zamanı kullanmak. Meta zaten her 20 dakikada 160 savaş günlüğü
   okuyor ve mücadele maçlarını ATIYOR. Onları biriktirmek EK API
   ÇAĞRISI GEREKTİRMİYOR — aynı veriyi ikinci kez değerlendiriyoruz.
   Eşleşme tablosu da aynı yöntemle 41.320 maç biriktirmiş durumda.

   İlk gün liste ince olur ve bunu SAKLAMIYORUZ: örneklem eşiğin
   altındaki destelerde yüzde yazılmıyor, kaç maça dayandığı yazılıyor.
   Güvenilir görünen uydurma bir sayı, "yeterli veri yok" demekten çok
   daha kötü.
   ============================================================ */

const fs = require("fs");
const { veriYolu } = require("./veriyolu");

const DOSYA = veriYolu("modmeta.json");

/* Biçim değişince eski dosya atılıyor. Sürüm olmadan, alan eklendiğinde
   eski kayıtlar sessizce yanlış okunur ve fark edilmesi zor olur. */
/* 2 → yanlılık düzeltmesi için taraf sayaçları eklendi (sn/sw/on/ow).
   Sürüm 1 kayıtlarında bu alanlar yok; korunsalardı düzeltme onlara
   uygulanamaz, aynı listede düzeltilmiş ve ham oranlar yan yana
   görünürdü. Birkaç saatlik veriyi atmak, karışık bir listeden iyi. */
/* 3 → mod ayrımı type+gameMode çiftine geçti ve Kupa Yolu eklendi.
   Sürüm 2 kayıtlarında bütün "trail" maçları tek torbadaydı; Kupa
   maçları mücadele sayılmıştı. Ayıklanamayacağı için atılıyorlar. */
const SURUM = 3;

/* Kazanma oranı yazmak için gereken en az maç.

   40, eşleşme tablosuyla aynı: %50 civarındaki bir oranın %95 güven
   aralığı 40 maçta ±15 puan. Bunun altında yazılan yüzde, okuyucuya
   bilgi değil yanlış güven verir. */
const MIN_ORNEK = Math.max(10, parseInt(process.env.MODMETA_MIN, 10) || 40);

/* Ne kadar geriye bakılıyor. Meta değişiyor; iki ay önceki mücadele
   destesi bugünü anlatmıyor. Bu süreden eski maçlar temizleniyor. */
const OMUR_GUN = Math.max(3, parseInt(process.env.MODMETA_GUN, 10) || 21);

/* TAKİP EDİLEN MODLAR.

   Eşleşme `type` + `gameMode.name` çiftine bakıyor, çünkü tek başına
   `type` yetmiyor: hem mücadeleler hem kupa maçları `trail` altında
   görünebiliyor.

   BÜYÜK ve KÜÇÜK MÜCADELE AYRILAMIYOR. Ölçüldü: ikisi de
   `trail · Challenge_AllCards_EventDeck_NoSet` olarak geliyor. Maç
   kaydında kademeyi söyleyen hiçbir alan yok — `eventTag` var ama o
   hangi ETKİNLİK olduğunu söylüyor, hangi kademe olduğunu değil.
   Bu yüzden tek bir "Mücadele" başlığı var; ikiye bölmek, hangi
   maçın hangi kademeden geldiğini uydurmak olurdu.

   KAOS yok: dönemsel bir etkinlik ve 200 oyuncunun günlüğünde 22 maç
   görünüyor, üstelik çoğu "friendly" (arkadaş maçı) — meta anlamı yok.

   Anahtar biçimi: "type|gameMode" ya da yalnızca "type" (gameMode
   önemsizse). */
const MOD_ESLEME = [
  { esle: (t, g) => t === "trail" && /^Challenge_/.test(g), mod: "mucadele" },
  { esle: (t, g) => (t === "PvP" || t === "trail") && g === "Ladder", mod: "kupa" },
];
const MODLAR = { mucadele: "mucadele", kupa: "kupa" };

/* Bir maçın hangi moda düştüğü. Eşleşme yoksa null — o maç sayılmıyor. */
function modBul(b) {
  const t = b?.type || "";
  const g = (b?.gameMode && b.gameMode.name) || "";
  for (const k of MOD_ESLEME) if (k.esle(t, g)) return k.mod;
  return null;
}

/* mod -> { desteler: Map(anahtar -> {n, w, kartlar, son}), guncel } */
const db = { surum: SURUM, mod: {} };
for (const m of Object.values(MODLAR))
  db.mod[m] = { desteler: {}, guncel: 0, taban: { sn: 0, sw: 0, on: 0, ow: 0 } };

/* GÖRÜLEN MAÇLAR — diske de yazılıyor.

   Aynı maç iki oyuncunun günlüğünde birden görünüyor, ayrıca her 20
   dakikada aynı oyuncular yeniden okunuyor ve savaş günlüğü son ~25
   maçı tutuyor. Yani aynı maç defalarca karşımıza çıkıyor.

   Bu küme önce YALNIZCA BELLEKTEYDİ ve orada ciddi bir hata vardı:
   sunucu her yeniden başladığında küme boşalıyor, ama biriken sayılar
   diskte duruyordu. Sonuç, hâlâ günlükte olan maçların İKİNCİ KEZ
   sayılması — bir destenin maç sayısı şişer, kazanma oranı bozulur ve
   bu hiçbir yerden fark edilmez. Dağıtım sık yapıldığı için gerçekleşme
   ihtimali de yüksekti.

   Küme artık diske yazılıyor ve yalnızca SON GÜNLERDEKİ maçlar
   tutuluyor: daha eskisi zaten savaş günlüğünden düşmüş, tekrar
   sayılma riski yok. Böylece dosya da sınırsız büyümüyor. */
const gorulen = new Set();
/* Kaç günlük maç kimliği saklanıyor. Savaş günlüğü ~25 maç tutuyor;
   aktif bir oyuncuda bu bir günü bile bulmuyor. 3 gün fazlasıyla
   güvenli bir pay. */
const GORULEN_GUN = 3;

function yukle() {
  try {
    const d = JSON.parse(fs.readFileSync(DOSYA, "utf8"));
    if (!d || d.surum !== SURUM) return;
    for (const m of Object.values(MODLAR))
      if (d.mod && d.mod[m]) db.mod[m] = d.mod[m];
    /* Sayılmış maç kimlikleri geri yükleniyor — yeniden başlatmadan
       sonra aynı maçların ikinci kez sayılmasını engelleyen şey bu. */
    for (const k of d.gorulen || []) gorulen.add(k);
    const n = Object.values(db.mod).reduce((a, x) => a + Object.keys(x.desteler || {}).length, 0);
    if (n) console.log(`🏆  Mod metası yüklendi (${n} deste).`);
  } catch { /* ilk çalıştırma */ }
}
yukle();

let yazZaman = null;
function kaydet() {
  clearTimeout(yazZaman);
  /* Gecikmeli yazım: her tazelemede yüzlerce deste güncelleniyor,
     her birinde diske gitmenin anlamı yok. */
  yazZaman = setTimeout(() => {
    try {
      const tmp = DOSYA + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify({ ...db, surum: SURUM, gorulen: [...gorulen] }));
      fs.renameSync(tmp, DOSYA);
    } catch (e) { console.warn("⚠️  Mod metası kaydedilemedi:", String(e)); }
  }, 2000);
}

const gunKey = (s) => String(s || "").slice(0, 8);      // "20260822T…" → "20260822"

/* Eski kayıtları at. Deste artık oynanmıyorsa listeden düşsün. */
/* Eski maç kimliklerini at: savaş günlüğünden düşmüş bir maç bir daha
   karşımıza çıkmaz, kimliğini tutmanın anlamı yok. Kimlik
   "20260822T…|#A|#B" biçiminde, yani tarihe göre karşılaştırılabiliyor. */
function kimlikleriBuda() {
  const sinir = new Date(Date.now() - GORULEN_GUN * 864e5);
  const esik = `${sinir.getFullYear()}${String(sinir.getMonth() + 1).padStart(2, "0")}${String(sinir.getDate()).padStart(2, "0")}`;
  let atilan = 0;
  for (const k of gorulen) if (k.slice(0, 8) < esik) { gorulen.delete(k); atilan++; }
  return atilan;
}

function temizle() {
  const sinir = new Date(Date.now() - OMUR_GUN * 864e5);
  const esik = `${sinir.getFullYear()}${String(sinir.getMonth() + 1).padStart(2, "0")}${String(sinir.getDate()).padStart(2, "0")}`;
  let atilan = 0;
  for (const m of Object.values(MODLAR)) {
    const d = db.mod[m];
    for (const [k, v] of Object.entries(d.desteler))
      if (!v.son || v.son < esik) { delete d.desteler[k]; atilan++; }
  }
  return atilan;
}

/* ---------- veri girişi ----------

   `buildMeta` savaş günlüklerini gezerken çağrılıyor. Nihai maçları
   kendi yolundan işleniyor; buraya yalnızca TAKİP EDİLEN modların
   maçları geliyor. */
function macEkle(b, orneklenen) {
  const mod = modBul(b);
  if (!mod) return false;
  const t = b.team?.[0], o = b.opponent?.[0];
  if (!t || !o) return false;

  const kimlik = [b.battleTime, ...[t.tag, o.tag].sort()].join("|");
  if (gorulen.has(kimlik)) return false;
  gorulen.add(kimlik);

  const gun = gunKey(b.battleTime);
  const d = db.mod[mod];
  for (const [ben, oteki] of [[t, o], [o, t]]) {
    const kartlar = ben.cards || [];
    if (kartlar.length !== 8) continue;
    const anahtar = kartlar.map((c) => c.id).sort((a, x) => a - x).join(",");
    let kayit = d.desteler[anahtar];
    if (!kayit) {
      kayit = d.desteler[anahtar] = {
        n: 0, w: 0, son: gun,
        /* Kart kimlikleri saklanıyor, kartın kendisi değil: görsel ve ad
           zaten kart listesinden geliyor ve orada güncel kalıyor. Burada
           kopyalamak, kart adı değiştiğinde eski adı dondururdu. */
        k: kartlar.map((c) => c.id),
        evo: kartlar.filter((c) => c.evolutionLevel).map((c) => c.id),
      };
    }
    kayit.n++;
    /* Eşit kupa berabere sayılıyor: yalnızca ">" kullanmak iki tarafı da
       kaybeden yapıyor ve genel oranı %50'nin altına çekiyor. */
    const benim = ben.crowns || 0, onun = oteki.crowns || 0;
    const kazanc = benim === onun ? 0.5 : benim > onun ? 1 : 0;
    kayit.w += kazanc;
    if (gun > kayit.son) kayit.son = gun;

    /* HANGİ TARAFTA oynandığı ayrıca sayılıyor — yanlılık düzeltmesi için.

       Örneklediğimiz oyuncular Nihai ilk 1000'den geliyor ve
       mücadelelerde rakiplerinden belirgin şekilde güçlü. Ham oran
       bunu deste başarısı sanıyor: ilk ölçümde bir deste %77,5
       galibiyet gösterdi, oysa o sayı destenin değil onu tutan
       oyuncunun başarısıydı.

       Nihai metasında bu düzeltme zaten var; buraya da aynısı
       geliyor. Yoksa iki sekme aynı görünen ama farklı anlamlara gelen
       yüzdeler yazardı — kullanıcı ikisini karşılaştırdığında yanılırdı. */
    const bende = !!(orneklenen && orneklenen.has(ben.tag));
    if (bende) { kayit.sn = (kayit.sn || 0) + 1; kayit.sw = (kayit.sw || 0) + kazanc;
                 d.taban.sn++; d.taban.sw += kazanc; }
    else       { kayit.on = (kayit.on || 0) + 1; kayit.ow = (kayit.ow || 0) + kazanc;
                 d.taban.on++; d.taban.ow += kazanc; }
  }
  d.guncel = Date.now();
  return true;
}

/* Bir tazeleme turu bittiğinde çağrılıyor. */
function turBitti() {
  kimlikleriBuda();
  const atilan = temizle();
  kaydet();
  return atilan;
}

/* ---------- okuma ---------- */

/* Listeyi hazırla. `kartCoz` bir kart kimliğini kart nesnesine çeviriyor
   (adı, görseli); modül kart listesini kendisi tutmuyor. */
/* Yanlılık düzeltmesi — Nihai metasındakiyle aynı formül.

   Beklenen = örneklenen taraftaki maç sayısı × örneklenenlerin taban
   oranı + rakip taraftaki × rakiplerin taban oranı. Deste yalnızca
   pilotunun taban başarısını tekrarlıyorsa %50'ye oturuyor; üstü
   destenin kendi katkısı. */
function duzeltilmis(v, taban) {
  const sr = taban && taban.sn ? taban.sw / taban.sn : 0.5;
  const or = taban && taban.on ? taban.ow / taban.on : 0.5;
  const beklenen = (v.sn || 0) * sr + (v.on || 0) * or;
  const oran = (0.5 + (v.w - beklenen) / v.n) * 100;
  return Math.round(Math.max(0, Math.min(100, oran)) * 10) / 10;
}

function liste(mod, kartCoz, limit = 40) {
  const d = db.mod[mod];
  if (!d) return { items: [], toplam: 0, minOrnek: MIN_ORNEK };
  const hepsi = Object.entries(d.desteler);
  const toplamMac = hepsi.reduce((a, [, v]) => a + v.n, 0);

  const items = hepsi
    .map(([anahtar, v]) => {
      const kartlar = v.k.map(kartCoz).filter(Boolean);
      if (kartlar.length !== 8) return null;          // kart listesinden düşmüş
      /* Kazanma oranı YALNIZCA örneklem yeterliyse. Altındakilerde null
         dönüyor ve arayüz "yeterli veri yok" yazıyor — sayının kendisini
         göstermek, okuyucuya olmayan bir kesinlik vaat ederdi. */
      const yeterli = v.n >= MIN_ORNEK;
      return {
        key: anahtar,
        cards: kartlar,
        evo: v.evo || [],
        battles: v.n,
        /* DÜZELTİLMİŞ oran: destenin, aynı taraf karışımındaki ORTALAMA
           bir desteye göre ne kadar iyi olduğu. Ham oran örneklenen
           oyuncunun gücünü ölçüyordu. */
        winrate: yeterli ? duzeltilmis(v, d.taban) : null,
        rawWinrate: yeterli ? Math.round((v.w / v.n) * 1000) / 10 : null,
        yeterli,
        usage: toplamMac ? Math.round((v.n / toplamMac) * 1000) / 10 : 0,
      };
    })
    .filter(Boolean)
    /* Sıralama ÖNCE oynanma sayısı: "en popüler" sorusunun cevabı bu ve
       az örnekli bir destenin şişik oranıyla listeye tırmanmasını
       engelliyor. */
    .sort((a, b) => b.battles - a.battles)
    .slice(0, limit);

  return {
    items, toplam: toplamMac, deste: hepsi.length,
    minOrnek: MIN_ORNEK, guncel: d.guncel || 0,
    guvenli: items.filter((x) => x.yeterli).length,
  };
}

function durum() {
  const out = {};
  for (const m of Object.values(MODLAR)) {
    const d = db.mod[m];
    const hepsi = Object.values(d.desteler || {});
    out[m] = {
      deste: hepsi.length,
      mac: hepsi.reduce((a, v) => a + v.n, 0),
      guvenli: hepsi.filter((v) => v.n >= MIN_ORNEK).length,
      guncel: d.guncel || 0,
    };
  }
  return { ...out, minOrnek: MIN_ORNEK, omurGun: OMUR_GUN };
}

module.exports = { macEkle, turBitti, liste, durum, MODLAR, MIN_ORNEK };
