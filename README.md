# 🔨 HYPNOSCOUT — Clash Royale Analiz Platformu

> ⚠️ **Güvenlik:** `server/.env` içinde gerçek bir Clash Royale API anahtarı var.
> Bu anahtar bir sohbete yapıştırıldıysa **sızmış** kabul edilmeli — üretim öncesi
> <https://developer.clashroyale.com> üzerinden **yenileyin**. Anahtar yalnızca
> **88.234.230.133** IP'si için geçerlidir; proxy o IP'den çalışmalıdır. `.env`
> dosyasını **asla** git'e commit etmeyin (`.gitignore` ile dışlanmıştır).


Clean, white-based Clash Royale statistics site (Turkish UI) with blue + gold
accents, dark mode, TR/EN language toggle, live search, and a random meta-deck
generator with a spinning wheel. Data is pulled from the official **Clash Royale
API** through a small Node proxy, and gracefully **falls back to realistic demo
data** whenever the proxy is not running — so every page looks complete the
moment you open it.

## What's inside

```
hypnoscout/
├── index.html            # Ana Sayfa (hero, meta decks, player/clan panels, rankings, deck generator + wheel)
├── siralamalar.html      # Global sıralamalar (top 100, searchable, clickable profiles)
├── klan.html             # Klan arama sonuçları (image_3-style member table)
├── oyuncu.html           # Oyuncu profili (battles, card levels + MAX, trophy graph, evolution)
├── meta.html             # Meta desteleri kütüphanesi
├── kartlar.html          # Kartlar (rarity filters)
├── guncellemeler.html    # Güncellemeler
├── assets/
│   ├── css/styles.css    # Shared theme (light/dark)
│   └── js/
│       ├── app.js        # Theme, i18n, API client (+ demo fallback), render helpers
│       └── data.js       # Demo data (cards, decks, players, clans)
└── server/               # Node/Express proxy that holds your API key
    ├── server.js
    ├── package.json
    └── .env.example
```

## ⭐ EN ÖNEMLİ: Verilerin CANLI olması için (tek komut)

"Demo veri" yazıyorsa **proxy çalışmıyordur**. Resmi Clash Royale API tarayıcıdan
çağrılamaz (CORS + IP kısıtı), bu yüzden gerçek veriler ancak Node sunucusu
**senin IP'nde** (88.234.230.133) çalışınca gelir. Artık sunucu **hem siteyi hem
API'yi aynı adresten** sunuyor — tek komut yeter:

```bash
cd hypnoscout/server
npm install
npm start
```

Sonra tarayıcıda **http://localhost:8787** aç. Aynı origin olduğu için
oyuncu/klan arama, sıralamalar, canlı maçlar, meta ve videolar **CANLI** gelir;
durum rozeti **"Canlı API"** olur. Anahtar `server/.env` içinde hazır.

> Not: Anahtar yalnızca **88.234.230.133** IP'sine tanımlı. Sunucuyu o
> bilgisayarda/IP'de çalıştırmazsan Supercell istekleri reddeder ve site demo
> veriye düşer. Farklı yerde çalıştıracaksan developer.clashroyale.com'dan
> kendi IP'ni ekle veya yeni anahtar al.

### Sadece görünümü denemek (demo, sunucusuz)
Herhangi bir statik sunucuyla klasörü aç (veriler demo olur):
```bash
cd hypnoscout && python3 -m http.server 5500   # http://localhost:5500
```

## 2) Go live with the real Clash Royale API

The official API **cannot be called from the browser** — it needs a secret
token and whitelists requests by **server IP**. The included proxy handles both.

**a. Get an API token**
1. Sign in at <https://developer.clashroyale.com>.
2. Create a new **Key**. It asks for the **IP address(es)** allowed to use it.
   - For local testing, enter the public IP the proxy will run from
     (search "what is my ip"). If your IP changes, update the key.
   - For production, use your server's static IP.
3. Copy the long token it generates.

**b. Configure & start the proxy**
```bash
cd hypnoscout/server
cp .env.example .env          # then paste your token into CR_API_TOKEN
npm install
npm start                     # → http://localhost:8787/api
```
Check it: open <http://localhost:8787/api/health> → `{ "ok": true, "hasToken": true }`.

**c. Point the frontend at the proxy**
The frontend defaults to `http://localhost:8787/api`. To change it (e.g. a
deployed proxy URL), set a global before `app.js` loads, or edit `API_BASE`
in `assets/js/app.js`:

```html
<script>window.HYPNOSCOUT_API_BASE = "https://your-proxy.example.com/api";</script>
```

