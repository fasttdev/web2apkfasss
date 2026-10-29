// api/search.js
import * as cheerio from 'cheerio';
import { requireUser } from './_auth.js';
import { sendJson, errorMessage } from './_lib.js';
import { checkRateLimit, rateLimitMiddleware } from './_rate-limit.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  let auth;
  try { auth = await requireUser(req); }
  catch (err) { return sendJson(res, err.status || 401, { error: err.message }); }

  if (await rateLimitMiddleware(res, await checkRateLimit(auth.user.uid, 'search', 30, 3600))) return;

  const { query, type } = req.body || {};
  if (!query || typeof query !== 'string') return sendJson(res, 400, { error: 'Query wajib diisi.' });

  const cleanQuery = query.trim().slice(0, 200);
  const mode = type === 'image' ? 'image' : 'text';
  const headers = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' };

  try {
    if (mode === 'image') {
      const url = `https://www.bing.com/images/search?q=${encodeURIComponent(cleanQuery)}`;
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      const html = await response.text();
      const $ = cheerio.load(html);
      const results = [];
      $('a.iusc').each((i, el) => {
        const m = $(el).attr('m');
        if (m) { try { const p = JSON.parse(m); if (p.murl && /^https?:\/\//.test(p.murl)) results.push(p.murl); } catch (_) {} }
      });
      return sendJson(res, 200, { results: [...new Set(results)].slice(0, 24) });
    } else {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(cleanQuery)}`;
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      const html = await response.text();
      const $ = cheerio.load(html);
      const results = [];
      $('li.b_algo').each((i, el) => {
        const title = $(el).find('h2 a').text().trim();
        const rawUrl = $(el).find('h2 a').attr('href');
        const snippet = $(el).find('.b_caption p').text().trim() || '';
        if (title && rawUrl) {
          let finalUrl = rawUrl;
          if (rawUrl.includes('/ck/a?!')) {
            const m = rawUrl.match(/&u=a1([^&]+)/);
            if (m) { try { finalUrl = Buffer.from(m[1], 'base64').toString(); } catch (_) {} }
          }
          results.push({ title, url: finalUrl, snippet });
        }
      });
      return sendJson(res, 200, { results: results.slice(0, 10) });
    }
  } catch (err) {
    return sendJson(res, 500, { error: errorMessage(err, 'Gagal mencari.') });
  }
}