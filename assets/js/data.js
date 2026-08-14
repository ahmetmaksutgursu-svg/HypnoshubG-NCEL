/* ============================================================
   HYPNOSCOUT — Demo data (fallback when the live API proxy
   is not reachable). Shapes mirror the Clash Royale API so the
   same render code works for live and demo data.

   `id` = official Supercell card id, used to build in-game
   copyDeck links (clashroyale://copyDeck?deck=...). When the
   live API is connected, real ids from the API override these.
   ============================================================ */

const CARD_DB = {
  golem:        { name: "Golem",            elixir: 8, rarity: "epic",      img: "golem",          id: 26000009 },
  minions:      { name: "Sürü",             elixir: 3, rarity: "common",    img: "minions",        id: 26000005 },
  babydragon:   { name: "Bebek Ejderha",    elixir: 4, rarity: "epic",      img: "baby-dragon",    id: 26000015 },
  lumberjack:   { name: "Oduncu",           elixir: 4, rarity: "legendary", img: "lumberjack",     id: 26000035 },
  nightwitch:   { name: "Gece Cadısı",      elixir: 4, rarity: "legendary", img: "night-witch",    id: 26000048 },
  mega_minion:  { name: "Mega Minyon",      elixir: 3, rarity: "rare",      img: "mega-minion",    id: 26000039 },
  tornado:      { name: "Kasırga",          elixir: 3, rarity: "epic",      img: "tornado",        id: 28000012 },
  lightning:    { name: "Şimşek",           elixir: 6, rarity: "epic",      img: "lightning",      id: 28000007 },
  hog:          { name: "Yaban Domuzu",     elixir: 4, rarity: "rare",      img: "hog-rider",      id: 26000021 },
  icespirit:    { name: "Buz Ruhu",         elixir: 1, rarity: "common",    img: "ice-spirit",     id: 26000030 },
  icegolem:     { name: "Buz Golemi",       elixir: 2, rarity: "rare",      img: "ice-golem",      id: 26000038 },
  cannon:       { name: "Top",              elixir: 3, rarity: "common",    img: "cannon",         id: 27000000 },
  musketeer:    { name: "Silahşor",         elixir: 4, rarity: "rare",      img: "musketeer",      id: 26000014 },
  skeletons:    { name: "İskeletler",       elixir: 1, rarity: "common",    img: "skeletons",      id: 26000010 },
  thelog:       { name: "Kütük",            elixir: 2, rarity: "legendary", img: "the-log",        id: 28000011 },
  firecracker:  { name: "Maytap",           elixir: 3, rarity: "common",    img: "firecracker",    id: 26000064 },
  goblinbarrel: { name: "Goblin Fıçısı",    elixir: 3, rarity: "epic",      img: "goblin-barrel",  id: 28000004 },
  princess:     { name: "Prenses",          elixir: 3, rarity: "legendary", img: "princess",       id: 26000026 },
  goblingang:   { name: "Goblin Çetesi",    elixir: 3, rarity: "common",    img: "goblin-gang",    id: 26000041 },
  inferno_t:    { name: "Cehennem Kulesi",  elixir: 5, rarity: "rare",      img: "inferno-tower",  id: 27000003 },
  rocket:       { name: "Roket",            elixir: 6, rarity: "rare",      img: "rocket",         id: 28000003 },
  knight:       { name: "Şövalye",          elixir: 3, rarity: "common",    img: "knight",         id: 26000000 },
  miner:        { name: "Madenci",          elixir: 3, rarity: "legendary", img: "miner",          id: 26000032 },
  poison:       { name: "Zehir",            elixir: 4, rarity: "epic",      img: "poison",         id: 28000009 },
  wallbreakers: { name: "Duvar Yıkıcılar",  elixir: 2, rarity: "epic",      img: "wall-breakers",  id: 26000058 },
  bats:         { name: "Yarasalar",        elixir: 2, rarity: "common",    img: "bats",           id: 26000049 },
  spear_gob:    { name: "Mızraklı Goblin",  elixir: 2, rarity: "common",    img: "spear-goblins",  id: 26000019 },
  valkyrie:     { name: "Valkür",           elixir: 4, rarity: "rare",      img: "valkyrie",       id: 26000011 },
  pekka:        { name: "P.E.K.K.A",        elixir: 7, rarity: "epic",      img: "pekka",          id: 26000004 },
  ewiz:         { name: "Elektro Büyücü",   elixir: 4, rarity: "legendary", img: "electro-wizard", id: 26000042 },
  battleram:    { name: "Savaş Koçu",       elixir: 4, rarity: "rare",      img: "battle-ram",     id: 26000036 },
  bandit:       { name: "Haydut",           elixir: 3, rarity: "legendary", img: "bandit",         id: 26000046 },
  royalghost:   { name: "Kraliyet Hayaleti",elixir: 3, rarity: "legendary", img: "royal-ghost",    id: 26000050 },
  zap:          { name: "Şok",              elixir: 2, rarity: "common",    img: "zap",            id: 28000008 },
  archerqueen:  { name: "Okçu Kraliçe",     elixir: 5, rarity: "champion",  img: "archer-queen",   id: 26000072, hero: true },
  goldenknight: { name: "Altın Şövalye",    elixir: 4, rarity: "champion",  img: "golden-knight",  id: 26000074, hero: true },
  skeletonking: { name: "İskelet Kral",     elixir: 4, rarity: "champion",  img: "skeleton-king",  id: 26000069, hero: true },
  mightyminer:  { name: "Kudretli Madenci", elixir: 4, rarity: "champion",  img: "mighty-miner",   id: 26000065, hero: true },
  monk:         { name: "Keşiş",            elixir: 5, rarity: "champion",  img: "monk",           id: 26000077, hero: true },
  fireball:     { name: "Ateş Topu",        elixir: 4, rarity: "rare",      img: "fireball",       id: 28000000 },
  mortar:       { name: "Havan Topu",       elixir: 4, rarity: "common",    img: "mortar",         id: 27000002 },
  tesla:        { name: "Tesla",            elixir: 4, rarity: "common",    img: "tesla",          id: 27000006 },
  darkprince:   { name: "Kara Prens",       elixir: 4, rarity: "epic",      img: "dark-prince",    id: 26000027 },
  guards:       { name: "Muhafızlar",       elixir: 3, rarity: "epic",      img: "guards",         id: 26000025 },
  earthquake:   { name: "Deprem",           elixir: 3, rarity: "rare",      img: "earthquake",     id: 28000014 },
  ramrider:     { name: "Koç Binici",       elixir: 5, rarity: "legendary", img: "ram-rider",      id: 26000051 },
  electrodragon:{ name: "Elektro Ejderha",  elixir: 5, rarity: "epic",      img: "electro-dragon", id: 26000063 },
  balloon:      { name: "Balon",            elixir: 5, rarity: "epic",      img: "balloon",        id: 26000006 },
  freeze:       { name: "Dondurma",         elixir: 4, rarity: "epic",      img: "freeze",         id: 28000005 },
  graveyard:    { name: "Mezarlık",         elixir: 5, rarity: "legendary", img: "graveyard",      id: 28000010 },
  giant:        { name: "Dev",              elixir: 5, rarity: "rare",      img: "giant",          id: 26000003 },
  lavahound:    { name: "Lav Devi",         elixir: 7, rarity: "legendary", img: "lava-hound",     id: 26000029 },
  megaknight:   { name: "Mega Şövalye",     elixir: 7, rarity: "legendary", img: "mega-knight",    id: 26000055 },
  goblindrill:  { name: "Goblin Matkabı",   elixir: 4, rarity: "epic",      img: "goblin-drill",   id: 27000013 },
  barbbarrel:   { name: "Barbar Fıçısı",    elixir: 2, rarity: "epic",      img: "barbarian-barrel", id: 28000015 },
  snowball:     { name: "Kartopu",          elixir: 2, rarity: "common",    img: "giant-snowball", id: 28000017 },
  arrows:       { name: "Oklar",            elixir: 3, rarity: "common",    img: "arrows",         id: 28000001 },
  witch:        { name: "Cadı",             elixir: 5, rarity: "epic",      img: "witch",          id: 26000007 },
  babarbarians: { name: "Barbarlar",        elixir: 5, rarity: "common",    img: "barbarians",     id: 26000008 },
  minionhorde:  { name: "Minyon Ordusu",    elixir: 5, rarity: "common",    img: "minion-horde",   id: 26000022 },
  tombstone:    { name: "Mezar Taşı",       elixir: 3, rarity: "rare",      img: "tombstone",      id: 27000009 },
  bomber:       { name: "Bombacı",          elixir: 2, rarity: "common",    img: "bomber",         id: 26000013 },
  flyingmachine:{ name: "Uçan Makine",      elixir: 4, rarity: "rare",      img: "flying-machine", id: 26000057 },
  archers:      { name: "Okçular",          elixir: 3, rarity: "common",    img: "archers",        id: 26000001 },
  goblins:      { name: "Goblinler",        elixir: 2, rarity: "common",    img: "goblins",        id: 26000002 },
  prince:       { name: "Prens",            elixir: 5, rarity: "epic",      img: "prince",         id: 26000016 },
  wizard:       { name: "Büyücü",           elixir: 5, rarity: "rare",      img: "wizard",         id: 26000017 },
  minipekka:    { name: "Mini P.E.K.K.A",   elixir: 4, rarity: "rare",      img: "mini-pekka",     id: 26000018 },
  giantskeleton:{ name: "Dev İskelet",      elixir: 6, rarity: "epic",      img: "giant-skeleton", id: 26000020 },
  royalgiant:   { name: "Kraliyet Devi",    elixir: 6, rarity: "common",    img: "royal-giant",    id: 26000024 },
  royalrecruits:{ name: "Kraliyet Erleri",  elixir: 7, rarity: "common",    img: "royal-recruits", id: 26000047 },
  threemusk:    { name: "Üç Silahşor",      elixir: 9, rarity: "rare",      img: "three-musketeers", id: 26000028 },
  sparky:       { name: "Sparky",           elixir: 6, rarity: "epic",      img: "sparky",         id: 26000033 },
  bowler:       { name: "Golcü",            elixir: 5, rarity: "epic",      img: "bowler",         id: 26000034 },
  executioner:  { name: "Cellat",           elixir: 5, rarity: "epic",      img: "executioner",    id: 26000045 },
  hunter:       { name: "Avcı",             elixir: 4, rarity: "epic",      img: "hunter",         id: 26000044 },
  magicarcher:  { name: "Sihirli Okçu",     elixir: 4, rarity: "legendary", img: "magic-archer",   id: 26000062 },
  fisherman:    { name: "Balıkçı",          elixir: 3, rarity: "legendary", img: "fisherman",      id: 26000061 },
  motherwitch:  { name: "Ana Cadı",         elixir: 4, rarity: "legendary", img: "mother-witch",   id: 26000083 },
  goblingiant:  { name: "Goblin Devi",      elixir: 6, rarity: "epic",      img: "goblin-giant",   id: 26000060 },
  cannoncart:   { name: "Toplu Araba",      elixir: 5, rarity: "epic",      img: "cannon-cart",    id: 26000054 },
  zappies:      { name: "Zıpırlar",         elixir: 4, rarity: "rare",      img: "zappies",        id: 26000052 },
  rascals:      { name: "Yaramazlar",       elixir: 5, rarity: "common",    img: "rascals",        id: 26000053 },
  skeletonbarrel:{name: "İskelet Fıçısı",   elixir: 3, rarity: "common",    img: "skeleton-barrel",id: 26000056 },
  firespirit:   { name: "Ateş Ruhu",        elixir: 1, rarity: "common",    img: "fire-spirits",   id: 26000031 },
  elixirgolem:  { name: "İksir Golemi",     elixir: 3, rarity: "rare",      img: "elixir-golem",   id: 26000067 },
  battlehealer: { name: "Savaş Şifacısı",   elixir: 4, rarity: "rare",      img: "battle-healer",  id: 26000068 },
  xbow:         { name: "X-Yay",            elixir: 6, rarity: "epic",      img: "x-bow",          id: 27000008 },
  goblinhut:    { name: "Goblin Kulübesi",  elixir: 5, rarity: "rare",      img: "goblin-hut",     id: 27000001 },
  furnace:      { name: "Fırın",            elixir: 4, rarity: "rare",      img: "furnace",        id: 27000010 },
  bombtower:    { name: "Bomba Kulesi",     elixir: 4, rarity: "rare",      img: "bomb-tower",     id: 27000004 },
  elixircollector:{name:"İksir Toplayıcı",  elixir: 6, rarity: "rare",      img: "elixir-collector", id: 27000007 },
  goblincage:   { name: "Goblin Kafesi",    elixir: 4, rarity: "rare",      img: "goblin-cage",    id: 27000012 },
  royalhogs:    { name: "Kraliyet Domuzları",elixir:5, rarity: "rare",      img: "royal-hogs",     id: 26000059 },
  arrows:       { name: "Oklar",            elixir: 3, rarity: "common",    img: "arrows",         id: 28000001 },
  rage:         { name: "Öfke",             elixir: 2, rarity: "epic",      img: "rage",           id: 28000002 },
  clone:        { name: "Klon",             elixir: 3, rarity: "epic",      img: "clone",          id: 28000013 },
  royaldelivery:{ name: "Kraliyet Teslimatı",elixir:3, rarity: "common",    img: "royal-delivery", id: 28000018 },
  littleprince: { name: "Küçük Prens",      elixir: 3, rarity: "champion",  img: "little-prince",  id: 26000084, hero: true },
  phoenix:      { name: "Anka Kuşu",        elixir: 4, rarity: "legendary", img: "phoenix",        id: 26000087 },
};

