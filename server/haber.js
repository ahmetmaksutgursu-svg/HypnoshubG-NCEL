/* ============================================================
   HYPNOSHUB — CLASH ROYALE HABERLERİ  📰
   ------------------------------------------------------------
   Oyundaki denge değişiklikleri, güncellemeler, etkinlikler ve
   "bir sonraki güncellemede ne geliyor" — ana sayfada ve
   Güncellemeler sayfasında görünen akış.

   AKIŞ OYUNLA İLGİLİ. Başta bir de "site" türü vardı (sitenin
   kendi sürüm notları) ve kaldırıldı: kullanıcı "site haberleri
   olmasın, başlık Clash Royale haberler" dedi. Bölüm oyuncuya
   OYUNU anlatıyor; sitenin kendi notları oraya karışınca akış
   amacından sapıyordu.

   ------------------------------------------------------------
   NEDEN ELLE GİRİLİYOR

   Clash Royale'in denge değişiklikleri için AÇIK BİR UÇ YOK.
   Supercell bunları duyuruyla yayımlıyor; API yalnızca kartların
   GÜNCEL hâlini veriyor, neyin değiştiğini değil.

   Üç seçenek vardı:
     1) Başka bir siteden kazımak — kırılgan, ve başkasının
        yazdığı metni izinsiz yeniden yayımlamak olurdu.
     2) Uydurmak — kesinlikle hayır. Yanlış bir denge notu,
        okuyanın destesini yanlış kurmasına yol açar.
     3) Yöneticinin yazması — doğru olan bu. Siteyi işleten kişi
        oyunu zaten takip ediyor ve duyuruyu kopyalayıp
        yapıştırabiliyor.

   Üçüncüsü seçildi. Kaynak belli, sorumluluk belli.

   ------------------------------------------------------------
   BİÇİM

     tur   : "denge" | "guncelleme" | "yakinda" | "etkinlik"
     baslik, metin, tarih (ISO), kimlik
     one   : ana sayfada öne çıksın mı

   `metin` ÇOK SATIRLI olabiliyor ve satır sonları korunuyor —
   denge duyuruları liste hâlinde geliyor, yöneticinin duyuruyu
   olduğu gibi yapıştırabilmesi gerekiyor.

   Dosya kalıcı diskte (DATA_DIR); yedeklemeye de dahil.
   ============================================================ */
const fs = require("fs");
const crypto = require("crypto");
const { veriYolu } = require("./veriyolu");

const DOSYA = veriYolu("haberler.json");

/* Ana sayfada en fazla kaç tane gösterilecek. Üç: kutucuk sayfanın
   geri kalanını ezmeden bir bakışta okunuyor. */
const ANASAYFA_ADET = 3;

const MAX_BASLIK = 120;
/* Denge notları uzun: tek bir ara sezon duyurusu sekiz kart artı hata
   düzeltmeleri demek (ölçüldü, ~900 karakter). 4000 rahat yer bırakıyor
   ama tek girdinin sayfayı ele geçirmesini de engelliyor. */
const MAX_METIN = 4000;

const TURLER = new Set(["denge", "guncelleme", "yakinda", "etkinlik"]);

let db = { haberler: [] };

/* İLK KAYIT — ara sezon denge duyurusu, sayısal ayrıntılarıyla.

   Bu metin akıştan GELEMİYOR: RSS özeti yalnızca kart adı ve
   nerf/buff veriyor, yazının kendisi otomatik erişime kapalı (403).
   Sayılar oyun içi duyuruda ve kullanıcı onu iletti; duyuru.js ile
   ayrıştırılıp buraya gömüldü. Uydurulmuş tek bir sayı yok.

   BAĞLANTI AKIŞTAKİYLE AYNI. otomatikEkle bağlantıya bakıp aynı
   yazıyı iki kez eklemiyor, yani akış bu duyuruyu getirdiğinde
   çift kayıt oluşmuyor — ayrıntısız hâli ayrıntılının üstüne de
   yazmıyor.

   `duzenlendi` damgası kasıtlı: göç kuralı elle tamamlanmış kayda
   dokunmuyor, yani ileride bir biçim değişikliği bunu silmiyor.

   Bundan sonraki duyurular panelden giriliyor: metni yapıştır,
   "⚖️ Duyuruyu düzenle"ye bas, yayınla. */
