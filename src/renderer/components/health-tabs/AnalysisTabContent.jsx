import React, { useState, useEffect } from 'react';
import { TrendingUp, Activity, Calendar, Zap } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function AnalysisTabContent({ theme, accentColor }) {
  const [activities, setActivities] = useState([]);
  const [weeklyStats, setWeeklyStats] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalysis();
  }, []);

  const loadAnalysis = async () => {
    try {
      const api = window.electronAPI;

      // Get recent activities
      const rides = await api.getRides?.();
      setActivities((rides || []).slice(-20).reverse());

      // Calculate weekly stats
      if (rides && rides.length > 0) {
        const weekly = {};
        rides.forEach(ride => {
          const date = new Date(ride.date);
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          const weekKey = weekStart.toISOString().split('T')[0];

          if (!weekly[weekKey]) {
            weekly[weekKey] = { week: weekKey, distance: 0, duration: 0, tss: 0, count: 0 };
          }
          weekly[weekKey].distance += ride.distance || 0;
          weekly[weekKey].duration += ride.duration || 0;
          weekly[weekKey].tss += ride.tss || 0;
          weekly[weekKey].count += 1;
        });

        setWeeklyStats(Object.values(weekly).slice(-12));

        // Calculate monthly stats
        const monthly = {};
        rides.forEach(ride => {
          const date = new Date(ride.date);
          const monthKey = date.toISOString().slice(0, 7);

          if (!monthly[monthKey]) {
            monthly[monthKey] = { month: monthKey, distance: 0, duration: 0, tss: 0, count: 0 };
          }
          monthly[monthKey].distance += ride.distance || 0;
          monthly[monthKey].duration += ride.duration || 0;
          monthly[monthKey].tss += ride.tss || 0;
          monthly[monthKey].count += 1;
        });

        setMonthlyStats(Object.values(monthly).slice(-12));
      }
    } catch (err) {
      console.error('Failed to load analysis:', err);
    }
    setLoading(false);
  };

  const totalDistance = activities.reduce((sum, a) => sum + (a.distance || 0), 0);
  const totalDuration = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
  const totalTSS = activities.reduce((sum, a) => sum + (a.tss || 0), 0);
  const avgDistance = activities.length > 0 ? (totalDistance / activities.length).toFixed(1) : 0;

  const bgClass = theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const textClass = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const subTextClass = theme === 'dark' ? 'text-gray-400' : 'text-slate-600';

  if (loading) {
    return <div className={textClass}>Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Всего км</p>
          <p className={`text-3xl font-bold ${textClass}`}>{totalDistance.toFixed(1)}</p>
          <p className={`${subTextClass} text-xs mt-1`}>{activities.length} тренировок</p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Среднее расстояние</p>
          <p className={`text-3xl font-bold ${textClass}`}>{avgDistance} км</p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Общее время</p>
          <p className={`text-3xl font-bold ${textClass}`}>{(totalDuration / 3600).toFixed(1)}h</p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Всего TSS</p>
          <p className={`text-3xl font-bold ${textClass}`}>{totalTSS.toFixed(0)}</p>
        </div>
      </div>

      {/* Weekly Chart */}
      {weeklyStats.length > 0 && (
        <div className={`${bgClass} border rounded-lg p-4`}>
          <h3 className={`${textClass} font-semibold mb-4 flex items-center gap-2`}>
            <Calendar size={18} style={{ color: accentColor }} />
            Тренировки по неделям
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={weeklyStats}>
              <CartesianGrid stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
              <XAxis dataKey="week" stroke={theme === 'dark' ? '#9ca3af' : '#d1d5db'} />
              <YAxis stroke={theme === 'dark' ? '#9ca3af' : '#d1d5db'} />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                  border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar dataKey="distance" fill="#3b82f6" name="Км" />
              <Bar dataKey="tss" fill={accentColor} name="TSS" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly Chart */}
      {monthlyStats.length > 0 && (
        <div className={`${bgClass} border rounded-lg p-4`}>
          <h3 className={`${textClass} font-semibold mb-4 flex items-center gap-2`}>
            <TrendingUp size={18} style={{ color: accentColor }} />
            Тренировки по месяцам
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyStats}>
              <CartesianGrid stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
              <XAxis dataKey="month" stroke={theme === 'dark' ? '#9ca3af' : '#d1d5db'} />
              <YAxis stroke={theme === 'dark' ? '#9ca3af' : '#d1d5db'} />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                  border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="distance" stroke="#3b82f6" name="Км" />
              <Line type="monotone" dataKey="tss" stroke={accentColor} name="TSS" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Activities */}
      {activities.length > 0 && (
        <div className={`${bgClass} border rounded-lg`}>
          <div className={`p-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-slate-200'}`}>
            <h3 className={`${textClass} font-semibold`}>Последние тренировки</h3>
          </div>
          <div className="divide-y divide-slate-200 max-h-80 overflow-y-auto">
            {activities.slice(0, 10).map((activity) => (
              <div key={activity.id} className={`p-4 ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Activity size={20} style={{ color: accentColor }} />
                    <div>
                      <p className={`${textClass} font-semibold`}>{activity.title || 'Тренировка'}</p>
                      <p className={subTextClass}>
                        {new Date(activity.date).toLocaleDateString('ru-RU')} • {activity.distance}км • {Math.round(activity.duration / 60)}мин • TSS: {activity.tss}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
