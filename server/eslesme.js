/* ============================================================
   HYPNOSHUB — EŞLEŞME İSTATİSTİĞİ  ⚔️
   ------------------------------------------------------------
   "Bu eşleşmede kim kazanıyor?" — Madenci vs Lav Tazısı gibi bir
   karşılaşmanın Nihai Kademe ilk 1000'inde gerçekte nasıl bittiği.

   Kaynak: ilk 1000 oyuncunun savaş günlükleri. Her maç için iki
   destenin KAZANMA KOŞULU bulunuyor ve o çiftin karnesine
   yazılıyor. Tablo diskte birikiyor; tek çekim yeterli değil
   (aşağıdaki ölçüme bakınız).

   ------------------------------------------------------------
   ÜÇ ÖLÇÜLMÜŞ KARAR — hiçbiri tahmin değil
   ------------------------------------------------------------

   1) NEDEN "İKİ TARAF DA MERDİVENDE" ŞARTI VAR

   İlk akla gelen "ilk 1000'in günlüğündeki bütün sıralamalı
   maçları say" olurdu. Ölçtük, olmuyor:

     · Günlüğünü okuduğumuz hesaplar maçlarının %54,8'ini
       kazanıyor, karşılarındaki rakipler %29,4'ünü.
     · Yani sayı, destenin değil "kimin günlüğüne baktığımızın"
       ölçüsü oluyordu.
     · Bu fark maçın oynandığı ana ait `globalRank` ile ilk 500
       şartı koyunca da GEÇMEDİ: aynı eşleşme, örneklenen tarafta
       ve rakip tarafta ölçüldüğünde ortalama 28,9 PUAN ayrışıyor.

   Sebep basit: bir hesap ilk 1000'de olduğu için son 25 maçı
   galibiyet ağırlıklıdır — oraya öyle çıktı. Rakipleri ise onun
   yendiği insanlar.

   Çözüm: maçın İKİ tarafı da taradığımız merdivende olacak. O
   zaman iki oyuncu da aynı havuzdan gelir, seçilim etkisi ikisine
   birden uygulanır ve taraf tutmaz. Ölçüm: sıralamalı maçların
   %59,6'sı bu şartı sağlıyor (19.565'in 11.662'si) — yani veri
   kaybı katlanılabilir, üstelik kullanıcının istediği şey zaten
   tam olarak buydu: "ilk 1000'deki eşleşmeler".

   Filtrenin etkisi ölçüldü: ≥40 maçlık 83 çiftte oranlar
   ortalama 3,3 puan, tekil çiftlerde 13 puana kadar değişiyor.

   2) NEDEN KAZANMA KOŞULU İKİ KATMANLI

   Deste "neyin üzerine kurulu" sorusunun cevabı tek bir listeyle
   ve iksire göre sıralanınca yanlış çıkıyordu: Goblinstein (6),
   Dev İskelet (6), Sparky (6) gibi kartlar Yaban Domuzu'nu (4)
   eziyordu. Oysa o desteler havan/mezarlık/dev destesi; bunlar
   destenin kazanma koşulu değil, ağır vurucusu.

   Ölçüm — 23.324 deste: tek katmanlı kural destelerin %30,2'sini
   yanlış etiketliyordu. En sık düzeltmeler:
       Goblinstein → Havan (1.266)      Sparky → Dev (1.214)
       Dev İskelet → Savaş Koçu (883)   P.E.K.K.A → Savaş Koçu (717)

   Şimdiki kural: önce KATMAN 1 (gerçek kazanma koşulları) aranır;
   destede hiç yoksa KATMAN 2'ye düşülür. Kapsam: %96,9 katman 1,
   %2,3 katman 2, %0,8 hiçbiri (o desteler eşleşme göstermez).

   3) NEDEN TABLO DİSKTE BİRİKİYOR

   Tek bir çekimin güvenilirliği ölçüldü — maçlar sonuçtan bağımsız
   bir kuralla ikiye bölünüp iki yarının oranları karşılaştırıldı:

       her yarıda ≥15 maç →  r=0,32   ortalama fark 9,8 puan
       her yarıda ≥25 maç →  r=0,40   ortalama fark 7,1 puan
       her yarıda ≥40 maç →  r=0,58   ortalama fark 5,9 puan

   Yani 50 maçlık bir eşleşme oranı hâlâ ağırlıklı olarak GÜRÜLTÜ.
   Sayı ancak birkaç yüz maçta oturuyor. Günlükler ~4 günlük geçmiş
   taşıdığı için ilk tarama tek başına ~11.700 maç veriyor, sonra
   günde ~12.000 maç ekleniyor; bir hafta sonra en yoğun eşleşmeler
   birkaç bin maça ulaşıyor (standart hata ±1 puan civarı).

   Bu yüzden MIN_ORNEK altındaki eşleşmelerde yüzde YAZILMIYOR;
   arayüz "yeterli veri yok" diyor. Örneklem sayısı da her zaman
   gösteriliyor ki kimse 30 maçlık bir oranı kanun sanmasın.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { veriYolu } = require("./veriyolu");

const FILE = veriYolu("eslesme.json");

const sayi = (v, varsayilan) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : varsayilan;
};

/* ESLESME=0 ile tamamen kapatılabilir (API bütçesi kısıtlıysa). */
const ACIK = process.env.ESLESME !== "0";
/* Her turda kaç oyuncunun günlüğü okunuyor. 250 × 10 dk = merdivenin
   tamamı 40 dakikada bir dolaşılıyor. Bir günlük son ~25 maçı tutar ve
   bir maç ~3-4 dakika sürer, yani 40 dakikada kimse 25 maçı taşıramaz:
   hiçbir maç kaçmıyor. */
