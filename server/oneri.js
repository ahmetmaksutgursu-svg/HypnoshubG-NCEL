/* ============================================================
   HYPNOSHUB — DESTE ÖNERİSİ  🃏
   ------------------------------------------------------------
   "Bana kendi kartlarımla oynayabileceğim iyi desteler ver."

   Sorun şu: meta desteler en çok kazanan destelerdir ama oyuncunun
   o kartları YÜKSEK SEVİYEDE olmayabilir. 16. seviye bir kartla
   oynanan deste ile aynı destenin 9. seviye hâli aynı deste değil.
   O yüzden öneri iki şeyi birden gözetiyor:

     1) Meta'ya YAKIN olmak  — kazanan bir iskeletle başlamak
     2) Oyuncunun GÜÇLÜ kartlarından kurulmak

   İkisi çelişince oyuncunun seviyesi kazanıyor, ama sınırlı: her
   destede en çok DÖRT kart değiştiriliyor. Daha fazlası "meta desteye
   yakın" olmaktan çıkar, rastgele bir desteye dönerdi.

   TEK DEĞİL, LİSTE döndürülüyor. Tek deste önermek, oyuncuya seçme
   hakkı bırakmıyordu: beğenmediği bir arketip (mesela beatdown)
   çıktığında yapabileceği bir şey yoktu. Artık kendi kartlarına en
   uygun birkaç deste sıralanıyor, o seçiyor.

   ------------------------------------------------------------
   SEVİYELER NEDEN OLDUĞU GİBİ KULLANILAMIYOR

   ÖLÇÜLDÜ (gerçek bir hesapta, 122 kart): `maxLevel` nadirliğe göre
   değişiyor — sıradan 16, ender 14, destansı 11, efsanevi 8,
   şampiyon 6. Yani 11. seviye bir destansı ile 11. seviye bir sıradan
   AYNI GÜÇTE DEĞİL; destansı zaten tavanında.

   Ortak ölçek:  seviye + (16 - maxLevel)

   Tavana ulaşmış her kart, nadirliği ne olursa olsun 16 çıkıyor.

   ------------------------------------------------------------
   EVRİM VE KAHRAMAN YUVALARI

   ÖLÇÜLDÜ (16 meta deste): her destede TAM 2 evrim yuvası var;
   kahraman yuvası 11 destede 1, 5 destede 0.

   EVRİM — oyuncu verisinden KESİN biliniyor: kartın `evolutionLevel`
   alanı varsa o evrim açılmış demektir (ölçüldü: örnek hesapta 54
   kart). Bu yüzden evrim yuvaları desteden kopyalanmıyor, oyuncunun
   GERÇEKTEN AÇTIĞI evrimler arasından yeniden seçiliyor. Açmadığı bir
   evrimi önermek, oynayamayacağı bir deste vermek olurdu.

   KAHRAMAN — oyuncu verisi bunu SÖYLEMİYOR. Ölçtüm: kart nesnelerinde
   kahramanla ilgili hiçbir alan yok. O yüzden kahraman yuvası meta
   desteden olduğu gibi taşınıyor ve yalnızca o kart destede kaldıysa
   korunuyor. Uydurmuyoruz; bilmediğimiz şeyi biliyormuş gibi
   göstermek, önerinin tamamına olan güveni bozar.
   ============================================================ */

/* Her destede en çok kaç kart değiştirilebilir. Kullanıcı isteği:
   "aynısı olmasa da 3-4 kart farklı olabilir". */
const EN_FAZLA_DEGISIM = 4;

/* Kaç deste önerilsin. */
const ONERI_ADEDI = 6;

/* Bir değişimin yapılmaya değmesi için gereken en az seviye kazancı.
   Tek seviye için deste bozmak anlamsız: meta desteden sapmanın da bir
   bedeli var, kazanç onu aşmalı. */
const EN_AZ_KAZANC = 2;

/* Yerine geçen kart iksir olarak bu kadar sapabilir. Daha genişi
   dengeyi bozuyor: 3 iksirlik bir savunmayı 6 iksirlikle değiştirmek
   desteyi oynanamaz hâle getirir. */
const IKSIR_TOLERANS = 1;

/* Destenin ortalama iksiri bu kadardan fazla kaymasın. Tek tek her
   değişim toleransa uysa bile üst üste binince ortalama kayıyor. */
const ORTALAMA_TOLERANS = 0.4;

