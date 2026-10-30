import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Moon, Sun, Database, Palette, Type, Zap, Activity } from 'lucide-react';
import { toast } from 'react-toastify';

export default function Settings({ onNavigate, theme, setTheme, accentColor, setAccentColor, textColor, setTextColor }) {
    const [localSettings, setLocalSettings] = useState({
        language: 'ru',
        units: 'metric'
    });

    const colors = [
        '#5EADEB', // Endurain darkPrimary (mobile)
        '#1976D2', // Endurain lightPrimary (mobile)
        '#7EC8E3', // Endurain darkSecondary
        '#f97316', // Orange (legacy)
        '#3b82f6', // Blue
        '#8b5cf6', // Violet
        '#10b981', // Emerald
        '#ef4444', // Red
        '#f43f5e', // Rose
    ];
    
    const [lmStudioUrl, setLmStudioUrl] = useState('http://localhost:1234/v1');
    const [waterCupMl, setWaterCupMl] = useState(200);

    useEffect(() => {
        const load = async () => {
            if (window.electronAPI && window.electronAPI.getSettings) {
                const saved = await window.electronAPI.getSettings();
                setLocalSettings(prev => ({ ...prev, ...saved }));
                setLmStudioUrl(saved.lmStudioUrl || 'http://localhost:1234/v1');
                setWaterCupMl(saved.waterCupMl ? parseInt(saved.waterCupMl) : 200);
            }
        };
        load();
    }, []);

    

    const handleUpdate = async (key, value) => {
        if (key === 'theme') setTheme(value);
        if (key === 'accentColor') setAccentColor(value);
        if (key === 'textColor') setTextColor(value);
        
        if (window.electronAPI.updateSetting) {
            await window.electronAPI.updateSetting(key, value);
                try { window.dispatchEvent(new Event('settings-updated')); } catch(e) {}
        }
    };

    const cardClass = theme === 'dark' 
        ? 'bg-white/5 border-white/10' 
        : 'bg-white border-slate-200 shadow-sm';

    const itemBg = theme === 'dark' ? 'bg-black/20' : 'bg-slate-50';

    return (
        <div className="space-y-4 sm:space-y-8 animate-fade-in max-h-full overflow-y-auto pb-8 px-2 sm:px-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 mb-4 sm:mb-8">
                <div className="p-2 sm:p-3 rounded-2xl flex-shrink-0" style={{ backgroundColor: `${accentColor}20` }}>
                    <SettingsIcon style={{ color: accentColor }} size={24} />
                </div>
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold">Настройки</h2>
                    <p className={theme === 'dark' ? 'text-gray-400 text-xs sm:text-sm' : 'text-slate-500 text-xs sm:text-sm'}>Управление параметрами приложения</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mx-2 sm:mx-0">
                {/* Внешний вид */}
                <div className={`${cardClass} border rounded-2xl sm:rounded-3xl p-4 sm:p-6 backdrop-blur-md`}>
                    <h3 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 flex items-center gap-2">
                        <Palette size={18} style={{ color: accentColor }} />
                        Персонализация
                    </h3>
                    <div className="space-y-2 sm:space-y-4">
                        <div className={`flex items-center justify-between p-3 sm:p-4 ${itemBg} rounded-xl sm:rounded-2xl text-sm sm:text-base`}>
                            <span>Тема оформления</span>
                            <div className="flex bg-black/10 p-1 rounded-xl">
                                <button 
                                    onClick={() => handleUpdate('theme', 'light')}
                                    className={`px-4 py-1 rounded-lg transition-all ${theme === 'light' ? 'bg-white text-black shadow-sm' : 'text-gray-400'}`}
                                >
                                    <Sun size={16} />
                                </button>
                                <button 
                                    onClick={() => handleUpdate('theme', 'dark')}
                                    className={`px-4 py-1 rounded-lg transition-all ${theme === 'dark' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                                >
                                    <Moon size={16} />
                                </button>
                            </div>
                        </div>

                        <div className={`flex flex-col gap-2 sm:gap-3 p-3 sm:p-4 ${itemBg} rounded-xl sm:rounded-2xl text-sm sm:text-base`}>
                            <span>Акцентный цвет</span>
                            <div className="flex gap-2 sm:gap-3 flex-wrap">
                                {colors.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => handleUpdate('accentColor', color)}
                                        className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${accentColor === color ? 'border-white scale-110' : 'border-transparent'}`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className={`flex items-center justify-between p-4 ${itemBg} rounded-2xl`}>
                            <div className="flex items-center gap-2">
                                <Type size={18} />
                                <span>Цвет текста</span>
                            </div>
                            <select 
                                value={textColor}
                                onChange={(e) => handleUpdate('textColor', e.target.value)}
                                className={`rounded-xl px-3 py-1 outline-none text-sm border ${theme === 'dark' ? 'bg-black/10 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                            >
                                <option value="auto">Авто (системный)</option>
                                <option value="white">Всегда белый</option>
                                <option value="black">Всегда черный</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Данные */}
                <div className={`${cardClass} border rounded-3xl p-6 backdrop-blur-md`}>
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Database size={20} className="text-green-400" />
                        Данные
                    </h3>
                    <div className="space-y-4">
                        <button 
                            onClick={() => onNavigate('calendar')}
                            style={{ backgroundColor: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}30` }}
                            className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl transition-all border font-bold"
                        >
                            Открыть календарь
                        </button>
                        <div className={`flex items-center justify-between p-4 ${itemBg} rounded-2xl`}>
                            <span>Единицы измерения</span>
                            <select 
                                value={localSettings.units}
                                onChange={(e) => handleUpdate('units', e.target.value)}
                                className={`rounded-xl px-4 py-2 outline-none border ${theme === 'dark' ? 'bg-black/10 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                            >
                                <option value="metric">Метрические (км)</option>
                                <option value="imperial">Имперские (мили)</option>
                            </select>
                        </div>
                        
                        <div className={`flex flex-col gap-3 p-4 ${itemBg} rounded-2xl`}>
                            <h4 className="font-bold flex items-center gap-2">
                                <Zap size={16} className="text-yellow-400"/>
                                LM Studio (Локальный ИИ)
                            </h4>
                            <input 
                                type="text"
                                value={lmStudioUrl}
                                onChange={(e) => {
                                    setLmStudioUrl(e.target.value);
                                    handleUpdate('lmStudioUrl', e.target.value);
                                }}
                                placeholder="http://localhost:1234/v1"
                                className={`rounded-xl px-4 py-2 outline-none text-sm border ${theme === 'dark' ? 'bg-black/20 border-white/5 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                            />
                            <p className="text-[10px] text-gray-500">
                                Используется для генерации умных планов тренировок через локальный LLM сервер.
                            </p>
                        </div>
                        <div className={`flex flex-col gap-3 p-4 ${itemBg} rounded-2xl`}>
                            <h4 className="font-bold flex items-center gap-2">
                                <Activity size={16} className="text-blue-400"/>
                                Гидратация (настройки)
                            </h4>
                            <div>
                                <label className="text-xs text-gray-400">Объём «стакана» (мл)</label>
                                <input
                                    type="number"
                                    min={50}
                                    value={waterCupMl}
                                    onChange={(e) => {
                                        const v = parseInt(e.target.value) || 200;
                                        setWaterCupMl(v);
                                        handleUpdate('waterCupMl', v.toString());
                                    }}
                                    className={`w-full rounded-xl px-4 py-2 outline-none text-sm border ${theme === 'dark' ? 'bg-black/20 border-white/5 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                                />
                                <p className="text-[10px] text-gray-500">По умолчанию 200 мл. Используется для расчёта общего объёма.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Zapfit Server Integration */}
            <div className="bg-gradient-to-r from-green-600/10 to-emerald-600/10 border border-green-500/20 rounded-3xl p-6">
                <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                    <Database className="text-green-400" size={20} />
                    Подключение к серверу ZAPFIT
                </h3>
                <ZapfitSettings theme={theme} accentColor={accentColor} />
            </div>

            {/* Футер-пустышка убран: настройки сохраняются через updateSetting сразу,
                серверный синк делает автосинк + спойлер выше */}
        </div>
    );
}

function ZapfitSettings({ theme, accentColor }) {
    const [serverUrl, setServerUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [status, setStatus] = useState({ configured: false, authenticated: false });
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [mfaRequired, setMfaRequired] = useState(false);
    const [mfaCode, setMfaCode] = useState('');
    const [editServer, setEditServer] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [apiKeySaved, setApiKeySaved] = useState(false);
    const [mfaSecret, setMfaSecret] = useState('');
    const [mfaSecretSaved, setMfaSecretSaved] = useState(false);
    const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
    const [autoSyncInterval, setAutoSyncInterval] = useState('15');
    const [lastAutoSync, setLastAutoSync] = useState(null);
    const formatError = (e) => {
        if (!e) return 'Неизвестная ошибка';
        if (typeof e === 'string') return e;
        if (e.message) return typeof e.message === 'string' ? e.message : JSON.stringify(e.message);
        try { return JSON.stringify(e); } catch(_) { return String(e); }
    };

    useEffect(() => {
        checkStatus();
        (async()=>{ try{ const r=await window.electronAPI.zapfitGetApiKey(); if(r?.success && r.apiKey) { setApiKey(r.apiKey); setApiKeySaved(true); } }catch(_){} })();
        (async()=>{ try{ const r=await window.electronAPI.zapfitGetMfaSecret(); if(r?.success && r.secret) { setMfaSecret(r.secret); setMfaSecretSaved(true); } }catch(_){} })();
        (async()=>{ try{
            const s=await window.electronAPI.getSettings?.();
            if(s?.autoSyncEnabled!==undefined) setAutoSyncEnabled(String(s.autoSyncEnabled)!=='0');
            if(s?.autoSyncIntervalMinutes) setAutoSyncInterval(String(s.autoSyncIntervalMinutes));
            const last=localStorage.getItem('zapfit:autoSync:lastSync');
            if(last) setLastAutoSync(new Date(last).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));
        }catch(_){} })();
        const h=()=>{ try{ const last=localStorage.getItem('zapfit:autoSync:lastSync'); if(last) setLastAutoSync(new Date(last).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})); }catch(_){} };
        window.addEventListener('activities-updated',h);
        return ()=>window.removeEventListener('activities-updated',h);
    }, []);

    const checkStatus = async () => {
        try {
            const result = await window.electronAPI.zapfitStatus();
            setStatus(result);
            if (result.serverUrl) setServerUrl(result.serverUrl);
        } catch (e) {
            console.error('Zapfit status error:', e);
        }
    };

    const handleConfigure = async () => {
        if (!serverUrl.trim()) {
            toast.error('Введите URL сервера');
            return;
        }
        setLoading(true);
        try {
            const result = await window.electronAPI.zapfitConfigure(serverUrl.trim());
            if (result.success) {
                toast.success('Сервер подключен');
                await checkStatus();
            } else {
                toast.error(result.error || 'Ошибка подключения');
            }
        } catch (e) {
            toast.error('Ошибка: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveApiKey = async () => {
        if (!apiKey.trim()) { toast.error('Введите токен'); return; }
        try {
            const r = await window.electronAPI.zapfitSetApiKey(apiKey.trim(), '');
            if (r?.success) { setApiKeySaved(true); toast.success('API-токен сохранён — теперь синхронизация использует токен'); await checkStatus(); }
            else toast.error(r.error || 'Ошибка сохранения токена');
        } catch(e){ toast.error(formatError(e)); }
    };
    const handleSaveMfaSecret = async () => {
        if (!mfaSecret.trim()) { toast.error('Введите ключ'); return; }
        try {
            const r = await window.electronAPI.zapfitSetMfaSecret(mfaSecret.trim());
            if (r?.success) { setMfaSecretSaved(true); toast.success('Ключ аутентификатора сохранён — авто-перелогин включён (как в мобильном)'); }
            else toast.error(r.error || 'Ошибка');
        } catch(e){ toast.error(formatError(e)); }
    };
    const handleLogin = async () => {
        if (!username.trim() || !password.trim()) {
            toast.error('Введите логин и пароль');
            return;
        }
        setLoading(true);
        try {
            const result = await window.electronAPI.zapfitLogin({ username, password });
            if (result.success) {
                toast.success('Вход выполнен');
                setPassword('');
                await checkStatus();
            } else if (result.mfa_required) {
                setMfaRequired(true);
                toast.info('Введите код MFA из приложения');
            } else {
                const msg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
                toast.error(msg || 'Ошибка входа');
                console.error('[zapfit] login error object', result.error);
            }
        } catch (e) {
            toast.error('Ошибка: ' + formatError(e));
            console.error('[zapfit] login exception', e);
        } finally {
            setLoading(false);
        }
    };

    const handleMfaLogin = async () => {
        if (!mfaCode.trim()) {
            toast.error('Введите MFA код');
            return;
        }
        setLoading(true);
        try {
            const result = await window.electronAPI.zapfitLoginMfa({ mfaCode: mfaCode.trim() });
            console.log('[zapfit] mfa result', result);
            if (result.success) {
                toast.success('Вход выполнен');
                setMfaRequired(false);
                setMfaCode('');
                setPassword('');
                await checkStatus();
            } else {
                const msg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
                toast.error(msg || 'MFA ошибка');
                console.error('[zapfit] mfa error object', result.error);
            }
        } catch (e) {
            toast.error('Ошибка: ' + formatError(e));
            console.error('[zapfit] mfa exception', e);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            const r = await window.electronAPI.zapfitLogout();
            if (r && r.success === false) throw new Error(r.error);
            setMfaRequired(false);
            setMfaCode('');
            setPassword('');
            await checkStatus();
            toast.info('Выход выполнен — сервер сохранён, войдите заново');
        } catch (e) { toast.error('Ошибка выхода: ' + e.message); }
    };

    const handleDisconnect = async () => {
        try {
            const r = await window.electronAPI.zapfitDisconnect();
            if (r && r.success === false) throw new Error(r.error);
            setServerUrl('');
            setMfaRequired(false);
            setMfaCode('');
            setPassword('');
            setUsername('');
            setEditServer(false);
            // force immediate UI feedback before DB roundtrip
            setStatus({ configured: false, authenticated: false, serverUrl: '' });
            await checkStatus();
            toast.success('Сервер отключён и все токены очищены');
        } catch (e) { toast.error('Ошибка отключения: ' + e.message); }
    };

    const handleSyncActivities = async () => {
        setSyncing(true);
        try {
            const result = await window.electronAPI.zapfitSyncActivities();
            if (result.success) {
                toast.success(`Синхронизировано: ${result.imported} новых, ${result.updated||0} обновлено (всего ${result.total}) — история и календарь обновятся`);
                window.dispatchEvent(new Event('settings-updated'));
                window.dispatchEvent(new Event('activities-updated'));
            } else {
                toast.error(result.error || 'Ошибка синхронизации');
            }
        } catch (e) {
            toast.error('Ошибка: ' + e.message);
        } finally {
            setSyncing(false);
        }
    };

    const handleSyncHealth = async () => {
        setSyncing(true);
        try {
            const result = await window.electronAPI.zapfitSyncHealth();
            if (result.success) {
                toast.success(`Здоровье синхронизировано: ${result.synced} записей (пульс/шаги/сон/вес/вода)`);
                window.dispatchEvent(new Event('settings-updated'));
                window.dispatchEvent(new Event('health-updated'));
                window.dispatchEvent(new Event('water-updated'));
            } else {
                toast.error(result.error || 'Ошибка синхронизации здоровья');
            }
        } catch (e) {
            toast.error('Ошибка: ' + e.message);
        } finally {
            setSyncing(false);
        }
    };

    const textColor = theme === 'dark' ? 'text-gray-300' : 'text-slate-600';
    const inputBg = theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300';

    if (!status.configured) {
        return (
            <div className="space-y-3">
                <p className={`text-sm ${textColor}`}>Подключите приложение к серверу ZAPFIT для синхронизации данных</p>
                <input
                    type="text"
                    placeholder="https://your-server.com"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    className={`w-full px-4 py-2 rounded-xl border ${inputBg} ${textColor}`}
                />
                <button
                    onClick={handleConfigure}
                    disabled={loading}
                    style={{ backgroundColor: accentColor }}
                    className="w-full px-4 py-2 text-white rounded-xl font-bold"
                >
                    {loading ? 'Подключение...' : 'Подключить'}
                </button>
            </div>
        );
    }

    if (!status.authenticated) {
        return (
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <p className={`text-sm ${textColor} flex-1`}>Сервер: <span className="font-mono break-all">{status.serverUrl}</span></p>
                    <button onClick={() => setEditServer(v=>!v)} className="px-2 py-1 text-xs bg-white/10 rounded-lg shrink-0">{editServer ? 'Отмена' : 'Изменить'}</button>
                </div>
                {editServer && (
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={serverUrl}
                            onChange={(e)=>setServerUrl(e.target.value)}
                            className={`flex-1 px-4 py-2 rounded-xl border ${inputBg} ${textColor} text-sm`}
                        />
                        <button onClick={handleConfigure} disabled={loading} style={{backgroundColor:accentColor}} className="px-4 py-2 text-white rounded-xl font-bold text-sm shrink-0">{loading?'...':'Сохранить'}</button>
                    </div>
                )}
                <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl space-y-2">
                    <label className="text-xs font-bold text-sky-300">API-токен ZAPFIT (альтернатива паролю)</label>
                    <div className="flex gap-2">
                        <input type="password" placeholder="zap_... / api_..." value={apiKey} onChange={(e)=>{setApiKey(e.target.value); setApiKeySaved(false);}} className={`flex-1 px-3 py-2 rounded-xl border ${inputBg} ${textColor} text-sm`} />
                        <button onClick={handleSaveApiKey} className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shrink-0">{apiKeySaved ? 'Сохранён' : 'Сохранить'}</button>
                    </div>
                    <p className="text-[10px] text-gray-400">Токен из профиля сервера ZAPFIT → API-ключи. Если заполнен, все запросы идут с <code>X-API-Key</code> + <code>?api_key=</code> как в мобильном. Позволяет обмен без пароля.</p>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                    <label className="text-xs font-bold text-amber-300">Ключ аутентификатора (TOTP секрет) — для авто-перелогина</label>
                    <div className="flex gap-2">
                        <input type="password" placeholder="JBSWY3DPEHPK3PXP ..." value={mfaSecret} onChange={(e)=>{setMfaSecret(e.target.value); setMfaSecretSaved(false);}} className={`flex-1 px-3 py-2 rounded-xl border ${inputBg} ${textColor} text-sm`} />
                        <button onClick={handleSaveMfaSecret} className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shrink-0">{mfaSecretSaved ? 'Сохранён' : 'Сохранить'}</button>
                    </div>
                    <p className="text-[10px] text-gray-400">Как в мобильном <code>Endurain</code>: скопируйте секрет из настроек MFA сервера. Desktop сам сгенерирует код и перелогинится, не требуя ручного ввода.</p>
                </div>
                {!mfaRequired ? (
                    <>
                        <input
                            type="text"
                            placeholder="Логин"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={`w-full px-4 py-2 rounded-xl border ${inputBg} ${textColor}`}
                        />
                        <input
                            type="password"
                            placeholder="Пароль"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={`w-full px-4 py-2 rounded-xl border ${inputBg} ${textColor}`}
                        />
                        <button
                            onClick={handleLogin}
                            disabled={loading}
                            style={{ backgroundColor: accentColor }}
                            className="w-full px-4 py-2 text-white rounded-xl font-bold"
                        >
                            {loading ? 'Вход...' : 'Войти'}
                        </button>
                    </>
                ) : (
                    <>
                        <p className={`text-sm ${textColor}`}>Введите код MFA из приложения-аутентификатора</p>
                        <input
                            type="text"
                            placeholder="000000"
                            value={mfaCode}
                            onChange={(e) => setMfaCode(e.target.value)}
                            maxLength={6}
                            className={`w-full px-4 py-2 rounded-xl border ${inputBg} ${textColor} text-center text-2xl tracking-widest`}
                        />
                        <button
                            onClick={handleMfaLogin}
                            disabled={loading}
                            style={{ backgroundColor: accentColor }}
                            className="w-full px-4 py-2 text-white rounded-xl font-bold"
                        >
                            {loading ? 'Проверка...' : 'Подтвердить'}
                        </button>
                        <button onClick={()=>{setMfaRequired(false); setMfaCode('');}} className="w-full text-xs text-gray-400">Назад к логину</button>
                    </>
                )}
                <button onClick={handleDisconnect} className="w-full px-4 py-2 bg-red-600/10 text-red-400 rounded-xl font-bold text-sm border border-red-600/20">Отвязать сервер (сброс URL)</button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <p className={`text-sm ${textColor} flex-1`}>
                    Подключено к: <span className="font-mono break-all">{status.serverUrl}</span>
                </p>
                <button onClick={() => setEditServer(v=>!v)} className="px-2 py-1 text-xs bg-white/10 rounded-lg shrink-0">{editServer ? 'Отмена' : 'Изменить'}</button>
            </div>
            {editServer && (
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={serverUrl}
                        onChange={(e)=>setServerUrl(e.target.value)}
                        className={`flex-1 px-4 py-2 rounded-xl border ${inputBg} ${textColor} text-sm`}
                    />
                    <button onClick={handleConfigure} disabled={loading} style={{backgroundColor:accentColor}} className="px-4 py-2 text-white rounded-xl font-bold text-sm shrink-0">{loading?'...':'Сохранить'}</button>
                </div>
            )}
            <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl space-y-2">
                <label className="text-xs font-bold text-sky-300">API-токен ZAPFIT</label>
                <div className="flex gap-2">
                    <input type="password" placeholder="zap_... / api_..." value={apiKey} onChange={(e)=>{setApiKey(e.target.value); setApiKeySaved(false);}} className={`flex-1 px-3 py-2 rounded-xl border ${inputBg} ${textColor} text-sm`} />
                    <button onClick={handleSaveApiKey} className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shrink-0">{apiKeySaved ? 'Сохранён' : 'Сохранить'}</button>
                </div>
                <p className="text-[10px] text-gray-400">Как в мобильном: <code>X-API-Key</code> + <code>?api_key=</code>. Вставьте токен из ZAPFIT → API-ключи.</p>
            </div>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                <label className="text-xs font-bold text-amber-300">Ключ аутентификатора (TOTP)</label>
                <div className="flex gap-2">
                    <input type="password" placeholder="JBSWY3DPEHPK3PXP ..." value={mfaSecret} onChange={(e)=>{setMfaSecret(e.target.value); setMfaSecretSaved(false);}} className={`flex-1 px-3 py-2 rounded-xl border ${inputBg} ${textColor} text-sm`} />
                    <button onClick={handleSaveMfaSecret} className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shrink-0">{mfaSecretSaved ? 'Сохранён' : 'Сохранить'}</button>
                </div>
                <p className="text-[10px] text-gray-400">Авто-перелогин без ручного ввода MFA, как в мобильном.</p>
            </div>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-300">Автосинхронизация (как в мобильном)</label>
                    <button
                        onClick={async()=>{ const v=!autoSyncEnabled; setAutoSyncEnabled(v); try{ await window.electronAPI.updateSetting('autoSyncEnabled', v?'1':'0'); window.dispatchEvent(new Event('settings-updated')); }catch(_){} }}
                        className={`px-3 py-1 rounded-full text-xs font-bold ${autoSyncEnabled?'bg-emerald-600 text-white':'bg-white/10 text-gray-400'}`}
                    >{autoSyncEnabled?'Вкл':'Выкл'}</button>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">Каждые</span>
                    <select
                        value={autoSyncInterval}
                        onChange={async(e)=>{ setAutoSyncInterval(e.target.value); try{ await window.electronAPI.updateSetting('autoSyncIntervalMinutes', e.target.value); window.dispatchEvent(new Event('settings-updated')); }catch(_){} }}
                        className={`px-2 py-1 rounded-lg border ${inputBg} ${textColor} text-xs`}
                    >
                        <option value="10">10 мин</option>
                        <option value="15">15 мин</option>
                        <option value="30">30 мин</option>
                        <option value="60">60 мин</option>
                    </select>
                    {lastAutoSync && <span className="text-[11px] text-gray-500 ml-auto">Авто: {lastAutoSync}</span>}
                </div>
                <p className="text-[10px] text-gray-400">Тихий sync-all в фоне: первый раз через 30 сек после старта, далее по интервалу. Уведомления уже опрашиваются сами в разделе Уведомления.</p>
            </div>
            <details className="p-3 bg-white/5 border border-white/10 rounded-xl">
                <summary className="text-xs font-bold text-gray-400 cursor-pointer select-none">Ручная синхронизация / отладка</summary>
            <div className="mt-2 space-y-2">
            <div className="flex gap-2">
                <button
                    onClick={handleSyncActivities}
                    disabled={syncing}
                    style={{ backgroundColor: accentColor }}
                    className="flex-1 px-4 py-2 text-white rounded-xl font-bold text-sm"
                >
                    {syncing ? 'Синхронизация...' : 'Активности'}
                </button>
                <button
                    onClick={handleSyncHealth}
                    disabled={syncing}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl font-bold text-sm"
                >
                    {syncing ? '...' : 'Здоровье (вкл. Пульс)'}
                </button>
            </div>
            <div className="flex gap-2">
                <button onClick={async()=>{ setSyncing(true); try{ const r=await window.electronAPI.zapfitSyncProfile(); if(r?.success) { toast.success('Профиль синхронизирован'); window.dispatchEvent(new Event('settings-updated')); window.dispatchEvent(new Event('profile-updated')); } else toast.error(r.error); }catch(e){toast.error(formatError(e));} finally{setSyncing(false);} }} disabled={syncing} className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-xl font-bold text-sm">Профиль</button>
                <button onClick={async()=>{ setSyncing(true); try{ const r=await window.electronAPI.zapfitSyncGears(); if(r?.success) { toast.success(`Экипировка: ${r.imported||0} новых, ${r.updated||0} обновлено, ${r.total} всего (с картинками)`); window.dispatchEvent(new Event('settings-updated')); window.dispatchEvent(new Event('gears-updated')); } else toast.error(r.error); }catch(e){toast.error(formatError(e));} finally{setSyncing(false);} }} disabled={syncing} className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-xl font-bold text-sm">Экипировка с фото</button>
            </div>
            <button
                onClick={async()=>{ setSyncing(true); try{ const r=await window.electronAPI.zapfitSyncAll(); if(r?.success) toast.success(`Всё синхронизировано: профиль ✓, активностей ${r.activities?.imported??0}+${r.activities?.updated??0}, здоровье ${r.health?.synced??0}, экипировка ${r.gears?.imported??0}+${r.gears?.updated??0}`); else toast.error(r?.error||'Ошибка'); window.dispatchEvent(new Event('settings-updated')); window.dispatchEvent(new Event('activities-updated')); window.dispatchEvent(new Event('health-updated')); window.dispatchEvent(new Event('water-updated')); window.dispatchEvent(new Event('gears-updated')); window.dispatchEvent(new Event('profile-updated')); }catch(e){toast.error(formatError(e));} finally{setSyncing(false);} }}
                disabled={syncing}
                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm"
            >
                {syncing ? 'Синхронизация всего...' : 'Синхронизировать всё (как мобильное)'}
            </button>
            <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl space-y-2">
                <div className="text-xs font-bold text-orange-300">PUSH на сервер (desktop → ZAPFIT)</div>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={async()=>{ setSyncing(true); try{ const r=await window.electronAPI.zapfitPushHealth({types:['weight','sleep','steps','water']}); if(r?.success) toast.success(`Отправлено здоровья: ${r.pushed} записей${r.totalErrors?` (${r.totalErrors} ошиб.)`:''}`); else toast.error(r.error); }catch(e){toast.error(formatError(e));} finally{setSyncing(false);} }} disabled={syncing} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold">Здоровье → сервер</button>
                    <button onClick={async()=>{ setSyncing(true); try{ const r=await window.electronAPI.zapfitPushProfile(); if(r?.success) toast.success('Профиль отправлен на сервер'); else toast.error(r.error); }catch(e){toast.error(formatError(e));} finally{setSyncing(false);} }} disabled={syncing} className="px-3 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold">Профиль → сервер (PUT)</button>
                    <button onClick={async()=>{ setSyncing(true); try{ const r=await window.electronAPI.zapfitPushGears(); if(r?.success) toast.success(`Экипировка отправлена: ${r.pushed}/${r.total}`); else toast.error(r.error); }catch(e){toast.error(formatError(e));} finally{setSyncing(false);} }} disabled={syncing} className="px-3 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold">Экипировка → сервер</button>
                    <button onClick={async()=>{ setSyncing(true); try{ const r=await window.electronAPI.zapfitUploadActivity({}); if(r?.success) toast.success(`FIT/GPX залит: ${r.file?.split(/[\\/]/).pop()}`); else if(r.error!=='cancelled') toast.error(r.error); }catch(e){toast.error(formatError(e));} finally{setSyncing(false);} }} disabled={syncing} className="px-3 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold">Залить FIT/GPX</button>
                </div>
                <button onClick={async()=>{ setSyncing(true); try{ const r=await window.electronAPI.zapfitBulkUploadActivities({}); if(r?.success) toast.success(`Bulk FIT заливка: ${r.count} файлов`); else if(r.error!=='cancelled') toast.error(r.error); }catch(e){toast.error(formatError(e));} finally{setSyncing(false);} }} disabled={syncing} className="w-full px-3 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-xs font-bold">Bulk FIT (несколько файлов)</button>
            </div>
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-2">
                <div className="text-xs font-bold text-blue-300">Доп. PULL (раньше не качал)</div>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={async()=>{ try{ const r=await window.electronAPI.zapfitGetHealthStats(); if(r?.success) toast.info('Health stats: '+JSON.stringify(r.data).slice(0,120)); else toast.error(r.error);}catch(e){toast.error(formatError(e));} }} className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Health stats/daily</button>
                    <button onClick={async()=>{ try{ const r=await window.electronAPI.zapfitGetHealthTargets(); if(r?.success) toast.info('Targets: '+JSON.stringify(r.data).slice(0,120)); else toast.error(r.error);}catch(e){toast.error(formatError(e));} }} className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Цели (targets)</button>
                    <button onClick={async()=>{ try{ const r=await window.electronAPI.zapfitGetNutrition({}); if(r?.success) toast.info('Nutrition: '+(Array.isArray(r.data)? r.data.length+' записей': JSON.stringify(r.data).slice(0,80))); else toast.error(r.error);}catch(e){toast.error(formatError(e));} }} className="px-3 py-2 bg-green-600 text-white rounded-xl text-xs font-bold">Питание</button>
                </div>
            </div>
            <button onClick={async()=>{ try{ const r=await window.electronAPI.zapfitGetNotifications({page:1, perPage:5}); if(r?.success) toast.info(`Уведомлений: ${r.notifications.length}`); else toast.error(r.error); }catch(e){toast.error(formatError(e));} }} className="w-full px-4 py-2 bg-slate-600 text-white rounded-xl font-bold text-sm">Проверить уведомления</button>
            </div>
            </details>
            <div className="flex gap-2">
                <button onClick={handleLogout} className="flex-1 px-4 py-2 bg-yellow-600/20 text-yellow-400 rounded-xl font-bold text-sm border border-yellow-600/20">Выйти (сохранить сервер)</button>
                <button onClick={handleDisconnect} className="flex-1 px-4 py-2 bg-red-600/20 text-red-400 rounded-xl font-bold text-sm border border-red-600/20">Отвязать сервер</button>
            </div>
        </div>
    );
}
