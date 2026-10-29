// api/chat.js
export const config = { runtime: 'edge' };

const CHAT_API_URL = 'https://9routeruncensored.my.id/v1/chat/completions';
const CHAT_MODEL = 'Asep/deepseek-ai/DeepSeek-V4-Flash-0731-uncensored';
const CHAT_API_KEY = 'jv-pub-QLZym5vrm1wUVvcPlyAaHlGw3PaEEG9Kp___MRA2Eck'; // regenerate di 9router kalau bisa

const MAX_MESSAGES = 20;
const MAX_CHARS_PER_MSG = 4000;
const MAX_TOTAL_CHARS = 20000;

export default async function handler(req) {
  const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  const auth = await verifyFirebaseTokenEdge(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), { status: 401, headers: jsonHeaders });
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

let cachedKeys = null;
let cachedKeysExp = 0;

async function fetchGooglePublicKeys() {
  const now = Date.now();
  if (cachedKeys && now < cachedKeysExp) return cachedKeys;
  const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!res.ok) throw new Error('Gagal fetch Google public keys.');
  const json = await res.json();
  const cacheControl = res.headers.get('Cache-Control') || '';
  const m = cacheControl.match(/max-age=(\d+)/);
  const ttl = m ? parseInt(m[1], 10) * 1000 : 3600000;
  cachedKeys = json;
  cachedKeysExp = now + ttl - 60000;
  return json;
}

function base64UrlToUint8Array(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64url.length % 4) % 4);
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
function base64UrlDecodeString(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64url.length % 4) % 4);
  return atob(b64);
}

async function verifyFirebaseTokenEdge(req) {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return { ok: false, error: 'Sesi tidak ditemukan.' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, error: 'Token tidak valid.' };

  let payload;
  try { payload = JSON.parse(base64UrlDecodeString(parts[1])); }
  catch (_) { return { ok: false, error: 'Token tidak valid.' }; }

  const projectId = 'rtdbfastdevv';
  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < nowSec) return { ok: false, error: 'Token expired.' };
  if (payload.aud !== projectId) return { ok: false, error: 'Token audience salah.' };
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return { ok: false, error: 'Token issuer salah.' };

  const headerPayload = JSON.parse(base64UrlDecodeString(parts[0]));
  if (headerPayload.alg !== 'RS256') return { ok: false, error: 'Algoritma tidak didukung.' };
  const kid = headerPayload.kid;
  if (!kid) return { ok: false, error: 'Token kid kosong.' };

  let keys;
  try { keys = await fetchGooglePublicKeys(); }
  catch (_) { return { ok: false, error: 'Gagal verifikasi token.' }; }

  const pem = keys[kid];
  if (!pem) return { ok: false, error: 'Token kid tidak dikenal.' };

  const pemBody = pem.replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/\s+/g, '');
  let publicKey;
  try {
    const derBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
    publicKey = await importSpkiFromCert(derBuffer);
  } catch (_) { return { ok: false, error: 'Gagal parsing public key.' }; }

  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlToUint8Array(parts[2]);

  let valid;
  try { valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, publicKey, signature, signingInput); }
  catch (_) { return { ok: false, error: 'Verifikasi signature gagal.' }; }

  if (!valid) return { ok: false, error: 'Signature tidak valid.' };

  return { ok: true, uid: payload.sub, email: payload.email || '' };
}

async function importSpkiFromCert(certDer) {
  const cert = parseDer(certDer);
  if (cert.tag !== 0x30) throw new Error('Invalid cert');
  const tbs = parseDer(cert.bytes.slice(cert.headerLen));
  let offset = 0;
  let item = parseDerAt(tbs.bytes, tbs.headerLen, offset);
  if (item.tag === 0xA0) { offset = item.end; }
  item = parseDerAt(tbs.bytes, tbs.headerLen, offset); offset = item.end;
  item = parseDerAt(tbs.bytes, tbs.headerLen, offset); offset = item.end;
  item = parseDerAt(tbs.bytes, tbs.headerLen, offset); offset = item.end;
  item = parseDerAt(tbs.bytes, tbs.headerLen, offset); offset = item.end;
  item = parseDerAt(tbs.bytes, tbs.headerLen, offset); offset = item.end;
  item = parseDerAt(tbs.bytes, tbs.headerLen, offset);
  const spkiStart = tbs.headerLen + offset;
  const spkiEnd = tbs.headerLen + item.end;
  const spkiBytes = tbs.bytes.slice(spkiStart, spkiEnd);
  return crypto.subtle.importKey('spki', spkiBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

function parseDer(bytes) {
  if (bytes[0] !== 0x30) throw new Error('Not a sequence');
  let len = bytes[1];
  let headerLen = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | bytes[2 + i];
    headerLen = 2 + n;
  }
  return { tag: 0x30, headerLen, len, bytes, end: headerLen + len };
}
function parseDerAt(bytes, baseOffset, relOffset) {
  const pos = baseOffset + relOffset;
  const tag = bytes[pos];
  let len = bytes[pos + 1];
  let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | bytes[pos + 2 + i];
    hdr = 2 + n;
  }
  return { tag, headerLen: hdr, len, start: relOffset, end: relOffset + hdr + len };
}