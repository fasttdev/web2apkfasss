// api/youtube.js
import { requireUser } from './_auth.js';
import { sendJson, errorMessage } from './_lib.js';
import { checkRateLimit, rateLimitMiddleware } from './_rate-limit.js';

export const config = { maxDuration: 60 };

const YT = 'https://www.youtube.com';
const CNV = 'https://cnv.cx/v2';
const FRAME = 'https://y2meta-uk.com';
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const FALLBACK = { key: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', version: '2.20261002.10.00' };
const headers = { 'User-Agent': UA, 'Content-Type': 'application/json', 'Origin': YT, 'Referer': YT + '/' };

let cachedConfig = null, cachedConfigExp = 0;

const text = (o) => (o ? o.simpleText || (o.runs ? o.runs.map((r) => r.text).join('') : null) : null) || null;

function collect(node, out) {
  if (Array.isArray(node)) { for (const n of node) collect(n, out); return; }
  if (!node || typeof node !== 'object') return;
  if (node.videoRenderer) out.push(node.videoRenderer);
  for (const k in node) if (k !== 'videoRenderer') collect(node[k], out);
}

function mapVideo(v) {
  const owner = v.ownerText && v.ownerText.runs ? v.ownerText.runs[0] : null;
  const path = owner && owner.navigationEndpoint && owner.navigationEndpoint.browseEndpoint
    ? owner.navigationEndpoint.browseEndpoint.canonicalBaseUrl : null;
  return {
    videoId: v.videoId,
    title: text(v.title),
    url: `https://www.youtube.com/watch?v=${v.videoId}`,
    duration: text(v.lengthText),
    views: text(v.viewCountText),
    published: text(v.publishedTimeText),
    channel: { name: text(v.ownerText), url: path ? YT + path : null, verified: (v.ownerBadges || []).some((b) => /VERIFIED/i.test((b.metadataBadgeRenderer || {}).style || '')) },
    thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
  };
}

async function getConfig() {
  if (cachedConfig && Date.now() < cachedConfigExp) return cachedConfig;
  try {
    const res = await fetch(YT + '/?hl=en', { headers: { 'User-Agent': UA, Cookie: 'CONSENT=YES+1; SOCS=CAI' }, signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    const k = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const v = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
    cachedConfig = { key: k ? k[1] : FALLBACK.key, version: v ? v[1] : FALLBACK.version };
    cachedConfigExp = Date.now() + 10 * 60 * 1000;
    return cachedConfig;
  } catch { return FALLBACK; }
}

function extractVideoId(input) {
  const s = String(input).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  let auth;
  try { auth = await requireUser(req); }
  catch (err) { return sendJson(res, err.status || 401, { error: err.message }); }

  if (await rateLimitMiddleware(res, await checkRateLimit(auth.user.uid, 'youtube', 20, 3600))) return;

  const { action, query, videoId } = req.body || {};

  try {
    if (action === 'search') {
      if (!query) throw new Error('Query tidak boleh kosong.');
      const cfg = await getConfig();
      const searchRes = await fetch(`${YT}/youtubei/v1/search?key=${cfg.key}&prettyPrint=false`, {
        method: 'POST',
        headers: { ...headers, 'X-Youtube-Client-Name': '1', 'X-Youtube-Client-Version': cfg.version },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: cfg.version, hl: 'id', gl: 'ID' } },
          query: String(query).slice(0, 200), params: 'EgIQAQ=='
        }),
        signal: AbortSignal.timeout(15000)
      });
      const data = await searchRes.json();
      const found = []; collect(data, found);
      const seen = new Set(); const results = [];
      for (const v of found) { if (!v.videoId || seen.has(v.videoId)) continue; seen.add(v.videoId); results.push(mapVideo(v)); }
      return sendJson(res, 200, { success: true, results });
    }

    if (action === 'download') {
      const parsedId = extractVideoId(videoId);
      if (!parsedId) throw new Error('ID video tidak valid.');

      const keyRes = await fetch(`${CNV}/sanity/key?id=${parsedId}`, {
        headers: { 'User-Agent': UA, Referer: FRAME, Origin: FRAME },
        signal: AbortSignal.timeout(10000)
      });
      const keyData = await keyRes.json();
      const key = keyData.key;
      if (!key) throw new Error('Gagal mendapatkan kunci konversi.');

      const convert = async (format, quality, audioBitrate) => {
        try {
          const r = await fetch(`${CNV}/converter`, {
            method: 'POST',
            headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', accept: '*/*', Referer: FRAME, Origin: FRAME, key },
            body: new URLSearchParams({ link: `https://youtu.be/${parsedId}`, format, audioBitrate: String(audioBitrate || 128), videoQuality: String(quality), filenameStyle: 'pretty', vCodec: 'h264' }).toString(),
            signal: AbortSignal.timeout(45000)
          });
          return await r.json();
        } catch (_) { return { url: null }; }
      };

      const [mp4, mp3, titleRes] = await Promise.all([
        Promise.all([1080, 720, 360, 240, 144].map((q) => convert('mp4', q, 128).then((d) => ({ quality: `${q}p`, url: d.url, size: d.size || null })))),
        Promise.all([320, 256, 128].map((q) => convert('mp3', 720, q).then((d) => ({ quality: `${q}kbps`, url: d.url, size: d.size || null })))),
        fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${parsedId}&format=json`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => ({ title: 'Unknown' }))
      ]);

      return sendJson(res, 200, {
        success: true, videoId: parsedId,
        title: titleRes.title || 'Unknown',
        thumbnail: `https://i.ytimg.com/vi/${parsedId}/hqdefault.jpg`,
        mp4, mp3
      });
    }
    return sendJson(res, 400, { error: 'Action tidak valid.' });
  } catch (err) {
    return sendJson(res, 500, { error: errorMessage(err, 'Terjadi kesalahan server.') });
  }
}