import React, { useState, useEffect } from 'react';
import { Home, Activity, Settings, Moon, Sun, PanelLeftClose, PanelLeftOpen, User, BarChart3, Calendar, MessageSquare, Heart, Info, Bell, Wrench, Users, ChevronDown, Dumbbell } from 'lucide-react';
import { withAlpha } from '../theme';

export default function Sidebar({ activeTab, setActiveTab, isCollapsed, toggleCollapse, theme, toggleTheme, accentColor }) {
    const [notifUnread, setNotifUnread] = useState(0);
    // Сворачиваемые секции (состояние живёт в localStorage)
    const [primaryOpen, setPrimaryOpen] = useState(() => {
        try { return localStorage.getItem('zapfit:sidebar:primary') !== '0'; } catch { return true; }
    });
    const [serviceOpen, setServiceOpen] = useState(() => {
        try { return localStorage.getItem('zapfit:sidebar:service') !== '0'; } catch { return true; }
    });
    const toggleSection = (which) => {
        if (which === 'primary') {
            setPrimaryOpen((v) => {
                try { localStorage.setItem('zapfit:sidebar:primary', v ? '0' : '1'); } catch {}
                return !v;
            });
        } else {
            setServiceOpen((v) => {
                try { localStorage.setItem('zapfit:sidebar:service', v ? '0' : '1'); } catch {}
                return !v;
            });
        }
    };
    useEffect(()=>{
        let t;
        const fetchCount = async ()=>{
            try{
                const s = await window.electronAPI?.zapfitStatus?.();
                if (!s?.configured || !s?.authenticated) { setNotifUnread(0); return; }
                const r = await window.electronAPI?.zapfitGetNotificationsCount?.();
                if (r?.success) setNotifUnread(Number(r.count)||0);
                else {
                    const lr = await window.electronAPI?.zapfitGetNotifications?.({page:1, perPage:50});
                    if (lr?.success) setNotifUnread((lr.notifications||[]).filter(n=>!n.read).length);
                }
            }catch(_){}
        };
        fetchCount();
        t = setInterval(fetchCount, 60000);
        const onVis = ()=> fetchCount();
        window.addEventListener('focus', onVis);
        return ()=> { clearInterval(t); window.removeEventListener('focus', onVis); };
    }, []);
    // Порядок как в мобилке: Лента, Активности, Тренировки, Здоровье (+ Главная)
    const primaryItems = [
        { id: 'dashboard', label: 'Главная', icon: <Home size={20} /> },
        { id: 'followers', label: 'Лента', icon: <Users size={20} /> },
        { id: 'rides', label: 'Активности', icon: <Activity size={20} /> },
        { id: 'trainings', label: 'Тренировки', icon: <Dumbbell size={20} /> },
        { id: 'health', label: 'Здоровье', icon: <Heart size={20} /> },
    ];
    const secondaryItems = [
        { id: 'gears', label: 'Снаряжение', icon: <Wrench size={20} /> },
        { id: 'calendar', label: 'Календарь', icon: <Calendar size={20} /> },
        { id: 'notifications', label: 'Уведомления', icon: <span className="relative inline-flex"><Bell size={20}/>{notifUnread>0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] px-1 rounded-full leading-none py-0.5">{notifUnread>9?'9+':notifUnread}</span>}</span> },
        { id: 'chat', label: 'Чат', icon: <MessageSquare size={20} /> },
        { id: 'profile', label: 'Профиль', icon: <User size={20} /> },
        { id: 'about', label: 'О приложении', icon: <Info size={20} /> },
    ];

    const renderItem = (item) => {
        const active = activeTab === item.id;
        return (
            <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center transition-all group relative ${
                    isCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5'
                } ${
                    active ? 'zap-pill-active shadow-sm' : `rounded-2xl ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`
                }`}
                style={active
                    ? { backgroundColor: withAlpha(accentColor, 0.16), color: accentColor }
                    : {}}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = withAlpha(accentColor, 0.07); }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
                {active && (
                    <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full"
                        style={{ backgroundColor: accentColor }}
                    />
                )}
                <span className={`${active ? '' : (theme === 'dark' ? 'text-slate-500 group-hover:text-white' : 'text-slate-400 group-hover:text-slate-900')} ${isCollapsed ? '' : 'pl-1'}`}>
                    {item.icon}
                </span>
                {!isCollapsed && <span className="font-medium text-[14px] truncate">{item.label}</span>}

                {/* Tooltip for collapsed state */}
                {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 border border-white/10 shadow-xl">
                        {item.label}
                    </div>
                )}
            </button>
        );
    };

    return (
        <div className={`h-full shrink-0 flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'w-16' : 'w-64'} ${theme === 'dark' ? 'border-r border-white/5 bg-[#141A21]/90' : 'border-r border-slate-200 bg-white/90'} backdrop-blur-xl`}>
            {/* Header — иконка приложения вместо буквы Z */}
            <div className={`p-3 flex items-center border-b border-white/5 ${isCollapsed ? 'flex-col gap-2 justify-center' : 'justify-between'}`}>
                {!isCollapsed && (
                    <span className="font-extrabold text-xl tracking-tight flex items-center gap-2 min-w-0">
                        <img
                            src="icon.png"
                            alt="ZAPFIT"
                            className="w-8 h-8 rounded-2xl shadow-md shrink-0"
                            onError={(e) => { e.currentTarget.src = '256x256.png'; }}
                        />
                        <span className="truncate" style={{ color: accentColor }}>ZAPFIT</span>
                    </span>
                )}
                {isCollapsed && (
                    <img
                        src="icon.png"
                        alt="ZAPFIT"
                        className="w-9 h-9 rounded-2xl shadow-md"
                        onError={(e) => { e.currentTarget.src = '256x256.png'; }}
                    />
                )}
                <button onClick={toggleCollapse} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400">
                    {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                </button>
            </div>

            {/* Menu */}
            <nav className={`flex-1 py-3 px-2 space-y-0.5 overflow-y-auto ${isCollapsed ? 'no-scrollbar' : ''}`}>
                {!isCollapsed && (
                    <button
                        onClick={() => toggleSection('primary')}
                        className="zap-section-label w-full flex items-center justify-between hover:opacity-100 transition-opacity"
                    >
                        <span>Основное</span>
                        <ChevronDown
                            size={14}
                            className={`transition-transform duration-200 ${primaryOpen ? '' : '-rotate-90'}`}
                        />
                    </button>
                )}
                {(isCollapsed || primaryOpen) && primaryItems.map(renderItem)}
                {!isCollapsed && (
                    <button
                        onClick={() => toggleSection('service')}
                        className="zap-section-label w-full flex items-center justify-between hover:opacity-100 transition-opacity"
                    >
                        <span>Сервис</span>
                        <ChevronDown
                            size={14}
                            className={`transition-transform duration-200 ${serviceOpen ? '' : '-rotate-90'}`}
                        />
                    </button>
                )}
                {(isCollapsed || serviceOpen) && secondaryItems.map(renderItem)}
            </nav>

            {/* Footer / Theme + Settings */}
            <div className="p-3 border-t border-white/5 space-y-1">
                <button
                    onClick={toggleTheme}
                    className="w-full flex items-center justify-center gap-2 p-2.5 rounded-2xl hover:bg-white/5 text-slate-400 transition-colors text-[14px]"
                    title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                >
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    {!isCollapsed && <span>{theme === 'dark' ? 'Светлая' : 'Тёмная'}</span>}
                </button>
                <button
                    onClick={() => setActiveTab('settings')}
                    className={`w-full flex items-center justify-center gap-2 p-2.5 rounded-2xl transition-colors text-[14px] ${activeTab === 'settings' ? 'zap-pill-active' : (theme === 'dark' ? 'text-slate-400 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-100')}`}
                    style={activeTab === 'settings' ? { backgroundColor: withAlpha(accentColor, 0.16), color: accentColor } : {}}
                >
                    <Settings size={18} />
                    {!isCollapsed && <span>Настройки</span>}
                </button>
            </div>
        </div>
    );
}