/* Ölçüldü: her meta destede tam bu kadar evrim yuvası var. */
const EVRIM_YUVASI = 2;

/* Ortak ölçekteki seviye. maxLevel yoksa (beklenmedik veri) ham
   seviyeye düşülüyor — yanlış hesaplamaktansa temkinli davranmak. */
function olcekliSeviye(kart) {
  const sv = Number(kart && kart.level) || 0;
  const max = Number(kart && kart.maxLevel) || 0;
  if (!sv) return 0;
  return max ? sv + (16 - max) : sv;
}

/* Oyuncunun kartları: kimlik -> ölçekli seviye. Listede olmayan kart
   HİÇ AÇILMAMIŞ demek, seviyesi 0 sayılıyor. */
function seviyeHaritasi(oyuncuKartlari) {
  const m = new Map();
  for (const k of oyuncuKartlari || []) {
    if (!k || k.id == null) continue;
    m.set(k.id, olcekliSeviye(k));
  }
  return m;
}

/* Oyuncunun AÇTIĞI evrimler.

   İKİ ŞART BİRDEN. Önce yalnızca `evolutionLevel` bakılıyordu ve
   YANLIŞTI: o alan kahraman açılışında da doluyor, yani Yaramaz gibi
   evrimi olmayan kartlar evrim yuvasına giriyordu. Kartın evrimi
   olduğu ayrıca doğrulanıyor (bkz. evrim.js — maxEvolutionLevel bir
   bit maskesi, 1. bit evrim). */
const evrim = require("./evrim");
function evrimKumesi(oyuncuKartlari) {
  const s = new Set();
  for (const k of oyuncuKartlari || []) {
    if (k && k.id != null && evrim.evrimAcik(k)) s.add(k.id);
  }
  return s;
}

/* Destenin oyuncu için "gücü" = sekiz kartın ortalama seviyesi.
   Sahip olunmayan kart 0 geldiği için ortalamayı sertçe düşürüyor;
   ayrı bir eksik-kart cezası yazmaya gerek kalmıyor. */
function desteSeviyesi(kartlar, sv) {
  if (!kartlar || !kartlar.length) return 0;
  let t = 0;
  for (const c of kartlar) t += sv.get(c.id) || 0;
  return t / kartlar.length;
}

const ortalamaIksir = (kartlar) =>
  kartlar.reduce((a, c) => a + (Number(c.elixir) || 0), 0) / (kartlar.length || 1);

/* ------------------------------------------------------------
   TEK BİR META DESTEDEN ÖNERİ TÜRET
   ------------------------------------------------------------ */
