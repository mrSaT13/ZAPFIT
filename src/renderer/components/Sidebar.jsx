import React from 'react';
import { Home, Activity, Map, Settings, Moon, Sun, PanelLeftClose, PanelLeftOpen, Target, User, BarChart3, Calendar, MessageSquare, Heart, Info } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, isCollapsed, toggleCollapse, theme, toggleTheme, accentColor }) {
    const menuItems = [
        { id: 'dashboard', label: 'Главная', icon: <Home size={20} /> },
        { id: 'rides', label: 'Активности', icon: <Map size={20} /> },
        { id: 'analysis', label: 'Анализ', icon: <BarChart3 size={20} /> },
        { id: 'health', label: 'Здоровье', icon: <Heart size={20} /> },
        { id: 'calendar', label: 'Календарь', icon: <Calendar size={20} /> },
        { id: 'chat', label: 'AI Чат', icon: <MessageSquare size={20} /> },
        { id: 'plan', label: 'ML Тренер', icon: <Target size={20} /> },
        { id: 'profile', label: 'Профиль', icon: <User size={20} /> },
        { id: 'about', label: 'О приложении', icon: <Info size={20} /> },
    ];

    return (
        <div className={`glass-panel h-full flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'} ${theme === 'dark' ? 'border-r border-white/5' : 'border-r border-slate-200 bg-white/80'}`}>
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-white/5">
                {!isCollapsed && <span className="font-bold text-xl tracking-tight" style={{ color: accentColor }}>ZAPFIT</span>}
                <button onClick={toggleCollapse} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400">
                    {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                </button>
            </div>

            {/* Menu */}
            <nav className="flex-1 py-6 px-2 space-y-1">
                {menuItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative ${
                            activeTab === item.id 
                            ? 'bg-white/10 shadow-sm' 
                            : 'text-slate-400 hover:bg-white/5 hover:text-white'
                        }`}
                        style={activeTab === item.id ? { color: accentColor } : {}}
                    >
                        <span className={`${activeTab === item.id ? '' : 'text-slate-500 group-hover:text-white'}`}>
                            {item.icon}
                        </span>
                        {!isCollapsed && <span className="font-medium">{item.label}</span>}
                        
                        {/* Tooltip for collapsed state */}
                        {isCollapsed && (
                            <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 border border-white/10 shadow-xl">
                                {item.label}
                            </div>
                        )}
                    </button>
                ))}
            </nav>

            {/* Footer / Theme Toggle */}
            <div className="p-4 border-t border-white/5 space-y-2">
                <button 
                    onClick={() => setActiveTab('settings')}
                    className="w-full flex items-center justify-center gap-2 p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
                >
                    <Settings size={20} />
                    {!isCollapsed && <span>Настройки</span>}
                </button>
            </div>
        </div>
    );
}