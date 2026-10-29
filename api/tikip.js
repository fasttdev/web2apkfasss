// api/tikip.js
import { requireUser } from './_auth.js';
import { sendJson, errorMessage } from './_lib.js';
import { checkRateLimit, rateLimitMiddleware } from './_rate-limit.js';

const UPSTREAM = 'https://shinyfrydgdghfdgdgmouse-a6de.issam1996kech.workers.dev/api/v1/profile';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  let auth;
  try { auth = await requireUser(req); }
  catch (err) { return sendJson(res, err.status || 401, { error: err.message }); }

  if (await rateLimitMiddleware(res, await checkRateLimit(auth.user.uid, 'tikip', 20, 3600))) return;

  let { username } = req.body || {};
  if (!username) return sendJson(res, 400, { error: 'Username wajib diisi.' });

  username = String(username).trim().replace(/^@+/, '');
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(username)) return sendJson(res, 400, { error: 'Username tidak valid.' });

  try {
    const response = await fetch(`${UPSTREAM}?username=${encodeURIComponent(username)}`, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Accept': 'application/json', 'Origin': 'https://tikip.us', 'Referer': 'https://tikip.us/' },
      signal: AbortSignal.timeout(15000)
    });
    const json = await response.json();

    if (json.status === 'error' || !json.data || !json.data.user) throw new Error(json.error || 'Username tidak ditemukan atau akun private.');

    const rawUser = json.data.user;
    const rawStats = json.data.stats || {};
    const regionCode = json.data.region || rawUser.current_region || null;
    const regionName = json.data.region_name || rawUser.current_region_name || null;

    let likes = rawStats.heartCount || 0;
    if (typeof likes === 'number' && likes < 0) likes = likes >>> 0;

    let createdAtIso = null;
    if (rawUser.createTime) { try { createdAtIso = new Date(rawUser.createTime * 1000).toISOString(); } catch (_) {} }

    return sendJson(res, 200, {
      user: {
        id: rawUser.id || null, username: rawUser.uniqueId || username,
        nickname: rawUser.nickname || null, sec_uid: rawUser.secUid || null,
        bio: rawUser.signature || null, bio_link: rawUser.bioLink ? rawUser.bioLink.link : null,
        verified: Boolean(rawUser.verified), private: Boolean(rawUser.privateAccount),
        language: rawUser.language || null, created_at: createdAtIso,
        profile_url: `https://www.tiktok.com/@${rawUser.uniqueId || username}`
      },
      region: {
        code: regionCode, country: regionName,
        current_region: rawUser.current_region || null,
        registered_region: rawUser.registered_region || null,
        locked_region: rawUser.locked_region || null
      },
      stats: { followers: rawStats.followerCount || 0, following: rawStats.followingCount || 0, likes, videos: rawStats.videoCount || 0 },
      avatar: { hd: rawUser.avatarLarger || null, medium: rawUser.avatarMedium || null }
    });
  } catch (err) {
    return sendJson(res, 500, { error: errorMessage(err, 'Gagal mengambil data TikTok.') });
  }
}