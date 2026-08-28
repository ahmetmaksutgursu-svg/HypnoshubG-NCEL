/* ============================================================
   HYPNOSHUB — KULE HASARI
   ------------------------------------------------------------
   İstenen: bir maçta oyuncunun rakibin kulelerine kaç hasar vurduğu.

   SORUN: API kulelerin KALAN canını veriyor, AZAMİ canını vermiyor.
   Hasar = azami − kalan olduğu için azamiyi bir yerden bilmek gerek.

   Denenip ELENEN yol: oyun verisindeki temel can (Kral 2400, Prenses
   1400) × nadirlik seviye çarpanı. Tutmadı — gözlenen 7728 hiçbir
   çarpanla 2400'den çıkmıyor. Uydurma bir formülle devam etmektense
   ölçtük.

   ÖLÇÜM (930 maç, 60 oyuncu):
     · Kule canı OYUN MODUNA bağlı. Nihai'de sabit (kral 7728), kule
       askeri 8. seviye de olsa 16. seviye de olsa değişmiyor —
       normalleştirme. Kupa Yolu'nda ise kral seviyesine göre değişiyor
       (16 → 7728, 15 → 7032).
     · Prenses kulesinin canı KULE ASKERİNE bağlı: Prenses Kulesi 4858,
       Kraliyet Şefi 4302, Hançerli Düşes 4406, Topçu 4164 (Nihai'de).
     · Kaos modu (`Chaos_1v1_Draft`) kule canlarını İKİYE KATLIYOR:
       kral 9648, prenses 6104. Bu modun kuralı, seviyeyle ilgisi yok.
       Bunu fark etmeden yazılan ilk hesap eksi hasar üretiyordu.

   ÇÖZÜM: tabloyu elle yazmak yerine sunucu GÖZLEYEREK öğreniyor.
   Anahtar = oyun modu | kule askeri | asker seviyesi. Bir anahtarın
   azami canı, o anahtarda EN SIK görülen değer ile EN YÜKSEK görülen
   değer AYNI olduğunda kabul ediliyor. Dayanağı: maçların ~%45'i
   kulelerden biri hiç hasar almadan bitiyor, o yüzden tam can hem
   tepe nokta hem de en yüksek değer oluyor. Hasar görmüş bir değerin
   ikisini birden tutturması için o değerin defalarca tekrar etmesi
   gerekirdi.

   DOĞRULAMA (aynı 930 maç): %96 kapsam, aralık dışı tek değer yok ve
   3 taçla biten 78 maçın 78'inde hasar tam toplamına eşit çıkıyor —
   formülün bağımsız sınaması. Anahtar tanınmıyorsa SAYI YAZILMIYOR;
   tahmin yok.
   ============================================================ */
const fs = require("fs");
const { veriYolu } = require("./veriyolu");

const SURUM = 1;
const DOSYA = veriYolu("kule.json");

/* Bir anahtarın güvenilir sayılması için gereken taraf sayısı. Ölçümde
   8 ve 20 eşikleri aynı sonucu verdi (%96), yani asıl koruma eşik değil
   "en sık = en yüksek" kuralı. 12 ikisinin ortası. */
const MIN_ORNEK = Math.max(4, parseInt(process.env.KULE_MIN, 10) || 12);

/* Bir anahtarda saklanan farklı can değeri sayısı. Sayaç sınırsız
   büyürse dosya şişer; tam can zaten en sık değer olduğu için nadir
   değerleri atmak sonucu bozmuyor. */
const EN_FAZLA_DEGER = 60;

const db = { anahtar: {} };   // anahtar → { kral: {can: adet}, prenses: {can: adet}, n }

function yukle() {
  try {
    const d = JSON.parse(fs.readFileSync(DOSYA, "utf8"));
    if (!d || d.surum !== SURUM) return;
    db.anahtar = d.anahtar || {};
    const n = Object.keys(db.anahtar).length;
    if (n) console.log(`🏰  Kule canı tablosu yüklendi (${n} anahtar).`);
  } catch { /* ilk çalıştırma */ }
}

let yazZaman = null;
function kaydet() {
  clearTimeout(yazZaman);
  /* Gecikmeli yazım: canlı akış tek tazelemede yüzlerce taraf işliyor. */
  yazZaman = setTimeout(() => {
    try {
      const tmp = DOSYA + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify({ surum: SURUM, anahtar: db.anahtar }));
      fs.renameSync(tmp, DOSYA);
    } catch (e) { console.warn("⚠️  Kule canı tablosu kaydedilemedi:", String(e)); }
  }, 3000);
}

const asker = (p) => (p && p.supportCards && p.supportCards[0]) || null;

function anahtarla(b, p) {
  const s = asker(p);
  if (!s || !s.name) return null;
  const mod = b && b.gameMode && b.gameMode.name;
  if (!mod) return null;
  return mod + "|" + s.name + "|" + (s.level ?? "?");
}

function say(kutu, deger) {
  if (!Number.isFinite(deger)) return;
  kutu[deger] = (kutu[deger] || 0) + 1;
  const anahtarlar = Object.keys(kutu);
  if (anahtarlar.length > EN_FAZLA_DEGER) {
    /* En seyrek görülen değeri at — tam can en sık değer olduğu için
       elenmesi mümkün değil. */
    let enAz = anahtarlar[0];
    for (const k of anahtarlar) if (kutu[k] < kutu[enAz]) enAz = k;
    delete kutu[enAz];
  }
}