const TOHUM = [
  {
    tur: "denge", one: true, tarih: "2026-08-26",
    baslik: "Ara Sezon Denge Değişiklikleri — Ağustos 2026 (Sezon 86)",
    baglanti: "https://royaleapi.com/blog/season-86-balance-mid-season-august-2026",
    kaynak: "akis",
    /* `tohum` işareti, `duzenlendi` damgasının KİMDEN geldiğini
       ayırıyor. Damga tek başına yetmiyordu: önceki başlangıç kaydı
       da damga bırakıyor ve birleştirme onu "yönetici elle yazmış"
       sanıp güncellemeyi atlıyordu — canlıda tam bu oldu, düzeltilmiş
       metin gitmedi. */
    tohum: true,
    duzenlendi: "2026-08-26T13:00:00.000Z",
    metin: [
      "8 kart dengelendi — 4 zayıflatma, 4 güçlendirme.",
      "",
      "⬇ Kahraman Yaramaz — zayıflatıldı (nerf)",
      "   • Yetenek Süresi: 4saniye → 3.5saniye (-13%)",
      "",
      "⬇ Evrimli Elit Barbarlar — zayıflatıldı (nerf)",
      "   • Mızrak Hasarı: 284 → 220 (-23%)",
      "   • Öfke Süresi: 3.5saniye → 2.5saniye (-29%)",
      "",
      "⬇ Goblinstein — zayıflatıldı (nerf)",
      "   • Canavar Can Puanı: 2385 → 2240 (-6%)",
      "",
      "⬇ Elektro Ruh — zayıflatıldı (nerf)",
      "   • Zincir Menzili: 4 kare → 3 kare (-25%)",
      "",
      "⬆ Okçu Kraliçe — güçlendirildi (buff)",
      "   • Hasar: 225 → 232 (+3%)",
      "",
      "⬆ Küçük Prens — güçlendirildi (buff)",
      "   • Hücum Hasarı: 256 → 320 (+25%)",
      "",
      "⬆ Elektro Dev — güçlendirildi (buff)",
      "   • Hasar: 163 → 184 (+13%)",
      "",
      "⬆ Boşluk — güçlendirildi (buff)",
      "   • Vuruş Sıklığı: 1.2saniye → 1saniye (-17%)",
      "",
      "HATA DÜZELTMELERİ",
      "• Zehir artık doğru kule hasarını veriyor",
      "• Kahraman Büyülü Okçu'nun Üçlü Atışı artık doğru hasarı veriyor",
      "• Evrimli Duvar Yıkıcılar'ın patlaması artık doğru kule hasarını veriyor",
    ].join("\n"),
  },
];

function yukle() {
  try {
    const ham = JSON.parse(fs.readFileSync(DOSYA, "utf8"));
    if (Array.isArray(ham.haberler)) db = ham;
    /* ESKİ "site" KAYITLARINI TEMİZLE. Tür kaldırıldı; dosyada kalanlar
       arayüzde etiketsiz görünürdü. Bir kez süzülüp geri yazılıyor. */
    const once = db.haberler.length;
    db.haberler = db.haberler.filter((h) => TURLER.has(h.tur));

    /* İNGİLİZCE KALMIŞ OTOMATİK KAYITLARI DÜŞÜR.

       Akış önce kaynağın İngilizce özetini basıyordu; sonra metin
       olgulardan Türkçe kurulmaya başladı. Ama otomatikEkle aynı
       BAĞLANTIYI iki kez eklemediği için eski İngilizce kayıtlar
       yerinde kalıyordu — canlıda tam bu oldu, yeni sürüm dağıtıldı
       ama sayfada hâlâ İngilizce metin duruyordu.

       Düşürülenler akış bir sonraki turda Türkçe hâliyle yeniden
       ekliyor; bağlantı da onlarla birlikte gittiği için tekrar
       süzgeci engel olmuyor.

       ELLE DÜZENLENMİŞ KAYDA DOKUNULMUYOR: `duzenlendi` damgası varsa
       metin yöneticinindir, Türkçe kalıba uymasa bile korunuyor.
       Kullanıcının yazdığını silmek, bir göç kuralının yapabileceği
       en kötü şey olurdu. */
    const turkceMi = (m) =>
      /kart dengelendi|zayıflatıldı|güçlendirildi|yeniden düzenlendi/.test(String(m || ""));
    const oncekiOtomatik = db.haberler.length;
    db.haberler = db.haberler.filter((h) =>
      !h.kaynak || h.duzenlendi || turkceMi(h.metin));
    if (db.haberler.length !== oncekiOtomatik)
      console.log(`📰  ${oncekiOtomatik - db.haberler.length} İngilizce kalmış otomatik kayıt düşürüldü.`);
    if (db.haberler.length !== once) {
      console.log(`📰  ${once - db.haberler.length} eski site kaydı akıştan çıkarıldı.`);
      if (!db.haberler.length) db.haberler = TOHUM.map((t, i) => ({ ...t, kimlik: "tohum" + i }));
      kaydet();
    }
    tohumuBirlestir();
    console.log(`📰  Haberler yüklendi (${db.haberler.length} kayıt).`);
  } catch {
    db = { haberler: TOHUM.map((t, i) => ({ ...t, kimlik: "tohum" + i })) };
    kaydet();
    console.log(`📰  Haber dosyası oluşturuldu (${db.haberler.length} kayıt).`);
  }
  return db;
}

