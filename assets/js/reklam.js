/* ============================================================
   HYPNOSHUB — REKLAM YUVALARI  💰
   ------------------------------------------------------------
   Sayfalara elle yerleştirilmiş reklam birimleri.

   ------------------------------------------------------------
   NEDEN GEREKLİ — ÖLÇÜLDÜ

   Sitede HİÇ elle yerleştirilmiş birim yoktu; her şey Otomatik
   reklamlara bırakılmıştı. Canlıda beş sayfa ölçüldü:

     /                    1 birim   (sayfa 4386 px)
     /eglence.html        1 birim   (1426 px)
     /oyuncu.html         1 birim   (897 px)
     /anti.html           1 birim   (2227 px)
     /guncellemeler.html  1 birim   (1723 px)

   Yani 4386 piksellik ana sayfada bile TEK birim vardı. Elle
   yerleştirilen birimler hem sayıyı artırıyor hem de konumu
   garantiliyor — Otomatik reklamlar nereye koyacağına kendi karar
   veriyor ve içeriğin ortasındaki değerli yerleri çoğu zaman
   kullanmıyor.

   ------------------------------------------------------------
   SLOT KİMLİĞİ OLMADAN ÇALIŞMAZ

   `<ins class="adsbygoogle">` etiketi `data-ad-slot` istiyor ve o
   kimlik AdSense panelinde "Reklam birimleri" bölümünden birim
   oluşturunca üretiliyor. Kimlik yoksa birim çizilmiyor — sayfada
   BOŞLUK DA BIRAKMIYOR (yuva tamamen atlanıyor).

   Bu yüzden yuvalar sayfalara ŞİMDİ konuluyor, kimlikler gelince
   yalnızca aşağıdaki YUVALAR tablosu dolduruluyor. Sayfalara bir
   daha dokunmak gerekmiyor.

   ------------------------------------------------------------
   ONAY BEKLERKEN

   Hesap onaylanana kadar birimler boş döner. `data-ad-status`
   "unfilled" gelirse yuva gizleniyor: onaysız dönemde ekranda
   4x4 piksellik hayalet kutular kalmasın diye.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- slot kimlikleri ----------
     AdSense → Reklamlar → Reklam birimlerine göre → Görüntülü reklam
     ile oluşturulan birimin kimliği (yalnızca rakam) buraya yazılıyor.

     BOŞ BIRAKILAN YUVA, icerik1'in kimliğini kullanıyor (aşağıdaki
     `kimlik` işlevi). Google aynı reklam biriminin aynı sayfada birden
     çok kez kullanılmasına izin veriyor, yani tek birimle bütün yuvalar
     çalışıyor. Karşılığında RAPORLAMA birleşiyor: hangi konumun ne
     kazandırdığı ayrı ayrı görünmüyor.

     Ayrı birim oluşturulup kimliği buraya yazıldığında o yuva kendi
     kimliğine geçiyor ve raporda ayrışıyor. */
  var YUVALAR = {
    icerik1: "5559006446",   // ilk içerik bloğundan sonra — en değerli konum
    icerik2: "",             // sayfa ortası
    icerik3: "",             // alt bilgiden hemen önce
    yan: "",                 // geniş ekranda yan sütun
  };

  /* Yuvanın kimliği; yoksa icerik1'e düşülüyor. Hiçbiri yoksa null →
     yuva hiç çizilmiyor (ekranda boşluk da bırakmıyor). */
  function kimlik(ad) {
    return YUVALAR[ad] || YUVALAR.icerik1 || "";
  }

  var ID = "ca-pub-2829452879673360";

  /* Ziyaretçi onay vermediyse kişiselleştirme kapalı; bayrak
     app.js'te betikten ÖNCE kuruluyor (bkz. reklamiYukle). Burada
     tekrar kurmuyoruz, yoksa betik yüklendikten sonra yazmış
     olurduk ve ilk isteğe yetişmezdi. */

  /* Bir yuvayı gerçek reklam birimine çevir. */
  function ciz(kutu) {
    var ad = kutu.getAttribute("data-reklam") || "";
    var slot = kimlik(ad);
    if (!slot) return;                       // kimlik yok → yuva atlanıyor

    var ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.setAttribute("data-ad-client", ID);
    ins.setAttribute("data-ad-slot", slot);
    /* Duyarlı biçim: birim, bulunduğu kabın genişliğine uyuyor.
       Sabit boyut verseydik telefonda yatay kaydırma çıkardı. */
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    kutu.appendChild(ins);

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) { return; }

    /* Google birime `data-ad-status` yazıyor. Üç durum var ve üçü
       AYRI ele alınıyor:

         "filled"    → kutu yüksekliğini alsın (.dolu)
         "unfilled"  → kutu gizlensin, ekranda boşluk kalmasın
         (yazılmadı) → DOKUNMA

       Son satır bir kusuru düzeltiyor: önce 6 saniye sonunda durum
       hâlâ yazılmamışsa da display:none yapılıyordu. Yavaş bağlantıda
       ya da reklam geç geldiğinde bu, DOLACAK bir yuvayı kalıcı olarak
       öldürüyordu — gizlenmiş kutuya Google artık reklam çizemez.

       Durum gelmeyince hiçbir şey yapmamak zararsız: kutunun kendi
       yüksekliği zaten yok (.dolu eklenmeden 0 px), yani ekranda
       boşluk görünmüyor ama geç gelen reklam yine de yerleşebiliyor.

       Süre de 6 saniyeden 20 saniyeye çıkarıldı. "unfilled" kararını
       Google verdiği anda zaten uygulanıyor; bekleme yalnızca durumun
       hiç gelmediği hâli ilgilendiriyor. */
    var kere = 0;
    var saat = setInterval(function () {
      var durum = ins.getAttribute("data-ad-status");
      if (durum === "filled") { kutu.classList.add("dolu"); clearInterval(saat); return; }
      if (durum === "unfilled") { kutu.style.display = "none"; clearInterval(saat); return; }
      if (++kere > 40) clearInterval(saat);      // durum gelmedi: kutuya DOKUNMA
    }, 500);
  }

  /* Yuvaları çiz. Reklam betiği onaydan bağımsız yükleniyor
     (bkz. app.js), o yüzden burada onay kontrolü yok. */
  function kur() {
    var kutular = document.querySelectorAll(".reklam-yuva");
    for (var i = 0; i < kutular.length; i++) {
      if (kutular[i].getAttribute("data-cizildi")) continue;
      kutular[i].setAttribute("data-cizildi", "1");
      ciz(kutular[i]);
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", kur);
  else kur();

  /* Sonradan eklenen yuvalar için (ör. modal içinde) dışarı açıyoruz. */
  window.reklamYuvalariniKur = kur;
})();
