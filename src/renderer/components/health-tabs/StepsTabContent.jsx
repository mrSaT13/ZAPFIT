import React, { useState, useEffect } from 'react';
import { Footprints, Plus, Trash2, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Таб «Шаги» (parity с мобилой steps_tab): данные уже синкаются в health_metrics.
export default function StepsTabContent({ theme, accentColor }) {
  const [steps, setSteps] = useState([]);
  const [input, setInput] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const muted = theme === 'dark' ? 'text-gray-400' : 'text-slate-500';
  const card = theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const text = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const inputClass = theme === 'dark' ? 'bg-black/40 border-gray-700 text-white' : 'bg-white border-slate-300 text-slate-900';

  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => { loadSteps(); }, []);

  const loadSteps = async () => {
    try {
      const rows = await window.electronAPI.query(
        `SELECT id, value, date FROM health_metrics WHERE type='steps' ORDER BY date ASC`, []
      );
      setSteps(Array.isArray(rows) ? rows : []);
    } catch (e) { console.error('load steps', e); }
  };

  const handleAdd = async () => {
    const v = parseInt(String(input).replace(/\s/g, ''), 10);
    if (!isFinite(v) || v <= 0 || v > 200000) return;
    try {
      const today = localToday();
      // Без UNIQUE(type,date) чистим день явно (как вес)
      await window.electronAPI.run(`DELETE FROM health_metrics WHERE type='steps' AND date=?`, [today]);
      await window.electronAPI.run(
        `INSERT INTO health_metrics (type, value, date) VALUES ('steps', ?, ?)`, [v, today]
      );
      setInput('');
      loadSteps();
    } catch (e) { console.error('add steps', e); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить запись шагов?')) return;
    try {
      await window.electronAPI.run('DELETE FROM health_metrics WHERE id = ?', [id]);
      loadSteps();
    } catch (e) { console.error('delete steps', e); }
  };

  const fmtSync = (r) => {
    if (!r?.success) return `Ошибка: ${r?.error || 'неизвестно'}`;
    const d = r.details?.steps;
    if (!d) return `Готово: ${r.synced ?? 0}`;
    return `Шаги: получено ${d.pulled}, сохранено ${d.saved}${d.skipped ? `, пропущено ${d.skipped}` : ''}`;
  };

  const today = localToday();
  const todayRow = steps.find((s) => s.date === today);
  const last7 = steps.slice(-7);
  const sum7 = last7.reduce((s, r) => s + (Number(r.value) || 0), 0);
  const avg7 = last7.length ? Math.round(sum7 / last7.length) : 0;
  const chartData = steps.slice(-30).map((s) => ({ date: s.date.slice(5), full: s.date, steps: Math.round(Number(s.value) || 0) }));

  return (
    <div className="space-y-6">
      <div className={`${card} border rounded-lg p-8`}>
        <div className="text-center">
          <p className={muted}>Шаги сегодня</p>
          <p className={`text-6xl font-bold ${text} my-4`}>
            {todayRow ? Number(todayRow.value).toLocaleString('ru-RU') : '—'}
          </p>
          <p className={`${muted} mb-2`}>{todayRow ? `обновлено ${todayRow.date}` : 'нет данных'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${card} border rounded-lg p-4`}>
          <p className={muted}>Всего за 7 дней</p>
          <p className={`text-3xl font-bold ${text}`}>{sum7.toLocaleString('ru-RU')}</p>
        </div>
        <div className={`${card} border rounded-lg p-4`}>
          <p className={muted}>Среднее в день (7 дн.)</p>
          <p className={`text-3xl font-bold ${text}`}>{avg7.toLocaleString('ru-RU')}</p>
        </div>
      </div>

      <div className={`${card} border rounded-lg p-6`}>
        <h3 className={`${text} font-semibold mb-4 flex items-center gap-2`}>
          <Footprints size={18} style={{ color: accentColor }} />
          Ручной ввод
        </h3>
        <div className="flex gap-3">
          <input
            type="number"
            step="1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="шагов за сегодня"
            className={`flex-1 px-4 py-3 rounded-lg border outline-none ${inputClass}`}
          />
          <button
            onClick={handleAdd}
            className="px-6 py-3 rounded-lg font-semibold text-white flex items-center gap-2"
            style={{ backgroundColor: accentColor }}
          >
            <Plus size={20} />
            Сохранить
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
                loadSteps();
              } finally { setSyncing(false); }
            }}
            disabled={syncing}
            className={`px-4 py-3 rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50 ${theme === 'dark' ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'}`}
            title="Подтянуть шаги с сервера"
          >
            <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
          </button>
        </div>
        {syncMsg && <p className={`text-xs ${muted} mt-2`}>{syncMsg}</p>}
      </div>

      {chartData.length > 1 && (
        <div className={`${card} border rounded-lg p-4`}>
          <h3 className={`${text} font-semibold mb-4`}>Динамика шагов</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
              <XAxis dataKey="date" stroke={theme === 'dark' ? '#9ca3af' : '#d1d5db'} tick={{ fontSize: 11 }} />
              <YAxis stroke={theme === 'dark' ? '#9ca3af' : '#d1d5db'} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                  border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '8px',
                }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ''}
                formatter={(v) => [`${Number(v).toLocaleString('ru-RU')}`, 'Шаги']}
              />
              <Bar dataKey="steps" fill={accentColor} name="Шаги" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {steps.length > 0 && (
        <div className={`${card} border rounded-lg p-4`}>
          <h3 className={`${text} font-semibold mb-3`}>История</h3>
          <div className="space-y-2">
            {[...steps].reverse().slice(0, 14).map((s) => (
              <div key={s.id} className={`flex items-center justify-between p-3 rounded-lg ${theme === 'dark' ? 'bg-white/5' : 'bg-slate-100'}`}>
                <div>
                  <p className={`${text} font-medium`}>{Number(s.value).toLocaleString('ru-RU')} шагов</p>
                  <p className={`text-xs ${muted}`}>{s.date}</p>
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
