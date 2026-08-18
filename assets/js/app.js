/* ============================================================
   HYPNOSHUB — Shared application logic
   - Theme (light/dark) + persistence
   - Language (TR/EN) via data-i18n
   - API client (Node proxy) with automatic demo fallback
   - Render helpers: cards, deck icons, tables, modal, copyDeck
   ============================================================ */

// If the page is served by the Node proxy (http/https), talk to the same
// origin → everything is LIVE with no CORS issue. If opened as a bare file,
// fall back to the local proxy address.
const API_BASE = (window.HYPNOSHUB_API_BASE)
  || (location.origin && location.origin.startsWith("http") ? location.origin + "/api" : "http://localhost:8787/api");

/* Social links */
const SOCIAL = {
  instagram: "https://www.instagram.com/muhsin_ucaa/",
  youtube: "https://www.youtube.com/@hypnoscr",
  youtubeChannelId: "UC5pUCwGNR9rnoWLfweHcnRw",
};
/* İletişim bilgisi. SOCIAL'dan ayrı tutuluyor: SOCIAL sitenin/kanalın
   takip edilecek hesapları, burası ise siteye ulaşmak için tek adres.
   Kişisel Instagram bilerek kaldırıldı — iletişim yalnızca site postası. */
const CONTACT = {
  mail: "infohypnoshub@gmail.com",
};

/* Relative time: "9 saat önce" / "9 hours ago" */
function relativeTime(iso){
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  let s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  const units = LANG === "tr"
    ? [["yıl",31536000],["ay",2592000],["hafta",604800],["gün",86400],["saat",3600],["dakika",60],["saniye",1]]
    : [["year",31536000],["month",2592000],["week",604800],["day",86400],["hour",3600],["minute",60],["second",1]];
  for (const [name, sec] of units){
    if (s >= sec){ const n = Math.floor(s/sec); return LANG==="tr" ? `${n} ${name} önce` : `${n} ${name}${n>1?"s":""} ago`; }
  }
  return LANG==="tr" ? "az önce" : "just now";
}

const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch {} },
};

/* ---------- Theme ---------- */
function applyTheme(tm){
  document.documentElement.setAttribute("data-theme", tm);
  store.set("hs-theme", tm);
  document.querySelectorAll("[data-theme-icon]").forEach(el => el.innerHTML = tm === "dark" ? ICONS.sun : ICONS.moon);
}
/* ============================================================
   SES  🔊  — dosyasız, kodla üretilen efektler
   ------------------------------------------------------------
   Neden ses DOSYASI yok:

   1) Çarkın tıkları sabit hızda OLMAMALI. Çark yavaşladıkça
      tıklar da seyrekleşmeli, yoksa kulak sahteliği hemen
      yakalıyor. Hazır bir mp3 bunu yapamaz; tıkların tam olarak
      çarkın hangi anda hangi dilimi geçtiğine göre planlanması
      gerekiyor (bkz. eglence.html → carkSesiPlanla).
   2) Barındırılacak dosya, indirilecek bayt ve bozulacak yol
      olmuyor; çevrimdışı da çalışıyor.

   Ses AÇILIŞTA ÇALMAZ. Tarayıcılar kullanıcı dokunmadan ses
   çalmayı engeller (ve haklılar); AudioContext ilk tıklamada
   kuruluyor, o yüzden `sesUyandir()` mutlaka bir tıklama
   işleyicisinin içinden çağrılmalı.

   Kapatma tercihi cihazda saklanıyor ve BÜTÜN oyunlar için
   geçerli — ileride başka bir oyuna ses eklenirse ayrı bir
   düğme gerekmesin.
   ============================================================ */
const SES_ANAHTAR = "hs_ses";
let sesBaglam = null, sesGurultu = null;

/* Varsayılan: AÇIK. Kapatan kişinin tercihi saklanıyor. */
function sesAcikMi(){
  try { return localStorage.getItem(SES_ANAHTAR) !== "0"; } catch { return true; }
}
function sesAyarla(acik){
  try { localStorage.setItem(SES_ANAHTAR, acik ? "1" : "0"); } catch {}
  document.querySelectorAll("[data-ses-dugme]").forEach(sesDugmesiCiz);
  return acik;
}
function sesDegistir(){
  const yeni = !sesAcikMi();
  sesAyarla(yeni);
  if (yeni) { sesUyandir(); sesTik(0, 0.5); }   // açınca tek bir tık: çalıştığı duyulsun
  return yeni;
}
function sesDugmesiCiz(el){
  const acik = sesAcikMi();
  el.textContent = acik ? "🔊" : "🔇";
  el.setAttribute("aria-pressed", String(acik));
  el.title = acik ? "Sesi kapat" : "Sesi aç";
}

/* AudioContext'i kurar/uyandırır. TIKLAMA İÇİNDEN çağrılmalı. */
function sesUyandir(){
  if (!sesAcikMi()) return null;
  try {
    if (!sesBaglam){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      sesBaglam = new AC();
      /* Tık sesi için kısa bir gürültü tamponu — bir kez üretilip
         her tıkta yeniden kullanılıyor. Osilatörle üretilen "bip"
         plastik mandalın peglere çarpmasına benzemiyor; gürültüyü
         bant geçiren süzgeçten geçirmek benziyor. */
      const n = Math.floor(sesBaglam.sampleRate * 0.05);
      sesGurultu = sesBaglam.createBuffer(1, n, sesBaglam.sampleRate);
      const v = sesGurultu.getChannelData(0);
      for (let i = 0; i < n; i++) v[i] = Math.random() * 2 - 1;
    }
    if (sesBaglam.state === "suspended") sesBaglam.resume();
    return sesBaglam;
  } catch { return null; }
}
/* Şu anki ses saati — planlama bunun üstüne kuruluyor. */
function sesSaati(){ const c = sesUyandir(); return c ? c.currentTime : 0; }

/* Tek bir "tık". `gecikme` saniye cinsinden, ŞİMDİden itibaren.
   `siddet` 0–1. Tonu hafifçe oynatıyoruz; birebir aynı tık arka
   arkaya çalınca makineli tüfek gibi duyuluyor. */
function sesTik(gecikme = 0, siddet = 1){
  const c = sesUyandir(); if (!c || !sesGurultu) return;
  const t = c.currentTime + Math.max(0, gecikme);
  const src = c.createBufferSource(); src.buffer = sesGurultu;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1500 + Math.random() * 900;
  bp.Q.value = 1.4;
  const g = c.createGain();
  const tepe = 0.16 * Math.min(1, Math.max(0.05, siddet));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(tepe, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  src.connect(bp); bp.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + 0.06);
}

/* Sonuç sesi: kısa yükselen üç nota. */
function sesKazandi(gecikme = 0){
  const c = sesUyandir(); if (!c) return;
  const t0 = c.currentTime + Math.max(0, gecikme);
  [0, 0.09, 0.18].forEach((d, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "triangle";
    o.frequency.value = [523.25, 659.25, 783.99][i];      // do–mi–sol
    const t = t0 + d;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (i === 2 ? 0.45 : 0.16));
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + (i === 2 ? 0.5 : 0.2));
  });
}

function toggleTheme(){
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(cur === "dark" ? "light" : "dark");
}

/* ---------- i18n ---------- */
const I18N = {
  tr: {
    "nav.home":"ANA SAYFA","nav.meta":"META","nav.anti":"Anti Deste","nav.ranks":"SIRALAMALAR",
    "nav.live":"SON MAÇLAR","nav.cards":"KARTLAR","nav.updates":"GÜNCELLEMELER","nav.fun":"EĞLENCE","nav.cenabet":"CENABET",
    /* Mobil alt çubuk için kısa karşılıklar. Altı sekme 375 piksele
       bölününce sekme başına ~62 piksel düşüyor; "SIRALAMALAR" ve
       "SON MAÇLAR" oraya sığmayıp üç noktayla kesiliyordu. Kesik yazı
       yerine kısa ama tam bir kelime daha okunur. */
    "bn.home":"ANA SAYFA","bn.ranks":"SIRALAMA","bn.live":"MAÇLAR",
    "bn.meta":"META","bn.cards":"KARTLAR","bn.fun":"EĞLENCE",
    /* Kısa tutuluyor: başlıktaki kutu dar ve uzun metin yarıda kesiliyordu
       ("Oyuncu veya klan adı ya da etiketi..." ölçüldü, 244 piksel istiyor). */
    "search.player":"Oyuncu","search.clan":"Klan","search.ph":"İsim ya da #etiket",
    "hero.eyebrow":"CLASH ROYALE ANALİZ PLATFORMU",
    "hero.title":"CLASH ROYALE İSTATİSTİKLERİNİ KEŞFET",
    "hero.sub":"Oyuncuları ve klanları ara, meta desteleri incele, küresel sıralamaları takip et ve tek tıkla rastgele meta destesi oluştur.",
    "hero.cta1":"Oyuncu Ara","hero.cta2":"Sıralamaları Gör",
    "home.meta.title":"Aktif Meta Desteleri","home.meta.sub":"Şu an en çok kazandıran desteler",
    "home.player.title":"Oyuncu Analizi","home.player.sub":"Oyuncu adı veya etiketi ile ara",
    "home.clan.title":"Klan Arama","home.clan.sub":"Klan üyelerini ve bağışları incele",
    "home.ranks.title":"Küresel Sıralamalar","home.ranks.sub":"Dünyanın en iyileri",
    "home.gen.title":"Rastgele Deste Oluşturucu","home.gen.sub":"Çarkı çevir, günün meta destesini keşfet",
    "gen.button":"RASTGELE META DESTESİ OLUŞTUR","gen.result":"GÜNÜN META DESTESİ:",
    "gen.winrate":"Kazanma Oranı","gen.usage":"Kullanım","gen.elixir":"Ort. İksir",
    "gen.copy":"Desteyi Kopyala","gen.copied":"Kopyalandı!","gen.tip":"Oynanış İpucu","gen.open":"Oyunda Aç",
    "ranks.title":"GLOBAL SIRALAMALAR","ranks.sub":"Aktif sezon — en iyi 100 oyuncu",
    "ranks.pol":"Nihai Kademe","ranks.tr":"Kupa Yolu","ranks.deck":"SON MAÇTAKİ DESTE",
    "col.rank":"SIRA","col.player":"OYUNCU","col.trophies":"MADALYON","col.points":"MADALYON","col.clan":"KLAN",
    "clan.title":"KLAN ÜYELERİ","col.no":"NO","col.role":"ROL","col.level":"SEVİYE","col.trophy":"KUPA","col.donation":"BAĞIŞ",
    "footer.disclaimer":"Sitemizde kullanılan veriler ve resimler Clash Royale API'den çekilmektedir.",
    "footer.copyright":"Telif Hakkı","footer.contact":"İletişim","footer.privacy":"Gizlilik ve KVKK","msg.title":"Mesajlar","pro.admin":"PRO Başvuruları","admin.users":"Kullanıcı Yönetimi",
    "api.off":"Veri alınamadı","api.live":"Canlı API",
    "err.title":"Veri alınamadı",
    "err.body":"Sunucuya ya da Clash Royale API'sine ulaşılamadı. Yanlış bilgi vermemek için örnek veri göstermiyoruz.",
    "err.retry":"Yeniden dene",
    "view.profile":"Profili Gör","btn.search":"Ara",
    "cards.title":"KARTLAR","cards.sub":"Tüm Clash Royale kartları — enderlik ve iksir maliyetine göre",
    "updates.title":"GÜNCELLEMELER","updates.sub":"Son meta değişiklikleri ve site haberleri",
    "live.title":"SON MAÇLAR","live.sub":"Nihai Kademe ilk 100 oyuncusunun sıralı maçları","live.refresh":"Yenile","live.vs":"KARŞI",
    "profile.wins":"Galibiyet","profile.best":"En İyi","profile.level":"Seviye","profile.3crown":"3 Taç",
    "profile.battles":"Son Savaşlar","profile.deck":"Güncel Deste","profile.graph":"Kupa Geçmişi","profile.evo":"Evrim Durumu",
    "profile.leagues":"Lig Geçmişi","profile.league":"Lig",
    "profile.pol":"Nihai Kademe","profile.polrank":"Dünya Sırası","profile.tr":"Kupa Yolu",
    "profile.collection":"Kart Koleksiyonu","profile.records":"Rekorlar","profile.losses":"Mağlubiyet",
    "profile.winrate":"Kazanma %","profile.challenge":"Meydan Okuma Rekoru","profile.tourbest":"Turnuva Derecesi",
    "profile.total":"Toplam Maç","profile.vs":"karşı",
    /* --- shared UI --- */
    "unit.elixir":"iksir","unit.member":"üye","unit.war":"savaş","unit.card":"kart","unit.battle":"maç",
    "unit.players":"oyuncu","unit.decks":"deste","unit.reqTrophies":"kupa gerekli","unit.worldNo":"Dünya",
    "fav.title":"Favori Oyuncular",
    "tag.evo":"Evrim","tag.hero":"Kahraman","tag.champ":"Şampiyon","tag.soon":"Yakında",
    "tip.noEvoArt":"evrimli oynandı, ama bu kartın evrim görseli yayınlanmamış",
    "word.none":"Klansız","word.all":"Tümü","word.win":"GALİBİYET","word.loss":"MAĞLUBİYET","word.draw":"BERABERE",
    "word.usage":"Kullanım","word.winrate":"galibiyet","word.copy":"Kopyala","word.open":"Oyunda Aç",
    "word.retry":"Tekrar Dene","word.more":"Tümü →","word.loading":"Yükleniyor…","word.search":"Ara",
    "clan.open":"Herkese açık","clan.invite":"Davetle","clan.closed":"Kapalı",
    "role.leader":"Lider","role.coLeader":"Yardımcı Lider","role.elder":"Büyük","role.member":"Üye",
    "bt.pathOfLegend":"Nihai Kademe","bt.PvP":"Kupa Yolu","bt.friendly":"Dostluk","bt.clanMate":"Klan Dostluk",
    "bt.riverRacePvP":"Klan Savaşı","bt.riverRaceDuel":"Klan Düellosu","bt.riverRaceDuelColosseum":"Kolezyum",
    "bt.casual1v1":"Serbest","bt.casual2v2":"Serbest 2v2","bt.challenge":"Meydan Okuma","bt.tournament":"Turnuva",
    "bt.boatBattle":"Tekne Savaşı","bt.practice":"Antrenman","bt.trail":"Deneme","bt.other":"Maç",
    "rarity.common":"Sıradan","rarity.rare":"Ender","rarity.epic":"Destansı",
    "rarity.legendary":"Efsanevi","rarity.champion":"Şampiyon",
    "kind.Troop":"Asker","kind.Building":"Bina","kind.Spell":"Büyü",
    /* --- chrome --- */
    "chrome.menu":"MENÜ","chrome.fun":"EĞLENCE","chrome.theme":"Açık / Koyu tema","chrome.lang":"Dil değiştir",
    "chrome.searchType":"Arama türü","chrome.about":"Clash Royale oyuncu, klan ve meta istatistiklerini tek çatı altında sunan analiz platformu.",
    "chrome.credit":"Tasarım & Geliştirme","chrome.hint":"Etiket (#ABC) veya isimle ara",
    "chrome.clanBoard":"Klan Liderlik Tablosu","chrome.newFun":"Yeni eğlenceler","chrome.site":"Site",
    "fun.rank":"Kart Sıralama Oyunu","fun.deck":"Deste Jeneratörü","fun.wheel":"Rastgele Meta Deste Çarkı","fun.cenabet":"Cenabet Buton",
    "fun.pts":"puanlı","fun.earns":"Bu oyun Tokmakçılar tablosuna puan kazandırır","fb.section":"BİZE YAZ","fb.title":"Şikayet & Öneri","fb.inbox":"Gelen Mesajlar","fun.daily":"Günün Kartı","fun.duel":"Deste Düellosu","fun.missing":"Eksik Kartı Bul","fun.clash":"Kart Kapışması","fun.quiz":"Tokmak Yarışması","fun.guess":"Kart Tahmin Oyunu","fun.title":"Oyunlar & Eğlence",
    /* --- home tiles --- */
    "tile.ranks":"Sıralamalar","tile.ranks.s":"Nihai Kademe & Kupa Yolu",
    "tile.clans":"Klan Liderlik","tile.clans.s":"En iyi klanlar",
    "tile.live":"Son Maçlar","tile.live.s":"Nihai ilk 100",
    "tile.meta":"Meta Desteler","tile.meta.s":"Güncel meta",
    "tile.cards":"Kartlar","tile.cards.s":"Tüm kartlar",
    "tile.anti":"Anti Deste","tile.anti.s":"Karşındakini ne yener?",
    "tile.fun":"Eğlence","tile.new":"Yeni Eğlenceler",
    "tile.pts":"Puanlı","tile.nopts":"Puansız",
    "home.searchP":"Oyuncu Ara","home.searchC":"Klan Ara",
    "home.phP":"Oyuncu adı veya #etiket","home.phC":"Klan adı veya #etiket",
    "home.hint":"İsimle ara veya etiket (#ABC) yapıştır",
    "home.hintTag":"İsimle bulamadın mı? #etiketini yapıştır — kesin sonuç verir.",
    "home.topPlayers":"EN İYİ OYUNCULAR","home.topClans":"KLAN LİDERLİK TABLOSU",
    "home.allPlayers":"Tüm en iyi oyuncuları görüntüle →","home.allClans":"Tüm en iyi klanları görüntüle →",
    "home.videos":"Son","home.videosB":"Videolar","home.channel":"HYPNOS CR YOUTUBE KANALI",
    "home.sub":"Abone Ol",
    /* --- meta page --- */
    "meta.sortUsage":"🔥 En Çok Kullanılan","meta.sortWin":"🏅 En Yüksek Galibiyet",
    "meta.clickHint":"Bir desteye tıklayın → o desteyle en yükseğe çıkan oyuncular",
    
    "meta.eyebrow":"AKTİF SEZON","meta.thin":"az veri",
    "cards.hint":"Bir karta tıkla → o kartın kullanıldığı güncel meta desteleri gör.",
    "cards.heroHint":"Oyundaki kahramanlar. Bir kahramana tıkla → o kartın meta desteleri.",
    "cards.heroFilter":"🦸 Kahramanlar","cards.deckHead":"BU KARTIN EN ÇOK KULLANILDIĞI DESTELER",
    /* --- errors --- */
    "err.offline":"Sunucuya ulaşılamadı. Proxy çalışıyor mu?",
    "err.noResult":"Sonuç yok.","err.notFound":"Bulunamadı.",
  },
  en: {
    "nav.home":"HOME","nav.meta":"META","nav.anti":"Counter Decks","nav.ranks":"RANKINGS",
    "nav.live":"RECENT MATCHES","nav.cards":"CARDS","nav.updates":"UPDATES","nav.fun":"FUN","nav.cenabet":"CENABET",
    "bn.home":"HOME","bn.ranks":"RANKS","bn.live":"MATCHES",
    "bn.meta":"META","bn.cards":"CARDS","bn.fun":"FUN",
    "search.player":"Player","search.clan":"Clan","search.ph":"Name or #tag",
    "hero.eyebrow":"CLASH ROYALE ANALYTICS PLATFORM",
    "hero.title":"DISCOVER CLASH ROYALE STATISTICS",
    "hero.sub":"Search players and clans, study meta decks, follow global rankings, and generate a random meta deck with one click.",
    "hero.cta1":"Search Player","hero.cta2":"View Rankings",
    "home.meta.title":"Active Meta Decks","home.meta.sub":"Top-winning decks right now",
    "home.player.title":"Player Analysis","home.player.sub":"Search by player tag or name",
    "home.clan.title":"Clan Search","home.clan.sub":"Inspect clan members and donations",
    "home.ranks.title":"Global Rankings","home.ranks.sub":"The world's best",
    "home.gen.title":"Random Deck Generator","home.gen.sub":"Spin the wheel, discover today's meta deck",
    "gen.button":"GENERATE RANDOM META DECK","gen.result":"META DECK OF THE DAY:",
    "gen.winrate":"Win Rate","gen.usage":"Usage","gen.elixir":"Avg. Elixir",
    "gen.copy":"Copy Deck","gen.copied":"Copied!","gen.tip":"Gameplay Tip","gen.open":"Open in Game",
    "ranks.title":"GLOBAL RANKINGS","ranks.sub":"Active season — top 100 players",
    "ranks.pol":"Path of Legends","ranks.tr":"Trophy Road","ranks.deck":"LAST BATTLE DECK",
    "col.rank":"RANK","col.player":"PLAYER","col.trophies":"MEDALS","col.points":"MEDALS","col.clan":"CLAN",
    "clan.title":"CLAN MEMBERS","col.no":"NO","col.role":"ROLE","col.level":"LEVEL","col.trophy":"TROPHIES","col.donation":"DONATIONS",
    "footer.disclaimer":"Data and images on our site are drawn from the Clash Royale API.",
    "footer.copyright":"Copyright","footer.contact":"Contact","footer.privacy":"Privacy & KVKK","msg.title":"Messages","pro.admin":"Pro applications","admin.users":"User management",
    "api.off":"No data","api.live":"Live API",
    "err.title":"Could not load data",
    "err.body":"The server or the Clash Royale API could not be reached. We do not show sample data, so nothing here is made up.",
    "err.retry":"Try again",
    "view.profile":"View Profile","btn.search":"Search",
    "cards.title":"CARDS","cards.sub":"All Clash Royale cards — by rarity and elixir cost",
    "updates.title":"UPDATES","updates.sub":"Latest meta changes and site news",
    "live.title":"RECENT MATCHES","live.sub":"Ranked games of the Path of Legends top 100","live.refresh":"Refresh","live.vs":"VS",
    "profile.wins":"Wins","profile.best":"Best","profile.level":"Level","profile.3crown":"3-Crown",
    "profile.battles":"Recent Battles","profile.deck":"Current Deck","profile.graph":"Trophy History","profile.evo":"Evolution Status",
    "profile.leagues":"League History","profile.league":"League",
    "profile.pol":"Path of Legends","profile.polrank":"World Rank","profile.tr":"Trophy Road",
    "profile.collection":"Card Collection","profile.records":"Records","profile.losses":"Losses",
    "profile.winrate":"Win %","profile.challenge":"Challenge Record","profile.tourbest":"Tournament Best",
    "profile.total":"Total Battles","profile.vs":"vs",
    /* --- shared UI --- */
    "unit.elixir":"elixir","unit.member":"members","unit.war":"war","unit.card":"cards","unit.battle":"battles",
    "unit.players":"players","unit.decks":"decks","unit.reqTrophies":"trophies required","unit.worldNo":"World",
    "fav.title":"Favourite Players",
    "tag.evo":"Evo","tag.hero":"Hero","tag.champ":"Champion","tag.soon":"Soon",
    "tip.noEvoArt":"played evolved, but this card has no published evolution artwork",
    "word.none":"No clan","word.all":"All","word.win":"WIN","word.loss":"LOSS","word.draw":"DRAW",
    "word.usage":"Usage","word.winrate":"win rate","word.copy":"Copy","word.open":"Open in Game",
    "word.retry":"Try Again","word.more":"View all →","word.loading":"Loading…","word.search":"Search",
    "clan.open":"Open","clan.invite":"Invite only","clan.closed":"Closed",
    "role.leader":"Leader","role.coLeader":"Co-leader","role.elder":"Elder","role.member":"Member",
    "bt.pathOfLegend":"Path of Legends","bt.PvP":"Trophy Road","bt.friendly":"Friendly","bt.clanMate":"Clan Friendly",
    "bt.riverRacePvP":"Clan War","bt.riverRaceDuel":"Clan Duel","bt.riverRaceDuelColosseum":"Colosseum",
    "bt.casual1v1":"Casual","bt.casual2v2":"Casual 2v2","bt.challenge":"Challenge","bt.tournament":"Tournament",
    "bt.boatBattle":"Boat Battle","bt.practice":"Practice","bt.trail":"Trail","bt.other":"Battle",
    "rarity.common":"Common","rarity.rare":"Rare","rarity.epic":"Epic",
    "rarity.legendary":"Legendary","rarity.champion":"Champion",
    "kind.Troop":"Troop","kind.Building":"Building","kind.Spell":"Spell",
    /* --- chrome --- */
    "chrome.menu":"MENU","chrome.fun":"FUN","chrome.theme":"Light / Dark theme","chrome.lang":"Change language",
    "chrome.searchType":"Search type","chrome.about":"An analytics platform bringing Clash Royale player, clan and meta statistics together in one place.",
    "chrome.credit":"Design & Development","chrome.hint":"Search by tag (#ABC) or name",
    "chrome.clanBoard":"Clan Leaderboard","chrome.newFun":"New fun stuff","chrome.site":"Site",
    "fun.rank":"Card Ranking Game","fun.deck":"Deck Generator","fun.wheel":"Random Meta Deck Wheel","fun.cenabet":"Cursed Deck Button",
    "fun.pts":"points","fun.earns":"This game earns points on the Tokmakçılar board","fb.section":"CONTACT","fb.title":"Feedback","fb.inbox":"Inbox","fun.daily":"Card of the Day","fun.duel":"Deck Duel","fun.missing":"Find the Missing Card","fun.clash":"Card Clash","fun.quiz":"Hammer Quiz","fun.guess":"Card Guessing Game","fun.title":"Games & Fun",
    /* --- home tiles --- */
    "tile.ranks":"Rankings","tile.ranks.s":"Path of Legends & Trophy Road",
    "tile.clans":"Clan Leaderboard","tile.clans.s":"The best clans",
    "tile.live":"Recent Matches","tile.live.s":"Ranked top 100",
    "tile.meta":"Meta Decks","tile.meta.s":"Current meta",
    "tile.cards":"Cards","tile.cards.s":"Every card",
    "tile.anti":"Counter Decks","tile.anti.s":"What beats what you face",
    "tile.fun":"Fun","tile.new":"New Games",
    "tile.pts":"Scored","tile.nopts":"No points",
    "home.searchP":"Search Player","home.searchC":"Search Clan",
    "home.phP":"Player name or #tag","home.phC":"Clan name or #tag",
    "home.hint":"Search by name or paste a tag (#ABC)",
    "home.topPlayers":"TOP PLAYERS","home.topClans":"CLAN LEADERBOARD",
    "home.allPlayers":"View all top players →","home.allClans":"View all top clans →",
    "home.videos":"Latest","home.videosB":"Videos","home.channel":"HYPNOS CR YOUTUBE CHANNEL",
    "home.sub":"Subscribe on",
    /* --- meta page --- */
    "meta.sortUsage":"🔥 Most Played","meta.sortWin":"🏅 Highest Win Rate",
    "meta.clickHint":"Click a deck → the pilots who climbed highest on it",
    
    "meta.eyebrow":"CURRENT SEASON","meta.thin":"thin data",
    "cards.hint":"Click a card → the current meta decks that play it.",
    "cards.heroHint":"The heroes in the game. Click one → that card's meta decks.",
    "cards.heroFilter":"🦸 Heroes","cards.deckHead":"DECKS THAT PLAY THIS CARD MOST",
    /* --- errors --- */
    "err.offline":"Could not reach the server. Is the proxy running?",
    "err.noResult":"No results.","err.notFound":"Not found.",
  },
};
let LANG = store.get("hs-lang") || "tr";
function t(key){ return (I18N[LANG] && I18N[LANG][key]) || (I18N.tr[key]) || key; }
function applyLang(lang){
  LANG = lang; store.set("hs-lang", lang);
  document.documentElement.setAttribute("lang", lang);
  document.querySelectorAll("[data-i18n]").forEach(el => el.textContent = t(el.getAttribute("data-i18n")));
  document.querySelectorAll("[data-i18n-ph]").forEach(el => el.placeholder = t(el.getAttribute("data-i18n-ph")));
  document.querySelectorAll("[data-i18n-html]").forEach(el => el.innerHTML = t(el.getAttribute("data-i18n-html")));
  document.querySelectorAll("[data-i18n-title]").forEach(el => el.title = t(el.getAttribute("data-i18n-title")));
  document.querySelectorAll("[data-lang-label]").forEach(el => el.textContent = lang.toUpperCase());
  if (typeof window.onLangChange === "function") window.onLangChange(lang);
}
/* Swapping the language has to redraw everything the page BUILT, not only the
   static nodes carrying data-i18n: card names, tables, battle rows and deck
   lists are all generated from templates and would otherwise stay in the old
   language. Each page registers how to redraw itself; the header, footer and
   drawer are rebuilt here because they are shared. */
