// api/telegram.js
import { sendJson } from './_lib.js';
import { escapeHtml, cleanString, isEmail } from './_validate.js';

const ALLOWED_TYPES = ['register', 'build'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const body = req.body || {};
  const type = body.type;
  const data = body.data;

  if (!ALLOWED_TYPES.includes(type)) {
    return sendJson(res, 400, { error: 'Invalid notification type' });
  }
  if (!data || typeof data !== 'object') {
    return sendJson(res, 400, { error: 'Data tidak valid' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return sendJson(res, 500, { error: 'Telegram not configured.' });
  }

  let text = '';

  if (type === 'register') {
    // Hanya terima email + username. Password TIDAK PERNAH diterima di sini.
    const email = cleanString(data.email, 254);
    const username = cleanString(data.username, 30);
    if (!isEmail(email) || !username) {
      return sendJson(res, 400, { error: 'Data pendaftaran tidak lengkap.' });
    }
    const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    text = `🚨 <b>PENDAFTARAN BARU</b> 🚨\n\n` +
           `📧 <b>Gmail:</b> ${escapeHtml(email)}\n` +
           `👤 <b>Username:</b> ${escapeHtml(username)}\n` +
           `⏰ <b>Waktu:</b> ${escapeHtml(time)}`;
  } else {
    const sourceType = data.sourceType === 'url' ? 'Website (URL)' : 'File HTML';
    const sourceUrl = sourceType === 'Website (URL)' ? escapeHtml(cleanString(data.sourceUrl, 500)) : 'File HTML diunggah';
    const appName = escapeHtml(cleanString(data.appName, 100));
    const creator = escapeHtml(cleanString(data.creator, 100));
    const packageName = escapeHtml(cleanString(data.packageName, 200));
    if (!appName || !packageName) {
      return sendJson(res, 400, { error: 'Data build tidak lengkap.' });
    }
    text = `📦 <b>BUILD APK BARU</b> 📦\n\n` +
           `🌐 <b>Sumber:</b> ${sourceType} - ${sourceUrl}\n` +
           `📱 <b>Nama APK:</b> ${appName}\n` +
           `👤 <b>Pembuat:</b> ${creator}\n` +
           `🆔 <b>Package:</b> ${packageName}`;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return sendJson(res, 502, { error: 'Telegram API error' });
    }
    return sendJson(res, 200, { success: true });
  } catch (err) {
    return sendJson(res, 502, { error: 'Gagal menghubungi Telegram.' });
  }
}