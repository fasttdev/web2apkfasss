// firebase-init.js
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDeZGVxThRgc9CWvt8i9pEHdnpO41b_PQo",
  authDomain: "web2apkfast.firebaseapp.com",
  databaseURL: "https://web2apkfast-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "web2apkfast",
  storageBucket: "web2apkfast.firebasestorage.app",
  messagingSenderId: "161520799770",
  appId: "1:161520799770:web:f94ad3a944c04da94341a3",
  measurementId: "G-12QY3D6J1T"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

try { await setPersistence(auth, browserLocalPersistence); } catch (_) {}

window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseDb = db;

window.dispatchEvent(new CustomEvent('firebase-ready'));

// Helper: fetch dengan Authorization token Firebase
window.apiFetch = async function (url, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  try {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (_) {}
  return fetch(url, Object.assign({}, options, { headers }));
};