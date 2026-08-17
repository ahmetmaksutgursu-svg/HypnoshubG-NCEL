/* ============================================================
   VERİ KLASÖRÜ — tek kaynak
   ------------------------------------------------------------
   Sunucunun diske yazdığı her şey (hesaplar, puan tablosu, mesajlar,
   rozetler, oyun hakları, oyuncu indeksi) buraya gider.

   Neden ayrı bir dosya: yol her modülde ayrı ayrı `__dirname + "/.cache"`
   diye yazılıydı. Bu, bilgisayarda sorun değil ama BULUTTA veri kaybı
   demek — Railway/Render/Fly gibi yerlerde uygulamanın dosya sistemi
   GEÇİCİDİR: her yeni sürüm ya da yeniden başlatma diski sıfırlar.
   Yani her yayında bütün kullanıcı hesapları ve puan tablosu silinirdi.

   Çözüm: kalıcı bir disk (Railway'de "Volume") bağlayıp yolunu
   DATA_DIR ile buraya vermek. Ayar yoksa eskisi gibi server/.cache
   kullanılıyor, yani yerelde hiçbir şey değişmiyor.
   ============================================================ */
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, ".cache");

/* Klasör yoksa açılışta oluşturuluyor: kalıcı disk ilk bağlandığında boş
   gelir ve her modülün ayrı ayrı mkdir denemesi gerekmesin. */
try { fs.mkdirSync(DATA_DIR, { recursive: true }); }
catch (e) { console.warn("⚠️  Veri klasörü oluşturulamadı:", DATA_DIR, String(e)); }

const veriYolu = (ad) => path.join(DATA_DIR, ad);

module.exports = { DATA_DIR, veriYolu };