const DILIM = Math.max(20, sayi(process.env.ESLESME_DILIM, 250));
const ARA_MS = Math.max(60e3, sayi(process.env.ESLESME_DK, 10) * 60e3);
/* İlk tur açılışta ve merdivenin TAMAMI için — günlükler ~4 günlük
   geçmiş taşıdığından tablo daha ilk turda kullanılabilir hâle geliyor.
   45 sn gecikme: açılıştaki ısıtma ve klan taraması bitsin diye. */
const ILK_GECIKME_MS = 45e3;
/* Görülen maç kimlikleri bu kadar süre saklanıyor (mükerrer sayımı
   önlemek için). Günlükler en fazla ~4 gün geriye gidiyor; 5 gün
   emniyetli. Ölçülen boyut: günde ~12.000 kayıt → ~60.000 kayıt. */
const SAKLA_MS = 5 * 24 * 3600e3;
/* Bu sayının altındaki eşleşmelerde yüzde gösterilmiyor.

   40'a indirildi (önce 60'tı) — daha çok eşleşme daha erken görünsün diye.
   Bedeli ölçülü: yarıya bölme testinde 20 maçlık yarılar (≈40 maçlık
   tablo) r≈0,36 veriyor ve %50 civarı bir oranın 40 maçtaki %95 güven
   payı ±15 puan. Yani 40 maçlık bir sayı YÖN gösterir, kesin oran değil.
   Bu yüzden rozet her zaman maç sayısını ve ± payını da yazıyor; tablo
   biriktikçe aynı eşleşme kendiliğinden keskinleşiyor. */
const MIN_ORNEK = Math.max(10, sayi(process.env.ESLESME_MIN, 40));
/* Sezon başında bu sayıdan az maç birikmişse önceki sezonla birleştirip
   sunuyoruz, yoksa ayın ilk günlerinde tablo bomboş kalırdı. Günde
   ~12.000 maç birikiyor, yani ~2 gün sonra saf sezon verisine geçiliyor. */
const KARMA_ESIK = sayi(process.env.ESLESME_KARMA, 25000);

/* ============================================================
   KAZANMA KOŞULLARI
   ------------------------------------------------------------
   KATMAN 1 — destenin etrafında kurulduğu kartlar.
   KATMAN 2 — yalnızca destede hiç katman 1 yoksa bakılır.

   Sıra ÖNEMLİ ve ARTIK TEK ÖLÇÜT. Önce iksire, eşitlikte listeye
   bakılıyordu. Liste zaten iksire göre azalan yazıldığı için iki
   kural birebir aynı sonucu veriyor (ölçüldü: 23.324 destede 0 fark)
   — ama tek ölçüt liste olunca kural okunur oluyor ve bir adlandırma
   yanlış görünürse düzeltmek için kartı listede taşımak yetiyor.

   ⚠️ "Yanlış ad" şikâyetlerinin çoğu bu listeyle İLGİSİZ çıkıyor.
   Ölçülmüş örnek: kullanıcı "matkap destesi değil köstebek destesi"
   dedi. Sanılan sebep bu sıraydı; gerçek sebep BAŞKAYDI — Türkçe
   Clash Royale istemcisinde Goblin Drill'in adı zaten "Köstebek"
   (Miner ise "Madenci"). Site "Goblin Matkabı" yazıyordu çünkü adı
   data.js'teki eski karşılıktan alıyordu, oyunun kendi çeviri
   tablosundan değil. Yani ad sorunlarında önce ÇEVİRİYE bak, sıraya
   değil.

   Sıra kararları: Lav Tazısı ile Balon aynı satırda değil —
   "Lavaloon" destesinin kimliği Lav Tazısı. Aynı sebeple Mezarlık
   Dev'den önce (Dev Mezarlık destesinin koşulu mezarlıktır).

   Bu liste ELLE tutuluyor ve oyunun yeni kartlarıyla güncellenmesi
   gerekir. Listede olmayan bir kart hiçbir zaman kazanma koşulu
   sayılmaz; destede başka koşul da yoksa o maç eşleşme göstermez (%0,8).
   ============================================================ */
