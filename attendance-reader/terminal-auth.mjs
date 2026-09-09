import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SIGN_UP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
const REFRESH_URL = 'https://securetoken.googleapis.com/v1/token';

function runDpapi(script, input) {
  if (process.platform !== 'win32') throw new Error('端末認証情報の保存にはWindowsが必要です。');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input,
    encoding:'utf8',
    windowsHide:true,
    maxBuffer:1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Windows資格情報の処理に失敗しました: ${(result.stderr || '').trim()}`);
  return result.stdout.trim();
}

export function protectForCurrentWindowsUser(value) {
  return runDpapi(
    "Add-Type -AssemblyName System.Security;$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Convert]::ToBase64String($p)",
    value,
  );
}

export function unprotectForCurrentWindowsUser(value) {
  return runDpapi(
    "Add-Type -AssemblyName System.Security;$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Text.Encoding]::UTF8.GetString($p)",
    value,
  );
}

export function createTerminalAuth({ apiKey, credentialPath, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('reader-config.json に firebaseApiKey が必要です。');
  let cachedToken = null;

  function readCredential() {
    try {
      const saved = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
      return {
        uid:saved.uid,
        refreshToken:unprotectForCurrentWindowsUser(saved.protectedRefreshToken),
      };
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw new Error(`端末認証情報を読み込めません: ${error.message}`);
    }
  }

  function saveCredential(uid, refreshToken) {
    fs.mkdirSync(path.dirname(credentialPath), { recursive:true });
    const protectedRefreshToken = protectForCurrentWindowsUser(refreshToken);
    fs.writeFileSync(credentialPath, JSON.stringify({ uid, protectedRefreshToken }, null, 2), { encoding:'utf8', mode:0o600 });
  }

  async function parseAuthResponse(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `Firebase Authentication HTTP ${response.status}`);
    return payload;
  }

  async function createIdentity() {
    const response = await fetchImpl(`${SIGN_UP_URL}?key=${encodeURIComponent(apiKey)}`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ returnSecureToken:true }),
    });
    const payload = await parseAuthResponse(response);
    saveCredential(payload.localId, payload.refreshToken);
    return {
      uid:payload.localId,
      idToken:payload.idToken,
      expiresAt:Date.now() + Number(payload.expiresIn || 3600) * 1000,
    };
  }

  async function refreshIdentity(credential) {
    const response = await fetchImpl(`${REFRESH_URL}?key=${encodeURIComponent(apiKey)}`, {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body:new URLSearchParams({ grant_type:'refresh_token', refresh_token:credential.refreshToken }),
    });
    const payload = await parseAuthResponse(response);
    saveCredential(payload.user_id, payload.refresh_token);
    return {
      uid:payload.user_id,
      idToken:payload.id_token,
      expiresAt:Date.now() + Number(payload.expires_in || 3600) * 1000,
    };
  }

  async function getToken({ forceRefresh = false } = {}) {
    if (!forceRefresh && cachedToken?.expiresAt > Date.now() + 60_000) return cachedToken;
    const credential = readCredential();
    cachedToken = credential ? await refreshIdentity(credential) : await createIdentity();
    return cachedToken;
  }

  async function authenticatedFetch(url, options = {}) {
    let token = await getToken();
    let target = new URL(url);
    target.searchParams.set('auth', token.idToken);
    let response = await fetchImpl(target, options);
    if (response.status === 401) {
      token = await getToken({ forceRefresh:true });
      target = new URL(url);
      target.searchParams.set('auth', token.idToken);
      response = await fetchImpl(target, options);
    }
    return response;
  }

  return { authenticatedFetch, getToken };
}
