// firebase-init.js
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAALMSwGdC4PnrZDFr4MBaKtuG4J4duu0w",
  authDomain: "rtdbfastdevv.firebaseapp.com",
  databaseURL: "https://rtdbfastdevv-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rtdbfastdevv",
  storageBucket: "rtdbfastdevv.firebasestorage.app",
  messagingSenderId: "382247601725",
  appId: "1:382247601725:web:bfdbdf2225e384ad684c54",
  measurementId: "G-PQCDVBJ5X1"
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