const KATMAN1 = [
  "Three Musketeers", "Golem", "Electro Giant", "X-Bow", "Royal Giant",
  "Goblin Giant", "Graveyard", "Giant", "Lava Hound", "Balloon", "Ram Rider",
  "Royal Hogs", "Goblin Machine", "Mortar", "Hog Rider", "Goblin Drill",
  "Battle Ram", "Miner", "Goblin Barrel", "Skeleton Barrel", "Elixir Golem",
  "Wall Breakers",
];
const KATMAN2 = [
  "Mega Knight", "P.E.K.K.A", "Royal Recruits", "Sparky", "Giant Skeleton",
  "Boss Bandit", "Goblinstein", "Prince", "Electro Dragon", "Witch",
  "Executioner", "Rune Giant",
];
const KOSUL = new Map();
KATMAN1.forEach((ad, i) => KOSUL.set(ad, { katman: 1, sira: i }));
KATMAN2.forEach((ad, i) => KOSUL.set(ad, { katman: 2, sira: KATMAN1.length + i }));

/* Bir aday diğerinden "daha çok kazanma koşulu" mu?
   Önce katman, sonra listedeki sıra. İksir ARTIK BAKILMIYOR — bkz. yukarıdaki
   not: iksir destenin kimliğini belirlemiyor, liste belirliyor. */
const ustun = (a, b) =>
  a.katman !== b.katman ? a.katman < b.katman : a.sira < b.sira;

/* `kartlar` iki ayrı biçimde gelebiliyor: savaş günlüğü `elixirCost` yazıyor,
   meta desteleri (metaCard) `elixir`. İkisini de kabul etmek zorundayız —
   yoksa anti deste ucu bütün destelerin iksirini 0 sanar ve kural yalnızca
   liste sırasına düşerdi. */
function kosulSec(kartlar) {
  let en = null;
  for (const c of kartlar || []) {
    const m = KOSUL.get(c.name);
    if (!m) continue;
    const aday = { id: c.id, ad: c.name, e: c.elixirCost ?? c.elixir ?? 0, katman: m.katman, sira: m.sira };
    if (!en || ustun(aday, en)) en = aday;
  }
  return en;
}

/* ---------- durum ---------- */
const bosSezon = () => ({ savas: 0, cift: {} });   // cift: "küçükId|büyükId" → [maç, küçüğünGalibiyeti]
const db = {
  sezon: sezonAdi(),
  bu: bosSezon(),
  onceki: bosSezon(),
  kart: {},                 // id → { ad, e, k }  (görülen kazanma koşulları)
  gorulen: new Map(),       // jeton → maçın saniyesi
  guncel: 0,                // son başarılı tur
  tur: 0,
};

function sezonAdi(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* Clash Royale zamanı: "20260817T185900.000Z" — Date bunu ayrıştıramaz. */
function crZaman(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(String(s || ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0;
}

/* Maç kimliği 48 bitlik bir jetona indiriliyor: 60.000 kayıtta çakışma
   beklentisi 0,00001'in altında, dosya ise onda bir boyutta. */
const jeton = (zaman, a, b) =>
  crypto.createHash("sha1").update(`${zaman}|${[a, b].sort().join("|")}`).digest("base64").slice(0, 8);

/* ---------- disk ---------- */
function yukle() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (!d || typeof d !== "object") return;
    if (d.sezon) db.sezon = d.sezon;
    if (d.bu && d.bu.cift) db.bu = { savas: d.bu.savas || 0, cift: d.bu.cift };
    if (d.onceki && d.onceki.cift) db.onceki = { savas: d.onceki.savas || 0, cift: d.onceki.cift };
    if (d.kart) db.kart = d.kart;
    if (Array.isArray(d.gorulen)) for (const [j, s] of d.gorulen) db.gorulen.set(j, s);
    db.guncel = d.guncel || 0;
    console.log(`⚔️  Eşleşme tablosu yüklendi (${db.bu.savas.toLocaleString("tr")} maç · ${Object.keys(db.bu.cift).length} eşleşme).`);
  } catch { /* ilk çalıştırma */ }
}

let zaman = null;
function kaydet() {
  clearTimeout(zaman);
  zaman = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify({
        sezon: db.sezon, bu: db.bu, onceki: db.onceki, kart: db.kart,
        guncel: db.guncel, gorulen: [...db.gorulen],
      }));
      fs.renameSync(tmp, FILE);
    } catch (e) { console.warn("⚠️  Eşleşme tablosu kaydedilemedi:", String(e)); }
  }, 2000);
}

