/* ============================================================
   HYPNOSCOUT — Clash Royale API proxy
   ------------------------------------------------------------
   The official Clash Royale API cannot be called from the
   browser: it requires a secret bearer token and it whitelists
   requests by server IP (browsers are blocked by CORS anyway).
   This Express server holds your token and forwards a small set
   of safe, read-only endpoints to the frontend.

   Run:  npm install  &&  npm start
   Docs: see README.md in this folder.
   ============================================================ */

const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8787;
const TOKEN = process.env.CR_API_TOKEN;
const CR_BASE = "https://api.clashroyale.com/v1";

if (!TOKEN) {
  console.warn("\n⚠️  CR_API_TOKEN is not set. Copy .env.example to .env and add your key.");
  console.warn("   Until then the frontend will show demo data.\n");
}

/* --- CORS (allow the static frontend to call this proxy) --- */
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.ALLOW_ORIGIN || "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* --- Helper: call the Clash Royale API --- */
async function cr(path) {
  const res = await fetch(CR_BASE + path, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// Clash Royale tags start with '#', which must be encoded as %23.
const normTag = (t) => "%23" + decodeURIComponent(String(t)).replace(/^#/, "").toUpperCase();

/* --- Tiny in-memory cache (protects your rate limit) --- */
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

/* --- Routes --- */
app.get("/api/health", (req, res) => res.json({ ok: true, hasToken: !!TOKEN }));

app.get("/api/player/:tag", async (req, res) => {
  try {
    const { status, body } = await cr(`/players/${normTag(req.params.tag)}`);
    res.status(status).json(body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

app.get("/api/player/:tag/battlelog", async (req, res) => {
  try {
    const { status, body } = await cr(`/players/${normTag(req.params.tag)}/battlelog`);
    res.status(status).json(body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

app.get("/api/clan/:tag", async (req, res) => {
  try {
    const { status, body } = await cr(`/clans/${normTag(req.params.tag)}`);
    res.status(status).json(body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

// Search clans by NAME (the API supports this for clans, not players)
app.get("/api/clans/search", async (req, res) => {
  try {
    const name = encodeURIComponent(String(req.query.name || "").trim());
    if (name.length < 3) return res.json({ items: [] });
    const { status, body } = await cr(`/clans?name=${name}&limit=20`);
    res.status(status).json(body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

// Trophy Road / global trophy rankings
app.get("/api/rankings/global", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const loc = req.query.location || "global";
    const { status, body } = await cr(`/locations/${loc}/rankings/players?limit=${limit}`);
    res.status(status).json(body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

// Path of Legends (Nihai Kademe) ranked ladder — seasonal
app.get("/api/rankings/pathoflegend", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const loc = req.query.location || "global";
    const { status, body } = await cr(`/locations/${loc}/pathoflegend/players?limit=${limit}`);
    res.status(status).json(body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

// Clan trophy rankings
app.get("/api/rankings/clans", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const loc = req.query.location || "global";
    const { status, body } = await cr(`/locations/${loc}/rankings/clans?limit=${limit}`);
    res.status(status).json(body);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

app.get("/api/cards", async (req, res) => {
  try {
    const data = await cached("cards", 3600e3, async () => (await cr(`/cards`)).body);
    res.json(data);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Real current-season META, derived from the official API:
  take the current Path of Legends top players, read each one's
  currentDeck, and rank decks by how many top players run them.
  This reflects the live meta (no third-party meta site needed).
  Cached ~15 min.
*/
app.get("/api/meta", async (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.players) || 40, 60);
    const data = await cached(`meta:${count}`, 900e3, async () => {
      const top = await cr(`/locations/global/pathoflegend/players?limit=${count}`);
      const players = (top.body.items || []).slice(0, count);
      const decks = await Promise.all(players.map(async (p) => {
        try { return (await cr(`/players/${normTag(p.tag)}`)).body.currentDeck || []; }
        catch { return []; }
      }));
      const map = new Map();
      decks.forEach((dk) => {
        if (!Array.isArray(dk) || dk.length !== 8) return;
        const key = dk.map((c) => c.id).sort((a, b) => a - b).join(",");
        const rec = map.get(key) || { count: 0, cards: dk };
        rec.count++; map.set(key, rec);
      });
      const total = [...map.values()].reduce((a, r) => a + r.count, 0) || 1;
      const items = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 12).map((r) => ({
        usage: +(r.count / total * 100).toFixed(1),
        count: r.count,
        cards: r.cards.map((c) => ({
          id: c.id, name: c.name, elixir: c.elixirCost,
          icon: c.iconUrls?.medium, evoIcon: c.iconUrls?.evolutionMedium,
          evo: !!(c.evolutionLevel), champion: c.maxLevel === 3 || c.rarity === "champion",
        })),
      }));
      return { items, sampled: total };
    });
    res.json(data);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Global "Son Maçlar" feed. The Clash Royale API has no single
  global battle stream, so we aggregate: take the current Path of
  Legends top players and merge their most recent battles into one
  reverse-chronological feed. Cached ~45s to stay well under the
  rate limit.
*/
app.get("/api/live", async (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.players) || 12, 25);
    const feed = await cached(`live:${count}`, 45e3, async () => {
      const top = await cr(`/locations/global/pathoflegend/players?limit=${count}`);
      const players = (top.body.items || []).slice(0, count);
      const logs = await Promise.all(players.map(async (p) => {
        try { return (await cr(`/players/${normTag(p.tag)}/battlelog`)).body || []; }
        catch { return []; }
      }));
      const battles = [];
      logs.forEach((log) => { if (Array.isArray(log) && log[0]) battles.push(log[0]); });
      // newest first by battleTime (format: 20240101T120000.000Z)
      battles.sort((a, b) => (b.battleTime || "").localeCompare(a.battleTime || ""));
      return { items: battles.slice(0, 20) };
    });
    res.json(feed);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

/*
  Latest YouTube uploads for the HYPNOSCOUT channel, via the
  public RSS feed (no API key needed). Parsed server-side so the
  browser isn't blocked by CORS/robots. Cached ~10 min.
*/
function decodeXml(s){
  return String(s||"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#x27;/g,"'");
}
app.get("/api/youtube", async (req, res) => {
  try {
    const id = process.env.YT_CHANNEL_ID || req.query.channel_id;
    if (!id) return res.status(400).json({ error: "no_channel" });
    const data = await cached("yt:" + id, 600e3, async () => {
      const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: { "User-Agent": "Mozilla/5.0 (HYPNOSCOUT)" } });
      const xml = await r.text();
      const items = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 8).map((m) => {
        const e = m[1];
        const g = (re) => (e.match(re) || [])[1];
        const vid = g(/<yt:videoId>(.*?)<\/yt:videoId>/);
        return {
          videoId: vid,
          title: decodeXml(g(/<title>([\s\S]*?)<\/title>/)),
          published: g(/<published>(.*?)<\/published>/),
          thumb: g(/<media:thumbnail url="(.*?)"/) || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : ""),
          views: g(/<media:statistics views="(.*?)"/),
          url: vid ? `https://www.youtube.com/watch?v=${vid}` : "",
        };
      });
      return { items };
    });
    res.json(data);
  } catch (e) { res.status(502).json({ error: "upstream_error", detail: String(e) }); }
});

// Serve the static site (one command runs the whole thing, same-origin = LIVE)
app.use(express.static(path.join(__dirname, "..")));

app.listen(PORT, () => {
  console.log(`\n🔨  HYPNOSCOUT çalışıyor → http://localhost:${PORT}`);
  console.log(`    Site:   http://localhost:${PORT}/index.html`);
  console.log(`    API:    http://localhost:${PORT}/api/health`);
  console.log(`    ${TOKEN ? "✅ API anahtarı yüklü — veriler CANLI." : "⚠️  API anahtarı yok — demo veri gösterilir."}\n`);
});