function toggleLang(){
  const next = LANG === "tr" ? "en" : "tr";
  LANG = next; store.set("hs-lang", next);
  const active = document.querySelector(".main-nav a.active")?.getAttribute("href") || "";
  mountChrome(active);
  if (document.getElementById("hs-drawer")?.classList.contains("open")) openDrawer();
  if (typeof window.onLangChange === "function") window.onLangChange(next);
  if (typeof window.repaint === "function") window.repaint();
}

/* ---------- Icons ---------- */
const ICONS = {
  hammer: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M13.9 3.2 20.8 10.1a1 1 0 0 1 0 1.4l-1.8 1.8a1 1 0 0 1-1.4 0l-1.2-1.2-2 2 .5.5a2 2 0 0 1 0 2.8l-4.9 4.9a2.4 2.4 0 0 1-3.4-3.4l4.9-4.9a2 2 0 0 1 2.8 0l.5.5 2-2-1.2-1.2a1 1 0 0 1 0-1.4l1.8-1.8" fill="#f2b807" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/>
    </svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  /* One heart, two states: `fill="none"` for not-favourited, and the CSS class
     `.on` swaps the fill so a single icon covers both. */
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20.4 4.6 13a4.8 4.8 0 0 1 6.8-6.8l.6.6.6-.6A4.8 4.8 0 0 1 19.4 13z"/></svg>`,
  crest: `<svg viewBox="0 0 22 26" fill="none"><path d="M11 1 20 4v9c0 6-4 9.5-9 12C6 22.5 2 19 2 13V4l9-3z" fill="#1e5ae0" stroke="#0b1f4d" stroke-width="1"/><path d="M11 6l1.8 3.6 4 .6-2.9 2.8.7 4L11 15.7 7.4 17l.7-4L5.2 10.2l4-.6L11 6z" fill="#f2b807"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>`,
  playV: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  discord:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 5.3A17 17 0 0 0 15.9 4l-.2.4a13 13 0 0 1 3.7 1.9 12 12 0 0 0-10.9 0A13 13 0 0 1 12.2 4.4L12 4A17 17 0 0 0 8 5.3C5.3 9.3 4.6 13.2 5 17a17 17 0 0 0 5.1 2.6l.6-1a11 11 0 0 1-1.8-.9l.4-.3a8.5 8.5 0 0 0 7.4 0l.4.3c-.6.4-1.2.7-1.8.9l.6 1A17 17 0 0 0 19 17c.5-4.5-.7-8.4-3-11.7zM9.7 14.6c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7zm4.6 0c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7z"/></svg>`,
  instagram:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  mail:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  chevron:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>`,
  /* Resmi hesap tiki — rozetli onay işareti. */
  check:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.6l2.4 1.9 3-.3 1.2 2.8 2.8 1.2-.3 3L23 12l-1.9 2.4.3 3-2.8 1.2-1.2 2.8-3-.3L12 23l-2.4-1.9-3 .3-1.2-2.8-2.8-1.2.3-3L1 12l1.9-2.4-.3-3 2.8-1.2 1.2-2.8 3 .3L12 1.6z"/><path d="m10.6 15.4-3-3 1.3-1.3 1.7 1.7 4.5-4.5 1.3 1.3-5.8 5.8z" fill="#fff"/></svg>`,
  x_social:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 3h3l-7 8 8 10h-6.3l-5-6.2L4.8 21H1.8l7.5-8.6L1.5 3h6.4l4.5 5.7L18 3zm-1.1 16h1.7L7.2 4.8H5.4L16.9 19z"/></svg>`,
  youtube:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 8s-.2-1.6-.9-2.3c-.9-.9-1.8-.9-2.3-1C16.6 4.5 12 4.5 12 4.5s-4.6 0-7.8.2c-.5.1-1.4.1-2.3 1C1.2 6.4 1 8 1 8S.8 9.9.8 11.8v1.4C.8 15 1 17 1 17s.2 1.6.9 2.3c.9.9 2 .9 2.5 1 1.8.1 7.6.2 7.6.2s4.6 0 7.8-.3c.5-.1 1.4-.1 2.3-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8v-1.4C23.2 9.9 23 8 23 8zM9.7 15.3V8.9l6 3.2-6 3.2z"/></svg>`,
};

/* ---------- Ranked (Path of Legends) medal ----------
   Ranked play is scored in medals, not Trophy Road trophies, so ranked numbers
   carry the purple Path of Legends medal instead of the 🏆 emoji. One image,
   reused everywhere, so the browser fetches it once. */
const POL_MEDAL = "https://cdn.royaleapi.com/static/img/arenas/league10.png";
function polMedal(size = 18){
  return `<img class="pol-medal" src="${POL_MEDAL}" alt="Nihai Kademe madalyonu" title="Nihai Kademe madalyonu"
            width="${size}" height="${size}" loading="lazy">`;
}
/* Ranked score with its medal, e.g. 3.163 🏅 */
function polScore(v, size = 16){ return `${nfTR(v)} ${polMedal(size)}`; }
/* Signed medal delta: +29 green, -29 red. */
function polDelta(v, size = 15){
  if (v == null) return `<span class="muted">—</span>`;
  const cls = v > 0 ? "up" : v < 0 ? "down" : "";
  return `<span class="medal-delta ${cls}">${v > 0 ? "+" : ""}${nfTR(v)} ${polMedal(size)}</span>`;
}

/* ============================================================
   Ligler (Nihai Kademe / Path of Legends)
   ------------------------------------------------------------
   Sezon şu an YEDİ ligden oluşuyor. Ölçtük: dünya sıralamasının ilk 40'ı
   dahil hiçbir oyuncuda `leagueNumber` 7'yi geçmiyor, ve 7 madalyon ile
   dünya sırasının göründüğü tek lig. Eski hesaplarda `best` alanı hâlâ 10
   diyor — o, on ligli eski ölçekten kalma bir kayıt.

   Alt liglerin oyun içi adları için elimizde doğrulanmış bir kaynak yok
   (metin dosyasındaki TID_RANKED_LEAGUE_1..10 on ligli eski ölçeğe ait).
   Uydurmak yerine oyunun kendi kalıbını kullanıyoruz: TID_RANKED_LEAGUE_NUMBER
   = "<num>. Lig". En üst lig ise madalyon + onur listesi orada açıldığı için
   adıyla anılıyor: Nihai Şampiyon (TID_RANKED_LEAGUE_10).
   ============================================================ */
const UST_LIG = 7;                                  // ölçülen en yüksek lig

/* ------------------------------------------------------------
   BUGÜNKÜ YEDİ LİG = ESKİ ÖLÇEĞİN 4..10'U   (yeni N = eski N+3)

   Bu artık tahmin değil, iki bağımsız kanıt var:

   1) Sitenin lig rozetleri klasörüne yüklenen yedi rozet tam olarak eski
      ölçeğin 4..10 numaralı ligleri: Usta I/II/III, Şampiyon, Büyük
      Şampiyon, Asil Şampiyon, Nihai Şampiyon (TID_RANKED_LEAGUE_4..10).
      Yani yeni sistem, eski üç "Meydan Okuyucu" ligini kaldırmış.

   2) Bunun sınanabilir bir sonucu var: madalyon yalnızca EN ÜST ligde
      tutulduğuna göre, eski ölçekten kalan best=8 ve best=9 kayıtlarında
      madalyon OLMAMALI, best=10'da ise OLMALI. 200 oyuncuda ölçtük:
        best 8 → 6 kayıt, madalyonlu 0, dünya sıralı 0
        best 9 → 1 kayıt, madalyonlu 0, dünya sıralı 0
        best 10 → 28 kayıt, madalyonlu 28, dünya sıralı 28
      Tahmin birebir tuttu.

   Bu yüzden eski 8/9/10 kayıtları bugünkü 5/6/7'ye çevriliyor: hem adı hem
   rozeti doğru çıkıyor, satırdaki "eski ölçek" notu da neden farklı
   numarayla geldiğini söylüyor.
   ------------------------------------------------------------ */
const LIG_ADI_TR = { 1:"I. Usta", 2:"II. Usta", 3:"III. Usta", 4:"Şampiyon",
                     5:"Büyük Şampiyon", 6:"Asil Şampiyon", 7:"Nihai Şampiyon" };
const LIG_ADI_EN = { 1:"Master I", 2:"Master II", 3:"Master III", 4:"Champion",
                     5:"Grand Champion", 6:"Royal Champion", 7:"Ultimate Champion" };
/* Eski on ligli ölçekten gelen numarayı bugünkü ölçeğe taşı. */
const ESKI_UST_LIG = 10;
const LIG_KAYMA = ESKI_UST_LIG - UST_LIG;            // 3
const ligBugun = (n) => (n > UST_LIG ? n - LIG_KAYMA : n);

/* ------------------------------------------------------------
   BİR SEZON KAYDININ BUGÜNKÜ LİG KARŞILIĞI  (ve nerede emin olamadığımız)

   Ölçüm — 300 oyuncu + ilk 100:
     · Bugünkü ölçeğin tavanı 7: dünya 1. dahil ilk 100'ün hepsi 7'de.
     · 8/9/10 yalnızca "en iyi" kaydında görünüyor → kapanmış on ligli ölçek.
     · Madalyon ve dünya sırası SADECE tavan ligde tutuluyor (7 ve 10).
     · Aynı sezon hem "geçen" hem "en iyi" alanında duruyorsa numara ikisinde
       de AYNI (22/22) → alanlar arasında ölçek farkı yok; fark DÖNEMLER
       arasında.
     · "En iyi", güncel/geçen sezondan hiç düşük çıkmıyor (300/300).

   Buradan çıkan kesin kurallar:
     · madalyon varsa  → tavan lig (7), hangi dönemden olursa olsun
     · numara ≥ 8      → eski dönem → bugünkü karşılığı n − 3

   Çözülemeyen kısım: numara 1–7 ve madalyon yoksa kaydın hangi dönemden
   olduğu API'den OKUNAMIYOR. Kayıtta tarih/sezon kimliği yok, oyuncu
   rozetlerinde de karşılığı yok. Aynı "5" değeri bugünkü ölçekte Büyük
   Şampiyon, eski ölçekte Usta 2 demek. O yüzden bugünkü okumayı gösterip
   belirsizliği ekranda işaretliyoruz — uydurmak yerine söylüyoruz.
   ------------------------------------------------------------ */
/* `gecmis` = kayıt geçmiş bir dönemden olabilir mi? "Bu sezon" ve "geçen
   sezon" tanım gereği bugünkü ölçekte — belirsizlik yalnızca "en iyi"
   kaydında, çünkü o kayıt yıllar öncesinden kalmış olabilir. */
function ligCoz(s, gecmis = false){
  if (!s || !s.leagueNumber) return null;
  const n = s.leagueNumber;
  if (s.trophies > 0)  return { lig: UST_LIG, eski: n > UST_LIG, kesin: true };
  if (n > UST_LIG)     return { lig: n - LIG_KAYMA, eski: true, kesin: true };
  if (!gecmis)         return { lig: n, eski: false, kesin: true };
  return { lig: n, eski: false, kesin: false, altLig: Math.max(1, n - LIG_KAYMA) };
}
/* KENDİ LİG ROZETLERİMİZ — assets/img/ligler/
   Klasördeki dosya adı hem görseli hem lig adını belirliyor
   ("7 - Nihai Şampiyon.png"). Sebebi: RoyaleAPI'nin league1..10 görselleri
   bugünkü yedi ligle örtüşmüyor ve alt liglerin bugünkü Türkçe adları için
   doğrulanabilir bir kaynak yok — o yüzden tek doğru klasör.
   Klasörde karşılığı olmayan lig aşağıdaki varsayılanlara düşer. */
const LIG_KLASORU = new Map();          // n → { ad, gorsel }
async function ligleriYukle(){
  const d = await HypnoAPI._get("/leagues", 8000);
  if (!d || !Array.isArray(d.items)) return 0;
  LIG_KLASORU.clear();
  for (const x of d.items) LIG_KLASORU.set(x.n, { ad: x.ad || "", gorsel: x.gorsel || "" });
  return LIG_KLASORU.size;
}

/* ---------- ARKA PLAN FİLİGRANLARI — assets/img/filigran/ ----------
   Ana sayfadaki saydam tokmağın diğer sayfalardaki karşılığı. Hangi resmin
   nerede duracağı kodda yazılı DEĞİL: klasöre ne konursa sayfalara sırayla
   dağıtılıyor, dosya sayısı sayfa sayısından azsa baştan dönülüyor. Böylece
   iki resimle altı sayfa da doluyor ve yeni resim eklemek dosya atmaktan
   ibaret kalıyor.

   Filigran sayfanın üst bandına (.page-strip) konuyor, geneline değil:
   sayfanın gövdesindeki tablo ve kart ızgaraları opak zeminli, oraya konan
   bir filigran onların ardında kalıp hiç görünmüyor. Boş alan yalnızca
   başlık bandının sağında — ana sayfadaki tokmak da tam olarak orada.

   Ana sayfa listede yok: onun kendi tokmağı zaten hero bandında duruyor.
   Oyuncu/klan gibi detay sayfaları da yok — orada band zaten dolu. */
const FILIGRAN_SAYFALARI = [
  "siralamalar.html", "canli.html", "meta.html",
  "kartlar.html", "eglence.html", "klanlar.html",
];
async function filigranYerlestir(){
  const dosya = (location.pathname.split("/").pop() || "").toLowerCase();
  const sira = FILIGRAN_SAYFALARI.indexOf(dosya);
  if (sira < 0) return;                                  // bu sayfaya filigran koymuyoruz
  const band = document.querySelector(".page-strip");
  if (!band || band.querySelector(".page-watermark")) return;

  const d = await HypnoAPI._get("/filigran", 6000);
  const liste = (d && Array.isArray(d.items)) ? d.items.filter((x) => x.gorsel) : [];
  if (!liste.length) return;                             // klasör boş: sessizce vazgeç

  const sec = liste[sira % liste.length];
  const kutu = document.createElement("div");
  kutu.className = "page-watermark";
  kutu.setAttribute("aria-hidden", "true");
  const img = document.createElement("img");
  img.src = sec.gorsel;
  img.alt = "";
  /* Resim gelmezse bandı boşuna yükseltmiş olmayalım. */
  img.onerror = () => { kutu.remove(); band.classList.remove("filigranli"); };
  kutu.appendChild(img);
  band.appendChild(kutu);
  band.classList.add("filigranli");
}

/* `ligAdiN` / `ligGorselN` BUGÜNKÜ ölçekteki numarayı (1-7) alır — çevirim
   çağırandadır. `ligAdi` / `ligGorsel` ise HAM numarayı alıp kendisi çevirir.
   İkisi ayrı duruyor çünkü lig geçmişinde çevirimi `ligCoz` yapıyor (madalyon
   bilgisini de kullanarak) ve sonucun bir daha çevrilmemesi gerekiyor. */
function ligAdiN(b){
  if (!b) return "";
  const kendi = LIG_KLASORU.get(b);
  if (kendi && kendi.ad) return kendi.ad;              // klasördeki ad her şeyin önünde
  const ozel = (LANG === "tr" ? LIG_ADI_TR : LIG_ADI_EN)[b];
  if (ozel) return ozel;
  return LANG === "tr" ? `${b}. Lig` : `League ${b}`;
}
function ligGorselN(b){
  const kendi = LIG_KLASORU.get(b);
  if (kendi && kendi.gorsel) return kendi.gorsel;
  const k = Math.min(Math.max(parseInt(b) || 1, 1), 10);
  return `https://cdn.royaleapi.com/static/img/arenas/league${k}.png`;
}
function ligAdi(n){ return n ? ligAdiN(ligBugun(n)) : ""; }
const ligEski = (n) => n > UST_LIG;   // eski on ligli ölçekten kalma kayıt
/* Lig rozeti: önce kendi klasörümüz, yoksa RoyaleAPI'nin league1..10 görseli.
   Eski ölçekten gelen numara önce bugünküne çevriliyor (8→5, 9→6, 10→7).
   Yedek adres eski numarayı kullanır: RoyaleAPI görselleri o ölçekte. */
function ligGorsel(n){ return ligGorselN(ligBugun(n)); }
/* Bir sezon sonucunu tek satırda anlat: "Nihai Şampiyon · 1.865 madalyon".
   Madalyon yoksa yalnızca lig yazılır — ki asıl hata buydu: madalyon
   kazanmamış oyuncuya madalyon yazmak. */
function ligOzet(s){
  if (!s || !s.leagueNumber) return "";
  const ad = ligAdi(s.leagueNumber);
  if (!s.trophies) return ad;
  const sira = s.rank ? ` · #${nfTR(s.rank)}` : "";
  return `${ad} · ${nfTR(s.trophies)} ${LANG === "tr" ? "madalyon" : "medals"}${sira}`;
}

/* ---------- Card rendering ---------- */
function cardImgUrl(slug){ return `https://cdn.royaleapi.com/static/img/cards-150/${slug}.png`; }
function cardImgUrlEvo(slug){ return `https://cdn.royaleapi.com/static/img/cards-150/${slug}-ev1.png`; }

/* Live-API cards arrive with an English name but no CDN slug, so derive one
   ("Mini P.E.K.K.A" → "mini-pekka") to reach the RoyaleAPI artwork. */