function temelden(temel, ctx) {
  const { sv, evrim, metaKart, bilgi, enFazlaDegisim } = ctx;

  const tur = (id) => (bilgi(id) || {}).tur || "";
  const iksirOf = (id) => Number((bilgi(id) || {}).elixir) || 0;
  const sampiyonMu = (id) => (bilgi(id) || {}).rarity === "champion";
  /* Kazanma koşulu = yalnızca binaları hedefleyen kart (Domuz Binicisi,
     Balon, Koçbaşı…). Destenin kule yıkma yolu odur.

     Tür ve iksir eşleşmesi bunu yakalamıyor: Domuz Binicisi de Silahşör
     de "asker" ve ikisi de 4 iksir, ama biri kule yıkar diğeri savunma
     yapar. Kazanma koşulunu destekle değiştiren deste hiç hücum edemez —
     teknik olarak geçerli, oyun olarak çöp. */
  const kazanmaKosulu = (id) => !!(bilgi(id) || {}).hedefBina;

  const mevcut = new Set(temel.cards.map((c) => c.id));
  const sampiyonSayisi = (idler) => [...idler].filter(sampiyonMu).length;

  /* KAHRAMAN KARTI KOLAY FEDA EDİLMESİN.

     Kahraman yuvası meta desteden taşınıyor ve yalnızca o kart destede
     KALIRSA korunuyor (oyuncunun hangi kahramanları açtığını API
     söylemiyor, uydurmuyoruz). Ama değişimler onu kolayca çıkarınca
     yuva da gidiyordu: ölçüldü, 6 önerinin yalnızca 1inde kahraman
     kalmıştı ve kullanıcı bildirdi — "kahramanı gözükmüyor".

     Artık kahraman kartı ancak KAYDA DEĞER bir seviye kazancı için
     çıkarılıyor. Sayı 3: 1-2 seviye için desteyi kahramansız bırakmak
     kötü takas, ama 3+ seviye gerçek bir güç farkı. */
  const metaKahramanId = (temel.cards.find((c) => c.hero) || {}).id;
  const KAHRAMAN_FEDA_ESIGI = 3;

  /* DEĞİŞİM ADAYLARI — her zayıf kart için en iyi yedek. */
  const adaylar = [];
  for (const c of temel.cards) {
    const buSv = sv.get(c.id) || 0;
    let yedek = null, yedekSv = buSv + EN_AZ_KAZANC - 1;

    for (const [id, gecis] of metaKart) {
      if (mevcut.has(id)) continue;
      const ySv = sv.get(id) || 0;
      if (ySv <= yedekSv) continue;                                 // yeterince iyi değil
      if (tur(id) !== tur(c.id)) continue;                          // asker↔asker, bina↔bina, büyü↔büyü
      if (kazanmaKosulu(id) !== kazanmaKosulu(c.id)) continue;      // kule yıkan ↔ kule yıkan
      if (Math.abs(iksirOf(id) - iksirOf(c.id)) > IKSIR_TOLERANS) continue;
      /* Destede zaten şampiyon varsa ikincisi konulamaz — oyun kuralı.
         Kontrol edilmezse geçersiz deste önerilir. */
      if (sampiyonMu(id)) {
        const kalan = new Set(mevcut); kalan.delete(c.id);
        if (sampiyonSayisi(kalan) >= 1) continue;
      }
      const oncekiGecis = yedek ? (metaKart.get(yedek) || 0) : -1;
      if (ySv > yedekSv || (ySv === yedekSv && gecis > oncekiGecis)) {
        yedekSv = ySv; yedek = id;
      }
    }
    if (yedek != null) {
      const kazanc = yedekSv - buSv;
      /* Kahraman kartını yalnızca büyük kazançta feda et. */
      if (c.id === metaKahramanId && kazanc < KAHRAMAN_FEDA_ESIGI) continue;
      adaylar.push({ cikan: c.id, giren: yedek, kazanc });
    }
  }

  adaylar.sort((a, b) => b.kazanc - a.kazanc);   // en çok kazandıran önce

  /* UYGULA — en fazla `enFazlaDegisim` tane, ortalama iksiri bozmadan. */
  let kartIdleri = temel.cards.map((c) => c.id);
  const ilkIksir = ortalamaIksir(temel.cards.map((c) => bilgi(c.id) || { elixir: c.elixir }));
  const degisimler = [];
  for (const a of adaylar) {
    if (degisimler.length >= enFazlaDegisim) break;
    if (!kartIdleri.includes(a.cikan) || kartIdleri.includes(a.giren)) continue;

    const deneme = kartIdleri.map((id) => (id === a.cikan ? a.giren : id));
    const yeniIksir = ortalamaIksir(deneme.map((id) => bilgi(id) || { elixir: 0 }));
    if (Math.abs(yeniIksir - ilkIksir) > ORTALAMA_TOLERANS) continue;
    if (sampiyonSayisi(new Set(deneme)) > 1) continue;

    kartIdleri = deneme;
    mevcut.delete(a.cikan); mevcut.add(a.giren);
    degisimler.push({ cikan: a.cikan, giren: a.giren, kazanc: a.kazanc });
  }

  /* ---- EVRİM YUVALARI ----
     Desteden kopyalanmıyor, YENİDEN seçiliyor: oyuncunun gerçekten
     açtığı evrimler arasından, en yüksek seviyeli iki kart. Meta
     destenin evrim verdiği kart eşitlikte öne alınıyor — o seçim
     kazanan destelerden geliyor, boşuna değil. */
  /* ---- KAHRAMAN YUVASI (evrimden ÖNCE belirleniyor) ----
     Meta desteden taşınıyor, ama yalnızca o kart destede kaldıysa.
     Oyuncunun kahraman sahipliğini API söylemiyor (ölçüldü), o yüzden
     yeni bir kahraman ATAMIYORUZ. */
  const metaKahraman = temel.cards.find((c) => c.hero);
  const kahramanId = metaKahraman && kartIdleri.includes(metaKahraman.id)
    ? metaKahraman.id : null;

  const metaEvrim = new Set(temel.cards.filter((c) => c.evo).map((c) => c.id));

  /* ÇİZİMİ OLAN EVRİMİ YEĞLE.

     ÖLÇÜLDÜ: 54 evrimin yalnızca 41inin çizimi yayımlanmış. Kalan 13ü
     hiçbir kaynakta yok — ne resmi API, ne royaleapi CDN (13ü tek tek
     denendi, yalnızca Elit Barbarlar bulundu). O kartlar EVRİM rozeti
     taşıyıp sıradan çizimle görünüyor ve kullanıcı bildirdi:
     "bazı karakterlerin evrimi gözükmüyor".

     Çizimi getiremiyoruz ama YUVAYI seçebiliyoruz: seviye eşitken
     çizimi olan kart evrim yuvasını alsın. Ölçüldü — 12 yuvanın 5i
     çizimsiz karta gidiyordu.

     SIRA ÖNEMLİ: önce seviye. Kullanıcı "en yüksek seviyeye göre kur"
     dedi; görüntü için seviyeden ödün vermek o isteği bozardı. Çizim
     yalnızca eşitliği bozuyor. */
  const cizimVar = (id) => !!(bilgi(id) || {}).evoIcon;

  /* SIRALAMA: önce META destenin kendi evrim seçimi.

     Eskiden önce seviye, sonra çizim bakılıyordu. Sonuç: oyuncunun EN
     İYİ iki evrimi her destede aynı çıkıyordu. Ölçüldü — az evrimi açık
     bir hesapta Barbar Fıçısı 6 destenin 4ünde evrim yuvasındaydı;
     kullanıcı ekran görüntüsünde iki destenin ilk iki kartının aynı
     olduğunu gösterdi.

     Meta destenin evrim seçimi tesadüfi değil: o deste o kartlar
     evrimliyken kazanıyor. Oyuncu o evrimi açmışsa yuvayı ona vermek
     hem daha doğru hem de desteden desteye DEĞİŞİYOR — liste gerçek
     seçenek sunuyor.

     Seviye ikinci sırada kaldı, çünkü evrim yuvasının hangi karta
     gittiği destenin ortalama seviyesini DEĞİŞTİRMİYOR: sekiz kart
     zaten seçilmiş durumda, bu yalnızca hangisinin evrimli oynanacağı. */
  const evrimAdayi = kartIdleri
    /* KAHRAMAN KARTI EVRİM YUVASI ALAMAZ.

       Evrim ve kahraman AYRI yuva sistemleri; bir kart ikisinde birden
       olamaz. Kod bunu gözetmiyordu ve aynı kart ikisine birden
       atanıyordu — arayüz de tek etiket gösterebildiği için kullanıcı
       "evrimi veya kahramanı gözükmüyor" diye bildirdi. Ölçüldü: bir
       destede 2 evrim kartı vardı ama yalnızca 1 EVRİM etiketi
       çiziliyordu, çünkü ikincisi kahraman yuvasındaydı.

       Kahraman önce belirleniyor, evrim yuvaları kalanlardan seçiliyor. */
    .filter((id) => id !== kahramanId)
    .filter((id) => evrim.has(id))
    .sort((a, b) => (metaEvrim.has(b) ? 1 : 0) - (metaEvrim.has(a) ? 1 : 0)
                 || (cizimVar(b) ? 1 : 0) - (cizimVar(a) ? 1 : 0)
                 || (sv.get(b) || 0) - (sv.get(a) || 0));
  const evrimSecilen = new Set(evrimAdayi.slice(0, EVRIM_YUVASI));


  /* YUVA SIRASI — oyundaki gibi.

     Kartlar meta destedeki sırayla dönüyordu ve evrimler dağınık
     çıkıyordu (ölçüldü: 1-3, 1-3, 1-2 gibi). Oyunda evrim yuvaları
     destenin İLK İKİ sırasıdır, kahraman da kendi yuvasında durur;
     kullanıcı bildirdi — "evrimler evrim, kahramanlar kahraman
     slotunda olsun".

     Sıra: iki evrim, sonra kahraman, sonra kalanlar. Kalanların kendi
     içindeki sırası meta destedeki hâliyle korunuyor — orada da bir
     mantık var (hücum/savunma gruplaması), bozmaya gerek yok. */
  /* ŞAMPİYON DA ÖZEL YUVAYA. Kullanıcı isteği: "şampiyonları da ayrıca
     kahraman slotuna yerleştir". Şampiyon destede tek olabiliyor ve
     kendi düğmesiyle oynanıyor; kahramanla aynı grupta durması listeyi
     okunur yapıyor — özel kartlar önde, sıradan kartlar arkada. */
  const yuvaSirasi = (id) => {
    if (evrimSecilen.has(id)) return 0;
    if (id === kahramanId) return 1;
    if (sampiyonMu(id)) return 2;
    return 3;
  };
  kartIdleri = kartIdleri
    .map((id, i) => ({ id, i }))
    .sort((x, y) => yuvaSirasi(x.id) - yuvaSirasi(y.id) || x.i - y.i)
    .map((x) => x.id);

  const kartlar = kartIdleri.map((id) => {
    const b = bilgi(id) || {};
    const d = degisimler.find((x) => x.giren === id);
    return {
      id,
      name: b.name || "",
      nameTR: b.nameTR || b.name || "",
      elixir: Number(b.elixir) || 0,
      rarity: b.rarity || "",
      icon: b.icon || "",
      evoIcon: b.evoIcon || "",
      heroImg: b.heroImg || "",
      seviye: sv.get(id) || 0,
      sahip: sv.has(id),
      /* Bu kart evrim yuvasında mı — oyuncunun AÇTIĞI evrimlerden. */
      evo: evrimSecilen.has(id),
      /* Meta desteden gelen kahraman yuvası. */
      hero: kahramanId === id,
      /* Şampiyon ayrı bir işaret: kahraman yuvasıyla aynı grupta duruyor
         ama farklı bir mekanik. Arayüz ikisini karıştırmasın. */
      sampiyon: sampiyonMu(id),
      degisti: !!d,
      /* Hangi kartın yerine geldiği: arayüz "şunu şununla değiştirdik"
         diyebilsin. Sebebini söylemeyen öneri kullanıcı için sihir olur. */
      yerine: d ? (bilgi(d.cikan) || {}).nameTR || null : null,
      kazanc: d ? d.kazanc : 0,
    };
  });

  return {
    kartlar,
    anahtar: kartIdleri.slice().sort((a, b) => a - b).join(","),
    ortalamaIksir: Math.round(ortalamaIksir(kartlar) * 10) / 10,
    ortalamaSeviye: Math.round(
      (kartlar.reduce((a, c) => a + c.seviye, 0) / kartlar.length) * 10) / 10,
    degisimSayisi: degisimler.length,
    evrimSayisi: evrimSecilen.size,
    /* Kaçının çizimi gerçekten var — sıralama ayracı ve arayüz notu için. */
    gorunurEvrim: kartlar.filter((c) => c.evo && c.evoIcon).length,
    kahramanVar: kahramanId != null,
    temel: {
      anahtar: temel.key,
      winrate: temel.winrate ?? null,
      usage: temel.usage ?? null,
      battles: temel.battles ?? null,
      kartlar: temel.cards.map((c) => {
        const b = bilgi(c.id) || {};
        return { id: c.id, nameTR: b.nameTR || b.name || c.name, seviye: sv.get(c.id) || 0 };
      }),
    },
    eksik: kartlar.filter((c) => !c.sahip).map((c) => c.nameTR),
  };
}

