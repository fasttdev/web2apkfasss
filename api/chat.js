export const config = { runtime: 'edge' };

const CHAT_API_URL = 'https://9routeruncensored.my.id/v1/chat/completions';
const CHAT_MODEL = 'Asep/deepseek-ai/DeepSeek-V4-Flash-0731-uncensored';
const CHAT_API_KEY = 'jv-pub-QLZym5vrm1wUVvcPlyAaHlGw3PaEEG9Kp___MRA2Eck';

const MAX_MESSAGES = 20;
const MAX_CHARS_PER_MSG = 4000;
const MAX_TOTAL_CHARS = 20000;

export default async function handler(req) {
  const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  let body;
  try { body = await req.json(); }
  catch (_) { return new Response(JSON.stringify({ error: 'Body tidak valid.' }), { status: 400, headers: jsonHeaders }); }

  const { messages, stream } = body || {};

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return new Response(JSON.stringify({ error: `Maksimal ${MAX_MESSAGES} pesan per request.` }), { status: 400, headers: jsonHeaders });
  }

  let totalChars = 0;
  const cleaned = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    if (!['user', 'assistant', 'system'].includes(m.role)) continue;
    if (typeof m.content !== 'string' || !m.content.trim()) continue;
    const content = m.content.slice(0, MAX_CHARS_PER_MSG);
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      return new Response(JSON.stringify({ error: 'Pesan terlalu panjang.' }), { status: 400, headers: jsonHeaders });
    }
    cleaned.push({ role: m.role, content });
  }
  if (cleaned.length === 0) {
    return new Response(JSON.stringify({ error: 'Tidak ada pesan valid.' }), { status: 400, headers: jsonHeaders });
  }

  try {
    const upstream = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHAT_API_KEY}`,
        'Accept': 'application/json',
        'HTTP-Referer': 'https://web2apk.fastdev.my.id',
        'X-Title': 'Web2APK Chat AI'
      },
      body: JSON.stringify({ model: CHAT_MODEL, messages: cleaned, stream: !!stream })
    });

    const contentType = upstream.headers.get('Content-Type') || '';
    if (!upstream.ok && contentType.includes('text/html')) {
      const htmlText = await upstream.text();
      if (htmlText.includes('Just a moment')) {
        return new Response(JSON.stringify({ error: 'Layanan AI sedang tidak tersedia.' }), { status: 503, headers: jsonHeaders });
      }
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': contentType || 'application/json', 'Cache-Control': 'no-cache' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Gagal menghubungi server AI.' }), { status: 502, headers: jsonHeaders });
  }
}