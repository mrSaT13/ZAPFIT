import React, { useState, useEffect } from 'react';
import { Moon, Droplet, Utensils, Scale, RefreshCw, Footprints } from 'lucide-react';

export default function OverviewTabContent({ theme, accentColor, onSync, syncing, lastSync }) {
  const [data, setData] = useState({ sleep: null, waterMl: 0, kcal: 0, weight: null, steps: null });

  const muted = theme === 'dark' ? 'text-gray-400' : 'text-slate-500';
  const card = theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const text = theme === 'dark' ? 'text-white' : 'text-slate-900';

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const api = window.electronAPI;
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const q = (sql, p = []) => api.query(sql, p).catch(() => []);
      const [sleepRows, waterRows, entriesRows, nutRows, weightRows, stepsRows] = await Promise.all([
        q('SELECT sleep_duration_hours, sleep_quality, date FROM sleep_data ORDER BY date DESC LIMIT 1'),
        q('SELECT ml FROM water WHERE date = ?', [today]),
        q('SELECT amount, time FROM water_entries ORDER BY time DESC LIMIT 500'),
        q('SELECT SUM(calories) as kcal FROM nutrition_data WHERE date = ?', [today]),
        q("SELECT value, date FROM health_metrics WHERE type='weight' ORDER BY date DESC LIMIT 1"),
        q("SELECT value FROM health_metrics WHERE type='steps' AND date = ?", [today]),
      ]);
      // water_entries.time — UTC-ISO, суммируем по локальному дню (как в табe Вода)
      const entrySum = (entriesRows || []).reduce((s, e) => {
        const t = new Date(e.time);
        if (isNaN(t)) return s;
        const dd = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
        return dd === today ? s + (Number(e.amount) || 0) : s;
      }, 0);
      const tableMl = Number(waterRows?.[0]?.ml) || 0;
      setData({
        sleep: sleepRows?.[0] || null,
        waterMl: Math.max(entrySum, tableMl),
        kcal: Math.round(Number(nutRows?.[0]?.kcal) || 0),
        weight: weightRows?.[0] || null,
        steps: stepsRows?.[0]?.value ?? null,
      });
    } catch (e) { console.error('overview load', e); }
  };

  const cards = [
    {
      icon: <Moon size={20} style={{ color: accentColor }} />,
      label: 'Сон',
      value: data.sleep ? `${Number(data.sleep.sleep_duration_hours).toFixed(1)} ч` : '—',
      sub: data.sleep ? data.sleep.date : 'нет данных',
    },
    {
      icon: <Droplet size={20} style={{ color: accentColor }} />,
      label: 'Вода сегодня',
      value: data.waterMl ? `${(data.waterMl / 1000).toFixed(2)} л` : '—',
      sub: data.waterMl ? `${data.waterMl} мл` : 'нет данных',
    },
    {
      icon: <Utensils size={20} style={{ color: accentColor }} />,
      label: 'Калории сегодня',
      value: data.kcal ? `${data.kcal}` : '—',
      sub: data.kcal ? 'ккал съедено' : 'нет данных',
    },
    {
      icon: <Scale size={20} style={{ color: accentColor }} />,
      label: 'Вес',
      value: data.weight ? `${Number(data.weight.value).toFixed(1)} кг` : '—',
      sub: data.weight ? data.weight.date : 'нет данных',
    },
    {
      icon: <Footprints size={20} style={{ color: accentColor }} />,
      label: 'Шаги сегодня',
      value: data.steps != null ? `${data.steps}` : '—',
      sub: data.steps != null ? 'с сервера' : 'нет данных',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`text-xs ${muted}`}>
          {lastSync ? `Обновлено: ${lastSync}` : 'Ещё не синхронизировано'}
        </span>
        <span className="flex-1" />
        <button
          onClick={async () => { await onSync?.(); load(); }}
          disabled={syncing}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50 ${theme === 'dark' ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'}`}
          title="Синхронизировать всё с сервером"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Синк...' : 'Синхронизировать'}
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className={`${card} border rounded-2xl p-4`}>
            <div className="flex items-center gap-2 mb-2">
              {c.icon}
              <span className={`text-xs font-semibold ${muted}`}>{c.label}</span>
            </div>
            <div className={`text-2xl font-bold ${text}`}>{c.value}</div>
            <div className={`text-xs ${muted}`}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