/* ------------------------------------------------------------
   ÖNERİ LİSTESİ

   oyuncuKartlari : CR API'nin /players yanıtındaki `cards` dizisi
   metaDesteler   : [{ key, cards:[{id,evo,hero,...}], winrate, usage }]
   kartBilgi      : Map(kimlik -> { name, nameTR, elixir, rarity, tur, hedefBina, icon, evoIcon })
   ------------------------------------------------------------ */
function onerListe({ oyuncuKartlari, metaDesteler, kartBilgi,
                     adet = ONERI_ADEDI,
                     enFazlaDegisim = EN_FAZLA_DEGISIM } = {}) {
  const sv = seviyeHaritasi(oyuncuKartlari);
  const evrim = evrimKumesi(oyuncuKartlari);
  const desteler = (metaDesteler || [])
    .filter((d) => d && Array.isArray(d.cards) && d.cards.length === 8);
  if (!sv.size || !desteler.length) return [];

  /* Metada geçen bütün kartlar ve kaç destede geçtikleri. Yedek kart
     BURADAN seçiliyor: oyuncunun en yüksek kartı metada hiç oynanmayan
     bir kartsa, onu koymak desteyi meta olmaktan çıkarırdı. */
  const metaKart = new Map();
  for (const d of desteler)
    for (const c of d.cards) metaKart.set(c.id, (metaKart.get(c.id) || 0) + 1);

  const ctx = {
    sv, evrim, metaKart, enFazlaDegisim,
    bilgi: (id) => (kartBilgi && kartBilgi.get(id)) || null,
  };

  /* TEMEL DESTE PUANI.

     Baskın ölçüt SEVİYE (100 ile çarpılıyor, yani bir seviye farkı her
     şeyi yener) — kullanıcının açık isteği buydu.

     İkinci terim EVRİM POTANSİYELİ: destenin sekiz kartından kaçının
     evrimini oyuncu açmış. Ölçüldü — 8 evrimi açık bir hesapta altı
     önerinin DÖRDÜ tümüyle evrimsiz çıkıyordu, çünkü seçilen meta
     desteler oyuncunun açtığı evrimlerle hiç kesişmiyordu. Oyunda iki
     evrim yuvası boş bırakılmaz; elde varsa doldurulabilecek bir deste
     daha kullanışlı.

     Ağırlık 30, yani iki evrim en fazla 60 puan getiriyor — bir seviyenin
     (100) altında. Seviye hâlâ kazanıyor, evrim yalnızca yakın olanları
     ayırıyor. Kazanma oranı üçüncü sırada. */
  const evrimPotansiyeli = (kartlar) =>
    Math.min(2, kartlar.filter((c) => evrim.has(c.id)).length);
  const destePuani = (d) =>
    desteSeviyesi(d.cards, sv) * 100 +
    evrimPotansiyeli(d.cards) * 30 +
    (Number(d.winrate) || 0);
  const sirali = desteler.slice().sort((a, b) => destePuani(b) - destePuani(a));

  /* AYNI SONUCA ÇIKAN destelerden tek kopya. İki farklı meta deste,
     değişimlerden sonra aynı sekiz karta düşebiliyor; listede iki kez
     görünmesi kullanıcıya seçenek sunmuyor, yer kaplıyor. */
  const gorulen = new Set();
  const sonuc = [];
  for (const d of sirali) {
    if (sonuc.length >= adet) break;
    const o = temelden(d, ctx);
    if (!o || gorulen.has(o.anahtar)) continue;
    gorulen.add(o.anahtar);
    sonuc.push(o);
  }

  /* SON SEVİYEYE GÖRE SIRALA — temel destenin seviyesine göre DEĞİL.

     Sıralama yukarıda temel deste puanıyla yapılıyor, ama değişimlerden
     sonra sonuç değişiyor: ölçüldü, 5. sıradaki deste 16.0a çıkarken
     2-4. sıradakiler 15.6da kalıyordu. Yani listenin başındaki deste
     en iyisi değildi. Kullanıcı bildirdi: "önerdiğin desteler düşük
     seviyeli geldi". Beraberlikte kazanma oranı ayraç. */
  sonuc.sort((a, b) =>
    (b.ortalamaSeviye - a.ortalamaSeviye) ||
    /* İKİ EVRİMİ DOLU DESTE ÖNE. Ölçüldü: az evrimi açık bir hesapta
       listenin başındaki destede HİÇ evrim yoktu — oyunda iki evrim
       yuvası boş bırakılmaz, elde varsa doldurulur. Seviye yine ilk
       ölçüt; bu yalnızca eşitliği bozuyor. */
    (b.evrimSayisi - a.evrimSayisi) ||
    /* Seviye eşitse GÖRÜNÜR olan öne: önce çizimi olan evrimler, sonra
       kahramanlı deste. İkisi de seviyeden ödün vermiyor, yalnızca
       eşitliği bozuyor. */
    (b.gorunurEvrim - a.gorunurEvrim) ||
    ((b.kahramanVar ? 1 : 0) - (a.kahramanVar ? 1 : 0)) ||
    ((b.temel.winrate || 0) - (a.temel.winrate || 0)));

  return sonuc;
}

/* Tek deste isteyen eski çağrılar için — listenin ilki. */
function oner(secenekler) {
  const l = onerListe({ ...secenekler, adet: 1 });
  return l.length ? l[0] : null;
}

module.exports = { oner, onerListe, olcekliSeviye, EN_FAZLA_DEGISIM, ONERI_ADEDI };
