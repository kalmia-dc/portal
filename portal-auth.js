import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getDatabase,
  get,
  onValue,
  ref,
  serverTimestamp,
  update,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { watchPortalSession } from './portal-session-watch.mjs';
import { readServerProfile } from './portal-server-profile.mjs';

export const PORTAL_ROLES = Object.freeze({
  ADMIN: 'admin',
  TRAINING_ADMIN: 'trainingAdmin',
  STAFF: 'staff',
  TERMINAL: 'terminal',
});

const STORAGE_KEY = 'portalUser';
const OVERLAY_ID = 'portal-auth-overlay';

export function normalizeAccessProfile(uid, firebaseUser, raw) {
  if (!raw || raw.active !== true || typeof raw.staffId !== 'string' || !raw.staffId) return null;
  const portalRole = Object.values(PORTAL_ROLES).includes(raw.role) ? raw.role : PORTAL_ROLES.STAFF;
  return {
    uid,
    staffId: raw.staffId,
    sid: raw.staffId,
    name: raw.name || firebaseUser.displayName || raw.staffId,
    role: raw.staffRole || '',
    portalRole,
    isAdmin: portalRole === PORTAL_ROLES.ADMIN,
    isTrainingAdmin: portalRole === PORTAL_ROLES.ADMIN || portalRole === PORTAL_ROLES.TRAINING_ADMIN,
    email: firebaseUser.email || '',
  };
}

export function canManageAll(profile) {
  return profile?.portalRole === PORTAL_ROLES.ADMIN;
}

export function canManageTraining(profile) {
  return canManageAll(profile) || profile?.portalRole === PORTAL_ROLES.TRAINING_ADMIN;
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;
  const style = document.createElement('style');
  style.textContent = `
    #${OVERLAY_ID}{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:#f4f8f6;font-family:"Yu Gothic UI",Meiryo,sans-serif;color:#20352c}
    #${OVERLAY_ID} .portal-auth-card{width:min(460px,100%);padding:28px;border:1px solid #cfe0d8;border-radius:18px;background:#fff;box-shadow:0 18px 50px rgba(30,70,52,.16)}
    #${OVERLAY_ID} h1{margin:0 0 12px;font-size:1.35rem;color:#176b4b}
    #${OVERLAY_ID} p{margin:9px 0;line-height:1.7}
    #${OVERLAY_ID} .portal-auth-note{font-size:.9rem;color:#52655d}
    #${OVERLAY_ID} .portal-auth-error{color:#b3261e;font-weight:700}
    #${OVERLAY_ID} button{width:100%;margin-top:14px;padding:12px 16px;border:0;border-radius:10px;background:#176b4b;color:#fff;font:inherit;font-weight:700;cursor:pointer}
    #${OVERLAY_ID} button.secondary{background:#e8f1ed;color:#174f3c}
    #${OVERLAY_ID} button:disabled{opacity:.6;cursor:wait}
  `;
  document.head.append(style);
  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = '<div class="portal-auth-card"><h1>ログインを確認しています</h1><p>しばらくお待ちください。</p></div>';
  document.body.append(overlay);
  return overlay;
}

function showCard(title, body, actions = []) {
  const overlay = ensureOverlay();
  const card = document.createElement('div');
  card.className = 'portal-auth-card';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const content = document.createElement('div');
  content.innerHTML = body;
  card.append(heading, content);
  actions.forEach(({ label, className = '', onClick }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = className;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await onClick();
      } catch (error) {
        button.disabled = false;
        showCard('ログインできませんでした', `<p class="portal-auth-error">${escapeHtml(authErrorMessage(error))}</p><p class="portal-auth-note">改善しない場合は、表示された内容を百々さんへ伝えてください。パスワードは伝えないでください。</p>`, actions);
      }
    });
    card.append(button);
  });
  overlay.replaceChildren(card);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function authErrorMessage(error) {
  const code = error?.code || '';
  if (code === 'auth/operation-not-allowed') return 'Googleログインがまだ有効化されていません。管理者の切替作業をお待ちください。';
  if (code === 'auth/popup-closed-by-user') return 'ログイン画面が閉じられました。もう一度お試しください。';
  if (code === 'auth/network-request-failed') return '通信できません。インターネット接続を確認してください。';
  return error?.message || 'Googleログイン中にエラーが発生しました。';
}

function waitForAuthUser(auth) {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user);
    }, reject);
  });
}

function savePortalProfile(profile) {
  const serialized = JSON.stringify(profile);
  sessionStorage.setItem(STORAGE_KEY, serialized);
  localStorage.setItem(STORAGE_KEY, serialized);
  localStorage.removeItem('carmia_passwords');
}

function clearPortalProfile() {
  sessionStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('carmia_passwords');
}

async function requestGoogleSignIn(auth) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
  location.reload();
}

async function recordAccessRequest(db, user, pageName) {
  await update(ref(db, `portalAccessRequests/${user.uid}`), {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    pageName,
    lastRequestedAt: serverTimestamp(),
  });
}

async function loadApprovedProfile(db, user) {
  const snapshot = await get(ref(db, `portalAccess/users/${user.uid}`));
  return normalizeAccessProfile(user.uid, user, snapshot.val());
}

