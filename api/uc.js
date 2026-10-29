// api/uc.js
import { requireUser } from './_auth.js';
import { sendJson, errorMessage } from './_lib.js';
import { checkRateLimit, rateLimitMiddleware } from './_rate-limit.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractPwdId(input) {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim();
  const m = clean.match(/\/s\/([a-zA-Z0-9]+)/) || clean.match(/^([a-zA-Z0-9]{8,32})$/);
  return m ? m[1] : null;
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function ucExtract(inputUrl, passcode) {
  const pwdId = extractPwdId(inputUrl);
  if (!pwdId) throw new Error('URL atau kode UC Share tidak valid.');

  const detailRes = await fetch('https://m-intldrive.ucweb.com/1/clouddrive/share/sharepage/v2/detail?pr=UCBrowser&fr=h5', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'Origin': 'https://drive.ucweb.com',
      'Referer': `https://drive.ucweb.com/s/${pwdId}?la=id`
    },
    body: JSON.stringify({
      pwd_id: pwdId,
      passcode: passcode || '',
      force: 0, page: 1, size: 50,
      fetch_banner: 1, fetch_share: 1, fetch_total: 1, sort: '',
      banner_platform: 'others', fetch_error_background: 1,
      web_platform: 'ios', fetch_follow_status: 1, ip_limit: ''
    }),
    signal: AbortSignal.timeout(20000)
  });

  const detailJson = await detailRes.json().catch(() => ({}));
  if (detailJson.code !== 0) {
    if (detailJson.code === 14002 || (detailJson.message && detailJson.message.toLowerCase().includes('passcode'))) {
      throw new Error('Share link memerlukan passcode.');
    }
    throw new Error(detailJson.message || 'Gagal mengambil data UC Share.');
  }

  const data = detailJson.data || {};
  const tokenInfo = data.token_info || {};
  const shareInfo = (data.detail_info && data.detail_info.share) || {};
  const stoken = tokenInfo.stoken || '';
  const rootList = (data.detail_info && data.detail_info.list) || [];
  const queue = [...rootList];
  const files = [];

  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.dir) {
      const subRes = await fetch(
        `https://m-intldrive.ucweb.com/1/clouddrive/share/sharepage/detail?pwd_id=${pwdId}&stoken=${encodeURIComponent(stoken)}&pdir_fid=${cur.fid}&force=0&_page=1&_size=100&_fetch_banner=0&_fetch_share=0&_fetch_total=1&_sort=&pr=UCBrowser&fr=h5`,
        {
          headers: { 'User-Agent': USER_AGENT, 'Origin': 'https://drive.ucweb.com', 'Referer': `https://drive.ucweb.com/s/${pwdId}?la=id` },
          signal: AbortSignal.timeout(15000)
        }
      );
      const subJson = await subRes.json().catch(() => ({}));
      if (subJson.data && subJson.data.list) queue.push(...subJson.data.list);
    } else {
      let downloadUrl = null, streamUrl = null, previewImage = cur.thumbnail || null, videoMeta = null;
      const isVideo = cur.category === 1 || cur.file_type === 1
        || (cur.format_type && cur.format_type.includes('video'))
        || (cur.file_name && cur.file_name.match(/\.(mp4|mkv|mov|avi|flv|webm|m4v|3gp)$/i));

      if (isVideo && cur.share_fid_token) {
        try {
          const params = new URLSearchParams({
            pwd_id: pwdId, stoken, fid: cur.fid, fid_token: cur.share_fid_token, pr: 'UCBrowser', fr: 'h5'
          });
          const vpRes = await fetch(`https://m-intldrive.ucweb.com/1/clouddrive/share/sharepage/video_preview?${params}`, {
            headers: { 'x-clouddrive-st': stoken, 'User-Agent': USER_AGENT, 'Origin': 'https://drive.ucweb.com', 'Referer': `https://drive.ucweb.com/s/${pwdId}?la=id` },
            signal: AbortSignal.timeout(15000)
          });
          const vpJson = await vpRes.json().catch(() => ({}));
          if (vpJson.data && vpJson.data.play_info && vpJson.data.play_info.url) {
            downloadUrl = vpJson.data.play_info.url;
            streamUrl = vpJson.data.play_info.url;
            previewImage = vpJson.data.preview_url || previewImage;
            videoMeta = {
              duration: vpJson.data.duration || cur.duration || 0,
              resolution: vpJson.data.play_info.resolution || null,
              width: vpJson.data.play_info.width || null,
              height: vpJson.data.play_info.height || null
            };
          }
        } catch (_) {}
      }

      files.push({
        fid: cur.fid,
        file_name: cur.file_name,
        size: cur.size,
        size_formatted: formatBytes(cur.size),
        format_type: cur.format_type || '',
        thumbnail: previewImage,
        stream_url: streamUrl,
        download_url: downloadUrl,
        video: videoMeta
      });
    }
  }

  return {
    status: true,
    source: inputUrl,
    pwd_id: pwdId,
    title: tokenInfo.title || shareInfo.title || 'UC Drive Share',
    author: {
      nickname: tokenInfo.author && tokenInfo.author.nick_name ? tokenInfo.author.nick_name : null,
      avatar: tokenInfo.author && tokenInfo.author.avatar_url ? tokenInfo.author.avatar_url : null
    },
    total_files: files.length,
    total_size: shareInfo.size || 0,
    total_size_formatted: formatBytes(shareInfo.size || 0),
    created_at: shareInfo.created_at || null,
    expired_at: shareInfo.expired_at || null,
    files
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { status: false, error: 'Gunakan metode POST.' });

  let auth;
  try { auth = await requireUser(req); }
  catch (err) { return sendJson(res, err.status || 401, { status: false, error: err.message }); }

  if (await rateLimitMiddleware(res, await checkRateLimit(auth.user.uid, 'uc', 15, 3600))) return;

  const { url, passcode } = req.body || {};
  if (!url || typeof url !== 'string' || !url.trim()) {
    return sendJson(res, 400, { status: false, error: 'URL UC Share wajib diisi.' });
  }

  try {
    const result = await ucExtract(url, typeof passcode === 'string' ? passcode : '');
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 500, { status: false, error: errorMessage(err, 'Gagal mengambil data UC Share.') });
  }
}