Reload the site — the status pill flips to **"Canlı API"** and the tables,
profiles and rankings now show live data. If the proxy is ever unreachable,
the site silently reverts to demo data.

### Endpoints the proxy exposes
| Frontend call                   | Clash Royale API / source                              |
|---------------------------------|--------------------------------------------------------|
| `/api/player/:tag`              | `/players/%23TAG`                                      |
| `/api/player/:tag/battlelog`    | `/players/%23TAG/battlelog`                            |
| `/api/clan/:tag`                | `/clans/%23TAG`                                         |
| `/api/rankings/pathoflegend`    | `/locations/global/pathoflegend/players?limit=100`     |
| `/api/rankings/global`          | `/locations/global/rankings/players?limit=100` (Kupa Yolu) |
| `/api/rankings/clans`           | `/locations/global/rankings/clans?limit=100`           |
| `/api/live`                     | aggregated PoL top players' latest battles             |
| `/api/youtube`                  | YouTube RSS feed for `YT_CHANNEL_ID` (no key needed)   |
| `/api/cards`                    | `/cards`                                                |
| `/api/health`                   | (proxy status)                                          |

Tags may be entered with or without the leading `#` — the proxy encodes it.
The proxy caches `/api/cards` (1h), `/api/live` (~45s) and `/api/youtube` (10m)
to protect your rate limit.

## Pages
- `index.html` — home: meta decks, RoyalAPI-style player dashboard, **top players +
  top clans** leaderboard cards, the fixed deck **wheel** (random meta each spin,
  result **modal** with in-game `copyDeck` link + gameplay tip), and **Son Videolar**.
- `siralamalar.html` — **Nihai Kademe (PoL)** vs **Kupa Yolu** tabs, top 100
  **paginated 20 per page**, per-row active-deck icons, searchable.
- `klanlar.html` — clan leaderboard, paginated 20/page.
- `canli.html` — **Global Son Maçlar**: P1 vs P2, clans/trophies, crown score +
  winner, both 8-card decks with evolution frames.
- `oyuncu.html` — RoyaleAPI-style profile: PoL rating/rank, Trophy Road, records,
  card collection, and a battle log showing both players' decks + elixir averages.
- `klan.html` · `meta.html` · `kartlar.html` · `guncellemeler.html`.

## Yenilikler (bu sürüm)
- **Sade & nötr tema** — beyaz/açık zemin, mavi vurgular (sarı-lacivert kaldırıldı).
- **Gerçek logo** — HYPNOS CR tokmak logosu header'da ve ana sayfada saydam watermark.
- **Hamburger menü (☰)** — her yerden erişim: oyuncu/klan arama, tüm liderlik
  tabloları, sayfalar ve **🎉 Eğlence** bölümü.
- **Eğlence** (`eglence.html`) — TikTok akımı tarzı **Kart Sıralama Oyunu**,
  **Rastgele Meta Deste Çarkı** ve "Yakında" gelecek oyunlar.
- **Canlı META** — `/api/meta` zirve oyuncuların gerçek destelerinden meta çıkarır;
  kartlarda **evrim/kahraman görselleri** kullanılır (canlı API'de `evolutionMedium`).
- **Kartlar** — canlı `/api/cards` ile tüm kartlar; karta tıkla → o kartın
  kullanıldığı meta desteleri.
- **Güncellemeler** artık **site changelog'u** (oyun değil, site yenilikleri).
- Footer'da **Tasarım & Geliştirme: Ahmet Maksut Gürsu**.

## Features
- **Random deck wheel** — clean radial slice labels, fresh random meta each spin,
  result modal with `clashroyale://copyDeck?deck=...` link (built from real card
  ids) and a Turkish gameplay tip.
- **Son Videolar** — pulls the latest uploads from **@hypnoscr** via the proxy's
  YouTube RSS endpoint, shows relative time ("9 saat önce") and links to each video.
- **Social** — Instagram (`muhsin_ucaa`) and YouTube (`@hypnoscr`) links in the
  footer and the videos section.
- **Responsive** — desktop grid/dashboard, mobile single-column with a bottom nav.
- **Dark/Light** + **TR/EN** toggles (saved in the browser).

## Notes
- Card art loads from the RoyalAPI public CDN; if an image can't load, a clean
  styled name tile is shown instead. With the live API connected, `iconUrls`
  from Supercell are used directly (wire them into `renderCard` if you prefer).
- Data and images belong to Supercell / the Clash Royale API. This is a
  fan-made analytics tool and is not affiliated with Supercell.
