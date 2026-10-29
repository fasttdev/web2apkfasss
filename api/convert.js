// api/convert.js
import { requireUser } from './_auth.js';
import { sendJson, errorMessage } from './_lib.js';
import { checkRateLimit, rateLimitMiddleware } from './_rate-limit.js';
import { FORMAT_REGEX } from './_validate.js';

export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '6mb' } } };

const BASE_API = 'https://api.freeconvert.com/v1/process/jobs';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const MAX_WAIT_MS = 55000;
const POLL_INTERVAL = 2000;
const MAX_INPUT_SIZE = 4 * 1024 * 1024;

async function resolveInput(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Input kosong.');
  const src = input.trim();

  if (src.startsWith('data:')) {
    const m = src.match(/^data:([^;,]+)?(;base64)?,(.+)$/);
    if (!m) throw new Error('Data URL tidak valid.');
    const mimeType = m[1] || 'application/octet-stream';
    const isBase64 = m[2] === ';base64';
    const buffer = isBase64
      ? Buffer.from(m[3], 'base64')
      : Buffer.from(decodeURIComponent(m[3]), 'utf-8');
    if (buffer.length > MAX_INPUT_SIZE) throw new Error('File terlalu besar (maks 4 MB).');
    return { buffer, fileName: null, mimeType };
  }

  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Gagal download file sumber: HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    if (!ab || ab.byteLength === 0) throw new Error('File sumber kosong.');
    if (ab.byteLength > MAX_INPUT_SIZE) throw new Error('File sumber terlalu besar (maks 4 MB).');
    const mimeType = res.headers.get('content-type') || 'application/octet-stream';
    let fileName = null;
    try {
      const u = new URL(res.url || src);
      const base = u.pathname.split('/').filter(Boolean).pop();
      if (base && base.includes('.')) fileName = decodeURIComponent(base);
    } catch (_) {}
    return { buffer: Buffer.from(ab), fileName, mimeType };
  }

  throw new Error('Input harus URL atau data URL.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { status: false, error: 'Gunakan metode POST.' });

  let auth;
  try { auth = await requireUser(req); }
  catch (err) { return sendJson(res, err.status || 401, { status: false, error: err.message }); }

  if (await rateLimitMiddleware(res, await checkRateLimit(auth.user.uid, 'convert', 10, 3600))) return;

  const body = req.body || {};
  const { input, targetFormat } = body;

  if (!input || !targetFormat) return sendJson(res, 400, { status: false, error: 'Input dan format tujuan wajib diisi.' });

  const cleanFormat = String(targetFormat).toLowerCase().replace(/^\./, '').trim();
  if (!FORMAT_REGEX.test(cleanFormat)) return sendJson(res, 400, { status: false, error: 'Format tujuan tidak valid.' });

  let jobId = null;

  try {
    const { buffer, fileName: detectedName, mimeType } = await resolveInput(input);
    const fileName = detectedName || `file_${Date.now()}.${cleanFormat}`;

    const jobRes = await fetch(BASE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'Origin': 'https://www.freeconvert.com',
        'Referer': 'https://www.freeconvert.com/'
      },
      body: JSON.stringify({
        tasks: {
          'import-1': { operation: 'import/upload' },
          'convert-1': { operation: 'convert', input: 'import-1', output_format: cleanFormat },
          'export-1': { operation: 'export/url', input: ['convert-1'] }
        }
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!jobRes.ok) throw new Error(`Gagal membuat job konversi (${jobRes.status}).`);
    const jobData = await jobRes.json();
    jobId = jobData.id;

    const importTask = (jobData.tasks || []).find((t) => t.name === 'import-1');
    if (!importTask || !importTask.result || !importTask.result.form || !importTask.result.form.url) {
      throw new Error('Respons job tidak valid.');
    }

    const formUrl = importTask.result.form.url;
    const formParams = importTask.result.form.parameters || {};

    const fd = new FormData();
    for (const key of Object.keys(formParams)) fd.append(key, String(formParams[key]));
    fd.append('file', new Blob([buffer], { type: mimeType }), fileName);

    const upRes = await fetch(formUrl, { method: 'POST', headers: { 'User-Agent': USER_AGENT }, body: fd, signal: AbortSignal.timeout(30000) });
    if (!upRes.ok) throw new Error(`Upload ke FreeConvert gagal (${upRes.status}).`);

    const startTime = Date.now();
    while (Date.now() - startTime < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      const pollRes = await fetch(`${BASE_API}/${jobId}`, {
        headers: { 'User-Agent': USER_AGENT, 'Origin': 'https://www.freeconvert.com', 'Referer': 'https://www.freeconvert.com/' },
        signal: AbortSignal.timeout(10000)
      }).catch(() => null);
      if (!pollRes || !pollRes.ok) continue;

      const job = await pollRes.json().catch(() => null);
      if (!job) continue;

      if (job.status === 'completed') {
        const exportTask = (job.tasks || []).find((t) => t.name === 'export-1');
        const url = exportTask && exportTask.result ? exportTask.result.url : null;
        if (!url) throw new Error('Konversi selesai tapi URL export tidak tersedia.');
        return sendJson(res, 200, {
          status: true,
          jobId, fileName, targetFormat: cleanFormat,
          fileSize: (exportTask.result && exportTask.result.size) || null,
          downloadUrl: url
        });
      }

      if (job.status === 'failed') {
        const failed = (job.tasks || []).find((t) => t.status === 'failed');
        throw new Error((failed && failed.result && failed.result.msg) || 'Konversi gagal.');
      }
    }

    throw new Error('Konversi memakan waktu terlalu lama.');
  } catch (err) {
    return sendJson(res, 500, { status: false, jobId, error: errorMessage(err, 'Terjadi kesalahan saat konversi.') });
  }
}