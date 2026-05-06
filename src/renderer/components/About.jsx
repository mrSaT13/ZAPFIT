import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';

export default function About() {
  const [appInfo, setAppInfo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        if (window.electronAPI && window.electronAPI.getAppInfo) {
          const info = await window.electronAPI.getAppInfo();
          setAppInfo(info);
        }
      } catch (e) { console.error(e); }
    })();
  }, []);

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-6">
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
          <p className="mt-3 text-sm text-gray-300">{appInfo.description}</p>
          <p className="mt-4 text-xs text-gray-400">Автор: <a className="text-indigo-300" href={appInfo.homepage} target="_blank" rel="noreferrer">{appInfo.developer}</a></p>
        </div>
      ) : (
        <p className="text-gray-400">Загрузка...</p>
      )}
    </div>
  );
}