/*
  Meta pool. The wheel draws a random subset from this pool on
  every reload / spin. Includes the archetypes you named plus a
  few more so the pool feels current.
*/
const META_POOL = [
  { name: "GOLEM BEATDOWN", winrate: 58.4, usage: 6.1, cards: ["golem","nightwitch","babydragon","lumberjack","mega_minion","tornado","lightning","electrodragon"],
    evo: [], tip: "İksir avantajını topla, çift eliksirde Golem'i arkadan bas ve destek birimlerini ekle." },
  { name: "LOG BAIT", winrate: 55.9, usage: 7.3, cards: ["goblinbarrel","princess","goblingang","inferno_t","rocket","knight","icespirit","thelog"],
    evo: ["knight"], tip: "Rakibin Kütük/Ok kartını çekmesini bekle, sonra Goblin Fıçısı ile baskı kur." },
  { name: "MINER POISON", winrate: 57.1, usage: 5.4, cards: ["miner","poison","bats","wallbreakers","spear_gob","valkyrie","inferno_t","thelog"],
    evo: ["bats"], tip: "Madenci + Zehir kombosuyla kule ve destek birimlerini birlikte eritin." },
  { name: "HOG 2.6", winrate: 56.2, usage: 8.8, cards: ["hog","icespirit","icegolem","cannon","musketeer","skeletons","thelog","fireball"],
    evo: ["firecracker"], tip: "Düşük ortalama iksirle hızlı döngü yap; her Yaban Domuzu'nu Buz Ruhu ile destekle." },
  { name: "PEKKA BRIDGE SPAM", winrate: 54.7, usage: 4.9, cards: ["pekka","battleram","bandit","royalghost","ewiz","zap","poison","electrodragon"],
    evo: [], tip: "P.E.K.K.A savunmada kullan, karşı saldırıda Koç + Haydut ile köprüden bas." },
  { name: "X-BOW CYCLE", winrate: 53.3, usage: 3.2, cards: ["archerqueen","tesla","icespirit","skeletons","thelog","fireball","knight","icegolem"],
    evo: ["tesla"], tip: "X-Bow'u köprü hizasına kur, ucuz kartlarla savun ve döngüyü hızlı tut." },
  { name: "GOLDEN KNIGHT BAIT", winrate: 56.8, usage: 4.1, cards: ["goldenknight","goblinbarrel","princess","goblingang","rocket","icespirit","thelog","inferno_t"],
    evo: ["icespirit"], tip: "Altın Şövalye'nin atılganlığını destekle; yem kartlarıyla rakibin ekmeklerini boşalt." },
  { name: "MORTAR CYCLE", winrate: 52.5, usage: 2.7, cards: ["mortar","knight","musketeer","icespirit","skeletons","thelog","fireball","bats"],
    evo: ["mortar"], tip: "Havan Topu'nu kule menziline kur, hızlı döngü ile sürekli baskı uygula." },
  { name: "LAVALOON", winrate: 55.1, usage: 3.9, cards: ["lavahound","balloon","babydragon","mega_minion","guards","fireball","zap","tombstone"],
    evo: [], tip: "Lav Devi'ni tank olarak öne sür, arkadan Balon ile kuleye yüklen." },
  { name: "GIANT GRAVEYARD", winrate: 54.0, usage: 3.5, cards: ["giant","graveyard","babydragon","poison","bomber","musketeer","zap","tombstone"],
    evo: ["bomber"], tip: "Dev'i öne koyup arkasına Mezarlık at; Zehir ile savunmayı kır." },
  { name: "GOBLIN DRILL CYCLE", winrate: 53.8, usage: 3.0, cards: ["goblindrill","miner","bomber","barbbarrel","snowball","valkyrie","inferno_t","thelog"],
    evo: ["bomber"], tip: "Matkabı kule yanına indir, Madenci ile ikinci cepheyi aç." },
  { name: "MEGA KNIGHT BAIT", winrate: 55.6, usage: 4.4, cards: ["megaknight","goblinbarrel","princess","goblingang","inferno_t","bats","zap","thelog"],
    evo: ["bats"], tip: "Mega Şövalye'yi kalabalık push'lara sakla; yem kartlarıyla ekmek avantajı topla." },
  { name: "SKELETON KING GRAVEYARD", winrate: 54.3, usage: 2.9, cards: ["skeletonking","graveyard","valkyrie","babydragon","poison","tombstone","snowball","arrows"],
    evo: ["valkyrie"], tip: "İskelet Kral ruh topla, savunmadan Mezarlık karşı saldırısına geç." },
  { name: "ROYAL GIANT FISHERMAN", winrate: 52.1, usage: 2.4, cards: ["giant","witch","fireball","musketeer","icespirit","skeletons","thelog","tombstone"],
    evo: ["skeletons"], tip: "Tankı köprüden bas, arkadaki destek birimlerini spellerden koru." },
];
// Backwards-compat alias used by earlier pages
const META_DECKS = META_POOL;