function cardSlug(name){
  return String(name || "").toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* Resolve card art as an ordered candidate list; the <img> walks it on error.

   The small RoyaleAPI 150px art comes first on purpose. Supercell's iconUrls
   are 285x420 and ~150KB each — a full card grid is 17.6MB, and the largest
   files (the champions, ~175KB) were still streaming when the page painted,
   so they showed up half-drawn. The same 122 cards cost 0.2MB from RoyaleAPI.
   Supercell's own URL stays as the fallback, so a card the CDN has not
   published yet still renders.

   Evolution art needs both sources too: RoyaleAPI has 42 of the 54 cards that
   can evolve and Supercell exposes 41. Whatever neither has falls through to
   the base artwork instead of showing a broken image. */
function cardArt(c, useEvo, preferHero){
  const slug = c.img || cardSlug(c.name);
  const chain = [];
  if (useEvo){
    if (slug) chain.push(cardImgUrlEvo(slug));
    if (c.imgUrlEvo) chain.push(c.imgUrlEvo);
  }
  /* Deliberately NO hero portrait in this chain.

     Evolution and hero are two different systems and must never share a
     picture. An earlier attempt let a card that was played EVOLVED fall back
     to its hero portrait when no evolution artwork existed — which produced a
     gold hero image under a purple EVRİM badge, i.e. exactly the confusion it
     was meant to solve. Evolutions with no published art (Berserker, Barbarian
     Barrel, Balloon, Mini P.E.K.K.A) now show the plain card instead, and the
     badge still states what was actually played.

     Hero portraits are used only where we know a card is being shown AS a
     hero: the Kahramanlar section, via `preferHero`. */
  if (slug) chain.push(cardImgUrl(slug));
  if (c.imgUrl) chain.push(c.imgUrl);
  /* Portre HER ÇİZİMDE tazeden aranıyor, kartın kaydedildiği andaki değerine
     güvenilmiyor. Savaş günlüğünden gelen kartlar /api/cards yanıtından ÖNCE
     kaydedilebiliyor; o an HERO_IMG boş olduğu için portre kalıcı olarak boş
     kalıyordu ve kahraman yuvası altın çerçeveyle ama düz kart resmiyle
     çiziliyordu. */
  const portre = c.heroImg || HERO_IMG.get(c.name) || "";
  if (preferHero && portre) chain.unshift(portre);
  return { primary: chain[0], rest: chain.slice(1) };
}
/* src + the remaining candidates, walked by nextArt() on error. */
function artAttrs(a){
  return `src="${a.primary}"${a.rest.length ? ` data-fb="${a.rest.join("|")}"` : ""}`;
}
function nextArt(img){
  const chain = (img.getAttribute("data-fb") || "").split("|").filter(Boolean);
  if (!chain.length) return false;
  img.setAttribute("data-fb", chain.slice(1).join("|"));
  img.src = chain[0];
  return true;
}

function renderCard(key, opts = {}){
  const c = CARD_DB[key];
  if (!c) return "";
  const isEvo = opts.evo ?? c.evo;
  /* Three different things, three different badges:
       evo    — an evolution slot (purple)
       hero   — a HERO slot, the game's kahraman system (gold, own portrait)
       champ  — a champion-rarity card (gold, "Şampiyon")
     They used to collapse into two, which is what made evolution and hero
     look like the same thing. */
  const isHeroSlot = !!opts.heroSlot;
  const isHero = opts.hero ?? c.hero ?? (c.rarity === "champion");
  const lvl = opts.level, max = opts.max;
  const art = cardArt(c, isEvo, opts.heroArt || isHeroSlot);
  const safeName = String(cardName(c)).replace(/"/g, "&quot;");
  /* Some evolutions have no artwork published anywhere, so the plain card is
     drawn under an EVRİM badge. Say so in the tooltip rather than leaving it
     looking like a mislabelled card. */
  const noEvoArt = isEvo && !isHeroSlot && !c.imgUrlEvo && !EVO_ART.has(c.name);
  const tip = `${safeName} — ${c.elixir} ${t("unit.elixir")}`
    + (noEvoArt ? ` · ${t("tip.noEvoArt")}` : "");
  return `
    <div class="cr-card ${isEvo ? "evo" : ""}${isHeroSlot ? " heroslot" : ""}${isHero ? " champ" : ""}${noEvoArt ? " no-evo-art" : ""}" title="${tip}"${opts.onClick?` onclick="${opts.onClick}" style="cursor:pointer"`:""}>
      ${isHeroSlot ? `<span class="heroslot-tag">${t("tag.hero")}</span>`
        : isEvo ? `<span class="evo-tag">${t("tag.evo")}</span>`
        : isHero ? `<span class="hero-tag">${t("tag.champ")}</span>` : ""}
      <span class="elixir">${c.elixir}</span>
      <div class="art" data-name="${safeName}">
        <img ${artAttrs(art)} alt="${safeName}" loading="lazy" onerror="cardImgFail(this)">
      </div>
      ${lvl != null ? `<div class="lvl ${max ? "max" : ""}">${max ? "MAX" : "Sv. " + lvl}</div>` : ""}
    </div>`;
}
function cardImgFail(img){
  if (nextArt(img)) return;
  const art = img.parentElement;
  if (!art || art.querySelector(".fallback")) { img.remove(); return; }
  img.remove();
  const d = document.createElement("div");
  d.className = "fallback"; d.textContent = art.getAttribute("data-name") || "";
  art.appendChild(d);
}

/* Small inline deck icon row. `evoList` = keys that are evolutions in THIS deck. */
function deckIcons(cards, evoList = [], cls = "", heroList = []){
  const evoSet = new Set(evoList || []);
  const heroSet = new Set(heroList || []);
  return `<span class="deck-icons ${cls}">${(cards||[]).map(k => {
    const c = CARD_DB[k]; if (!c) return "";
    const useEvo = evoSet.has(k);
    const useHero = heroSet.has(k);
    const art = cardArt(c, useEvo, useHero);
    const cls = (useEvo ? " evo" : "") + (useHero ? " heroslot" : "") + (c.hero ? " champ" : "");
    const nm = cardName(c);
    const tip = nm + (useHero ? ` (${t("tag.hero")})` : useEvo ? ` (${t("tag.evo")})` : c.hero ? ` (${t("tag.champ")})` : "");
    return `<span class="di${cls}" title="${tip}" data-ab="${(nm||'?').slice(0,2)}"><img ${artAttrs(art)} alt="${nm}" loading="lazy" onerror="diFail(this)"></span>`;
  }).join("")}</span>`;
}
/* Render an 8-card deck grid, marking only this deck's evolution cards. */
function deckCards(deck, opts = {}){
  const cards = deck.cards || deck;
  const evoSet = new Set(deck.evo || []);
  return cards.map(k => renderCard(k, { evo: evoSet.has(k), level: opts.level, max: opts.max, onClick: opts.onClick })).join("");
}
function diFail(img){
  if (nextArt(img)) return;
  const span = img.parentElement;
  img.remove();
  span.classList.add("di-fb");
  span.textContent = span.getAttribute("data-ab") || "?";
}

/* Bir destede en fazla kaç ÖZEL yuva olabilir (evrim + kahraman birlikte).
   6.117 canlı savaş destesinde ölçüldü: %70'i tam 3, %29'u 2, geri kalanı 1.
   Üçün üstü yalnızca 41 destede görüldü ve hepsi sıralamalı olmayan mod. */
const MAX_SPECIAL_SLOTS = 3;

/* Cards that are played as evolutions in live battles but that Supercell's
   /cards endpoint does not expose an `evolutionMedium` icon for. Without this
   list they can never be recognised as evolutions on the Kartlar page. */
const EXTRA_EVO_CARDS = new Set([
  "Mini P.E.K.K.A", "Berserker", "Elite Barbarians", "Mega Minion", "Bowler",
  "Tombstone", "Balloon", "Ice Golem", "Goblins", "Barbarian Barrel",
  "Magic Archer", "Giant", "Dark Prince",
]);
/* `maxEvolutionLevel` is the API's own flag and covers 53 of the 122 cards —
   every evolution in the game except Elite Barbarians, which Supercell omits
   but which shows up evolved in real battle logs. EXTRA_EVO_CARDS carries that
   gap. (The community card data is NOT used here: it lists only 7 evolutions.) */
function canEvolve(c){
  return !!(c.evoIcon || c.iconUrls?.evolutionMedium || c.maxEvolutionLevel || EXTRA_EVO_CARDS.has(c.name));
}

/* In-game card level.

   The API reports `level` on a per-rarity scale, not the number the game
   shows: every rarity tops out at a different `maxLevel` (common 16, rare 14,
   epic 11, legendary 8, champion 6) but all of them are level 16 in game. So a
   maxed Golden Knight arrives as 6/6 and a maxed legendary as 8/8 — printing
   the raw value is what made champions read "Sv. 6" and capped everything at
   14. Shifting by the rarity's offset puts them all on the game's scale. */
const GAME_MAX_LEVEL = 16;
function gameLevel(level, maxLevel){
  if (level == null) return null;
  if (!maxLevel) return level;
  return level + (GAME_MAX_LEVEL - maxLevel);
}

/* Register a live-API card into CARD_DB, return its key.
   NOTE: global evo is NOT set — evolution is decided per-deck via evo lists.
   `canEvo` only records that the card *has* an evolution (used by filters).
   Art already learned from a richer endpoint is kept, since /cards, currentDeck
   and battlelog each expose a different subset of the evolution icons. */
function registerApiCard(c){
  const key = "api_" + c.id;
  const prev = CARD_DB[key];
  CARD_DB[key] = {
    name: c.name, elixir: c.elixir ?? c.elixirCost ?? 0, rarity: c.rarity || prev?.rarity || "",
    img: "", imgUrl: c.icon || c.iconUrls?.medium || prev?.imgUrl || "",
    imgUrlEvo: c.evoIcon || c.iconUrls?.evolutionMedium || prev?.imgUrlEvo || "",
    id: c.id, evo: false, canEvo: canEvolve(c) || !!prev?.canEvo,
    type: c.type || prev?.type || "",
    traits: c.traits || prev?.traits || null,
    nameTR: c.nameTR || prev?.nameTR || "",
    heroImg: c.heroImg || prev?.heroImg || HERO_IMG.get(c.name) || "",
    hero: (c.champion || c.rarity === "champion" || !!prev?.hero),
  };
  return key;
}

/* English name -> Turkish name, learned once from /api/cards.

   Only that endpoint carries `nameTR`; meta decks, battle logs and rankings
   all arrive with English names only, so without this shared map a card would
   read "Wizard" in a deck and "Büyücü" on the cards page. Filled by
   HypnoAPI.cards(); until then everything falls back to English. */
const CARD_NAME_TR = new Map();
/* English name -> local hero portrait path, for the sixteen hero cards.
   Same reason as the name map: only /api/cards carries it, but decks and
   battle logs need it too. */
const HERO_IMG = new Map();
/* Cards whose EVOLUTION artwork actually exists somewhere. Measured: Supercell
   publishes `evolutionMedium` for 41 cards and RoyaleAPI has `-ev1` art for the
   same set, but four cards the game does evolve — Berserker, Barbarian Barrel,
   Balloon, Mini P.E.K.K.A — have no evolution picture at either source. Those
   are drawn as the plain card, and the tooltip says why. */
const EVO_ART = new Set();

/*
  Hero slots vs evolution slots — the same rule the proxy applies to meta decks,
  repeated here because battle logs are mapped in the browser.

  A deck has three special slots but at most TWO evolutions; the third is the
  hero. The API reports both with `evolutionLevel`, which is why decks used to
  show three evolutions. A flagged card that carries `maxEvolutionLevel` but has
  no evolution artwork is a hero (twelve cards, eleven of them the game's hero
  roster); Knight, Valkyrie, Musketeer and Wizard are both, so they only become
  the hero when the deck would otherwise hold three evolutions.
*/
const MAX_EVO_SLOTS_DECK = 2;
const HERO_DUAL = new Set(["Knight", "Valkyrie", "Musketeer", "Wizard"]);
const HERO_ONLY = new Set();      // filled from /api/cards
/* API'de HİÇ işaret taşımayan kahramanlar (Yaramaz). Bunlar savaş
   günlüğünde sıradan bir kart gibi geliyor: ne `evolutionLevel`, ne
   `maxEvolutionLevel`, ne evrim görseli. İşaretli kartlara bakan ayıklama
   onları göremediği için kahraman yuvası boş kalıyordu — bkz. sunucudaki
   HERO_EXTRA ve orada duran ölçüm. Liste de sunucudan geliyor. */
const HERO_NOFLAG = new Set();    // filled from /api/cards (heroNoFlag)

/* Kahraman yuvası savaş günlüğünde destenin 1. sırasında, evrimler 0. ve 2.
   sırada. 2.652 sıralamalı destede ölçüldü; ayrıntı sunucudaki eşiyle aynı
   yorumda (server.js, HERO_SLOT_INDEX). */
const HERO_SLOT_INDEX = 1;

/* `deste` = destenin tüm kartları (işaretsiz kahramanı ancak orada bulabiliriz),
   `sirali` = deste gerçek yuva sırasında mı (savaş günlüğünde evet). */
function splitSlots(flagged, deste = flagged, sirali = false){
  let heroes = flagged.filter((c) => HERO_ONLY.has(c.name));
  let evos = flagged.filter((c) => !HERO_ONLY.has(c.name));
  while (!heroes.length && evos.length > MAX_EVO_SLOTS_DECK){
    const i = evos.findIndex((c) => HERO_DUAL.has(c.name));
    if (i < 0) break;
    heroes.push(evos.splice(i, 1)[0]);
  }
  /* İki aday birden çıkabiliyor (ikisinin de evrim sanatı yayınlanmamışsa).
     Hangisinin kahraman olduğuna deste sırası karar veriyor; kalan, sanatı
     olmayan bir evrimdir. */
  if (heroes.length > 1){
    let sec = 0;
    if (sirali){
      const i = heroes.findIndex((c) => deste.indexOf(c) === HERO_SLOT_INDEX);
      if (i >= 0) sec = i;
    }
    const dusen = heroes.filter((_, i) => i !== sec);
    heroes = [heroes[sec]];
    evos = [...evos, ...dusen].sort((a, b) => deste.indexOf(a) - deste.indexOf(b));
  }
  /* Bir destede en fazla BİR kahraman yuvası var: yuva doluysa bu kart
     kahraman olarak oynanmış olamaz, boşsa oraya oturuyor demektir. */
  if (!heroes.length && evos.length <= MAX_EVO_SLOTS_DECK){
    const c = deste.find((x) => HERO_NOFLAG.has(x.name) && !flagged.includes(x));
    if (c) heroes.push(c);
  }
  return { evos: evos.slice(0, MAX_EVO_SLOTS_DECK), heroes };
}

/* A card's name in the current language. The API only speaks English, so the
   Turkish name comes from the game's own translation table via the proxy;
   anything it could not translate falls back to the English name. */
function cardName(c){
  if (!c) return "";
  if (LANG !== "tr") return c.name || "";
  return c.nameTR || CARD_NAME_TR.get(c.name) || c.name || "";
}
/* Same, by CARD_DB key. */
function cardNameOf(key){ return cardName(CARD_DB[key]); }

/* Bir *currentDeck*'in özel yuvaları (evrim + kahraman).

   ŞİKÂYET ÜZERİNE YENİDEN YAZILDI. Bir kullanıcı "destem doğru ama evrim ve
   kahramanlar yanlış, son maçıma baktım farklıydı" dedi. Ölçtük, haklıydı.

   ESKİ KURAL neye bakıyordu: profildeki `evolutionLevel` işaretine. Ama o
   alan "bu kartın evrimi AÇIK" demek, "bu kart evrim yuvasında" demek DEĞİL —
   üst seviye bir hesapta 122 kartın ~54'ü işaretli geliyor. Kural, işaretli
   kartlar arasından sanata/sıraya göre seçim yapmaya çalışıyordu, yani
   pratikte tahmin ediyordu.

   YENİ KURAL: destenin SIRASI. Savaş günlüğünde evrimlerin 0.-2. sırada,
   kahramanın 1. sırada durduğu daha önce ölçülmüştü; meğer profildeki
   `currentDeck` de aynı sırayı koruyormuş. Kimse buna bakmıyordu.

   ÖLÇÜM — 200 hesap tarandı, 67'sinde aynı sekiz kartın oynandığı bir maç
   bulunup GERÇEK yuvalarla karşılaştırıldı:

       EVRİM     eski kural %69   →   0. ve 2. sıra  %93
       KAHRAMAN  eski kural %75   →   1. sıra        %93

   Denenip ELENEN fikirler (ölçümle):
     · `evolutionLevel` işaretini süzgeç olarak eklemek: hiçbir şey
       değiştirmiyor (%93 → %93). Beklenen, çünkü işaret zaten her şeye
       konuyor.
     · "İşaretli ve evrim sanatı olan ilk iki kart": %7. Sıra bilgisini
       yok saydığı için tamamen dağılıyor.
     · Oyuncunun geçmiş maçlarından öğrenmek: %71. Sezgiye ters ama
       mantıklı — oyuncular deste değiştiriyor, geçmiş başka destelerin
       evrimleriyle kirleniyor.

   ŞAMPİYON ≠ KAHRAMAN. Ölçülen hataların yarısı buydu: Güçlü Madenci ya da
   Altın Şövalye 1. sıradayken kahraman sanılıyordu. Şampiyon ayrı bir
   mekanik ve kendi yuvası var, o yüzden ikisi de açıkça eleniyor.

   Kalan ~%7: kahramanı 1. sırada OLMAYAN desteler (ör. 5. sıradaki Balon).
   Bunu profil verisinden bilmenin yolu yok. O yüzden sonuç hâlâ `tahmin`
   olarak işaretleniyor ve ekranda "tahmini" yazıyor; aynı sekiz kartın
   oynandığı bir maç bulunursa oradan KESİN bilgi alınıyor (desteYuvalari). */
const DECK_EVO_SLOTS = [0, 2];      // ölçüldü: evrimler burada
const DECK_HERO_SLOT = 1;           // ölçüldü: kahraman burada
function deckSpecialSlots(cards, keys){
  const db = (i) => CARD_DB[keys[i]] || {};
  const kart = (i) => cards[i] || {};
  /* Şampiyon ne evrim ne kahraman yuvasına girer — kendi mekaniği var. */
  const sampiyon = (i) => kart(i).rarity === "champion" || db(i).rarity === "champion";
  const evrimOlur = (i) => !sampiyon(i) && !!(
    db(i).canEvo || db(i).imgUrlEvo ||
    kart(i).iconUrls?.evolutionMedium || kart(i).maxEvolutionLevel);
  const kahramanOlur = (i) => !sampiyon(i) && (
    HERO_ONLY.has(kart(i).name) || HERO_DUAL.has(kart(i).name) || HERO_NOFLAG.has(kart(i).name));

  return {
    evo: DECK_EVO_SLOTS.filter(evrimOlur).map((i) => keys[i]),
    hero: kahramanOlur(DECK_HERO_SLOT) ? [keys[DECK_HERO_SLOT]] : [],
    tahmin: true,                       // savaş günlüğünden doğrulanmadı
  };
}

/* ---------- Season helper (ends first Monday of next month) ---------- */
function seasonInfo(){
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth() + 1; // next month
  if (m > 11) { m = 0; y++; }
  const first = new Date(y, m, 1);
  const day = first.getDay();               // 0 Sun..6 Sat
  const offset = (day === 1) ? 0 : ((8 - day) % 7);
  const end = new Date(y, m, 1 + offset);
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86400e3));
  const label = `SEZON ${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const total = 30;
  const pct = Math.min(100, Math.max(4, Math.round((total - daysLeft) / total * 100)));
  const months = LANG==="tr"
    ? ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"]
    : ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const days = LANG==="tr" ? ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"] : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const endStr = `${end.getDate()} ${months[end.getMonth()]} ${days[end.getDay()]}`;
  return { label, daysLeft, pct, endStr };
}

function deckElixir(cards){
  const sum = cards.reduce((a,k) => a + (CARD_DB[k]?.elixir || 0), 0);
  return (sum / cards.length).toFixed(1);
}

/* in-game copy link: clashroyale://copyDeck?deck=id;id;... (needs all 8 ids) */
function copyDeckLink(cards){
  const ids = cards.map(k => CARD_DB[k]?.id).filter(Boolean);
  if (ids.length !== cards.length) return null;
  return `clashroyale://copyDeck?deck=${ids.join(";")}`;
}

/* "Desteyi oyunda aç" düğmesi. Tek yerde duruyor çünkü artık üç ekranda
   birden kullanılıyor: sıralamalar, son maçlar ve oyuncu profilindeki savaş
   geçmişi. Sekiz kartın da kimliği bilinmiyorsa hiç çizilmiyor — eksik
   kimlikle üretilen bağlantı oyunda hata verirdi. */
function deckCopyBtn(cards){
  const link = cards && cards.length ? copyDeckLink(cards) : null;
  if (!link) return "";
  const tr = LANG === "tr";
  return `<button class="deck-copy" onclick="openDeck(${jsArg(link)},this)"
    title="${tr ? "Desteyi oyunda aç (deste slotuna eklenir)" : "Open this deck in game"}"
    aria-label="${tr ? "Desteyi kopyala" : "Copy deck"}">${ICONS.copy}</button>`;
}

/* ============================================================
   EŞLEŞME İSTATİSTİĞİ  ⚔️
   ------------------------------------------------------------
   "Bu karşılaşmada kim kazanıyor?" — Madenci vs Lav Tazısı gibi bir
   eşleşmenin Nihai Kademe ilk 1000'inde gerçekte nasıl bittiği.

   Tabloyu sunucu biriktiriyor (server/eslesme.js — nasıl ve neden orada
   ölçümleriyle yazılı). Burada yapılan üç şey var: tabloyu bir kez
   çekmek, bir destenin ANA KARTINI seçmek ve rozeti çizmek.

   Ana kart seçimi sunucudaki kuralın AYNISI olmak zorunda, yoksa
   istatistik başka bir eşleşmeye ait olurdu. O yüzden kural burada
   tekrar yazılmıyor: sunucu kazanma koşullarını katman/iksir/sıra
   bilgisiyle birlikte gönderiyor, karşılaştırma da aynı sırayla
   yapılıyor.
   ============================================================ */
let ESLESME = null;          // { minOrnek, koc:Map(id→{k,e,s}), ciftler:Map }
let eslesmeSozu = null;

/* Tablo oturum başına BİR kez çekiliyor. Başarısız olursa `null` kalır ve
   hiçbir rozet çizilmez — eşleşme bilgisi olmadan da sayfa tamdır. */
function eslesmeYukle(){
  if (eslesmeSozu) return eslesmeSozu;          // söz saklanıyor: tek istek
  eslesmeSozu = HypnoAPI._get("/eslesme", 10000).then((d) => {
    if (!d || !d.hazir) return null;
    ESLESME = {
      minOrnek: d.minOrnek || 60,
      sezon: d.sezon || "", karma: !!d.karma, savas: d.savas || 0,
      kaynak: d.kaynak || "",
      koc: new Map((d.koc || []).map((c) => [c.id, c])),
      ciftler: new Map(Object.keys(d.ciftler || {}).map((k) => [k, d.ciftler[k]])),
    };
    return ESLESME;
  }).catch(() => null);
  return eslesmeSozu;
}

/* Destenin ana kartı (kazanma koşulu). Kural sunucuyla birebir:
   önce katman (1 gerçek kazanma koşulu, 2 yalnızca 1 hiç yoksa),
   sonra sunucunun gönderdiği liste sırası. İksire BAKILMIYOR —
   bkz. server/eslesme.js'deki not (Köstebek/Goblin Matkabı düzeltmesi). */
function eslesmeAnaKart(keys){
  if (!ESLESME) return null;
  let en = null;
  for (const k of keys || []){
    const c = CARD_DB[k];
    const m = c && ESLESME.koc.get(c.id);
    if (!m) continue;
    const aday = { id: c.id, key: k, katman: m.k, sira: m.s };
    const daha = !en || (aday.katman !== en.katman ? aday.katman < en.katman
                                                   : aday.sira < en.sira);
    if (daha) en = aday;
  }
  return en;
}

/* İki deste için eşleşme kaydı. `null` = gösterilecek bir şey yok
   (tablo yüklenmedi ya da bir tarafta kazanma koşulu bulunamadı). */
function eslesmeBilgi(benimKeys, rakipKeys){
  if (!ESLESME) return null;
  const a = eslesmeAnaKart(benimKeys), b = eslesmeAnaKart(rakipKeys);
  if (!a || !b) return null;
  if (a.id === b.id) return { ayna: true, a, b };
  const [dus, yuk] = a.id < b.id ? [a, b] : [b, a];
  const kayit = ESLESME.ciftler.get(`${dus.id}|${yuk.id}`);
  const n = kayit ? kayit[0] : 0;
  if (!n) return { a, b, n: 0, yeterli: false };
  const pDus = kayit[1] / n * 100;
  const pA = a.id === dus.id ? pDus : 100 - pDus;
  /* %95 güven aralığının yarı genişliği. Rozetin kendisinde değil
     ipucunda yazıyor — 60 maçlık bir oranın ±13 puan oynayabildiğini
     görmek, sayıyı kanun sanmayı engelliyor. */
  const pay = 1.96 * Math.sqrt((pA / 100) * (1 - pA / 100) / n) * 100;
  return { a, b, n, pA, pay, yeterli: n >= ESLESME.minOrnek };
}

/* Eşleşme rozeti.

   Biçim iki ekranda da AYNI: "⚔️ Balon %58 – %42 Yaban Domuzu". Önce
   yazan kart, ilk verilen destenin kazanma koşuludur — yani profildeki
   savaş günlüğünde her zaman OYUNCUNUN kartı, akışta soldaki oyuncunun
   kartı. Satırın altındaki "SENİN DESTEN / RAKİP" düzeniyle aynı sırada
   okunuyor.

   Önce "Eşleşme %52 sende" yazıyordu; hangi kartların karşılaştığı
   yalnızca ipucundaydı. Telefonda ipucu diye bir şey yok — kullanıcıların
   %90'ı mobilden geldiğine göre o bilgi pratikte hiç görünmüyordu. */
function eslesmeRozeti(benimKeys, rakipKeys, benim){
  const e = eslesmeBilgi(benimKeys, rakipKeys);
  if (!e) return "";
  const tr = LANG === "tr";
  const adA = cardNameOf(e.a?.key) || "", adB = cardNameOf(e.b?.key) || "";
  const yuzde = (n) => tr ? `%${n}` : `${n}%`;
  if (e.ayna)
    return `<span class="mu-chip even" title="${tr
      ? "İki deste de aynı kazanma koşulunu oynuyor — eşleşme simetrik."
      : "Both decks run the same win condition — the matchup is symmetric."}">⚔️ ${
      tr ? "Ayna eşleşme" : "Mirror matchup"}${adA ? ` · ${esc(adA)}` : ""}</span>`;

  if (!e.yeterli){
    const az = e.n ? `${nfTR(e.n)} ${tr ? "maç" : "games"}` : (tr ? "veri yok" : "no data");
    const nicin = e.n
      ? (tr ? `elimizde ${nfTR(e.n)} maç var; güvenilir bir oran için en az ${nfTR(ESLESME.minOrnek)} maç gerekiyor.`
            : `we have ${nfTR(e.n)} games; a reliable rate needs at least ${nfTR(ESLESME.minOrnek)}.`)
      : (tr ? "henüz kayıt yok." : "no games recorded yet.");
    return `<span class="mu-chip thin" title="${esc(adA)} – ${esc(adB)}: ${nicin}">` +
           `⚔️ ${esc(adA)} – ${esc(adB)} · ${az}</span>`;
  }

  const p = Math.round(e.pA);
  const cls = p >= 55 ? "up" : p <= 45 ? "down" : "even";
  const ipucu = tr
    ? `${benim ? "Senin destenin" : "Soldaki oyuncunun"} kazanma koşulu ${esc(adA)}, rakibinki ${esc(adB)}. ` +
      `Nihai Kademe ilk 1000'de bu eşleşme ${nfTR(e.n)} kez oynandı; ` +
      `${esc(adA)} %${p} kazandı (±${e.pay.toFixed(0)} puan belirsizlik)${ESLESME.karma ? " · iki sezon birleşik" : ""}.`
    : `${benim ? "Your deck's" : "The left player's"} win condition is ${esc(adA)}, the opponent's ${esc(adB)}. ` +
      `Played ${nfTR(e.n)} times in the Path of Legends top 1000; ` +
      `${esc(adA)} won ${p}% (±${e.pay.toFixed(0)} points)${ESLESME.karma ? " · two seasons combined" : ""}.`;
  return `<span class="mu-chip ${cls}" title="${ipucu}">` +
         `⚔️ ${esc(adA)} <b>${yuzde(p)}</b> – <b>${yuzde(100 - p)}</b> ${esc(adB)}</span>`;
}

/* Desteyi oyunda aç.

   Bağlantı `clashroyale://` şemasını kullanıyor: telefonda oyunu açar ve
   desteyi doğrudan deste kopyalama ekranına koyar. Masaüstünde bu şemayı
   karşılayan bir uygulama yok, yani tıklamak görünürde hiçbir şey yapmaz —
   o yüzden bağlantıyı panoya da alıyoruz ve ne olduğunu söylüyoruz.
   Böylece tek düğme her iki yerde de işe yarıyor. */
async function openDeck(link, btn){
  if (!link) return;
  const tr = LANG === "tr";
  let panoda = false;
  try { await navigator.clipboard.writeText(link); panoda = true; } catch {}
  if (btn){
    const eski = btn.innerHTML;
    btn.classList.add("ok");
    setTimeout(() => { btn.innerHTML = eski; btn.classList.remove("ok"); }, 1400);
  }
  toast(tr
    ? (panoda ? "Oyun açılıyor — bağlantı panoya da kopyalandı." : "Oyun açılıyor…")
    : (panoda ? "Opening in game — link copied too." : "Opening in game…"));
  location.href = link;
}

/* ---------- Clan crest ----------
   The API never sends a badge image, only a numeric `badgeId`; the proxy turns
   that into a `badge` URL (see badgeLookup in server.js). Anything without one
   — demo rows, clanless players — keeps the generic SVG crest. */
function clanCrest(badge, size = 22){
  const h = Math.round(size * 26 / 22);
  if (!badge) return `<span class="clan-crest" style="width:${size}px;height:${h}px">${ICONS.crest}</span>`;
  return `<img class="clan-badge" src="${badge}" alt="" width="${size}" height="${size}" loading="lazy"
            onerror="this.outerHTML='<span class=\\'clan-crest\\' style=\\'width:${size}px;height:${h}px\\'>'+ICONS.crest+'</span>'">`;
}
function clanChip(name, badge, tag){
  if (!name || name === "—") return `<span class="muted">—</span>`;
  const inner = `${clanCrest(badge)}<span>${name}</span>`;
  return tag
    ? `<a class="clan-chip" href="klan.html?tag=${encodeURIComponent(tag)}" style="text-decoration:none;color:inherit">${inner}</a>`
    : `<span class="clan-chip">${inner}</span>`;
}

