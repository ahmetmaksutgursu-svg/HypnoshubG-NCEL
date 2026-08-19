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
/* ============================================================
   NEDEN "ÇİFT" DEĞİL "HÜCRE"
   ------------------------------------------------------------
   Önce eşleşme iki KAZANMA KOŞULU arasında ölçülüyordu (Balon vs
   Yaban Domuzu). Kullanıcı haklı olarak şunu bildirdi: iki bambaşka
   Mega Şövalye destesi aynı ada düşüyor ve sistem "ayna eşleşme"
   diyor — oysa desteler farklı.

   Deste-deste ölçmeyi denedik, ÖLÇÜM izin vermedi: 11.646 maçta 30
   arketiple en yoğun deste çiftine yalnızca 50 maç düşüyor, 100 maçlık
   çift SIFIR. (Kazanma koşulu çiftlerinde en yoğunu 229'du.)

   Tutan ara yol: SENİN DESTEN × RAKİBİN ARKETİPİ.
     · Senin tarafın DESTE düzeyinde — iki farklı Mega Şövalye destesi
       artık ayrı satır, "ayna" yanılgısı ortadan kalkıyor.
     · Rakip tarafı arketip (kazanma koşulu) düzeyinde — örneklem ancak
       böyle tutuyor.
   Ölçüm (30 meta destesi, 5/8 örtüşme): 629 hücre, 84'ü 40+ maç,
   en yoğunu 122. Bugünkü sistemle (86 çift ≥40) aynı kapsam.

   Ayrıca rakip tarafında YALNIZCA katman 1 kabul ediliyor: "Mega
   Şövalye arketipi" gibi katman 2 etiketleri zaten kullanıcının
   şikâyet ettiği anlamsız etiketlerdi.

   Desten meta destelerine benzemiyorsa HİÇBİR ŞEY gösterilmiyor —
   "random bir destenin analizi zaten yapılmaz".
   ============================================================ */
const bosSezon = () => ({ savas: 0, hucre: {} });   // hucre: "desteAnahtarı||rakipKocId" → [maç, galibiyet]
/* Meta desteleri taramanın KENDİSİNDEN çıkıyor: hangi sekizli kaç kez
   oynandıysa o sayılıyor, en çok oynanan META_ADET tanesi arketip kabul
   ediliyor. Ayrı bir meta hesabına bağlanmıyoruz — ölçüm de böyle
   yapıldı ve indeks kendi kendine yetiyor. */
const META_ADET = Math.max(8, sayi(process.env.ESLESME_META, 30));
/* Bir deste, bir meta destesiyle kaç kart paylaşırsa "o deste" sayılsın.
   Ölçüldü: 5/8'de kapsam %58,5 ve belirsiz eşleme %2,6; 6/8'de kapsam
   %49,7'ye düşüyor ama hücre başına maç da düşüyor. 5 seçildi. */
const ORTUSME = Math.max(4, Math.min(8, sayi(process.env.ESLESME_ORTUSME, 5)));

