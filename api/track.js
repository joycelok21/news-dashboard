const { google } = require('googleapis');

const SHEET_ID = '1GHoFp6xAK4JQ-EtgP6asO6HcqLkCIdB9OWOqg-BgSLg';
const ANALYTICS_TAB = 'Analytics';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { visitorId, sessionId, event, detail, duration } = req.body || {};

    if (!visitorId || !sessionId || !event) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set');

    const cleaned = raw.trim().replace(/^﻿/, '').replace(/^['"`]|['"`]$/g, '').trim();
    const credentials = JSON.parse(cleaned);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);
    const date = now.toISOString().slice(0, 10);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${ANALYTICS_TAB}!A:G`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          timestamp,
          date,
          String(visitorId).slice(0, 36),
          String(sessionId).slice(0, 36),
          String(event).slice(0, 32),
          String(detail || '').slice(0, 64),
          duration != null ? Math.round(Number(duration)) : '',
        ]],
      },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Track error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
