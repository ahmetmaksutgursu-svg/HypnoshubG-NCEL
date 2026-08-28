/* ============================================================
   HYPNOSHUB — OTOMATİK HABER AKIŞI  🔄
   ------------------------------------------------------------
   Denge değişikliği, güncelleme, sezon duyurusu çıktığında siteye
   kendiliğinden düşsün diye. Kullanıcı isteği: "bir akış olsun,
   dengeleme falan geldiğinde otomatik siteye yapışsın; bir
   yanlışlık olursa elle düzeltirim".

   ------------------------------------------------------------
   KAYNAK NEDEN BURASI

   ÖLÇÜLDÜ, üç seçenek denendi:

     1) Supercell'in kendi akışı — YOK. Blog RSS adresi 404
        veriyor, resmî bir duyuru ucu bulunmuyor.

     2) Kendi kart verimizden türetmek (anlık görüntüleri
        karşılaştırıp "şu değer değişti" demek) — ÇALIŞMAZ:
          ArcherQueen  damage = 0     (hasar mermide)
          ElectroGiant damage = 102   (duyuru 163→184 diyor)
          LittlePrince / Void / Berserker  KAYITTA YOK
        En yeni kartlar kaynakta hiç yok — tam da en sık
        dengelenenler. Bugünkü sekiz değişiklikten biri
        yakalanırdı, onun sayısı da duyurudakiyle tutmazdı.

     3) RoyaleAPI blog akışı — ÇALIŞIYOR. 508 yazı, 110'u denge
        başlıklı, bugünkü ara sezon duyurusu dâhil.

   ------------------------------------------------------------
   METİN ÇEVRİLMİYOR, YENİDEN YAZILIYOR

   İlk sürüm akıştaki İngilizce özeti olduğu gibi basıyordu ve iki
   sorunu vardı: Türkçe bir sitede İngilizce metin, ve başkasının
   yazdığı cümleleri yeniden yayımlamak.

   İkisi de tek hamleyle çözüldü: özetten OLGULAR ayıklanıyor
   (hangi kart, güçlendirme mi zayıflatma mı) ve cümleyi biz
   kuruyoruz. "Okçu Kraliçe güçlendirildi" bir olgu; kimsenin
   cümlesi değil. Kart adları sitenin kendi sözlüğünden geliyor,
   yani haber metnindeki ad sitenin geri kalanıyla aynı.

   Olgu ayıklanamayan yazıda GÖVDE YAZILMIYOR — yalnızca başlık ve
   tarih. Anlamadığımız bir metni çevirmeye çalışmaktansa boş
   bırakmak dürüst.
   ============================================================ */

const AKIS_URL = process.env.HABER_AKIS || "https://royaleapi.com/blog/rss";

/* Kaç saatte bir yoklanacak. Denge duyuruları günde birkaç kez
   çıkmıyor; sık yoklamak kaynağı boşuna meşgul eder. */
const ARALIK_SAAT = Math.max(1, parseInt(process.env.AKIS_SAAT, 10) || 3);

/* Her yoklamada en fazla kaç yeni kayıt eklenir. İlk çalıştırmada
   508 yazının hepsini siteye boca etmemek için: akış geriye dönük
   çok uzun ve eski sezonların duyurusu bugün kimseyi ilgilendirmiyor. */
const EN_FAZLA = Math.max(1, parseInt(process.env.AKIS_ADET, 10) || 5);

/* Bundan eski yazı hiç alınmıyor. */
const EN_ESKI_GUN = Math.max(1, parseInt(process.env.AKIS_GUN, 10) || 45);

/* Özet bu kadarla sınırlı — alıntı dar tutuluyor (yukarıdaki not). */
const OZET_UZUNLUK = 380;

/* Kategori → bizim tür. Sırayla bakılıyor, ilk eşleşen kazanıyor:
   "Balance" hem Balance hem Update taşıyan yazıda öne geçmeli. */
const TUR_ESLEME = [
  [/balance/i, "denge"],
  [/season|event|challenge/i, "etkinlik"],
  [/update|feature|new card|evolution|hero/i, "guncelleme"],
];