/* ---------- Search result lists ----------
   Both searches render the same row shape, so a result is always something the
   visitor chooses from — the site never picks a profile on their behalf. */
const nfTR = (v) => (v || 0).toLocaleString("tr-TR");

/* Rozetler. İkisi de SUNUCUDAN gelir, burada hiçbir şey varsayılmaz:
   · verified — elle doğrulanmış tanınmış hesap (server/verified.js)
   · pro      — Nihai Kademe dünya ilk 100'ü (canlı sıralamadan)
   Bir oyuncu ikisine birden sahip olabilir; ikisi de gösterilir. */
function verifyTick(p){
  if (!p) return "";
  let out = "";
  if (p.verified){
    const baslik = LANG === "tr"
      ? "Resmi hesap" + (p.note ? ` — ${p.note}` : "")
      : "Official account" + (p.note ? ` — ${p.note}` : "");
    out += `<span class="vtick" title="${esc(baslik)}" aria-label="${esc(baslik)}">${ICONS.check}</span>`;
  }
  if (p.pro){
    /* Sıra numarası yalnızca o an dünya ilk 100'de olanlarda var;
       listeye elle eklenmiş bir pro için sıra uydurmuyoruz. */
    const baslik = p.proRank
      ? (LANG === "tr" ? `Dünya ilk 100 — şu an ${p.proRank}. sırada`
                       : `World top 100 — currently rank ${p.proRank}`)
      : (LANG === "tr" ? "Profesyonel oyuncu" : "Professional player");
    out += `<span class="protag" title="${esc(baslik)}" aria-label="${esc(baslik)}">PRO</span>`;
  }
  return out;
}

function playerResultRow(p){
  const meta = [
    p.level ? `${LANG==="tr"?"Sv.":"Lv."} ${p.level}` : "",
    p.clanName ? `${clanCrest(p.badge, 16)} ${p.clanName}` : `<span class="muted">${t("word.none")}</span>`,
  ].filter(Boolean).join(" · ");
  /* `elo` = Nihai Kademe madalyonu. SIFIR da geçerli bir cevap ama "madalyon
     yok" demek: madalyon yalnızca en üst ligde tutuluyor, alt liglerdeki
     oyuncuya API `trophies: 0` gönderiyor. `!= null` yazmak sıfırı da madalyon
     sayıyordu ve 14.000 kupalı bir oyuncu arama sonucunda "0 🏅" olarak
     görünüyordu. Madalyon ancak SIFIRDAN BÜYÜKSE gösteriliyor; değilse
     oyuncunun Kupa Yolu kupası yazılıyor. */
  const score = p.elo > 0 ? `${nfTR(p.elo)} 🏅`
              : p.trophies != null ? `${nfTR(p.trophies)} 🏆` : "";
  return `<a class="res-row ${p.verified || p.pro ? "vf" : ""}" href="oyuncu.html?tag=${encodeURIComponent(p.tag)}">
    <span class="res-ic">👤</span>
    <span class="res-main">
      <span class="n">${esc(p.name)}${verifyTick(p)}<span class="tag">${esc(p.tag)}</span></span>
      <span class="s">${meta}</span>
    </span>
    <span class="res-val">${score}${p.rank ? `<span class="s">${t("unit.worldNo")} #${nfTR(p.rank)}</span>` : ""}</span>
  </a>`;
}

function clanResultRow(c){
  const meta = [c.region, c.type ? clanTypeTR(c.type) : "", `${c.members}/50 ${t("unit.member")}`,
                c.required ? `${nfTR(c.required)} ${t("unit.reqTrophies")}` : ""].filter(Boolean).join(" · ");
  return `<a class="res-row" href="klan.html?tag=${encodeURIComponent(c.tag)}">
    <span class="res-ic">${clanCrest(c.badge, 34)}</span>
    <span class="res-main">
      <span class="n">${esc(c.name)}<span class="tag">${esc(c.tag)}</span></span>
      <span class="s">${meta}</span>
    </span>
    <span class="res-val">${nfTR(c.score)} 🏆${c.warTrophies ? `<span class="s">${nfTR(c.warTrophies)} ${t("unit.war")}</span>` : ""}</span>
  </a>`;
}
function clanTypeTR(type){ return ({ open:t("clan.open"), inviteOnly:t("clan.invite"), closed:t("clan.closed") })[type] || type; }

function notice(html, kind = ""){ return `<div class="notice ${kind}">${html}</div>`; }

/* Veri çekilemediğinde gösterilen kutu. Eskiden bu durumda data.js'teki
   örnek satırlar basılıyordu; gerçek sanılıp yanlış karar verilmesine yol
   açtığı için artık hiçbir sayfa uydurma veri göstermiyor — sebebi yazıyor.
   `retry` verilirse yeniden deneme düğmesi de çıkar (global bir fonksiyon adı). */
function apiDownBox(retry){
  const btn = retry
    ? `<button class="btn btn-ghost" onclick="${retry}()">${t("err.retry")}</button>`
    : "";
  return notice(`<span>⚠️</span><span><b>${t("err.title")}</b><br>${t("err.body")}${btn}</span>`, "warn");
}
/* Tablo gövdesi için aynı uyarının tek hücrelik hâli. */
function apiDownRow(cols, retry){
  return `<tr><td colspan="${cols}">${apiDownBox(retry)}</td></tr>`;
}
function spinnerBox(label){
  return `<div class="text-center muted" style="padding:36px">
    <span class="spinner" style="border-color:rgba(30,90,224,.3);border-top-color:var(--blue-600)"></span>
    ${label ? `<div style="margin-top:10px;font-size:.85rem">${label}</div>` : ""}</div>`;
}

/* ---------- Modal ---------- */
function openModal(html){
  let m = document.getElementById("hs-modal");
  if (!m){
    m = document.createElement("div");
    m.id = "hs-modal"; m.className = "modal-overlay";
    m.addEventListener("click", e => { if (e.target === m) closeModal(); });
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="modal-box">${html}</div>`;
  m.classList.add("open");
  document.addEventListener("keydown", escClose);
}
function escClose(e){ if (e.key === "Escape") closeModal(); }
function closeModal(){
  const m = document.getElementById("hs-modal");
  if (m) m.classList.remove("open");
  document.removeEventListener("keydown", escClose);
}
async function copyText(txt, btn){
  try { await navigator.clipboard.writeText(txt); }
  catch { const ta=document.createElement("textarea"); ta.value=txt; document.body.appendChild(ta); ta.select(); try{document.execCommand("copy");}catch{} ta.remove(); }
  if (btn){ const old=btn.innerHTML; btn.innerHTML = `${ICONS.copy}<span>${t("gen.copied")}</span>`; setTimeout(()=>btn.innerHTML=old, 1600); }
}

/* ---------- API client ---------- */
const HypnoAPI = {
  /* Is the proxy reachable? Named `online`, not `live`: `live` was also the
     name of the battles method below, so the method shadowed the flag and the
     first request overwrote the method with a boolean. */
  online: false,
  /* Full result: {status, body}, or null when the proxy itself is unreachable.
     The distinction matters — a 404 means "no such player", which must NOT be
     answered with demo data, while an unreachable proxy legitimately may be. */
  /* Uçuşta olan istekler. Aynı adres aynı anda ikinci kez istenirse yeni bir
     ağ isteği açmak yerine bekleyen sözü paylaşıyoruz — iki eşzamanlı GET
     zaten aynı cevabı almalı. Emniyet kemeri: bir yerde yanlışlıkla iki kez
     çağrılan bir uç, sunucuya iki kez gitmesin. */
  _ucus: new Map(),
  async _req(path, timeout = 6000){
    const acik = this._ucus.get(path);
    if (acik) return acik;
    const p = this._istek(path, timeout).finally(() => this._ucus.delete(path));
    this._ucus.set(path, p);
    return p;
  },
  async _istek(path, timeout){
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(API_BASE + path, { signal: ctrl.signal });
      clearTimeout(to);
      /* Rozet "Canlı API" derken gerçekten veri aldığımızı anlatmalı.
         2xx ve 404 gerçek bir cevaptır (404 = öyle bir oyuncu yok).
         403/429/5xx ise Supercell'den veri alamıyoruz demektir — proxy ayakta
         olsa bile bunu "canlı" saymak kullanıcıyı yanıltıyordu. */
      this.online = res.status < 400 || res.status === 404;
      return { status: res.status, body: await res.json().catch(() => ({})) };
    } catch { clearTimeout(to); this.online = false; return null; }
  },
  /* Body on success, null on any failure (used where a demo fallback is fine). */
  async _get(path, timeout = 6000){
    const r = await this._req(path, timeout);
    return r && r.status >= 200 && r.status < 300 ? r.body : null;
  },
  /* Ranking rows. `deck` is filled in by the proxy from each player's profile —
     the ranking payload itself has no deck, which is why the column was empty.
     Veri yoksa `null` döner: çağıran taraf uyarı gösterir, örnek satır basmaz. */
  _mapRanks(data){
    if (data && data.items) return data.items.map((p,i) => {
      const keys = [], evo = [], champ = [], hero = [];
      (p.deck || []).forEach((c) => {
        const k = registerApiCard(c);
        keys.push(k);
        if (c.evo) evo.push(k);
        if (c.hero) hero.push(k);
        if (c.champion) champ.push(k);
      });
      return {
        rank: p.rank ?? i+1, name: p.name, tag: p.tag, level: p.level ?? p.expLevel ?? null,
        verified: !!p.verified, note: p.note || "", pro: !!p.pro, proRank: p.proRank || null,
        trophies: p.trophies ?? p.eloRating ?? p.rating ?? 0,
        clan: p.clan?.name || "—", clanTag: p.clan?.tag || "", clanBadge: p.clan?.badge || "",
        deck: keys.length ? keys : null, evo, champ, hero,
        deckAt: p.deckAt || "", deckRanked: p.deckRanked !== false,
      };
    });
    return null;
  },
  /* Nihai Kademe sıralaması. `location` verilirse o ülkenin yerel tablosu
     (ör. Türkiye 57000239), verilmezse dünya geneli.
     Zaman aşımı bilerek uzun: bu uç nokta 100 oyuncunun son maç destesini de
     topluyor ve önbellek soğukken ölçtüğümüz süre ~6.6 sn — 6 sn'lik varsayılan
     tam sınırda kalıp sıralamayı "veri alınamadı" gösteriyordu. */
  async pol(location){
    const q = location ? "?location=" + encodeURIComponent(location) : "";
    return this._mapRanks(await this._get("/rankings/pathoflegend" + q, 30000));
  },
  async trophy(){ return this._mapRanks(await this._get("/rankings/global")); },
  async rankings(){ return this.pol(); },
  async clanRankings(){
    const data = await this._get("/rankings/clans");
    if (data && data.items) return data.items.map((c,i) => ({
      rank:c.rank ?? i+1, name:c.name, tag:c.tag, flag:"", badge:c.badge || "",
      members:c.members ?? c.memberCount ?? 0, score:c.clanScore ?? 0,
      region:c.location?.name || "",
    }));
    return null;
  },

  /* Decks that play a given card, searched across the whole season sample. */
  async decksForCard(id){
    const data = await this._get("/decks/card/" + encodeURIComponent(id), 30000);
    return data || { items: [], total: 0, searched: 0 };
  },

  /* Character renders for the Kahramanlar section. The Clash Royale API has no
     such artwork, so the proxy resolves it from RoyaleAPI's asset index. */
  async heroes(){
    const data = await this._get("/heroes", 15000);
    if (data && (data.champions || data.heroes)) return {
      champions: data.champions || [], heroes: data.heroes || [], counts: data.counts || {},
    };
    return null;
  },

  /* Clan WAR ladder. Careful: the API reuses the field name `clanScore` here,
     but on this endpoint it holds WAR trophies, not the regular clan score. */
  async clanWarRankings(location){
    const data = await this._get("/rankings/clanwars" + (location ? "?location=" + location : ""));
    if (data && data.items) return data.items.map((c,i) => ({
      rank:c.rank ?? i+1, prev:c.previousRank ?? null, name:c.name, tag:c.tag, badge:c.badge || "",
      members:c.members ?? 0, war:c.clanScore ?? 0, region:c.location?.name || "",
    }));
    return null;
  },

  /* Search players by NAME. The Clash Royale API has no such endpoint, so the
     proxy answers from a name index built out of the Path of Legends ladders.
     Returns {items, ready, indexed, notFound, offline} — never a profile. */
  async playersSearch(name){
    // RoyalAPI bir isim için 100 sonuç gösteriyor; biz 50 gösteriyorduk.
    const r = await this._req("/players/search?name=" + encodeURIComponent(name) + "&limit=100", 20000);
    if (!r) return { offline: true, items: [] };
    return { ...r.body, items: r.body.items || [] };
  },

  /* A player is looked up by exact tag only. `null` = no such tag (a real 404
     from Supercell); `offline` = the proxy is down, so demo data is honest. */
  async player(tag){
    const r = await this._req("/player/" + encodeURIComponent(tag));
    if (!r) return { offline: true };
    if (r.status === 200 && r.body.name) return normalizePlayer(r.body);
    return { notFound: true, status: r.status, reason: r.body?.reason };
  },
  /* A player's own recent battles. Separate call: /players/{tag} carries no
     battle history at all, which is why the profile's "Son Savaşlar" panel sat
     empty and blamed the API connection. Returns [] when there is nothing to
     show (a fresh account, or the log expired) so the caller can say so. */
  async battlelog(tag){
    const r = await this._req("/player/" + encodeURIComponent(tag) + "/battlelog", 12000);
    if (!r || r.status !== 200 || !Array.isArray(r.body)) return null;
    return r.body.map((b) => mapOwnBattle(b, tag)).filter(Boolean);
  },
  async clan(tag){
    const r = await this._req("/clan/" + encodeURIComponent(tag));
    if (!r) return { offline: true };
    const d = r.body;
    if (r.status === 200 && d.memberList) return {
      info: { name:d.name, tag:d.tag, score:d.clanScore, members:d.members, required:d.requiredTrophies,
              type:d.type, region:d.location?.name, badge:d.badge || "", description:d.description,
              warTrophies:d.clanWarTrophies, donations:d.donationsPerWeek },
      members: d.memberList.map((m,i)=>({ no:i+1, name:m.name, tag:m.tag, role:roleTR(m.role), level:m.expLevel,
                                          trophies:m.trophies, donations:`${m.donations}/${m.donationsReceived}`,
                                          arena:m.arena?.nameTR || m.arena?.name || "", lastSeen:m.lastSeen,
                                          // filled in by the proxy from each member's profile
                                          medals:m.leagueMedals ?? null, worldRank:m.leagueRank ?? null })),
    };
    return { notFound: true, status: r.status, reason: d?.reason };
  },
  /* Clan name search. `null` = proxy offline (demo data cannot be searched). */
  async clansSearch(name){
    const r = await this._req("/clans/search?name=" + encodeURIComponent(name), 12000);
    if (!r) return null;
    return { ...r.body, items: r.body.items || [] };
  },
  async battles(){
    const data = await this._get("/live");
    if (data && data.items && data.items.length) return data.items.map(mapBattle).filter(Boolean);
    return null;
  },
  async youtube(){
    const data = await this._get("/youtube");
    if (data && data.items && data.items.length) return data.items;
    return null;
  },
  /* Meta decks for the current ranked season. The proxy derives these from
     real battle logs, so each deck carries a true win rate plus the pilots who
     climbed highest on it. Card order is already "3 special slots first". */
  async meta(){
    const data = await this._get("/meta", 30000);
    if (data && data.items && data.items.length){
      this.metaMeta = { sampled:data.sampled, battles:data.battles, accounts:data.accounts,
                        distinctDecks:data.distinctDecks, season:data.season,
                        minBattles:data.minBattles, rankRange:data.rankRange, baseRates:data.baseRates,
                        slotMix:data.slotMix };
      return data.items.map((d) => {
        const keys = [], evo = [], champ = [];
        const hero = [];
        d.cards.forEach((c) => {
          const k = registerApiCard(c);
          keys.push(k);
          if (c.evo) evo.push(k);
          if (c.hero) hero.push(k);
          if (c.champion) champ.push(k);
        });
        return {
          key: d.key, name: nameDeck(keys), cards: keys, evo, champ, hero,
          usage: d.usage, winrate: d.winrate, rawWinrate: d.rawWinrate,
          enoughData: d.enoughData, battles: d.battles, wins: d.wins,
          pilots: d.pilots, players: d.players || [], source: "live",
        };
      });
    }
    this.metaMeta = null;
    return null;
  },
  async cards(){
    const data = await this._get("/cards");
    if (data && data.items && data.items.length){
      return data.items.map((c) => {
        if (c.nameTR) CARD_NAME_TR.set(c.name, c.nameTR);
        if (c.heroImg) HERO_IMG.set(c.name, c.heroImg);
        if (c.iconUrls?.evolutionMedium) EVO_ART.add(c.name);
        /* Kahraman listesi SUNUCUDAN geliyor (heroOnly). Eskiden burada
           `maxEvolutionLevel` üzerinden çıkarılıyordu ve o alanı hiç
           taşımayan kartları (Yaramaz) kaçırıyordu. */
        if (c.heroOnly) HERO_ONLY.add(c.name);
        if (c.heroNoFlag) HERO_NOFLAG.add(c.name);
        const key = registerApiCard({ id: c.id, name: c.name, elixirCost: c.elixirCost, icon: c.iconUrls?.medium, evoIcon: c.iconUrls?.evolutionMedium, rarity: c.rarity, maxEvolutionLevel: c.maxEvolutionLevel, type: c.type, traits: c.traits, nameTR: c.nameTR, heroImg: c.heroImg });
        return key;
      });
    }
    return Object.keys(CARD_DB).filter(k => !k.startsWith("api_"));
  },
};

/* Desteyi kazanma koşuluna göre adlandır.

   Eşleştirme KART KİMLİĞİ üzerinden yapılıyor. Eskiden ada bakılıyordu
   (`c.name === w.name`) ama canlı API kartları İngilizce adla geliyor
   ("Hog Rider"), CARD_DB'deki karşılıkları Türkçe ("Yaban Domuzu") — bu
   yüzden karşılaştırma neredeyse hiç tutmuyor, hemen her deste en yüksek
   iksirli kartın İngilizce adına düşüyordu. Kimlikler iki tarafta da aynı.

   Sıra = öncelik: bir destede birden fazla koşul varsa üstteki kazanır.

   ⚠️ BU LİSTE ARTIK YEDEK. Asıl kaynak sunucudaki kazanma koşulu listesi
   (server/eslesme.js) ve o liste /api/eslesme ile buraya geliyor; aşağıdaki
   nameDeck önce ONU kullanıyor. Sebebi bir çelişkiydi: burası kendi sırasına
   göre "Goblin Matkabı destesi" derken sunucu aynı desteye "Köstebek" diyordu,
   yani Anti Deste sayfasında başlık ve kart adları birbirini tutmuyordu.
   Buradaki sıra da aynı mantığa göre düzeltildi (Köstebek, Matkap'ın üstünde)
   ki eşleşme tablosu yüklenmemişken de aynı adı üretsin. */
const WINCON_SIRA = [
  "golem", "xbow", "royalgiant", "goblingiant", "graveyard", "giant",
  "lavahound", "balloon", "ramrider", "royalhogs", "mortar", "hog",
  "goblindrill", "battleram", "miner", "goblinbarrel", "wallbreakers",
  "megaknight", "pekka", "sparky", "royalghost",
  "archerqueen", "skeletonking", "goldenknight",
];
/* Kartın Türkçe adı. CARD_NAME_TR /api/cards ile doluyor; statik CARD_DB
   girdileri zaten Türkçe, o yüzden asıl yol buna bağımlı değil. */
function cardTR(key){
  const c = CARD_DB[key];
  if (!c) return "";
  return CARD_NAME_TR.get(c.name) || c.name;
}
const trUp = (s) => String(s).toLocaleUpperCase("tr");

function nameDeck(keys){
  const idler = new Set(keys.map(k => CARD_DB[k]?.id).filter(Boolean));
  const iceriyor = (wk) => { const w = CARD_DB[wk]; return !!(w && idler.has(w.id)); };

  // Lava Devi + Balon ikilisinin oyundaki yerleşik adı ayrı.
  if (iceriyor("lavahound") && iceriyor("balloon")) return "LAVA BALON DESTESİ";

  /* Eşleşme tablosu yüklüyse kazanma koşulunu ONDAN sor: site genelinde tek
     kural olsun diye. Ad da oyunun kendi Türkçesinden gelir ("Köstebek"),
     data.js'teki eski karşılıktan değil ("Madenci"). */
  const koc = typeof eslesmeAnaKart === "function" ? eslesmeAnaKart(keys) : null;
  if (koc) return trUp(cardNameOf(koc.key) + " destesi");

  for (const wk of WINCON_SIRA)
    if (iceriyor(wk)) return trUp(cardNameOf(wk) + " destesi");

  // Bilinen koşul yoksa: en yüksek iksirli kart.
  let best = keys[0];
  keys.forEach(k => { if ((CARD_DB[k]?.elixir||0) > (CARD_DB[best]?.elixir||0)) best = k; });
  // Kart adı dış veri; deste adı her yerde HTML olarak basıldığı için kaçırılıyor.
  return esc(trUp(cardTR(best) || "META") + " DESTESİ");
}
function decksUsingCard(key, metaList){
  const c = CARD_DB[key]; if (!c) return [];
  return (metaList||[]).filter(d => d.cards.some(k => CARD_DB[k] && CARD_DB[k].name === c.name));
}

/* CR role names, following the game client. The Turkish word for `elder` is
   "Büyük", not "Yaşlı". Roles are stored raw and translated at render time so
   a language switch relabels them. */
const ROLE_KEY = { leader:"role.leader", coLeader:"role.coLeader", elder:"role.elder", member:"role.member" };
function roleTR(r){ return ROLE_KEY[r] ? t(ROLE_KEY[r]) : r; }
/* Reverse lookup: which raw role produced this label, in either language. */
function roleRaw(label){
  for (const [raw, key] of Object.entries(ROLE_KEY))
    if (I18N.tr[key] === label || I18N.en[key] === label) return raw;
  return "";
}

// Map a live-API player object into our render shape (best effort)
function normalizePlayer(d){
  const keys = [], levels = [], maxed = [], collection = [], colLevels = [], colMaxed = [];
  const deck = d.currentDeck || [];
  deck.forEach(c => {
    const k = registerApiCard({ id:c.id, name:c.name, elixirCost:c.elixirCost, icon:c.iconUrls?.medium, evoIcon:c.iconUrls?.evolutionMedium, rarity:c.rarity, maxEvolutionLevel:c.maxEvolutionLevel });
    keys.push(k); levels.push(gameLevel(c.level, c.maxLevel)); maxed.push(c.level >= c.maxLevel);
  });
  const yuvalar = deckSpecialSlots(deck, keys);
  // The whole collection carries its own levels; they used to be hard-coded to 14.
  (d.cards||[]).forEach(c => {
    collection.push(registerApiCard({ id:c.id, name:c.name, elixirCost:c.elixirCost, icon:c.iconUrls?.medium, evoIcon:c.iconUrls?.evolutionMedium, rarity:c.rarity }));
    colLevels.push(gameLevel(c.level, c.maxLevel));
    colMaxed.push(c.level >= c.maxLevel);
  });
  /* Nihai Kademe sonuçları. `leagueStatistics` KUPA YOLU verisidir; eskiden
     madalyon yokken oraya düşülüyordu ve madalyonu 0 olan bir oyuncunun
     başlığında "Nihai Kademe 11.844" yazıyordu — yani hiç madalyon
     kazanmamış biri sıralamanın tepesindeymiş gibi görünüyordu. Artık
     madalyon yoksa madalyon YAZMIYORUZ; onun yerine lig gösteriliyor. */
  const simdi = d.currentPathOfLegendSeasonResult || null;
  const gecen = d.lastPathOfLegendSeasonResult || null;
  const eniyi = d.bestPathOfLegendSeasonResult || null;
  return {
    name:d.name, tag:d.tag, level:d.expLevel,
    trophies:d.trophies, bestTrophies:d.bestTrophies,
    polRating: simdi?.trophies || null,
    polBest: eniyi?.trophies || null,
    polRank: simdi?.rank ?? null,
    polLeague: simdi?.leagueNumber ?? null,
    polSimdi: simdi, polGecen: gecen, polEnIyi: eniyi,
    wins:d.wins, losses:d.losses, threeCrown:d.threeCrownWins, battleCount:d.battleCount,
    challengeMax:d.challengeMaxWins, challengeCardsWon:d.challengeCardsWon, tournamentCardsWon:d.tournamentCardsWon, tournamentBest:d.bestTrophies,
    clan:d.clan?.name || "—", clanTag:d.clan?.tag || "", clanBadge:d.clan?.badge || "",
    clanRole:roleTR(d.role), arena:d.arena?.nameTR || d.arena?.name,
    cards:keys, evo:yuvalar.evo, hero:yuvalar.hero, evoTahmin:yuvalar.tahmin,
    levels, maxed, collection, colLevels, colMaxed,
    verified: !!d.verified, verifiedNote: d.verifiedNote || "",
    pro: !!d.pro, proRank: d.proRank || null,
    trophyHistory:null, battles:[],
  };
}
/* Map one raw battle into the shape the live feed renders.

   `tag` is carried through on purpose: without it the feed's player links had
   nothing to point at and fell back to href="#", so clicking a name did
   nothing. `trophyChange` is the ranked medal swing (+29 / -29) and is mirrored
   between the two sides; it is occasionally null, which the UI shows as "—".

   Card order is preserved as the API sent it: in ranked battle logs the
   evolutions and the champion always occupy the first three slots (verified
   over 2568 decks — zero exceptions), so slot order is meaningful. */
