/* ============================================================
   HYPNOSHUB — RESMİ / TANINMIŞ HESAPLAR ✔
   ------------------------------------------------------------
   Buradaki oyuncular aramada EN ÜSTTE çıkar ve adlarının yanında
   "Resmi Hesap" tiki görünür.

   YENİ HESAP EKLEMEK: listeye bir satır ekle, sunucuyu yeniden
   başlat. Başka hiçbir yeri değiştirmen gerekmiyor.

       { tag: "#ABC123", name: "OYUNCU", note: "YouTube" },

   `name` yalnızca arama eşleşmesi ve liste görüntüsü içindir;
   ekranda gösterilen ad her zaman oyundan CANLI gelir, yani
   oyuncu adını değiştirirse burası eskimez.
   `alias` isteğe bağlı: kişinin bilinen diğer yazılışları.

   ⚠️ DOĞRULAMA — buraya eklemeden önce oku:
   Bir etiketi buraya yazmak "bu hesap gerçekten o kişi" demektir.
   Aynı adı taşıyan yüzlerce hesap var (ör. "Mohamed Light" adıyla
   90 hesap bulundu), o yüzden ada bakarak seçilemez. Aşağıdakiler
   sıralamadan doğrulandı; doğrulanamayanlar bilerek EKLENMEDİ.
   ============================================================ */

const PLAYERS = [
  /* Adlar 16 Ağustos 2026'da oyundan çekildi; ekranda gösterilen ad
     her zaman canlıdır, buradaki yalnızca arama eşleşmesi içindir. */
  { tag: "#U8QCVC2Y",  name: "HYPNOS",        note: "HYPNOS CR" },
  { tag: "#G9YV9GR8R", name: "Mohamed Light", note: "Pro oyuncu" },

  /* Kullanıcının verdiği liste. */
  { tag: "#QQUJ2Y2C",  name: "RAMBOOOSTED",  note: "Yayıncı", alias: ["Ramboo", "Rambo"] },
  { tag: "#YUQYJV08",  name: "RamboOo",      note: "Yayıncı", alias: ["Ramboo", "Rambo"] },
  { tag: "#20PRCUJ0LR", name: "Ijihu",       note: "Pro oyuncu" },
  { tag: "#UV99QR88",  name: "SeeOk",        note: "Yayıncı", alias: ["Seeok", "See Ok"] },
  { tag: "#989P0PCCR", name: "Code: Furkan", note: "Yayıncı", alias: ["Code Furkan", "CodeFurkan"] },
  { tag: "#2YQJJG0VL", name: "GençAslan:)",  note: "Yayıncı", alias: ["Genc Aslan", "Genç Aslan", "GencAslan"] },
  { tag: "#RPGU98CU2", name: "Kadir:)",      note: "Yayıncı", alias: ["Kadir"] },
  { tag: "#UUJ8U8URY", name: "karam :)",     note: "Yayıncı", alias: ["karam"] },
  { tag: "#LRC0G2UQL", name: "KDS Furkan",   note: "Yayıncı", alias: ["KDS", "KDSFurkan"] },
  { tag: "#220VPRQJ90", name: "Limakulus",   note: "Yayıncı" },
];

/* ============================================================
   PRO ETİKETİ — elle eklenen liste
   ------------------------------------------------------------
   PRO rozetinin iki kaynağı var:
     1) Nihai Kademe DÜNYA ilk 100'ü — canlı sıralamadan okunur,
        her gün değişir, kimse elle güncellemez (server.js).
     2) Aşağıdaki liste — sıralamada olsun olmasın her zaman PRO.

   Aşağıdakiler 16 Ağustos 2026'da API'den doğrulandı; 64'ünün de
   hesabı mevcut. Yandaki adlar o günkü adlarıdır ve yalnızca bu
   dosyayı okunur kılmak içindir — ekranda gösterilen ad her zaman
   oyundan canlı gelir.

   YENİ EKLEMEK: listeye etiketi yaz, sunucuyu yeniden başlat.
   ============================================================ */
