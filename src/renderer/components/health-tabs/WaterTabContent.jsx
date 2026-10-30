import React, { useState, useEffect } from 'react';
import { Droplet, Plus, TrendingUp, Trash2, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function WaterTabContent({ theme, accentColor, waterCount: propWaterCount, onUpdateWater, recommendedWater: propRecommendedWater, totalWaterLiters: propTotalWaterLiters }) {
  const [totalWaterMl, setTotalWaterMl] = useState(0);
  const [recommendedWater, setRecommendedWater] = useState(propRecommendedWater || 3);
  const [waterHistory, setWaterHistory] = useState([]); // For chart (grouped by date)
  const [todayEntries, setTodayEntries] = useState([]); // For "Today's Entries" display
  const [inputMl, setInputMl] = useState('200');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const fmtSync = (r) => {
    if (!r?.success) return `Ошибка: ${r?.error || 'неизвестно'}`;
    const d = r.details?.water;
    if (!d) return `Готово: ${r.synced ?? 0}`;
    return `Вода: получено ${d.pulled}, применено ${d.saved}${d.skipped ? `, пропущено ${d.skipped}` : ''}`;
  };

  useEffect(() => {
    if (typeof propTotalWaterLiters !== 'undefined') {
      setTotalWaterMl(Math.round(propTotalWaterLiters * 1000));
      setRecommendedWater(propRecommendedWater || 3);
    }
    loadWaterData();
  }, [propTotalWaterLiters, propRecommendedWater]);

  const loadWaterData = async () => {
    try {
      const api = window.electronAPI;

      // Water stats
      if (api.getWater) {
        const entries = await api.getWater?.();
        // Локальные даты: e.time хранится в UTC-ISO, приводим к локальному дню
        const toLocalDay = (iso) => {
          const t = new Date(iso);
          if (isNaN(t)) return '';
          return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
        };
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // Group entries by date for chart
        const byDate = {};
        (entries || []).forEach(e => {
          const date = toLocalDay(e.time || e.created_at || '');
          if (!date) return;
          if (!byDate[date]) byDate[date] = 0;
          byDate[date] += parseInt(e.amount) || 0;
        });

        // Дневные итоги (water-таблица): включают серверный merge, которого нет в записях.
        // Итог дня = max(сумма записей, итог таблицы).
        let totals = {};
        try {
          const rows = await api.getWaterTotals?.();
          (rows || []).forEach(r => { if (r?.date) totals[r.date] = parseInt(r.ml) || 0; });
        } catch (_) {}

        const allDates = new Set([...Object.keys(byDate), ...Object.keys(totals)]);
        const combined = {};
        allDates.forEach(d => {
          combined[d] = Math.max(byDate[d] || 0, totals[d] || 0);
        });

        // Filter today's entries using the grouped data for consistency
        const today_entries = (entries || []).filter(e => {
          const entryDate = toLocalDay(e.time || e.created_at || '');
          return entryDate === todayStr;
        });

        setTodayEntries(today_entries);
        setTotalWaterMl(combined[todayStr] || 0);

        // Convert to array and add liters for chart
        const historyData = Object.entries(combined).map(([date, ml]) => ({
          date,
          ml,
          liters: (ml / 1000).toFixed(2)
        })).sort((a, b) => new Date(a.date) - new Date(b.date));

        setWaterHistory(historyData);
      }
      
      // Get recommended water
      if (api.getRecommendedWater) {
        const rec = await api.getRecommendedWater();
        if (rec?.success) setRecommendedWater(rec.liters);
      }
    } catch (err) {
      console.error('Failed to load water data:', err);
    }
    setLoading(false);
  };

  const handleAddWater = async () => {
    const ml = parseInt(inputMl) || 200;
    if (ml <= 0) {
      alert('Введите корректное значение');
      return;
    }

    try {
      const api = window.electronAPI;
      // All additions should use api.addWater to sync tables and history
      if (api?.addWater) {
        const res = await api.addWater({
          amount: ml,
          time: new Date().toISOString()
        });
        if (res?.success) {
          // Clear input and reload history
          setInputMl('200');
          loadWaterData();
          // notify other parts of the app
          if (typeof window !== 'undefined') window.dispatchEvent(new Event('water-updated'));
        }
      }
    } catch (err) {
      console.error('Failed to add water:', err);
    }
  };

  const handleRemoveWater = async (historyId) => {
    if (!window.confirm('Удалить запись о воде?')) return;

    try {
      const api = window.electronAPI;
      if (api?.deleteWater) {
        const res = await api.deleteWater(historyId);
        if (res?.success) {
          loadWaterData();
          if (typeof window !== 'undefined') window.dispatchEvent(new Event('water-updated'));
        }
      }
    } catch (err) {
      console.error('Failed to remove water entry:', err);
    }
  };

  const totalWaterLiters = (totalWaterMl / 1000).toFixed(2);
  const percentage = recommendedWater ? ((totalWaterLiters / recommendedWater) * 100).toFixed(0) : 0;
  const remaining = Math.max(0, (recommendedWater - totalWaterLiters).toFixed(2));

  const bgClass = theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const textClass = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const subTextClass = theme === 'dark' ? 'text-gray-400' : 'text-slate-600';
  const inputClass = theme === 'dark' ? 'bg-black/40 border-gray-700 text-white' : 'bg-white border-slate-300 text-slate-900';

  return (
    <div className="space-y-6">
      {/* Main Progress */}
      <div className={`${bgClass} border rounded-lg p-8`}>
        <div className="text-center">
          <p className={subTextClass}>Вода сегодня</p>
          <p className={`text-6xl font-bold ${textClass} my-4`}>{totalWaterLiters}L</p>
          <p className={`${subTextClass} mb-4`}>из {recommendedWater}L рекомендуемых</p>

          {/* Progress Bar */}
          <div className={`h-4 rounded-full overflow-hidden mb-4 ${theme === 'dark' ? 'bg-white/10' : 'bg-slate-300'}`}>
            <div
              className="h-full transition-all duration-500 rounded-full"
              style={{
                width: `${Math.min(100, percentage)}%`,
                backgroundColor: accentColor
              }}
            />
          </div>

          <p className={textClass}>{percentage}% выполнено</p>
          {remaining > 0 && (
            <p className={subTextClass}>Осталось {remaining}L</p>
          )}
        </div>
      </div>

      {/* Water Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Выпито сегодня</p>
          <p className={`text-3xl font-bold ${textClass}`}>{totalWaterMl}ml</p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Рекомендуемо</p>
          <p className={`text-3xl font-bold ${textClass}`}>{Math.round(recommendedWater * 1000)}ml</p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Осталось до нормы</p>
          <p className={`text-3xl font-bold ${textClass}`}>{Math.round(remaining * 1000)}ml</p>
        </div>
      </div>

      {/* Add Water Input */}
      <div className={`${bgClass} border rounded-lg p-6`}>
        <h3 className={`${textClass} font-semibold mb-4 flex items-center gap-2`}>
          <Droplet size={18} style={{ color: accentColor }} />
          Добавить воду
        </h3>
        <div className="flex gap-3">
          <input
            type="number"
            value={inputMl}
            onChange={(e) => setInputMl(e.target.value)}
            placeholder="Количество мл"
            className={`flex-1 px-4 py-3 rounded-lg border outline-none transition-all ${inputClass}`}
          />
          <button
            onClick={handleAddWater}
            className="px-6 py-3 rounded-lg font-semibold transition-all text-white flex items-center gap-2"
            style={{ backgroundColor: accentColor }}
          >
            <Plus size={20} />
            Добавить
          </button>
          <button
            onClick={async () => {
              const api = window.electronAPI;
              if (!api?.zapfitSyncHealth) return;
              setSyncing(true);
              setSyncMsg(null);
              try {
                const r = await api.zapfitSyncHealth();
                setSyncMsg(fmtSync(r));
                loadWaterData();
              } finally { setSyncing(false); }
            }}
            disabled={syncing}
            className={`px-4 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 disabled:opacity-50 ${theme === 'dark' ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'}`}
            title="Подтянуть воду с сервера"
          >
            <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
          </button>
        </div>
        {syncMsg && <p className={`text-xs ${subTextClass} mt-2`}>{syncMsg}</p>}
        <p className={`text-xs ${subTextClass} mt-2`}>Введите количество миллилитров (по умолчанию 200ml)</p>
      </div>

      {/* Recommendations */}
      <div className={`${bgClass} border rounded-lg p-4`}>
        <h3 className={`${textClass} font-semibold mb-3 flex items-center gap-2`}>
          <Droplet size={18} style={{ color: accentColor }} />
          Рекомендации по гидратации
        </h3>
        <ul className={`${subTextClass} space-y-2 text-sm`}>
          <li>• Основное правило: 2-3 литра воды в день</li>
          <li>• Спортсмены должны пить больше из-за потерь пота</li>
          <li>• Пейте до, во время и после тренировок</li>
          <li>• Моча должна быть светло-желтого цвета</li>
          <li>• Не ждите жажды - пейте регулярно</li>
          <li>• При интенсивных тренировках: 500-1000ml/час</li>
        </ul>
      </div>

      {/* Water History */}
      {waterHistory && waterHistory.length > 0 && (
        <>
          {/* History Chart */}
          <div className={`${bgClass} border rounded-lg p-4`}>
            <h3 className={`${textClass} font-semibold mb-4 flex items-center gap-2`}>
              <TrendingUp size={18} style={{ color: accentColor }} />
              История воды (последние дни)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={waterHistory.slice(-7)}>
                <CartesianGrid stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
                <XAxis dataKey="date" stroke={theme === 'dark' ? '#9ca3af' : '#d1d5db'} />
                <YAxis stroke={theme === 'dark' ? '#9ca3af' : '#d1d5db'} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                    border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                    borderRadius: '8px'
                  }}
                  formatter={(value) => `${value}ml`}
                />
                <Bar dataKey="ml" fill={accentColor} name="Миллилитры" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Today's Entries */}
          {todayEntries && todayEntries.length > 0 && (
            <div className={`${bgClass} border rounded-lg p-4`}>
              <h3 className={`${textClass} font-semibold mb-4`}>Записи за сегодня</h3>
              <div className="space-y-2">
                {todayEntries.map((entry) => (
                  <div key={entry.id} className={`flex items-center justify-between p-3 rounded-lg ${theme === 'dark' ? 'bg-white/5' : 'bg-slate-100'}`}>
                    <div>
                      <p className={`${textClass} font-medium`}>{entry.amount}ml</p>
                      <p className={`text-xs ${subTextClass}`}>{new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveWater(entry.id)}
                      className={`p-2 rounded-lg transition-all ${
                        theme === 'dark'
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                          : 'bg-red-50 text-red-600 hover:bg-red-100'
                      }`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