/* ---- Leaderboard generators (Path of Legends + Trophy Road) ---- */
const SEED_NAMES = [
  "Mohamed Light","SÖRLOTH","Surgical Goblin","Morten","BAERT","OGE | RAGE","Nova | Anas","JuicyJ",
  "Egesecer","Ahmet Rüzgar","Boss Cimo","IamNasr","Alrafi","KaanFlash","Ege Talha","Cigkofte",
  "SK Morten","Ruben","Corrupt X","Coltinator","Alkuma","MusaBey","EmirTR","Ferhat07","Deniz61",
  "SelimKing","MertGamer","Tolga.exe","BurakElite","CanPro","YusufTR","Kerem34","OnurBlade","BerkeMax",
  "AliOsman","HakanRoyale","Doruk","EnesTitan","FurkanX","GökhanGG","İlkerPro","JannikDE","Kai | GER",
  "Lucas | BR","MatheusBR","NicoAR","Pablo | ES","QuentinFR","RaphaelFR","SamuraiJP","Takeshi","Umut58",
  "VedatV","Wei | CN","Xander","YamiJP","ZeynoTR","Ahmet Maksut","BaranBlaze","CemreStar","DoğukanD",
  "ErenElite","FatihF","GamzeGG","HalilH","IremI","Jülide","KubilayK","LeventL","MelisM","NazlıN",
  "OktayO","PelinP","RüzgarR","SudeS","TarıkT","UgurU","VeyselV","YağızY","ZaferZ","AbdullahA",
  "BeyzaB","CihanC","DamlaD","EbruE","FeyzaF","GizemG","HasanH","IdilI","KaanK","LaleL","MiraçM",
  "NuriN","OyaO","PolatP","RanaR","SinanS","TubaT","UfukU","VildanV","YavuzY"
];
const CLAN_POOL = [
  "Türk Ejderleri","Nova eSports","Team Queso","SK Gaming","PONOS","Team Liquid","Vodafone Giants",
  "Osmanlı Torunu","Anadolu Kartalları","Bosphorus","Kızıl Elma","Gökbörü","Royale Türkiye",
  "Immortals","Tribe Gaming","Sandstorm","Wintrbell","Legion TR","Hype","—"
];

