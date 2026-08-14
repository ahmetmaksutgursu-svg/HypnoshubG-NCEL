/* ============================================================
   HYPNOSCOUT — Shared application logic
   - Theme (light/dark) + persistence
   - Language (TR/EN) via data-i18n
   - API client (Node proxy) with automatic demo fallback
   - Render helpers: cards, deck icons, tables, modal, copyDeck
   ============================================================ */

// If the page is served by the Node proxy (http/https), talk to the same
// origin → everything is LIVE with no CORS issue. If opened as a bare file,
// fall back to the local proxy address.
const API_BASE = (window.HYPNOSCOUT_API_BASE)
  || (location.origin && location.origin.startsWith("http") ? location.origin + "/api" : "http://localhost:8787/api");

/* Social links */
const SOCIAL = {
  instagram: "https://www.instagram.com/muhsin_ucaa/",
  youtube: "https://www.youtube.com/@hypnoscr",
  youtubeChannelId: "UC5pUCwGNR9rnoWLfweHcnRw",
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
function toggleTheme(){
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(cur === "dark" ? "light" : "dark");
}

/* ---------- i18n ---------- */
const I18N = {
  tr: {
    "nav.home":"ANA SAYFA","nav.meta":"META","nav.ranks":"SIRALAMALAR",
    "nav.live":"CANLI MAÇLAR","nav.cards":"KARTLAR","nav.updates":"GÜNCELLEMELER","nav.fun":"EĞLENCE",
    "search.player":"Oyuncu","search.clan":"Klan","search.ph":"Oyuncu veya Klan etiketi gir...",
    "hero.eyebrow":"CLASH ROYALE ANALİZ PLATFORMU",
    "hero.title":"CLASH ROYALE İSTATİSTİKLERİNİ KEŞFET",
    "hero.sub":"Oyuncuları ve klanları ara, meta desteleri incele, küresel sıralamaları takip et ve tek tıkla rastgele meta destesi oluştur.",
    "hero.cta1":"Oyuncu Ara","hero.cta2":"Sıralamaları Gör",
    "home.meta.title":"Aktif Meta Desteleri","home.meta.sub":"Şu an en çok kazandıran desteler",
    "home.player.title":"Oyuncu Analizi","home.player.sub":"Oyuncu etiketi veya adı ile ara",
    "home.clan.title":"Klan Arama","home.clan.sub":"Klan üyelerini ve bağışları incele",
    "home.ranks.title":"Küresel Sıralamalar","home.ranks.sub":"Dünyanın en iyileri",
    "home.gen.title":"Rastgele Deste Oluşturucu","home.gen.sub":"Çarkı çevir, günün meta destesini keşfet",
    "gen.button":"RASTGELE META DESTESİ OLUŞTUR","gen.result":"GÜNÜN META DESTESİ:",
    "gen.winrate":"Kazanma Oranı","gen.usage":"Kullanım","gen.elixir":"Ort. İksir",
    "gen.copy":"Desteyi Kopyala","gen.copied":"Kopyalandı!","gen.tip":"Oynanış İpucu","gen.open":"Oyunda Aç",
    "ranks.title":"GLOBAL SIRALAMALAR","ranks.sub":"Aktif sezon — en iyi 100 oyuncu",
    "ranks.pol":"Nihai Kademe","ranks.tr":"Kupa Yolu","ranks.deck":"AKTİF DESTE",
    "col.rank":"SIRA","col.player":"OYUNCU","col.trophies":"NİHAİ KUPALAR","col.points":"PUAN","col.clan":"KLAN",
    "clan.title":"KLAN ÜYELERİ","col.no":"NO","col.role":"ROL","col.level":"SEVİYE","col.trophy":"KUPA","col.donation":"BAĞIŞ",
    "footer.disclaimer":"Sitemizde kullanılan veriler ve resimler Clash Royale API'den çekilmektedir.",
    "footer.copyright":"Telif Hakkı","footer.about":"Hakkımızda","footer.contact":"İletişim","footer.privacy":"Gizlilik",
    "api.demo":"Demo veri","api.live":"Canlı API",
    "view.profile":"Profili Gör","btn.search":"Ara",
    "cards.title":"KARTLAR","cards.sub":"Tüm Clash Royale kartları — nadirlik ve iksir maliyetine göre",
    "updates.title":"GÜNCELLEMELER","updates.sub":"Son meta değişiklikleri ve site haberleri",
    "live.title":"GLOBAL SON MAÇLAR","live.sub":"Nihai Kademe zirvesinden canlı maç akışı","live.refresh":"Yenile","live.vs":"KARŞI",
    "profile.wins":"Galibiyet","profile.best":"En İyi","profile.level":"Seviye","profile.3crown":"3 Taç",
    "profile.battles":"Son Savaşlar","profile.deck":"Güncel Deste","profile.graph":"Kupa Geçmişi","profile.evo":"Evrim Durumu",
    "profile.pol":"Nihai Kademe","profile.polrank":"Dünya Sırası","profile.tr":"Kupa Yolu",
    "profile.collection":"Kart Koleksiyonu","profile.records":"Rekorlar","profile.losses":"Mağlubiyet",
    "profile.winrate":"Kazanma %","profile.challenge":"Meydan Okuma Rekoru","profile.tourbest":"Turnuva Derecesi",
    "profile.total":"Toplam Maç","profile.vs":"karşı",
  },
  en: {
    "nav.home":"HOME","nav.meta":"META","nav.ranks":"RANKINGS",
    "nav.live":"LIVE MATCHES","nav.cards":"CARDS","nav.updates":"UPDATES","nav.fun":"FUN",
    "search.player":"Player","search.clan":"Clan","search.ph":"Enter player or clan tag...",
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
    "ranks.pol":"Path of Legends","ranks.tr":"Trophy Road","ranks.deck":"ACTIVE DECK",
    "col.rank":"RANK","col.player":"PLAYER","col.trophies":"FINAL TROPHIES","col.points":"POINTS","col.clan":"CLAN",
    "clan.title":"CLAN MEMBERS","col.no":"NO","col.role":"ROLE","col.level":"LEVEL","col.trophy":"TROPHIES","col.donation":"DONATIONS",
    "footer.disclaimer":"Data and images on our site are drawn from the Clash Royale API.",
    "footer.copyright":"Copyright","footer.about":"About","footer.contact":"Contact","footer.privacy":"Privacy",
    "api.demo":"Demo data","api.live":"Live API",
    "view.profile":"View Profile","btn.search":"Search",
    "cards.title":"CARDS","cards.sub":"All Clash Royale cards — by rarity and elixir cost",
    "updates.title":"UPDATES","updates.sub":"Latest meta changes and site news",
    "live.title":"GLOBAL RECENT MATCHES","live.sub":"Live match feed from the Path of Legends top","live.refresh":"Refresh","live.vs":"VS",
    "profile.wins":"Wins","profile.best":"Best","profile.level":"Level","profile.3crown":"3-Crown",
    "profile.battles":"Recent Battles","profile.deck":"Current Deck","profile.graph":"Trophy History","profile.evo":"Evolution Status",
    "profile.pol":"Path of Legends","profile.polrank":"World Rank","profile.tr":"Trophy Road",
    "profile.collection":"Card Collection","profile.records":"Records","profile.losses":"Losses",
    "profile.winrate":"Win %","profile.challenge":"Challenge Record","profile.tourbest":"Tournament Best",
    "profile.total":"Total Battles","profile.vs":"vs",
  },
};
let LANG = store.get("hs-lang") || "tr";
function t(key){ return (I18N[LANG] && I18N[LANG][key]) || (I18N.tr[key]) || key; }
function applyLang(lang){
  LANG = lang; store.set("hs-lang", lang);
  document.documentElement.setAttribute("lang", lang);
  document.querySelectorAll("[data-i18n]").forEach(el => el.textContent = t(el.getAttribute("data-i18n")));
  document.querySelectorAll("[data-i18n-ph]").forEach(el => el.placeholder = t(el.getAttribute("data-i18n-ph")));
  document.querySelectorAll("[data-lang-label]").forEach(el => el.textContent = lang.toUpperCase());
  if (typeof window.onLangChange === "function") window.onLangChange(lang);
}
function toggleLang(){ applyLang(LANG === "tr" ? "en" : "tr"); }

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
  crest: `<svg viewBox="0 0 22 26" fill="none"><path d="M11 1 20 4v9c0 6-4 9.5-9 12C6 22.5 2 19 2 13V4l9-3z" fill="#1e5ae0" stroke="#0b1f4d" stroke-width="1"/><path d="M11 6l1.8 3.6 4 .6-2.9 2.8.7 4L11 15.7 7.4 17l.7-4L5.2 10.2l4-.6L11 6z" fill="#f2b807"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>`,
  playV: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  discord:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 5.3A17 17 0 0 0 15.9 4l-.2.4a13 13 0 0 1 3.7 1.9 12 12 0 0 0-10.9 0A13 13 0 0 1 12.2 4.4L12 4A17 17 0 0 0 8 5.3C5.3 9.3 4.6 13.2 5 17a17 17 0 0 0 5.1 2.6l.6-1a11 11 0 0 1-1.8-.9l.4-.3a8.5 8.5 0 0 0 7.4 0l.4.3c-.6.4-1.2.7-1.8.9l.6 1A17 17 0 0 0 19 17c.5-4.5-.7-8.4-3-11.7zM9.7 14.6c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7zm4.6 0c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7z"/></svg>`,
  instagram:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  x_social:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 3h3l-7 8 8 10h-6.3l-5-6.2L4.8 21H1.8l7.5-8.6L1.5 3h6.4l4.5 5.7L18 3zm-1.1 16h1.7L7.2 4.8H5.4L16.9 19z"/></svg>`,
  youtube:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 8s-.2-1.6-.9-2.3c-.9-.9-1.8-.9-2.3-1C16.6 4.5 12 4.5 12 4.5s-4.6 0-7.8.2c-.5.1-1.4.1-2.3 1C1.2 6.4 1 8 1 8S.8 9.9.8 11.8v1.4C.8 15 1 17 1 17s.2 1.6.9 2.3c.9.9 2 .9 2.5 1 1.8.1 7.6.2 7.6.2s4.6 0 7.8-.3c.5-.1 1.4-.1 2.3-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8v-1.4C23.2 9.9 23 8 23 8zM9.7 15.3V8.9l6 3.2-6 3.2z"/></svg>`,
};

