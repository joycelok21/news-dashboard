const { google } = require('googleapis');

const SHEET_ID = '1GHoFp6xAK4JQ-EtgP6asO6HcqLkCIdB9OWOqg-BgSLg';

const CATEGORIES = [
  'Macro', 'Tech/Innovation', 'Geopolitics', 'Company', 'Crypto',
  'Commodities', 'Industry', 'Outside US', 'Watchlist', 'Energy', 'Supply Chain',
];

const CATEGORY_CANONICAL = {
  'macro': 'Macro',
  'fixed income': 'Macro',
  'bonds': 'Macro',
  'tech/innovation': 'Tech/Innovation',
  'tech': 'Tech/Innovation',
  'technology': 'Tech/Innovation',
  'innovation': 'Tech/Innovation',
  'geopolitics': 'Geopolitics',
  'geopolitical': 'Geopolitics',
  'company': 'Company',
  'earnings': 'Company',
  'equities': 'Company',
  'equity': 'Company',
  'crypto': 'Crypto',
  'cryptocurrency': 'Crypto',
  'digital assets': 'Crypto',
  'commodities': 'Commodities',
  'commodity': 'Commodities',
  'industry': 'Industry',
  'outside us': 'Outside US',
  'outside the us': 'Outside US',
  'international': 'Outside US',
  'watchlist': 'Watchlist',
  'energy': 'Energy',
  'oil': 'Energy',
  'supply chain': 'Supply Chain',
  'supply chains': 'Supply Chain',
};