// deterministic-ish deck per player so a player always "uses" the same deck
function deckForIndex(i){ return META_POOL[i % META_POOL.length].cards; }

function buildPoL(n){
  const rows = [];
  let pts = 9820; // Path of Legends uses "league" points/rating
  for (let i = 0; i < n; i++) {
    const name = SEED_NAMES[i % SEED_NAMES.length] + (i >= SEED_NAMES.length ? " " + (Math.floor(i/SEED_NAMES.length)+1) : "");
    pts -= Math.floor(Math.random() * 22) + 5;
    rows.push({
      rank: i + 1, name,
      tag: "#" + Math.random().toString(36).slice(2, 10).toUpperCase(),
      trophies: pts,                       // PoL rating
      clan: CLAN_POOL[Math.floor(Math.random() * CLAN_POOL.length)],
      deck: deckForIndex(i),
    });
  }
  return rows;
}
function buildTrophyRoad(n){
  const rows = [];
  let trophy = 9420;
  for (let i = 0; i < n; i++) {
    const name = SEED_NAMES[(i+7) % SEED_NAMES.length] + (i >= SEED_NAMES.length ? " " + (Math.floor(i/SEED_NAMES.length)+1) : "");
    trophy -= Math.floor(Math.random() * 24) + 6;
    rows.push({
      rank: i + 1, name,
      tag: "#" + Math.random().toString(36).slice(2, 10).toUpperCase(),
      trophies: trophy,
      clan: CLAN_POOL[Math.floor(Math.random() * CLAN_POOL.length)],
      deck: deckForIndex(i + 3),
    });
  }
  return rows;
}
const POL_LEADERBOARD = buildPoL(100);
const TROPHY_LEADERBOARD = buildTrophyRoad(100);
const LEADERBOARD = POL_LEADERBOARD; // default

