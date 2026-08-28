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
/* Kayıt biçiminin sürümü.

   Yapı değiştiğinde artırılır. "Görülen maç" listesi yalnızca AYNI
   sürümde anlamlı: liste bir maçı "sayıldı" diye işaretler, ama sayım
   eski yapıya yapılmıştır. Yeni yapıya geçince o maçlar hiç sayılmamış
   olur ve liste onları atlatırsa tablo günlerce boş kalır.

   Yayında bunu ölçtük: yapı değişiminden sonra ilk tur 9.000 maç
   yerine 363 getirdi, tablo 7 hücrede kaldı ve gösterilecek tek bir
   oran çıkmadı. Sürüm damgası olmadığı için ilk düzeltme de yetmedi —
   arada yapılan kayıt, yeni yapıyla birlikte ESKİ listeyi de yazmıştı.

   Sürüm tutmuyorsa sayaçlar korunur, görülen listesi bırakılır.
   Sayılmamış bir maçı yeniden görmek mükerrer sayım değil, ilk sayım. */
const SURUM = 2;
/* Deste çifti tablosunun KENDİ sürümü. Ayrı tutuluyor çünkü bu tablo
   hücrelerin yanına EKLENDİ, onların yapısını değiştirmedi: ana sürümü
   artırmak görülen-maç listesini attırır ve hücreler yerinde kaldığı
   için son ~4 günün maçları ikinci kez sayılırdı. Çift tablosu
   uyumsuzsa yalnızca o sıfırlanıyor, sayaçlar bozulmuyor. */
const CIFT_SURUM = 1;

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
  /* MAÇ ANALİZİ tabanı — bkz. DESTE ÇİFTLERİ başlığı. */
  desteDizin: [],           // sıra → deste anahtarı (sözlük)
  desteNo: new Map(),       // deste anahtarı → sıra
  cift: {},                 // "a>b" → [maç, a’nın galibiyeti]
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
    /* Çift tablosu yalnızca sürüm tutuyorsa yükleniyor: sözlük
       numaraları biçime bağlı, eski numaralar yeni sözlükte başka
       desteyi gösterirdi. */
    if (d.ciftSurum === CIFT_SURUM && Array.isArray(d.desteDizin) && d.cift) {
      db.desteDizin = d.desteDizin;
      db.desteNo = new Map(d.desteDizin.map((a, i) => [a, i]));
      db.cift = d.cift;
    }
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
    const uygun = d.surum === SURUM && !!(d.bu && d.bu.hucre);
    if (uygun && Array.isArray(d.gorulen))
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
        surum: SURUM,
        sezon: db.sezon, bu: db.bu, onceki: db.onceki, kart: db.kart,
        desteSay: db.desteSay, guncel: db.guncel, gorulen: [...db.gorulen],
        ciftSurum: CIFT_SURUM, desteDizin: db.desteDizin, cift: db.cift,
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
        const akT = desteAnahtari(tk), akO = desteAnahtari(ok);
        db.desteSay[akT] = (db.desteSay[akT] || 0) + 1;
        db.desteSay[akO] = (db.desteSay[akO] || 0) + 1;
        /* MAÇ ANALİZİ için deste-deste kaydı. Arketip hücresi yazılmasa
           bile (deste hiçbir metaya benzemiyorsa) bu satır yazılıyor —
           kullanıcı meta olmayan bir deste de sorabilir. */
        ciftYaz(akT, akO, t.crowns || 0, o.crowns || 0);

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

    buda(); desteBuda(); ciftBuda();
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


/* ============================================================
   DESTE ÇİFTLERİ  —  MAÇ ANALİZİ'nin veri tabanı
   ------------------------------------------------------------
   Arketip tablosu (hucre) "meta destem × rakibin kazanma koşulu"
   düzeyinde. MAÇ ANALİZİ ise kullanıcının yazdığı İKİ SOMUT desteyi
   karşılaştırıyor, yani daha ince bir kırılım gerekiyor: hangi sekizli
   hangi sekizliyle kaç kez karşılaştı.

   ÖLÇÜM (6.541 sıralamalı maç, 350 oyuncunun günlüğü):
     tekil deste çifti          4.880
     en kalabalık çift          19 maç
     ortanca örneklem, ilk 10 destede:
        tam 8/8 eşleşme          7 maç
        ≥7 kart ortak           10 maç
        ≥6 kart ortak           12 maç
        ≥5 kart ortak           23 maç
     31-80. sıradaki destelerde bu sayılar 0-2'ye düşüyor.

   Yani TAM deste eşleşmesi neredeyse hiç örneklem vermiyor. Bu yüzden
   sorgu KADEMELİ: önce tam eşleşme denenir, yetmezse ortak kart eşiği
   birer birer gevşetilir, o da yetmezse arketip tablosuna düşülür.
   Hangi kademenin kullanıldığı ve kaç maça dayandığı her zaman geri
   döndürülüyor — sayının ne kadar sağlam olduğunu ekranda yazabilmek
   için (12 maçta %50 ölçmek "gerçek oran %25 ile %75 arasında"
   demektir; bunu gizlemek okuyucuyu yanıltır).

   SAKLAMA BİÇİMİ: deste anahtarları uzun ("26000010,26000014,…" ~70
   karakter). Çift başına iki anahtar yazmak dosyayı şişirirdi, o yüzden
   bir sözlük tutuluyor: her tekil deste bir sayı alıyor, çift anahtarı
   "12>47" gibi kısa oluyor. Ölçülen kazanç ~5 kat.
   ============================================================ */
