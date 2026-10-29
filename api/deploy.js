// api/deploy.js
import { requireUser } from './_auth.js';
import { sendJson, errorMessage } from './_lib.js';
import { checkRateLimit, rateLimitMiddleware } from './_rate-limit.js';
import { looksLikePhishing } from './_validate.js';

export const config = { api: { bodyParser: { sizeLimit: '3mb' } } };

const MAX_HTML_SIZE = 2 * 1024 * 1024;
const MAX_ICON_SIZE = 500 * 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Gunakan metode POST.' });
  }

  let auth;
  try { auth = await requireUser(req); }
  catch (err) { return sendJson(res, err.status || 401, { success: false, error: err.message }); }

  if (await rateLimitMiddleware(res, await checkRateLimit(auth.user.uid, 'deploy', 5, 3600))) return;

  const token = process.env.VERCEL_TOKEN;
  if (!token) return sendJson(res, 500, { success: false, error: 'Konfigurasi server belum lengkap.' });

  const { projectName, htmlContent, iconBase64 } = req.body || {};

  if (!projectName || !htmlContent) {
    return sendJson(res, 400, { success: false, error: 'Nama project dan file HTML wajib diisi.' });
  }

  if (typeof htmlContent !== 'string' || htmlContent.length > MAX_HTML_SIZE) {
    return sendJson(res, 400, { success: false, error: 'HTML terlalu besar (maks 2 MB).' });
  }

  if (looksLikePhishing(htmlContent)) {
    return sendJson(res, 403, { success: false, error: 'Konten HTML tidak diizinkan: terdeteksi form login/kredensial atau perilaku mencurigakan.' });
  }

  const cleanName = String(projectName)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  if (cleanName.length < 3) {
    return sendJson(res, 400, { success: false, error: 'Nama project minimal 3 karakter, huruf/angka/strip.' });
  }

  // Prefix dengan uid untuk cegah takeover antar user
  const prefix = 'u' + auth.user.uid.slice(0, 8).toLowerCase();
  const finalName = `${prefix}-${cleanName}`;

  try {
    const createProjectRes = await fetch('https://api.vercel.com/v9/projects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: finalName }),
      signal: AbortSignal.timeout(15000)
    });

    const projectData = await createProjectRes.json().catch(() => ({}));
    if (!createProjectRes.ok && projectData.error && projectData.error.code !== 'project_already_exists') {
      return sendJson(res, 502, { success: false, error: 'Gagal membuat project di Vercel.' });
    }

    const files = [{ file: 'index.html', data: htmlContent }];

    if (iconBase64 && typeof iconBase64 === 'string') {
      const match = iconBase64.match(/^data:image\/(png|jpeg|x-icon|vnd\.microsoft\.icon);base64,(.+)$/);
      if (match && match[2].length < MAX_ICON_SIZE * 1.4) {
        const b64 = match[2];
        files.push({ file: 'favicon.ico', data: b64, encoding: 'base64' });
        files.push({ file: 'favicon.png', data: b64, encoding: 'base64' });
      }
    }

    const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: finalName,
        files,
        target: 'production',
        projectSettings: { framework: null, buildCommand: null, outputDirectory: null }
      }),
      signal: AbortSignal.timeout(30000)
    });

    const deployData = await deployRes.json().catch(() => ({}));
    if (!deployRes.ok) {
      return sendJson(res, 502, { success: false, error: 'Deploy ke Vercel gagal.' });
    }

    return sendJson(res, 200, {
      success: true,
      url: `https://${finalName}.vercel.app`,
      projectName: finalName,
      message: 'Website berhasil di-deploy!'
    });
  } catch (err) {
    return sendJson(res, 502, { success: false, error: errorMessage(err, 'Terjadi kesalahan saat deploy.') });
  }
}