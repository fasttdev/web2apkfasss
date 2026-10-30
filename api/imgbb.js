import { sendJson, errorMessage } from './_lib.js';
import { isHttpUrl } from './_validate.js';

const EXPIRATION_MAP = {
  never: '', '5m': 'PT5M', '15m': 'PT15M', '30m': 'PT30M',
  '1h': 'PT1H', '3h': 'PT3H', '6h': 'PT6H', '12h': 'PT12H',
  '1d': 'P1D', '3d': 'P3D', '1w': 'P1W', '1mo': 'P1M'
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_INPUT_SIZE = 3 * 1024 * 1024;

function normalizeExpiration(exp) {
  if (!exp) return '';
  return EXPIRATION_MAP[String(exp).trim().toLowerCase()] || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const { type, source, expiration } = req.body || {};
  if (!type || !source) return sendJson(res, 400, { status: false, error: 'Type dan source wajib diisi.' });

  const expCode = normalizeExpiration(expiration);

  try {
    const tokenRes = await fetch('https://id.imgbb.com/', {
      headers: { 'User-Agent': UA, 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' },
      signal: AbortSignal.timeout(10000)
    });
    const html = await tokenRes.text();
    const setCookieHeaders = typeof tokenRes.headers.getSetCookie === 'function'
      ? tokenRes.headers.getSetCookie()
      : [tokenRes.headers.get('set-cookie') || ''];
    const cookies = setCookieHeaders.filter(Boolean).join('; ');
    const tokenMatch = html.match(/PF\.obj\.config\.auth_token\s*=\s*"([^"]+)"/);
    if (!tokenMatch) throw new Error('Gagal mengambil auth token ImgBB.');
    const authToken = tokenMatch[1];

    const form = new FormData();
    form.append('action', 'upload');
    form.append('auth_token', authToken);
    if (expCode) form.append('expiration', expCode);

    if (type === 'url') {
      if (!isHttpUrl(source)) return sendJson(res, 400, { status: false, error: 'URL gambar tidak valid.' });
      form.append('type', 'url');
      form.append('source', source);
    } else if (type === 'file') {
      const m = String(source).match(/^data:([^;,]+)?(;base64)?,(.+)$/);
      if (!m) return sendJson(res, 400, { status: false, error: 'Format file tidak valid.' });
      const mimeType = m[1] || 'image/png';
      if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(mimeType)) {
        return sendJson(res, 400, { status: false, error: 'Hanya PNG/JPG/WEBP/GIF yang didukung.' });
      }
      const buffer = Buffer.from(m[3], 'base64');
      if (buffer.length > MAX_INPUT_SIZE) return sendJson(res, 400, { status: false, error: 'File terlalu besar (maks 3 MB).' });
      const ext = mimeType.split('/')[1].replace('jpeg', 'jpg');
      form.append('type', 'file');
      form.append('source', new Blob([buffer], { type: mimeType }), `image.${ext}`);
    } else {
      return sendJson(res, 400, { status: false, error: 'Type harus "file" atau "url".' });
    }

    const uploadRes = await fetch('https://id.imgbb.com/json', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Referer': 'https://id.imgbb.com/',
        'Accept': 'application/json',
        'Cookie': cookies
      },
      body: form,
      signal: AbortSignal.timeout(30000)
    });

    const data = await uploadRes.json();
    if (data.status_code !== 200 || !data.image) {
      throw new Error((data.error && data.error.message) || 'Gagal upload ke ImgBB.');
    }

    const img = data.image;
    return sendJson(res, 200, {
      status: true,
      directUrl: img.url,
      viewerUrl: img.url_viewer,
      deleteUrl: img.delete_url,
      thumbUrl: (img.thumb && img.thumb.url) || img.display_url,
      filename: img.filename,
      size: img.size_formatted || `${img.size} bytes`,
      width: img.width,
      height: img.height,
      expirationCode: expiration || 'never'
    });
  } catch (err) {
    return sendJson(res, 500, { status: false, error: errorMessage(err, 'Terjadi kesalahan server.') });
  }
}