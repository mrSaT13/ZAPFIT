import React, { useState, useEffect } from 'react';
import { Heart, Moon, Utensils, Settings, TrendingUp, Droplet, AlertCircle, ChevronDown, ChevronUp, HeartPulse, BarChart3, Scale, LayoutDashboard, Footprints } from 'lucide-react';
import { withAlpha } from '../theme';
import SleepTabContent from './health-tabs/SleepTabContent';
import NutritionTabContent from './health-tabs/NutritionTabContent';
import FridgeTabContent from './health-tabs/FridgeTabContent';
import AnalysisTabContent from './health-tabs/AnalysisTabContent';
import WaterTabContent from './health-tabs/WaterTabContent';
import PulseTabContent from './health-tabs/PulseTabContent';
import WeightTabContent from './health-tabs/WeightTabContent';
import StepsTabContent from './health-tabs/StepsTabContent';
import OverviewTabContent from './health-tabs/OverviewTabContent';

export default function Health({ theme, accentColor, waterCount, onUpdateWater, recommendedWater, totalWaterLiters }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [syncing, setSyncing] = useState(false);
  const [syncKey, setSyncKey] = useState(0);
  const [lastSync, setLastSync] = useState(() => {
    try { return localStorage.getItem('zapfit:health:lastSync') || null; } catch (err) { return null; }
  });
  const [expanded, setExpanded] = useState(true);
  const [user, setUser] = useState(null);

  const runSync = async () => {
    const api = window.electronAPI;
    if (!api?.zapfitSyncHealth) return false;
    try {
      const st = await api.zapfitStatus?.();
      if (!st?.authenticated) return false;
    } catch (err) { return false; }
    setSyncing(true);
    try {
      const r = await api.zapfitSyncHealth();
      if (r?.success) {
        const label = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        try { localStorage.setItem('zapfit:health:lastSync', label); } catch (err) {}
        setLastSync(label);
        setSyncKey((k) => k + 1);
        return true;
      }
      return false;
    } catch (err) {
      return false;
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadUser();
    try {
      const last = Number(localStorage.getItem('zapfit:health:lastSyncTs') || 0);
      if (Date.now() - last > 600000) {
        localStorage.setItem('zapfit:health:lastSyncTs', String(Date.now()));
        runSync();
      }
    } catch (err) {}
    const onOpenHealth = (e) => {
      try {
        const tab = e?.detail || 'water';
        setActiveTab(tab);
      } catch (err) {}
    };
    window.addEventListener('open-health-tab', onOpenHealth);
    const timer = setInterval(() => { runSync(); }, 600000);
    return () => { window.removeEventListener('open-health-tab', onOpenHealth); if (timer) clearInterval(timer); };
  }, []);

  const loadUser = async () => {
    try {
      const u = await window.electronAPI?.getUser?.();
      setUser(u);
    } catch (e) {
      console.error('Failed to load user:', e);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Сводка', icon: LayoutDashboard },
    { id: 'pulse', label: 'Пульс', icon: HeartPulse },
    { id: 'sleep', label: 'Сон', icon: Moon },
    { id: 'nutrition', label: 'Питание', icon: Utensils },
    { id: 'weight', label: 'Вес', icon: Scale },
    { id: 'steps', label: 'Шаги', icon: Footprints },
    { id: 'fridge', label: 'Холодильник', icon: Settings },
    { id: 'analysis', label: 'Анализ', icon: TrendingUp },
    { id: 'water', label: 'Вода', icon: Droplet }
  ];

  const bgClass = theme === 'dark' ? 'bg-slate-900' : 'bg-white';
  const borderClass = theme === 'dark' ? 'border-slate-700' : 'border-slate-200';
  const textClass = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const subTextClass = theme === 'dark' ? 'text-slate-400' : 'text-slate-600';
  const hoverClass = theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50';

  return (
    <div className="animate-fade-in">
      <div>
        {/* Header */}
        <div className="mb-6">
          <h1 className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r ${theme === 'dark' ? 'from-white to-gray-400' : 'from-slate-900 to-slate-500'} bg-clip-text text-transparent flex items-center gap-3 mb-1`}>
            <Heart size={28} style={{ color: accentColor }} />
            Здоровье
          </h1>
          <p className={subTextClass}>
            Сон, питание, гидратация и анализ данных
          </p>
        </div>

        {/* Tabs Navigation */}
        <div className="zap-card mb-6 overflow-hidden">
          <div className="flex flex-wrap gap-1.5 p-3">
            {tabs.map(tab => {
              const TabIcon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-2xl font-semibold transition-all flex items-center gap-2 text-sm ${
                    active ? 'shadow-sm' : `${subTextClass}`
                  }`}
                  style={
                    active
                      ? { backgroundColor: withAlpha(accentColor, 0.16), color: accentColor }
                      : {}
                  }
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = withAlpha(accentColor, 0.07); }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <TabIcon size={18} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className={`p-4 sm:p-6 border-t ${theme === 'dark' ? 'border-white/5' : 'border-slate-200'}`} key={syncKey}>
            {activeTab === 'overview' && <OverviewTabContent theme={theme} accentColor={accentColor} onSync={runSync} syncing={syncing} lastSync={lastSync} />}
            {activeTab === 'pulse' && <PulseTabContent theme={theme} accentColor={accentColor} />}
            {activeTab === 'sleep' && <SleepTabContent theme={theme} accentColor={accentColor} />}
            {activeTab === 'nutrition' && <NutritionTabContent theme={theme} accentColor={accentColor} />}
            {activeTab === 'weight' && <WeightTabContent theme={theme} accentColor={accentColor} />}
            {activeTab === 'steps' && <StepsTabContent theme={theme} accentColor={accentColor} />}
            {activeTab === 'fridge' && <FridgeTabContent theme={theme} accentColor={accentColor} />}
            {activeTab === 'analysis' && <AnalysisTabContent theme={theme} accentColor={accentColor} />}
            {activeTab === 'water' && <WaterTabContent theme={theme} accentColor={accentColor} waterCount={waterCount} onUpdateWater={onUpdateWater} recommendedWater={recommendedWater} totalWaterLiters={totalWaterLiters} />}
          </div>
        </div>

        {/* AI Recommendations Section */}
        <div className="zap-card p-6">
          <h3 className={`text-lg font-bold ${textClass} flex items-center gap-2 mb-4`}>
            <AlertCircle size={20} style={{ color: accentColor }} />
            Рекомендации на основе данных
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-4 rounded-2xl ${theme === 'dark' ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
              <p className={`${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'} font-semibold mb-2 flex items-center gap-2`}>
                <Moon size={16} /> Сон
              </p>
              <p className={subTextClass}>
                Спите 7-9 часов в сутки для оптимального восстановления. Коносистный режим сна улучшает спортивные показатели.
              </p>
            </div>
            <div className={`p-4 rounded-2xl ${theme === 'dark' ? 'bg-green-500/10 border border-green-500/30' : 'bg-green-50 border border-green-200'}`}>
              <p className={`${theme === 'dark' ? 'text-green-400' : 'text-green-600'} font-semibold mb-2 flex items-center gap-2`}>
                <Utensils size={16} /> Питание
              </p>
              <p className={subTextClass}>
                Следите за калориями и макросами. Правильное питание - основа восстановления и результатов.
              </p>
            </div>
            <div className={`p-4 rounded-2xl ${theme === 'dark' ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-purple-50 border border-purple-200'}`}>
              <p className={`${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'} font-semibold mb-2 flex items-center gap-2`}>
                <Droplet size={16} /> Гидратация
              </p>
              <p className={subTextClass}>
                Пейте 2-3 литра воды в день. Гидратация критична для производительности и восстановления.
              </p>
            </div>
            <div className={`p-4 rounded-2xl ${theme === 'dark' ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-orange-50 border border-orange-200'}`}>
              <p className={`${theme === 'dark' ? 'text-orange-400' : 'text-orange-600'} font-semibold mb-2 flex items-center gap-2`}>
                <BarChart3 size={16} /> Анализ
              </p>
              <p className={subTextClass}>
                Отслеживайте тренды в ваших данных. Видите паттерны поможет оптимизировать тренировки.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
