/**
 * ZAPFIT API client for desktop (renamed from Endurain).
 * Parité with mobile ApiClient: PKCE, MFA, refresh, image fallback.
 */

const fetch = require('node-fetch');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { run, query, saveDatabase } = require('./db');

const CLIENT_TYPE = 'mobile';

const SETTINGS_KEYS = {
  serverUrl: 'zapfit_server_url',
  accessToken: 'zapfit_access_token',
  refreshToken: 'zapfit_refresh_token',
  userId: 'zapfit_user_id',
  csrfToken: 'zapfit_csrf_token',
  codeVerifier: 'zapfit_code_verifier',
  mfaUsername: 'zapfit_mfa_username',
  apiKey: 'zapfit_api_key',
  apiPassword: 'zapfit_api_password',
  username: 'zapfit_username',
  password: 'zapfit_password',
  mfaSecret: 'zapfit_mfa_secret',
};

// Backward compat — old endurain_* keys, auto-migrated on read
const LEGACY_KEYS = {
  serverUrl: 'endurain_server_url',
  accessToken: 'endurain_access_token',
  refreshToken: 'endurain_refresh_token',
  userId: 'endurain_user_id',
  csrfToken: 'endurain_csrf_token',
  codeVerifier: 'endurain_code_verifier',
  mfaUsername: 'endurain_mfa_username',
  apiKey: 'endurain_api_key',
  apiPassword: 'endurain_api_password',
  username: 'endurain_username',
  password: 'endurain_password',
  mfaSecret: 'endurain_mfa_secret',
};

function normalizeBaseUrl(url) {
  if (!url) return '';
  let u = url.trim();
  // remove trailing slashes
  u = u.replace(/\/+$/, '');
  // ensure protocol
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    u = 'https://' + u;
  }
  return u;
}

function buildImageCandidates(baseUrl, imagePath) {
  const candidates = [];
  if (!imagePath) return candidates;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    candidates.push(imagePath);
    return candidates;
  }
  // Normalize: strip data/ prefix (server stores data/activity_thumbnails/...)
  let clean = imagePath.startsWith('/') ? imagePath : '/' + imagePath;
  // remove leading /data prefix if present — static mounts are without it
  clean = clean.replace(/^\/data\//, '/');
  // also handle bare data/activity_thumbnails without leading slash
  if (clean.startsWith('data/')) clean = '/' + clean.slice(5);
  const prefixes = ['/activity_thumbnails/','/activity_media/','/user_images/','/server_images/','/gear_images/'];
  const hasKnown = prefixes.some((p) => clean.includes(p));
  if (hasKnown) {
    const file = clean.split('/').pop();
    const folder = prefixes.find((p) => clean.includes(p));
    if (folder) {
      // Static mounts are WITHOUT /api/v1 — try direct first (correct), api/v1 last for compat
      candidates.push(`${baseUrl}${folder}${file}`);
      candidates.push(`${baseUrl}${clean}`);
      candidates.push(`${baseUrl}/api/v1${folder}${file}`);
    }
  } else if (clean.includes('user_images') || clean.includes('activity_media') || clean.includes('activity_thumbnails') || clean.includes('gear_images') || clean.includes('images')) {
    candidates.push(`${baseUrl}${clean}`);
  } else {
    candidates.push(`${baseUrl}/user_images${clean}`);
    candidates.push(`${baseUrl}/activity_thumbnails${clean}`);
    candidates.push(`${baseUrl}/activity_media${clean}`);
    candidates.push(`${baseUrl}${clean}`);
  }
  return [...new Set(candidates)];
}

class ZapfitAPI {
  constructor() {
    this._baseUrl = null;
    this._accessToken = null;
    this._refreshToken = null;
    this._userId = null;
    this._csrfToken = null;
    this._codeVerifier = null;
    this._mfaUsername = null;
    this._apiKey = null;
    this._apiPassword = null;
    this._imageCache = new Map();
    // Try load from DB; if DB not ready yet, defer to lazy reload
    this._loadFromDb();
  }