const db = {
  sezon: sezonAdi(),
  bu: bosSezon(),
  onceki: bosSezon(),
  desteSay: {},                 // "id,id,…" → kaç kez oynandı (arketip listesi buradan)
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

true
/* ============================================================
   ARKETİP EŞLEME
   ------------------------------------------------------------
   Bir desteyi en çok kart paylaştığı meta destesine bağlar. Aynı kural
   ön yüzde de çalışıyor (app.js → eslesmeMetaEsle); ikisi ayrışırsa
   istatistik başka bir desteye ait olur, o yüzden liste ve eşik
   sunucudan gönderiliyor.

   Beraberlikte POPÜLERLİĞİ yüksek olan kazanıyor: liste zaten
   popülerliğe göre sıralı ve karşılaştırma kesin büyüktür olduğu için
   ilk gelen kalıyor. Böylece sonuç her koşuda aynı.
   ============================================================ */
function metaListesi() {
  return Object.keys(db.desteSay)
    .sort((a, b) => db.desteSay[b] - db.desteSay[a])
    .slice(0, META_ADET)
    .map((k) => ({ k, n: db.desteSay[k], ids: k.split(",").map(Number) }));
}
function metaEsle(ids, liste) {
  let en = null, enSkor = 0;
  for (const m of liste) {
    let ortak = 0;
    for (const id of ids) if (m.ids.includes(id)) ortak++;
    if (ortak > enSkor) { enSkor = ortak; en = m; }
  }
  return enSkor >= ORTUSME ? en : null;
}
/* Deste anahtarı: kart kimlikleri küçükten büyüğe. Kart sırası oyuncuya
   göre değişiyor, anahtar değişmemeli. */
const desteAnahtari = (kartlar) => kartlar.map((c) => c.id).sort((a, b) => a - b).join(",");

/* Deste sayacı sınırsız büyümesin: nadir görülen desteler arketip
   olamayacağı için tutulmalarının anlamı yok. */
function desteBuda() {
  const anahtarlar = Object.keys(db.desteSay);
  if (anahtarlar.length <= 800) return;
  const kalan = anahtarlar.sort((a, b) => db.desteSay[b] - db.desteSay[a]).slice(0, 500);
  const yeni = {};
  for (const k of kalan) yeni[k] = db.desteSay[k];
  db.desteSay = yeni;
}

function yukle() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (!d || typeof d !== "object") return;
    if (d.sezon) db.sezon = d.sezon;
    if (d.bu && d.bu.hucre) db.bu = { savas: d.bu.savas || 0, hucre: d.bu.hucre };
    if (d.onceki && d.onceki.hucre) db.onceki = { savas: d.onceki.savas || 0, hucre: d.onceki.hucre };
    if (d.desteSay) db.desteSay = d.desteSay;
    if (d.kart) db.kart = d.kart;
    /* BİÇİM DEĞİŞİMİ GÖÇÜ.

       "Görülen maç" listesi mükerrer sayımı önlüyor. Ama tablo yapısı
       değiştiğinde (cift → hucre) eski liste yüklenirse yeni indeks o
       maçları "zaten sayıldı" diye ATLIYOR ve tablo günlerce boş kalıyor.
       Yayında ölçüldü: ilk turda 9.000 maç beklenirken 363 geldi, tablo
       7 hücrede kaldı.

       Yeni yapıda veri yoksa görülen listesi de BIRAKILIYOR; böylece
       günlüklerdeki ~4 günlük geçmiş baştan taranıp tablo hemen doluyor.
       Bedeli yok: sayılmamış maçları yeniden görmek mükerrer sayım
       değil, ilk sayım. */
    const yeniYapiVar = !!(d.bu && d.bu.hucre);
    if (yeniYapiVar && Array.isArray(d.gorulen))
      for (const [j, s] of d.gorulen) db.gorulen.set(j, s);
    else if (Array.isArray(d.gorulen) && d.gorulen.length)
      console.log("\u2694\ufe0f  Tablo yapisi degismis \u2014 " + d.gorulen.length +
                  " gorulen mac kaydi birakildi, indeks bastan kuruluyor.");
    db.guncel = d.guncel || 0;
    console.log(`⚔️  Eşleşme tablosu yüklendi (${db.bu.savas.toLocaleString("tr")} maç · ${Object.keys(db.bu.hucre).length} hücre · ${Object.keys(db.desteSay).length} deste).`);
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
        desteSay: db.desteSay, guncel: db.guncel, gorulen: [...db.gorulen],
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
    let yeni = 0, kosulsuz = 0;
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

        /* Her deste sayılıyor: arketip listesi bu sayaçtan çıkıyor. */
        for (const kartlar of [tk, ok]) {
          const ak = desteAnahtari(kartlar);
          db.desteSay[ak] = (db.desteSay[ak] || 0) + 1;
        }

        const kocT = kosulSec(tk), kocO = kosulSec(ok);
        /* Rakip tarafında yalnızca KATMAN 1 kabul ediliyor — katman 2
           etiketleri ("Mega Şövalye arketipi") anlamsızdı. */
        const t1 = (k) => (k && k.katman === 1 ? k : null);
        const liste = metaListesi();
        const metaT = metaEsle(tk.map((c) => c.id), liste);
        const metaO = metaEsle(ok.map((c) => c.id), liste);

        let yazildi = false;
        for (const [benimMeta, rakipKoc, benimTac, rakipTac] of [
          [metaT, t1(kocO), t.crowns || 0, o.crowns || 0],
          [metaO, t1(kocT), o.crowns || 0, t.crowns || 0],
        ]) {
          if (!benimMeta || !rakipKoc) continue;
          const anahtar = `${benimMeta.k}||${rakipKoc.id}`;
          const d = db.bu.hucre[anahtar] || (db.bu.hucre[anahtar] = [0, 0]);
          d[0]++;
          /* Berabere (eşit taç) yarım galibiyet — sıralamalı maçların
             ~%0,4'ü berabere ve kaybetmiş saymak iki tarafı da haksız
             yere aşağı çekiyordu. */
          d[1] += benimTac === rakipTac ? 0.5 : benimTac > rakipTac ? 1 : 0;
          yazildi = true;
          if (!db.kart[rakipKoc.id])
            db.kart[rakipKoc.id] = { ad: rakipKoc.ad, e: rakipKoc.e, k: rakipKoc.katman };
        }
        if (yazildi) { db.bu.savas++; yeni++; } else kosulsuz++;
      }
    }

    buda(); desteBuda();
    db.guncel = Date.now();
    db.tur++;
    kaydet();
    console.log(`⚔️  Eşleşme turu ${db.tur}: ${dilim.length} günlük · +${yeni} yeni maç ` +
                `(toplam ${db.bu.savas.toLocaleString("tr")}) · ${Object.keys(db.bu.hucre).length} hücre · ` +
                `${((Date.now() - t0) / 1000).toFixed(1)} sn` +
                (kosulsuz ? ` · ${kosulsuz} maçta koşul bulunamadı` : "") +
                "");
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
  const hucre = {};
  const ekle = (kaynak) => {
    for (const anahtar of Object.keys(kaynak)) {
      const v = kaynak[anahtar];
      const h = hucre[anahtar] || (hucre[anahtar] = [0, 0]);
      h[0] += v[0]; h[1] += v[1];
    }
  };
  ekle(db.bu.hucre);
  if (karma) ekle(db.onceki.hucre);
  const meta = metaListesi();
  /* Öksüz ve ince hücreleri ele.

     Öksüz: meta listesi zamanla değişiyor; bir deste ilk META_ADET'ten
     düşünce ona ait hücrelere ulaşılamıyor ama yükte taşınmaya devam
     ediyordu. Ön yüz o desteyi zaten eşleyemez, yani ölü ağırlık.
     İnce: MIN_ORNEK'in çok altındakiler hiçbir zaman gösterilmiyor. */
  const gecerli = new Set(meta.map((m) => m.k));
  for (const k of Object.keys(hucre)) {
    if (hucre[k][0] < 5 || !gecerli.has(k.split("||")[0])) { delete hucre[k]; continue; }
    hucre[k][1] = Math.round(hucre[k][1] * 2) / 2;
  }
  return {
    hazir: Object.keys(hucre).length > 0 && meta.length > 0,
    sezon: db.sezon,
    karma,
    savas: karma ? db.bu.savas + db.onceki.savas : db.bu.savas,
    minOrnek: MIN_ORNEK,
    ortusme: ORTUSME,
    guncel: db.guncel,
    kaynak: "Nihai Kademe ilk 1000 — iki tarafı da sıralamada olan maçlar",
    /* META DESTELERİ — ön yüz kullanıcının destesini bu listeye eşliyor.
       Sıra POPÜLERLİK sırası ve beraberlik bu sırayla çözülüyor, o yüzden
       liste olduğu gibi gönderiliyor. */
    metalar: meta.map((m) => ({ k: m.k, n: m.n, ids: m.ids })),
    /* Rakip arketipleri (yalnızca katman 1 — katman 2 etiketleri
       anlamsızdı, bkz. hücre yapısındaki not). */
    koc: Object.keys(db.kart)
      .filter((id) => db.kart[id].k === 1)
      .map((id) => ({
        id: +id, ad: db.kart[id].ad, e: db.kart[id].e, k: db.kart[id].k,
        s: KOSUL.get(db.kart[id].ad)?.sira ?? 999,
      })),
    hucreler: hucre,
  };
}

/* Yönetici paneli için özet — hangi eşleşmeler ne kadar oturmuş. */
function ozet(adet = 25) {
  const d = durum();
  const satir = Object.keys(d.hucreler).map((k) => {
    const [desteK, kocId] = k.split("||");
    const [n, w] = d.hucreler[k];
    return { deste: desteK, koc: +kocId, kocAd: db.kart[kocId]?.ad || kocId,
             n, yuzde: +(w / n * 100).toFixed(1) };
  }).sort((x, y) => y.n - x.n);
  return {
    sezon: d.sezon, karma: d.karma, savas: d.savas, guncel: d.guncel, tur: db.tur,
    hucre: satir.length, meta: d.metalar.length, yeterli: satir.filter((s) => s.n >= MIN_ORNEK).length,
    minOrnek: MIN_ORNEK, gorulen: db.gorulen.size, ust: satir.slice(0, adet),
  };
}

yukle();

module.exports = { basla, durum, ozet, kosulSec, metaListesi, metaEsle,
                   KATMAN1, KATMAN2, MIN_ORNEK, ORTUSME };
