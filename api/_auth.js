// api/_auth.js
import admin from 'firebase-admin';

function getPrivateKey() {
  let key = process.env.FIREBASE_PRIVATE_KEY || '';
  if (!key) return '';
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);
  return key.replace(/\\n/g, '\n');
}

function ensureInit() {
  if (admin.apps.length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!projectId || !clientEmail || !privateKey || !databaseURL) {
    throw new Error('Firebase env vars incomplete.');
  }
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    databaseURL
  });
}

ensureInit();

const ROLE_WHITELIST = ['free', 'pro', 'promax'];

export function adminAuth() { return admin.auth(); }
export function adminDb() { return admin.database(); }

export async function verifyUser(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    const e = new Error('Sesi tidak ditemukan. Login ulang.');
    e.status = 401;
    throw e;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token, true);
    return decoded;
  } catch (err) {
    const e = new Error('Sesi tidak valid. Login ulang.');
    e.status = 401;
    throw e;
  }
}

export async function getUserProfile(uid) {
  const snap = await admin.database().ref('profiles/' + uid).get();
  if (!snap.exists()) return null;
  const val = snap.val() || {};
  return {
    uid,
    username: typeof val.username === 'string' ? val.username : '',
    whatsapp: typeof val.whatsapp === 'string' ? val.whatsapp : null,
    role: ROLE_WHITELIST.includes(val.role) ? val.role : 'free',
    created_at: val.created_at || null,
    updated_at: val.updated_at || null
  };
}

export async function requireUser(req) {
  const decoded = await verifyUser(req);
  const profile = await getUserProfile(decoded.uid);
  const role = (profile && profile.role) || 'free';
  return { user: decoded, profile, role };
}

export async function requireRole(req, allowedRoles) {
  const auth = await requireUser(req);
  if (!Array.isArray(allowedRoles) || !allowedRoles.includes(auth.role)) {
    const e = new Error('Akses ditolak.');
    e.status = 403;
    throw e;
  }
  return auth;
}

export async function requireAdmin(req) {
  const decoded = await verifyUser(req);
  const profile = await getUserProfile(decoded.uid);
  const email = (decoded.email || '').toLowerCase();
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(email) || (profile && profile.role === 'promax');
  if (!isAdmin) {
    const e = new Error('Akses admin ditolak.');
    e.status = 403;
    throw e;
  }
  return { user: decoded, profile };
}