const CIFT_TAVAN = Math.max(5000, sayi(process.env.ESLESME_CIFT, 60000));
const ANALIZ_KADEME = [8, 7, 6, 5];

/* EŞLEŞME HESABI İÇİN AYRI EŞİK.

   Kullanıcı isteği: "en az 30 maçta kimin kazandığından yola
   çıkarak". Genel MIN_ORNEK (40) meta ekranlarında kullanılıyor ve
   onu düşürmek oradaki sayıları da gevşetirdi; bu yüzden hesap
   kendi eşiğiyle çalışıyor.

   30 ile 40 arasındaki fark güven payına yansıyor: 30 maçta %95
   payı ±18 puan, 40 maçta ±15. İkisi de geniş, o yüzden pay yanıtta
   AYRICA veriliyor — sayıyı payı olmadan göstermek okuyucuyu
   yanıltır. */
const ANALIZ_MIN = Math.max(10, sayi(process.env.ANALIZ_MIN, 30));

function desteNo(anahtar) {
  let no = db.desteNo.get(anahtar);
  if (no == null) { no = db.desteDizin.length; db.desteDizin.push(anahtar); db.desteNo.set(anahtar, no); }
  return no;
}

/* Bir maçı çift tablosuna yaz. `w` her zaman KÜÇÜK numaralı destenin
   galibiyeti; yön anahtarın kendisinden okunuyor. */
function ciftYaz(anahtarA, anahtarB, tacA, tacB) {
  const a = desteNo(anahtarA), b = desteNo(anahtarB);
  const [k1, k2, kazanan] = a <= b ? [a, b, tacA] : [b, a, tacB];
  const kaybeden = a <= b ? tacB : tacA;
  const k = `${k1}>${k2}`;
  const d = db.cift[k] || (db.cift[k] = [0, 0]);
  d[0]++;
  d[1] += kazanan === kaybeden ? 0.5 : kazanan > kaybeden ? 1 : 0;
}

/* Tablo sınırsız büyümesin. Tek maçlık çiftler zaten hiçbir kademede
   eşiği geçiremiyor; önce onlar gidiyor, yetmezse en seyrekler. Budama
   sonrası sözlük de sıkıştırılıyor, yoksa artık kimsenin göstermediği
   deste anahtarları dosyada kalırdı. */
function ciftBuda() {
  const k = Object.keys(db.cift);
  if (k.length <= CIFT_TAVAN) return;
  const kalan = k.sort((x, y) => db.cift[y][0] - db.cift[x][0]).slice(0, Math.floor(CIFT_TAVAN * 0.8));
  const yeniCift = {}, eskiyeYeni = new Map(), yeniDizin = [];
  for (const anahtar of kalan) {
    const [a, b] = anahtar.split(">").map(Number);
    const ye = [a, b].map((no) => {
      let y = eskiyeYeni.get(no);
      if (y == null) { y = yeniDizin.length; yeniDizin.push(db.desteDizin[no]); eskiyeYeni.set(no, y); }
      return y;
    });
    yeniCift[`${ye[0]}>${ye[1]}`] = db.cift[anahtar];
  }
  db.cift = yeniCift;
  db.desteDizin = yeniDizin;
  db.desteNo = new Map(yeniDizin.map((a, i) => [a, i]));
}

/* Wilson %95 güven aralığı. Normal yaklaşım (p ± 1,96·√(p(1-p)/n))
   küçük örneklemde %100'ü aşan sınırlar üretiyor; Wilson üretmiyor. */
function guvenAraligi(galibiyet, mac) {
  if (!mac) return null;
  const z = 1.96, p = galibiyet / mac;
  const payda = 1 + (z * z) / mac;
  const orta = (p + (z * z) / (2 * mac)) / payda;
  const yari = (z * Math.sqrt((p * (1 - p)) / mac + (z * z) / (4 * mac * mac))) / payda;
  return { alt: Math.max(0, orta - yari), ust: Math.min(1, orta + yari), pay: yari };
}