/* TOHUMU VAR OLAN DOSYAYLA BİRLEŞTİR.

   Tohum yalnızca dosya YOKKEN uygulanıyordu ve canlıda bu yetmedi:
   akış duyuruyu ayrıntısız hâliyle çoktan eklemişti, dosya vardı,
   tohum hiç devreye girmedi. Sonuç — yerelde ayrıntılı, canlıda
   ayrıntısız metin.

   Kural: aynı BAĞLANTIYA sahip kayıt varsa ve o kayıt sunucuda ELLE
   DÜZENLENMEMİŞSE, tohumun metni geçerli sayılıyor. Yönetici panelden
   bir şey yazdıysa (`duzenlendi` damgası) dokunulmuyor — kullanıcının
   yazdığını bir başlangıç kaydının ezmesi kabul edilemez.

   Bağlantısı hiç bulunmayan tohum kaydı eklenir. */
function tohumuBirlestir() {
  for (const t of TOHUM) {
    const varOlan = t.baglanti && db.haberler.find((h) => h.baglanti === t.baglanti);
    if (!varOlan) {
      db.haberler.push({ ...t, kimlik: "tohum" + db.haberler.length });
      kaydet();
      console.log(`📰  Başlangıç kaydı eklendi: ${t.baslik}`);
      continue;
    }
    /* ELLE YAZILMIŞA DOKUNMA. Ölçüt `elle` işareti — onu yalnızca
       yönetici ucu koyuyor (guncelle). Başlangıç kaydının kendi
       damgası bu işareti taşımadığı için güncellenebiliyor. */
    if (varOlan.elle) continue;
    if (varOlan.metin === t.metin) continue;                                   // zaten aynı
    varOlan.metin = t.metin;
    varOlan.baslik = t.baslik;
    varOlan.duzenlendi = t.duzenlendi;
    varOlan.tohum = true;
    kaydet();
    console.log(`📰  Başlangıç kaydı ayrıntılarıyla güncellendi: ${t.baslik}`);
  }
}

function kaydet() {
  try {
    const tmp = DOSYA + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DOSYA);          // yarıda kesilirse bozuk dosya kalmasın
  } catch (e) { console.warn("⚠️  Haberler kaydedilemedi:", String(e)); }
}

const kirp = (s, n) => String(s == null ? "" : s).trim().slice(0, n);

/* Yeniden eskiye. Aynı gün birden çok kayıt varsa ekleniş sırası
   korunuyor (kimlik zaman damgalı). */
function sirali() {
  return db.haberler.slice().sort((a, b) =>
    String(b.tarih).localeCompare(String(a.tarih)) ||
    String(b.kimlik).localeCompare(String(a.kimlik)));
}

function liste({ adet, tur } = {}) {
  let l = sirali();
  if (tur && TURLER.has(tur)) l = l.filter((h) => h.tur === tur);
  if (adet) l = l.slice(0, adet);
  return l;
}

/* Ana sayfa: önce "öne çıkar" işaretliler, sonra en yeniler. */
function anasayfa() {
  const hepsi = sirali();
  const one = hepsi.filter((h) => h.one);
  const kalan = hepsi.filter((h) => !h.one);
  return [...one, ...kalan].slice(0, ANASAYFA_ADET);
}

function ekle({ tur, baslik, metin, tarih, one }) {
  const b = kirp(baslik, MAX_BASLIK);
  /* Satır sonları KORUNUYOR: denge duyuruları liste hâlinde geliyor ve
     yönetici olduğu gibi yapıştırıyor. Yalnızca baştaki/sondaki boşluk
     kırpılıyor, Windows satır sonu tekilleştiriliyor. */
  const m = String(metin == null ? "" : metin).replace(/\r\n/g, "\n").trim().slice(0, MAX_METIN);
  if (!b) return { hata: "baslik" };
  if (!TURLER.has(tur)) return { hata: "tur" };
  let t = kirp(tarih, 10) || new Date().toISOString().slice(0, 10);
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(t) || isNaN(new Date(t))) return { hata: "tarih" };

  const h = {
    kimlik: Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
    tur, baslik: b, metin: m, tarih: t, one: !!one,
  };
  db.haberler.push(h);
  kaydet();
  return { ok: true, haber: h };
}

