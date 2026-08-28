/* HYPNOSHUB — servis çalışanı.

   Tek işi bildirim: site kapalıyken gelen push'u ekrana çıkarmak ve
   tıklanınca doğru sayfayı açmak.

   BİLEREK ÖNBELLEK YAPMIYOR. Bir servis çalışanı sayfaları da
   önbelleğe alabilir ama burada zararı faydasından çok olurdu: site
   zaten HTTP başlıklarıyla önbellekleniyor (görsel 1 gün, CSS/JS 5
   dakika, HTML 1 dakika) ve bu süreler bilerek kısa tutuldu ki yayın
   sırasında bir düzeltme hızla ulaşsın. Araya bir de servis çalışanı
   önbelleği girseydi, "düzelttim ama kullanıcıda hâlâ eskisi var"
   sorununu bir kat daha derinleştirirdi. */

self.addEventListener("install", (e) => {
  /* Yeni sürüm beklemeden devreye girsin: eski çalışan hayattayken
     yeni bildirim kodu uygulanmazdı. */
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("push", (e) => {
  /* Gövde bozuk ya da boş gelirse bile BİR ŞEY göstermek gerekiyor:
     izin verilmiş bir push'u sessizce yutmak, bazı tarayıcılarda
     "bu site arka planda çalıştı ama bildirim göstermedi" uyarısına
     yol açıyor. O yüzden yedek metin var. */
  let veri = {};
  try { veri = e.data ? e.data.json() : {}; } catch { veri = {}; }
  const baslik = veri.baslik || "HYPNOSHUB";
  const secenekler = {
    body: veri.govde || "Puanlı oyunlar yeniden oynanabilir.",
    icon: "/assets/img/hammer-logo.jpg",
    badge: "/assets/img/hammer-logo.jpg",
    /* Aynı etiketli bildirim üst üste yığılmıyor, sonuncusu öncekinin
       yerini alıyor: kullanıcı siteyi birkaç gün açmazsa bildirim
       kutusu aynı duyurudan beş taneyle dolmasın. */
    tag: veri.etiket || "hs-gunluk",
    renotify: true,
    data: { adres: veri.adres || "/eglence.html" },
  };
  e.waitUntil(self.registration.showNotification(baslik, secenekler));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const adres = (e.notification.data && e.notification.data.adres) || "/eglence.html";
  e.waitUntil((async () => {
    const pencereler = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    /* Site zaten açıksa YENİ SEKME AÇMIYORUZ, açık olanı öne alıp
       oraya yönlendiriyoruz. Yoksa bildirime her tıklayışta bir sekme
       daha birikirdi. */
    for (const p of pencereler) {
      if (p.url.includes(self.location.origin)) {
        await p.focus();
        if ("navigate" in p) { try { await p.navigate(adres); } catch { /* izin yoksa odak yeter */ } }
        return;
      }
    }
    await self.clients.openWindow(adres);
  })());
});
