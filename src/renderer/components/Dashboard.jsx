import React, { useEffect, useState } from 'react';
import { Activity, TrendingUp, Zap, Clock, Plus, Bike, Wind, Heart } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import FitnessGraph from './FitnessGraph';

const Dashboard = ({ accentColor, onOpenManual, user, greeting, waterCount, onUpdateWater, recommendedWater, totalWaterLiters }) => {
  const [fitnessData, setFitnessData] = useState({ ctl: 0, atl: 0, tsb: 0, recommendation: '' });
  const [stats, setStats] = useState({ count: 0, time: 0, elevation: 0 });
  const [activityData, setActivityData] = useState([]);
  const [gears, setGears] = useState([]);
  const [loading, setLoading] = useState(true);

  // Загружаем данные формы
  useEffect(() => {
    const loadData = async () => {
      if (window.electronAPI) {
        const fData = await window.electronAPI.getFitnessForm();
        setFitnessData(fData || { ctl: 0, atl: 0, tsb: 0, recommendation: 'Нет данных' });

        const rides = await window.electronAPI.getRides();
        if (rides && rides.length > 0) {
          const totalDist = rides.reduce((sum, r) => sum + (r.distance || 0), 0);
          const totalTime = rides.reduce((sum, r) => sum + (r.duration || 0), 0);
          const totalElev = rides.reduce((sum, r) => sum + (r.elevation_gain || 0), 0);
          
          setStats({
            count: rides.length,
            time: (totalTime / 3600).toFixed(1),
            elevation: Math.round(totalElev)
          });

          const chartData = rides.slice(0, 7).reverse().map(r => ({
            day: new Date(r.date).toLocaleDateString(undefined, { weekday: 'short' }),
            value: Math.round(r.tss || 0)
          }));
          setActivityData(chartData);
        }

        try {
            if (window.electronAPI.getGearAnalytics) {
                const g = await window.electronAPI.getGearAnalytics();
                setGears(g || []);
            }
        } catch (e) {
            console.error(e);
        }
      }
      setLoading(false);
    };
    loadData();
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {greeting}, {user?.name || 'Атлет'}!
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm mt-1">Твой тренировочный хаб под контролем.</p>
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
                      {fitnessData.tsb}
                    </span>
                  </div>
                  <div className="text-xs bg-white/20 px-2 sm:px-3 py-1 rounded-lg backdrop-blur-sm shadow-inner group whitespace-nowrap">
                    <span className="opacity-70">CTL:</span> <span className="font-bold text-orange-400">{fitnessData.ctl}</span>
                    <span className="opacity-70 ml-1 sm:ml-2">ATL:</span> <span className="font-bold text-blue-400">{fitnessData.atl}</span>
                  </div>
                </div>
                <div className="relative group">
                    <p className="text-indigo-100 bg-black/20 p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-white/10 backdrop-blur-md leading-relaxed text-xs sm:text-sm line-clamp-2">
                      💡 {fitnessData.recommendation || "Загрузите активности для рекомендаций."}
                    </p>
                    <div className="absolute -left-1 top-0 bottom-0 w-1 bg-yellow-400 rounded-full group-hover:h-full transition-all duration-500"></div>
                </div>
              </>
            )}
          </div>

          {/* Hydration / Water Card */}
          <div className="bg-blue-600 rounded-2xl p-4 sm:p-6 text-white shadow-lg shadow-blue-500/20 flex flex-col justify-between">
            <h3 className="font-bold flex items-center gap-2 mb-2 sm:mb-4 text-sm sm:text-base">
                <span className="text-xl sm:text-2xl">💧</span> Гидратация
            </h3>
            <div className="flex items-center justify-center gap-4 sm:gap-6 my-2 sm:my-4">
                <button 
                    onClick={() => onUpdateWater(-1)}
                    className="w-8 sm:w-10 h-8 sm:h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors text-lg sm:text-xl"
                >−</button>
                <div className="text-center">
                    <span className="text-3xl sm:text-5xl font-black">{waterCount}</span>
                    <span className="text-xs sm:text-sm block opacity-70">стаканов</span>
                </div>
                <button 
                     onClick={() => onUpdateWater(1)}
                    className="w-8 sm:w-10 h-8 sm:h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors text-lg sm:text-xl"
                >+</button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] sm:text-xs text-blue-100 opacity-60">Держи баланс воды!</p>
              {typeof recommendedWater !== 'undefined' && recommendedWater !== null && (
                <p className="text-[10px] sm:text-xs text-blue-100 opacity-80">Рекомендуемо: {recommendedWater} л/д</p>
              )}
            </div>
            {typeof totalWaterLiters !== 'undefined' && (
              <p className="text-[10px] sm:text-xs text-blue-100 opacity-60 text-center mt-2">Всего выпито (в истории): {totalWaterLiters} л</p>
            )}
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Gear Alerts on Dashboard */}
          <div className="lg:col-span-1 space-y-2 sm:space-y-4">
              <h3 className="text-white font-bold flex items-center gap-2 mb-2 ml-1 text-sm sm:text-base">
                  <Wind size={16} className="text-indigo-400" /> Сервис
              </h3>
              {gears.filter(g => (g.current_distance / 5000) > 0.8 || g.daysToService < 14).length > 0 ? (
                  gears.filter(g => (g.current_distance / 5000) > 0.8 || g.daysToService < 14).map(g => (
                    <div key={g.id} className={`${(g.current_distance / 5000) > 0.9 ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'} border p-4 rounded-2xl animate-pulse`}>
                        <div className="flex justify-between items-center">
                            <span className={`${(g.current_distance / 5000) > 0.9 ? 'text-red-400' : 'text-amber-400'} font-bold text-[10px]`}>
                                {g.daysToService < 7 ? '🚨 СРОЧНОЕ ТО' : '⚠️ СЕРВИС СКОРО'}
                            </span>
                            <span className="text-[10px] text-gray-400">{Math.round(g.current_distance)} км</span>
                        </div>
                        <h4 className="text-white text-sm font-bold mt-1">{g.name}</h4>
                        <p className="text-[10px] text-gray-400 mt-1 italic">
                            Прогноз: {new Date(g.predictedServiceDate).toLocaleDateString()}
                        </p>
                    </div>
                  ))
              ) : (
                <div className="bg-white/5 border border-white/5 p-6 rounded-2xl text-center">
                    <Bike size={32} className="mx-auto text-gray-700 mb-2 opacity-50" />
                    <p className="text-xs text-gray-500">Все снаряжение в порядке</p>
                </div>
              )}
          </div>

          <div className="lg:col-span-3">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard icon={<Activity />} title="Активности" value={stats.count} subtext="всего загружено" color="bg-orange-500" />
                <StatCard icon={<Clock />} title="Время" value={`${stats.time} ч`} subtext="в движении" color="bg-blue-500" />
                <StatCard icon={<TrendingUp />} title="Подъем" value={`${stats.elevation} м`} subtext="общий набор" color="bg-emerald-500" />
              </div>
          </div>
      </div>

      {/* Fitness Graph - CTL/ATL/TSB */}
      <FitnessGraph accentColor={accentColor} />

      {/* Chart */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 backdrop-blur-md">
        <h3 className="text-base sm:text-lg font-semibold text-white mb-4">Нагрузка (TSS)</h3>
        <div className="h-48 sm:h-64 w-full">
          {activityData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" vertical={false} />
                <XAxis dataKey="day" stroke="#94a3b8" tick={{fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                <YAxis hide domain={[0, 'dataMax + 20']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  cursor={{ stroke: '#f97316', strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#f97316" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#f97316', strokeWidth: 0 }} 
                  activeDot={{ r: 6, fill: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-white/50">Нет данных для графика</div>
          )}
        </div>
      </div>
    </div>
  );
};

// Вспомогательный компонент карточки
const StatCard = ({ icon, title, value, subtext, color }) => (
  <div className="bg-white/5 border border-white/10 rounded-2xl p-3 sm:p-6 hover:bg-white/10 transition-colors group">
    <div className={`w-10 sm:w-12 h-10 sm:h-12 ${color} rounded-xl flex items-center justify-center text-white mb-2 sm:mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
      {React.cloneElement(icon, { size: 20 })}
    </div>
    <h3 className="text-gray-400 text-xs sm:text-sm font-medium mb-1">{title}</h3>
    <div className="text-2xl sm:text-3xl font-bold text-white mb-1">{value}</div>
    <div className="text-[10px] sm:text-xs text-gray-500">{subtext}</div>
  </div>
);

export default Dashboard;