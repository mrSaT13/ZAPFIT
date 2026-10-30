const { app, dialog, shell } = require('electron');
const fetch = require('node-fetch');

let autoUpdater = null;
let updateAvailableInfo = null;
let downloadProgress = null;
let checkInProgress = false;

// Try to load electron-updater only in packaged app (optional dep)
try {
  const upd = require('electron-updater');
  autoUpdater = upd.autoUpdater;
} catch (e) {
  console.log('[updater] electron-updater not available (dev or not installed):', e.message);
}

function getRepoFromSettings() {
  try {
    const db = require('./db');
    const row = db.query('SELECT value FROM settings WHERE key = ?', ['githubRepo']);
    if (row.length && row[0].value) return row[0].value;
  } catch (_) {}
  return null;
}

function getOwnerFromSettings() {
  try {
    const db = require('./db');
    const row = db.query('SELECT value FROM settings WHERE key = ?', ['githubOwner']);
    if (row.length && row[0].value) return row[0].value;
  } catch (_) {}
  return null;
}

function normalizeRepo() {
  // priority: settings > package.json repository > default
  let owner = getOwnerFromSettings();
  let repo = getRepoFromSettings();
  if (owner && repo) return { owner, repo };
  try {
    const pkg = require('../../package.json');
    if (pkg.repository && pkg.repository.url) {
      const m = pkg.repository.url.match(/github\.com\/([^/]+)\/([^/.]+)/);
      if (m) return { owner: m[1], repo: m[2] };
    }
  } catch (_) {}
  return { owner: 'mrSaT13', repo: 'zapfit' };
}

async function checkViaGitHubAPI() {
  const { owner, repo } = normalizeRepo();
  const current = app.getVersion();
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ZAPFIT-Updater'
    }
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = await res.json();
  const latestTag = (data.tag_name || '').replace(/^v/, '');
  const latest = latestTag || data.name || '';
  const assets = (data.assets || []).map(a => ({ name: a.name, browser_download_url: a.browser_download_url, size: a.size }));
  const installer = assets.find(a => a.name.endsWith('.exe')) || assets[0] || null;
  const isNewer = latest && latest !== current && compareVersions(latest, current) > 0;
  return {
    source: 'github-api',
    owner, repo,
    currentVersion: current,
    latestVersion: latest,
    latestTag: data.tag_name,
    publishedAt: data.published_at,
    body: data.body,
    htmlUrl: data.html_url,
    installerUrl: installer ? installer.browser_download_url : data.html_url,
    isNewer,
    assets
  };
}

function compareVersions(a, b) {
  const pa = a.split('.').map(n => parseInt(n,10)||0);
  const pb = b.split('.').map(n => parseInt(n,10)||0);
  for (let i=0;i<Math.max(pa.length,pb.length);i++) {
    const da = pa[i]||0, dbb = pb[i]||0;
    if (da > dbb) return 1;
    if (da < dbb) return -1;
  }
  return 0;
}

function setupAutoUpdater(mainWindow) {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    if (mainWindow) mainWindow.webContents.send('updater-status', { status: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    updateAvailableInfo = info;
    if (mainWindow) mainWindow.webContents.send('updater-status', { status: 'available', info });
  });
  autoUpdater.on('update-not-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('updater-status', { status: 'not-available', info });
  });
  autoUpdater.on('error', (err) => {
    if (mainWindow) mainWindow.webContents.send('updater-status', { status: 'error', error: err.message });
  });
  autoUpdater.on('download-progress', (p) => {
    downloadProgress = p;
    if (mainWindow) mainWindow.webContents.send('updater-status', { status: 'downloading', progress: p });
  });
  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('updater-status', { status: 'downloaded', info });
  });
}

async function checkForUpdates() {
  if (checkInProgress) return { status: 'checking' };
  checkInProgress = true;
  try {
    // Prefer electron-updater in packaged app
    if (autoUpdater && app.isPackaged) {
      try {
        const res = await autoUpdater.checkForUpdates();
        if (res && res.updateInfo) {
          const cur = app.getVersion();
          const latest = res.updateInfo.version;
          const isNewer = compareVersions(latest, cur) > 0;
          return { source: 'electron-updater', currentVersion: cur, latestVersion: latest, isNewer, updateInfo: res.updateInfo };
        }
      } catch (e) {
        console.warn('[updater] electron-updater check failed, fallback to API:', e.message);
      }
    }
    // Fallback to GitHub API (works in dev too)
    const gh = await checkViaGitHubAPI();
    return gh;
  } finally {
    checkInProgress = false;
  }
}

async function downloadUpdate() {
  if (autoUpdater && app.isPackaged) {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true, via: 'electron-updater' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  // In dev or without updater — open GitHub release page
  const gh = await checkViaGitHubAPI();
  if (gh.installerUrl) {
    await shell.openExternal(gh.installerUrl);
    return { success: true, via: 'browser', url: gh.installerUrl };
  }
  return { success: false, error: 'No installer URL' };
}

function quitAndInstall() {
  if (autoUpdater && app.isPackaged) {
    autoUpdater.quitAndInstall();
    return { success: true };
  }
  return { success: false, error: 'Not packaged or updater unavailable' };
}

function initUpdater(mainWindow) {
  setupAutoUpdater(mainWindow);
  // Auto-check 3 sec after window ready (only in packaged)
  if (app.isPackaged && autoUpdater) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(()=>{});
    }, 3000);
  }
  // Also periodic check every 6 hours in packaged
  if (app.isPackaged && autoUpdater) {
    setInterval(() => autoUpdater.checkForUpdates().catch(()=>{}), 6*60*60*1000);
  }
}

module.exports = {
  initUpdater,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  checkViaGitHubAPI,
  getRepo: normalizeRepo,
};
