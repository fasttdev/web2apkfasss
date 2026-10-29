// api/config.js
import { sendJson } from './_lib.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const url = (process.env.SUPABASE_URL || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

  if (!url || !anonKey) {
    return sendJson(res, 500, {
      error: 'Konfigurasi server belum lengkap.'
    });
  }

  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return sendJson(res, 200, {
    supabaseUrl: url,
    supabaseAnonKey: anonKey
  });
}