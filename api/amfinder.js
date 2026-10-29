// api/amfinder.js
import { requireUser } from './_auth.js';
import { sendJson, errorMessage } from './_lib.js';
import { checkRateLimit, rateLimitMiddleware } from './_rate-limit.js';
import { isHttpUrl } from './_validate.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

  let auth;
  try { auth = await requireUser(req); }
  catch (err) { return sendJson(res, err.status || 401, { ok: false, error: err.message }); }

  if (await rateLimitMiddleware(res, await checkRateLimit(auth.user.uid, 'amfinder', 10, 3600))) return;

  const { url } = req.body || {};
  if (!url || !isHttpUrl(url)) return sendJson(res, 400, { ok: false, error: 'URL wajib diisi dan valid.' });

  const apiKey = process.env.JULZ_API_KEY;
  if (!apiKey) return sendJson(res, 500, { ok: false, error: 'Layanan AM Finder belum dikonfigurasi.' });

  try {
    const upstream = await fetch(
      `https://julzpreset-finder.vercel.app/api/find?url=${encodeURIComponent(url)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'X-API-Key': apiKey,
          'X-AM-Key': apiKey,
          'Referer': 'https://julzpreset-finder.vercel.app/',
          'Origin': 'https://julzpreset-finder.vercel.app'
        },
        signal: AbortSignal.timeout(50000)
      }
    );

    const data = await upstream.json().catch(() => null);
    if (!data) return sendJson(res, 502, { ok: false, error: 'Respons AM Finder tidak valid.' });

    return sendJson(res, upstream.status, data);
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: errorMessage(err, 'Gagal menghubungi AM Finder.') });
  }
}