export async function startPortalAuth(app, { pageName = document.title } = {}) {
  ensureOverlay();
  const auth = getAuth(app);
  const db = getDatabase(app);
  await setPersistence(auth, browserLocalPersistence);
  try {
    await getRedirectResult(auth);
  } catch (error) {
    showCard('ログインできませんでした', `<p class="portal-auth-error">${escapeHtml(authErrorMessage(error))}</p>`, [
      { label:'Googleアカウントで再試行', onClick:() => requestGoogleSignIn(auth) },
    ]);
  }

  let user = await waitForAuthUser(auth);
  if (!user) {
    clearPortalProfile();
    showCard('カルミアDC ポータル', '<p>登録したGoogleアカウントでログインしてください。</p><p class="portal-auth-note">医院がGoogleアカウントのパスワードを確認することはありません。</p>', [
      { label:'Googleアカウントでログイン', onClick:() => requestGoogleSignIn(auth) },
    ]);
    user = await new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(auth, nextUser => {
        if (!nextUser) return;
        unsubscribe();
        resolve(nextUser);
      }, reject);
    });
  }

  if (!user.providerData.some(provider => provider.providerId === 'google.com')) {
    await signOut(auth);
    clearPortalProfile();
    throw new Error('Googleアカウントでのログインが必要です。');
  }

  let profile;
  try {
    profile = await loadApprovedProfile(db, user);
  } catch (error) {
    clearPortalProfile();
    showCard('利用許可を確認できません', '<p>通信状況を確認して、再読み込みしてください。</p>', [
      { label:'再読み込み', onClick:() => location.reload() },
    ]);
    throw error;
  }
  if (!profile) {
    clearPortalProfile();
    await recordAccessRequest(db, user, pageName);
    showCard('登録確認中です', `<p><strong>${escapeHtml(user.email || user.displayName || 'このGoogleアカウント')}</strong> は、まだポータル利用許可に登録されていません。</p><p>ログイン申請を受け付けました。管理者へ、この画面のメールアドレスと氏名を伝えてください。管理者がメンバー管理でスタッフ名簿と照合し、利用を許可します。</p><p class="portal-auth-note">許可された後、このページを再読み込みしてください。登録済みの場合は、管理者へ表示内容をご連絡ください。</p>`, [
      { label:'別のGoogleアカウントを使う', className:'secondary', onClick:async() => { await signOut(auth); location.reload(); } },
    ]);
    return new Promise(() => {});
  }

  savePortalProfile(profile);
  window.portalAuth = Object.freeze({ auth, user, profile });
  window.portalSignOut = signOutPortal;
  document.getElementById(OVERLAY_ID)?.remove();
  window.dispatchEvent(new CustomEvent('portalAuthReady', { detail: profile }));
  const lockedElements = new Map();
  const lockForConnection = () => {
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close('cancel'));
    // Preserve DOM/form state; unlock only after a fresh server REST read.
    for (const child of document.body.children) {
      if (child.id === OVERLAY_ID) continue;
      if(!lockedElements.has(child)) lockedElements.set(child,{inert:child.inert,visibility:child.style.visibility});
      child.inert = true;
      child.style.visibility = 'hidden';
    }
    showCard('通信が途切れています','<p>入力内容とログイン状態を保持して、操作を一時停止しています。</p><p>通信復旧後、サーバーで利用許可を確認して自動的に再開します。</p>');
  };
  watchPortalSession({
    userId:user.uid, initial:profile,
    normalize:raw => normalizeAccessProfile(user.uid, user, raw),
    subscribe:(next, error) => onValue(ref(db, `portalAccess/users/${user.uid}`), snap => next(snap.val()), error),
    subscribeAuth:next => onAuthStateChanged(auth, next),
    subscribeConnection:next => onValue(ref(db, '.info/connected'), snap => next(snap.val() === true)),
    suspend:lockForConnection,
    verifying:() => showCard('利用許可を再確認しています','<p>サーバーに接続しています。確認が完了するまで入力内容を保持してお待ちください。</p>'),
    verify:() => readServerProfile({databaseURL:app.options.databaseURL,user}),
    resume:() => {
      for(const [child,previous] of lockedElements){child.inert=previous.inert;child.style.visibility=previous.visibility;}
      lockedElements.clear();
      savePortalProfile(profile);
      document.getElementById(OVERLAY_ID)?.remove();
    },
    invalidate:() => {
      clearPortalProfile();
      window.portalAuth = undefined;
      document.body.replaceChildren();
      showCard('利用許可の再確認が必要です', '<p>利用許可の変更、ログアウト、または利用許可の読み取りエラーを検出しました。画面を閉じました。</p><p>再読み込みしてログイン状態を確認してください。</p>', [
        { label:'再読み込み', onClick:() => location.reload() },
      ]);
      void signOut(auth).catch(() => {});
    },
  });
  return profile;
}

export async function signOutPortal() {
  clearPortalProfile();
  if (window.portalAuth?.auth) await signOut(window.portalAuth.auth);
  location.assign('./index.html');
}