/* ---- Clan ---- */
const CLAN_MEMBERS = (() => {
  const roles = ["Lider","Yardımcı","Yaşlı","Yaşlı","Üye","Üye","Üye","Üye","Üye","Üye"];
  const names = ["Cigkofte","Ahmet Maksut","Baran","Deniz","Ege Talha","Furkan","Gökhan","Halil","Kaan","Levent","Mert","Onur","Selim","Tolga","Umut","Vedat","Yusuf","Zeynep","Berke","Cem"];
  return names.map((nm, i) => ({
    no: i + 1, name: nm,
    tag: "#" + Math.random().toString(36).slice(2, 10).toUpperCase(),
    role: roles[Math.min(i, roles.length - 1)] || "Üye",
    level: 15 - (i % 4),
    trophies: 12124 - i * 137 - Math.floor(Math.random() * 60),
    donations: `${Math.floor(Math.random() * 8) * 40}/${[0,120,240,320,480][i % 5]}`,
  }));
})();
const CLAN_INFO = { name: "Türk Ejderleri", tag: "#9YQ2VG0P", score: 58420, members: 46, required: 6800, type: "Davetle", region: "Türkiye" };

/* ---- Clan leaderboard (global) ---- */
const CLAN_LB_SEED = [
  ["Calalas España","🇪🇸",49],["#MuUuKaNs!!","🇮🇹",49],["TheAddictedOnes","🇺🇸",50],
  ["Band of Adultes","🇫🇷",42],["! ShocK-13 !","🇹🇷",42],["Nova eSports","🇧🇷",50],
  ["Türk Ejderleri","🇹🇷",46],["PONOS","🇯🇵",48],["Tribe Gaming","🇺🇸",47],
  ["SK Gaming","🇩🇪",45],["Team Queso","🇪🇸",50],["Anadolu Kartalları","🇹🇷",44],
  ["Vodafone Giants","🇪🇸",49],["Gökbörü","🇹🇷",43],["Immortals","🇺🇸",46],
  ["Team Liquid","🇳🇱",48],["Osmanlı Torunu","🇹🇷",41],["Legion TR","🇹🇷",42],
  ["Bosphorus","🇹🇷",40],["Sandstorm","🇸🇦",47],
];
const CLAN_LEADERBOARD = (() => {
  let score = 13010;
  const rows = [];
  for (let i = 0; i < 100; i++) {
    const seed = CLAN_LB_SEED[i % CLAN_LB_SEED.length];
    score -= Math.floor(Math.random() * 60) + 30;
    rows.push({
      rank: i + 1,
      name: seed[0] + (i >= CLAN_LB_SEED.length ? " " + (Math.floor(i/CLAN_LB_SEED.length)+1) : ""),
      flag: seed[1],
      members: seed[2],
      tag: "#" + Math.random().toString(36).slice(2, 10).toUpperCase(),
      score: score,
    });
  }
  return rows;
})();