function mapBattle(b){
  try {
    const me = b.team?.[0], op = b.opponent?.[0]; if (!me || !op) return null;
    const reg = (arr)=> {
      const keys=[], evo=[], hero=[];
      const list = arr||[];
      const { evos, heroes } = splitSlots(list.filter(c=>c.evolutionLevel), list, true);
      const evoIds = new Set(evos.map(c=>c.id)), heroIds = new Set(heroes.map(c=>c.id));
      list.forEach(c=>{
        const k=registerApiCard({id:c.id,name:c.name,elixirCost:c.elixirCost,icon:c.iconUrls?.medium,evoIcon:c.iconUrls?.evolutionMedium,rarity:c.rarity,maxEvolutionLevel:c.maxEvolutionLevel});
        keys.push(k); if(evoIds.has(c.id)) evo.push(k); if(heroIds.has(c.id)) hero.push(k);
      });
      return {keys,evo,hero};
    };
    const md = reg(me.cards), od = reg(op.cards);
    const c1=me.crowns||0, c2=op.crowns||0;
    /* `globalRank` is the world rank the player held WHEN the match was played
       — the API stamps it on the battle, so the feed can show "#7" as it was
       at the time rather than where they sit now. `before`/`after` are the
       ranked medal counts either side of the game. */
    /* Madalyon defteri yalnızca en üst ligde anlamlı — bkz. mapOwnBattle'daki
       ölçüm notu. Akışta ilk 100 oynuyor, yani pratikte hep madalyonlu; yine
       de aynı kuralı burada da uyguluyoruz ki tek bir doğru olsun. */
    const madalyonlu = b.type === "pathOfLegend" && me.startingTrophies != null;
    const side = (p, d) => {
      const before = madalyonlu ? (p.startingTrophies ?? null) : null;
      const change = madalyonlu ? (p.trophyChange ?? null) : null;
      return {
        name:p.name, tag:p.tag||"", clan:p.clan?.name||"—", clanTag:p.clan?.tag||"",
        rank:p.globalRank ?? null,
        verified: !!p.verified, note: p.note || "", pro: !!p.pro, proRank: p.proRank || null,
        before, after: change == null ? null : before + change, change,
        deck:d.keys, evo:d.evo, hero:d.hero,
      };
    };
    return {
      p1: side(me, md), p2: side(op, od),
      c1, c2, crowns:`${c1}-${c2}`, winner:c1>=c2?1:2,
      ranked: b.type === "pathOfLegend",
      madalyonlu, lig: b.leagueNumber ?? null,
      rawType:b.type||"", modeName:b.gameMode?.name||"",
      deckSelection:b.deckSelection||"", hosted:!!b.isHostedMatch,
      eventTag:b.eventTag||"", tournamentTag:b.tournamentTag||"",
      ago: b.battleTime ? relativeTime(crTime(b.battleTime)) : "",
    };
  } catch { return null; }
}
/* ============================================================
   Savaşın adı
   ------------------------------------------------------------
   Eskiden yalnızca `type` alanına bakıyorduk; o alan çok kaba.
   100 oyuncunun 2.227 maçını taradığımızda görünen şu: tek bir
   "trail" türünün altında mücadele, 2v2, kaos ligi ve sezon
   etkinliği hep birlikte duruyor. Yani "Deneme" yazan satırların
   çoğu aslında bambaşka şeylerdi.

   Ayırt edici alan `gameMode.name`. Sıra şöyle:
     1) ölçülmüş modların tam listesi,
     2) desen eşleme (Grand → Büyük Mücadele gibi),
     3) hiçbiri tutmazsa ham adı okunabilir hâle getir.
   Böylece hiçbir maç "Maç" diye adsız kalmıyor; oyunun bir
   sonraki sezonda ekleyeceği mod bile bir şey yazar.
   ============================================================ */

/* Canlı veride ölçülen modlar (gameMode.name → ad). */
const MODE_TR = {
  ranked1v1_newarena: "Nihai Kademe", ranked1v1_newarena2: "Nihai Kademe",
  ladder: "Kupa Yolu", rage_ladder: "Öfke Etkinliği",
  friendly: "Dostluk Maçı", teamvsteam: "2v2 Takım Savaşı",
  tournament: "Turnuva", pickmode: "Seçmeli Turnuva",
  cw_battle_1v1: "Klan Savaşı", cw_duel_1v1: "Klan Düellosu",
  clanwar_boatbattle: "Tekne Savaşı",
  duel_1v1_friendly: "Dostluk Düellosu",
  draft_competitive: "Rekabetçi Taslak",
  chaos_1v1_draft: "Kaos Ligi Mücadelesi",
  showdown_friendly: "Kapışma",
  challenge_allcards_eventdeck_noset: "Etkinlik Mücadelesi",
  crazy_arena_epiconly: "Çılgın Arena · Sadece Destansı",
  touchdown_draft: "Sayı Koşusu Taslağı", mirrordeck_friendly: "Ayna Deste Dostluk",
  draftmode: "Taslak Modu",
};
const MODE_EN = {
  ranked1v1_newarena: "Path of Legends", ranked1v1_newarena2: "Path of Legends",
  ladder: "Trophy Road", rage_ladder: "Rage Event",
  friendly: "Friendly", teamvsteam: "2v2",
  tournament: "Tournament", pickmode: "Pick Tournament",
  cw_battle_1v1: "Clan War", cw_duel_1v1: "Clan Duel",
  clanwar_boatbattle: "Boat Battle",
  duel_1v1_friendly: "Friendly Duel",
  draft_competitive: "Competitive Draft",
  chaos_1v1_draft: "Chaos League Draft",
  showdown_friendly: "Showdown",
  challenge_allcards_eventdeck_noset: "Event Challenge",
  crazy_arena_epiconly: "Crazy Arena · Epic Only",
  touchdown_draft: "Touchdown Draft", mirrordeck_friendly: "Mirror Deck Friendly",
  draftmode: "Draft Mode",
};

/* Listede olmayan modlar için desenler — sıra önemli, ilk tutan kazanır. */
const MODE_PATTERNS = [
  [/crazy.?arena/i,             "Çılgın Arena",       "Crazy Arena"],
  [/touchdown/i,                "Sayı Koşusu",        "Touchdown"],
  [/grand/i,                    "Büyük Mücadele",     "Grand Challenge"],
  [/classic/i,                  "Klasik Mücadele",    "Classic Challenge"],
  [/royal|kingdom/i,            "Kraliyet Turnuvası", "Royal Tournament"],
  [/chaos/i,                    "Kaos Ligi",          "Chaos League"],
  [/boatbattle/i,               "Tekne Savaşı",       "Boat Battle"],
  [/riverrace|clanwar|^cw_/i,   "Klan Savaşı",        "Clan War"],
  [/duel/i,                     "Düello",             "Duel"],
  [/draft/i,                    "Taslak",             "Draft"],
  [/showdown/i,                 "Kapışma",            "Showdown"],
  [/teamvsteam|2v2/i,           "2v2 Takım Savaşı",   "2v2"],
  [/tournament/i,               "Turnuva",            "Tournament"],
  [/challenge/i,                "Mücadele",           "Challenge"],
  [/ranked/i,                   "Nihai Kademe",       "Path of Legends"],
  [/ladder/i,                   "Kupa Yolu",          "Trophy Road"],
  [/friendly|practice/i,        "Dostluk Maçı",       "Friendly"],
];

/* Sezon etkinlikleri kupa yolunun üstünde oynanıyor; mod adı
   "TripleElixir_Ladder" gibi geliyor. Sadece "Kupa Yolu" yazarsak
   etkinlik olduğu kaybolur, o yüzden başına adını koyuyoruz. */
const MODE_MODS = [
  [/tripleelixir/i, "3x İksir",     "Triple Elixir"],
  [/doubleelixir/i, "2x İksir",     "Double Elixir"],
  [/suddendeath/i,  "Ani Ölüm",     "Sudden Death"],
  [/megadeck/i,     "Mega Deste",   "Mega Deck"],
  [/goldrush/i,     "Altın Hücumu", "Gold Rush"],
  [/crownrush/i,    "Taç Hücumu",   "Crown Rush"],
  [/gemrush/i,      "Elmas Hücumu", "Gem Rush"],
  [/mirror/i,       "Ayna",         "Mirror"],
  [/rage/i,         "Öfke",         "Rage"],
];

/* Son çare: listede ve desenlerde tutmayan mod adı.

   Eskiden burası ham İngilizceyi olduğu gibi basıyordu ve ekranda
   "CRAZY ARENA EPIC ONLY" gibi yazılar çıkıyordu. Supercell her sezon
   yeni etkinlik modu ekliyor, yani listeyi ne kadar doldurursak
   dolduralım bir gün buraya düşen yeni bir ad olacak.

   Çözüm: adı KELİMELERİNE ayırıp bilinenleri çeviriyoruz. Tanımadığımız
   kelime olduğu gibi kalıyor — yani en kötü ihtimalle yarı Türkçe bir ad
   çıkar, tamamen İngilizce değil. Bir mod sık görünmeye başlarsa
   yukarıdaki tam listeye düzgün adıyla eklenir; burası yalnızca
   "hiç değilse anlaşılsın" katmanı. */
const MODE_KELIME = {
  arena:"Arena", crazy:"Çılgın", only:"Sadece", epic:"Destansı", rare:"Ender",
  common:"Sıradan", legendary:"Efsanevi", champion:"Şampiyon", elixir:"İksir",
  deck:"Deste", draft:"Taslak", sudden:"Ani", death:"Ölüm", mirror:"Ayna",
  rage:"Öfke", gold:"Altın", crown:"Taç", gem:"Elmas", rush:"Hücumu",
  event:"Etkinlik", challenge:"Mücadele", battle:"Savaşı", duel:"Düello",
  mode:"Modu", boat:"Tekne", war:"Savaşı", clan:"Klan", friendly:"Dostluk",
  ladder:"Kupa Yolu", tournament:"Turnuva", touchdown:"Sayı Koşusu",
  ranked:"Sıralamalı", classic:"Klasik", grand:"Büyük", royal:"Kraliyet",
  chaos:"Kaos", showdown:"Kapışma", practice:"Antrenman", triple:"3x",
  double:"2x", mega:"Mega", all:"Tüm", cards:"Kartlar", new:"Yeni",
  newarena:"Yeni Arena", league:"Lig", season:"Sezon", quest:"Görev",
  special:"Özel", party:"Parti", fun:"Eğlence", night:"Gece", day:"Gün",
};
function humanMode(name){
  const parcalar = String(name || "")
    .replace(/_/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim().split(" ").filter(Boolean);
  if (LANG !== "tr") return parcalar.join(" ");
  return parcalar.map((k) => {
    const c = MODE_KELIME[k.toLowerCase()];
    return c === undefined ? k : c;
  }).filter(Boolean).join(" ");
}

/*
  b: savaş nesnesi ({ modeName, rawType, ... }) ya da eski kullanım için
  düpedüz `type` metni de kabul edilir.
*/
function battleTypeName(b){
  const tr = LANG === "tr";
  const battle = (b && typeof b === "object") ? b : { rawType: b || "", modeName: "" };
  const mode = String(battle.modeName || "");
  const key = mode.toLowerCase();

  let ad = (tr ? MODE_TR : MODE_EN)[key];
  const listede = !!ad;                     // tam liste zaten etkinliği adlandırmış olur

  if (!ad) for (const [re, adTr, adEn] of MODE_PATTERNS)
    if (re.test(mode)) { ad = tr ? adTr : adEn; break; }

  if (!listede) for (const [re, mTr, mEn] of MODE_MODS) {
    if (!re.test(mode)) continue;
    const m = tr ? mTr : mEn;
    // Kupa yolu üstünde oynanan etkinlik: "3x İksir Etkinliği"
    ad = /^(Kupa Yolu|Trophy Road)$/.test(ad || "")
      ? m + (tr ? " Etkinliği" : " Event")
      : m + " " + (ad || "");
    break;
  }

  if (!ad) {
    // Mod adı yoksa eski `type` çevirisine düş.
    // ("trail" bir etkinlik torbası — adı hiçbir şey anlatmıyor, atlıyoruz.)
    const t2 = I18N[LANG] && I18N[LANG]["bt." + battle.rawType];
    ad = (t2 && battle.rawType !== "trail") ? t2
       : (humanMode(mode) || (I18N[LANG] && I18N[LANG]["bt.other"]) || "");
  }

  /* Mod adı "Friendly" derken tür "clanMate" diyorsa, klan içi bir maçtır —
     bu ayrımı yalnızca `type` biliyor, o yüzden en sonda ekliyoruz. */
  if (/^clanMate/.test(battle.rawType)) {
    const on = tr ? "Klan" : "Clan";
    if (!new RegExp("^" + on, "i").test(ad)) ad = on + " " + ad;
  }
  return ad;
}

/* Rozetin üstüne gelince çıkan açıklama: deste kuralı ve etkinlik bilgisi. */
const DECK_RULE = {
  tr: { collection:"Kendi destesi", eventDeck:"Etkinlik destesi", draft:"Taslak (kart seçimi)",
        draftCompetitive:"Rekabetçi taslak", quadDeckPick:"Dört deste seçimi", predefined:"Hazır deste" },
  en: { collection:"Own deck", eventDeck:"Event deck", draft:"Draft",
        draftCompetitive:"Competitive draft", quadDeckPick:"Four-deck pick", predefined:"Preset deck" },
};
function battleTypeHint(b){
  if (!b || typeof b !== "object") return "";
  const tr = LANG === "tr";
  const bits = [];
  if (b.modeName) bits.push(b.modeName);
  const rule = (DECK_RULE[tr ? "tr" : "en"] || {})[b.deckSelection];
  if (rule) bits.push(rule);
  if (b.hosted) bits.push(tr ? "Özel kurulan maç" : "Hosted match");
  if (b.tournamentTag) bits.push((tr ? "Turnuva: " : "Tournament: ") + b.tournamentTag);
  else if (b.eventTag) bits.push((tr ? "Etkinlik: " : "Event: ") + b.eventTag);
  return bits.join(" · ");
}

/* One battle from a player's OWN log, seen from that player's side.
   The log does not promise the searched player is team[0] (2v2 puts two
   accounts on a side), so the side is chosen by tag and only falls back to
   team[0] when no tag matches. */
function mapOwnBattle(b, myTag){
  try {
    const want = String(myTag || "").replace(/^#/, "").toUpperCase();
    const team = b.team || [], opp = b.opponent || [];
    let mine = team, theirs = opp;
    if (want && opp.some((p) => String(p.tag || "").replace(/^#/, "").toUpperCase() === want)){
      mine = opp; theirs = team;
    }
    const me = mine[0], op = theirs[0];
    if (!me || !op) return null;
    const reg = (arr) => {
      const keys = [], evo = [], hero = [];
      const list = arr || [];
      const { evos, heroes } = splitSlots(list.filter((c) => c.evolutionLevel), list, true);
      const evoIds = new Set(evos.map((c) => c.id)), heroIds = new Set(heroes.map((c) => c.id));
      list.forEach((c) => {
        const k = registerApiCard({ id:c.id, name:c.name, elixirCost:c.elixirCost,
          icon:c.iconUrls?.medium, evoIcon:c.iconUrls?.evolutionMedium, rarity:c.rarity,
          maxEvolutionLevel:c.maxEvolutionLevel });
        keys.push(k); if (evoIds.has(c.id)) evo.push(k); if (heroIds.has(c.id)) hero.push(k);
      });
      return { keys, evo, hero };
    };
    const md = reg(me.cards), od = reg(op.cards);
    /* Taç sayısı TOPLANMAZ. 2v2'de API her iki takım arkadaşına da AYNI
       değeri yazıyor — o değer takımın tacı, oyuncunun kendi payı değil.
       Toplamak ekranda 6-0 gibi imkânsız skorlar üretiyordu; bir maçta en
       fazla 3 taç vardır. Ölçüm: 41 oyuncunun günlüğünde çok kişilik 64
       tarafın 64'ünde de takım arkadaşlarının tacı birebir aynı, görülen en
       yüksek tek değer 3. `max` hem doğru değeri veriyor hem de ileride
       ikisi farklı gelirse makul olanı seçiyor. */
    const takimTaci = (yan) => Math.max(0, ...yan.map((p) => p.crowns || 0));
    const mc = takimTaci(mine), tc = takimTaci(theirs);
    /* NİHAİ KADEME / MADALYON AYRIMI — ölçülmüş kural.
       `type === "pathOfLegend"` bir maçın sıralamalı olduğunu söyler ama
       MADALYONLU olduğunu söylemez. 284 maç üzerinde ölçtük: 1–6. liglerde
       API `startingTrophies` vermiyor, `globalRank` boş ve `trophyChange`
       her galibiyette sabit 30 — bu bir madalyon değil, lig basamağı.
       Oyuncunun profilindeki madalyonu da 0. Sadece en üst ligde (7)
       `startingTrophies` + `globalRank` geliyor ve orada değişim gerçekten
       madalyondur (ör. +27, -29). Onun için madalyon defterini yalnızca
       `startingTrophies` varsa açıyoruz; yoksa lig adını yazıyoruz. */
    const madalyonlu = b.type === "pathOfLegend" && me.startingTrophies != null;
    const change = madalyonlu ? (me.trophyChange ?? null) : null;
    const before = madalyonlu ? me.startingTrophies : null;
    return {
      result: mc > tc ? "win" : mc < tc ? "loss" : "draw",
      crowns: `${mc}-${tc}`, myCrowns: mc, opCrowns: tc,
      // raw type kept so the label follows the language, with the game mode
      // name as a fallback for modes we have no translation for
      rawType: b.type || "", modeName: b.gameMode?.name || "",
      deckSelection: b.deckSelection || "", hosted: !!b.isHostedMatch,
      eventTag: b.eventTag || "", tournamentTag: b.tournamentTag || "",
      ranked: b.type === "pathOfLegend",
      /* Eşleşme rozeti için: maç TEK KİŞİLİK mi ve iki tarafın da sekiz
         kartı belli mi? 2v2'de bir tarafta iki ayrı deste var, "destenin
         kazanma koşulu" diye tek bir şey yok — orada rozet basılmıyor. */
      tekTek: mine.length === 1 && theirs.length === 1
              && (me.cards || []).length === 8 && (op.cards || []).length === 8,
      madalyonlu, lig: b.leagueNumber ?? null,
      rank: me.globalRank ?? null,
      before, after: change == null || before == null ? null : before + change, change,
      opp: op.name || "—", oppTag: op.tag || "",
      // Rakibin rozetleri (sunucudan geliyor): günlükte de görünsün.
      oppVerified: !!op.verified, oppNote: op.note || "", oppPro: !!op.pro, oppProRank: op.proRank || null,
      oppClan: op.clan?.name || "", oppClanTag: op.clan?.tag || "",
      myDeck: md.keys, myEvo: md.evo, myHero: md.hero, opDeck: od.keys, opEvo: od.evo, opHero: od.hero,
      ago: b.battleTime ? relativeTime(crTime(b.battleTime)) : "",
    };
  } catch { return null; }
}

/* CR stamps time as 20260814T174653.000Z, which Date can't parse — insert the
   separators ISO-8601 wants. */
function crTime(s){
  const m = String(s||"").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : s;
}

function paintApiStatus(){
  document.querySelectorAll("[data-api-status]").forEach(el => {
    el.classList.toggle("live", HypnoAPI.online);
    el.innerHTML = `<span class="led"></span>${HypnoAPI.online ? t("api.live") : t("api.off")}`;
  });
}

/* ---------- Header / Footer ---------- */
/* The Eğlence entry is a menu, not a link: Cenabet and the other games live
   INSIDE it rather than each taking a slot in the top bar. */
function funMenu(){
  // Son alan: puan veren oyun mu? (Çekmecedeki işaretle aynı.)
  /* Her satırda ÇAPA olmak zorunda: çapasız bağlantı Eğlence sayfasını açıp
     oyunu açmıyordu (Kart Sıralama'da tam olarak bu oluyordu). */
  const items = [
    ["eglence.html#siralama", t("fun.rank"), "🎲", 0],
    ["eglence.html#deste", t("fun.deck"), "🧪", 0],
    ["eglence.html#cark", t("fun.wheel"), "🎡", 0],
    ["eglence.html#cenabet", t("nav.cenabet"), "🤪", 0],
    ["eglence.html#gunun", t("fun.daily"), "🎯", 1],
    ["eglence.html#yarisma", t("fun.quiz"), "🎓", 1],
    ["eglence.html#duello", t("fun.duel"), "⚔️", 1],
    ["eglence.html#eksik", t("fun.missing"), "🧩", 1],
    ["eglence.html#kapisma", t("fun.clash"), "🥊", 1],
    ["eglence.html#tahmin", t("fun.guess"), "🔮", 0],
  ];
  return `<span class="nav-sub">${items.map(([h,l,i,p]) =>
    `<a href="${h}"><span class="ns-ic">${i}</span>${l}${
      p ? `<span class="pts-badge">${t("tile.pts")}</span>` : ""}</a>`).join("")}</span>`;
}

/* Üst menü ve alt çubuk aynı listeyi kullanıyor — iki yerde ayrı durunca
   biri güncellenip diğeri unutuluyor. */
const NAV = [
  ["index.html","nav.home"],["siralamalar.html","nav.ranks"],["canli.html","nav.live"],
  ["meta.html","nav.meta"],["kartlar.html","nav.cards"],["eglence.html","nav.fun"],
];

function buildHeader(active){
  const nav = NAV;
  return `
  <header class="site-header">
    <div class="header-inner">
      <button class="icon-btn menu-btn" onclick="openDrawer()" title="${t("chrome.menu")}">${ICONS.menu}</button>
      <a class="brand" href="index.html" title="${t("nav.home")}">
        <span class="brand-logo"><img src="assets/img/hammer-logo.jpg" alt="HYPNOSHUB" onerror="this.parentElement.innerHTML=ICONS.hammer"></span>
        <span class="brand-text"><span class="brand-name"><span class="w">HYPNOS</span><span class="b">HUB</span></span></span>
      </a>
      <nav class="main-nav">
        ${nav.map(([href,key]) => key === "nav.fun"
          ? `<span class="nav-item has-sub"><a href="${href}" class="${active===href?"active":""}" data-i18n="${key}">${t(key)}</a>${funMenu()}</span>`
          : `<a href="${href}" class="${active===href?"active":""}" data-i18n="${key}">${t(key)}</a>`).join("")}
      </nav>
      <div class="header-tools">
        <div class="search-box" role="search">
          <select id="searchType" aria-label="${t("chrome.searchType")}">
            <option value="player" data-i18n="search.player">${t("search.player")}</option>
            <option value="clan" data-i18n="search.clan">${t("search.clan")}</option>
          </select>
          <input id="searchInput" type="text" data-i18n-ph="search.ph" placeholder="${t("search.ph")}"
                 aria-label="Arama" onkeydown="if(event.key==='Enter')doSearch()">
          <button class="search-go" onclick="doSearch()" aria-label="Ara">${ICONS.search}</button>
        </div>
        <button class="icon-btn" onclick="toggleTheme()" title="${t("chrome.theme")}"><span data-theme-icon></span></button>
        <button class="icon-btn" onclick="toggleLang()" title="${t("chrome.lang")}"><span data-lang-label>TR</span></button>
        <button class="icon-btn" onclick="openFavs()" title="${t("fav.title")}" id="favBtn">${ICONS.heart}</button>
        <span id="authSlot"></span>
      </div>
    </div>
  </header>`;
}

/* Alt çubuk (mobil). Başlığın içinde DEĞİL, doğrudan <body>'nin son çocuğu
   olarak kuruluyor. `position:fixed` bir öğe, atalarından biri transform /
   filter / backdrop-filter taşıyorsa ekrana değil O ATAYA göre konumlanır —
   .site-header'da `backdrop-filter` var ve çubuk onunla aynı kapsayıcının
   içindeydi. Gövdeye taşımak bu riski tümden kaldırıyor. */
function mountBottomNav(active){
  document.querySelector(".bottom-nav")?.remove();
  const el = document.createElement("nav");
  el.className = "bottom-nav";
  el.innerHTML = NAV.map(([href, key]) => {
    const kisa = "bn." + key.slice(4);          // nav.ranks → bn.ranks
    return `<a href="${href}" class="${active === href ? "active" : ""}" title="${t(key)}">
       <span class="bn-ic">${bottomIcon(key)}</span>
       <span class="bn-tx" data-i18n="${kisa}">${t(kisa)}</span>
     </a>`;
  }).join("");
  document.body.appendChild(el);
  altCubuguSabitle();
}

/* Alt çubuğu GÖRSEL görünüm alanının altına yapıştırır.

   `position:fixed` mobil Safari'de DÜZEN görünüm alanına göre konumlanır,
   ekranda gerçekten görünen alana göre değil. İkisi aynı şey değil: sayfayı
   kaydırınca Safari'nin alt araç çubuğu toplanıyor, görünen alan büyüyor ama
   düzen alanı olduğu yerde kalıyor — çubuk da bu yüzden ekranın altına
   yapışmayıp yukarıda asılı kalıyor ve altında içerik görünüyor.

   visualViewport iki alan arasındaki farkı bize veriyor; farkı kadar aşağı
   ötelersek çubuk her durumda gerçek ekran altında duruyor. Tarayıcı bu API'yi
   desteklemiyorsa hiçbir şey yapılmıyor ve davranış eski hâline dönüyor —
   yani masaüstünde ve Android'de zaten doğru olan `bottom:0`. */
function altCubuguSabitle(){
  const vv = window.visualViewport;
  const el = document.querySelector(".bottom-nav");
  if (!el || !vv) return;
  let bekleyen = false;
  const uygula = () => {
    bekleyen = false;
    const cubuk = document.querySelector(".bottom-nav");
    if (!cubuk) return;
    /* Düzen alanının altı ile görünen alanın altı arasındaki fark.
       Negatife düşmesin: klavye açıkken vv.height küçülüyor, o durumda
       çubuğu klavyenin üstüne itmek doğru davranış. */
    const fark = document.documentElement.clientHeight - (vv.height + vv.offsetTop);
    cubuk.style.transform = fark > 0.5 ? `translateY(${-fark}px)` : "";
  };
  const planla = () => { if (!bekleyen){ bekleyen = true; requestAnimationFrame(uygula); } };
  vv.addEventListener("resize", planla);
  vv.addEventListener("scroll", planla);
  window.addEventListener("orientationchange", () => setTimeout(planla, 250));
  planla();
}
function bottomIcon(key){
  return ({ "nav.home":"🏠","nav.meta":"🃏","nav.ranks":"🏆","nav.live":"🔴","nav.cards":"📇","nav.fun":"🎉","nav.cenabet":"🤪" })[key] || "•";
}

function buildFooter(){
  return `
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-top">
        <div class="footer-brand">
          <div class="brand" style="margin-bottom:12px">
            <span class="brand-logo"><img src="assets/img/hammer-logo.jpg" alt="HYPNOSHUB" onerror="this.parentElement.innerHTML=ICONS.hammer"></span>
            <span class="brand-text"><span class="brand-name"><span class="w">HYPNOS</span><span class="b">HUB</span></span></span>
          </div>
          <p style="opacity:.8;max-width:34ch;font-size:.88rem" data-i18n="chrome.about">${t("chrome.about")}</p>
          <span class="api-lock">${ICONS.lock}<span>API</span></span>
        </div>
        <div class="footer-col">
          <h4 data-i18n="chrome.menu">${t("chrome.menu")}</h4>
          <a href="index.html" data-i18n="nav.home">${t("nav.home")}</a>
          <a href="meta.html" data-i18n="nav.meta">${t("nav.meta")}</a>
          <a href="siralamalar.html" data-i18n="nav.ranks">${t("nav.ranks")}</a>
          <a href="canli.html" data-i18n="nav.live">${t("nav.live")}</a>
          <a href="kartlar.html" data-i18n="nav.cards">${t("nav.cards")}</a>
        </div>
        <div class="footer-col">
          <h4 data-i18n="chrome.site">${t("chrome.site")}</h4>
          <a href="guncellemeler.html" data-i18n="nav.updates">Güncellemeler</a>
          <!-- "Gizlilik" bir dönem href="#" olduğu için kaldırılmıştı; artık
               gerçek bir sayfası var (aydınlatma metni + KVKK hakları) ve
               yasal olarak her sayfadan ulaşılabilir olması gerekiyor. -->
          <a href="gizlilik.html" data-i18n="footer.privacy">${t("footer.privacy")}</a>
          <h4 style="margin-top:16px" data-i18n="footer.contact">${t("footer.contact")}</h4>
          <a href="mailto:${CONTACT.mail}" class="social-link">${ICONS.mail}<span>${CONTACT.mail}</span></a>
        </div>
        <div class="footer-col">
          <h4>${LANG==="tr"?"Takip Et":"Follow"}</h4>
          <a href="${SOCIAL.instagram}" target="_blank" rel="noopener" class="social-link">${ICONS.instagram}<span>Instagram</span></a>
          <a href="${SOCIAL.youtube}" target="_blank" rel="noopener" class="social-link">${ICONS.youtube}<span>YouTube</span></a>
        </div>
      </div>
      <div class="footer-disclaimer">
        <span class="api-lock">${ICONS.lock}<span>API KEY</span></span>
        <span data-i18n="footer.disclaimer">${t("footer.disclaimer")}</span>
        <span style="margin-left:auto">© ${new Date().getFullYear()} HYPNOSHUB · <span data-i18n="footer.copyright">Telif Hakkı</span></span>
      </div>
      <div class="footer-credit">${t("chrome.credit")}: <b>Ahmet Maksut Gürsu</b></div>
    </div>
  </footer>`;
}

/* ---------- Drawer (hamburger → everything) ---------- */
function openDrawer(){
  let d = document.getElementById("hs-drawer");
  if (!d){
    d = document.createElement("div");
    d.id = "hs-drawer"; d.className = "drawer-overlay";
    d.addEventListener("click", e => { if (e.target === d) closeDrawer(); });
    document.body.appendChild(d);
  }
  /* Puan kazandıran oyunların yanına küçük bir işaret. Bilerek sessiz:
     rozet küçük, soluk ve satırın sonunda — listeyi bağırtmasın. */
  const link = (href,label,ic,pts) => `<a class="dr-link" href="${href}"><span class="dr-ic">${ic}</span>${label}${
    pts ? `<span class="pts-badge" title="${t("fun.earns")}">${t("fun.pts")}</span>` : ""}</a>`;
  d.innerHTML = `
    <aside class="drawer">
      <div class="dr-head">
        <span class="brand"><span class="brand-logo"><img src="assets/img/hammer-logo.jpg" onerror="this.parentElement.innerHTML=ICONS.hammer"></span><span class="brand-name"><span class="w">HYPNOS</span><span class="b">HUB</span></span></span>
        <button class="icon-btn" onclick="closeDrawer()" aria-label="Kapat">${ICONS.x}</button>
      </div>
      <div class="dr-search">
        <div class="search-box" style="border-radius:12px">
          <select id="drType"><option value="player">${t("search.player")}</option><option value="clan">${t("search.clan")}</option></select>
          <input id="drInput" type="text" placeholder="${t("search.ph")}" style="flex:1;min-width:0" onkeydown="if(event.key==='Enter')drSearch()">
          <button class="search-go" onclick="drSearch()">${ICONS.search}</button>
        </div>
        <span class="dr-hint">${t("chrome.hint")}</span>
      </div>
      <div class="dr-sec">${t("chrome.menu")}</div>
      ${link("index.html", t("nav.home"), "🏠")}
      ${link("siralamalar.html", t("ranks.pol")+" — "+t("nav.ranks"), "🏆")}
      ${link("klanlar.html", t("chrome.clanBoard"), "🛡️")}
      <button class="dr-link" onclick="closeDrawer();openFavs()"><span class="dr-ic">❤️</span>${t("fav.title")}</button>
      ${link("canli.html", t("nav.live"), "🔴")}
      ${link("meta.html", t("nav.meta"), "🃏")}
      ${link("anti.html", t("nav.anti"), "🛡️")}
      ${link("kartlar.html", t("nav.cards"), "📇")}
      ${link("oyuncu.html", t("home.player.title"), "👤")}
      ${link("klan.html", t("home.clan.title"), "🔍")}
      ${link("guncellemeler.html", t("nav.updates"), "📢")}
      <div class="dr-sec fun">🎉 ${t("chrome.fun")}</div>
      ${link("eglence.html", t("fun.rank"), "🎲")}
      ${link("eglence.html#cark", t("fun.wheel"), "🎡")}
      ${link("eglence.html#cenabet", t("fun.cenabet"), "🤪")}
      ${link("eglence.html#gunun", t("fun.daily"), "🎯", 1)}
      ${link("eglence.html#yarisma", t("fun.quiz"), "🎓", 1)}
      ${link("eglence.html#duello", t("fun.duel"), "⚔️", 1)}
      ${link("eglence.html#eksik", t("fun.missing"), "🧩", 1)}
      ${link("eglence.html#kapisma", t("fun.clash"), "🥊", 1)}
      ${link("eglence.html#tahmin", t("fun.guess"), "🔮")}
      <div class="dr-link soon"><span class="dr-ic">❓</span>${t("chrome.newFun")} <span class="soon-badge">${t("tag.soon")}</span></div>
      <div class="dr-sec">${t("fb.section")}</div>
      <button class="dr-link" onclick="closeDrawer();openFeedback()"><span class="dr-ic">💬</span>${t("fb.title")}</button>
      ${IS_ADMIN ? `<button class="dr-link" onclick="closeDrawer();openInbox('')"><span class="dr-ic">📥</span>${t("fb.inbox")}${FB_UNREAD ? `<span class="pts-badge" style="margin-left:auto;background:rgba(224,67,95,.16);color:#e0435f">${FB_UNREAD}</span>` : ""}</button>` : ""}
      ${ME ? `<button class="dr-link" onclick="closeDrawer();openMessages()"><span class="dr-ic">💌</span>${t("msg.title")}${MSG_UNREAD ? `<span class="pts-badge" style="margin-left:auto;background:rgba(224,67,95,.16);color:#e0435f">${MSG_UNREAD}</span>` : ""}</button>` : ""}
      ${IS_ADMIN ? `<button class="dr-link" onclick="closeDrawer();openProAdmin('bekliyor')"><span class="dr-ic">🏅</span>${t("pro.admin")}${PRO_PENDING ? `<span class="pts-badge" style="margin-left:auto;background:rgba(224,67,95,.16);color:#e0435f">${PRO_PENDING}</span>` : ""}</button>` : ""}
      ${IS_ADMIN ? `<button class="dr-link" onclick="closeDrawer();openUserAdmin('')"><span class="dr-ic">🚫</span>${t("admin.users")}</button>` : ""}
      <div class="dr-foot">
        <a href="${SOCIAL.instagram}" target="_blank" rel="noopener" class="icon-btn">${ICONS.instagram}</a>
        <a href="${SOCIAL.youtube}" target="_blank" rel="noopener" class="icon-btn">${ICONS.youtube}</a>
        <button class="icon-btn" onclick="toggleTheme()"><span data-theme-icon></span></button>
        <button class="icon-btn" onclick="toggleLang()"><span data-lang-label>TR</span></button>
      </div>
    </aside>`;
  requestAnimationFrame(()=>d.classList.add("open"));
  attachSuggest(document.getElementById("drInput"), () => document.getElementById("drType").value);
  applyTheme(document.documentElement.getAttribute("data-theme")||"light");
  document.querySelectorAll("#hs-drawer [data-lang-label]").forEach(el=>el.textContent=LANG.toUpperCase());
  document.addEventListener("keydown", drEsc);
}
function drEsc(e){ if(e.key==="Escape") closeDrawer(); }
function closeDrawer(){ const d=document.getElementById("hs-drawer"); if(d) d.classList.remove("open"); document.removeEventListener("keydown", drEsc); }
function drSearch(){
  location.href = searchUrl(document.getElementById("drType").value, document.getElementById("drInput").value);
}

/* ---------- Live suggestions (type-ahead) ----------
   Attaches a dropdown to any search input: the visitor sees matching players
   or clans while typing and picks one, instead of pressing Enter and landing
   on a results page. Requests are debounced and the in-flight one is dropped
   when a newer keystroke arrives, so a fast typist never sees stale results. */
const SUGGEST_DEBOUNCE = 180;

function attachSuggest(input, getType){
  if (!input || input.dataset.suggest) return;
  input.dataset.suggest = "1";
  input.setAttribute("autocomplete", "off");

  const box = document.createElement("div");
  box.className = "sug-box";
  const host = input.closest(".search-box") || input.parentElement;
  host.style.position = host.style.position || "relative";
  host.appendChild(box);

  let timer = null, seq = 0, items = [], active = -1;

  const close = () => { box.classList.remove("open"); active = -1; };
  const paint = () => {
    if (!items.length){ close(); return; }
    box.innerHTML = items.map((it, i) => it.clan
      ? `<a class="sug-row ${i===active?"on":""}" href="klan.html?tag=${encodeURIComponent(it.tag)}">
           <span class="sug-ic">${clanCrest(it.badge, 26)}</span>
           <span class="sug-main"><span class="n">${esc(it.name)}${verifyTick(it)}<span class="tag">${it.tag}</span></span>
           <span class="s">${[it.region, it.members ? it.members + "/50" : ""].filter(Boolean).join(" · ")}</span></span></a>`
      : `<a class="sug-row ${i===active?"on":""}" href="oyuncu.html?tag=${encodeURIComponent(it.tag)}">
           <span class="sug-ic">👤</span>
           <span class="sug-main"><span class="n">${esc(it.name)}${verifyTick(it)}<span class="tag">${it.tag}</span></span>
           <span class="s">${it.clanName ? `${clanCrest(it.badge,15)} ${esc(it.clanName)}` : `<span class="muted">${t("word.none")}</span>`}</span></span>
           <span class="sug-val">${it.elo > 0 ? polScore(it.elo, 14)
              : it.trophies != null ? nfTR(it.trophies) + " 🏆" : ""}</span></a>`
    ).join("");
    box.classList.add("open");
  };

  const run = async () => {
    const q = input.value.trim();
    if (q.length < 2){ items = []; close(); return; }
    const mine = ++seq;
    const type = getType();
    const r = type === "clan" ? await HypnoAPI.clansSearch(q) : await HypnoAPI.playersSearch(q);
    if (mine !== seq) return;                       // a newer keystroke won
    items = ((r && r.items) || []).slice(0, 8).map(x => ({ ...x, clan: type === "clan" }));
    paint();
  };

  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, SUGGEST_DEBOUNCE); });
  input.addEventListener("focus", () => { if (items.length) paint(); });
  input.addEventListener("keydown", (e) => {
    if (!box.classList.contains("open")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp"){
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : items.length - 1) + (active < 0 && e.key === "ArrowUp" ? 1 : 0)) % items.length;
      paint();
    } else if (e.key === "Enter" && active >= 0){
      e.preventDefault();
      box.querySelectorAll(".sug-row")[active]?.click();
    } else if (e.key === "Escape") close();
  });
  document.addEventListener("click", (e) => { if (!host.contains(e.target)) close(); });
}
/* Tek tırnak da kaçırılıyor: onclick="..." kadar onclick='...' de kullanıyoruz,
   ve içeriye kullanıcı adı gibi serbest metinler giriyor. */
