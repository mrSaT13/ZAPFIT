import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

const FitnessGraph = ({ accentColor }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      if (window.electronAPI) {
        try {
          const history = await window.electronAPI.getFitnessHistory();
          // Берём последние 60 дней для красивого графика
          const recentData = history.slice(-60);
          setData(recentData);
        } catch (e) {
          console.error('Error loading fitness history:', e);
        }
      }
      setLoading(false);
    };
    loadHistory();
  }, []);

  if (loading || data.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-bold text-white mb-4">Динамика формы (60 дней)</h3>
        <div className="text-gray-400 text-center py-8">
          {loading ? 'Загрузка...' : 'Нет данных для отображения'}
        </div>
      </div>
    );
  }

  // Форматируем данные для графика
  const chartData = data.map(d => ({
    date: new Date(d.date).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' }),
    CTL: parseFloat(d.ctl),
    ATL: parseFloat(d.atl),
    TSB: parseFloat(d.tsb)
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
    <div className="bg-gray-900 rounded-2xl p-4 sm:p-6 border border-gray-800">
      <h3 className="text-base sm:text-lg font-bold text-white mb-4">Динамика формы (60 дней)</h3>
      
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="date" 
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            interval={Math.floor(chartData.length / 8)}
          />
          <YAxis 
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            domain={['dataMin - 10', 'dataMax + 10']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ color: '#d1d5db' }}
            iconType="line"
          />
          
          {/* Зоны перетренированности и пика формы */}
          <ReferenceLine 
            y={-30} 
            stroke="#ef4444" 
            strokeDasharray="5 5"
            label={{ value: 'Перетренированность', position: 'left', fill: '#ef4444', fontSize: 12 }}
          />
          <ReferenceLine 
            y={15} 
            stroke="#10b981" 
            strokeDasharray="5 5"
            label={{ value: 'Пик формы', position: 'left', fill: '#10b981', fontSize: 12 }}
          />
          
          {/* Линии графиков */}
          <Line 
            type="monotone" 
            dataKey="CTL" 
            stroke="#3b82f6" 
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
            name="Форма (CTL)"
          />
          <Line 
            type="monotone" 
            dataKey="ATL" 
            stroke="#f97316" 
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
            name="Усталость (ATL)"
          />
          <Line 
            type="monotone" 
            dataKey="TSB" 
            stroke={accentColor} 
            dot={false}
            strokeWidth={2.5}
            isAnimationActive={false}
            name="Баланс (TSB)"
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="bg-blue-900/30 p-3 rounded border border-blue-700/50">
          <p className="text-blue-300">CTL - Хроническая нагрузка</p>
          <p className="text-gray-400 text-xs mt-1">Общая форма (42 дня)</p>
        </div>
        <div className="bg-orange-900/30 p-3 rounded border border-orange-700/50">
          <p className="text-orange-300">ATL - Острая нагрузка</p>
          <p className="text-gray-400 text-xs mt-1">Текущая усталость (7 дней)</p>
        </div>
        <div className="bg-gray-800 p-3 rounded border border-gray-700">
          <p className="text-gray-300">TSB - Баланс</p>
          <p className="text-gray-400 text-xs mt-1">Свежесть (CTL - ATL)</p>
        </div>
      </div>
    </div>
  );
};

export default FitnessGraph;