/* ---------- Card rendering ---------- */
function cardImgUrl(slug){ return `https://cdn.royaleapi.com/static/img/cards-150/${slug}.png`; }
function cardImgUrlEvo(slug){ return `https://cdn.royaleapi.com/static/img/cards-150/evolution/${slug}.png`; }

// Resolve the correct art. Evolution cards use the evolution artwork.
// Returns { primary, fallback } so the <img> can cascade on error.
function cardArt(c, useEvo){
  const std = c.imgUrl || cardImgUrl(c.img);
  if (useEvo){
    const evo = c.imgUrlEvo || (c.img ? cardImgUrlEvo(c.img) : null);
    if (evo) return { primary: evo, fallback: std };
  }
  return { primary: std, fallback: std };
}

function renderCard(key, opts = {}){
  const c = CARD_DB[key];
  if (!c) return "";
  const isEvo = opts.evo ?? c.evo;
  const isHero = opts.hero ?? c.hero ?? (c.rarity === "champion");
  const lvl = opts.level, max = opts.max;
  const { primary, fallback } = cardArt(c, isEvo);
  const safeName = String(c.name).replace(/"/g, "&quot;");
  return `
    <div class="cr-card ${isEvo ? "evo" : ""}" title="${safeName} — ${c.elixir} iksir"${opts.onClick?` onclick="${opts.onClick}" style="cursor:pointer"`:""}>
      ${isEvo ? `<span class="evo-tag">Evrim</span>` : isHero ? `<span class="hero-tag">Kahraman</span>` : ""}
      <span class="elixir">${c.elixir}</span>
      <div class="art" data-name="${safeName}">
        <img src="${primary}" data-fb="${fallback}" alt="${safeName}" loading="lazy" onerror="cardImgFail(this)">
      </div>
      ${lvl != null ? `<div class="lvl ${max ? "max" : ""}">${max ? "MAX" : "Sv. " + lvl}</div>` : ""}
    </div>`;
}
function cardImgFail(img){
  const fb = img.getAttribute("data-fb");
  if (fb && img.src !== fb){ img.removeAttribute("data-fb"); img.src = fb; return; }
  const art = img.parentElement;
  if (!art || art.querySelector(".fallback")) { img.remove(); return; }
  img.remove();
  const d = document.createElement("div");
  d.className = "fallback"; d.textContent = art.getAttribute("data-name") || "";
  art.appendChild(d);
}

/* Small inline deck icon row. `evoList` = keys that are evolutions in THIS deck. */
function deckIcons(cards, evoList = [], cls = ""){
  const evoSet = new Set(evoList || []);
  return `<span class="deck-icons ${cls}">${(cards||[]).map(k => {
    const c = CARD_DB[k]; if (!c) return "";
    const useEvo = evoSet.has(k);
    const { primary, fallback } = cardArt(c, useEvo);
    const evo = useEvo ? " evo" : "";
    return `<span class="di${evo}" title="${c.name}" data-ab="${(c.name||'?').slice(0,2)}"><img src="${primary}" data-fb="${fallback}" alt="${c.name}" loading="lazy" onerror="diFail(this)"></span>`;
  }).join("")}</span>`;
}
/* Render an 8-card deck grid, marking only this deck's evolution cards. */
function deckCards(deck, opts = {}){
  const cards = deck.cards || deck;
  const evoSet = new Set(deck.evo || []);
  return cards.map(k => renderCard(k, { evo: evoSet.has(k), level: opts.level, max: opts.max, onClick: opts.onClick })).join("");
}
function diFail(img){
  const fb = img.getAttribute("data-fb");
  if (fb && img.src !== fb){ img.removeAttribute("data-fb"); img.src = fb; return; }
  const span = img.parentElement;
  img.remove();
  span.classList.add("di-fb");
  span.textContent = span.getAttribute("data-ab") || "?";
}

/* Register a live-API card into CARD_DB, return its key.
   NOTE: global evo is NOT set — evolution is decided per-deck via evo lists. */
function registerApiCard(c){
  const key = "api_" + c.id;
  CARD_DB[key] = {
    name: c.name, elixir: c.elixir ?? c.elixirCost ?? 0, rarity: c.rarity || "",
    img: "", imgUrl: c.icon || c.iconUrls?.medium || "",
    imgUrlEvo: c.evoIcon || c.iconUrls?.evolutionMedium || "",
    id: c.id, evo: false, hero: (c.champion || c.rarity === "champion"),
  };
  return key;
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

/* ---------- Clan crest ---------- */
function clanChip(name){
  if (!name || name === "—") return `<span class="muted">—</span>`;
  return `<span class="clan-chip"><span class="clan-crest">${ICONS.crest}</span>${name}</span>`;
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
  live: false,
  async _get(path){
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(API_BASE + path, { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) throw new Error("HTTP " + res.status);
      this.live = true;
      return await res.json();
    } catch { clearTimeout(to); this.live = false; return null; }
  },
  _mapRanks(data, fallback){
    if (data && data.items) return data.items.map((p,i) => ({
      rank: p.rank ?? i+1, name: p.name, tag: p.tag,
      trophies: p.trophies ?? p.eloRating ?? p.rating ?? 0,
      clan: p.clan?.name || "—", deck: null,
    }));
    return fallback;
  },
  async pol(){ return this._mapRanks(await this._get("/rankings/pathoflegend"), POL_LEADERBOARD); },
  async trophy(){ return this._mapRanks(await this._get("/rankings/global"), TROPHY_LEADERBOARD); },
  async rankings(){ return this.pol(); },
  async clanRankings(){
    const data = await this._get("/rankings/clans");
    if (data && data.items) return data.items.map((c,i) => ({
      rank:c.rank ?? i+1, name:c.name, tag:c.tag, flag:"", members:c.members ?? c.memberCount ?? 0, score:c.clanScore ?? 0,
    }));
    return CLAN_LEADERBOARD;
  },
  async player(tag){
    const data = await this._get("/player/" + encodeURIComponent(tag));
    if (data && data.name) return normalizePlayer(data);
    return SAMPLE_PLAYER;
  },
  async clan(tag){
    const data = await this._get("/clan/" + encodeURIComponent(tag));
    if (data && data.memberList) return {
      info: { name:data.name, tag:data.tag, score:data.clanScore, members:data.members, required:data.requiredTrophies, type:data.type, region:data.location?.name },
      members: data.memberList.map((m,i)=>({ no:i+1, name:m.name, tag:m.tag, role:roleTR(m.role), level:m.expLevel, trophies:m.trophies, donations:`${m.donations}/${m.donationsReceived}` })),
    };
    return { info: CLAN_INFO, members: CLAN_MEMBERS };
  },
  async clansSearch(name){
    const data = await this._get("/clans/search?name=" + encodeURIComponent(name));
    if (data && data.items) return data.items.map(c => ({ name:c.name, tag:c.tag, members:c.members, score:c.clanScore, region:c.location?.name }));
    return null; // null = proxy offline (demo can't search)
  },
  async live(){
    const data = await this._get("/live");
    if (data && data.items && data.items.length) return data.items.map(mapBattle).filter(Boolean);
    return LIVE_MATCHES;
  },
  async youtube(){
    const data = await this._get("/youtube");
    if (data && data.items && data.items.length) return data.items;
    return DEMO_VIDEOS;
  },
  async meta(){
    const data = await this._get("/meta");
    if (data && data.items && data.items.length){
      return data.items.map((d) => {
        const keys = [], evo = [];
        d.cards.forEach((c) => { const k = registerApiCard(c); keys.push(k); if (c.evo) evo.push(k); });
        return { name: nameDeck(keys), cards: keys, evo, usage: d.usage, winrate: null, source: "live" };
      });
    }
    return META_POOL.map((d) => ({ name: d.name, cards: d.cards, evo: d.evo || [], usage: d.usage, winrate: d.winrate, tip: d.tip, source: "demo" }));
  },
  async cards(){
    const data = await this._get("/cards");
    if (data && data.items && data.items.length){
      return data.items.map((c) => {
        const key = registerApiCard({ id: c.id, name: c.name, elixirCost: c.elixirCost, icon: c.iconUrls?.medium, evoIcon: c.iconUrls?.evolutionMedium, rarity: c.rarity, evolutionLevel: c.maxEvolutionLevel });
        return key;
      });
    }
    return Object.keys(CARD_DB).filter(k => !k.startsWith("api_"));
  },
};

/* Name a deck by its win condition for display */
const WINCONS = {
  golem:"Golem", lavahound:"Lavaloon", balloon:"Balon", hog:"Hog", miner:"Miner", graveyard:"Graveyard",
  mortar:"Mortar", goblindrill:"Drill", pekka:"P.E.K.K.A", megaknight:"Mega Knight", giant:"Giant",
  goblinbarrel:"Log Bait", ramrider:"Ram Rider", battleram:"Bridge Spam", royalghost:"Bridge Spam",
  archerqueen:"X-Bow/AQ", skeletonking:"Skeleton King", goldenknight:"Golden Knight",
};
function nameDeck(keys){
  for (const k of keys){ const base = k.replace(/^api_/,""); }
  // match by card name against known win conditions
  for (const key of keys){
    const c = CARD_DB[key]; if (!c) continue;
    for (const [wk, label] of Object.entries(WINCONS)){
      const w = CARD_DB[wk];
      if (w && c.name === w.name) return (label + " Deste").toUpperCase();
    }
  }
  // fallback: highest-elixir troop
  let best = keys[0];
  keys.forEach(k => { if ((CARD_DB[k]?.elixir||0) > (CARD_DB[best]?.elixir||0)) best = k; });
  return (CARD_DB[best]?.name || "META") .toUpperCase() + " DESTE";
}
function decksUsingCard(key, metaList){
  const c = CARD_DB[key]; if (!c) return [];
  return (metaList||[]).filter(d => d.cards.some(k => CARD_DB[k] && CARD_DB[k].name === c.name));
}

function roleTR(r){ return ({leader:"Lider",coLeader:"Yardımcı",elder:"Yaşlı",member:"Üye"})[r] || r; }

// Map a live-API player object into our render shape (best effort)
function normalizePlayer(d){
  const keys = [], levels = [], maxed = [], evo = [], collection = [];
  (d.currentDeck||[]).forEach(c => {
    const k = registerApiCard({ id:c.id, name:c.name, elixirCost:c.elixirCost, icon:c.iconUrls?.medium, evoIcon:c.iconUrls?.evolutionMedium, rarity:c.rarity });
    keys.push(k); levels.push(c.level); maxed.push(c.level>=c.maxLevel);
    if (c.evolutionLevel) evo.push(k);
  });
  (d.cards||[]).forEach(c => { collection.push(registerApiCard({ id:c.id, name:c.name, elixirCost:c.elixirCost, icon:c.iconUrls?.medium, evoIcon:c.iconUrls?.evolutionMedium, rarity:c.rarity })); });
  return {
    name:d.name, tag:d.tag, level:d.expLevel,
    trophies:d.trophies, bestTrophies:d.bestTrophies,
    polRating:d.currentPathOfLegendSeasonResult?.trophies || d.leagueStatistics?.currentSeason?.trophies,
    polBest:d.bestPathOfLegendSeasonResult?.trophies || d.leagueStatistics?.bestSeason?.trophies,
    polRank:d.currentPathOfLegendSeasonResult?.rank,
    wins:d.wins, losses:d.losses, threeCrown:d.threeCrownWins, battleCount:d.battleCount,
    challengeMax:d.challengeMaxWins, challengeCardsWon:d.challengeCardsWon, tournamentCardsWon:d.tournamentCardsWon, tournamentBest:d.bestTrophies,
    clan:d.clan?.name || "—", clanRole:roleTR(d.role), arena:d.arena?.name,
    cards:keys, evo, levels, maxed, collection,
    trophyHistory:null, battles:[],
  };
}
function mapBattle(b){
  try {
    const me = b.team?.[0], op = b.opponent?.[0]; if (!me || !op) return null;
    const reg = (arr)=> { const keys=[], evo=[]; (arr||[]).forEach(c=>{ const k=registerApiCard({id:c.id,name:c.name,elixirCost:c.elixirCost,icon:c.iconUrls?.medium,evoIcon:c.iconUrls?.evolutionMedium,rarity:c.rarity}); keys.push(k); if(c.evolutionLevel) evo.push(k); }); return {keys,evo}; };
    const md = reg(me.cards), od = reg(op.cards);
    const c1=me.crowns||0, c2=op.crowns||0;
    return {
      p1:{name:me.name, clan:me.clan?.name||"—", trophies:me.startingTrophies||me.trophies||0, deck:md.keys, evo:md.evo},
      p2:{name:op.name, clan:op.clan?.name||"—", trophies:op.startingTrophies||op.trophies||0, deck:od.keys, evo:od.evo},
      c1, c2, crowns:`${c1}-${c2}`, winner:c1>=c2?1:2,
      type:b.type||b.gameMode?.name||"Maç", ago:"",
    };
  } catch { return null; }
}

function paintApiStatus(){
  document.querySelectorAll("[data-api-status]").forEach(el => {
    el.classList.toggle("live", HypnoAPI.live);
    el.innerHTML = `<span class="led"></span>${HypnoAPI.live ? t("api.live") : t("api.demo")}`;
  });
}

/* ---------- Header / Footer ---------- */
function buildHeader(active){
  const nav = [
    ["index.html","nav.home"],["siralamalar.html","nav.ranks"],["canli.html","nav.live"],
    ["meta.html","nav.meta"],["kartlar.html","nav.cards"],["eglence.html","nav.fun"],
  ];
  return `
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="index.html" title="Ana sayfa">
        <span class="brand-logo"><img src="assets/img/hammer-logo.jpg" alt="HYPNOSCOUT" onerror="this.parentElement.innerHTML=ICONS.hammer"></span>
        <span class="brand-text"><span class="brand-name"><span class="w">HYPNOS</span><span class="b">COUT</span></span></span>
      </a>
      <nav class="main-nav">
        ${nav.map(([href,key]) => `<a href="${href}" class="${active===href?"active":""}" data-i18n="${key}">${t(key)}</a>`).join("")}
      </nav>
      <div class="header-tools">
        <div class="search-box" role="search">
          <select id="searchType" aria-label="Arama türü">
            <option value="player" data-i18n="search.player">${t("search.player")}</option>
            <option value="clan" data-i18n="search.clan">${t("search.clan")}</option>
          </select>
          <input id="searchInput" type="text" data-i18n-ph="search.ph" placeholder="${t("search.ph")}"
                 aria-label="Arama" onkeydown="if(event.key==='Enter')doSearch()">
          <button class="search-go" onclick="doSearch()" aria-label="Ara">${ICONS.search}</button>
        </div>
        <button class="icon-btn" onclick="toggleTheme()" aria-label="Tema" title="Açık / Koyu tema"><span data-theme-icon></span></button>
        <button class="icon-btn" onclick="toggleLang()" aria-label="Dil" title="Dil değiştir"><span data-lang-label>TR</span></button>
        <button class="icon-btn menu-btn" onclick="openDrawer()" aria-label="Menü" title="Menü">${ICONS.menu}</button>
      </div>
    </div>
  </header>
  <nav class="bottom-nav">
    ${nav.slice(0,5).map(([href,key]) => `<a href="${href}" class="${active===href?"active":""}"><span class="bn-ic">${bottomIcon(key)}</span><span data-i18n="${key}">${t(key)}</span></a>`).join("")}
  </nav>`;
}
function bottomIcon(key){
  return ({ "nav.home":"🏠","nav.meta":"🃏","nav.ranks":"🏆","nav.live":"🔴","nav.cards":"📇","nav.fun":"🎉" })[key] || "•";
}

function buildFooter(){
  return `
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-top">
        <div class="footer-brand">
          <div class="brand" style="margin-bottom:12px">
            <span class="brand-logo"><img src="assets/img/hammer-logo.jpg" alt="HYPNOSCOUT" onerror="this.parentElement.innerHTML=ICONS.hammer"></span>
            <span class="brand-text"><span class="brand-name"><span class="w">HYPNOS</span><span class="b">COUT</span></span></span>
          </div>
          <p style="opacity:.8;max-width:34ch;font-size:.88rem">Clash Royale oyuncu, klan ve meta istatistiklerini tek çatı altında sunan analiz platformu.</p>
          <span class="api-lock">${ICONS.lock}<span>API</span></span>
        </div>
        <div class="footer-col">
          <h4>Menü</h4>
          <a href="index.html" data-i18n="nav.home">Ana Sayfa</a>
          <a href="meta.html" data-i18n="nav.meta">Meta Desteleri</a>
          <a href="siralamalar.html" data-i18n="nav.ranks">Sıralamalar</a>
          <a href="canli.html" data-i18n="nav.live">Canlı Maçlar</a>
          <a href="kartlar.html" data-i18n="nav.cards">Kartlar</a>
        </div>
        <div class="footer-col">
          <h4>Site</h4>
          <a href="guncellemeler.html" data-i18n="nav.updates">Güncellemeler</a>
          <a href="#" data-i18n="footer.about">Hakkımızda</a>
          <a href="#" data-i18n="footer.contact">İletişim</a>
          <a href="#" data-i18n="footer.privacy">Gizlilik</a>
        </div>
        <div class="footer-col">
          <h4>Takip Et</h4>
          <a href="${SOCIAL.instagram}" target="_blank" rel="noopener" class="social-link">${ICONS.instagram}<span>Instagram</span></a>
          <a href="${SOCIAL.youtube}" target="_blank" rel="noopener" class="social-link">${ICONS.youtube}<span>YouTube</span></a>
        </div>
      </div>
      <div class="footer-disclaimer">
        <span class="api-lock">${ICONS.lock}<span>API KEY</span></span>
        <span data-i18n="footer.disclaimer">${t("footer.disclaimer")}</span>
        <span style="margin-left:auto">© ${new Date().getFullYear()} HYPNOSCOUT · <span data-i18n="footer.copyright">Telif Hakkı</span></span>
      </div>
      <div class="footer-credit">${LANG==="tr"?"Tasarım & Geliştirme":"Design & Development"}: <b>Ahmet Maksut Gürsu</b></div>
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
  const link = (href,label,ic) => `<a class="dr-link" href="${href}"><span class="dr-ic">${ic}</span>${label}</a>`;
  d.innerHTML = `
    <aside class="drawer">
      <div class="dr-head">
        <span class="brand"><span class="brand-logo"><img src="assets/img/hammer-logo.jpg" onerror="this.parentElement.innerHTML=ICONS.hammer"></span><span class="brand-name"><span class="w">HYPNOS</span><span class="b">COUT</span></span></span>
        <button class="icon-btn" onclick="closeDrawer()" aria-label="Kapat">${ICONS.x}</button>
      </div>
      <div class="dr-search">
        <div class="search-box" style="border-radius:12px">
          <select id="drType"><option value="player">${t("search.player")}</option><option value="clan">${t("search.clan")}</option></select>
          <input id="drInput" type="text" placeholder="${t("search.ph")}" style="flex:1;min-width:0" onkeydown="if(event.key==='Enter')drSearch()">
          <button class="search-go" onclick="drSearch()">${ICONS.search}</button>
        </div>
        <span class="dr-hint">${LANG==="tr"?"Etiket (#ABC) veya isimle ara":"Search by tag (#ABC) or name"}</span>
      </div>
      <div class="dr-sec">${LANG==="tr"?"MENÜ":"MENU"}</div>
      ${link("index.html", t("nav.home"), "🏠")}
      ${link("siralamalar.html", t("ranks.pol")+" — "+t("nav.ranks"), "🏆")}
      ${link("klanlar.html", LANG==="tr"?"Klan Liderlik Tablosu":"Clan Leaderboard", "🛡️")}
      ${link("canli.html", t("nav.live"), "🔴")}
      ${link("meta.html", t("nav.meta"), "🃏")}
      ${link("kartlar.html", t("nav.cards"), "📇")}
      ${link("oyuncu.html", t("home.player.title"), "👤")}
      ${link("klan.html", t("home.clan.title"), "🔍")}
      ${link("guncellemeler.html", t("nav.updates"), "📢")}
      <div class="dr-sec fun">🎉 ${LANG==="tr"?"EĞLENCE":"FUN"}</div>
      ${link("eglence.html", LANG==="tr"?"Kart Sıralama Oyunu":"Card Ranking Game", "🎲")}
      ${link("eglence.html#cark", LANG==="tr"?"Rastgele Meta Deste Çarkı":"Random Meta Deck Wheel", "🎡")}
      <div class="dr-link soon"><span class="dr-ic">❓</span>${LANG==="tr"?"Yeni eğlenceler":"New fun stuff"} <span class="soon-badge">${LANG==="tr"?"Yakında":"Soon"}</span></div>
      <div class="dr-foot">
        <a href="${SOCIAL.instagram}" target="_blank" rel="noopener" class="icon-btn">${ICONS.instagram}</a>
        <a href="${SOCIAL.youtube}" target="_blank" rel="noopener" class="icon-btn">${ICONS.youtube}</a>
        <button class="icon-btn" onclick="toggleTheme()"><span data-theme-icon></span></button>
        <button class="icon-btn" onclick="toggleLang()"><span data-lang-label>TR</span></button>
      </div>
    </aside>`;
  requestAnimationFrame(()=>d.classList.add("open"));
  applyTheme(document.documentElement.getAttribute("data-theme")||"light");
  document.querySelectorAll("#hs-drawer [data-lang-label]").forEach(el=>el.textContent=LANG.toUpperCase());
  document.addEventListener("keydown", drEsc);
}
function drEsc(e){ if(e.key==="Escape") closeDrawer(); }
function closeDrawer(){ const d=document.getElementById("hs-drawer"); if(d) d.classList.remove("open"); document.removeEventListener("keydown", drEsc); }
function drSearch(){
  const type=document.getElementById("drType").value, q=(document.getElementById("drInput").value||"").trim();
  location.href=(type==="clan"?"klan.html":"oyuncu.html")+(q?"?tag="+encodeURIComponent(q):"");
}

/* ---------- Search routing ---------- */
function doSearch(){
  const type = document.getElementById("searchType")?.value || "player";
  const q = (document.getElementById("searchInput")?.value || "").trim();
  location.href = (type === "clan" ? "klan.html" : "oyuncu.html") + (q ? "?tag=" + encodeURIComponent(q) : "");
}

/* ---------- Boot ---------- */
function mountChrome(active){
  const h = document.getElementById("app-header");
  const f = document.getElementById("app-footer");
  if (h) h.innerHTML = buildHeader(active);
  if (f) f.innerHTML = buildFooter();
  applyTheme(store.get("hs-theme") || "light");
  applyLang(LANG);
}