/* OTOMATİK KAYIT — akıştan gelen (bkz. akis.js).

   AYNI YAZI İKİ KEZ EKLENMİYOR: ölçüt bağlantı. Akış her yoklamada
   aynı yazıları yeniden veriyor, kimlikle ayırt etseydik site her üç
   saatte bir aynı duyuruyu tekrar yayımlardı.

   ELLE DÜZELTME KORUNUYOR. Kullanıcı "bir yanlışlık olursa elle
   düzeltirim" dedi; o yüzden var olan bir kayıt ASLA üzerine
   yazılmıyor. Akış aynı yazıyı tekrar getirse bile düzeltilmiş metin
   yerinde kalıyor.

   Geriye eklendi mi bilgisi dönüyor. */
function otomatikEkle(h) {
  const link = kirp(h && h.baglanti, 300);
  if (!link) return false;
  if (db.haberler.some((x) => x.baglanti === link)) return false;

  const r = ekle(h);
  if (!r.ok) return false;
  r.haber.baglanti = link;
  r.haber.kaynak = kirp(h.kaynak, 40) || "akis";
  kaydet();
  return true;
}

/* DÜZENLE — otomatik gelen kaydı elle tamamlamak için.

   Akış sayısal ayrıntı vermiyor: RSS özetinde yalnızca kart adı ve
   zayıflatma/güçlendirme yönü var, yazının kendisi otomatik erişime
   kapalı (403). Kullanıcı "bir yanlışlık olursa elle düzeltirim" dedi
   ama düzenleme işlevi YOKTU — yalnızca ekle/sil vardı, yani düzeltmek
   için kaydı silip baştan yazmak gerekiyordu.

   Verilmeyen alan DEĞİŞMİYOR: yönetici yalnızca metni güncellemek
   isteyebilir, o zaman tür ve tarihin bozulmaması gerekiyor. */
function guncelle(kimlik, yeni) {
  const h = db.haberler.find((x) => x.kimlik === String(kimlik));
  if (!h) return { hata: "yok" };

  if (yeni.baslik != null) {
    const b = kirp(yeni.baslik, MAX_BASLIK);
    if (!b) return { hata: "baslik" };
    h.baslik = b;
  }
  if (yeni.metin != null)
    h.metin = String(yeni.metin).replace(/\r\n/g, "\n").trim().slice(0, MAX_METIN);
  if (yeni.tur != null) {
    if (!TURLER.has(yeni.tur)) return { hata: "tur" };
    h.tur = yeni.tur;
  }
  if (yeni.tarih != null) {
    const t = kirp(yeni.tarih, 10);
    if (!/^d{4}-d{2}-d{2}$/.test(t) || isNaN(new Date(t))) return { hata: "tarih" };
    h.tarih = t;
  }
  if (yeni.one != null) h.one = !!yeni.one;

  /* İNSAN ELİ İŞARETİ.

     `elle` YALNIZCA BURADAN konuyor ve bu işlev yalnızca yönetici
     ucundan çağrılıyor — yani işaret "bir insan bu metni yazdı"
     demek. Başlangıç kaydı birleştirmesi buna bakıyor.

     Önce `duzenlendi` damgasına bakılıyordu ve YETMEDİ: başlangıç
     kaydı da damga bırakıyor, dolayısıyla kendi yazdığı kaydı
     "insan yazmış" sanıp bir daha güncelleyemiyordu. Canlıda tam
     bu oldu — düzeltilmiş metin iki dağıtım boyunca gitmedi.

     `duzenlendi` yine tutuluyor: panelde ne zaman düzeltildiğini
     göstermek için. */
  h.duzenlendi = new Date().toISOString();
  h.elle = true;
  kaydet();
  return { ok: true, haber: h };
}

function sil(kimlik) {
  const i = db.haberler.findIndex((h) => h.kimlik === String(kimlik));
  if (i < 0) return { hata: "yok" };
  const [h] = db.haberler.splice(i, 1);
  kaydet();
  return { ok: true, haber: h };
}

module.exports = { yukle, liste, anasayfa, ekle, otomatikEkle, guncelle, sil, TURLER, ANASAYFA_ADET, DOSYA };