/* ---- Sample player (RoyaleAPI-style detail) ---- */
const SAMPLE_PLAYER = {
  name: "Ahmet Maksut", tag: "#298Q8YVGG", level: 54,
  trophies: 8642, bestTrophies: 9105,          // Trophy Road
  polRating: 9420, polBest: 9640, polRank: 1842, // Path of Legends
  wins: 12480, losses: 8940, threeCrown: 3210, battleCount: 21420,
  challengeMax: 12, challengeCardsWon: 84600, tournamentCardsWon: 152300, tournamentBest: 4,
  clan: "Türk Ejderleri", clanRole: "Yardımcı", arena: "Efsanevi Arena",
  cards: ["archerqueen","hog","musketeer","icespirit","cannon","skeletons","thelog","firecracker"],
  evo: ["firecracker"],
  levels: [15, 15, 14, 15, 13, 15, 14, 12],
  maxed:  [true, true, false, true, false, true, false, false],
  trophyHistory: [7200, 7550, 7410, 7880, 8120, 7990, 8340, 8500, 8420, 8642],
  battles: [
    { result: "win",  crowns: "3-0", type: "Nihai Kademe", deck: "hog", oppDeck: "golem", opp: "SÖRLOTH", oppClan:"Gökbörü", trophies: "+31" },
    { result: "win",  crowns: "2-1", type: "Nihai Kademe", deck: "hog", oppDeck: "logbait", opp: "Morten",  oppClan:"Legion TR", trophies: "+29" },
    { result: "loss", crowns: "1-2", type: "Nihai Kademe", deck: "hog", oppDeck: "golem", opp: "BAERT",   oppClan:"PONOS", trophies: "-27" },
    { result: "win",  crowns: "2-0", type: "Kupa Yolu",    deck: "hog", oppDeck: "pekka", opp: "JuicyJ",  oppClan:"—", trophies: "+30" },
    { result: "win",  crowns: "3-1", type: "Turnuva",      deck: "hog", oppDeck: "miner", opp: "Egesecer",oppClan:"Nova eSports", trophies: "0" },
  ],
};

