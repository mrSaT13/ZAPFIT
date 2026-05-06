import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Moon, Sun, Globe, Database, Save, Palette, Type, Zap, Activity, Loader } from 'lucide-react';
import { toast } from 'react-toastify';

export default function Settings({ onNavigate, theme, setTheme, accentColor, setAccentColor, textColor, setTextColor }) {
    const [localSettings, setLocalSettings] = useState({
        language: 'ru',
        units: 'metric'
    });

    const colors = [
        '#f97316', // Orange
        '#3b82f6', // Blue
        '#8b5cf6', // Violet
        '#10b981', // Emerald
        '#ef4444', // Red
        '#f43f5e', // Rose
    ];
    
    const [lmStudioUrl, setLmStudioUrl] = useState('http://localhost:1234/v1');
    const [stravaToken, setStravaToken] = useState('');
    const [stravaRefreshToken, setStravaRefreshToken] = useState('');
    const [stravaClientId, setStravaClientId] = useState('');
    const [stravaClientSecret, setStravaClientSecret] = useState('');
    const [stravaAuthUrl, setStravaAuthUrl] = useState('');
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (window.electronAPI && window.electronAPI.getSettings) {
                const saved = await window.electronAPI.getSettings();
                setLocalSettings(prev => ({ ...prev, ...saved }));
                setLmStudioUrl(saved.lmStudioUrl || 'http://localhost:1234/v1');
                setStravaToken(saved.stravaToken || saved.stravaAccessToken || '');
                setStravaRefreshToken(saved.stravaRefreshToken || '');
                setStravaClientId(saved.stravaClientId || '');
                setStravaClientSecret(saved.stravaClientSecret || '');
                setStravaAuthUrl(saved.stravaAuthUrl || 'https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost/strava&scope=activity:read,activity:read_all');
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
        }
    };

    const saveStravaSettings = async () => {
        if (!stravaToken.trim()) {
            toast.error('Введите Access Token или Client ID + Secret');
            return;
        }
        await handleUpdate('stravaToken', stravaToken);
        await handleUpdate('stravaAccessToken', stravaToken);
        if (stravaRefreshToken) await handleUpdate('stravaRefreshToken', stravaRefreshToken);
        if (stravaClientId) await handleUpdate('stravaClientId', stravaClientId);
        if (stravaClientSecret) await handleUpdate('stravaClientSecret', stravaClientSecret);
        toast.success('Параметры Strava сохранены');
    };

    const importFromStrava = async () => {
        if (!stravaToken.trim()) {
            toast.error('Сначала сохраните Access Token');
            return;
        }
        
        setImporting(true);
        try {
            // Если есть refresh token и Client ID/Secret, попробуем обновить токен
            if (stravaRefreshToken && stravaClientId && stravaClientSecret) {
                console.log('Refreshing Strava token...');
                const refreshResult = await window.electronAPI.refreshStravaToken({ 
                    refreshToken: stravaRefreshToken,
                    clientId: stravaClientId,
                    clientSecret: stravaClientSecret
                });
                
                if (refreshResult.success) {
                    setStravaToken(refreshResult.accessToken);
                    setStravaRefreshToken(refreshResult.refreshToken);
                    toast.success('Токен обновлен');
                } else {
                    console.warn('Token refresh failed, using existing token:', refreshResult.error);
                    // Продолжаем с текущим токеном
                }
            }

            const result = await window.electronAPI.importStrava({ 
                token: stravaToken,
                clientId: stravaClientId,
                clientSecret: stravaClientSecret
            });
            
            if (result.success) {
                toast.success(`Импортировано активностей: ${result.count}`);
            } else {
                // Если ошибка многострочная, показываем её в toast с преформатированным текстом
                if (result.error && result.error.includes('\n')) {
                    // Многострочная ошибка - показываем в console.log и toast
                    console.error('Ошибка Strava API:\n' + result.error);
                    const lines = result.error.split('\n');
                    toast.error(lines[0] || 'Ошибка импорта');
                    // Показываем полную ошибку в консоли
                    alert('Ошибка импорта Strava:\n\n' + result.error);
                } else {
                    toast.error(`Ошибка: ${result.error}`);
                }
            }
        } catch (err) {
            console.error('Import error:', err);
            toast.error('Ошибка импорта: ' + err.message);
        } finally {
            setImporting(false);
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
                                className="bg-black/10 border border-white/10 rounded-xl px-3 py-1 outline-none text-sm"
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
                                className="bg-black/10 border border-white/10 rounded-xl px-4 py-2 outline-none"
                            >
                                <option value="metric">Метрические (км)</option>
                                <option value="imperial">Имперские (мили)</option>
                            </select>
                        </div>
                        
                        <div className={`flex flex-col gap-3 p-4 ${itemBg} rounded-2xl`}>
                            <h4 className="font-bold flex items-center gap-2">
                                <Activity size={16} className="text-orange-400"/>
                                Strava API (Импорт активностей)
                            </h4>
                            <div className="space-y-2">
                                <div>
                                    <label className="text-xs text-gray-400">Access Token *</label>
                                    <input 
                                        type="password"
                                        value={stravaToken}
                                        onChange={(e) => setStravaToken(e.target.value)}
                                        placeholder="Введите Access Token"
                                        className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2 outline-none text-sm"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-gray-400">Client ID</label>
                                        <input 
                                            type="text"
                                            value={stravaClientId}
                                            onChange={(e) => setStravaClientId(e.target.value)}
                                            placeholder="ID"
                                            className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2 outline-none text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400">Client Secret</label>
                                        <input 
                                            type="password"
                                            value={stravaClientSecret}
                                            onChange={(e) => setStravaClientSecret(e.target.value)}
                                            placeholder="Secret"
                                            className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2 outline-none text-sm"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400">Refresh Token (опционально)</label>
                                    <input 
                                        type="password"
                                        value={stravaRefreshToken}
                                        onChange={(e) => setStravaRefreshToken(e.target.value)}
                                        placeholder="Для автоматического обновления токена"
                                        className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2 outline-none text-sm"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={saveStravaSettings}
                                        className="flex-1 bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                                    >
                                        Сохранить
                                    </button>
                                    <button 
                                        onClick={importFromStrava}
                                        disabled={importing}
                                        className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                                    >
                                        {importing ? <Loader size={14} className="animate-spin" /> : <Activity size={14} />}
                                        {importing ? 'Импорт...' : 'Импортировать'}
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-500">
                                    <strong>📌 Получение корректного токена:</strong><br/>
                                    1. Откройте <a href="https://developer.strava.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-orange-400 underline">developer.strava.com/dashboard</a><br/>
                                    2. Откройте приложение "DataImporter"<br/>
                                    3. Нажмите кнопку "View Authorization" на странице приложения<br/>
                                    4. <strong className="text-orange-300">ВАЖНО: Проверьте, что выбраны scope:</strong><br/>
                                    &nbsp;&nbsp;✅ <code className="bg-black/40 px-1 rounded">activity:read</code> или <code className="bg-black/40 px-1 rounded">activity:read_all</code><br/>
                                    5. Скопируйте новый <strong>Access Token</strong><br/>
                                    6. Если появляется ошибка про permissions - повторите шаги 3-5<br/>
                                    7. Client ID и Secret опциональны
                                </p>
                            </div>
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
                                className="bg-black/20 border border-white/5 rounded-xl px-4 py-2 outline-none text-sm"
                            />
                            <p className="text-[10px] text-gray-500">
                                Используется для генерации умных планов тренировок через локальный LLM сервер.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-blue-600/10 border border-blue-500/20 rounded-3xl p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                        <Save className="text-blue-400" size={24} />
                    </div>
                    <span className={theme === 'dark' ? 'text-gray-300' : 'text-slate-600'}>Все изменения сохраняются автоматически</span>
                </div>
                <button 
                    onClick={() => toast.success('Настройки синхронизированы')}
                    style={{ backgroundColor: accentColor }}
                    className="px-8 py-3 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20"
                >
                    Синхронизировать
                </button>
            </div>
        </div>
    );
}
