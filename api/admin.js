// api/admin.js
import { requireAdmin, adminDb, adminAuth } from './_auth.js';
import { sendJson, errorMessage } from './_lib.js';

const ROLE_WHITELIST = ['free', 'pro', 'promax'];
const MAX_LIST = 200;

function sanitizeProfile(uid, raw) {
  const p = raw || {};
  return {
    uid,
    username: typeof p.username === 'string' ? p.username : '',
    username_lower: typeof p.username_lower === 'string' ? p.username_lower : (p.username || '').toLowerCase(),
    whatsapp: typeof p.whatsapp === 'string' ? p.whatsapp : null,
    role: ROLE_WHITELIST.includes(p.role) ? p.role : 'free',
    created_at: typeof p.created_at === 'string' ? p.created_at : null,
    updated_at: typeof p.updated_at === 'string' ? p.updated_at : null
  };
}

async function listUsers(search) {
  const snap = await adminDb().ref('profiles').once('value');
  const val = snap.val() || {};
  const all = Object.keys(val).map((uid) => sanitizeProfile(uid, val[uid]));
  const q = String(search || '').trim().toLowerCase();
  const filtered = q
    ? all.filter((u) => (u.username_lower || '').includes(q) || (u.uid || '').toLowerCase().includes(q))
    : all;
  filtered.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
  return filtered.slice(0, MAX_LIST);
}

async function attachEmails(users) {
  const uids = users.map((u) => u.uid);
  const out = {};
  for (let i = 0; i < uids.length; i += 100) {
    const chunk = uids.slice(i, i + 100);
    try {
      const result = await adminAuth().getUsers(chunk.map((uid) => ({ uid })));
      result.users.forEach((u) => { if (u) out[u.uid] = u.email || ''; });
    } catch (_) {}
  }
  return users.map((u) => ({ ...u, email: out[u.uid] || '' }));
}

async function getStats() {
  const snap = await adminDb().ref('profiles').once('value');
  const val = snap.val() || {};
  let free = 0, pro = 0, promax = 0;
  for (const uid in val) {
    const r = val[uid] && val[uid].role;
    if (r === 'promax') promax++;
    else if (r === 'pro') pro++;
    else free++;
  }
  return { total: Object.keys(val).length, free, pro, promax };
}

async function updateRole(targetUid, newRole) {
  if (!targetUid || typeof targetUid !== 'string') {
    const e = new Error('targetUid wajib diisi.'); e.status = 400; throw e;
  }
  if (!ROLE_WHITELIST.includes(newRole)) {
    const e = new Error('Role tidak valid.'); e.status = 400; throw e;
  }
  const ref = adminDb().ref('profiles/' + targetUid);
  const snap = await ref.get();
  if (!snap.exists()) {
    const e = new Error('User tidak ditemukan.'); e.status = 404; throw e;
  }
  await ref.update({ role: newRole, updated_at: new Date().toISOString() });
  return { uid: targetUid, role: newRole };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Gunakan metode POST.' });
  }

  try { await requireAdmin(req); }
  catch (err) { return sendJson(res, err.status || 403, { success: false, error: err.message }); }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(body.action || '').trim();

  try {
    if (action === 'stats') {
      return sendJson(res, 200, { success: true, stats: await getStats() });
    }
    if (action === 'list') {
      const users = await listUsers(body.search);
      const enriched = await attachEmails(users);
      return sendJson(res, 200, { success: true, total: enriched.length, users: enriched });
    }
    if (action === 'update_role') {
      return sendJson(res, 200, { success: true, ...(await updateRole(body.targetUid, body.role)) });
    }
    return sendJson(res, 400, { success: false, error: 'Action tidak valid.' });
  } catch (err) {
    return sendJson(res, err.status || 500, { success: false, error: errorMessage(err, 'Terjadi kesalahan server.') });
  }
}