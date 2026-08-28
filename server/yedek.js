/* ============================================================
   HYPNOSHUB — YEDEKLEME
   ------------------------------------------------------------
   NEDEN: kalıcı diskte (/data) 3000 hesap, puanlar, mesajlar ve
   56 binden fazla maçtan birikmiş eşleşme tablosu duruyor ve TEK
   KOPYA. Disk bozulur, yanlışlıkla silinir ya da bir dağıtımda
   ters bir şey olursa geri dönüş yok. Bu bir saldırı senaryosu
   bile değil — en olası kayıp sebebi sıradan bir kaza.

   NE YEDEKLENİYOR: yalnızca YENİDEN ÜRETİLEMEYEN dosyalar.

     users.json     → hesaplar (parola özetleri dahil)
     scores.json    → Tokmakçılar puan tablosu
     messages.json  → kullanıcı-yönetici yazışmaları
     badges.json    → elle verilmiş rozetler
     feedback.json  → şikayet/öneri kutusu
     game-plays.json, quiz-plays.json → günlük hak sayaçları
     eslesme.json   → 56.973 maçtan birikmiş eşleşme tablosu;
                      yeniden kurmak haftalar sürer
     push-keys.json → VAPID anahtarları; kaybolursa bütün
                      bildirim abonelikleri geçersiz olur

   NE YEDEKLENMİYOR ve neden:
     players.json / players.ndjson → birkaç yüz megabayt, tarama
       ile kendiliğinden yeniden kuruluyor. Yedeklemek diski
       şişirir, faydası yok.
     kule.json, prosezon.json → gözlemle birkaç saatte yeniden
       öğreniliyor.
     *-sessions.json → açık oturumlar; yedekten dönmek zaten
       herkesi yeniden giriş yapmaya zorlar.

   NASIL: her gün bir kez, hepsi tek bir gzip dosyasına yazılıyor.
   Son YEDEK_SAYI kopya saklanıyor, eskisi siliniyor. Ölçülen boyut
   ~2,5 MB ham, gzip sonrası çok daha küçük — 500 MB'lık diskte
   yedi kopya sorun değil.

   GERİ YÜKLEME elle yapılır (bkz. dosyanın sonundaki not): otomatik
   geri yükleme, bir hata anında canlı veriyi eski kopyayla ezme
   riski taşır. Yedek almak otomatik, geri dönmek bilinçli olmalı.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { veriYolu, DATA_DIR } = require("./veriyolu");

const KLASOR = path.join(DATA_DIR, "yedek");
const YEDEK_SAYI = Math.max(2, parseInt(process.env.YEDEK_SAYI, 10) || 7);
const ARALIK_SAAT = Math.max(1, parseInt(process.env.YEDEK_SAAT, 10) || 24);

/* Yedeklenecek dosyalar. Yoksa sessizce atlanıyor — her kurulumda
   hepsi bulunmayabilir (yeni sunucuda mesaj dosyası henüz yoktur). */
const DOSYALAR = [
  "users.json", "scores.json", "messages.json", "badges.json",
  "feedback.json", "game-plays.json", "quiz-plays.json",
  "eslesme.json", "push-keys.json",
  /* Elle yazılmış haber metinleri — yeniden üretilemez. */
  "haberler.json",
  "onay.json",              // çerez onay sayaçları (kimlik yok)
];

const damga = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

function al() {
  try { fs.mkdirSync(KLASOR, { recursive: true }); } catch { /* zaten var */ }

  const paket = { alindi: new Date().toISOString(), dosyalar: {} };
  let toplam = 0, sayi = 0;
  for (const ad of DOSYALAR) {
    try {
      const govde = fs.readFileSync(veriYolu(ad), "utf8");
      paket.dosyalar[ad] = govde;
      toplam += govde.length;
      sayi++;
    } catch { /* dosya yok — bu kurulumda kullanılmıyor olabilir */ }
  }
  if (!sayi) { console.warn("⚠️  Yedeklenecek dosya bulunamadı."); return null; }

  const hedef = path.join(KLASOR, "yedek-" + damga() + ".json.gz");
  try {
    /* Önce geçici ada yaz, sonra yerine koy: yazma yarıda kesilirse
       bozuk bir yedek "geçerli" görünmesin. */
    const tmp = hedef + ".tmp";
    fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(JSON.stringify(paket), "utf8")));
    fs.renameSync(tmp, hedef);
  } catch (e) {
    console.warn("⚠️  Yedek yazılamadı:", String(e));
    return null;
  }

  const boyut = (() => { try { return fs.statSync(hedef).size; } catch { return 0; } })();
  temizle();
  console.log(`💾  Yedek alındı: ${sayi} dosya · ${(toplam / 1024).toFixed(0)} KB → ` +
              `${(boyut / 1024).toFixed(0)} KB (sıkıştırılmış)`);
  return hedef;
}