/* Başlıklar formülsel; tanınanları Türkçeye çeviriyoruz. Tanınmayan
   kısım İngilizce kalıyor — uydurma çeviri yapmaktansa olduğu gibi
   bırakmak dürüst, yönetici zaten düzeltebiliyor. */
const CEVIRI = [
  [/Final Mid-Season Balance Changes/gi, "Ara Sezon Denge Değişiklikleri"],
  [/Mid-Season Balance Changes/gi, "Ara Sezon Denge Değişiklikleri"],
  [/Final Balance Changes/gi, "Kesinleşen Denge Değişiklikleri"],
  [/Balance Changes/gi, "Denge Değişiklikleri"],
  [/Season Info/gi, "Sezon Bilgisi"],
  [/Leaderboard Decks/gi, "Liderlik Tablosu Desteleri"],
  [/Update/gi, "Güncelleme"],
  [/Evolution/gi, "Evrimi"],
  [/\(Season (\d+)\)/gi, "(Sezon $1)"],
  [/\bSeason (\d+)\b/gi, "Sezon $1"],
  [/\bEnd of\b/gi, "Sonu:"],
  [/\bSeason\b/gi, "Sezon"],
  [/\bJanuary\b/gi, "Ocak"], [/\bFebruary\b/gi, "Şubat"], [/\bMarch\b/gi, "Mart"],
  [/\bApril\b/gi, "Nisan"], [/\bMay\b/gi, "Mayıs"], [/\bJune\b/gi, "Haziran"],
  [/\bJuly\b/gi, "Temmuz"], [/\bAugust\b/gi, "Ağustos"], [/\bSeptember\b/gi, "Eylül"],
  [/\bOctober\b/gi, "Ekim"], [/\bNovember\b/gi, "Kasım"], [/\bDecember\b/gi, "Aralık"],
];

/* Duyuru özetindeki kart listesi: "Archer Queen (Buff)" gibi.
   ÖLÇÜLDÜ: denge yazılarında sekiz kartın hepsi bu kalıpla geliyor,
   denge dışı yazılarda hiç eşleşme yok — yani kalıp aynı zamanda
   "bu bir denge duyurusu mu" sorusunu da cevaplıyor. */
