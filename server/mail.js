/* ============================================================
   HYPNOSHUB — E-POSTA GÖNDERİMİ  (Resend, HTTPS)
   ------------------------------------------------------------
   Tek işi var: parola sıfırlama kodunu göndermek. Site başka
   hiçbir sebeple e-posta atmıyor.

   NEDEN SMTP DEĞİL: önce Gmail SMTP denendi ve çalışmadı. Sebebi
   sunucunun içinden ölçüldü:

     SMTP port taraması → 587:kapalı  465:kapalı  2525:kapalı

   Railway giden SMTP bağlantılarını engelliyor (spam'i önlemek için
   bulut sağlayıcılarında yaygın). Ayarla aşılabilecek bir şey değil.
   Yol boyunca ayrıca IPv6 tuzağı da çıktı: Node önce IPv6 adresine
   bağlanmaya çalışıp "ENETUNREACH" alıyordu. HTTPS ise açık, o yüzden
   posta artık HTTPS API'siyle gönderiliyor.

   NEDEN KENDİ ALAN ADIMIZ: postalar `noreply@hypnoshub.pro` adresinden
   gidiyor. Alan adında `DMARC p=reject` var ve Resend'in DKIM anahtarı
   `resend._domainkey.hypnoshub.pro` adına kayıtlı; imza alan adıyla
   hizalandığı için postalar doğrulanmış olarak geçiyor.

   Kök alandaki `v=spf1 -all` kaydına DOKUNULMADI — "hiç kimse bu alan
   adı adına doğrudan posta gönderemez" koruması sürüyor. Resend kendi
   SPF'ini `send.hypnoshub.pro` alt alanında tutuyor.

   Ayar: RESEND_KEY. Tanımlı değilse modül sessizce kapalı kalır ve
   parola sıfırlama devreye girmez (arayüzdeki bağlantı da gizlenir).
   ============================================================ */

const ANAHTAR = (process.env.RESEND_KEY || "").trim();
const GONDEREN = process.env.MAIL_GONDEREN || "HYPNOSHUB <noreply@hypnoshub.pro>";
const API = "https://api.resend.com";

/* Ağ isteği asla süresiz askıda kalmamalı: SMTP sürümünde zaman aşımı
   yoktu ve kullanıcı "Gönderiliyor…" ekranında sonsuza kadar bekledi. */
const ZAMAN_ASIMI = 12000;

function hazirMi() { return !!ANAHTAR; }

/* Açılış sınamasının sonucu. `hazirMi` ayarın TANIMLI olduğunu söyler;
   bu ise gerçekten GÖNDEREBİLDİĞİMİZİ. İkisi ayrı sorular — anahtar
   tanımlı ama geçersiz olabilir — ve arayüz ikincisine bakıyor. */
let baglanti = false;
const calisiyorMu = () => baglanti;

async function istek(yol, secenek = {}) {
  const kes = new AbortController();
  const sayac = setTimeout(() => kes.abort(), ZAMAN_ASIMI);
  try {
    const r = await fetch(API + yol, {
      ...secenek,
      signal: kes.signal,
      headers: {
        "Authorization": "Bearer " + ANAHTAR,
        "Content-Type": "application/json",
        ...(secenek.headers || {}),
      },
    });
    const govde = await r.json().catch(() => ({}));
    if (!r.ok) {
      /* Hata metni anahtarı İÇERMEZ ama yine de kırpıyoruz. */
      const sebep = String(govde.message || govde.name || r.status).slice(0, 160);
      throw new Error(sebep);
    }
    return govde;
  } finally { clearTimeout(sayac); }
}

/* Anahtar geçerli mi ve alan adı doğrulanmış mı? Posta göndermeden
   sınar; açılışta bir kez çağrılıyor. */