const PRO_TAGS = [
  "#20PRCUJ0LR",  // Ijihu
  "#G9YV9GR8R",   // Mohamed Light
  "#R09228V",     // SK Morten
  "#290UQY8C",    // TEF丨Soudy✨Kun
  "#C89L0002L",   // El Turista✨
  "#CJQY8PJQ9",   // けんくん
  "#LPRR9P",      // RUBIZALEZ
  "#V0L800PUJ",   // Betfas
  "#8LJ92G8UG",   // Vitor75
  "#80ULUJLYY",   // MH Axel
  "#2VGG29RJ2",   // Coco
  "#898Y8PGJ9",   // evolve✨律师
  "#2CLV2RP0",    // むぎったん
  "#CYURUJUUV",   // MiRnAv:)
  "#9CPCC890",    // adriel
  "#V9VYQU2PG",   // ATİ 20 CM
  "#2LJ0ULYCC",   // ぐりてゃん
  "#CRCRCVY0V",   // 奶茶神のRW❄️坤✨瓜呱
  "#88RVJCQU0",   // Eren Yoldaş
  "#UYY9QVCGC",   // Oliver
  "#9JGV0P8PY",   // Starshove
  "#9LVP2RCLL",   // Steeef
  "#GPPYR9JYR",   // Clown
  "#GVVU2P8QQ",   // DuskBeam ✨ カゲ
  "#UV99QR88",    // SeeOk
  "#CCC82YJUC",   // Müşir™
  "#8UUQG0VG2",   // Tannhaus
  "#GY09PUYLR",   // Tann
  "#2YQJJG0VL",   // GençAslan:)
  "#9G28ULYR",    // Lucas✨杰克
  "#220VPRQJ90",  // Limakulus
  "#U890Q9UQ",    // CAL Sub ™️✨Kun
  "#V8P9QQ8R9",   // ⚡DKP1610⚡｜繁星✨
  "#989P0PCCR",   // Code: Furkan
  "#20Y0UGQ9L0",  // Cunusito✨
  "#Y92RJ0L",     // ENES
  "#J8QRLJCQP",   // samtakn11✨
  "#UP8GUJ9LY",   // No Name
  "#82YJ998VR",   // 귀남MΛSTER✨️
  "#G9LPU0L",     // Lone Wolf
  "#20JQ9PYR8",   // SİVASLI
  "#PCGQLP8C8",   // BenLavukDegilim
  "#QQ888CG8C",   // Schery
  "#2LGUQJUVU",   // AnGeL
  "#GLGY89JL",    // Mgezek
  "#VG928C992",   // Alperen
  "#QUQ9GLPVV",   // akıncı
  "#JPPLYQRRU",   // Mehmet.ş
  "#2R9G0V99J",   // ECTHELION
  "#YPUVLP0Q2",   // Karsiyo
  "#G2PR80YP",    // Nova l Meriç™️
  "#Y9R22RQ2",    // Ian77
  "#U200V9P",     // JL Viiper
  "#2YQGC20C",    // TTK:MrAwesomeCR
  "#89G9RCP2",    // saif律师Kun✨
  "#U9VVGU229",   // Defineci
  "#208JPV9U08",  // TWR Damp
  "#2VJCUR2J2",   // DestroyerSP1
  "#9RQ8YRYQL",   // 老板 Ι Batan’宙斯
  "#J0VU9CGP",    // SK Dominik
  "#V8CPG02JU",   // Rin✨安之
  "#Y99Y90VQV",   // SK xopxsam2
  "#LYYRJ82U0",   // STARR NOVA
  "#C88VYCJC",    // EGW

  /* --- ikinci parti (16 Ağustos 2026, 43 etiket doğrulandı) --- */
  "#CRUGCURRP",   // Koh™️
  "#22Q8LLU8J",   // kodigogg
  "#2829V8V0L",   // Reminor
  "#208R8PQJP9",  // NK Tanjiro
  "#U8RYGC8GU",   // Polaris
  "#RRLV0GQCV",   // ZQuentino
  "#2LQ2YP98",    // SK xopxsam
  "#JPPC9URJ",    // てち
  "#P8RLY0V9",    // Kitashiyan
  "#2U9UPQL0C",   // Tiny Jason
  "#UJYRYCU9",    // 鬼舞辻無惨
  "#YP9VPGUUG",   // CHI Pompeyo4
  "#8UY9VLJLU",   // thitay04
  "#RP0L2Y8C9",   // Ardentoas19
  "#RJ88Y8U08",   // Pedro™️
  "#V20U0YRCY",   // WR I Clisman™✨
  "#UJY9VC0QR",   // El bot 3000
  "#PCUP9YLVG",   // Kimchi77✨小小罗
  "#20PYQL0PLC",  // ✨ Alphqq
  "#2JRLG8PUQ",   // RemiEli
  "#RVCQ2CQGJ",   // khazardy✨安之
  "#UGU2QLJVL",   // Yoko☔️
  "#22LC8JG02",   // JorZ
  "#VR8YGR8YL",   // 91至寒❤️和韧✨瓜呱
  "#JCPRL800Y",   // Mini Smoke
  "#LJQVVVQGR",   // TMX I Mateja
  "#J8R89YC8",    // Hunter
  "#202GUYUP",    // Wyze❤️Ultimo
  "#YUY92PP9",    // SeeOk (ikinci hesap)
  "#QCPQVCP0",    // Taquito nuclear
  "#UJRCC9PYY",   // Cosmiik
  "#C0V0UQ9UY",   // Ryley
  "#JQ2V2JJ8G",   // 枫｜rakan❤️安之
  "#2YYLJLYYR",   // FS丨有血性的Pat✨
  "#2CVPYP892",   // ege stone
  "#VP9GJYQ2",    // OS xAlee
  "#Y022GRCJQ",   // SandBox
  "#R2PLLVCY8",   // WL ツ Dam’s ✨
  "#GU99JUJ",     // 神│Venpers™☆
  "#GQC2Q2PVG",   // Seb✨航之輔
  "#UJRR9RJUL",   // Dess
  "#UGUQR20V9",   // Unstoppable
];