const KART_KALIBI = /([A-Z][A-Za-z.'\u2019 -]{2,28}?)\s*\((Nerf|Buff|Rework|Change)\)/g;

/* "Hero X" / "Evolved X" önekleri: kart sözlüğünde çıplak ad var,
   önek ayrı çevriliyor. */
const ONEK = [
  [/^Hero\s+/i, "Kahraman "],
  [/^Evolved\s+/i, "Evrimli "],
];

const YON_TR = { Nerf: "zayif", Buff: "guclu", Rework: "degisti", Change: "degisti" };

/* Kart adını Türkçeye çevir.

   `adlar` bir MAP — eşzamanlı. İlk yazımda buraya async bir işlev
   geçirmiştim ve çağrı await edilmediği için her ad `[object Promise]`
   oluyordu; üstelik hepsi AYNI dizeye döndüğü için tekrar süzgeci sekiz
   kartı üçe indiriyordu. Sözlük artık çağrıdan ÖNCE çözülüyor. */
function kartAdi(ham, adlar) {
  let onek = "";
  let taban = String(ham || "").trim();
  for (const [re, tr] of ONEK) if (re.test(taban)) { onek = tr; taban = taban.replace(re, ""); break; }
  const tr = (adlar && adlar.get && adlar.get(taban)) || taban;
  return (onek + tr).trim();
}

/* Özetten Türkçe gövde kur. Olgu yoksa boş dize döner.

   HER KART KENDİ SATIRINDA. Önce iki liste hâlinde yazılıyordu
   ("ZAYIFLATILANLAR: a · b · c") ve kullanıcı bildirdi: "hangi
   dengelemenin geldiği yazmıyor, ne buff'ı ne nerf'ü geldiği
   yazsın". Liste biçimi kartı gruba gömüyordu; artık her kartın
   yanında ne olduğu yazıyor.

   SAYISAL AYRINTI YOK ve olamaz — ölçüldü:
     · RSS özeti yalnızca kart adı + (Nerf)/(Buff) veriyor
     · yazının kendisi otomatik erişime kapalı (HTTP 403)
     · akışta content:encoded alanı hiç yok
   Yani "vuruş sıklığı 1,2 sn → 1 sn" satırı buradan gelemez.
   Yönetici o değerleri panelden ekliyor (haber.js → guncelle).
   Uydurmak seçenek değil: yanlış bir denge notu okuyanın destesini
   yanlış kurmasına yol açar. */
function turkceGovde(ozet, adlar) {
  const bulunan = [...String(ozet || "").matchAll(KART_KALIBI)];
  if (!bulunan.length) return "";

  /* Yön etiketi: simge + Türkçe karşılığı + oyuncunun bildiği terim.
     "nerf/buff" parantez içinde duruyor çünkü topluluk bu kelimeleri
     kullanıyor; Türkçesi ise ne olduğunu anlatıyor. */
  const ETIKET = {
    zayif:   { simge: "⬇", ad: "zayıflatıldı (nerf)" },
    guclu:   { simge: "⬆", ad: "güçlendirildi (buff)" },
    degisti: { simge: "↻", ad: "yeniden düzenlendi (rework)" },
  };

  const satirlar = [];
  const gorulen = new Set();
  const sayac = { zayif: 0, guclu: 0, degisti: 0 };

  for (const m of bulunan) {
    const ad = kartAdi(m[1], adlar);
    if (gorulen.has(ad)) continue;          // aynı kart iki kez yazılmasın
    gorulen.add(ad);
    const yon = YON_TR[m[2]] || "degisti";
    sayac[yon]++;
    satirlar.push({ yon, metin: ETIKET[yon].simge + " " + ad + " — " + ETIKET[yon].ad });
  }

  /* Zayıflatılanlar önce: meta değişimini en çok onlar belirliyor,
     okuyucu genelde önce "ne düştü" diye bakıyor. */
  const sira = { zayif: 0, guclu: 1, degisti: 2 };
  satirlar.sort((a, b) => sira[a.yon] - sira[b.yon]);

  const ozetSatiri = [];
  if (sayac.zayif) ozetSatiri.push(sayac.zayif + " zayıflatma");
  if (sayac.guclu) ozetSatiri.push(sayac.guclu + " güçlendirme");
  if (sayac.degisti) ozetSatiri.push(sayac.degisti + " yeniden düzenleme");

  const cikti = [
    gorulen.size + " kart dengelendi — " + ozetSatiri.join(", ") + ".",
    "",
    ...satirlar.map((x) => x.metin),
    "",
    "Hangi özelliğin ne kadar değiştiği oyun içi duyuruda.",
  ];
  return cikti.join("\n");
}
const etiketsiz = (s) => String(s || "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/\s+/g, " ")
  .trim();

/* Tek bir etiketin içeriği. CDATA sarmalı varsa soyuluyor. */
function alan(govde, ad) {
  const m = govde.match(new RegExp("<" + ad + "[^>]*>([\\s\\S]*?)<\\/" + ad + ">"));
  if (!m) return "";
  return m[1].replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").trim();
}

function cevir(baslik) {
  let s = String(baslik || "");
  for (const [re, yeni] of CEVIRI) s = s.replace(re, yeni);
  /* " - " ayracı Türkçe metinde uzun tire olarak daha doğru duruyor. */
  return s.replace(/\s+-\s+/g, " — ").trim();
}

function turBul(kategoriler, baslik) {
  const hepsi = (kategoriler.join(" ") + " " + baslik);
  for (const [re, tur] of TUR_ESLEME) if (re.test(hepsi)) return tur;
  return null;                       // eşleşmeyen yazı ALINMIYOR
}

/* Akışı çöz. Ağ ya da biçim hatası fırlatmıyor: boş liste dönüyor ve
   çağıran yerinde kalıyor — haber akışı sitenin çalışmasını
   engellemeyecek kadar yan bir özellik. */
async function cek(adlar) {
  let ham = "";
  try {
    const c = new AbortController();
    const zaman = setTimeout(() => c.abort(), 15000);
    const r = await fetch(AKIS_URL, {
      signal: c.signal,
      headers: { "User-Agent": "HYPNOSHUB/1.0 (+https://hypnoshub.pro)" },
    });
    clearTimeout(zaman);
    if (!r.ok) { console.warn(`⚠️  Haber akışı ${r.status} döndü.`); return []; }
    ham = await r.text();
  } catch (e) {
    console.warn("⚠️  Haber akışı alınamadı:", String(e).slice(0, 120));
    return [];
  }

  const sinir = Date.now() - EN_ESKI_GUN * 864e5;
  const cikan = [];

  for (const parca of ham.split("<item>").slice(1)) {
    const govde = parca.split("</item>")[0];
    const baslik = etiketsiz(alan(govde, "title"));
    const link = etiketsiz(alan(govde, "link"));
    if (!baslik || !link) continue;

    const tarihHam = alan(govde, "pubDate");
    const d = tarihHam ? new Date(tarihHam) : null;
    if (!d || isNaN(d) || d.getTime() < sinir) continue;

    const kategoriler = [...govde.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/g)]
      .map((m) => etiketsiz(m[1]));
    const tur = turBul(kategoriler, baslik);
    if (!tur) continue;

    /* GÖVDE BİZİM. Özet yalnızca olgu kaynağı olarak okunuyor;
       İngilizce metnin kendisi hiçbir yere yazılmıyor. */
    const ozet = turkceGovde(etiketsiz(alan(govde, "description")), adlar);

    /* TÜRKÇE GÖVDE ÜRETEMEDİYSEK YAYINLAMIYORUZ.

       Kullanıcı isteği açık: "İngilizce metin olmasın". Gövde olgulardan
       kuruluyor; olgu çıkmayan yazıda ya İngilizce özeti basmamız ya da
       gövdesiz başlık bırakmamız gerekirdi. İkisi de kötü — biri dili
       bozuyor, öbürü bilgi taşımayan kayıt üretiyor.

       ÖLÇÜLDÜ: akıştaki ilk beş yazının yalnızca birinde kart listesi
       var (denge duyurusu). Sezon tanıtımı, liderlik tablosu yazısı gibi
       metinlerde kart listesi hiç geçmiyor. Yani süzgeç akışı denge
       duyurularına daraltıyor — zaten istenen buydu. */
    if (!ozet) continue;

    cikan.push({
      tur,
      baslik: cevir(baslik),
      metin: ozet,
      tarih: d.toISOString().slice(0, 10),
      /* Bağlantı SAKLANIYOR ama arayüzde gösterilmiyor: metin bizim
         olduğu için atıf gerekmiyor, yine de kaydın nereden geldiğini
         bilmek tekrar eklemeyi engelliyor (bkz. haber.js otomatikEkle). */
      baglanti: link,
      kaynak: "akis",
      /* Denge duyurusu ana sayfada öne çıksın — en çok aranan bilgi. */
      one: tur === "denge",
    });
  }

  /* Yeniden eskiye, en fazla EN_FAZLA tane. */
  cikan.sort((a, b) => b.tarih.localeCompare(a.tarih));
  return cikan.slice(0, EN_FAZLA);
}

/* Yoklamayı başlat. `haber` modülü dışarıdan veriliyor ki bu dosya
   depoyu bilmek zorunda kalmasın. */
function basla(haber, adSaglayici) {
  const tur = async () => {
    /* Sözlük her turda tazeden çözülüyor: yeni kart eklendiğinde
       sunucuyu yeniden başlatmaya gerek kalmasın. */
    let adlar = null;
    try { adlar = adSaglayici ? await adSaglayici() : null; } catch { adlar = null; }
    const bulunan = await cek(adlar);
    if (!bulunan.length) return;
    let eklenen = 0;
    for (const h of bulunan) if (haber.otomatikEkle(h)) eklenen++;
    if (eklenen) console.log(`🔄  Haber akışı: ${eklenen} yeni kayıt eklendi.`);
  };
  /* Açılışta hemen bir kez — sunucu yeni kurulduğunda akış boş kalmasın.
     Biraz gecikmeli, çünkü açılışta zaten çok iş var. */
  setTimeout(tur, 20e3).unref();
  setInterval(tur, ARALIK_SAAT * 3600e3).unref();
  console.log(`🔄  Haber akışı açık: ${ARALIK_SAAT} saatte bir, en fazla ${EN_FAZLA} kayıt.`);
}

module.exports = { cek, basla, cevir, AKIS_URL, ARALIK_SAAT };