function esc(s){ return String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

/* Bir değeri onclick içine argüman olarak gömmenin güvenli yolu. */
const jsArg = (v) => esc(JSON.stringify(v));

/* ---------- Search routing ----------
   The query travels as `?q=`, never as `?tag=`: a name is not a tag, and the
   target page must be free to answer with a *list of matches*. (`?tag=` is
   still honoured on arrival, for links that point straight at one profile.)
   An empty box goes to the bare page, which now shows a prompt rather than
   loading some arbitrary profile. */
/* Clash Royale tags are drawn from a 14-character alphabet that excludes O, I
   and S, so a pasted tag stays recognisable even without its leading '#'.
   Mirrors looksLikeTag() in server.js — keep the two in step. */
const TAG_CHARS = /^[0289PYLQGRJCUV]+$/;
function looksLikeTag(s){
  const raw = String(s || "").trim();
  const body = raw.replace(/^#/, "").toUpperCase();
  if (raw.startsWith("#")) return body.length >= 3 && TAG_CHARS.test(body);
  return body.length >= 7 && TAG_CHARS.test(body);
}
function normTag(s){ return "#" + String(s || "").trim().replace(/^#/, "").toUpperCase(); }

function searchUrl(type, q){
  const page = type === "clan" ? "klan.html" : "oyuncu.html";
  q = (q || "").trim();
  return page + (q ? "?q=" + encodeURIComponent(q) : "");
}
function doSearch(){
  const type = document.getElementById("searchType")?.value || "player";
  location.href = searchUrl(type, document.getElementById("searchInput")?.value);
}

/* ============================================================
   Hesap — kayıt / giriş
   ------------------------------------------------------------
   Oturum çerezi HttpOnly, yani buradaki JavaScript onu okuyamaz;
   "giriş yapılmış mı" sorusunu her zaman sunucuya soruyoruz
   (/api/auth/me). İstekler `credentials: "same-origin"` ile
   gidiyor ki çerez eklensin.
   ============================================================ */
let ME = null;

async function authFetch(path, body){
  const res = await fetch(API_BASE + "/auth" + path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...data };
}

async function loadMe(){
  const r = await authFetch("/me").catch(() => null);
  ME = r && r.user ? r.user : null;
  paintAuth();
  if (ME) await loadAdmin(); else { IS_ADMIN = false; FB_UNREAD = 0; stopWatch(); }
  // Yasaklı hesap oturumsuz sayılıyor; ne olduğunu bir kez söyleyelim.
  if (r && r.banned && !sessionStorage.getItem("hs-ban-seen")){
    sessionStorage.setItem("hs-ban-seen", "1");
    toast(r.message || (LANG === "tr" ? "Hesabın askıya alındı." : "Your account is suspended."));
  }
}

function paintAuth(){
  const slot = document.getElementById("authSlot");
  if (!slot) return;
  slot.innerHTML = ME
    ? `<span class="auth-me">
         <button class="auth-name" onclick="openAccount()" title="${LANG==="tr"?"Hesabım":"My account"}">
           <span class="auth-av">${esc(ME.username.slice(0,1).toUpperCase())}</span>
           <span class="auth-u">${esc(ME.username)}</span>
           ${(FB_UNREAD + MSG_UNREAD + PRO_PENDING) ? `<span class="auth-dot">${FB_UNREAD + MSG_UNREAD + PRO_PENDING}</span>` : ""}
         </button>
       </span>`
    : `<button class="btn btn-ghost auth-btn" onclick="openAuth('login')">${LANG==="tr"?"Giriş Yap":"Log in"}</button>
       <button class="btn btn-primary auth-btn" onclick="openAuth('register')">${LANG==="tr"?"Kayıt Ol":"Sign up"}</button>`;
}

function openAuth(tab){
  const TRa = LANG === "tr";
  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
    <div class="auth-tabs">
      <button id="tabLogin" class="${tab==="login"?"on":""}" onclick="authTab('login')">${TRa?"Giriş Yap":"Log in"}</button>
      <button id="tabReg" class="${tab==="register"?"on":""}" onclick="authTab('register')">${TRa?"Kayıt Ol":"Sign up"}</button>
    </div>
    <form class="auth-form" id="authForm" onsubmit="return authSubmit(event)">
      <div id="regOnly" style="display:${tab==="register"?"block":"none"}"></div>
      <label class="auth-l">${TRa?"Kullanıcı adı":"Username"}
        <input id="auName" autocomplete="username" required maxlength="20"
               placeholder="${TRa?"ör. hypnos":"e.g. hypnos"}"></label>
      <label class="auth-l" id="auMailWrap" style="display:${tab==="register"?"block":"none"}">
        ${TRa?"E-posta":"Email"}
        <input id="auMail" type="email" autocomplete="email" placeholder="ornek@mail.com"></label>
      <label class="auth-l">${TRa?"Şifre":"Password"}
        <input id="auPass" type="password" required minlength="8"
               autocomplete="${tab==="register"?"new-password":"current-password"}"
               placeholder="${TRa?"en az 8 karakter":"at least 8 characters"}"></label>
      ${/* KVKK m.10: kişisel veri toplanmadan ÖNCE bilgilendirme. Kutu
            `required` — tarayıcı boş bırakılmasına izin vermiyor; sunucu da
            ayrıca denetliyor, çünkü doğrudan API'ye istek atan biri bu
            kutuyu hiç görmez. */""}
      <label class="auth-kvkk" id="auKvkkWrap" style="display:${tab==="register"?"flex":"none"}">
        <input type="checkbox" id="auKvkk" ${tab==="register"?"required":""}>
        <span>${TRa
          ? `<a href="gizlilik.html" target="_blank" rel="noopener">Aydınlatma metnini</a>
             okudum; kullanıcı adı, e-posta ve hesap verilerimin bu kapsamda
             işlenmesini kabul ediyorum.`
          : `I have read the <a href="gizlilik.html" target="_blank" rel="noopener">privacy notice</a>
             and accept the processing of my account data as described.`}</span>
      </label>
      <div class="auth-msg" id="auMsg"></div>
      <button class="btn btn-primary auth-go" type="submit" id="auGo">
        ${tab==="register" ? (TRa?"Hesap Oluştur":"Create account") : (TRa?"Giriş Yap":"Log in")}</button>
      <p class="auth-note">${TRa
        ? "Şifreniz sunucuda <b>scrypt</b> ile saklanır, düz metin olarak hiçbir yere yazılmaz."
        : "Your password is stored with <b>scrypt</b>, never in plain text."}</p>
    </form>`);
  AUTH_TAB = tab;
  setTimeout(() => document.getElementById("auName")?.focus(), 50);
}

let AUTH_TAB = "login";
function authTab(tab){ openAuth(tab); }

async function authSubmit(e){
  e.preventDefault();
  const TRa = LANG === "tr";
  const msg = document.getElementById("auMsg");
  const go = document.getElementById("auGo");
  const username = document.getElementById("auName").value.trim();
  const password = document.getElementById("auPass").value;
  const email = document.getElementById("auMail")?.value.trim() || "";
  msg.className = "auth-msg"; msg.textContent = "";
  go.disabled = true; go.textContent = TRa ? "Bekleyin…" : "Please wait…";

  const kvkk = !!document.getElementById("auKvkk")?.checked;
  const r = AUTH_TAB === "register"
    ? await authFetch("/register", { username, email, password, kvkk })
    : await authFetch("/login", { username, password });

  go.disabled = false;
  go.textContent = AUTH_TAB === "register" ? (TRa?"Hesap Oluştur":"Create account") : (TRa?"Giriş Yap":"Log in");
  if (!r.ok){
    msg.className = "auth-msg bad";
    msg.textContent = r.message || (TRa ? "Bir şeyler ters gitti." : "Something went wrong.");
    return false;
  }
  ME = r.user; paintAuth(); closeModal();
  await favsLoad();       // yereldekiler hesaba taşınsın
  await loadAdmin();      // yönetici satırı hemen görünsün
  if (typeof window.onAuthChange === "function") window.onAuthChange();
  toast(TRa ? `Hoş geldin, ${ME.username}!` : `Welcome, ${ME.username}!`);
  return false;
}

function openAccount(){
  const TRa = LANG === "tr";
  const since = ME?.createdAt ? new Date(ME.createdAt).toLocaleDateString(TRa?"tr-TR":"en-GB") : "";
  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
    <div class="flex center gap-12" style="margin-bottom:14px">
      <span class="auth-av big">${esc(ME.username.slice(0,1).toUpperCase())}</span>
      <div><h3 style="margin:0">${esc(ME.username)}</h3>
        <span class="muted" style="font-size:.82rem">${esc(ME.email)}${since?` · ${TRa?"üyelik":"member since"} ${since}`:""}</span></div>
    </div>
    <label class="auth-l">${TRa?"Clash Royale etiketin (isteğe bağlı)":"Your Clash Royale tag (optional)"}
      <input id="auTag" placeholder="#298Q8YVGG" value="${esc(ME.playerTag||"")}" maxlength="16"></label>
    <div class="auth-msg" id="auMsg"></div>
    <div class="flex gap-8 wrap" style="margin-top:14px">
      <button class="btn btn-primary" onclick="saveTag()">${TRa?"Kaydet":"Save"}</button>
      ${ME.playerTag?`<a class="btn btn-ghost" href="oyuncu.html?tag=${encodeURIComponent(ME.playerTag)}">${TRa?"Profilime git":"Go to my profile"}</a>`:""}
      ${IS_ADMIN ? `<button class="btn btn-ghost" onclick="openInbox('')">📥 ${t("fb.inbox")}${FB_UNREAD?` (${FB_UNREAD})`:""}</button>` : ""}
      <button class="btn btn-ghost" onclick="openMessages()">💌 ${t("msg.title")}${MSG_UNREAD?` (${MSG_UNREAD})`:""}</button>
      ${IS_ADMIN ? `<button class="btn btn-ghost" onclick="openProAdmin('bekliyor')">🏅 ${t("pro.admin")}${PRO_PENDING?` (${PRO_PENDING})`:""}</button>` : ""}
      ${IS_ADMIN ? `<button class="btn btn-ghost" onclick="openUserAdmin('')">🚫 ${t("admin.users")}</button>` : ""}
      ${IS_ADMIN ? `<button class="btn btn-ghost" onclick="openCanli()">📡 ${TRa?"Şu an sitede":"Online now"}</button>` : ""}
      <button class="btn btn-ghost" style="margin-left:auto" onclick="doLogout()">${TRa?"Çıkış Yap":"Log out"}</button>
    </div>
    ${/* KVKK m.11 hakları. Bir e-posta yazıp cevap beklemek yerine kişinin
          kendi eliyle kullanabilmesi doğrusu. */""}
    <div class="kvkk-haklar">
      <span class="kh-baslik">${TRa?"Verileriniz":"Your data"}</span>
      <button class="btn btn-ghost" onclick="verilerimiGoster()">📋 ${TRa?"Verilerim":"My data"}</button>
      <button class="btn btn-ghost kh-sil" onclick="hesabiSilSor()">🗑️ ${TRa?"Hesabımı sil":"Delete account"}</button>
      <a class="btn btn-ghost" href="gizlilik.html">🔒 ${TRa?"Gizlilik":"Privacy"}</a>
    </div>`);
}

/* ---------- ANLIK KULLANICI SAYACI (yönetici) ----------
   Kendi kendine yenileniyor: sayının canlı olmasının bütün anlamı bu.
   Pencere kapanınca zamanlayıcı durduruluyor — açık kalan bir aralık
   arka planda sonsuza kadar istek atardı. */
let CANLI_ZAMANLAYICI = null;
async function openCanli(){
  const TRa = LANG === "tr";
  clearInterval(CANLI_ZAMANLAYICI);
  const ciz = async () => {
    const r = await adminApi("/canli");
    const kutu = document.getElementById("canliGovde");
    if (!kutu) { clearInterval(CANLI_ZAMANLAYICI); return; }   // pencere kapandı
    if (!r || r.toplam == null){
      kutu.innerHTML = notice(`<span>⚠️</span><span>${TRa?"Veri alınamadı.":"Could not load."}</span>`, "warn");
      return;
    }
    const kutucuk = (sayi, etiket, sinif = "") =>
      `<div class="cn-kutu ${sinif}"><span class="cn-sayi">${nfTR(sayi)}</span><span class="cn-et">${etiket}</span></div>`;
    kutu.innerHTML = `
      <div class="cn-izgara">
        ${kutucuk(r.toplam, TRa?"toplam":"total", "buyuk")}
        ${kutucuk(r.uye, TRa?"üye":"members")}
        ${kutucuk(r.misafir, TRa?"misafir":"guests")}
        ${kutucuk(r.aktif, TRa?"şu an ekranda":"active now", "aktif")}
      </div>
      ${r.uyeler.length ? `<div class="cn-liste">
          <span class="cn-baslik">${TRa?"Giriş yapmış olanlar":"Signed in"}</span>
          ${r.uyeler.map((u) => `<span class="cn-uye">${esc(u.ad)}
            <i>${u.saniyeOnce < 60 ? (TRa?"az önce":"just now")
                : `${Math.round(u.saniyeOnce/60)} ${TRa?"dk önce":"min ago"}`}</i></span>`).join("")}
        </div>` : `<p class="muted" style="font-size:.84rem;margin:12px 0 0">${TRa
          ? "Şu an giriş yapmış kimse yok." : "Nobody signed in right now."}</p>`}
      <p class="muted" style="font-size:.78rem;margin:14px 0 0">${TRa
        ? `Son <b>${r.pencereDk} dakikada</b> siteye istek atanlar sayılıyor. Sayaç yalnızca
           bellekte tutulur, IP adresi saklanmaz — ayrıntı <a href="gizlilik.html">gizlilik metninde</a>.`
        : `Counts visitors active in the last ${r.pencereDk} minutes. Kept in memory only; no IP stored.`}</p>`;
  };
  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeCanli()">${ICONS.x}</button>
    <h3 style="margin:0 0 4px">📡 ${TRa?"Şu an sitede":"Online now"}</h3>
    <p class="muted" style="font-size:.82rem;margin:0 0 14px">${TRa
      ? "Her 10 saniyede bir yenilenir." : "Refreshes every 10 seconds."}</p>
    <div id="canliGovde">${spinnerBox(TRa?"Sayılıyor…":"Counting…")}</div>`);
  await ciz();
  CANLI_ZAMANLAYICI = setInterval(ciz, 10000);
}
function closeCanli(){ clearInterval(CANLI_ZAMANLAYICI); CANLI_ZAMANLAYICI = null; closeModal(); }

/* ---------- KVKK m.11: kişinin kendi verisini görmesi ---------- */
async function verilerimiGoster(){
  const TRa = LANG === "tr";
  const r = await fetch(API_BASE + "/auth/data", { credentials: "same-origin" })
    .then((x) => x.json()).catch(() => null);
  if (!r || !r.hesap) return toast(TRa ? "Veriler alınamadı." : "Could not load data.");
  const h = r.hesap;
  const satir = (ad, deger) => `<tr><td>${esc(ad)}</td><td>${deger}</td></tr>`;
  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
    <h3 style="margin:0 0 4px">${TRa?"Hakkınızda tuttuklarımız":"What we store about you"}</h3>
    <p class="muted" style="font-size:.84rem;margin:0 0 14px">${esc(r.not || "")}</p>
    <div class="tabloKap"><table>
      <tbody>
        ${satir(TRa?"Kullanıcı adı":"Username", esc(h.kullaniciAdi))}
        ${satir(TRa?"E-posta":"Email", esc(h.eposta))}
        ${satir(TRa?"Kayıt tarihi":"Registered", new Date(h.kayitTarihi).toLocaleString(TRa?"tr-TR":"en-GB"))}
        ${satir(TRa?"Oyuncu etiketi":"Player tag", h.oyuncuEtiketi ? esc(h.oyuncuEtiketi) : `<span class="muted">—</span>`)}
        ${satir(TRa?"Favori oyuncu":"Favourites", `${h.favoriler.length}`)}
        ${satir(TRa?"Açık oturum":"Active sessions", `${h.acikOturum}`)}
        ${satir(TRa?"Onayladığınız metin":"Consent version", h.kvkkOnayi
          ? `${esc(h.kvkkOnayi.surum)} · ${new Date(h.kvkkOnayi.at).toLocaleDateString(TRa?"tr-TR":"en-GB")}`
          : `<span class="muted">${TRa?"kayıt yok (bu özellikten önce açılmış hesap)":"none"}</span>`)}
        ${(r.digerKayitlar||[]).map((x) => satir(esc(x.alan), esc(x.ozet))).join("")}
      </tbody>
    </table></div>
    <p class="muted" style="font-size:.8rem;margin-top:12px">${TRa
      ? `Bunların dışında hiçbir veriniz tutulmuyor. Ayrıntı için <a href="gizlilik.html">gizlilik metni</a>.`
      : `Nothing else is stored. See the <a href="gizlilik.html">privacy notice</a>.`}</p>`);
}

/* ---------- KVKK m.7: silme hakkı ----------
   Geri alınamaz bir işlem, o yüzden iki kapı var: parola ve kullanıcı
   adının elle yazılması. "Emin misiniz?" tek başına yeterli değil —
   yanlışlıkla tıklanabilir. */
function hesabiSilSor(){
  const TRa = LANG === "tr";
  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
    <h3 style="margin:0 0 8px">${TRa?"Hesabınızı silmek üzeresiniz":"Delete your account"}</h3>
    ${notice(`<span>⚠️</span><span>${TRa
      ? `Bu işlem <b>geri alınamaz</b>. Hesabınız, puanlarınız, favorileriniz ve
         mesajlarınız kalıcı olarak silinir. Kullanıcı adınız yeniden alınabilir hâle gelir.`
      : `This cannot be undone. Your account, points, favourites and messages are permanently deleted.`}</span>`, "warn")}
    <label class="auth-l">${TRa?`Onaylamak için kullanıcı adınızı yazın:`:`Type your username to confirm:`}
      <input id="silAd" placeholder="${esc(ME.username)}" autocomplete="off"></label>
    <label class="auth-l">${TRa?"Parolanız":"Your password"}
      <input id="silSifre" type="password" autocomplete="current-password"></label>
    <div class="auth-msg" id="silMsg"></div>
    <div class="flex gap-8" style="margin-top:12px">
      <button class="btn btn-ghost" onclick="openAccount()">${TRa?"Vazgeç":"Cancel"}</button>
      <button class="btn btn-primary kh-sil-onay" onclick="hesabiSil()">${TRa?"Hesabımı kalıcı olarak sil":"Delete permanently"}</button>
    </div>`);
}

async function hesabiSil(){
  const TRa = LANG === "tr";
  const msg = document.getElementById("silMsg");
  const ad = document.getElementById("silAd").value.trim();
  const sifre = document.getElementById("silSifre").value;
  if (ad.toLowerCase() !== String(ME.username).toLowerCase()){
    msg.className = "auth-msg bad";
    msg.textContent = TRa ? "Kullanıcı adı eşleşmiyor." : "Username does not match.";
    return;
  }
  const r = await authFetch("/delete", { password: sifre });
  if (!r.ok){
    msg.className = "auth-msg bad";
    msg.textContent = r.message || (TRa ? "Silinemedi." : "Could not delete.");
    return;
  }
  ME = null; paintAuth(); closeModal();
  toast(r.message || (TRa ? "Hesabınız silindi." : "Account deleted."));
  setTimeout(() => location.reload(), 1200);
}

async function saveTag(){
  const TRa = LANG === "tr";
  const msg = document.getElementById("auMsg");
  const r = await authFetch("/tag", { playerTag: document.getElementById("auTag").value });
  if (!r.ok){ msg.className = "auth-msg bad"; msg.textContent = r.message || "?"; return; }
  ME = r.user; paintAuth(); closeModal();
  toast(TRa ? "Kaydedildi." : "Saved.");
}

async function doLogout(){
  await authFetch("/logout", {});
  ME = null; IS_ADMIN = false; FB_UNREAD = 0; stopWatch();
  paintAuth(); await favsLoad(); closeModal();
  if (typeof window.onAuthChange === "function") window.onAuthChange();
  toast(LANG === "tr" ? "Çıkış yapıldı." : "Logged out.");
}

/* Küçük bir bildirim; modal kapandıktan sonra ne olduğunu söyler. */
function toast(text){
  let el = document.getElementById("hs-toast");
  if (!el){ el = document.createElement("div"); el.id = "hs-toast"; el.className = "toast"; document.body.appendChild(el); }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2600);
}

/* Tıklanabilir uyarı — normal toast'tan ayrı bir kutu, çünkü daha uzun
   durması ve üstüne basılabilmesi gerekiyor. */
function clickToast(text, onClick){
  let el = document.getElementById("hs-toast-click");
  if (!el){
    el = document.createElement("button");
    el.id = "hs-toast-click"; el.className = "toast toast-click";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.onclick = () => { el.classList.remove("show"); if (onClick) onClick(); };
  el.classList.add("show");
  clearTimeout(clickToast._t);
  clickToast._t = setTimeout(() => el.classList.remove("show"), 12000);
}

/* ============================================================
   Favori oyuncular
   ------------------------------------------------------------
   Giriş yapılmışsa favoriler HESABA yazılır, yani başka bir
   tarayıcıda da durur. Giriş yoksa tarayıcının kendi belleğine
   yazılır — kalp her hâlükârda çalışsın diye. Giriş yapıldığı
   anda yereldeki liste hesaba taşınır, böylece üye olmadan
   eklediklerin kaybolmaz.
   ============================================================ */
const FAV_KEY = "hs-favs";
let FAVS = [];

function favsLocal(){ try { return JSON.parse(store.get(FAV_KEY) || "[]"); } catch { return []; } }
function favsSaveLocal(list){ store.set(FAV_KEY, JSON.stringify(list)); }
const isFav = (tag) => FAVS.some((f) => f.tag === tag);

async function favsLoad(){
  if (ME){
    const r = await authFetch("/favorites").catch(() => null);
    FAVS = (r && r.favorites) || [];
    // Üye olmadan eklenenleri hesaba taşı, sonra yereli temizle.
    const local = favsLocal();
    if (local.length){
      for (const f of local) if (!isFav(f.tag)) await authFetch("/favorites", { action: "add", ...f });
      favsSaveLocal([]);
      const again = await authFetch("/favorites").catch(() => null);
      FAVS = (again && again.favorites) || FAVS;
    }
  } else {
    FAVS = favsLocal();
  }
  paintFavBtn();
}

function paintFavBtn(){
  const b = document.getElementById("favBtn");
  if (b) b.classList.toggle("has", FAVS.length > 0);
  document.querySelectorAll("[data-fav-tag]").forEach((el) =>
    el.classList.toggle("on", isFav(el.getAttribute("data-fav-tag"))));
}

async function toggleFav(tag, name, badge, clan){
  if (!tag) return;
  const adding = !isFav(tag);
  if (ME){
    const r = await authFetch("/favorites", adding
      ? { action: "add", tag, name, badge, clan }
      : { action: "remove", tag });
    FAVS = (r && r.favorites) || FAVS;
  } else {
    FAVS = adding
      ? [...FAVS.filter((f) => f.tag !== tag), { tag, name, badge, clan, at: Date.now() }]
      : FAVS.filter((f) => f.tag !== tag);
    favsSaveLocal(FAVS);
  }
  paintFavBtn();
  toast(LANG === "tr"
    ? (adding ? `${name || tag} favorilere eklendi` : `${name || tag} favorilerden çıkarıldı`)
    : (adding ? `${name || tag} added to favourites` : `${name || tag} removed`));
}

/* The heart shown on a player's profile. */
function favButton(p){
  const tag = p.tag || "";
  // Oyuncu adları tırnak içerebiliyor (O'Brien gibi) — jsArg ile kaçırılıyor.
  const args = [tag, p.name || "", p.clanBadge || "", p.clan || ""].map((x) => jsArg(String(x))).join(",");
  return `<button class="fav-btn ${isFav(tag) ? "on" : ""}" data-fav-tag="${esc(tag)}"
            onclick='toggleFav(${args})'
            title="${LANG==="tr"?"Favorilere ekle / çıkar":"Add to / remove from favourites"}">
            ${ICONS.heart}<span>${LANG==="tr"?"Favori":"Favourite"}</span></button>`;
}

function openFavs(){
  const TRf = LANG === "tr";
  const list = [...FAVS].sort((a, b) => (b.at || 0) - (a.at || 0));
  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
    <div class="flex center gap-8" style="margin-bottom:12px">
      <span class="fav-ic">${ICONS.heart}</span>
      <h3 style="margin:0">${t("fav.title")}</h3>
      <span class="muted" style="margin-left:auto;font-size:.82rem">${list.length}</span>
    </div>
    ${list.length ? `<div class="res-list">${list.map((f) => `
      <div class="res-row fav-row">
        <a class="fav-go" href="oyuncu.html?tag=${encodeURIComponent(f.tag)}">
          <span class="res-ic">👤</span>
          <span class="res-main">
            <span class="n">${esc(f.name || f.tag)}<span class="tag">${esc(f.tag)}</span></span>
            <span class="s">${f.clan ? `${clanCrest(f.badge, 15)} ${esc(f.clan)}` : `<span class="muted">${t("word.none")}</span>`}</span>
          </span>
        </a>
        <button class="fav-x" onclick='favRemove(${jsArg(f.tag)})'
                title="${TRf?"Çıkar":"Remove"}">${ICONS.x}</button>
      </div>`).join("")}</div>`
      : `<p class="muted" style="font-size:.86rem">${TRf
          ? "Henüz favori yok. Bir oyuncunun profiline gir ve <b>kalbe</b> bas — buradan tek tıkla dönersin."
          : "No favourites yet. Open a player's profile and press the <b>heart</b>."}</p>`}
    ${!ME && list.length ? `<p class="muted" style="font-size:.76rem;margin-top:10px">${TRf
      ? "Bu liste yalnızca bu tarayıcıda. <b>Giriş yaparsan</b> hesabına taşınır ve her yerden erişirsin."
      : "This list lives in this browser only. Log in to keep it on your account."}</p>` : ""}`);
}

async function favRemove(tag){
  await toggleFav(tag);
  openFavs();
}

/* ============================================================
   Şikayet & Öneri
   ------------------------------------------------------------
   Giriş şartı var: mesajın kimden geldiği belli olsun ve anonim
   spam gelmesin. Sunucu ayrıca saatte 5 mesajla sınırlıyor.
   ============================================================ */
function openFeedback(){
  const TRf = LANG === "tr";
  if (!ME){
    openModal(`
      <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
      <div class="fb-head"><span class="fb-ic">💬</span><h3>${t("fb.title")}</h3></div>
      <p class="muted" style="font-size:.88rem">${TRf
        ? "Bize yazabilmen için <b>giriş yapman</b> gerekiyor — böylece mesajına dönebiliriz ve form kötüye kullanılmaz."
        : "You need to <b>log in</b> to write to us, so we can reply and the form is not abused."}</p>
      <div class="flex gap-8" style="margin-top:14px">
        <button class="btn btn-primary" onclick="openAuth('login')">${TRf?"Giriş Yap":"Log in"}</button>
        <button class="btn btn-ghost" onclick="openAuth('register')">${TRf?"Kayıt Ol":"Sign up"}</button>
      </div>`);
    return;
  }
  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
    <div class="fb-head"><span class="fb-ic">💬</span><h3>${t("fb.title")}</h3></div>
    <p class="muted" style="font-size:.82rem;margin:0 0 14px">${TRf
      ? `<b>${esc(ME.username)}</b> olarak yazıyorsun.`
      : `Writing as <b>${esc(ME.username)}</b>.`}</p>
    <div class="fb-kinds">
      <button class="fb-kind on" data-k="oneri"   onclick="fbKind(this)">💡 ${TRf?"Öneri":"Idea"}</button>
      <button class="fb-kind"    data-k="sikayet" onclick="fbKind(this)">😕 ${TRf?"Şikayet":"Complaint"}</button>
      <button class="fb-kind"    data-k="hata"    onclick="fbKind(this)">🐞 ${TRf?"Hata":"Bug"}</button>
    </div>
    <textarea id="fbText" class="fb-text" maxlength="2000" rows="6"
      placeholder="${TRf?"Ne düşünüyorsun? Olabildiğince ayrıntılı yaz…":"Tell us what you think…"}"></textarea>
    <div class="fb-row"><span class="muted" id="fbCount">0 / 2000</span>
      <button class="btn btn-primary" id="fbGo" onclick="fbSend()">${TRf?"Gönder":"Send"}</button></div>
    <div class="auth-msg" id="fbMsg"></div>`);
  const ta = document.getElementById("fbText");
  ta.addEventListener("input", () => {
    document.getElementById("fbCount").textContent = `${ta.value.length} / 2000`;
  });
  setTimeout(() => ta.focus(), 50);
}
let FB_KIND = "oneri";
function fbKind(btn){
  FB_KIND = btn.getAttribute("data-k");
  document.querySelectorAll(".fb-kind").forEach((b) => b.classList.toggle("on", b === btn));
}
async function fbSend(){
  const TRf = LANG === "tr";
  const text = document.getElementById("fbText").value.trim();
  const msg = document.getElementById("fbMsg");
  const go = document.getElementById("fbGo");
  msg.className = "auth-msg";
  if (text.length < 10){
    msg.className = "auth-msg bad";
    msg.textContent = TRf ? "Biraz daha ayrıntı yazar mısın?" : "A little more detail, please.";
    return;
  }
  go.disabled = true; go.textContent = TRf ? "Gönderiliyor…" : "Sending…";
  const r = await fetch(API_BASE + "/feedback", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: FB_KIND, text, page: location.pathname + location.hash }),
  }).then((x) => x.json()).catch(() => null);
  go.disabled = false; go.textContent = TRf ? "Gönder" : "Send";
  if (!r || r.error){
    msg.className = "auth-msg bad";
    msg.textContent = (r && r.message) || (TRf ? "Gönderilemedi." : "Could not send.");
    return;
  }
  closeModal();
  toast(r.message || (TRf ? "Teşekkürler!" : "Thanks!"));
}

/* ============================================================
   Gelen Mesajlar (yönetim)
   ------------------------------------------------------------
   Yalnızca yöneticiye görünür. "Yönetici miyim?" sorusunu her
   zaman sunucuya soruyoruz — buradaki bir değişkeni değiştirerek
   kimse kutuyu açamaz, uçların hepsi ayrıca sunucuda kontrol
   ediliyor.
   ============================================================ */
let IS_ADMIN = false, FB_UNREAD = 0;

async function loadAdmin(){
  const r = await fetch(API_BASE + "/feedback/admin", { credentials: "same-origin" })
    .then((x) => x.json()).catch(() => null);
  IS_ADMIN = !!(r && r.admin);
  FB_UNREAD = (r && r.unread) || 0;
  FB_SEEN = FB_UNREAD;                 // ilk okuma "yeni mesaj" sayılmaz
  await loadMsgState();
  if (IS_ADMIN) await loadProState(); else PRO_PENDING = 0;
  paintAuth();
  if (IS_ADMIN) watchInbox(); else stopWatch();
}

/* ================= PRO BAŞVURULARI (yönetici) =================
   Oyuncu sıralamalar sayfasından etiketini bırakıyor; burada kabul ya
   da red veriliyor. Kabul doğrudan rozete dönüşüyor — ayrıca bir yere
   etiket yazmak gerekmiyor. Yönetici elle de rozet verip alabiliyor. */
let PRO_PENDING = 0;

async function loadProState(){
  const r = await fetch(API_BASE + "/pro/count", { credentials: "same-origin" })
    .then((x) => x.json()).catch(() => null);
  PRO_PENDING = (r && r.pending) || 0;
}

const proAdminApi = async (path, body) =>
  fetch(API_BASE + "/pro" + path, {
    method: body ? "POST" : "GET", credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ ok: r.ok, status: r.status, ...(await r.json().catch(() => ({}))) }));

async function openProAdmin(durum){
  const TRp = LANG === "tr";
  openModal(spinnerBox(TRp ? "Başvurular yükleniyor…" : "Loading…"));
  const r = await proAdminApi("/applications" + (durum ? "?status=" + durum : ""));
  if (!r.ok) return openModal(notice(`<span>⚠️</span><span>${TRp?"Yetkin yok.":"Not allowed."}</span>`, "warn"));
  PRO_PENDING = r.pending || 0; paintAuth();

  const DURUM = { bekliyor:["⏳","Bekliyor"], kabul:["✅","Kabul"], red:["❌","Red"] };
  const satir = (a) => {
    const o = a.oyuncu;
    /* Karar verirken oyuncunun gerçekten iyi olup olmadığı görünsün. */
    const kunye = o
      ? `<span class="pa-stat"><b>${nfTR(o.elo ?? 0)}</b> madalyon${o.rank?` · dünya #${o.rank}`:""}</span>
         <span class="pa-stat">${nfTR(o.trophies)} 🏆 · en iyi ${nfTR(o.best)}</span>
         <span class="pa-stat">Sv. ${o.level}${o.clan?` · ${esc(o.clan)}`:""}</span>`
      : `<span class="pa-stat muted">Oyuncu bilgisi alınamadı</span>`;
    const esikte = o && o.elo != null && o.elo >= (r.esik || 3000);
    return `<div class="pa-row">
      <div class="pa-head">
        <b>${esc(o ? o.name : a.tag)}</b>
        <span class="tag">${esc(a.tag)}</span>
        <span class="pts-badge">${a.kind === "pro" ? "PRO" : "Yayıncı"}</span>
        ${esikte ? `<span class="pts-badge" style="background:rgba(18,136,90,.16);color:#12885a">eşiği geçiyor</span>` : ""}
        <span style="margin-left:auto">${DURUM[a.status]?.[0]||""} ${DURUM[a.status]?.[1]||a.status}</span>
      </div>
      <div class="pa-stats">${kunye}</div>
      ${a.note ? `<div class="pa-note">${esc(a.note)}</div>` : ""}
      <div class="pa-foot">
        <span class="muted">${esc(a.username)} · ${relativeTime(new Date(a.at).toISOString())}</span>
        ${a.status === "bekliyor" ? `
          <button class="btn btn-primary" onclick="proDecide(${jsArg(a.id)},'kabul')">Kabul et</button>
          <button class="btn btn-ghost" onclick="proDecide(${jsArg(a.id)},'red')">Reddet</button>` : ""}
      </div>
    </div>`;
  };
  const sekme = (k, label) =>
    `<button class="fb-kind ${durum===k?"on":""}" onclick='openProAdmin(${k?JSON.stringify(k):"''"})'>${label}</button>`;

  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
    <div class="fb-head"><span class="fb-ic">🏅</span><h3>${TRp?"PRO Başvuruları":"Pro applications"}</h3>
      ${r.pending ? `<span class="pts-badge" style="background:rgba(224,67,95,.16);color:#e0435f">${r.pending} ${TRp?"bekliyor":"pending"}</span>` : ""}
    </div>
    <div class="fb-kinds">
      ${sekme("bekliyor", "⏳ Bekleyen")}${sekme("kabul", "✅ Kabul")}${sekme("red", "❌ Red")}${sekme("", "Tümü")}
    </div>
    <div class="pa-manual">
      <input id="pgTag" placeholder="#ETİKET" maxlength="16">
      <select id="pgKind"><option value="pro">PRO</option><option value="yayinci">Yayıncı</option></select>
      <button class="btn btn-primary" onclick="proGrant(1)">Ver</button>
      <button class="btn btn-ghost" onclick="proGrant(0)">Kaldır</button>
      <button class="btn btn-ghost" onclick="proGrant(2)"
        title="Yerleşik listedeki bir rozeti yanlışlıkla kaldırdıysanız geri getirir">Geri getir</button>
    </div>
    <div id="pgMsg"></div>
    <div class="pa-list">${r.items.length ? r.items.map(satir).join("")
      : `<p class="muted text-center" style="padding:16px 0">${TRp?"Başvuru yok.":"No applications."}</p>`}</div>`);
}