const ortakSayisi = (x, y) => { let n = 0, i = 0, j = 0;
  while (i < x.length && j < y.length) { if (x[i] === y[j]) { n++; i++; j++; } else if (x[i] < y[j]) i++; else j++; }
  return n; };

/* Sözlükteki hangi desteler verilen desteyle en az `esik` kart paylaşıyor. */
function esikleEsle(idler, esik) {
  const küme = new Set();
  for (let i = 0; i < db.desteDizin.length; i++) {
    const ids = db.desteDizin[i].split(",").map(Number);
    if (ortakSayisi(ids, idler) >= esik) küme.add(i);
  }
  return küme;
}

/* `kosulSec` kart ADINA bakıyor, elimizde ise yalnızca kimlik var.
   Görülen kazanma koşullarının adı zaten `db.kart` içinde tutuluyor —
   kazanma koşulu OLMAYAN kartların adına da ihtiyacımız yok. */
function kosulSecIdler(idler) {
  let en = null;
  for (const id of idler) {
    const k = db.kart[id];
    const m = k && KOSUL.get(k.ad);
    if (!m) continue;
    const aday = { id, ad: k.ad, e: k.e, katman: m.katman, sira: m.sira };
    if (!en || ustun(aday, en)) en = aday;
  }
  return en;
}

/* ---------- MAÇ ANALİZİ ----------
   A ve B: 8'er kart kimliği. Dönen sonuçta `katman` hangi kademeden
   geldiğini söylüyor; ekranda bunu yazmak zorundayız. */
/* sadeceDeste: arketip yedeğine DÜŞME. Kullanıcı isteği — beş kart
   ve üzeri eşleşen deste yoksa "bulunamadı" densin, benzer bir
   arketiple tahmin yürütülmesin. */
function analiz(A, B, { sadeceDeste = false } = {}) {
  const a = [...A].sort((x, y) => x - y), b = [...B].sort((x, y) => x - y);
  if (a.length !== 8 || b.length !== 8) return { hata: "deste-8-kart" };

  const denenen = [];
  for (const esik of ANALIZ_KADEME) {
    const kA = esikleEsle(a, esik), kB = esikleEsle(b, esik);
    if (!kA.size || !kB.size) { denenen.push({ esik, mac: 0 }); continue; }
    let mac = 0, gal = 0;
    for (const anahtar in db.cift) {
      const kes = anahtar.indexOf(">");
      const x = +anahtar.slice(0, kes), y = +anahtar.slice(kes + 1);
      const [n, w] = db.cift[anahtar];
      /* x sende, y rakipte → w doğrudan senin galibiyetin. */
      if (kA.has(x) && kB.has(y)) { mac += n; gal += w; }
      /* Ters yön: y sende, x rakipte → senin galibiyetin n-w. */
      if (kA.has(y) && kB.has(x)) { mac += n; gal += n - w; }
    }
    denenen.push({ esik, mac });
    if (mac >= ANALIZ_MIN) {
      const ga = guvenAraligi(gal, mac);
      return { kaynak: "deste", katman: esik, mac, oran: gal / mac,
               alt: ga.alt, ust: ga.ust, pay: ga.pay, denenen };
    }
  }

  /* Deste düzeyinde örneklem yoksa arketip tablosuna düşülüyor: senin
     desten hangi meta destesine benziyor, rakibin kazanma koşulu ne. */
  if (sadeceDeste)
    return { kaynak: "yok", mac: denenen.length ? Math.max(...denenen.map((d) => d.mac)) : 0,
             denenen, esik: ANALIZ_MIN };

  const liste = metaListesi();
  const metaA = metaEsle(a, liste);
  const kocB = kosulSecIdler(b);
  if (metaA && kocB && kocB.katman === 1) {
    const tablo = durum().hucreler;
    const h = tablo[`${metaA.k}||${kocB.id}`];
    if (h && h[0] >= MIN_ORNEK) {
      const ga = guvenAraligi(h[1], h[0]);
      return { kaynak: "arketip", katman: 0, mac: h[0], oran: h[1] / h[0],
               alt: ga.alt, ust: ga.ust, pay: ga.pay,
               arketip: { benim: metaA.k, rakipKoc: kocB.id, rakipAd: kocB.ad }, denenen };
    }
  }
  return { kaynak: "yok", mac: denenen.length ? Math.max(...denenen.map((d) => d.mac)) : 0, denenen };
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

module.exports = { basla, durum, ozet, analiz, kosulSec, metaListesi, metaEsle,
                   KATMAN1, KATMAN2, MIN_ORNEK, ANALIZ_MIN, ORTUSME, ANALIZ_KADEME };