/* En yeni YEDEK_SAYI kopyayı bırak, gerisini sil. */
function temizle() {
  try {
    const hepsi = fs.readdirSync(KLASOR)
      .filter((f) => /^yedek-.*\.json\.gz$/.test(f))
      .sort();                                  // ad zaman damgalı, alfabetik = kronolojik
    const silinecek = hepsi.slice(0, Math.max(0, hepsi.length - YEDEK_SAYI));
    for (const f of silinecek) {
      try { fs.unlinkSync(path.join(KLASOR, f)); } catch { /* olsun */ }
    }
    if (silinecek.length) console.log(`🧹  ${silinecek.length} eski yedek silindi.`);
  } catch { /* klasör henüz yok */ }
}

function durum() {
  let liste = [];
  try {
    liste = fs.readdirSync(KLASOR)
      .filter((f) => /^yedek-.*\.json\.gz$/.test(f))
      .sort()
      .map((f) => {
        const st = fs.statSync(path.join(KLASOR, f));
        return { ad: f, boyut: st.size, tarih: st.mtime.toISOString() };
      });
  } catch { /* klasör yok */ }
  return { klasor: KLASOR, sayi: liste.length, tutulan: YEDEK_SAYI,
           aralikSaat: ARALIK_SAAT, yedekler: liste };
}

let zamanlayici = null;
function basla() {
  if (zamanlayici) return;
  /* Açılışta HEMEN değil, 2 dakika sonra: sunucu ilk isteklerini
     karşılarken diske 2,5 MB yazmakla uğraşmasın. */
  setTimeout(() => { al(); }, 120e3).unref?.();
  zamanlayici = setInterval(al, ARALIK_SAAT * 3600e3);
  zamanlayici.unref?.();
  console.log(`💾  Yedekleme açık: ${ARALIK_SAAT} saatte bir, son ${YEDEK_SAYI} kopya saklanıyor.`);
}

/* Tek bir yedeği diskten oku — indirme ucu için.

   DOSYA ADI DIŞARIDAN GELİYOR, o yüzden burada sıkı doğrulanıyor:
   ad kalıba uymuyorsa hiç dosya açılmıyor. Doğrudan birleştirseydik
   "../../etc/passwd" gibi bir ad diskte istediği yeri okuturdu. Ucun
   yönetici koruması bunu gereksiz kılmıyor: derinlemesine savunma,
   tek bir kapıya güvenmemek demek. */
const AD_KALIBI = /^yedek-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}[.]json[.]gz$/;

function oku(ad) {
  if (!AD_KALIBI.test(String(ad || ""))) return null;
  const tam = path.join(KLASOR, ad);
  /* Kalıp zaten yeterli ama sonucu bir de klasörle karşılaştırıyoruz:
     kalıp ileride gevşetilirse bu kontrol ayakta kalsın. */
  if (path.dirname(path.resolve(tam)) !== path.resolve(KLASOR)) return null;
  try { return fs.readFileSync(tam); } catch { return null; }
}

/* En yeni yedeğin adı; hiç yoksa null. */
function sonuncu() {
  const d = durum();
  return d.yedekler.length ? d.yedekler[d.yedekler.length - 1].ad : null;
}

module.exports = { basla, al, durum, temizle, oku, sonuncu, KLASOR, DOSYALAR };

/* ------------------------------------------------------------
   GERİ YÜKLEME (elle):

     node -e "const z=require('zlib'),fs=require('fs');
       const p=JSON.parse(z.gunzipSync(fs.readFileSync('YEDEK_YOLU')));
       for(const [ad,govde] of Object.entries(p.dosyalar))
         fs.writeFileSync('/data/'+ad, govde);"

   Sonra sunucuyu yeniden başlat. Geri yüklemeden ÖNCE mevcut
   dosyaların bir kopyasını al — yanlış yedeği açarsan geri dönüş
   kalmasın istemezsin.
   ------------------------------------------------------------ */
