/* ============================================================
   HYPNOSHUB — ÇEREZ ONAY SAYACI  📊
   ------------------------------------------------------------
   Kaç ziyaretçinin reklam kişiselleştirmesine onay verdiğini
   sayıyor. Sadece iki sayı: kabul ve ret.

   ------------------------------------------------------------
   NEDEN GEREKLİ

   Onay vermeyen ziyaretçiye KİŞİSELLEŞTİRİLMEMİŞ reklam gidiyor
   (npa=1) ve o belirgin şekilde az kazandırıyor. Yani onay oranı
   doğrudan bir gelir çarpanı.

   Ama oran GÖRÜNMÜYORDU: tercih yalnızca ziyaretçinin kendi
   tarayıcısında (localStorage) duruyor, sunucuya hiç gelmiyordu.
   Oranı bilmeden çerez bandını "iyileştirmek" körlemesine iş
   olurdu — %80 kabul varsa dokunmaya değmez, %20 varsa asıl
   kazanç oradadır.

   ------------------------------------------------------------
   NE TUTULMUYOR

   Kimlik tutulmuyor: ne IP, ne kullanıcı adı, ne çerez, ne zaman
   damgası. Yalnızca iki tamsayı artıyor. Kimin ne seçtiği bu
   dosyadan çıkarılamaz — çıkarılabilseydi, gizlilik metninde
   "tercihiniz sunucuya gönderilmez" demiş olmamızla çelişirdi.

   O cümle hâlâ doğru: giden şey TERCİH DEĞİL, yalnızca bir
   sayacın artması. Hangi ziyaretçinin arttırdığı kaydedilmiyor.

   ------------------------------------------------------------
   NEREDE DURUYOR

   Diskte: sayılar sunucu yeniden başlayınca sıfırlanmasın diye.
   Haftalık dağıtım yapıyoruz, bellekte tutsaydık her dağıtımda
   veri kaybolurdu.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const { veriYolu } = require("./veriyolu");

const DOSYA = veriYolu("onay.json");
const db = { kabul: 0, ret: 0, ilk: null };

function yukle() {
  try {
    const d = JSON.parse(fs.readFileSync(DOSYA, "utf8"));
    if (d && typeof d === "object") {
      db.kabul = Number(d.kabul) || 0;
      db.ret = Number(d.ret) || 0;
      db.ilk = d.ilk || null;
    }
  } catch { /* ilk çalıştırma */ }
}

let zaman = null;
function kaydet() {
  clearTimeout(zaman);
  zaman = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
      const gecici = DOSYA + ".tmp";
      fs.writeFileSync(gecici, JSON.stringify(db, null, 2));
      fs.renameSync(gecici, DOSYA);
    } catch (e) { console.warn("⚠️  Onay sayacı kaydedilemedi:", String(e)); }
  }, 1000);
}

function say(karar) {
  if (karar !== "kabul" && karar !== "ret") return false;
  if (!db.ilk) db.ilk = new Date().toISOString();
  db[karar]++;
  kaydet();
  return true;
}

function durum() {
  const toplam = db.kabul + db.ret;
  return {
    kabul: db.kabul,
    ret: db.ret,
    toplam,
    /* Oran yalnızca anlamlı bir örneklem varken veriliyor. 3 kişiden
       2'si kabul etti diye "%67 kabul" demek yanıltıcı olurdu. */
    oran: toplam >= 20 ? Math.round((db.kabul / toplam) * 100) : null,
    ilk: db.ilk,
  };
}

function mount(app) {
  app.use("/api/onay", require("express").json({ limit: "1kb" }));

  /* Ziyaretçi karar verince çağrılıyor. Yanıt gövdesi yok: istemcinin
     bekleyeceği bir şey olmasın, sayfa akışını yavaşlatmasın. */
  app.post("/api/onay", (req, res) => {
    say(String(req.body && req.body.karar || ""));
    res.status(204).end();
  });

  console.log("📊  Çerez onay sayacı hazır (/api/onay).");
}

yukle();

module.exports = { mount, durum, say };
