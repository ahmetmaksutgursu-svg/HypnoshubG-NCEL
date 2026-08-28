/* ============================================================
   HYPNOSHUB — DENGE DUYURUSU AYRIŞTIRICI  ⚖️
   ------------------------------------------------------------
   Oyun içi denge duyurusunu OLDUĞU GİBİ yapıştır, düzenli bir
   liste çıksın.

   ------------------------------------------------------------
   NEDEN ELLE YAPIŞTIRMA

   Sayısal ayrıntı otomatik gelmiyor; üç yol da ölçüldü:
     · RSS özeti  → yalnızca kart adı + (Nerf)/(Buff), sayı yok
     · yazının kendisi → HTTP 403, otomatik erişime kapalı
     · akışta content:encoded alanı → hiç yok
     · kendi kart verimiz → yeni kartlar kayıtta yok, ölçek farklı

   Ama duyuru zaten oyunun içinde ve TÜRKÇE. Siteyi işleten kişi
   her sezon onu görüyor. O yüzden iş "veriyi bulmak" değil,
   "yapıştırmayı zahmetsiz kılmak".

   ------------------------------------------------------------
   TANIDIĞI BİÇİM

     Berserker Kahramanı ⬇️
     - Yetenek Süresi: 4saniye → 3.5saniye (-13%)

     Okçu Kraliçe ⬆️
     - Hasar: 225 → 232 (+3%)

     Hata Düzeltmeleri:
     🐛 Zehir artık doğru kule hasarını veriyor

   Yön simgesi (⬇️⬆️), "(Nerf)/(Buff)" ya da yüzdenin işareti —
   üçünden hangisi varsa ondan okunuyor. Duyurunun biçimi sezondan
   sezona az da olsa değişiyor; tek bir işarete bağlanmak kırılgan
   olurdu.

   ------------------------------------------------------------
   KART ADLARI DÜZELTİLİYOR

   Duyuruda "Berserker Kahramanı", "Duvar Kırıcı" gibi adlar
   geçiyor; sitenin sözlüğünde bunlar "Yaramaz", "Duvar Yıkıcılar".
   Haber metnindeki ad sitenin geri kalanıyla AYNI olmak zorunda,
   yoksa okuyucu iki ayrı kart sanıyor. Sözlük dışarıdan veriliyor.
   ============================================================ */

/* Yön simgeleri ve karşılıkları. */
const ASAGI = /[⬇↓]/;         // ⬇️ ↓
const YUKARI = /[⬆↑]/;        // ⬆️ ↑

/* Terimler İKİ ÜRETİCİDE DE aynı olmak zorunda: bu dosya yapıştırılan
   duyuruyu, akis.js ise RSS özetini işliyor ve ikisi aynı akışta yan yana
   görünüyor. Farklı yazsalardı okuyucu iki ayrı sistem sanırdı.

   "(nerf)/(buff)" parantez içinde duruyor çünkü oyuncular bu kelimeleri
   kullanıyor; Türkçesi ise ne olduğunu anlatıyor. */
const ETIKET = {
  zayif:   { simge: "⬇", ad: "zayıflatıldı (nerf)" },
  guclu:   { simge: "⬆", ad: "güçlendirildi (buff)" },
  degisti: { simge: "↻", ad: "yeniden düzenlendi (rework)" },
};

/* Hata düzeltmeleri bölümünün başlangıcı. */
const HATA_BASLIK = /^(hata\s*d[üu]zeltme|bug\s*fix)/i;

/* Ayrıntı satırı: "- Hasar: 225 → 232 (+3%)" */
const AYRINTI = /^[-•·*]\s*(.+)$/;

/* Kart satırındaki süs karakterlerini at.

   YÖN ETİKETİ DE DÜŞÜYOR: duyuru bazen "Kıvılcım (Rework)" yazıyor ve
   o parantez adın parçası değil, yönün kendisi. Ekranda "Kıvılcım
   (Rework) — yeniden düzenlendi (rework)" çıkıyordu. Yön zaten ayrıca
   okunuyor (yonBul), burada yalnızca addan temizleniyor. */
