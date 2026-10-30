import React, { useEffect, useState } from 'react';
import { Activity, TrendingUp, Zap, Clock, Plus, Bike, Droplet, Lightbulb, CheckCircle2, AlertTriangle, Siren } from 'lucide-react';
import { toast } from 'react-toastify';
import { withAlpha } from '../theme';
import FitnessGraph from './FitnessGraph';
import GoalSetting from './GoalSetting';

const Dashboard = ({ theme, accentColor, onOpenManual, user, greeting, waterCount, onUpdateWater, recommendedWater, totalWaterLiters, cupSizeMl = 200, onNavigate }) => {
  const [fitnessData, setFitnessData] = useState({ ctl: 0, atl: 0, tsb: 0, recommendation: '' });
  const [stats, setStats] = useState({ count: 0, time: 0, elevation: 0 });
  const [gears, setGears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [localMl, setLocalMl] = useState(0);
  const [waterInputMl, setWaterInputMl] = useState('');

  // Загружаем данные формы
  useEffect(() => {
    const loadData = async () => {
      const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
      if (api) {
        if (api.recalcMissingTss) try{ await api.recalcMissingTss(); }catch(_){}
        const fData = await api.getFitnessForm();
        setFitnessData(fData || { ctl: 0, atl: 0, tsb: 0, recommendation: 'Нет данных' });

        const rides = await api.getRides();
        if (rides && rides.length > 0) {
          const totalDist = rides.reduce((sum, r) => sum + (r.distance || 0), 0);
          const totalTime = rides.reduce((sum, r) => sum + (r.duration || 0), 0);
          const totalElev = rides.reduce((sum, r) => sum + (r.elevation_gain || 0), 0);
          
          setStats({
            count: rides.length,
            time: (totalTime / 3600).toFixed(1),
            elevation: Math.round(totalElev)
          });
        }

        try {
            if (api.getGearAnalytics) {
              const g = await api.getGearAnalytics();
              setGears(g || []);
            }
          // load today's water ml
            try {
              if (api.getWaterToday) {
                const w = await api.getWaterToday();
                setLocalMl((w && w.row && w.row.ml) ? parseInt(w.row.ml) : 0);
              }
            } catch (e) { console.error('load water today', e); }
        } catch (e) {
            console.error(e);
        }
      }
      setLoading(false);
    };
    loadData();
    // listen for water updates
    const onWater = async () => {
      const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
      if (api && api.getWaterToday) {
        const w = await api.getWaterToday();
        setLocalMl((w && w.row && w.row.ml) ? parseInt(w.row.ml) : 0);
      }
      // also reload rides/stats after sync
      if (api?.getRides) {
        if (api.recalcMissingTss) try{ await api.recalcMissingTss(); }catch(_){}
        const rides = await api.getRides();
        if (rides && rides.length) {
          const totalTime = rides.reduce((s,r)=>s+(r.duration||0),0);
          const totalElev = rides.reduce((s,r)=>s+(r.elevation_gain||0),0);
          setStats({count: rides.length, time: (totalTime/3600).toFixed(1), elevation: Math.round(totalElev)});
        }
        const fData = await api.getFitnessForm();
        setFitnessData(fData||{ctl:0,atl:0,tsb:0,recommendation:'Нет данных'});
        if (api.getGearAnalytics) { const g=await api.getGearAnalytics(); setGears(g||[]); }
      }
    };
    window.addEventListener('water-updated', onWater);
    window.addEventListener('activities-updated', onWater);
    window.addEventListener('health-updated', onWater);
    window.addEventListener('settings-updated', onWater);
    window.addEventListener('competitions-updated', () => { /* no-op here but could refresh */ });
    return () => { window.removeEventListener('water-updated', onWater); window.removeEventListener('activities-updated', onWater); window.removeEventListener('health-updated', onWater); window.removeEventListener('settings-updated', onWater); };
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div className="flex-1">
            <h1 className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r ${theme === 'dark' ? 'from-white to-gray-400' : 'from-slate-900 to-slate-500'} bg-clip-text text-transparent`}>
                {greeting ? `${greeting}, ` : ''}{user?.name || 'Атлет'}!
            </h1>
            <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-slate-600'} text-xs sm:text-sm mt-1`}>Твой тренировочный хаб под контролем.</p>
        </div>
        <button 
          onClick={onOpenManual}
          className="bg-accent text-white px-3 sm:px-4 py-2 rounded-lg flex items-center space-x-2 hover:opacity-90 transition-opacity whitespace-nowrap text-sm"
          style={{ backgroundColor: accentColor }}
        >
          <Plus size={18} />
          <span>Добавить</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* ML Coach Card */}
          <div className="lg:col-span-2 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-4 sm:p-6 text-white shadow-lg shadow-indigo-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 sm:p-4 opacity-20">
              <Zap size={80} className="sm:size-[100px]" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold mb-2 sm:mb-3 flex items-center gap-2">
              <TrendingUp className="text-yellow-300" size={18} /> AI Анализ
            </h2>
            {loading ? (
              <p className="opacity-70 text-xs sm:text-sm">Анализ данных...</p>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-2 sm:gap-4 mb-3">
                  <div>
                    <span className="text-xs opacity-80 block">Баланс (TSB)</span>
                    <span className={`text-3xl sm:text-4xl font-bold ${fitnessData.tsb > 0 ? 'text-green-300' : 'text-red-300'}`}>
                      {fitnessData.tsb > 0 ? `+${fitnessData.tsb}` : fitnessData.tsb}
                    </span>
                  </div>
                  <div className="text-xs bg-white/20 px-2 sm:px-3 py-1 rounded-lg backdrop-blur-sm shadow-inner group whitespace-nowrap">
                    <span className="opacity-70">CTL:</span> <span className="font-bold text-orange-400">{fitnessData.ctl}</span>
                    <span className="opacity-70 ml-1 sm:ml-2">ATL:</span> <span className="font-bold text-blue-400">{fitnessData.atl}</span>
                  </div>
                </div>
                <div className="relative group">
                    <p className="text-indigo-100 bg-black/20 p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-white/10 backdrop-blur-md leading-relaxed text-xs sm:text-sm line-clamp-2 flex gap-2">
                      <Lightbulb size={16} className="shrink-0 mt-0.5 text-yellow-300" />
                      <span>{fitnessData.recommendation || "Загрузите активности для рекомендаций."}</span>
                    </p>
                    <div className="absolute -left-1 top-0 bottom-0 w-1 bg-yellow-400 rounded-full group-hover:h-full transition-all duration-500"></div>
                </div>
              </>
            )}
          </div>

          {/* Hydration / Water Card */}
          <div className="zap-card p-4 sm:p-6 flex flex-col justify-between cursor-pointer overflow-hidden relative" onClick={() => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('open-health-tab', { detail: 'water' })); if (onNavigate) onNavigate('health'); }}>
            <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
              <Droplet size={80} style={{ color: accentColor }} />
            </div>
            <h3 className="font-bold flex items-center gap-2 mb-2 sm:mb-4 text-sm sm:text-base">
                <Droplet size={20} style={{ color: accentColor }} /> Гидратация
            </h3>
            {(() => { const goal = Math.round((recommendedWater || 2.5) * 1000); const pct = Math.min(100, Math.round((localMl / goal) * 100)); const done = localMl >= goal; return (<>
            <div className="flex items-center justify-center mb-3">
              <div className="text-center">
                <span className="text-2xl sm:text-3xl font-bold">{localMl} мл</span>
                <span className="text-xs block opacity-60">из {goal} мл · {pct}%</span>
              </div>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden mb-4" style={{ backgroundColor: withAlpha(accentColor, 0.15) }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: accentColor }} />
            </div>
            {/* Input field for water amount */}
            <div className="mb-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
              <input
                value={waterInputMl}
                onChange={(e) => setWaterInputMl(e.target.value)}
                type="number"
                placeholder="200"
                className={`flex-1 min-w-0 px-3 py-2 rounded-xl border text-sm sm:text-base outline-none ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white placeholder-slate-500' : 'bg-slate-100 border-slate-200 text-slate-900 placeholder-slate-400'}`}
              />
              <button
                onClick={async () => {
                  const ml = parseInt(waterInputMl) || 0;
                  if (ml <= 0) { toast.warn('Введите корректное количество мл'); return; }
                  try {
                    const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
                    if (!api || !api.adjustWaterToday) return;
                    const res = await api.adjustWaterToday(ml);
                    if (res && res.success) {
                      setLocalMl(res.ml);
                      setWaterInputMl('');
                      window.dispatchEvent(new Event('water-updated'));
                    }
                  } catch (err) { console.error(err); }
                }}
                className="px-4 py-2 rounded-xl text-white font-bold text-sm sm:text-base shrink-0"
                style={{ backgroundColor: accentColor }}
              >
                +
              </button>
            </div>

            <p className="text-[10px] sm:text-xs opacity-60 flex items-center gap-1 justify-center">
              {done ? (<><CheckCircle2 size={12} /> Норма выполнена!</>) : `Осталось: ${Math.max(0, goal - localMl)} мл · клик — открыть раздел Вода`}
            </p>
            </>); })()}
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Gear Alerts on Dashboard */}
          <div className="lg:col-span-1 space-y-2 sm:space-y-4">
              {(() => {
                const gearLife = (g) => g.life_km || (g.type === 'Цепь' ? 2000 : (String(g.type).includes('Кроссовки') ? 800 : (g.type === 'Велосипед' ? 50000 : 5000)));
                const alerts = gears.map(g => ({ ...g, _life: gearLife(g) }))
                  .filter(g => (g.current_distance / g._life) > 0.8 || (g.daysToService && g.daysToService < 14));
                if (!alerts.length) return (
                  <StatCard theme={theme} onClick={() => onNavigate && onNavigate('gears')} icon={<Bike />} title="Сервис" value={gears.length} subtext={gears.length ? 'всё в порядке' : 'нет снаряжения'} color="bg-emerald-500" />
                );
                return alerts.map(g => {
                    const wear = g.current_distance / g._life;
                    const dateStr = g.predictedServiceDate && !isNaN(new Date(g.predictedServiceDate).getTime()) ? new Date(g.predictedServiceDate).toLocaleDateString('ru-RU') : 'Нет данных';
                    return (<div key={g.id} onClick={() => onNavigate && onNavigate('gears')} className={`zap-card p-4 cursor-pointer ${wear > 0.9 ? 'animate-pulse' : ''}`} style={wear > 0.9 ? { borderColor: 'rgba(239,68,68,0.4)' } : { borderColor: 'rgba(245,158,11,0.35)' }}>
                        <div className="flex justify-between items-center">
                            <span className={`${wear > 0.9 ? 'text-red-400' : 'text-amber-500'} font-bold text-[10px] flex items-center gap-1`}>
                                {g.daysToService && g.daysToService < 7 ? (<><Siren size={12} /> СРОЧНОЕ ТО</>) : (<><AlertTriangle size={12} /> СЕРВИС СКОРО</>)}
                            </span>
                            <span className={`text-[10px] ${theme === 'dark' ? 'text-gray-400' : 'text-slate-500'}`}>{Math.round(g.current_distance)} / {g._life} км</span>
                        </div>
                        <h4 className={`${theme === 'dark' ? 'text-white' : 'text-slate-900'} text-sm font-bold mt-1`}>{g.name}</h4>
                        <div className="w-full h-1.5 rounded-full overflow-hidden mt-2" style={{ backgroundColor: withAlpha(accentColor, 0.15) }}>
                            <div className={`h-full rounded-full ${wear > 0.9 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, Math.round(wear * 100))}%` }} />
                        </div>
                        <p className={`text-[10px] ${theme === 'dark' ? 'text-gray-400' : 'text-slate-500'} mt-1 italic`}>
                            Износ {Math.round(wear * 100)}% · Прогноз: {dateStr}
                        </p>
                    </div>);
                });
              })()}
          </div>

          <div className="lg:col-span-3">
              {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard theme={theme} onClick={() => onNavigate && onNavigate('rides')} icon={<Activity />} title="Активности" value={stats.count} subtext="всего загружено" color="bg-orange-500" />
                <StatCard theme={theme} icon={<Clock />} title="Время" value={`${stats.time} ч`} subtext="в движении" color="bg-blue-500" />
                <StatCard theme={theme} icon={<TrendingUp />} title="Подъем" value={`${stats.elevation} м`} subtext="общий набор" color="bg-emerald-500" />
              </div>
          </div>
      </div>

      {/* Fitness Graph - CTL/ATL/TSB (единственный график формы) */}
      <FitnessGraph accentColor={accentColor} />

      {/* Goal Setting */}
      <GoalSetting theme={theme} accentColor={accentColor} />
    </div>
  );
};

// Вспомогательный компонент карточки
const StatCard = ({ icon, title, value, subtext, color, onClick, theme }) => (
  <div
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    className={`zap-card p-3 sm:p-6 hover:bg-white/10 transition-colors group ${onClick ? 'cursor-pointer' : ''}`}
  >
    <div className={`w-10 sm:w-12 h-10 sm:h-12 ${color} rounded-xl flex items-center justify-center text-white mb-2 sm:mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
      {React.cloneElement(icon, { size: 20 })}
    </div>
    <h3 className={`${theme === 'dark' ? 'text-gray-400' : 'text-slate-600'} text-xs sm:text-sm font-medium mb-1`}>{title}</h3>
    <div className={`text-2xl sm:text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'} mb-1`}>{value}</div>
    <div className="text-[10px] sm:text-xs text-gray-500">{subtext}</div>
  </div>
);

export default Dashboard;