/* Madalyon eşiği: bu kadar Nihai Kademe madalyonu gören HERKES
   otomatik PRO sayılır — listeye eklenmesi gerekmez, düşerse de
   kendiliğinden kalkar. Ölçüldü: 16 Ağustos 2026'da dünya birincisi
   2878 madalyondaydı, yani eşiği bugün kimse geçmiyor; kural
   sezon ilerledikçe kendiliğinden devreye girecek. */
const PRO_MIN_MEDALS = 3000;

const norm = (s) => String(s || "").toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
/* Süs ve noktalama atılmış biçim. Adlarda ":)" gibi işaretler var
   ("Code: Furkan", "GençAslan:)"); kullanıcı bunları yazmaz, o yüzden
   eşleşme sade biçim üzerinden de deneniyor. */
const bare = (s) => norm(s).replace(/[^a-z0-9çğıöşü]/gi, "");
const normTag = (t) => "#" + String(t || "").replace(/^#/, "").toUpperCase();

/* tag -> kayıt */
const BY_TAG = new Map(PLAYERS.map((p) => [normTag(p.tag), p]));

/* Arama sorgusu bu hesaplardan birine uyuyor mu?
   Ad ya da takma adların herhangi biri sorguyu İÇERİYORSA sayılır;
   "moh" yazınca da Mohamed Light çıksın diye. */
function matches(query) {
  const q = norm(query), qb = bare(query);
  if (!q) return [];
  return PLAYERS.filter((p) => {
    const adlar = [p.name, ...(p.alias || [])];
    return adlar.some((a) => {
      const n = norm(a), nb = bare(a);
      return n.includes(q) || q.includes(n) || (qb.length >= 2 && (nb.includes(qb) || qb.includes(nb)));
    });
  });
}

const isVerified = (tag) => BY_TAG.has(normTag(tag));
const info = (tag) => BY_TAG.get(normTag(tag)) || null;

/* Elle eklenen PRO listesi. Dünya ilk 100 buna EK: bir oyuncu
   listede olmasa da o an ilk 100'deyse yine PRO görünür. */
const PRO_SET = new Set(PRO_TAGS.map(normTag));
const isPro = (tag) => PRO_SET.has(normTag(tag));

module.exports = { PLAYERS, PRO_TAGS, PRO_SET, PRO_MIN_MEDALS,
                   matches, isVerified, info, isPro, normTag };