const temizle = (s) => String(s || "")
  .replace(/\((?:nerf|buff|rework|change)\)/gi, " ")
  .replace(/[⬇⬆↓↑️\u{1f41b}]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

/* DUYURUDA GEÇEN AMA SÖZLÜĞE UYMAYAN ADLAR.

   Oyun içi duyuru ile sitenin kart sözlüğü her zaman aynı yazımı
   kullanmıyor. Ölçüldü, gerçek duyuruda üç tanesi çıktı:

     duyuru               sözlük
     Elite Barbarlar   →  Elit Barbarlar     (yarı İngilizce yazım)
     Berserker         →  Yaramaz            (hiç çevrilmemiş)
     Sihirbaz Okçu     →  Büyülü Okçu        (başka çeviri)
     Duvar Kırıcı      →  Duvar Yıkıcılar    (tekil/çoğul + fiil)

   Bunlar hem kart başlığında hem HATA DÜZELTME cümlelerinin içinde
   geçebiliyor, o yüzden metnin tamamına uygulanıyor.

   Liste elle tutuluyor ve tutulmalı: bulanık eşleştirme burada
   tehlikeli olurdu — yanlış eşleşen bir kart adı, denge notunu
   başka bir kart hakkındaymış gibi gösterir. Yeni bir uyumsuzluk
   çıkarsa buraya bir satır eklenir. */
/* SÖZCÜK SINIRI \b DEĞİL, UNICODE BAKIŞI.

   İlk yazımda \b kullandım ve Türkçe adlarda ÇALIŞMADI: JavaScript'te
   \b, ASCII sözcük karakterine göre tanımlı ve ı, ş, ç, ğ, ö, ü bunlara
   dâhil DEĞİL. "Duvar Kırıcı" sonundaki \b, ı harfinden sonra sınır
   bulamadığı için eşleşme hiç olmuyordu — ölçüldü, metin olduğu gibi
   kalmıştı. "Berserker" (tamamen ASCII) çalışıyordu ve bu, hatayı
   fark etmeyi zorlaştırıyordu.

   (?<![\p{L}]) / (?![\p{L}]) her alfabede doğru çalışıyor; u bayrağı
   şart. Böylece "Kırıcı'nın" gibi ekli hâller de yakalanıyor. */
const S_ONCE = "(?<![\\p{L}])";
const S_SONRA = "(?![\\p{L}])";
const kalip = (govde) => new RegExp(S_ONCE + govde + S_SONRA, "giu");

const TAKMA_AD = [
  [kalip("Elite\\s+Barbarlar"), "Elit Barbarlar"],
  [kalip("Berserker"), "Yaramaz"],
  [kalip("Sihirbaz\\s+Okçu"), "Büyülü Okçu"],
  [kalip("Duvar\\s+Kırıcı"), "Duvar Yıkıcılar"],
  [kalip("Evrilmiş"), "Evrimli"],
];

/* KAYNAŞTIRMA ÜNSÜZÜ. Türkçede ekten önce gelen n, sözcük ÜNLÜYLE
   bittiğinde kullanılıyor: "Kırıcı'nın" ama "Yıkıcılar'ın".

   Ad değiştirince ek uyumsuz kalıyordu: ölçüldü, "Duvar Kırıcı'nın"
   → "Duvar Yıkıcılar'nın" çıkıyordu. Kural dar tutuldu — yalnızca
   kesme işaretinden sonra gelen n+ünlü kalıbı, ve yalnızca yeni ad
   ÜNSÜZLE bitiyorsa. Türkçe ek uyumunun tamamını çözmeye
   kalkışmıyoruz; bu tek kalıp gerçek metinde karşımıza çıktı. */
const UNLU = /[aeıioöuüAEIİOÖUÜ]$/;

function ekiDuzelt(yeniAd, kalan) {
  /* kalan: adın hemen ardından gelen metin, ör. "'nın patlaması" */
  if (UNLU.test(yeniAd)) return kalan;                 // ünlüyle bitiyor, n yerinde
  return kalan.replace(/^'n([aeıioöuü])/i, "'$1");     // ünsüz: kaynaştırma n düşer
}

function takmaAdlariDuzelt(metin) {
  let s = String(metin || "");
  for (const [re, dogru] of TAKMA_AD) {
    s = s.replace(re, dogru);
    /* Değiştirilen adın hemen ardındaki eki uyumla. */
    /* Değiştirilen adın hemen ardındaki eki uyumla. */
    const kacir = (x) => x.split("").map((ch) =>
      ".*+?^${}()|[]\\".includes(ch) ? "\\" + ch : ch).join("");
    const ekRe = new RegExp(kacir(dogru) + "('n[aeıioöuü][^ ]*)", "giu");
    s = s.replace(ekRe, (tam, kalan) => dogru + ekiDuzelt(dogru, kalan));
    s = s.replace(ekRe, (tam, kalan) => dogru + ekiDuzelt(dogru, kalan));
  }
  return s;
}

/* Duyuruda geçen ad → sitenin sözlüğündeki ad.

   Önek ayrı ele alınıyor: sözlükte "Yaramaz" var, "Kahraman Yaramaz"
   yok. Aynı şekilde "Evrimli"/"Evrim". */
const ONEKLER = [
  [/^kahraman\s+/i, "Kahraman "],
  [/\s+kahraman[ıi]?$/i, "Kahraman "],
  [/^evrimli\s+/i, "Evrimli "],
  [/\s+evrimi?$/i, "Evrimli "],
];

function kartAdiDuzelt(ham, sozluk) {
  let taban = takmaAdlariDuzelt(temizle(ham));
  let onek = "";
  for (const [re, tr] of ONEKLER) {
    if (re.test(taban)) { onek = tr; taban = taban.replace(re, "").trim(); break; }
  }
  if (sozluk) {
    /* Doğrudan Türkçe ad eşleşiyor mu; yoksa İngilizce addan çevir. */
    const dogrudan = sozluk.trTr && sozluk.trTr.get(taban.toLocaleLowerCase("tr"));
    if (dogrudan) return (onek + dogrudan).trim();
    const ingden = sozluk.enTr && sozluk.enTr.get(taban.toLowerCase());
    if (ingden) return (onek + ingden).trim();
  }
  return (onek + taban).trim();
}

/* Bir kart satırının yönünü bul. */
function yonBul(satir, ayrintilar) {
  if (ASAGI.test(satir)) return "zayif";
  if (YUKARI.test(satir)) return "guclu";
  if (/\(nerf\)/i.test(satir)) return "zayif";
  if (/\(buff\)/i.test(satir)) return "guclu";
  /* Simge yoksa yüzdenin işaretine bak: "(+3%)" güçlendirme,
     "(-13%)" zayıflatma. Ayrıntı satırlarının çoğunluğu karar veriyor. */
  let arti = 0, eksi = 0;
  for (const a of ayrintilar) {
    if (/\(\s*\+\s*\d/.test(a)) arti++;
    else if (/\(\s*[-−]\s*\d/.test(a)) eksi++;
  }
  if (arti > eksi) return "guclu";
  if (eksi > arti) return "zayif";
  return "degisti";
}

/* Ham duyuru metni → düzenli Türkçe gövde.
   `sozluk` = { trTr: Map(küçük harf TR → TR), enTr: Map(küçük harf EN → TR) } */
function ayristir(ham, sozluk) {
  const satirlar = String(ham || "").replace(/\r\n/g, "\n").split("\n").map((x) => x.trim());

  const kartlar = [];
  const hatalar = [];
  let hataBolumu = false;
  let simdiki = null;

  const bitir = () => {
    if (simdiki && simdiki.ayrinti.length) kartlar.push(simdiki);
    else if (simdiki && simdiki.yonBelli) kartlar.push(simdiki);
    simdiki = null;
  };

  for (const satir of satirlar) {
    if (!satir) continue;

    if (HATA_BASLIK.test(satir.replace(/[:\s]+$/, ""))) { bitir(); hataBolumu = true; continue; }

    const ay = satir.match(AYRINTI);
    if (hataBolumu) {
      const t = takmaAdlariDuzelt(temizle(ay ? ay[1] : satir));
      if (t) hatalar.push(t);
      continue;
    }

    if (ay && simdiki) { simdiki.ayrinti.push(takmaAdlariDuzelt(temizle(ay[1]))); continue; }
    if (ay) continue;                      // sahipsiz ayrıntı — atla

    /* Kart satırı olabilir. Cümle gibi görünen uzun satırları eleme:
       duyurunun giriş paragrafı kart sanılmasın. */
    const yonVar = ASAGI.test(satir) || YUKARI.test(satir) || /\((nerf|buff)\)/i.test(satir);
    const kisa = temizle(satir).length <= 40 && temizle(satir).split(" ").length <= 5;
    if (!yonVar && !kisa) continue;

    bitir();
    simdiki = { hamAd: satir, ayrinti: [], yonBelli: yonVar };
  }
  bitir();

  if (!kartlar.length && !hatalar.length) return "";

  /* --- metni kur --- */
  const govde = [];
  const sayac = { zayif: 0, guclu: 0, degisti: 0 };
  const parcalar = [];

  for (const k of kartlar) {
    const yon = yonBul(k.hamAd, k.ayrinti);
    sayac[yon]++;
    const ad = kartAdiDuzelt(k.hamAd, sozluk);
    const e = ETIKET[yon];
    const bas = e.simge + " " + ad + " — " + e.ad;
    parcalar.push({ yon, satirlar: [bas, ...k.ayrinti.map((a) => "   • " + a)] });
  }

  const sira = { zayif: 0, guclu: 1, degisti: 2 };
  parcalar.sort((a, b) => sira[a.yon] - sira[b.yon]);

  const ozet = [];
  if (sayac.zayif) ozet.push(sayac.zayif + " zayıflatma");
  if (sayac.guclu) ozet.push(sayac.guclu + " güçlendirme");
  if (sayac.degisti) ozet.push(sayac.degisti + " yeniden düzenleme");
  if (kartlar.length) govde.push(kartlar.length + " kart dengelendi — " + ozet.join(", ") + ".", "");

  for (const p of parcalar) { govde.push(...p.satirlar, ""); }

  if (hatalar.length) {
    govde.push("HATA DÜZELTMELERİ");
    for (const h of hatalar) govde.push("• " + h);
  }

  return govde.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = { ayristir, kartAdiDuzelt };