async function dene() {
  if (!hazirMi()) return { hazir: false, sebep: "RESEND_KEY tanımlı değil" };
  try {
    const d = await istek("/domains");
    const liste = (d && d.data) || [];
    const bizim = liste.find((x) => /hypnoshub\.pro$/i.test(x.name || ""));
    if (!bizim) return { hazir: false, sebep: "alan adı Resend'de bulunamadı" };
    if (bizim.status !== "verified")
      return { hazir: false, sebep: "alan adı henüz doğrulanmamış (" + bizim.status + ")" };
    return { hazir: true, kullanici: GONDEREN, alan: bizim.name };
  } catch (e) {
    const mesaj = String(e && e.message || e);
    /* "Bu anahtar yalnızca posta göndermeye yetkili" hatası BAŞARISIZLIK
       DEĞİL. Anahtarı en az yetkiyle (yalnızca gönderme) üretmek doğru
       olan; alan adı listesini okuma yetkisi bilerek verilmedi. Üstelik
       bu hatayı almak anahtarın GEÇERLİ olduğunu kanıtlıyor — geçersiz
       bir anahtar "invalid API key" derdi.

       İlk yazımda sınama /domains ucuna bakıyordu ve bu yüzden çalışan
       bir kurulumu "bozuk" gösterdi. */
    if (/restricted.*send|only send emails/i.test(mesaj))
      return { hazir: true, kullanici: GONDEREN, alan: "hypnoshub.pro", kisitli: true };
    return { hazir: false, sebep: mesaj.slice(0, 160) };
  }
}

async function gonder({ kime, konu, metin, html }) {
  if (!hazirMi()) throw new Error("posta ayarı yok");
  await istek("/emails", {
    method: "POST",
    body: JSON.stringify({ from: GONDEREN, to: [kime], subject: konu, text: metin, html }),
  });
}

const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Sıfırlama kodu e-postası. Düz metin de gönderiliyor: bazı posta
   istemcileri HTML'i engelliyor ve kod görünmez oluyordu. */
async function sifirlamaKodu(kime, kod, kullaniciAdi) {
  const konu = "HYPNOSHUB — parola sıfırlama kodu";
  const metin =
    `Merhaba ${kullaniciAdi},\n\n` +
    `Parolanı sıfırlamak için kodun: ${kod}\n\n` +
    `Kod 15 dakika geçerli ve yalnızca bir kez kullanılabilir.\n\n` +
    `Bu isteği sen yapmadıysan bu e-postayı yok say — parolan değişmez ` +
    `ve hesabına kimse erişemez.\n\n` +
    `HYPNOSHUB\nhttps://hypnoshub.pro`;
  const html =
    `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px">` +
    `<p>Merhaba <b>${escapeHtml(kullaniciAdi)}</b>,</p>` +
    `<p>Parolanı sıfırlamak için kodun:</p>` +
    `<p style="font-size:30px;font-weight:800;letter-spacing:6px;` +
    `background:#f3f4f6;padding:14px 18px;border-radius:10px;display:inline-block">${kod}</p>` +
    `<p>Kod <b>15 dakika</b> geçerli ve yalnızca <b>bir kez</b> kullanılabilir.</p>` +
    `<p style="color:#6b7280;font-size:13px">Bu isteği sen yapmadıysan bu e-postayı yok say — ` +
    `parolan değişmez ve hesabına kimse erişemez.</p>` +
    `<p style="color:#6b7280;font-size:13px">HYPNOSHUB · ` +
    `<a href="https://hypnoshub.pro">hypnoshub.pro</a></p></div>`;
  await gonder({ kime, konu, metin, html });
}

/* Açılışta bir kez sınanıyor. Posta ayarı sessizce bozulduğunda
   (anahtar iptal edildi, alan adı doğrulaması düştü) bunu kullanıcı
   "kod gelmedi" diyene kadar fark etmemek en kötüsü. */
function acilistaSina() {
  if (!hazirMi()) { console.log("✉️   Posta ayarı yok — parola sıfırlama kapalı."); return; }
  dene().then((d) => {
    baglanti = !!d.hazir;
    if (d.hazir) console.log(`✉️   Posta hazır (${d.alan} · ${GONDEREN})` +
      (d.kisitli ? " — anahtar yalnızca gönderme yetkili (doğrusu bu)." : "."));
    else console.warn(`⚠️   Posta KULLANILAMIYOR: ${d.sebep}`);
  }).catch(() => {});
}

module.exports = { hazirMi, calisiyorMu, dene, gonder, sifirlamaKodu, acilistaSina };
