import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Activity, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

const AdvancedMetrics = ({ accentColor }) => {
  const [metrics, setMetrics] = useState({
    rampRate: 0,
    responseIndex: 0,
    forecast: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMetrics = async () => {
      if (window.electronAPI) {
        try {
          const data = await window.electronAPI.getAdvancedMetrics();
          setMetrics(data || { rampRate: 0, responseIndex: 0, forecast: [] });
        } catch (e) {
          console.error('Error loading advanced metrics:', e);
        }
      }
      setLoading(false);
    };
    loadMetrics();
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-bold text-white mb-4">Продвинутые метрики</h3>
        <div className="text-center text-gray-400">Загрузка...</div>
      </div>
    );
  }

  // Форматируем данные для графика прогноза
  const forecastData = metrics.forecast.map(f => ({
    date: new Date(f.date).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' }),
    CTL: parseFloat(f.ctl),
    ATL: parseFloat(f.atl),
    TSB: parseFloat(f.tsb)
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 p-3 rounded border border-gray-700">
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {entry.value.toFixed(1)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* RampRate and Response Index Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* RampRate Card */}
        <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/10 rounded-xl p-6 border border-blue-700/50">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-blue-300 text-sm font-medium">RampRate (Темп роста формы)</p>
              <p className="text-3xl font-bold text-white mt-2">{metrics.rampRate > 0 ? '+' : ''}{metrics.rampRate.toFixed(2)}</p>
              <p className="text-xs text-blue-200/60 mt-1">единиц в день</p>
            </div>
            {metrics.rampRate > 0 ? (
              <TrendingUp className="text-green-400" size={32} />
            ) : (
              <TrendingDown className="text-orange-400" size={32} />
            )}
          </div>
          <div className="bg-black/20 p-3 rounded text-xs text-blue-200/80">
            <p>
              {metrics.rampRate > 0.5 ? '🚀 Быстрый рост формы!' : 
               metrics.rampRate > 0 ? '📈 Постепенное улучшение' : 
               metrics.rampRate < -0.5 ? '📉 Быстрая потеря формы' : 
               '⚖️ Стабильная форма'}
            </p>
          </div>
        </div>

        {/* Response Index Card */}
        <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/10 rounded-xl p-6 border border-purple-700/50">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-purple-300 text-sm font-medium">Response Index (Чувствительность)</p>
              <p className="text-3xl font-bold text-white mt-2">{metrics.responseIndex.toFixed(2)}</p>
              <p className="text-xs text-purple-200/60 mt-1">коэффициент восстановления</p>
            </div>
            <Activity className="text-purple-400" size={32} />
          </div>
          <div className="bg-black/20 p-3 rounded text-xs text-purple-200/80">
            <p>
              {metrics.responseIndex > 0.8 ? '⚡ Высокая чувствительность (много усталости от нагрузок)' : 
               metrics.responseIndex > 0.3 ? '💪 Нормальная реакция на нагрузки' : 
               '🔧 Низкая чувствительность (медленное восстановление)'}
            </p>
          </div>
        </div>
      </div>

      {/* 7-Day Forecast */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <AlertCircle className="text-yellow-400" size={20} />
          Прогноз формы на 7 дней
        </h3>
        
        {forecastData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="date" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
              />
              <YAxis 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                domain={['dataMin - 10', 'dataMax + 10']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: '#d1d5db' }} iconType="line" />
              
              <ReferenceLine y={-30} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Перетренированность', position: 'left', fill: '#ef4444', fontSize: 10 }} />
              <ReferenceLine y={15} stroke="#10b981" strokeDasharray="5 5" label={{ value: 'Пик формы', position: 'left', fill: '#10b981', fontSize: 10 }} />
              
              <Line type="monotone" dataKey="CTL" stroke="#3b82f6" strokeWidth={2} dot={false} name="CTL (Форма)" />
              <Line type="monotone" dataKey="ATL" stroke="#f97316" strokeWidth={2} dot={false} name="ATL (Усталость)" />
              <Line type="monotone" dataKey="TSB" stroke={accentColor} strokeWidth={2.5} dot={false} name="TSB (Баланс)" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center text-gray-400 py-8">
            Недостаточно данных для прогноза
          </div>
        )}
      </div>

      {/* Interpretation */}
      <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
        <h4 className="text-white font-bold mb-3">💡 Интерпретация метрик:</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-300">
          <div>
            <p className="font-semibold text-blue-300 mb-1">RampRate</p>
            <p className="text-xs">Показывает, насколько быстро вы набираете или теряете форму. Положительный = улучшение, отрицательный = падение.</p>
          </div>
          <div>
            <p className="font-semibold text-purple-300 mb-1">Response Index</p>
            <p className="text-xs">Вашу индивидуальную чувствительность к тренировкам. Высокий = быстро устаёте, низкий = медленно восстанавливаетесь.</p>
          </div>
          <div>
            <p className="font-semibold text-amber-300 mb-1">Прогноз</p>
            <p className="text-xs">Экстраполяция текущего тренда на неделю вперед при условии сохранения среднего объема тренировок.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedMetrics;