  _loadFromDb() {
    try {
      // Read both zapfit_* and legacy endurain_* for migration
      const rows = query("SELECT key, value FROM settings WHERE key LIKE 'zapfit_%' OR key LIKE 'endurain_%'");
      if (!rows || rows.length === 0) return;
      const map = {};
      for (const r of rows) map[r.key] = r.value;
      // Prefer zapfit_* , fallback to legacy, and migrate legacy -> zapfit_ if needed
      const pick = (k, legacy) => map[k] || map[legacy] || '';
      const baseVal = pick(SETTINGS_KEYS.serverUrl, LEGACY_KEYS.serverUrl);
      if (baseVal) this._baseUrl = normalizeBaseUrl(baseVal);
      this._accessToken = pick(SETTINGS_KEYS.accessToken, LEGACY_KEYS.accessToken) || null;
      this._refreshToken = pick(SETTINGS_KEYS.refreshToken, LEGACY_KEYS.refreshToken) || null;
      const uid = pick(SETTINGS_KEYS.userId, LEGACY_KEYS.userId);
      if (uid) this._userId = parseInt(uid, 10) || null;
      this._csrfToken = pick(SETTINGS_KEYS.csrfToken, LEGACY_KEYS.csrfToken) || null;
      this._codeVerifier = pick(SETTINGS_KEYS.codeVerifier, LEGACY_KEYS.codeVerifier) || null;
      this._mfaUsername = pick(SETTINGS_KEYS.mfaUsername, LEGACY_KEYS.mfaUsername) || null;
      this._apiKey = pick(SETTINGS_KEYS.apiKey, LEGACY_KEYS.apiKey) || null;
      this._apiPassword = pick(SETTINGS_KEYS.apiPassword, LEGACY_KEYS.apiPassword) || null;
      // Auto-migrate legacy keys to new prefix (one-time)
      for (const field of Object.keys(SETTINGS_KEYS)) {
        const legacyVal = map[LEGACY_KEYS[field]];
        const newVal = map[SETTINGS_KEYS[field]];
        if (legacyVal && !newVal) {
          try { run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [SETTINGS_KEYS[field], legacyVal]); } catch(_){}
        }
      }
      if (Object.keys(map).some(k=>k.startsWith('endurain_'))) {
        try { saveDatabase(); } catch(_){}
      }
    } catch (e) {
      // DB not initialized yet (first run) — will lazy-load later
    }
  }

  _ensureLoaded() {
    if (!this._baseUrl) this._loadFromDb();
  }

  _saveSetting(key, value) {
    try {
      run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value || '']);
      saveDatabase();
    } catch (e) {
      console.error('ZapfitAPI: save error:', e.message);
    }
  }

  get isConfigured() { this._ensureLoaded(); return !!this._baseUrl; }
  get isAuthenticated() { this._ensureLoaded(); return !!this._accessToken; }
  get serverUrl() { this._ensureLoaded(); return this._baseUrl; }
  get userId() { this._ensureLoaded(); return this._userId; }

  _generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
  }

  _generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  // --- Auth ---

  async configureServer(serverUrl) {
    const normalized = normalizeBaseUrl(serverUrl);
    if (!normalized) throw new Error('Invalid server URL');
    // Server changed -> clear old session
    if (this._baseUrl !== normalized) {
      this._accessToken = null;
      this._refreshToken = null;
      this._userId = null;
      this._csrfToken = null;
      this._saveSetting(SETTINGS_KEYS.accessToken, '');
      this._saveSetting(SETTINGS_KEYS.refreshToken, '');
      this._saveSetting(SETTINGS_KEYS.userId, '');
      this._saveSetting(SETTINGS_KEYS.csrfToken, '');
      this._imageCache.clear();
    }
    this._baseUrl = normalized;
    this._saveSetting(SETTINGS_KEYS.serverUrl, this._baseUrl);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await fetch(`${this._baseUrl}/api/v1/public/server_settings`, {
        headers: { 'X-Client-Type': CLIENT_TYPE },
        signal: controller.signal,
      });
    } finally { clearTimeout(t); }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Server returned ${res.status} ${text.slice(0,200)}`);
    }
    return await res.json();
  }

  async login(username, password) {
    this._ensureLoaded();
    if (!this._baseUrl) throw new Error('Server not configured');
    // persist credentials for background refresh (like mobile SecureStorage username/password)
    try { this._saveSetting(SETTINGS_KEYS.username, username); this._saveSetting(SETTINGS_KEYS.password, password); this._saveSetting(LEGACY_KEYS.username, username); this._saveSetting(LEGACY_KEYS.password, password); } catch(_){}
    const codeVerifier = this._generateCodeVerifier();
    const codeChallenge = this._generateCodeChallenge(codeVerifier);
    const body = new URLSearchParams();
    body.append('username', username);
    body.append('password', password);
    const loginRes = await fetch(
      `${this._baseUrl}/api/v1/auth/login?code_challenge=${codeChallenge}&code_challenge_method=S256`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Client-Type': CLIENT_TYPE },
        body: body.toString(),
      }
    );
    if (!loginRes.ok) {
      let msg = `Login failed: ${loginRes.status}`;
      try {
        const text = await loginRes.text();
        try { const j = JSON.parse(text); const d = j.detail ?? j.message; msg = typeof d === 'string' ? d : (d ? JSON.stringify(d) : text.slice(0,400) || msg); } catch(_){ msg = text.slice(0,400) || msg; }
      } catch(_){}
      throw new Error(msg);
    }
    const loginData = await loginRes.json();
    if (loginData.mfa_required) {
      this._codeVerifier = codeVerifier;
      this._mfaUsername = loginData.username || username;
      this._saveSetting(SETTINGS_KEYS.codeVerifier, codeVerifier);
      this._saveSetting(SETTINGS_KEYS.mfaUsername, this._mfaUsername);
      return { mfa_required: true, username: this._mfaUsername };
    }
    const sessionId = loginData.session_id;
    if (!sessionId) throw new Error('No session_id in login response');
    return await this._exchangeTokens(sessionId, codeVerifier);
  }

  async loginWithMFA(mfaCode) {
    this._ensureLoaded();
    if (!this._baseUrl) throw new Error('Server not configured');
    if (!this._codeVerifier || !this._mfaUsername) throw new Error('No pending MFA login');
    // Client-side format validation (same as server schema)
    const totpOk = /^\d{6}$/.test(mfaCode);
    const backupOk = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(mfaCode);
    if (!totpOk && !backupOk) throw new Error('MFA код должен быть 6 цифр (TOTP) или XXXX-XXXX (резервный). Вы ввели: ' + mfaCode.slice(0,20));
    const codeChallenge = this._generateCodeChallenge(this._codeVerifier);
    const payload = JSON.stringify({ username: this._mfaUsername, mfa_code: mfaCode });
    console.log('[zapfit] MFA verify payload', payload, 'url', `${this._baseUrl}/api/v1/auth/mfa/verify?code_challenge=${codeChallenge}`);
    const res = await fetch(
      `${this._baseUrl}/api/v1/auth/mfa/verify?code_challenge=${codeChallenge}&code_challenge_method=S256`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-Type': CLIENT_TYPE },
        body: payload,
      }
    );
    if (!res.ok) {
      let msg = `MFA verification failed: ${res.status}`;
      try {
        const text = await res.text();
        try { const j = JSON.parse(text); const d = j.detail ?? j.message; msg = typeof d === 'string' ? d : (d ? JSON.stringify(d) : text.slice(0,400) || msg); } catch(_){ msg = text.slice(0,400) || msg; }
      } catch(_){}
      throw new Error(msg);
    }
    const data = await res.json();
    const sessionId = data.session_id;
    if (!sessionId) throw new Error('No session_id in MFA response');
    this._mfaUsername = null;
    this._saveSetting(SETTINGS_KEYS.mfaUsername, '');
    return await this._exchangeTokens(sessionId, this._codeVerifier);
  }

  setMfaSecret(secret) {
    const v = (secret||'').trim().replace(/\s/g,'').toUpperCase();
    this._saveSetting(SETTINGS_KEYS.mfaSecret, v);
    this._saveSetting(LEGACY_KEYS.mfaSecret, v);
  }
  getMfaSecret() {
    this._ensureLoaded();
    try {
      const r = query("SELECT value FROM settings WHERE key=?",[SETTINGS_KEYS.mfaSecret])[0]?.value
        || query("SELECT value FROM settings WHERE key=?",[LEGACY_KEYS.mfaSecret])[0]?.value || '';
      return r;
    } catch(_){ return ''; }
  }

  async _exchangeTokens(sessionId, codeVerifier) {
    const res = await fetch(
      `${this._baseUrl}/api/v1/public/idp/session/${sessionId}/tokens`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Type': CLIENT_TYPE }, body: JSON.stringify({ code_verifier: codeVerifier }) }
    );
    if (!res.ok) {
      let msg = `Token exchange failed: ${res.status}`;
      try {
        const text = await res.text();
        try { const j = JSON.parse(text); const d = j.detail ?? j.message; msg = typeof d === 'string' ? d : (d ? JSON.stringify(d) : text.slice(0,400) || msg); } catch(_){ msg = text.slice(0,400) || msg; }
      } catch(_){}
      throw new Error(msg);
    }
    const data = await res.json();
    this._accessToken = data.access_token;
    this._refreshToken = data.refresh_token;
    const csrfHeader = res.headers.get('x-csrf-token');
    if (csrfHeader) this._csrfToken = csrfHeader;
    this._saveSetting(SETTINGS_KEYS.accessToken, this._accessToken);
    this._saveSetting(SETTINGS_KEYS.refreshToken, this._refreshToken);
    if (this._csrfToken) this._saveSetting(SETTINGS_KEYS.csrfToken, this._csrfToken);
    this._codeVerifier = null;
    this._saveSetting(SETTINGS_KEYS.codeVerifier, '');
    await this.fetchProfile();
    return { success: true };
  }

  // TOTP helper for background MFA (port of otp/otp.dart)
  _base32Decode(str) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    str = str.toUpperCase().replace(/[^A-Z2-7]/g,'');
    let bits = '';
    for (const c of str) bits += alphabet.indexOf(c).toString(2).padStart(5,'0');
    const bytes = [];
    for (let i=0;i+8*Math.floor(bits.length/8);i+=8) bytes.push(parseInt(bits.slice(i,i+8),2));
    return Buffer.from(bytes);
  }
  _generateTOTP(secret, timeStep=30, digits=6) {
    try {
      const key = this._base32Decode(secret);
      const counter = Math.floor(Date.now()/1000 / timeStep);
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64BE(BigInt(counter),0);
      const hmac = crypto.createHmac('sha1', key).update(buf).digest();
      const offset = hmac[hmac.length-1] & 0x0f;
      const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % (10**digits);
      return code.toString().padStart(digits,'0');
    } catch(e){ return null; }
  }
  async _tryBackgroundLogin() {
    this._ensureLoaded();
    const username = query("SELECT value FROM settings WHERE key=?",[SETTINGS_KEYS.username])[0]?.value
      || query("SELECT value FROM settings WHERE key=?",[LEGACY_KEYS.username])[0]?.value || '';
    const password = query("SELECT value FROM settings WHERE key=?",[SETTINGS_KEYS.password])[0]?.value
      || query("SELECT value FROM settings WHERE key=?",[LEGACY_KEYS.password])[0]?.value || '';
    const mfaSecret = query("SELECT value FROM settings WHERE key=?",[SETTINGS_KEYS.mfaSecret])[0]?.value
      || query("SELECT value FROM settings WHERE key=?",[LEGACY_KEYS.mfaSecret])[0]?.value || '';
    if (!username || !password) { console.warn('[zapfit] background login: no stored credentials'); return false; }
    try {
      console.log('[zapfit] background login for', username);
      const res = await this.login(username, password);
      if (res && res.success) { console.log('[zapfit] background login OK'); return true; }
      if (res && res.mfa_required && mfaSecret) {
        const code = this._generateTOTP(mfaSecret);
        if (!code) { console.warn('[zapfit] TOTP gen failed'); return false; }
        console.log('[zapfit] background MFA code', code.slice(0,2)+'****');
        const mfaRes = await this.loginWithMFA(code);
        if (mfaRes && mfaRes.success) { console.log('[zapfit] background MFA OK'); return true; }
      }
    } catch(e){ console.warn('[zapfit] background login failed', e.message); }
    return false;
  }

  async refreshToken() {
    this._ensureLoaded();
    if (!this._refreshToken || !this._baseUrl) return await this._tryBackgroundLogin();
    const headersVariants = [];
    // Mobile spec: Authorization Bearer refresh_token (per docs, line 151)
    headersVariants.push({ 'Authorization': `Bearer ${this._refreshToken}`, 'X-Client-Type': CLIENT_TYPE, 'Content-Type': 'application/json', ...(this._csrfToken ? { 'X-CSRF-Token': this._csrfToken } : {}) });
    // Fallback Cookie variants (parity with older server, line 142)
    for (const ck of ['endurain_refresh_token','zapfit_refresh_token','refresh_token']) {
      headersVariants.push({ 'Cookie': `${ck}=${this._refreshToken}`, 'X-Client-Type': CLIENT_TYPE, 'Content-Type': 'application/json', ...(this._csrfToken ? { 'X-CSRF-Token': this._csrfToken } : {}) });
      headersVariants.push({ 'Cookie': `${ck}=${this._refreshToken}`, 'X-Client-Type': 'web', 'Content-Type': 'application/json', ...(this._csrfToken ? { 'X-CSRF-Token': this._csrfToken } : {}) });
    }
    // Also try Authorization + Cookie together
    headersVariants.push({ 'Authorization': `Bearer ${this._refreshToken}`, 'Cookie': `endurain_refresh_token=${this._refreshToken}`, 'X-Client-Type': CLIENT_TYPE, 'Content-Type': 'application/json' });

    for (const headers of headersVariants) {
      try {
        const res = await fetch(`${this._baseUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ refresh_token: this._refreshToken }),
        });
        if (res.ok) {
          const data = await res.json();
          this._accessToken = data.access_token;
          this._refreshToken = data.refresh_token || this._refreshToken;
          const csrfHeader = res.headers.get('x-csrf-token') || res.headers.get('X-CSRF-Token') || data.csrf_token;
          if (csrfHeader) this._csrfToken = csrfHeader;
          this._saveSetting(SETTINGS_KEYS.accessToken, this._accessToken);
          this._saveSetting(SETTINGS_KEYS.refreshToken, this._refreshToken);
          if (this._csrfToken) this._saveSetting(SETTINGS_KEYS.csrfToken, this._csrfToken);
          console.log('[zapfit] refresh OK via', headers['Authorization'] ? 'Authorization' : headers['Cookie'].split('=')[0], 'client', headers['X-Client-Type']);
          return true;
        } else {
          const txt = await res.text().catch(()=> '');
          console.warn('[zapfit] refresh failed', res.status, txt.slice(0,200), 'via', headers['Authorization'] ? 'Authorization' : headers['Cookie']?.split('=')[0], headers['X-Client-Type']);
        }
      } catch (e) {
        console.error('ZapfitAPI: refresh error:', e.message);
      }
    }
    console.log('[zapfit] refresh all variants failed, trying background login');
    return await this._tryBackgroundLogin();
  }

  // диагностический helper, чтобы UI показал причину 401
  get authDiagnostics() {
    this._ensureLoaded();
    return {
      hasAccess: !!this._accessToken,
      hasRefresh: !!this._refreshToken,
      hasCsrf: !!this._csrfToken,
      serverUrl: this._baseUrl,
      userId: this._userId,
      accessLen: this._accessToken ? this._accessToken.length : 0,
    };
  }

  async logout() {
    try {
      if (this._accessToken) await this._request('POST', '/api/v1/auth/logout');
    } catch (_) {}
    this._accessToken = null;
    this._refreshToken = null;
    this._userId = null;
    this._csrfToken = null;
    this._codeVerifier = null;
    this._mfaUsername = null;
    for (const k of [SETTINGS_KEYS.accessToken, SETTINGS_KEYS.refreshToken, SETTINGS_KEYS.userId, SETTINGS_KEYS.csrfToken, SETTINGS_KEYS.codeVerifier, SETTINGS_KEYS.mfaUsername,
                     LEGACY_KEYS.accessToken, LEGACY_KEYS.refreshToken, LEGACY_KEYS.userId, LEGACY_KEYS.csrfToken, LEGACY_KEYS.codeVerifier, LEGACY_KEYS.mfaUsername]) {
      try { run("DELETE FROM settings WHERE key = ?", [k]); } catch(_){}
    }
    try { saveDatabase(); } catch(_){}
  }

  async clearServer() {
    await this.logout();
    this._baseUrl = null;
    for (const k of [SETTINGS_KEYS.serverUrl, LEGACY_KEYS.serverUrl]) {
      try { run("DELETE FROM settings WHERE key = ?", [k]); } catch(_){}
    }
    try { saveDatabase(); } catch(_){}
    this._imageCache.clear();
  }

  setApiKey(apiKey, apiPassword = '') {
    this._apiKey = apiKey || null;
    this._apiPassword = apiPassword || null;
    this._saveSetting(SETTINGS_KEYS.apiKey, this._apiKey || '');
    this._saveSetting(SETTINGS_KEYS.apiPassword, this._apiPassword || '');
    // keep legacy copy for migration
    this._saveSetting(LEGACY_KEYS.apiKey, this._apiKey || '');
    this._saveSetting(LEGACY_KEYS.apiPassword, this._apiPassword || '');
    // reload headers cache
    this._imageCache.clear();
  }
  get apiKey() { this._ensureLoaded(); return this._apiKey; }

  // --- HTTP ---
  async _request(method, path, body = null, extraHeaders = {}) {
    this._ensureLoaded();
    if (!this._baseUrl) throw new Error('Server not configured');
    const headers = { 'X-Client-Type': CLIENT_TYPE, ...extraHeaders };
    if (this._accessToken) headers['Authorization'] = `Bearer ${this._accessToken}`;
    if (this._csrfToken) headers['X-CSRF-Token'] = this._csrfToken;
    if (this._apiKey) {
      headers['X-API-Key'] = this._apiKey;
      if (this._apiPassword) headers['X-API-Password'] = this._apiPassword;
    }
    if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    // API key as query param fallback (server ALLOW_API_KEY_QUERY_PARAM)
    let url = `${this._baseUrl}${path}`;
    if (this._apiKey && path.includes('/api/v1/')) {
      const sep = url.includes('?') ? '&' : '?';
      url += `${sep}api_key=${encodeURIComponent(this._apiKey)}`;
      if (this._apiPassword) url += `&api_password=${encodeURIComponent(this._apiPassword)}`;
    }
    const opts = { method, headers };
    if (body) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    let res = await fetch(url, opts);
    if (res.status === 401) {
      // refreshToken() сам сводится к фоновому логину по сохраненному
      // логину/паролю, когда refresh-токена нет — как в мобилке.
      const refreshed = await this.refreshToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this._accessToken}`;
        if (this._csrfToken) headers['X-CSRF-Token'] = this._csrfToken;
        res = await fetch(url, { method, headers, body: opts.body });
      }
    }
    return res;
  }

  // --- Profile ---
  async fetchProfile() {
    const res = await this._request('GET', '/api/v1/profile');
    if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
    const data = await res.json();
    this._userId = data.id;
    this._saveSetting(SETTINGS_KEYS.userId, String(this._userId));
    return data;
  }

  async updateProfile(data) {
    const res = await this._request('PUT', '/api/v1/profile', data);
    if (!res.ok) throw new Error(`Profile update failed: ${res.status}`);
    return await res.json();
  }

  // --- Activities ---
  async getActivities(page = 1, perPage = 30) {
    this._ensureLoaded();
    if (!this._userId) await this.fetchProfile();
    const res = await this._request('GET', `/api/v1/activities/user/${this._userId}/page_number/${page}/num_records/${perPage}`);
    if (!res.ok) throw new Error(`Activities fetch failed: ${res.status}`);
    const data = await res.json();
    // Server returns array directly or {records:[]}
    if (Array.isArray(data)) return data;
    if (data.records && Array.isArray(data.records)) return data.records;
    return data || [];
  }

  async getActivitiesRefresh() {
    // Like mobile sync: last 24h aggregated from Strava/Garmin
    const res = await this._request('GET', '/api/v1/activities/refresh');
    if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
    const data = await res.json();
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.records) return data.records;
    return [];
  }

  async getAllActivities(perPage = 50) {
    // Paginated fetch all activities for initial sync
    let page = 1;
    const all = [];
    while (true) {
      const batch = await this.getActivities(page, perPage);
      if (!batch || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < perPage) break;
      page += 1;
      if (page > 20) break; // safety
    }
    return all;
  }

  async deleteActivity(activityId) {
    const res = await this._request('DELETE', `/api/v1/activities/${activityId}/delete`);
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  }

  async getActivityMedia(activityId) {
    const res = await this._request('GET', `/api/v1/activities_media/activity_id/${activityId}`);
    if (!res.ok) throw new Error(`Media fetch failed: ${res.status}`);
    const data = await res.json();
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.records) return data.records;
    return [];
  }

  // --- Health ---
  async getHealthRecords(type, page = 1, perPage = 50) {
    // correct endpoint per mobile: GET /health/{type}
    const res = await this._request('GET', `/api/v1/health/${type}?page_number=${page}&num_records=${perPage}`);
    if (!res.ok) throw new Error(`Health ${type} failed: ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) return data;
    return data.records || data || [];
  }

  async addHealthRecord(type, record) {
    const res = await this._request('POST', `/api/v1/health/${type}`, record);
    if (!res.ok) throw new Error(`Health ${type} add failed: ${res.status}`);
    return await res.json();
  }

  async getWeight(p, pp) { return this.getHealthRecords('weight', p, pp); }
  async addWeight(r) { return this.addHealthRecord('weight', r); }
  async getSleep(p, pp) { return this.getHealthRecords('sleep', p, pp); }
  async addSleep(r) { return this.addHealthRecord('sleep', r); }
  async getSteps(p, pp) { return this.getHealthRecords('steps', p, pp); }
  async addSteps(r) { return this.addHealthRecord('steps', r); }
  async getWater(p, pp) { return this.getHealthRecords('water', p, pp); }
  async addWater(r) { return this.addHealthRecord('water', r); }
  async getHeartRate(p, pp) { return this.getHealthRecords('heart_rate', p, pp); }
  async addHeartRate(r) { return this.addHealthRecord('heart_rate', r); }

  // Health extras (server has these but desktop не качал)
  async getHealthTargets() {
    const res = await this._request('GET', '/api/v1/health/targets');
    if (!res.ok) throw new Error(`Health targets failed: ${res.status}`);
    return await res.json();
  }
  async getHealthFasting(page=1, perPage=50) {
    try {
      const res = await this._request('GET', `/api/v1/health/fasting?page_number=${page}&num_records=${perPage}`);
      if (!res.ok) throw new Error(`f ${res.status}`);
      const d = await res.json(); return Array.isArray(d)?d:(d.records||d||[]);
    } catch(e){ throw e; }
  }
  async getHealthPoop(page=1, perPage=50) {
    const res = await this._request('GET', `/api/v1/health/poop?page_number=${page}&num_records=${perPage}`);
    if (!res.ok) throw new Error(`Health poop failed: ${res.status}`);
    const d = await res.json(); return Array.isArray(d)?d:(d.records||d||[]);
  }
  async getHealthStatsDaily(date=null) {
    // GET /health/stats/daily даёт sleep/weight/steps/water/poop одним запросом
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    // try canonical, fallback variants
    for (const p of [`/api/v1/health/stats/daily${q}`, `/api/v1/health/dashboard${q}`, `/api/v1/health/stats/dashboard${q}`]) {
      try {
        const res = await this._request('GET', p);
        if (res.ok) return await res.json();
      } catch(_){}
    }
    throw new Error('Health stats daily failed: 404');
  }
  async getHealthDashboard() { return this.getHealthStatsDaily(); }

  // Nutrition
  async getNutrition(params={}) {
    const qs = new URLSearchParams(params).toString();
    const suffix = qs ? `?${qs}` : '';
    for (const p of [`/api/v1/nutrition${suffix}`, `/api/v1/nutritions${suffix}`, `/api/v1/nutrition/list${suffix}`]) {
      try { const r=await this._request('GET', p); if(r.ok) return await r.json(); } catch(_){}
    }
    throw new Error('Nutrition fetch failed');
  }
  async createNutrition(data) {
    for (const p of ['/api/v1/nutrition','/api/v1/nutritions','/api/v1/nutrition/create']) {
      try { const r=await this._request('POST', p, data); if(r.ok) return await r.json(); } catch(_){}
    }
    throw new Error('Nutrition create failed');
  }

  // Profile goals / default gear
  async getProfileGoals() {
    for (const p of ['/api/v1/profile/goals','/api/v1/goals','/api/v1/profile/goal']) {
      try{ const r=await this._request('GET', p); if(r.ok) return await r.json(); }catch(_){}
    }
    throw new Error('Goals fetch failed');
  }
  async createProfileGoal(data) {
    const res = await this._request('POST', '/api/v1/profile/goals', data);
    if(!res.ok) throw new Error(`Create goal failed: ${res.status}`); return await res.json();
  }
  async getProfileGoalsProgress() {
    const res = await this._request('GET', '/api/v1/profile/goals/results');
    if(!res.ok) throw new Error(`Goals progress failed: ${res.status}`);
    const d = await res.json(); return Array.isArray(d) ? d : (d.records || d.results || []);
  }
  async deleteProfileGoal(goalId) {
    const res = await this._request('DELETE', `/api/v1/profile/goals/${goalId}`);
    if(!res.ok && res.status !== 204) throw new Error(`Delete goal failed: ${res.status}`); return true;
  }
  async getDefaultGear() {
    const res = await this._request('GET', '/api/v1/profile/default_gear');
    if(!res.ok) throw new Error(`Default gear failed: ${res.status}`); return await res.json();
  }
  async setDefaultGear(gearId) {
    const res = await this._request('PUT', '/api/v1/profile/default_gear', { gear_id: gearId });
    if(!res.ok) throw new Error(`Set default gear failed: ${res.status}`); return await res.json();
  }
  // Users search
  async searchUsers(queryStr, page=1, perPage=20) {
    const res = await this._request('GET', `/api/v1/users?search=${encodeURIComponent(queryStr)}&page_number=${page}&num_records=${perPage}`);
    if(!res.ok) throw new Error(`Users search failed: ${res.status}`);
    const d=await res.json(); if(Array.isArray(d)) return d; return d.records||d.users||d||[];
  }
  async getServerSettings() {
    const res = await this._request('GET', '/api/v1/server_settings');
    if(!res.ok) throw new Error(`Server settings failed: ${res.status}`); return await res.json();
  }
  // Strava/Garmin direct if linked
  async getStravaActivities() {
    for(const p of ['/api/v1/strava/activities','/api/v1/garminconnect/activities','/api/v1/strava']) { try{ const r=await this._request('GET', p); if(r.ok) return await r.json(); }catch(_){} }
    throw new Error('Strava/Garmin fetch failed');
  }

  // --- Activities PUSH (FIT/GPX upload) ---
  async _requestMultipart(path, formData, extraHeaders={}) {
    this._ensureLoaded();
    if (!this._baseUrl) throw new Error('Server not configured');
    const headers = { 'X-Client-Type': CLIENT_TYPE, ...extraHeaders, ...formData.getHeaders() };
    if (this._accessToken) headers['Authorization'] = `Bearer ${this._accessToken}`;
    if (this._csrfToken) headers['X-CSRF-Token'] = this._csrfToken;
    if (this._apiKey) {
      headers['X-API-Key'] = this._apiKey;
      if (this._apiPassword) headers['X-API-Password'] = this._apiPassword;
    }
    let url = `${this._baseUrl}${path}`;
    if (this._apiKey && path.includes('/api/v1/')) {
      const sep = url.includes('?') ? '&' : '?';
      url += `${sep}api_key=${encodeURIComponent(this._apiKey)}`;
      if (this._apiPassword) url += `&api_password=${encodeURIComponent(this._apiPassword)}`;
    }
    let res = await fetch(url, { method: 'POST', headers, body: formData });
    if (res.status === 401 && this._refreshToken) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this._accessToken}`;
        if (this._csrfToken) headers['X-CSRF-Token'] = this._csrfToken;
        res = await fetch(url, { method: 'POST', headers, body: formData });
      }
    }
    return res;
  }
  async uploadActivityFile(filePath) {
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), path.basename(filePath));
    // some servers expect 'files' or 'fit_file' — stick to 'file' primary, fallback handled by caller if 422
    const res = await this._requestMultipart('/api/v1/activities/create/upload', form);
    if (!res.ok) {
      const t = await res.text().catch(()=> '');
      throw new Error(`Upload failed: ${res.status} ${t.slice(0,400)}`);
    }
    return await res.json().catch(()=> ({success:true}));
  }
  async bulkImportActivities(filePaths) {
    const form = new FormData();
    for (const fp of filePaths) {
      if (!fs.existsSync(fp)) continue;
      form.append('files', fs.createReadStream(fp), path.basename(fp));
    }
    // fallback field name 'file' if server expects single file param repeated
    const res = await this._requestMultipart('/api/v1/activities/create/bulkimport', form);
    if (!res.ok) {
      const t = await res.text().catch(()=> '');
      throw new Error(`Bulk import failed: ${res.status} ${t.slice(0,400)}`);
    }
    return await res.json().catch(()=> ({success:true}));
  }

  // Gear PUSH
  async createGear(data) {
    const res = await this._request('POST', '/api/v1/gears', data);
    if (!res.ok) { const t=await res.text().catch(()=> ''); throw new Error(`Create gear failed: ${res.status} ${t.slice(0,300)}`); }
    return await res.json();
  }
  async createGearComponent(data) {
    const res = await this._request('POST', '/api/v1/gear_components', data);
    if (!res.ok) { const t=await res.text().catch(()=> ''); throw new Error(`Create gear component failed: ${res.status} ${t.slice(0,300)}`); }
    return await res.json();
  }
  async uploadGearImage(gearId, imagePath) {
    if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);
    const form = new FormData();
    form.append('file', fs.createReadStream(imagePath), path.basename(imagePath));
    form.append('gear_id', String(gearId));
    const res = await this._requestMultipart(`/api/v1/gear_images/gear/${gearId}`, form);
    // fallback to generic POST
    if (!res.ok) {
      const form2 = new FormData();
      form2.append('file', fs.createReadStream(imagePath), path.basename(imagePath));
      const r2 = await this._requestMultipart('/api/v1/gear_images', form2);
      if (!r2.ok) { const t=await r2.text().catch(()=> ''); throw new Error(`Gear image upload failed: ${r2.status} ${t.slice(0,300)}`); }
      return await r2.json().catch(()=>({success:true}));
    }
    return await res.json().catch(()=>({success:true}));
  }

  // Activity extras: streams/laps/comments etc
  async getActivityStreams(activityId) {
    const res = await this._request('GET', `/api/v1/activities_streams/activity_id/${activityId}`);
    if (!res.ok) throw new Error(`Streams failed: ${res.status}`); const d=await res.json(); return Array.isArray(d)?d:(d.records||d||[]);
  }
  async getActivityLaps(activityId) {
    const res = await this._request('GET', `/api/v1/activities_laps/activity_id/${activityId}`);
    if (!res.ok) throw new Error(`Laps failed: ${res.status}`); const d=await res.json(); return Array.isArray(d)?d:(d.records||d||[]);
  }
  async getActivityComments(activityId) {
    const res = await this._request('GET', `/api/v1/activities_comments/activity_id/${activityId}`);
    if (!res.ok) throw new Error(`Comments failed: ${res.status}`); const d=await res.json(); return Array.isArray(d)?d:(d.records||d||[]);
  }
  async createActivityComment(data) {
    const res = await this._request('POST', '/api/v1/activities_comments', data);
    if (!res.ok) throw new Error(`Comment create failed: ${res.status}`); return await res.json();
  }

  // --- Gear ---
  async getGears() {
    const res = await this._request('GET', '/api/v1/gears');
    if (!res.ok) throw new Error(`Gears fetch failed: ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) return data;
    return data.records || data || [];
  }

  // --- Notifications ---
  async getNotifications(page = 1, perPage = 20) {
    const res = await this._request('GET', `/api/v1/notifications/page_number/${page}/num_records/${perPage}`);
    if (!res.ok) throw new Error(`Notifications failed: ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (data.records) return data.records;
    if (data.notifications) return data.notifications;
    return data;
  }

  async getNotificationsCount() {
    const res = await this._request('GET', `/api/v1/notifications/number`);
    if (!res.ok) throw new Error(`Notifications count failed: ${res.status}`);
    const data = await res.text();
    try { const j = JSON.parse(data); if (typeof j === 'number') return j; if (j.count != null) return j.count; if (j.number != null) return j.number; return j; } catch(_){ const n = parseInt(data,10); return isNaN(n)?0:n; }
  }

  async markNotificationRead(id) {
    const res = await this._request('PUT', `/api/v1/notifications/${id}/mark_as_read`);
    if (!res.ok) throw new Error(`Mark read failed: ${res.status}`);
  }

  async markAllNotificationsRead() {
    const res = await this._request('PUT', `/api/v1/notifications/mark_all_as_read`);
    if (!res.ok) {
      // fallback: no endpoint, let caller handle per-item
      throw new Error(`Mark all read failed: ${res.status}`);
    }
  }

  async _enrichFollowers(list) {
    // server returns only {follower_id, following_id, is_accepted} — fetch user profiles for display
    if (!Array.isArray(list) || list.length===0) return list;
    const enriched = [];
    for (const f of list) {
      const targetId = f.following_id && f.follower_id === this._userId ? f.following_id : (f.follower_id || f.following_id);
      const isFollowing = f.follower_id === this._userId;
      try {
        const uid = isFollowing ? f.following_id : f.follower_id;
        const res = await this._request('GET', `/api/v1/users/id/${uid}`);
        if (res.ok) {
          const u = await res.json();
          enriched.push({ ...f, ...u, username: u.username || u.name, photo_path: u.photo_path, _targetId: uid });
        } else {
          enriched.push({ ...f, username: `User ${uid}`, _targetId: uid });
        }
      } catch(_) { enriched.push({ ...f, username: `User ${targetId}` }); }
    }
    return enriched;
  }
  // --- Followers ---
  async getFollowers() {
    this._ensureLoaded();
    if (!this._userId) await this.fetchProfile();
    const res = await this._request('GET', `/api/v1/followers/user/${this._userId}/followers/all`);
    if (!res.ok) throw new Error(`Followers failed: ${res.status}`);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (data.records || data);
    return await this._enrichFollowers(Array.isArray(arr)?arr:[]);
  }
  async getFollowing() {
    this._ensureLoaded();
    if (!this._userId) await this.fetchProfile();
    const res = await this._request('GET', `/api/v1/followers/user/${this._userId}/following/all`);
    if (!res.ok) throw new Error(`Following failed: ${res.status}`);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (data.records || data);
    return await this._enrichFollowers(Array.isArray(arr)?arr:[]);
  }
  async getFriendsFeed(page=1, perPage=20) {
    this._ensureLoaded();
    if (!this._userId) await this.fetchProfile();
    const res = await this._request('GET', `/api/v1/activities/user/${this._userId}/followed/page_number/${page}/num_records/${perPage}`);
    if (!res.ok) throw new Error(`Friends feed failed: ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (data.records) return data.records;
    return data || [];
  }

  // --- Strength workouts (parity with mobile WorkoutsScreen + web WorkoutsView) ---
  async getWorkoutPlans() {
    const res = await this._request('GET', '/api/v1/workouts');
    if (!res.ok) throw new Error(`Workout plans failed: ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.records || data || []);
  }

  async createWorkoutPlan(body) {
    const res = await this._request('POST', '/api/v1/workouts', body);
    if (!res.ok) throw new Error(`Create plan failed: ${res.status}`);
    return await res.json();
  }

  async updateWorkoutPlan(planId, body) {
    const res = await this._request('PUT', `/api/v1/workouts/${planId}`, body);
    if (!res.ok) throw new Error(`Update plan failed: ${res.status}`);
    return await res.json();
  }

  async deleteWorkoutPlan(planId) {
    const res = await this._request('DELETE', `/api/v1/workouts/${planId}`);
    if (!res.ok) throw new Error(`Delete plan failed: ${res.status}`);
    return true;
  }

  async getWorkoutSessions(dateFrom = null, dateTo = null) {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set('date_from', dateFrom);
    if (dateTo) qs.set('date_to', dateTo);
    const q = qs.size ? `?${qs}` : '';
    const res = await this._request('GET', `/api/v1/workouts/sessions${q}`);
    if (!res.ok) throw new Error(`Workout sessions failed: ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.records || data || []);
  }

  async createWorkoutSession(body) {
    const res = await this._request('POST', '/api/v1/workouts/sessions', body);
    if (!res.ok) throw new Error(`Create session failed: ${res.status}`);
    return await res.json();
  }

  async deleteWorkoutSession(sessionId) {
    const res = await this._request('DELETE', `/api/v1/workouts/sessions/${sessionId}`);
    if (!res.ok) throw new Error(`Delete session failed: ${res.status}`);
    return true;
  }

  async searchWorkoutCatalog(q = '', opts = {}) {
    const qs = new URLSearchParams();
    if (q?.trim()) qs.set('q', q.trim());
    if (opts.category_id != null) qs.set('category_id', String(opts.category_id));
    if (opts.equipment_id != null) qs.set('equipment_id', String(opts.equipment_id));
    if (opts.muscle_id != null) qs.set('muscle_id', String(opts.muscle_id));
    if (opts.lang) qs.set('lang', opts.lang);
    qs.set('limit', String(opts.limit || 50));
    const res = await this._request('GET', `/api/v1/workouts/exercises?${qs}`);
    if (!res.ok) throw new Error(`Catalog search failed: ${res.status}`);
    return await res.json();
  }

  async getCatalogExercise(wgerId) {
    const res = await this._request('GET', `/api/v1/workouts/exercises/${wgerId}`);
    if (!res.ok) throw new Error(`Catalog exercise failed: ${res.status}`);
    return await res.json();
  }

  async translateCatalogExercise(wgerId, language = 'ru') {
    const res = await this._request('POST', `/api/v1/workouts/exercises/${wgerId}/translate`, { language });
    if (!res.ok) throw new Error(`Translate failed: ${res.status}`);
    return await res.json();
  }

  async getWorkoutAiStatus() {
    const res = await this._request('GET', '/api/v1/workouts/ai/status');
    if (!res.ok) throw new Error(`AI status failed: ${res.status}`);
    return await res.json();
  }

  async generateWorkoutAiPlan(prompt, language = null) {
    const res = await this._request('POST', '/api/v1/workouts/ai/plan', { prompt, language });
    if (!res.ok) throw new Error(`AI plan failed: ${res.status}`);
    return await res.json();
  }

  // --- Author profiles + comments (feed parity with mobile) ---
  async getUserById(uid) {
    const res = await this._request('GET', `/api/v1/users/id/${uid}`);
    if (!res.ok) throw new Error(`User ${uid} failed: ${res.status}`);
    return await res.json();
  }

  async getActivityComments(activityId) {
    const res = await this._request('GET', `/api/v1/activities_comments/activity_id/${activityId}`);
    if (!res.ok) throw new Error(`Comments failed: ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async createActivityComment(activityId, content) {
    const res = await this._request('POST', `/api/v1/activities_comments/activity_id/${activityId}`, { content });
    if (!res.ok) throw new Error(`Comment post failed: ${res.status}`);
    return await res.json();
  }

  async getActivityCommentCounts(activityIds) {
    const res = await this._request('POST', '/api/v1/activities_comments/counts', { activity_ids: activityIds });
    if (!res.ok) throw new Error(`Comment counts failed: ${res.status}`);
    const data = await res.json();
    return data?.counts || {};
  }

  async acceptFollowRequest(userId) {
    const res = await this._request('POST', `/api/v1/followers/${userId}/accept`);
    if (!res.ok) throw new Error(`Accept failed: ${res.status}`);
  }

  async rejectFollowRequest(userId) {
    const res = await this._request('POST', `/api/v1/followers/${userId}/reject`);
    if (!res.ok) throw new Error(`Reject failed: ${res.status}`);
  }

  // --- Images (parity with mobile ApiClient.getImageBytes) ---
  async getImageBytes(imageUrl) {
    this._ensureLoaded();
    if (!imageUrl) throw new Error('No image url');
    if (this._imageCache.has(imageUrl)) return this._imageCache.get(imageUrl);
    // Absolute?
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const headers = {};
      if (this._accessToken) headers['Authorization'] = `Bearer ${this._accessToken}`;
      if (this._csrfToken) headers['X-CSRF-Token'] = this._csrfToken;
      headers['X-Client-Type'] = CLIENT_TYPE;
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(imageUrl, { headers, signal: controller.signal });
        clearTimeout(t);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          this._imageCache.set(imageUrl, buf);
          return buf;
        }
      } catch (_) {}
    }
    const candidates = buildImageCandidates(this._baseUrl, imageUrl);
    for (const url of candidates) {
      try {
        const headers = {};
        if (this._accessToken) headers['Authorization'] = `Bearer ${this._accessToken}`;
        if (this._csrfToken) headers['X-CSRF-Token'] = this._csrfToken;
        headers['X-Client-Type'] = CLIENT_TYPE;
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10000);
        let res = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(t);
        if (res.status === 401 && this._refreshToken) {
          const ok = await this.refreshToken();
          if (ok) {
            headers['Authorization'] = `Bearer ${this._accessToken}`;
            const c2 = new AbortController();
            const t2 = setTimeout(() => c2.abort(), 10000);
            res = await fetch(url, { headers, signal: c2.signal });
            clearTimeout(t2);
          }
        }
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          this._imageCache.set(imageUrl, buf);
          return buf;
        }
      } catch (_) {}
    }
    throw new Error(`Image not found: ${imageUrl}`);
  }

  getImageUrl(imagePath) {
    this._ensureLoaded();
    if (!imagePath) return null;
    if (imagePath.startsWith('http')) return imagePath;
    // Build full URL for rendering via <img src> with auth via query? Use direct fetch bytes instead.
    // For <img> tags we return server URL; renderer should use bytes via IPC.
    const clean = imagePath.startsWith('/') ? imagePath : '/' + imagePath;
    return `${this._baseUrl}${clean}`;
  }
}

module.exports = new ZapfitAPI();
