import Busboy from 'busboy';
import { sendJson } from './_lib.js';
import { isPackageName, isHttpUrl, escapeHtml, cleanString } from './_validate.js';

export const config = { api: { bodyParser: false } };

const API_URL = 'https://rfweb2apk.rfdevv.com/api/apk/build-api';
const MAX_FILE_SIZE = 4 * 1024 * 1024;

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: { files: 10, fields: 40, fileSize: MAX_FILE_SIZE }
      });
    } catch (err) {
      return reject(new Error('Request multipart tidak valid.'));
    }
    const fields = {};
    const files = [];
    let settled = false;
    let limitReached = false;
    const fail = (err) => { if (settled) return; settled = true; reject(err); };

    busboy.on('field', (name, value, info) => {
      if (info && (info.nameTruncated || info.valueTruncated)) {
        return fail(new Error(`Field "${name}" terlalu panjang.`));
      }
      fields[name] = value;
    });

    busboy.on('file', (fieldName, stream, info) => {
      const chunks = [];
      let size = 0;
      let tooLarge = false;
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_FILE_SIZE) { tooLarge = true; limitReached = true; return; }
        chunks.push(chunk);
      });
      stream.on('limit', () => { tooLarge = true; limitReached = true; });
      stream.on('error', fail);
      stream.on('end', () => {
        if (tooLarge || !info.filename) return;
        files.push({
          fieldName,
          filename: info.filename,
          mimeType: info.mimeType || 'application/octet-stream',
          buffer: Buffer.concat(chunks)
        });
      });
    });

    busboy.on('filesLimit', () => { limitReached = true; });
    busboy.on('fieldsLimit', () => fail(new Error('Terlalu banyak field.')));
    busboy.on('error', fail);
    busboy.on('close', () => {
      if (settled) return;
      if (limitReached) return fail(new Error('Upload melebihi batas (maks 4 MB per file).'));
      settled = true;
      resolve({ fields, files });
    });
    req.on('error', fail);
    req.pipe(busboy);
  });
}

function normalizeDownloadUrl(payload) {
  if (payload && typeof payload.downloadUrl === 'string') {
    try {
      const u = new URL(payload.downloadUrl);
      if (u.hostname === 'rfweb2apk.rfdevy.com') {
        u.hostname = 'rfweb2apk.rfdevv.com';
        payload.downloadUrl = u.toString();
      }
    } catch (_) {}
  }
  return payload;
}

function getField(fields, names) {
  for (const n of names) {
    if (typeof fields[n] === 'string' && fields[n].trim()) return fields[n].trim();
  }
  return '';
}

async function notifyTelegram(data) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const sourceType = data.sourceType === 'url' ? 'Website (URL)' : 'File HTML';
    const sourceVal = data.sourceType === 'url' ? escapeHtml(cleanString(data.sourceUrl, 500)) : 'File HTML diunggah';
    const text = `📦 <b>BUILD APK BARU</b> 📦\n\n` +
      `👤 <b>User:</b> ${escapeHtml(cleanString(data.userName, 50)) || '(tanpa nama)'}\n` +
      `🌐 <b>Sumber:</b> ${sourceType} - ${sourceVal}\n` +
      `📱 <b>Nama APK:</b> ${escapeHtml(cleanString(data.appName, 100))}\n` +
      `🆔 <b>Package:</b> ${escapeHtml(cleanString(data.packageName, 200))}`;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000)
    });
  } catch (_) {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { success: false, error: 'Gunakan metode POST.' });
  }

  const apiKey = process.env.APIKEYYRF;
  if (!apiKey) {
    console.error('APIKEYYRF tidak di-set');
    return sendJson(res, 500, { success: false, error: 'Konfigurasi server belum lengkap.' });
  }

  let parsed;
  try {
    parsed = await parseMultipart(req);
  } catch (err) {
    return sendJson(res, 400, { success: false, error: err.message || 'Gagal membaca upload.' });
  }

  const { fields, files } = parsed;
  const userName = getField(fields, ['userName']);
  const appName = getField(fields, ['appName']);
  const packageName = getField(fields, ['packageName']);
  const url = getField(fields, ['url', 'websiteUrl']);
  const htmlFile = files.find((f) => ['html', 'htmlFile'].includes(f.fieldName));

  if (!appName || !packageName) {
    return sendJson(res, 400, { success: false, error: 'Nama aplikasi dan package name wajib diisi.' });
  }
  if (!isPackageName(packageName)) {
    return sendJson(res, 400, { success: false, error: 'Package name tidak valid. Contoh: com.fortech.aplikasi' });
  }
  if (Boolean(url) === Boolean(htmlFile)) {
    return sendJson(res, 400, { success: false, error: 'Pilih satu sumber: URL atau file HTML.' });
  }
  if (url && !isHttpUrl(url)) {
    return sendJson(res, 400, { success: false, error: 'URL tidak valid. Gunakan http:// atau https://' });
  }

  const form = new FormData();
  form.append('appName', appName.slice(0, 100));
  form.append('packageName', packageName);
  if (url) form.append('url', url);

  const allowedFields = ['splashType', 'splashHtml', 'orientation', 'versionName', 'versionCode'];
  for (const name of allowedFields) {
    if (typeof fields[name] === 'string' && fields[name].trim()) {
      form.append(name, fields[name].slice(0, name === 'splashHtml' ? 50000 : 100));
    }
  }

  for (const file of files) {
    const upstreamName = ['html', 'htmlFile'].includes(file.fieldName) ? 'html' : file.fieldName;
    const blob = new Blob([file.buffer], { type: file.mimeType });
    form.append(upstreamName, blob, file.filename);
  }

  let upstream;
  try {
    upstream = await fetch(API_URL, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
      body: form,
      signal: AbortSignal.timeout(280000)
    });
  } catch (err) {
    console.error('Build upstream error:', err.message);
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return sendJson(res, 504, { success: false, error: 'Server builder tidak merespons. Coba lagi.' });
    }
    return sendJson(res, 502, { success: false, error: 'Tidak dapat terhubung ke server builder.' });
  }

  const text = await upstream.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch (_) {
    console.error('Build upstream non-JSON:', text.slice(0, 200));
    return sendJson(res, 502, { success: false, error: 'Server builder mengembalikan respons tidak valid.' });
  }

  payload = normalizeDownloadUrl(payload);

  if (upstream.ok) {
    notifyTelegram({ userName, appName, packageName, sourceType: url ? 'url' : 'file', sourceUrl: url }).catch(() => {});
  }

  return sendJson(res, upstream.ok ? 200 : upstream.status, payload);
}