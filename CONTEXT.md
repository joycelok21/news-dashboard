# News Dashboard — Project Context

Use this document to resume development in a new chat. Paste it in full at the start of your session.

---

## What This Project Is

A live financial news dashboard for Beyond Insights internal use. It pulls data from a Google Sheet, processes it through a Vercel serverless function, and renders a React single-page app. The dashboard is password-protected and shows filtered, categorised market news with AI-generated digests.

**Live URL:** https://news-dashboard-three-jet.vercel.app  
**Password:** `bianalyst-ok` (stored in localStorage key `mi-auth`)  
**Local project path:** `/Users/joycelok/Documents/GitHub/news-dashboard/`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Babel (CDN, no build step) — single `index.html` |
| Backend | Vercel serverless function (`api/data.js`) |
| Data source | Google Sheets API v4 via Service Account |
| Hosting | Vercel (project: `news-dashboard` under `joycelok-6751s-projects`) |
| Auth | `localStorage` — `mi-auth = 'bianalyst-ok'` |
| Deploy command | `npx vercel --prod` from project root |
| Force deploy | `npx vercel --prod --force` (use when concurrent deploys conflict) |

---

## File Structure

```
news-dashboard/
├── index.html          # Entire frontend — all React components, styles, tokens
├── api/
│   └── data.js         # Vercel serverless function — reads Google Sheets, returns JSON
├── package.json
└── CONTEXT.md          # This file
```

---

## Google Sheet Structure

**Sheet ID:** `1GHoFp6xAK4JQ-EtgP6asO6HcqLkCIdB9OWOqg-BgSLg`

### Tab: `All Filtered News` (range `A:N`)

| Col | Field |
|---|---|
| A | Run Timestamp |
| B | Date |
| C | Source |
| D | Headline |
| E | URL |
| F | Priority (1/2/3) |
| G | Summary |
| H | Categories |
| I | Mentioned Tickers |
| J | Affected Tickers |
| K | Related ETFs |
| L | Sentiment |
| M | Implications |
| N | Matched Profiles |

### Tab: `Market Summary` (range `A:H`)

| Col | Field |
|---|---|
| A | Run Timestamp |
| B | Date |
| C | Summary (Market Digest body) |
| D | Second Order Impacts |
| E | Total Articles |
| F | Dominant Sentiment |
| G | Key Themes (comma-separated) |
| H | Trading Brief |

---

## API Response Shape (`/api/data`)

```js
{
  // Today's data (spread from days[0])
  date, dateShort, dateKey, refreshed, mood,
  digest: { body, secondOrder, tradingBrief, themes },
  tickers: [...],          // top 14 by cross-article frequency
  stats: { p12, total, sources },
  articles: [...],

  // All days
  categories: [...],       // 11 canonical category names
  days: [                  // last 5 days, newest first
    {
      date, dateShort, dateKey, refreshed, mood,
      digest: { body, secondOrder, tradingBrief, themes },
      tickers, stats, articles
    }
  ],
  todayKey: '2026-05-22',
  weekThemes: [['theme name', count], ...]  // aggregated from Market Summary col G
}
```

### Per-article shape

```js
{
  id, hr, time, source,
  cats: [...],             // normalised category names
  priority: 'P1'|'P2'|'P3',
  sentiment: 'bull'|'bear'|'mixed'|'neutral',
  headline, summary, implication, url,
  tickers: [...]           // merged cols I+J+K, deduped per article, max 6
}
```

---

## Caching Behaviour

- Default (page load): `s-maxage=300, stale-while-revalidate=600` — CDN caches for 5 minutes
- Manual refresh button: fetches `/api/data?t=<timestamp>` — bypasses CDN cache entirely, always hits Google Sheets live

---

## Component Architecture (`index.html`)

```
App
├── PasswordGate          (position:fixed overlay until auth)
├── DashboardShell        (tab row + search bar + theme toggle + refresh)
│   ├── HifiOverview      (5-day view)
│   │   ├── day cards     (digest snippet + trading brief snippet per day)
│   │   ├── mood trajectory chart
│   │   ├── 5-day activity heatmap (click cell → navigate to day with category filter)
│   │   ├── top P1 stories
│   │   ├── top tickers (5-day)
│   │   └── themes of the week (tag cloud)
│   └── HifiDesktop       (single day view)
│       ├── FilterRow     (fixed — category pills + P1/P2/P3 + Bull/Bear/Mix)
│       ├── ActiveFilters (chips for each active filter, clear individually or all)
│       ├── DigestBanner  (collapsible, 3-tab: Market Brief | Second Order | Trading Brief)
│       ├── ArticleCard feed (hourly groups, latest first within each hour)
│       └── Right sidebar (280px)
│           ├── Tickers in News
│           ├── Past Digests
│           ├── Heatmap (category × hour, click to filter)
│           └── Today's Run stats
└── HifiMobile            (separate mobile layout, same data)
```