async function proDecide(id, karar){
  const r = await proAdminApi("/decide", { id, karar });
  if (!r.ok) return toast(r.message || "?");
  toast(r.message);
  openProAdmin("bekliyor");
}

/* 1 = ver, 0 = kaldır, 2 = geri getir (yanlışlıkla gizlenmiş yerleşik rozet).

   Mesaj artık her durumda sunucudan geliyor. Eskiden sunucu bazı hatalarda
   yalnızca `{error:"notfound"}` dönüyordu ve buradaki `r.message || "?"`
   ekrana düpedüz "?" basıyordu — kullanıcı ne olduğunu anlayamıyordu. */
async function proGrant(ver){
  const msg = document.getElementById("pgMsg");
  const tag = document.getElementById("pgTag").value;
  const kind = document.getElementById("pgKind").value;
  const yol = ver === 1 ? "/grant" : ver === 2 ? "/unhide" : "/revoke";
  const r = await proAdminApi(yol, { tag, kind });
  const metin = r.message
    || (r.error ? `İşlem tamamlanamadı (${r.error}).` : "Sunucudan yanıt alınamadı.");
  msg.innerHTML = notice(`<span>${r.ok?"✅":"⚠️"}</span><span>${esc(metin)}</span>`, r.ok ? "" : "warn");
}

