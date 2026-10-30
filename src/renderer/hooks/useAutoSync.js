import { useEffect, useRef } from 'react';

// Global auto-sync like mobile AutoSyncService:
// - first run 30s after start (as in mobile _startTimer)
// - then every N minutes (default 15) calls zapfit-sync-all silently
// - settings keys: autoSyncEnabled (default '1'), autoSyncIntervalMinutes (default '15')
// Listens to 'settings-updated' to re-apply without restart.
export default function useAutoSync() {
  const timerRef = useRef(null);
  const firstRunRef = useRef(null);

  useEffect(() => {
    const readSettings = async () => {
      try {
        const s = await window.electronAPI?.getSettings?.();
        const enabled = s?.autoSyncEnabled === undefined ? true : String(s.autoSyncEnabled) !== '0';
        const intervalMin = Math.max(5, parseInt(s?.autoSyncIntervalMinutes || '15', 10) || 15);
        return { enabled, intervalMin };
      } catch {
        return { enabled: true, intervalMin: 15 };
      }
    };

    const doSync = async (silent = true) => {
      try {
        const st = await window.electronAPI?.zapfitStatus?.();
        if (!st?.authenticated) return false;
        const r = await window.electronAPI?.zapfitSyncAll?.();
        if (r?.success) {
          try { localStorage.setItem('zapfit:autoSync:lastSync', new Date().toISOString()); } catch {}
          window.dispatchEvent(new Event('settings-updated'));
          window.dispatchEvent(new Event('activities-updated'));
          window.dispatchEvent(new Event('health-updated'));
          window.dispatchEvent(new Event('water-updated'));
          window.dispatchEvent(new Event('gears-updated'));
          window.dispatchEvent(new Event('profile-updated'));
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    let cancelled = false;
    const apply = async () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (firstRunRef.current) { clearTimeout(firstRunRef.current); firstRunRef.current = null; }
      const { enabled, intervalMin } = await readSettings();
      if (cancelled || !enabled) return;
      // first run 30s after start, like mobile
      firstRunRef.current = setTimeout(() => { doSync(true); }, 30000);
      timerRef.current = setInterval(() => { doSync(true); }, intervalMin * 60 * 1000);
    };

    apply();
    const onSettings = () => { apply(); };
    window.addEventListener('settings-updated', onSettings);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (firstRunRef.current) clearTimeout(firstRunRef.current);
      window.removeEventListener('settings-updated', onSettings);
    };
  }, []);
}
