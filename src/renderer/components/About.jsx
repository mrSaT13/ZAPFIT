import React, { useEffect, useState } from 'react';
import { Info, Download, RefreshCw, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';

export default function About({ theme = 'dark' }) {
  const [appInfo, setAppInfo] = useState(null);
  const [upd, setUpd] = useState({ status: 'idle', info: null, error: null, progress: null });
  const [ghRepo, setGhRepo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        if (window.electronAPI?.getAppInfo) setAppInfo(await window.electronAPI.getAppInfo());
        if (window.electronAPI?.getGithubRepo) {
          const r = await window.electronAPI.getGithubRepo();
          if (r?.success) setGhRepo(r);
        }
      } catch (e) { console.error(e); }
      // live updater events (electron-updater)
      if (window.electronAPI?.onUpdaterStatus) {
        window.electronAPI.onUpdaterStatus((data) => {
          if (data.status === 'downloading') setUpd(s => ({ ...s, status: 'downloading', progress: data.progress }));
          else if (data.status === 'downloaded') setUpd(s => ({ ...s, status: 'downloaded', info: data.info }));
          else if (data.status === 'available') setUpd(s => ({ ...s, status: 'available', info: data.info }));
          else if (data.status === 'error') setUpd(s => ({ ...s, status: 'error', error: data.error }));
        });
      }
    })();
    return () => { try{ window.electronAPI?.offUpdaterStatus?.(); }catch(_){} };
  }, []);

  const handleCheck = async () => {
    setUpd({ status: 'checking', info: null, error: null, progress: null });
    try {
      const r = await window.electronAPI.checkForUpdates();
      if (!r?.success) { setUpd({ status: 'error', error: r?.error || 'Ошибка проверки' }); return; }
      if (r.isNewer) setUpd({ status: 'available', info: r });
      else setUpd({ status: 'not-available', info: r });
    } catch (e) { setUpd({ status: 'error', error: e.message }); }
  };

  const handleDownload = async () => {
    setUpd(s => ({ ...s, status: 'downloading', progress: { percent: 0 } }));
    try {
      const r = await window.electronAPI.downloadUpdate();
      if (!r?.success) setUpd(s => ({ ...s, status: 'error', error: r?.error }));
      else if (r.via === 'browser') setUpd(s => ({ ...s, status: 'browser', info: r }));
    } catch (e) { setUpd(s => ({ ...s, status: 'error', error: e.message })); }
  };

  const handleInstall = async () => {
    try { await window.electronAPI.quitAndInstall(); } catch(e){ setUpd(s=>({...s, error:e.message, status:'error'})); }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-lg bg-indigo-600/10 text-indigo-400"><Info size={24} /></div>
        <div>
          <h2 className="text-2xl font-bold">О приложении</h2>
          <p className="text-sm text-gray-400">Информация о приложении и авторе.</p>
        </div>
      </div>

      {appInfo ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-indigo-400">{appInfo.name}</h3>
          <p className="text-sm text-gray-400">Версия: {appInfo.version}</p>
          <p className="text-xs text-gray-500 mt-1">Год: {appInfo.year} · Сборка {appInfo.version} · {ghRepo ? `GitHub: ${ghRepo.owner}/${ghRepo.repo}` : ''}</p>
          <p className={`mt-3 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-slate-700'}`}>{appInfo.description}</p>
          <p className="mt-4 text-xs text-gray-400">Автор: <a className="text-indigo-300" href={appInfo.homepage} target="_blank" rel="noreferrer">{appInfo.developer}</a></p>
        </div>
      ) : (<p className="text-gray-400">Загрузка...</p>)}

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold flex items-center gap-2"><RefreshCw size={18} className={upd.status==='checking'?'animate-spin':''}/> Обновления</h3>
        <p className="text-xs text-gray-400">Проверка через GitHub Releases (electron-updater + API fallback). Программная установка без браузера.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleCheck} disabled={upd.status==='checking'||upd.status==='downloading'} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-2">
            <RefreshCw size={16}/> {upd.status==='checking'?'Проверка...':'Проверить обновления'}
          </button>
          {upd.status==='available' && (
            <button onClick={handleDownload} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center gap-2">
              <Download size={16}/> Скачать {upd.info?.latestVersion ? `v${upd.info.latestVersion}`:''}
            </button>
          )}
          {upd.status==='downloaded' && (
            <button onClick={handleInstall} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-sm font-bold">
              Перезапустить и установить
            </button>
          )}
          {upd.status==='browser' && upd.info?.url && (
            <a href={upd.info.url} target="_blank" rel="noreferrer" className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm flex items-center gap-2">
              Открыть релиз <ExternalLink size={14}/>
            </a>
          )}
        </div>
        {upd.status==='downloading' && upd.progress && (
          <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all" style={{width:`${upd.progress.percent||0}%`}}/>
          </div>
        )}
        {upd.status==='available' && upd.info && (
          <div className="text-xs p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex gap-2">
            <CheckCircle size={16} className="text-emerald-400 shrink-0"/> <div><div className="font-bold text-emerald-300">Доступно обновление v{upd.info.latestVersion} (текущая v{upd.info.currentVersion})</div><div className="text-gray-400 line-clamp-3 mt-1">{upd.info.body?.slice(0,300)}</div><a href={upd.info.htmlUrl} target="_blank" rel="noreferrer" className="text-indigo-300 underline">Открыть на GitHub</a></div>
          </div>
        )}
        {upd.status==='not-available' && (
          <div className="text-xs p-3 bg-white/5 border border-white/10 rounded-xl flex gap-2"><CheckCircle size={16} className="text-green-400 shrink-0"/> У вас последняя версия v{upd.info?.currentVersion || appInfo?.version}</div>
        )}
        {upd.status==='error' && (
          <div className="text-xs p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-2"><AlertCircle size={16} className="text-red-400 shrink-0"/> Ошибка: {upd.error}</div>
        )}
        {upd.status==='downloaded' && (
          <div className="text-xs p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl">Обновление загружено. Перезапустите приложение для установки.</div>
        )}
      </div>
    </div>
  );
}
