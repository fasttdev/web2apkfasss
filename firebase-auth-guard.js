// firebase-auth-guard.js
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const html = document.documentElement;
const LOGIN_URL = 'login.html';

if (location.pathname.indexOf('login.html') !== -1) {
  html.classList.remove('auth-pending');
} else {
  let redirected = false;
  let unsubProfile = null;
  let readyFired = false;

  function bail(reason) {
    if (redirected) return;
    redirected = true;
    if (reason) { try { sessionStorage.setItem('auth-redirect-reason', reason); } catch (_) {} }
    window.location.replace(LOGIN_URL);
  }

  function waitForInit() {
    if (window.firebaseAuth && window.firebaseDb) return Promise.resolve();
    return new Promise((resolve) => {
      window.addEventListener('firebase-ready', () => resolve(), { once: true });
      setTimeout(resolve, 6000);
    });
  }

  await waitForInit();
  const auth = window.firebaseAuth;
  const db = window.firebaseDb;

  if (!auth || !db) {
    bail('firebase-missing');
  } else {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (unsubProfile) { try { unsubProfile(); } catch (_) {} unsubProfile = null; }
        bail('no-session');
        return;
      }

      window.currentUser = {
        id: user.uid,
        uid: user.uid,
        email: user.email || '',
        created_at: user.metadata?.creationTime || null,
        email_verified: !!user.emailVerified,
        user_metadata: { username: user.displayName || null }
      };

      try {
        const snap = await get(ref(db, 'profiles/' + user.uid));
        window.currentProfile = snap.exists() ? { id: user.uid, ...snap.val() } : null;
      } catch (err) {
        console.warn('[auth-guard] profile fetch error:', err.message);
        window.currentProfile = null;
      }

      try {
        if (unsubProfile) { try { unsubProfile(); } catch (_) {} }
        unsubProfile = onValue(ref(db, 'profiles/' + user.uid), (snap) => {
          if (snap.exists()) {
            const profile = { id: user.uid, ...snap.val() };
            window.currentProfile = profile;
            window.dispatchEvent(new CustomEvent('authprofile', { detail: { profile, user: window.currentUser } }));
          }
        }, (err) => console.warn('[auth-guard] realtime error:', err.message));
      } catch (_) {}

      html.classList.remove('auth-pending');

      if (!readyFired) {
        readyFired = true;
        window.dispatchEvent(new CustomEvent('authready', {
          detail: { user: window.currentUser, profile: window.currentProfile }
        }));
      }
    });
  }
}