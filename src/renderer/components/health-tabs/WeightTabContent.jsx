import React, { useState, useEffect } from 'react';
import { Scale, Plus, Trash2, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function WeightTabContent({ theme, accentColor }) {
  const [weights, setWeights] = useState([]);
  const [inputKg, setInputKg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const muted = theme === 'dark' ? 'text-gray-400' : 'text-slate-500';
  const card = theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const text = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const inputClass = theme === 'dark' ? 'bg-black/40 border-gray-700 text-white' : 'bg-white border-slate-300 text-slate-900';

  useEffect(() => { loadWeights(); }, []);

  const loadWeights = async () => {
    try {
      const api = window.electronAPI;
      const rows = await api.query(
        `SELECT id, value, date, note FROM health_metrics WHERE type='weight' ORDER BY date ASC`, []
      );
      setWeights(Array.isArray(rows) ? rows : []);
    } catch (e) { console.error('load weights', e); }
  };

  const handleAdd = async () => {
    const v = parseFloat(String(inputKg).replace(',', '.'));
    if (!isFinite(v) || v <= 0 || v > 500) return;
    try {
      const api = window.electronAPI;
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // В health_metrics нет UNIQUE(type,date), поэтому REPLACE не работает — чистим день явно
      await api.run(`DELETE FROM health_metrics WHERE type='weight' AND date=?`, [today]);
      await api.run(
        `INSERT INTO health_metrics (type, value, date) VALUES ('weight', ?, ?)`, [v, today]
      );
      setInputKg('');
      loadWeights();
    } catch (e) { console.error('add weight', e); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить запись веса?')) return;
    try {
      await window.electronAPI.run('DELETE FROM health_metrics WHERE id = ?', [id]);
      loadWeights();
    } catch (e) { console.error('delete weight', e); }
  };

  const fmtSync = (r) => {
    if (!r?.success) return `Ошибка: ${r?.error || 'неизвестно'}`;
    const d = r.details?.weight;
    if (!d) return `Готово: ${r.synced ?? 0}`;
    return `Вес: получено ${d.pulled}, сохранено ${d.saved}`;
  };

  const latest = weights.length ? weights[weights.length - 1] : null;
  const chartData = weights.map((w) => ({ date: w.date, kg: Number(w.value) })).filter((p) => isFinite(p.kg));

  return (
    <div className="space-y-6">
      <div className={`${card} border rounded-lg p-8`}>
        <div className="text-center">
          <p className={muted}>Вес</p>
          <p className={`text-6xl font-bold ${text} my-4`}>
            {latest ? `${Number(latest.value).toFixed(1)}` : '—'}
            <span className="text-2xl"> кг</span>
          </p>
          <p className={`${muted} mb-2`}>{latest ? `обновлено ${latest.date}` : 'нет данных'}</p>
        </div>
      </div>

      <div className={`${card} border rounded-lg p-6`}>
        <h3 className={`${text} font-semibold mb-4 flex items-center gap-2`}>
          <Scale size={18} style={{ color: accentColor }} />
          Новый замер
        </h3>
        <div className="flex gap-3">
          <input
            type="number"
            step="0.1"
            value={inputKg}
            onChange={(e) => setInputKg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="кг"
            className={`flex-1 px-4 py-3 rounded-lg border outline-none ${inputClass}`}
          />
          <button
            onClick={handleAdd}
            className="px-6 py-3 rounded-lg font-semibold text-white flex items-center gap-2"
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
                loadWeights();
              } finally { setSyncing(false); }
            }}
            disabled={syncing}
            className={`px-4 py-3 rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50 ${theme === 'dark' ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'}`}
            title="Подтянуть вес с сервера"
          >
            <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
          </button>
        </div>
        {syncMsg && <p className={`text-xs ${muted} mt-2`}>{syncMsg}</p>}
      </div>

      {chartData.length > 1 && (
        <div className={`${card} border rounded-lg p-4`}>
          <h3 className={`${text} font-semibold mb-4`}>Динамика веса</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
              <XAxis dataKey="date" stroke={theme === 'dark' ? '#9ca3af' : '#d1d5db'} tick={{ fontSize: 11 }} />
              <YAxis
                stroke={theme === 'dark' ? '#9ca3af' : '#d1d5db'}
                tick={{ fontSize: 11 }}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                  border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '8px',
                }}
                formatter={(v) => [`${v} кг`, 'Вес']}
              />
              <Line type="monotone" dataKey="kg" stroke={accentColor} dot={{ fill: accentColor, r: 3 }} name="Вес" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {weights.length > 0 && (
        <div className={`${card} border rounded-lg p-4`}>
          <h3 className={`${text} font-semibold mb-3`}>Замеры</h3>
          <div className="space-y-2">
            {[...weights].reverse().slice(0, 10).map((w) => (
              <div key={w.id} className={`flex items-center justify-between p-3 rounded-lg ${theme === 'dark' ? 'bg-white/5' : 'bg-slate-100'}`}>
                <div>
                  <p className={`${text} font-medium`}>{Number(w.value).toFixed(1)} кг</p>
                  <p className={`text-xs ${muted}`}>{w.date}</p>
                </div>
                <button
                  onClick={() => handleDelete(w.id)}
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
