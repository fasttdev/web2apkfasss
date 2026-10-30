import gplayModule from 'google-play-scraper';
import { sendJson, errorMessage } from './_lib.js';

const gplay = gplayModule.default || gplayModule;

function formatApp(app) {
  if (!app) return null;
  const appId = app.appId || '';
  return {
    title: app.title || '',
    appId,
    url: app.url || `https://play.google.com/store/apps/details?id=${appId}`,
    links: {
      playStore: `https://play.google.com/store/apps/details?id=${appId}`,
      market: `market://details?id=${appId}`,
      apkCombo: `https://apkcombo.com/app/${appId}/download/apk`,
      apkPure: `https://apkpure.com/p/${appId}`
    },
    developer: {
      name: app.developer || '',
      id: app.developerId || '',
      email: app.developerEmail || null,
      website: app.developerWebsite || null,
      address: app.developerAddress || null
    },
    score: app.score || 0,
    scoreText: app.scoreText || String(app.score || '0'),
    ratings: app.ratings || 0,
    reviews: app.reviews || 0,
    installs: app.installs || '0+',
    price: app.price || 0,
    free: !!app.free,
    currency: app.currency || 'USD',
    priceText: app.priceText || (app.free ? 'Gratis' : `${app.price}`),
    genre: app.genre || '',
    genreId: app.genreId || '',
    icon: app.icon || '',
    headerImage: app.headerImage || '',
    screenshots: Array.isArray(app.screenshots) ? app.screenshots : [],
    version: app.version || 'Varies with device',
    size: app.size || null,
    updated: safeDate(app.updated),
    released: app.released || null,
    contentRating: app.contentRating || '',
    summary: app.summary || '',
    description: app.description || '',
    recentChanges: app.recentChanges || ''
  };
}

function safeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { status: false, error: 'Method not allowed' });

  const { action, query, appId } = req.body || {};

  try {
    if (action === 'search') {
      if (!query) return sendJson(res, 400, { status: false, error: 'Query wajib diisi.' });
      const results = await gplay.search({ term: String(query).slice(0, 100), num: 12, lang: 'id', country: 'id', fullDetail: false });
      const apps = results.map(formatApp).filter(Boolean);
      return sendJson(res, 200, { status: true, query, total: apps.length, results: apps });
    }
    if (action === 'detail') {
      if (!appId) return sendJson(res, 400, { status: false, error: 'App ID wajib diisi.' });
      let clean = String(appId).trim();
      const m = clean.match(/[?&]id=([a-zA-Z0-9._]+)/i);
      if (m) clean = m[1];
      if (!/^[a-zA-Z0-9._]{2,200}$/.test(clean)) return sendJson(res, 400, { status: false, error: 'App ID tidak valid.' });
      const rawApp = await gplay.app({ appId: clean, lang: 'id', country: 'id' });
      return sendJson(res, 200, { status: true, data: formatApp(rawApp) });
    }
    return sendJson(res, 400, { status: false, error: 'Action tidak valid.' });
  } catch (err) {
    return sendJson(res, 500, { status: false, error: errorMessage(err, 'Gagal mengambil data Play Store.') });
  }
}