/* Bir maçtaki her iki tarafın kule canlarını tabloya işler. */
function ogren(b) {
  if (!b) return;
  let degisti = false;
  for (const taraf of [...(b.team || []), ...(b.opponent || [])]) {
    const k = anahtarla(b, taraf);
    if (!k) continue;
    const kayit = db.anahtar[k] || (db.anahtar[k] = { kral: {}, prenses: {}, n: 0 });
    say(kayit.kral, taraf.kingTowerHitPoints);
    for (const v of (taraf.princessTowersHitPoints || [])) say(kayit.prenses, v);
    kayit.n++;
    degisti = true;
  }
  if (degisti) kaydet();
}

/* Bir anahtarın tam canı: EN AZ `MIN_TEKRAR` kez görülmüş EN YÜKSEK değer.

   İlk kural "en sık görülen = en yüksek görülen" idi ve en büyük anahtarı
   (Nihai + Prenses Kulesi, 1926 taraf) tümden reddetti. Sebebi ölçüldü:
   prenses canı iki tepe yapıyor, 4858 ve 4808. Ayıran alanı aradık ve
   bulduk — KRAL kulesinin canı. Kral tam canlıyken (7728) prenses hep
   4858 çıkıyor (113 örnek, 4808 hiç yok); kral hasar almışsa prenses hep
   4808. İkisi de tam 50 eksik, yani 4808 ayrı bir tam can değil, 50 hasar
   almış hâli. "En sık" kuralı bu yüzden yanlış tepeye kilitleniyordu.

   Tekrar şartı tek seferlik uç değerleri eliyor: gerçek tam can maçların
   yarısına yakınında görüldüğü için üç tekrarı fazlasıyla aşıyor. */
const MIN_TEKRAR = Math.max(2, parseInt(process.env.KULE_TEKRAR, 10) || 3);

function enYuksekTekrarli(kutu) {
  let en = null;
  for (const [dStr, adet] of Object.entries(kutu || {})) {
    if (adet < MIN_TEKRAR) continue;
    const d = Number(dStr);
    if (en == null || d > en) en = d;
  }
  return en;
}

/* Bir anahtarın öğrenilmiş azami canları: [kral, prenses] ya da null. */
function tamCan(k) {
  const kayit = db.anahtar[k];
  if (!kayit || kayit.n < MIN_ORNEK) return null;
  const kral = enYuksekTekrarli(kayit.kral);
  const prenses = enYuksekTekrarli(kayit.prenses);
  if (kral == null || prenses == null) return null;
  return [kral, prenses];
}

/* `savunan` tarafın kulelerine vurulan toplam hasar. Hasarı VURAN taraf
   karşı taraftır; çağıran hangi tarafa yazacağını kendi bilir.
   Bilinmiyorsa null döner — sayı uydurulmaz. */
function hasar(b, savunan) {
  const k = anahtarla(b, savunan);
  const tam = k && tamCan(k);
  if (!tam) return null;
  const [kralTam, prensesTam] = tam;

  const kralKalan = savunan.kingTowerHitPoints;
  if (!Number.isFinite(kralKalan)) return null;
  /* Yıkılan prenses kuleleri dizide HİÇ yer almıyor; ikiden eksik olan
     her kule tam hasar almış demektir. */
  const kalanlar = savunan.princessTowersHitPoints || [];
  if (kalanlar.length > 2) return null;
  const yikilan = 2 - kalanlar.length;

  let toplam = (kralTam - kralKalan) + yikilan * prensesTam;
  for (const v of kalanlar) toplam += prensesTam - v;

  const tavan = kralTam + 2 * prensesTam;
  /* Kendi tablomuza güvenmeden önce aralığı denetliyoruz: yeni bir mod
     çıkıp da kurallar değişirse sessizce saçma bir sayı yazmayalım. */
  if (toplam < 0 || toplam > tavan) return null;
  return { hasar: Math.round(toplam), tavan };
}

/* Maçı öğren ve iki tarafa da vurdukları hasarı yaz. Yalnızca 1v1:
   2v2'de iki oyuncu aynı kuleleri paylaşıyor, hasarı kime yazacağımız
   belli değil (destelerde de aynı sebeple 2v2 sayılmıyor). */
function isle(b) {
  if (!b) return;
  ogren(b);
  const bizim = (b.team || []), karsi = (b.opponent || []);
  if (bizim.length !== 1 || karsi.length !== 1) return;
  const a = hasar(b, karsi[0]);
  const c = hasar(b, bizim[0]);
  if (a) { bizim[0].kuleHasari = a.hasar; bizim[0].kuleHasariTavan = a.tavan; }
  if (c) { karsi[0].kuleHasari = c.hasar; karsi[0].kuleHasariTavan = c.tavan; }
}

function durum() {
  const anahtarlar = Object.keys(db.anahtar);
  return {
    surum: SURUM,
    anahtar: anahtarlar.length,
    hazir: anahtarlar.filter((k) => tamCan(k)).length,
    minOrnek: MIN_ORNEK,
  };
}

yukle();

module.exports = { isle, ogren, hasar, tamCan, durum, MIN_ORNEK, _db: db };