function buda() {
  const sinir = Math.round((Date.now() - SAKLA_MS) / 1000);
  for (const [j, s] of db.gorulen) if (s < sinir) db.gorulen.delete(j);
}

/* Ay değiştiyse yeni sezon: mevcut tablo yedeğe iner, sayaç sıfırlanır.
   Silmiyoruz — yeni sezonun ilk günlerinde tablo boş kalmasın diye
   önceki sezonla birleştirilerek sunuluyor (bkz. KARMA_ESIK). */
function sezonKontrol() {
  const s = sezonAdi();
  if (s === db.sezon) return;
  db.onceki = db.bu;
  db.bu = bosSezon();
  db.sezon = s;
  console.log(`⚔️  Yeni sezon ${s} — eşleşme tablosu sıfırlandı, önceki sezon yedekte.`);
}

/* ---------- tarama ---------- */
let araclar = null;
let ofset = 0;
let calisiyor = false;

async function tur(tamMerdiven = false) {
  if (calisiyor || !araclar) return;
  calisiyor = true;
  const t0 = Date.now();
  try {
    sezonKontrol();
    const { cr, crRetry, pool, normTag } = araclar;
    const merdiven = (await cr(`/locations/global/pathoflegend/players?limit=1000`)).body.items || [];
    if (!merdiven.length) return;

    /* Havuz = maçın SAYILABİLMESİ için iki tarafın da içinde olması
       gereken küme. Dilim ise bu turda günlüğünü okuduklarımız. */
    const havuz = new Set(merdiven.map((p) => String(p.tag || "").toUpperCase()));
    const adet = tamMerdiven ? merdiven.length : Math.min(DILIM, merdiven.length);
    const dilim = [];
    for (let i = 0; i < adet; i++) dilim.push(merdiven[(ofset + i) % merdiven.length]);
    ofset = (ofset + adet) % merdiven.length;

    const logs = await pool(dilim, 6, async (p) => {
      try { return (await crRetry(`/players/${normTag(p.tag)}/battlelog`)).body || []; }
      catch { return []; }
    });

    const simdi = Date.now();
    let yeni = 0, aynaAtlandi = 0, kosulsuz = 0;
    for (const log of logs) {
      if (!Array.isArray(log)) continue;
      for (const b of log) {
        if (b.type !== "pathOfLegend") continue;
        const t = b.team?.[0], o = b.opponent?.[0];
        if (!t || !o) continue;
        const tk = t.cards || [], ok = o.cards || [];
        if (tk.length !== 8 || ok.length !== 8) continue;

        const ta = String(t.tag || "").toUpperCase(), oa = String(o.tag || "").toUpperCase();
        if (!havuz.has(ta) || !havuz.has(oa)) continue;      // ← ölçülmüş filtre, bkz. başlık

        const z = crZaman(b.battleTime);
        /* Saklama penceresinden eski maçlar sayılmıyor: mükerrer sayımı
           önleyen jeton listesi o kadar geriye gitmiyor, sayarsak aynı maç
           her turda yeniden eklenirdi. */
        if (!z || simdi - z > SAKLA_MS) continue;

        const j = jeton(b.battleTime, ta, oa);
        if (db.gorulen.has(j)) continue;
        db.gorulen.set(j, Math.round(z / 1000));

        const a = kosulSec(tk), c = kosulSec(ok);
        if (!a || !c) { kosulsuz++; continue; }
        if (a.id === c.id) { aynaAtlandi++; continue; }      // ayna eşleşme zaten %50

        const [dus, yuk] = a.id < c.id ? [a, c] : [c, a];
        const anahtar = `${dus.id}|${yuk.id}`;
        const d = db.bu.cift[anahtar] || (db.bu.cift[anahtar] = [0, 0]);
        const tacDus = a.id === dus.id ? (t.crowns || 0) : (o.crowns || 0);
        const tacYuk = a.id === dus.id ? (o.crowns || 0) : (t.crowns || 0);
        d[0]++;
        /* Berabere (eşit taç) yarım galibiyet. Sıralamalı maçların
           ~%0,4'ü berabere bitiyor; kaybetmiş saymak iki tarafı birden
           haksız yere aşağı çekiyordu (bkz. buildMeta'daki aynı not). */
        d[1] += tacDus === tacYuk ? 0.5 : tacDus > tacYuk ? 1 : 0;
        db.bu.savas++;
        yeni++;
        for (const k of [a, c])
          if (!db.kart[k.id]) db.kart[k.id] = { ad: k.ad, e: k.e, k: k.katman };
      }
    }

    buda();
    db.guncel = Date.now();
    db.tur++;
    kaydet();
    console.log(`⚔️  Eşleşme turu ${db.tur}: ${dilim.length} günlük · +${yeni} yeni maç ` +
                `(toplam ${db.bu.savas.toLocaleString("tr")}) · ${Object.keys(db.bu.cift).length} eşleşme · ` +
                `${((Date.now() - t0) / 1000).toFixed(1)} sn` +
                (kosulsuz ? ` · ${kosulsuz} maçta koşul bulunamadı` : "") +
                (aynaAtlandi ? ` · ${aynaAtlandi} ayna` : ""));
  } catch (e) {
    console.warn("⚠️  Eşleşme taraması başarısız:", String(e));
  } finally { calisiyor = false; }
}