/* ============================================================
   YÖNETİCİ — KULLANICI ADINDAN YASAKLAMA
   ------------------------------------------------------------
   Tokmakçılar tablosundaki 🚫 düğmesi yalnızca TABLODAKİLERE ulaşıyordu:
   hiç oyun oynamamış ya da yasaklanıp listeden düşmüş biri oradan
   bulunamıyordu. Burası adıyla arayıp yasaklıyor ve yasağı kaldırıyor.

   Yetki her istekte sunucuda kontrol ediliyor; buradaki IS_ADMIN yalnızca
   düğmenin görünüp görünmeyeceğini belirler.
   ============================================================ */
const adminApi = async (path, body) =>
  fetch(API_BASE + "/admin" + path, {
    method: body ? "POST" : "GET", credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ ok: r.ok, status: r.status, ...(await r.json().catch(() => ({}))) }));

async function openUserAdmin(q){
  const TRu = LANG === "tr";
  const arama = q === undefined ? (document.getElementById("uaQ")?.value || "") : q;
  const ilk = q === undefined;
  if (!ilk) openModal(spinnerBox(TRu ? "Kullanıcılar yükleniyor…" : "Loading…"));
  const r = await adminApi("/users?q=" + encodeURIComponent(arama));
  if (!r.ok) return openModal(notice(`<span>⚠️</span><span>${TRu?"Yetkin yok.":"Not allowed."}</span>`, "warn"));

  const satir = (u) => {
    const yasakli = !!u.ban;
    const sure = !yasakli ? "" : (u.ban.until
      ? `${TRu?"bitiş":"until"} ${new Date(u.ban.until).toLocaleString(TRu?"tr-TR":"en-GB")}`
      : (TRu ? "kalıcı" : "permanent"));
    return `<div class="ua-row ${yasakli?"banned":""}">
      <span class="ua-av">${esc(u.username.slice(0,1).toUpperCase())}</span>
      <div class="ua-tx">
        <b>${esc(u.username)}</b>
        ${u.admin ? `<span class="pts-badge">${TRu?"YÖNETİCİ":"ADMIN"}</span>` : ""}
        ${yasakli ? `<span class="pts-badge" style="background:rgba(224,67,95,.16);color:#e0435f">${TRu?"YASAKLI":"BANNED"} · ${esc(u.ban.label)}</span>` : ""}
        <span class="ua-sub">${u.banCount ? `${u.banCount} ${TRu?"kez yasaklandı · sıradaki":"bans · next"}: ${esc(u.next)}` : (TRu?"temiz sicil":"clean record")}${sure?` · ${sure}`:""}</span>
      </div>
      ${u.admin ? "" : yasakli
        ? `<button class="btn btn-ghost" onclick="userBan(${jsArg(u.username)},0)">${TRu?"Yasağı kaldır":"Unban"}</button>`
        : `<button class="btn btn-ghost ua-ban" onclick="userBan(${jsArg(u.username)},1)">🚫 ${TRu?"Yasakla":"Ban"}</button>`}
    </div>`;
  };

  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
    <div class="fb-head"><span class="fb-ic">🚫</span><h3>${TRu?"Kullanıcı Yönetimi":"User management"}</h3>
      ${r.yasakli ? `<span class="pts-badge" style="background:rgba(224,67,95,.16);color:#e0435f">${r.yasakli} ${TRu?"yasaklı":"banned"}</span>` : ""}
    </div>
    <div class="pa-manual">
      <input id="uaQ" placeholder="${TRu?"Kullanıcı adı ara…":"Search username…"}" maxlength="40"
             value="${esc(arama)}" onkeydown="if(event.key==='Enter')openUserAdmin()">
      <button class="btn btn-primary" onclick="openUserAdmin()">${TRu?"Ara":"Search"}</button>
    </div>
    <p class="muted" style="font-size:.78rem;margin:0 0 10px">${TRu
      ? `Ceza süresini sunucu belirler: 5 dakika → 30 dakika → 1 gün → 1 hafta → 6 ay → kalıcı. Yasaklanan hesabın oturumu anında kapanır ve Tokmakçılar tablosundan düşer.`
      : `The server picks the length: 5 min → 30 min → 1 day → 1 week → 6 months → permanent.`}</p>
    <div id="uaMsg"></div>
    <div class="pa-list">${r.items.length ? r.items.map(satir).join("")
      : `<p class="muted text-center" style="padding:16px 0">${TRu?"Eşleşen kullanıcı yok.":"No matching user."}</p>`}</div>
    <p class="muted" style="font-size:.76rem;text-align:center;margin:10px 0 0">${
      r.query ? `${nfTR(r.total)} ${TRu?"eşleşme":"matches"}` : `${TRu?"Son kayıt olanlar gösteriliyor":"Showing newest accounts"}`}</p>`);
  document.getElementById("uaQ")?.focus();
}

async function userBan(username, yasakla){
  const TRu = LANG === "tr";
  if (yasakla && !confirm(TRu
    ? `"${username}" yasaklansın mı? Ceza süresini sunucu belirler ve oturumu anında kapanır.`
    : `Ban "${username}"?`)) return;
  const r = await adminApi(yasakla ? "/ban" : "/unban", { username });
  const msg = document.getElementById("uaMsg");
  if (msg) msg.innerHTML = notice(`<span>${r.ok?"✅":"⚠️"}</span><span>${esc(r.message || "?")}</span>`, r.ok ? "" : "warn");
  if (r.ok) { toast(r.message); openUserAdmin(); }
}

/* ================= ÖZEL MESAJLAR =================
   Kural sunucuda: yazışma her zaman yönetici ile bir kullanıcı arasında.
   Kullanıcı alıcı seçemiyor (seçse bile sunucu yok sayıyor), bu yüzden
   buradaki arayüzde de kullanıcıya "kime" diye sorulmuyor. */
let MSG_UNREAD = 0;

async function loadMsgState(){
  const r = await fetch(API_BASE + "/messages/status", { credentials: "same-origin" })
    .then((x) => x.json()).catch(() => null);
  MSG_UNREAD = (r && r.unread) || 0;
}

const msgApi = async (path, body, method) =>
  fetch(API_BASE + "/messages" + path, {
    method: method || (body ? "POST" : "GET"), credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ ok: r.ok, status: r.status, ...(await r.json().catch(() => ({}))) }));

const msgSaat = (ms) => new Date(ms).toLocaleString(LANG === "tr" ? "tr-TR" : "en-GB",
  { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function msgBubbles(items, benKim){
  if (!items.length)
    return `<p class="muted" style="font-size:.86rem;text-align:center;padding:18px 0">${
      LANG==="tr" ? "Henüz mesaj yok." : "No messages yet."}</p>`;
  return `<div class="msg-list">${items.map((m) => `
    <div class="msg-b ${m.from === benKim ? "me" : "them"}">
      <span class="msg-t">${esc(m.text)}</span>
      <span class="msg-at">${msgSaat(m.at)}</span>
    </div>`).join("")}</div>`;
}

/* --- kullanıcı: yöneticiyle sohbet --- */
async function openMessages(){
  const TRm = LANG === "tr";
  if (!ME) return openAuth("login");
  if (IS_ADMIN) return openMsgAdmin();
  openModal(spinnerBox(TRm ? "Mesajlar yükleniyor…" : "Loading…"));
  const r = await msgApi("/thread");
  if (!r.ok) return openModal(notice(`<span>⚠️</span><span>${r.message || "?"}</span>`, "warn"));
  MSG_UNREAD = 0; paintAuth();
  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
    <div class="fb-head"><span class="fb-ic">💌</span><h3>${TRm?"Mesajlarım":"My messages"}</h3></div>
    <p class="muted" style="font-size:.8rem;margin:0 0 10px">${TRm
      ? "Burada yalnızca <b>site yönetimiyle</b> yazışırsın."
      : "This is a private thread with <b>site staff</b> only."}</p>
    <div id="msgBox">${msgBubbles(r.items, "user")}</div>
    <div class="msg-send">
      <textarea id="msgIn" rows="2" maxlength="1000"
        placeholder="${TRm?"Mesajını yaz…":"Write a message…"}"></textarea>
      <button class="btn btn-primary" onclick="msgSend()">${TRm?"Gönder":"Send"}</button>
    </div>`);
  const box = document.getElementById("msgBox");
  if (box) box.scrollTop = box.scrollHeight;
}

async function msgSend(){
  const el = document.getElementById("msgIn");
  const text = (el.value || "").trim();
  if (!text) return;
  el.disabled = true;
  const r = await msgApi("/send", { text });
  el.disabled = false;
  if (!r.ok) return toast(r.message || "?");
  el.value = "";
  const box = document.getElementById("msgBox");
  const list = box.querySelector(".msg-list");
  const html = `<div class="msg-b me"><span class="msg-t">${esc(r.item.text)}</span><span class="msg-at">${msgSaat(r.item.at)}</span></div>`;
  if (list) list.insertAdjacentHTML("beforeend", html);
  else box.innerHTML = `<div class="msg-list">${html}</div>`;
  box.scrollTop = box.scrollHeight;
}

/* --- yönetici: sohbet listesi --- */
async function openMsgAdmin(){
  const TRm = LANG === "tr";
  openModal(spinnerBox(TRm ? "Sohbetler yükleniyor…" : "Loading…"));
  const r = await msgApi("/threads");
  if (!r.ok) return openModal(notice(`<span>⚠️</span><span>${TRm?"Yetkin yok.":"Not allowed."}</span>`, "warn"));
  MSG_UNREAD = r.unread || 0; paintAuth();
  const satir = (t) => `
    <button class="msg-row" onclick="openMsgWith(${jsArg(t.peerId)})">
      <span class="msg-av">${esc(t.username.slice(0,1).toUpperCase())}</span>
      <span class="msg-main">
        <span class="msg-u">${esc(t.username)}${t.banned?` <span class="pts-badge" style="background:rgba(224,67,95,.16);color:#e0435f">${TRm?"yasaklı":"banned"}</span>`:""}</span>
        <span class="msg-last">${esc(t.sonMetin.slice(0,60))}</span>
      </span>
      ${t.unread ? `<span class="msg-badge">${t.unread}</span>` : ""}
    </button>`;
  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
    <div class="fb-head"><span class="fb-ic">💌</span><h3>${TRm?"Mesajlar":"Messages"}</h3>
      ${r.unread ? `<span class="pts-badge" style="background:rgba(224,67,95,.16);color:#e0435f">${r.unread} ${TRm?"yeni":"new"}</span>` : ""}
    </div>
    <div class="search-box" style="border-radius:12px;margin-bottom:10px">
      <input id="msgFind" placeholder="${TRm?"Kullanıcı ara — yeni sohbet başlat":"Find a user — start a thread"}"
             oninput="msgFindUsers(this.value)">
    </div>
    <div id="msgFound"></div>
    <div class="msg-threads">${r.items.length ? r.items.map(satir).join("")
      : `<p class="muted" style="font-size:.86rem;text-align:center;padding:16px 0">${TRm?"Henüz sohbet yok.":"No threads yet."}</p>`}</div>`);
}

async function msgFindUsers(q){
  const box = document.getElementById("msgFound");
  if (!box) return;
  if (!q || q.trim().length < 2) { box.innerHTML = ""; return; }
  const r = await msgApi("/users?q=" + encodeURIComponent(q.trim()));
  if (!r.ok) return;
  box.innerHTML = r.items.length ? `<div class="msg-threads" style="margin-bottom:10px">${r.items.map((u) => `
    <button class="msg-row" onclick="openMsgWith(${jsArg(u.id)})">
      <span class="msg-av">${esc(u.username.slice(0,1).toUpperCase())}</span>
      <span class="msg-main"><span class="msg-u">${esc(u.username)}</span></span>
    </button>`).join("")}</div>` : "";
}

/* --- yönetici: bir kişiyle sohbet --- */
async function openMsgWith(userId){
  const TRm = LANG === "tr";
  openModal(spinnerBox(TRm ? "Sohbet açılıyor…" : "Loading…"));
  const r = await msgApi("/with/" + encodeURIComponent(userId));
  if (!r.ok) return openModal(notice(`<span>⚠️</span><span>${TRm?"Açılamadı.":"Failed."}</span>`, "warn"));
  await loadMsgState(); paintAuth();
  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
    <div class="fb-head">
      <button class="btn btn-ghost" style="padding:5px 10px;font-size:.8rem" onclick="openMsgAdmin()">←</button>
      <span class="fb-ic">💌</span><h3>${esc(r.username)}</h3>
    </div>
    <div id="msgBox">${msgBubbles(r.items, "admin")}</div>
    <div class="msg-send">
      <textarea id="msgIn" rows="2" maxlength="1000" placeholder="${TRm?"Cevap yaz…":"Reply…"}"></textarea>
      <button class="btn btn-primary" onclick="msgReply(${jsArg(userId)})">${TRm?"Gönder":"Send"}</button>
    </div>`);
  const box = document.getElementById("msgBox");
  if (box) box.scrollTop = box.scrollHeight;
}

async function msgReply(userId){
  const el = document.getElementById("msgIn");
  const text = (el.value || "").trim();
  if (!text) return;
  el.disabled = true;
  const r = await msgApi("/reply", { userId, text });
  el.disabled = false;
  if (!r.ok) return toast(r.message || "?");
  el.value = "";
  const box = document.getElementById("msgBox");
  const list = box.querySelector(".msg-list");
  const html = `<div class="msg-b me"><span class="msg-t">${esc(r.item.text)}</span><span class="msg-at">${msgSaat(r.item.at)}</span></div>`;
  if (list) list.insertAdjacentHTML("beforeend", html);
  else box.innerHTML = `<div class="msg-list">${html}</div>`;
  box.scrollTop = box.scrollHeight;
}

/* ---------- yeni mesaj uyarısı ----------
   Yönetici sitede gezerken kutuyu arada bir yoklarız; sayı artmışsa
   köşede tıklanabilir bir uyarı çıkar. Sekme arkadayken ve izin
   verilmişse masaüstü bildirimi de gönderilir. */
let FB_SEEN = 0, FB_TIMER = null;
const FB_POLL_MS = 45000;

function stopWatch(){ clearInterval(FB_TIMER); FB_TIMER = null; }

function watchInbox(){
  if (FB_TIMER) return;
  FB_TIMER = setInterval(async () => {
    if (!IS_ADMIN) return stopWatch();
    const r = await fetch(API_BASE + "/feedback/admin", { credentials: "same-origin" })
      .then((x) => x.json()).catch(() => null);
    if (!r || !r.admin) return;
    const n = r.unread || 0;
    if (n > FB_SEEN) notifyInbox(n - FB_SEEN, n);
    FB_UNREAD = n; FB_SEEN = n;
    paintAuth();
  }, FB_POLL_MS);
}

function notifyInbox(fresh, total){
  const tr = LANG === "tr";
  const title = tr ? "HYPNOSHUB — yeni mesaj" : "HYPNOSHUB — new message";
  const body  = tr
    ? `${fresh} yeni mesaj var (okunmamış: ${total}).`
    : `${fresh} new message(s), ${total} unread.`;

  clickToast(`📥 ${body} ${tr ? "Aç" : "Open"} →`, () => openInbox(""));

  try {
    if (window.Notification && Notification.permission === "granted" && document.hidden){
      const nt = new Notification(title, { body, icon: "assets/img/logo.png", tag: "hypnos-inbox" });
      nt.onclick = () => { window.focus(); openInbox(""); nt.close(); };
    }
  } catch {}
}

/* Masaüstü bildirimi izni — tarayıcı bunu ancak kullanıcı bir düğmeye
   basınca sorar, o yüzden kutunun başlığında duruyor. */
function askNotify(){
  const tr = LANG === "tr";
  if (!window.Notification) return toast(tr ? "Tarayıcın bildirimi desteklemiyor." : "Not supported.");
  Notification.requestPermission().then((p) => {
    toast(p === "granted"
      ? (tr ? "Bildirimler açıldı." : "Notifications on.")
      : (tr ? "İzin verilmedi." : "Permission denied."));
    const m = document.getElementById("hs-modal");
    if (m && m.classList.contains("open")) openInbox(INBOX_KIND);
  });
}

async function openInbox(kind){
  const TRi = LANG === "tr";
  openModal(spinnerBox(TRi ? "Mesajlar yükleniyor…" : "Loading…"));
  const r = await fetch(API_BASE + "/feedback/all" + (kind ? "?kind=" + kind : ""), { credentials: "same-origin" })
    .then((x) => x.json()).catch(() => null);
  if (!r || r.error){
    openModal(notice(`<span>⚠️</span><span>${TRi ? "Bu kutuyu görme yetkin yok." : "Not allowed."}</span>`));
    return;
  }
  FB_UNREAD = r.unread; paintAuth();
  const KIND = { oneri: ["💡", TRi?"Öneri":"Idea"], sikayet: ["😕", TRi?"Şikayet":"Complaint"], hata: ["🐞", TRi?"Hata":"Bug"] };
  const tab = (k, label, n) =>
    `<button class="fb-kind ${kind===k?"on":""}" onclick='openInbox(${k?JSON.stringify(k):"''"})'>${label} ${n}</button>`;

  openModal(`
    <button class="btn btn-ghost icon-btn modal-close" onclick="closeModal()">${ICONS.x}</button>
    <div class="fb-head"><span class="fb-ic">📥</span>
      <h3>${TRi?"Gelen Mesajlar":"Inbox"}</h3>
      ${r.unread ? `<span class="pts-badge" style="background:rgba(224,67,95,.16);color:#e0435f">${r.unread} ${TRi?"yeni":"new"}</span>` : ""}
      <span style="margin-left:auto;display:flex;gap:6px">
        ${(window.Notification && Notification.permission !== "granted")
          ? `<button class="btn btn-ghost" style="padding:6px 10px;font-size:.78rem" onclick="askNotify()"
               title="${TRi?"Yeni mesaj gelince masaüstü bildirimi gönder":"Desktop notification on new message"}">🔔 ${TRi?"Bildirim aç":"Notify me"}</button>`
          : `<span class="pts-badge" title="${TRi?"Masaüstü bildirimleri açık":"Desktop notifications on"}">🔔 ${TRi?"açık":"on"}</span>`}
        ${r.total ? `<button class="btn btn-ghost" style="padding:6px 10px;font-size:.78rem"
          onclick="fbMarkAll()">${TRi?"Tümünü okundu yap":"Mark all read"}</button>` : ""}
      </span>
    </div>
    <div class="fb-kinds">
      ${tab("", TRi?"Tümü":"All", r.total)}
      ${tab("oneri", "💡", r.counts.oneri)}
      ${tab("sikayet", "😕", r.counts.sikayet)}
      ${tab("hata", "🐞", r.counts.hata)}
    </div>
    ${r.items.length ? `<div class="inbox">${r.items.map((m) => {
      const [ic, name] = KIND[m.kind] || ["💬", m.kind];
      return `<div class="inbox-row ${m.read ? "" : "new"}">
        <div class="inbox-top">
          <span class="inbox-kind">${ic} ${name}</span>
          <b>${esc(m.username)}</b>
          <span class="muted">${relativeTime(m.at)}</span>
          ${m.sender && m.sender.banned ? `<span class="inbox-ban">${TRi ? "YASAKLI" : "BANNED"}</span>` : ""}
          <span class="inbox-acts">
            <button title="${TRi?"Okundu / okunmadı":"Toggle read"}" onclick='fbRead(${jsArg(m.id)})'>${m.read ? "☑" : "☐"}</button>
            ${banButton(m)}
            <button title="${TRi?"Sil":"Delete"}" onclick='fbDel(${jsArg(m.id)})'>🗑</button>
          </span>
        </div>
        <p class="inbox-text">${esc(m.text)}</p>
        ${m.page ? `<span class="inbox-page">${esc(m.page)}</span>` : ""}
      </div>`;
    }).join("")}</div>`
    : `<p class="muted" style="font-size:.88rem">${TRi?"Henüz mesaj yok.":"No messages yet."}</p>`}`);
  INBOX_KIND = kind || "";
}
let INBOX_KIND = "";

const fbPost = (path, body) => fetch(API_BASE + "/feedback" + path, {
  method: "POST", credentials: "same-origin",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}).then((x) => x.json()).catch(() => null);

async function fbRead(id){ await fbPost("/read", { id }); openInbox(INBOX_KIND); }
async function fbMarkAll(){ await fbPost("/read", { id: "*" }); openInbox(INBOX_KIND); }
async function fbDel(id){
  if (!confirm(LANG === "tr" ? "Bu mesaj silinsin mi?" : "Delete this message?")) return;
  await fbPost("/delete", { id });
  openInbox(INBOX_KIND);
}

/* ---------- yasaklama ----------
   Süreyi sunucu belirler; buradaki düğme sadece "sıradaki cezayı uygula"
   der. Site sahibinin kendi hesabında düğme hiç çıkmaz. */
function banButton(m){
  const s = m.sender;
  if (!s || s.owner) return "";
  const tr = LANG === "tr";
  if (s.banned)
    return `<button class="ok" title="${tr ? "Yasağı kaldır" : "Remove ban"}" `
         + `onclick='fbUnban(${jsArg(m.userId)}, ${jsArg(m.username)})'>♻</button>`;
  const t = tr ? `Yasakla — sıradaki ceza: ${s.next}` : `Ban — next step: ${s.next}`;
  return `<button class="danger" title="${esc(t)}" `
       + `onclick='fbBan(${jsArg(m.userId)}, ${jsArg(m.username)}, ${jsArg(s.next)})'>🚫</button>`;
}

async function fbBan(userId, username, next){
  const tr = LANG === "tr";
  const reason = prompt(tr
    ? `${username} yasaklanacak.\nSıradaki ceza: ${next}\n\nSebep (isteğe bağlı):`
    : `Ban ${username}?\nNext step: ${next}\n\nReason (optional):`, "");
  if (reason === null) return;                       // vazgeçildi
  const r = await fbPost("/ban", { userId, reason });
  toast((r && r.message) || (tr ? "Yasaklanamadı." : "Failed."));
  openInbox(INBOX_KIND);
}

async function fbUnban(userId, username){
  const tr = LANG === "tr";
  if (!confirm(tr ? `${username} için yasak kaldırılsın mı?` : `Unban ${username}?`)) return;
  const r = await fbPost("/unban", { userId });
  toast((r && r.message) || (tr ? "Kaldırılamadı." : "Failed."));
  openInbox(INBOX_KIND);
}

/* ---------- Boot ---------- */
function mountChrome(active){
  // Every page was requesting /favicon.ico and getting a 404; point it at the
  // logo once here rather than adding a <link> to ten files.
  if (!document.querySelector("link[rel='icon']")){
    const ic = document.createElement("link");
    ic.rel = "icon"; ic.href = "assets/img/hammer-logo.jpg";
    document.head.appendChild(ic);
  }
  const h = document.getElementById("app-header");
  const f = document.getElementById("app-footer");
  if (h) h.innerHTML = buildHeader(active);
  if (f) f.innerHTML = buildFooter();
  mountBottomNav(active);   // gövdenin son çocuğu — bkz. fonksiyondaki not
  applyTheme(store.get("hs-theme") || "light");
  applyLang(LANG);
  attachSuggest(document.getElementById("searchInput"), () => document.getElementById("searchType")?.value || "player");
  loadCardNames();
  /* Lig rozetleri klasörü. Yerel disk okuması olduğu için oyuncu verisinden
     (~260 ms) çok önce döner; yine de profil ekranı LIG_HAZIR'ı bekliyor ki
     rozet önce varsayılanla çizilip sonra zıplamasın. */
  window.LIG_HAZIR = ligleriYukle().catch(() => 0);
  filigranYerlestir().catch(() => {});   // arka plan süsü: hata verse de sayfa akmalı
  paintAuth();      // önce boş çiz, sonra sunucudan gerçek durumu al
  loadMe().then(favsLoad);
}

/* Every page shows card names somewhere, but only a few call /api/cards, so
   the Turkish names are fetched once here for all of them. Cheap (one cached
   request) and it repaints afterwards so names that were already drawn in
   English switch over. */
let cardNamesLoaded = false;
async function loadCardNames(){
  if (cardNamesLoaded) return;
  cardNamesLoaded = true;
  const data = await HypnoAPI._get("/cards", 12000);
  if (!data || !data.items) return;
  let n = 0;
  for (const c of data.items){
    if (c.nameTR){ CARD_NAME_TR.set(c.name, c.nameTR); n++; }
    if (c.heroImg) HERO_IMG.set(c.name, c.heroImg);
    if (c.iconUrls && c.iconUrls.evolutionMedium) EVO_ART.add(c.name);
    if (c.heroOnly) HERO_ONLY.add(c.name);      // kahraman listesi sunucudan
    if (c.heroNoFlag) HERO_NOFLAG.add(c.name);  // API'de işaret taşımayanlar
  }
  /* Yeniden çizim SADECE ekranda İngilizce adla çizilmiş kart varsa gerekli.
     Koşulsuz çağırınca `window.repaint` sayfanın tüm verisini baştan
     çekiyordu: ölçtük, /api/player ve /battlelog dahil her istek iki kez
     gidiyordu (oyuncu profilinde 1,25 sn + 1,39 sn). /api/cards yerel ve
     ~2 ms, yani adlar zaten ilk çizimden önce yerine oturuyor. */
  if (!n || LANG !== "tr") return;
  if (typeof window.repaint !== "function") return;
  if (!document.querySelector(".cr-card, .di")) return;   // henüz kart çizilmedi
  window.repaint();
}
