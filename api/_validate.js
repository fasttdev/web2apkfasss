// api/_validate.js

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
export const WHATSAPP_REGEX = /^(\+62|62|0)8[0-9]{7,12}$/;
export const PACKAGE_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
export const FORMAT_REGEX = /^[a-z0-9]{1,10}$/;

export function isEmail(v) { return typeof v === 'string' && EMAIL_REGEX.test(v.trim()) && v.length <= 254; }
export function isUsername(v) { return typeof v === 'string' && USERNAME_REGEX.test(v.trim()); }
export function isWhatsApp(v) { return v == null || v === '' || (typeof v === 'string' && WHATSAPP_REGEX.test(v.replace(/[\s\-\.]/g, ''))); }
export function isPackageName(v) { return typeof v === 'string' && PACKAGE_REGEX.test(v.trim()); }
export function isHttpUrl(v) {
  if (typeof v !== 'string' || !v.trim()) return false;
  try {
    const u = new URL(v.trim());
    return ['http:', 'https:'].includes(u.protocol) && u.hostname.includes('.');
  } catch (_) { return false; }
}

export function cleanString(v, max = 200) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function rejectUnknownFields(body, allowed) {
  if (!body || typeof body !== 'object') return null;
  const keys = Object.keys(body);
  const extra = keys.filter((k) => !allowed.includes(k));
  if (extra.length) return `Field tidak dikenal: ${extra.join(', ')}`;
  return null;
}

/**
 * Deteksi HTML yang mencurigakan (phishing / credential harvesting).
 * Dipakai untuk deploy endpoint sebelum kirim ke Vercel.
 */
export function looksLikePhishing(html) {
  if (typeof html !== 'string') return false;
  const lower = html.toLowerCase();
  const patterns = [
    /<input[^>]+type\s*=\s*["']?password/i,
    /<input[^>]+type\s*=\s*["']?email/i,
    /<form[^>]+action\s*=\s*["']?https?:\/\//i,
    /document\.cookie\s*=/i,
    /localstorage\.setitem\s*\(\s*["']token/i,
    /window\.location\s*=\s*["']?https?:\/\/(?!.*vercel\.app)/i
  ];
  return patterns.some((re) => re.test(lower));
}