---

## Filter System

All filters support **multi-select** — multiple values can be active simultaneously.

| Filter | Type | State |
|---|---|---|
| Category | `Set<string>` | `cat` |
| Priority | `Set<string>` | `prio` |
| Sentiment | `Set<string>` | `sent` |
| Ticker | `string\|null` | `ticker` (single — click sidebar) |
| Time bucket | `number\|null` | `bucket` (0–5, set only via heatmap) |
| Search | `string` | `searchQ` (lifted to App level, persists across tab switches) |

**Filter logic:** articles must pass ALL active filter types (AND between types), but within a type any match qualifies (OR within type). Example: P1+P2 selected = show P1 OR P2 articles.

**Heatmap click:** sets `bucket` (4-hour window) AND replaces `cat` with exactly that one category. Clicking the same cell again clears both.

**`initialCat` prop:** when navigating from the Overview heatmap, `HifiDesktop` receives `initialCat` which seeds the `cat` Set on mount.

**Search** is lifted to `App` state (`searchQ`) and persists when switching day tabs and the Overview tab.

---

## Key Design Tokens (`window.HF.tokens`)

The design token object `T` is accessed via `window.HF.tokens` inside every component. Key tokens:

```js
T.paper        // main background
T.surface      // card/section background
T.paperAlt     // alternate background (implication pull-quotes)
T.ink0–ink4    // text hierarchy (0 = darkest)
T.accent       // primary accent (blue)
T.accentSub    // light tint of accent (filter chip backgrounds)
T.rule / T.rule2  // border colours
T.bull / T.bear / T.mixed / T.neutral  // sentiment colours
T.p1           // P1 priority colour
T.fontDisplay  // serif display font
T.fontSans     // sans-serif body font
T.fontMono     // monospace
```

Light/dark theme is toggled via `data-theme` on `<html>` and stored in `localStorage` key `mi-theme`.

---

## Category System

11 canonical categories: `Macro`, `Tech/Innovation`, `Geopolitics`, `Company`, `Crypto`, `Commodities`, `Industry`, `Outside US`, `Watchlist`, `Energy`, `Supply Chain`

The `CATEGORY_CANONICAL` map in `api/data.js` normalises aliases (e.g. `'bonds' → 'Macro'`, `'earnings' → 'Company'`) from both the Categories column and the Matched Profiles column.

---

## Themes of the Week Logic

- Source: Key Themes from Market Summary column G (comma-separated strings per day)
- Aggregation: count how many of the 5 days each theme appears across (`weekThemeCounts`)
- Returns: `weekThemes: [[theme, count], ...]` sorted by count descending
- Display: tag cloud in HifiOverview — font size 11–22px, weight 400–700, colour ink3→ink0, all scale with frequency. No numbers shown.
- Fallback (per-day digest themes only): if Market Summary Key Themes is blank, falls back to article category names for that day's digest themes (not for weekThemes)

---

## DigestBanner Tabs

The DigestBanner (shown at the top of the article feed, collapsible) has three tabs:

| Tab | Source field | Display style |
|---|---|---|
| Market Brief | `digest.body` | Lead sentence as pull-quote + bullets |
| Second Order | `digest.secondOrder` | Bullets only |
| Trading Brief | `digest.tradingBrief` | Lead sentence as pull-quote + bullets |

A small dot appears on the Trading Brief tab when it has content but is not the active tab.

---

## Recent Changes Made (this session)

1. Multi-select filters — prio, sent, cat all changed from single value to `Set`
2. Search persists across tab switches (removed `setSearchQ('')` from `handleTabSelect`)
3. Themes of the Week — reads from Market Summary col G via new `weekThemes` field in API
4. Market Summary column mapping fixed — Top Tickers column was removed; Dominant Sentiment is now col F, Key Themes col G, Trading Brief col H
5. Trading Brief — added as third tab in DigestBanner + snippet in Overview day cards
6. Manual refresh cache-busting — refresh button fetches `?t=<timestamp>`, bypasses CDN
7. CDN cache reduced from 1 hour to 5 minutes (`s-maxage=300`)

---

## Deployment

```bash
cd /Users/joycelok/Documents/GitHub/news-dashboard

# Normal deploy
npx vercel --prod

# Force deploy (if concurrent conflict)
npx vercel --prod --force
```

Always `git add` and `git commit` before deploying so changes are tracked.

**Env var required on Vercel:** `GOOGLE_SERVICE_ACCOUNT_JSON` — the full JSON string of the Google Service Account credentials (with Sheets read access to the spreadsheet above).

---

## Known Pending Items

- None confirmed. Verify Trading Brief is populating correctly from column H once new data runs appear in the sheet.