function basla(a) {
  araclar = a;
  if (!ACIK) { console.log("⚔️  Eşleşme istatistiği KAPALI (ESLESME=0)."); return; }
  setTimeout(() => {
    tur(true);                                  // ilk tur: merdivenin tamamı
    setInterval(() => tur(false), ARA_MS).unref();
  }, ILK_GECIKME_MS).unref();
}

/* ---------- sunulan tablo ---------- */
function durum() {
  /* Sezonun başında tablo henüz inceyse önceki sezonla birleştiriyoruz;
     `karma` ile bunu açıkça söylüyoruz, arayüz de öyle yazıyor. */
  const karma = db.bu.savas < KARMA_ESIK && db.onceki.savas > 0;
  const cift = {};
  const ekle = (kaynak) => {
    for (const anahtar of Object.keys(kaynak)) {
      const v = kaynak[anahtar];
      const d = cift[anahtar] || (cift[anahtar] = [0, 0]);
      d[0] += v[0]; d[1] += v[1];
    }
  };
  ekle(db.bu.cift);
  if (karma) ekle(db.onceki.cift);
  for (const k of Object.keys(cift)) cift[k][1] = Math.round(cift[k][1] * 2) / 2;

  return {
    hazir: Object.keys(cift).length > 0,
    sezon: db.sezon,
    karma,
    savas: karma ? db.bu.savas + db.onceki.savas : db.bu.savas,
    minOrnek: MIN_ORNEK,
    guncel: db.guncel,
    kaynak: "Nihai Kademe ilk 1000 — iki tarafı da sıralamada olan maçlar",
    /* Kazanma koşulları: ön yüz destenin ana kartını bu listeyle seçiyor,
       yani kural sunucuyla ön yüzde AYNI kalıyor. */
    koc: Object.keys(db.kart).map((id) => ({
      id: +id, ad: db.kart[id].ad, e: db.kart[id].e, k: db.kart[id].k,
      s: KOSUL.get(db.kart[id].ad)?.sira ?? 999,
    })),
    ciftler: cift,
  };
}

/* Yönetici paneli için özet — hangi eşleşmeler ne kadar oturmuş. */
function ozet(adet = 25) {
  const d = durum();
  const satir = Object.keys(d.ciftler).map((k) => {
    const [a, b] = k.split("|").map(Number);
    const [n, w] = d.ciftler[k];
    return { a, b, adA: db.kart[a]?.ad || a, adB: db.kart[b]?.ad || b, n, yuzde: +(w / n * 100).toFixed(1) };
  }).sort((x, y) => y.n - x.n);
  return {
    sezon: d.sezon, karma: d.karma, savas: d.savas, guncel: d.guncel, tur: db.tur,
    eslesme: satir.length, yeterli: satir.filter((s) => s.n >= MIN_ORNEK).length,
    minOrnek: MIN_ORNEK, gorulen: db.gorulen.size, ust: satir.slice(0, adet),
  };
}

yukle();

module.exports = { basla, durum, ozet, kosulSec, KATMAN1, KATMAN2, MIN_ORNEK };