function normalizeCategory(s) {
  if (!s) return null;
  return CATEGORY_CANONICAL[s.toLowerCase().trim()] || null;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function normalizeSentiment(s) {
  if (!s) return 'neutral';
  const l = s.toLowerCase().trim();
  if (l.includes('bull')) return 'bull';
  if (l.includes('bear')) return 'bear';
  if (l.includes('mix')) return 'mixed';
  return 'neutral';
}

function parsePriority(p) {
  const n = parseInt(p);
  if (n === 1) return 'P1';
  if (n === 2) return 'P2';
  return 'P3';
}

function extractDateKey(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function extractHour(s) {
  if (s == null || s === '') return 9;
  if (typeof s === 'number') return Math.floor((s % 1) * 24);
  const m = String(s).trim().match(/[T\s](\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) : 9;
}

function extractTime(s) {
  if (s == null || s === '') return '09:00';
  if (typeof s === 'number') {
    const totalMins = Math.round((s % 1) * 1440);
    const h = Math.floor(totalMins / 60) % 24;
    const mn = totalMins % 60;
    return String(h).padStart(2, '0') + ':' + String(mn).padStart(2, '0');
  }
  const m = String(s).trim().match(/[T\s](\d{1,2}):(\d{2})/);
  if (m) return m[1].padStart(2, '0') + ':' + m[2];
  return '09:00';
}

function splitList(s) {
  if (!s) return [];
  return String(s).split(/[,;]+/).map(x => x.trim()).filter(Boolean);
}

function formatDateLabel(dateKey) {
  const [year, month, day] = dateKey.split('-');
  return `${parseInt(day)} ${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
}

function formatDateShort(dateKey) {
  const [, month, day] = dateKey.split('-');
  return `${parseInt(day)} ${MONTH_NAMES[parseInt(month) - 1]}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set');

    // Strip BOM, surrounding whitespace, and accidental wrapping quotes
    const cleaned = raw.trim().replace(/^﻿/, '').replace(/^['"`]|['"`]$/g, '').trim();
    const credentials = JSON.parse(cleaned);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const [newsRes, summaryRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'All Filtered News!A:N',
        valueRenderOption: 'FORMATTED_VALUE',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Market Summary!A:H',
        valueRenderOption: 'FORMATTED_VALUE',
      }),
    ]);

    const newsRows = (newsRes.data.values || []).slice(1).filter(r => r && r[3]);
    const summaryRows = (summaryRes.data.values || []).slice(1).filter(r => r && (r[2] || r[6]));

    // Build articles by date
    const articlesByDate = {};
    newsRows.forEach((row, idx) => {
      const [timestamp, date, source, headline, url, priority, summary,
             categories, mentionedTickers, affectedTickers, relatedEtfs, sentiment, implications,
             matchedProfiles] = row;

      const dateKey = extractDateKey(date) || extractDateKey(timestamp);
      if (!dateKey) return;

      if (!articlesByDate[dateKey]) articlesByDate[dateKey] = [];

      const tickers = [...new Set([
        ...splitList(mentionedTickers),
        ...splitList(affectedTickers),
        ...splitList(relatedEtfs),
      ])].slice(0, 6);

      articlesByDate[dateKey].push({
        id: `${dateKey}-${idx}`,
        hr: extractHour(date),
        time: extractTime(date),
        source: (source || '').trim(),
        cats: [...new Set([
          ...splitList(categories),
          ...splitList(matchedProfiles),
        ].map(normalizeCategory).filter(Boolean))],
        priority: parsePriority(priority),
        sentiment: normalizeSentiment(sentiment),
        headline: (headline || '').trim(),
        summary: (summary || '').trim(),
        tickers,
        implication: (implications || '').trim(),
        url: (url || '').trim(),
      });
    });

    // Build summaries by date
    const summaryByDate = {};
    summaryRows.forEach(row => {
      const [runTimestamp, date, summary, secondOrder, totalArticles,
             dominantSentiment, keyThemes] = row;

      const dateKey = extractDateKey(date) || extractDateKey(runTimestamp);
      if (!dateKey) return;

      summaryByDate[dateKey] = {
        body: (summary || '').trim(),
        secondOrder: (secondOrder || '').trim(),
        themes: splitList(keyThemes),
        mood: normalizeSentiment(dominantSentiment),
        totalFromSheet: parseInt(totalArticles) || 0,
        refreshedRaw: String(runTimestamp || date),
      };
    });

    // Get last 5 dates, newest first
    const allDates = [...new Set([
      ...Object.keys(articlesByDate),
      ...Object.keys(summaryByDate),
    ])].sort().reverse().slice(0, 5);

    const days = allDates.map((dateKey, i) => {
      const articles = (articlesByDate[dateKey] || [])
        .sort((a, b) => a.hr - b.hr || b.time.localeCompare(a.time));
      const sm = summaryByDate[dateKey] || {};

      const mood = sm.mood || (() => {
        const bull = articles.filter(a => a.sentiment === 'bull').length;
        const bear = articles.filter(a => a.sentiment === 'bear').length;
        if (bull > bear) return 'bull';
        if (bear > bull) return 'bear';
        return 'mixed';
      })();

      // Count how many articles each ticker appears in (deduplicated per article),
      // then rank by frequency and take the top 14
      const tickerCounts = {};
      articles.forEach(a => {
        a.tickers.forEach(t => {
          tickerCounts[t] = (tickerCounts[t] || 0) + 1;
        });
      });
      const allTickers = Object.entries(tickerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 14)
        .map(([t]) => t);

      const p12 = articles.filter(a => a.priority === 'P1' || a.priority === 'P2').length;
      const sources = new Set(articles.map(a => a.source)).size;

      let refreshed = i === 0 ? 'today' : i === 1 ? 'yesterday' : `${i} days ago`;
      if (sm.refreshedRaw) {
        const t = extractTime(sm.refreshedRaw);
        if (t !== '09:00') refreshed += `, ${t}`;
      }

      // If Key Themes column is blank, fall back to this day's article categories
      const digestThemes = (sm.themes && sm.themes.length > 0)
        ? sm.themes
        : [...new Set(articles.flatMap(a => a.cats))].slice(0, 8);

      return {
        date: formatDateLabel(dateKey),
        dateShort: formatDateShort(dateKey),
        dateKey,
        refreshed,
        mood,
        digest: {
          body: sm.body || '',
          secondOrder: sm.secondOrder || '',
          themes: digestThemes,
        },
        tickers: allTickers,
        stats: {
          p12,
          total: articles.length,
          sources,
        },
        articles,
      };
    });

    // Aggregate Key Themes from Market Summary across all days (no fallback to categories)
    const weekThemeCounts = {};
    days.forEach(day => {
      const sm = summaryByDate[day.dateKey];
      if (sm && sm.themes && sm.themes.length > 0) {
        sm.themes.forEach(t => {
          weekThemeCounts[t] = (weekThemeCounts[t] || 0) + 1;
        });
      }
    });
    const weekThemes = Object.entries(weekThemeCounts).sort((a, b) => b[1] - a[1]);

    const today = days[0] || {
      date: '', dateShort: '', dateKey: '', refreshed: '',
      mood: 'neutral',
      digest: { body: '', secondOrder: '', themes: [] },
      tickers: [], stats: { p12: 0, total: 0, sources: 0 }, articles: [],
    };

    return res.status(200).json({
      ...today,
      categories: CATEGORIES,
      days,
      todayKey: today.dateKey,
      weekThemes,
    });

  } catch (err) {
    console.error('Sheet fetch error:', err);
    return res.status(500).json({ error: err.message });
  }
};
