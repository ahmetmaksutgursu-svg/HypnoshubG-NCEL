/* ============================================================
   HYPNOSHUB — EN İYİ SEZONA GÖRE PRO
   ------------------------------------------------------------
   Kural: Nihai Kademe'de EN İYİ sezonunda 2200 madalyona ulaşmış
   oyuncu PRO sayılır. Mevcut kurallara EK — hiçbiri kaldırılmadı:
     · dünya ilk 100 (canlı sıralama)
     · elle verilen / listede sabit PRO
     · BU sezon 3000+ madalyon

   NEDEN AYRI BİR MODÜL: "en iyi sezon" yalnızca /players/{tag}
   yanıtında var. Savaş günlüğünde, canlı akışta ve arama sonucunda o
   alan YOK; oralarda rozet basmak için her oyuncu adına ayrı bir profil
   isteği atmak gerekirdi (canlı akışta tek tazelemede yüzlerce istek).

   Onun yerine: bir profil ne zaman okunursa okunsun, barajı geçtiyse
   etiketi buraya yazılıyor. Böylece o oyuncu bir daha nerede görünürse
   görünsün — savaş listesinde, akışta, aramada — rozeti çıkıyor. Ek API
   maliyeti YOK; zaten yapılan isteğin yan ürünü.

   ÖLÇÜM (ilk 30 klanın 150 üyesi, sıradan oyuncular): baraj 2200'de
   150 kişiden 9'u (%6) geçiyor, ortanca en iyi sezon 1706. Aynı
   örneklemde mevcut kurallarla PRO olan kimse yoktu. Yani rozet
   seçiciliğini koruyor.
   ============================================================ */
const fs = require("fs");
const { veriYolu } = require("./veriyolu");
const verified = require("./verified");

const SURUM = 1;
const DOSYA = veriYolu("prosezon.json");

/* Baraj verified.js'de duruyor: PRO ile ilgili bütün eşikler tek yerde
   olsun, birini değiştirip diğerini unutmayalım. */
const BARAJ = verified.PRO_MIN_BEST;

let kume = new Set();

function yukle() {
  try {
    const d = JSON.parse(fs.readFileSync(DOSYA, "utf8"));
    if (!d || d.surum !== SURUM) return;
    /* Baraj sonradan YÜKSELTİLİRSE eski kayıtlar geçersizdir. Değeri de
       saklayıp karşılaştırıyoruz; yoksa 2200'den 2500'e çıkıldığında
       eski liste sessizce hak etmeyenlere rozet vermeye devam ederdi. */
    if (d.baraj !== BARAJ) {
      console.log(`ℹ️  PRO barajı değişti (${d.baraj} → ${BARAJ}); sezon listesi sıfırlandı.`);
      return;
    }
    kume = new Set(d.etiketler || []);
    if (kume.size) console.log(`🎖️  Sezon PRO listesi yüklendi (${kume.size} oyuncu).`);
  } catch { /* ilk çalıştırma */ }
}

let yazZaman = null;
function kaydet() {
  clearTimeout(yazZaman);
  yazZaman = setTimeout(() => {
    try {
      const tmp = DOSYA + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify({ surum: SURUM, baraj: BARAJ, etiketler: [...kume] }));
      fs.renameSync(tmp, DOSYA);
    } catch (e) { console.warn("⚠️  Sezon PRO listesi kaydedilemedi:", String(e)); }
  }, 3000);
}

/* Bir profil yanıtından öğren. Barajın ALTINDA kalan silinmiyor: en iyi
   sezon geçmişe ait bir başarı, sonradan düşmez. Silmek gerekseydi bu
   ancak baraj değişince anlamlı olurdu, onu da yukarıda ele alıyoruz. */
function ogren(body) {
  if (!body || !body.tag) return false;
  const enIyi = body.bestPathOfLegendSeasonResult?.trophies;
  if (!Number.isFinite(enIyi) || enIyi < BARAJ) return false;
  const t = verified.normTag(body.tag);
  if (kume.has(t)) return true;
  kume.add(t);
  kaydet();
  return true;
}

const varMi = (tag) => kume.has(verified.normTag(tag));

const durum = () => ({ surum: SURUM, baraj: BARAJ, oyuncu: kume.size });

yukle();

module.exports = { ogren, varMi, durum, BARAJ };