/* ---- Demo latest videos (fallback until proxy /api/youtube is live) ---- */
const DEMO_VIDEOS = (() => {
  const now = Date.now();
  const H = 3600e3;
  const seed = [
    ["Otobüste Clash Royale Oynadım! 😂🚌", 9*H],
    ["Bu Deste Meta'yı Yıkıyor! 🔥 En İyi Yaban Domuzu Destesi", 30*H],
    ["Nihai Kademe #1'e Nasıl Çıkılır? | Tam Rehber", 3*24*H],
    ["Evrim Kartları Sıralaması: En İyiden En Kötüye", 6*24*H],
  ];
  // Not: proxy çalışırken bu bölüm YouTube RSS'ten gerçek son videolar +
  // gerçek kapak görselleriyle otomatik dolar (demo fallback yukarıdadır).
  return seed.map(([title, ago], i) => ({
    videoId: "demo" + i,
    title,
    published: new Date(now - ago).toISOString(),
    thumb: "",
    url: "https://www.youtube.com/@hypnoscr/videos",
  }));
})();

/* ---- Demo global live matches ---- */
const LIVE_MATCHES = (() => {
  const pick = () => META_POOL[Math.floor(Math.random()*META_POOL.length)];
  const arr = [];
  for (let i = 0; i < 12; i++) {
    const p1 = SEED_NAMES[i % SEED_NAMES.length];
    const p2 = SEED_NAMES[(i*3+5) % SEED_NAMES.length];
    const c1 = Math.floor(Math.random()*4), c2 = Math.floor(Math.random()*4);
    const win = c1 === c2 ? (Math.random()<.5?1:2) : (c1>c2?1:2);
    arr.push({
      p1: { name: p1, clan: CLAN_POOL[i%CLAN_POOL.length], trophies: 9200 - i*11, deck: pick().cards },
      p2: { name: p2, clan: CLAN_POOL[(i+5)%CLAN_POOL.length], trophies: 9180 - i*13, deck: pick().cards },
      crowns: `${win===1?Math.max(c1,c2):Math.min(c1,c2)}-${win===1?Math.min(c1,c2):Math.max(c1,c2)}`,
      c1: win===1?Math.max(c1,c2):Math.min(c1,c2),
      c2: win===1?Math.min(c1,c2):Math.max(c1,c2),
      winner: win, type: ["Nihai Kademe","Kupa Yolu","Turnuva"][i%3], ago: `${i*2+1} dk önce`,
    });
  }
  return arr;
})();
