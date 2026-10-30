import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Moon, TrendingUp, RefreshCw, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function SleepTabContent({ theme, accentColor }) {
  const [sleepData, setSleepData] = useState([]);
  const [todaySleep, setTodaySleep] = useState(null);
  const [form, setForm] = useState({ start: '', end: '', notes: '' });
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [selected, setSelected] = useState(null);

  // Длительность как в мобиле: "6ч 39м"
  const fmtDurHM = (hours) => {
    const totalMin = Math.round(Number(hours) * 60);
    if (!isFinite(totalMin) || totalMin <= 0) return '—';
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return h > 0 ? `${h}ч ${m}м` : `${m}м`;
  };

  const fmtSync = (r) => {
    if (!r?.success) return `Ошибка: ${r?.error || 'неизвестно'}`;
    const d = r.details?.sleep;
    if (!d) return `Готово: ${r.synced ?? 0}`;
    return `Сон: получено ${d.pulled}, сохранено ${d.saved}${d.skipped ? `, пропущено ${d.skipped}` : ''}`;
  };

  useEffect(() => {
    loadSleepData();
  }, []);

  const loadSleepData = async () => {
    try {
      const api = window.electronAPI;
      // Локальная дата (не UTC): иначе 00:00–03:00 по МСК «сегодня» = вчерашний UTC-день
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Get sleep data: последние 30 дней по ДАТЕ.
      // Было ORDER BY created_at — после массового синка у всех записей одна метка,
      // и LIMIT 30 возвращал старый срез вместо свежих.
      const allData = await api.query(
        'SELECT * FROM sleep_data ORDER BY date DESC LIMIT 30',
        []
      );
      setSleepData((allData || []));

      // Get today's sleep
      const todayData = await api.query(
        'SELECT * FROM sleep_data WHERE date = ? ORDER BY date DESC LIMIT 1',
        [today]
      );
      if (todayData && todayData.length > 0) {
        setTodaySleep(todayData[0]);
      }
    } catch (err) {
      console.error('Failed to load sleep data:', err);
    }
    setLoading(false);
  };

  const computeQualityFromDuration = (hours) => {
    if (!hours || isNaN(hours)) return 3;
    if (hours >= 9) return 5;
    if (hours >= 7) return 5;
    if (hours >= 6) return 4;
    if (hours >= 5) return 3;
    if (hours >= 4) return 2;
    return 1;
  };

  const computeDurationAndQuality = (startStr, endStr) => {
    const s0 = new Date(startStr);
    let e0 = new Date(endStr);
    if (isNaN(s0) || isNaN(e0)) return null;

    let start = new Date(s0);
    let end = new Date(e0);

    // If end <= start, assume end is next day
    if (end <= start) {
      end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }

    let durationHours = (end - start) / (1000 * 60 * 60);

    // Heuristic: if duration unreasonable (>16h) and day difference is ~1 and both times are morning,
    // assume user picked previous day for start and intended the same date as end.
    try {
      const dayDiff = Math.round(Math.abs((e0 - s0) / (24 * 60 * 60 * 1000)));
      if (durationHours > 16 && dayDiff === 1 && start.getHours() < 12 && end.getHours() <= 12) {
        start = new Date(start);
        start.setFullYear(end.getFullYear(), end.getMonth(), end.getDate());
        if (end <= start) {
          // if still invalid, shift start back a day
          start = new Date(start.getTime() - 24 * 60 * 60 * 1000);
        }
        durationHours = (end - start) / (1000 * 60 * 60);
      }
    } catch (err) {
      // ignore
    }

    const quality = computeQualityFromDuration(durationHours);
    return { durationHours, quality, start, end };
  };

  const handleSaveSleep = async (e) => {
    e.preventDefault();
    if (!form.start || !form.end) return alert('Укажите время начала и конца сна');

    try {
      const res = computeDurationAndQuality(form.start, form.end);
      if (!res) return alert('Проверьте правильность времени начала и конца');
      const { durationHours, quality, start } = res;
      if (!durationHours || isNaN(durationHours) || durationHours <= 0) return alert('Проверьте правильность времени начала и конца');
      // Локальная дата начала сна (toISOString дал бы UTC-день)
      const dateStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

      await window.electronAPI.run(
        `INSERT INTO sleep_data (date, start_time, end_time, sleep_duration_hours, sleep_quality, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [dateStr, start.toISOString(), (new Date(start.getTime() + durationHours * 3600 * 1000)).toISOString(), parseFloat(durationHours.toFixed(2)), parseInt(quality), form.notes || null]
      );

      setForm({ start: '', end: '', notes: '' });
      setShowForm(false);
      loadSleepData();
    } catch (err) {
      console.error('Failed to save sleep:', err);
    }
  };

  const handleDeleteSleep = async (id) => {
    if (!confirm('Удалить запись о сне?')) return;
    try {
      await window.electronAPI.run('DELETE FROM sleep_data WHERE id = ?', [id]);
      loadSleepData();
    } catch (err) {
      console.error('Failed to delete sleep:', err);
    }
  };

  const normQuality = (q) => {
    const v = Number(q);
    if (!isFinite(v)) return 3;
    if (v >= 1 && v <= 5 && Number.isInteger(v)) return v;
    // Старые серверные синки клали sleep_score 0-100 как есть
    if (v >= 85) return 5;
    if (v >= 70) return 4;
    if (v >= 55) return 3;
    if (v >= 40) return 2;
    return 1;
  };

  const getSleepQualityText = (quality) => {
    const q = normQuality(quality);
    if (q >= 5) return 'Идеальный';
    if (q >= 4) return 'Хороший';
    if (q >= 3) return 'Нормальный';
    if (q >= 2) return 'Плохой';
    return 'Очень плохой';
  };

  const getSleepQualityColor = (quality) => {
    const q = normQuality(quality);
    if (q >= 5) return '#10b981'; // green
    if (q >= 4) return '#3b82f6'; // blue
    if (q >= 3) return '#f59e0b'; // amber
    if (q >= 2) return '#ef4444'; // red
    return '#8b5cf6'; // purple
  };

  const normHours = (d) => {
    const v = Number(d);
    return isFinite(v) ? v.toFixed(1) : '—';
  };

  // График: только дни с данными, по возрастанию даты (было DESC — ось шла назад)
  const chartData = [...sleepData]
    .filter((d) => Number(d.sleep_duration_hours) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // Последний сон: сегодняшний, иначе самый свежий из истории
  const latestSleep = todaySleep || (sleepData.length ? sleepData[0] : null);

  const validForAvg = sleepData.filter((d) => Number(d.sleep_duration_hours) > 0);
  const avgSleep = validForAvg.length
    ? (validForAvg.reduce((s, d) => s + (Number(d.sleep_duration_hours) || 0), 0) / validForAvg.length).toFixed(1)
    : 0;

  const bgClass = theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const textClass = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const subTextClass = theme === 'dark' ? 'text-gray-400' : 'text-slate-600';
  const inputClass = theme === 'dark'
    ? 'bg-white/10 border-white/20 text-white placeholder-gray-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400';

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Среднее кол-во часов</p>
          <p className={`text-3xl font-bold ${textClass}`}>{avgSleep}h</p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Последний сон</p>
          <p className={`text-3xl font-bold ${textClass}`}>
            {latestSleep ? `${normHours(latestSleep.sleep_duration_hours)}h` : '—'}
          </p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4 min-w-0`}>
          <p className={subTextClass}>Качество сна</p>
          <p
            className="text-2xl font-bold truncate"
            style={{ color: latestSleep ? getSleepQualityColor(latestSleep.sleep_quality) : 'gray' }}
            title={latestSleep ? getSleepQualityText(latestSleep.sleep_quality) : ''}
          >
            {latestSleep ? getSleepQualityText(latestSleep.sleep_quality) : '—'}
          </p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className={`${bgClass} border rounded-lg p-4`}>
          <h3 className={`${textClass} font-semibold mb-4 flex items-center gap-2`}>
            <TrendingUp size={18} style={{ color: accentColor }} />
            Тренд сна (последние 30 дней)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="date"
                stroke={theme === 'dark' ? '#9ca3af' : '#d1d5db'}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                stroke={theme === 'dark' ? '#9ca3af' : '#d1d5db'}
                tick={{ fontSize: 12 }}
                label={{ value: 'Часы', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                  border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '8px'
                }}
                labelStyle={{ color: theme === 'dark' ? '#fff' : '#000' }}
              />
              <Line
                type="monotone"
                dataKey="sleep_duration_hours"
                stroke={accentColor}
                dot={{ fill: accentColor, r: 4 }}
                activeDot={{ r: 6 }}
                name="Часы сна"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Add Sleep Button */}
      <div className="flex gap-2">
      <button
        onClick={() => setShowForm(!showForm)}
        className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
          theme === 'dark'
            ? 'bg-white/10 hover:bg-white/20 text-white'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
        }`}
        style={showForm ? { backgroundColor: accentColor, color: 'white' } : {}}
      >
        <Plus size={20} />
        {showForm ? 'Отменить' : 'Добавить сон'}
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
            loadSleepData();
          } finally { setSyncing(false); }
        }}
        disabled={syncing}
        className={`px-4 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
          theme === 'dark' ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
        }`}
        title="Подтянуть сон с сервера"
      >
        <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
      </button>
      </div>
      {syncMsg && <p className={`text-xs ${subTextClass}`}>{syncMsg}</p>}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSaveSleep} className={`${bgClass} border rounded-lg p-4 space-y-4`}>
          <div>
            <label className={`block ${subTextClass} font-semibold mb-2`}>Время начала</label>
            <input
              type="datetime-local"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
              className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
            />
          </div>
          <div>
            <label className={`block ${subTextClass} font-semibold mb-2`}>Время пробуждения</label>
            <input
              type="datetime-local"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
              className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
            />
            <div className={`text-center mt-2 ${textClass}`}>
              {form.start && form.end ? (
                (() => {
                  const res = computeDurationAndQuality(form.start, form.end);
                  if (res && !isNaN(res.durationHours) && res.durationHours > 0) {
                    const hrs = res.durationHours.toFixed(2);
                    return `${hrs} ч — ${getSleepQualityText(res.quality)}`;
                  }
                  return 'Укажите корректные времена';
                })()
              ) : (
                'Укажите время начала и конца сна для расчёта'
              )}
            </div>
          </div>
          <div>
            <label className={`block ${subTextClass} font-semibold mb-2`}>Заметки</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Например: сложно уснуть, просыпался..."
              className={`w-full px-3 py-2 rounded-lg border ${inputClass} h-20 resize-none`}
            />
          </div>
          <button
            type="submit"
            className="w-full px-4 py-2 rounded-lg font-semibold text-white transition-all"
            style={{ backgroundColor: accentColor }}
          >
            Сохранить
          </button>
        </form>
      )}

      {/* Sleep History */}
      {sleepData.length > 0 && (
        <div className={`${bgClass} border rounded-lg`}>
          <div className={`p-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-slate-200'}`}>
            <h3 className={`${textClass} font-semibold`}>История сна</h3>
          </div>
          <div className="divide-y divide-slate-200">
            {sleepData.slice(0, 10).map((sleep) => (
              <div
                key={sleep.id}
                onClick={() => setSelected(sleep)}
                className={`p-4 flex items-center justify-between cursor-pointer ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-slate-50'} transition-colors`}
                title="Открыть детали"
              >
                    <div className="flex items-center gap-3">
                      <Moon size={20} style={{ color: accentColor }} />
                      <div>
                        <p className={`${textClass} font-semibold`}>{fmtDurHM(sleep.sleep_duration_hours)} · {sleep.date}</p>
                        <p className={subTextClass}>
                          {sleep.start_time && sleep.end_time ? (
                            `${new Date(sleep.start_time).toLocaleString()} — ${new Date(sleep.end_time).toLocaleString()}`
                          ) : (
                            `${normHours(sleep.sleep_duration_hours)}ч`
                          )} | Качество: {getSleepQualityText(sleep.sleep_quality)}
                        </p>
                      </div>
                    </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteSleep(sleep.id); }}
                  className={`p-2 rounded-lg transition-colors ${
                    theme === 'dark' ? 'hover:bg-red-500/20' : 'hover:bg-red-50'
                  }`}
                >
                  <Trash2 size={18} className="text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Детали сна (parity с мобилой) */}
      {selected && (() => {
        const deep = Number(selected.deep_sleep_seconds) || 0;
        const light = Number(selected.light_sleep_seconds) || 0;
        const rem = Number(selected.rem_sleep_seconds) || 0;
        const awake = Number(selected.awake_sleep_seconds) || 0;
        const total = deep + light + rem + awake;
        const segs = [
          { label: 'Глубокий', sec: deep, color: '#6366f1' },
          { label: 'Лёгкий', sec: light, color: '#38bdf8' },
          { label: 'REM', sec: rem, color: '#a78bfa' },
          { label: 'Бодрствование', sec: awake, color: '#f59e0b' },
        ];
        const fmtS = (s) => fmtDurHM(s / 3600);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)}>
            <div
              className={`${bgClass} border rounded-2xl w-full max-w-md p-6 shadow-2xl`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`${textClass} font-bold text-lg flex items-center gap-2`}>
                  <Moon size={20} style={{ color: accentColor }} />
                  Сон · {selected.date}
                </h3>
                <button onClick={() => setSelected(null)} className={`p-2 rounded-lg ${subTextClass} hover:bg-white/10`} title="Закрыть">
                  <X size={18} />
                </button>
              </div>
              <p className={`${textClass} text-3xl font-bold mb-1`}>{fmtDurHM(selected.sleep_duration_hours)}</p>
              <p className={`${subTextClass} text-sm mb-4`}>
                {selected.start_time && selected.end_time
                  ? `${new Date(selected.start_time).toLocaleString()} — ${new Date(selected.end_time).toLocaleString()}`
                  : 'Время начала/конца не указано'}
              </p>
              {total > 0 ? (
                <>
                  <div className="flex h-3 rounded-full overflow-hidden mb-3">
                    {segs.filter(s => s.sec > 0).map((s) => (
                      <div key={s.label} style={{ width: `${(s.sec / total) * 100}%`, backgroundColor: s.color }} title={`${s.label}: ${fmtS(s.sec)}`} />
                    ))}
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {segs.map((s) => (
                      <div key={s.label} className="flex items-center justify-between text-sm">
                        <span className={`flex items-center gap-2 ${subTextClass}`}>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.label}
                        </span>
                        <span className={textClass}>{fmtS(s.sec)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className={`${subTextClass} text-sm mb-4`}>Деталей по стадиям нет (ручная запись).</p>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className={`${theme === 'dark' ? 'bg-white/5' : 'bg-slate-100'} rounded-xl p-3`}>
                  <div className={subTextClass}>Качество</div>
                  <div className="font-bold" style={{ color: getSleepQualityColor(selected.sleep_quality) }}>
                    {typeof selected.score_overall === 'number' && selected.score_overall > 5
                      ? `${selected.score_overall}/100`
                      : getSleepQualityText(selected.sleep_quality)}
                  </div>
                </div>
                <div className={`${theme === 'dark' ? 'bg-white/5' : 'bg-slate-100'} rounded-xl p-3`}>
                  <div className={subTextClass}>Пульс покоя</div>
                  <div className={`${textClass} font-bold`}>
                    {selected.resting_heart_rate ? `${selected.resting_heart_rate} bpm` : '—'}
                  </div>
                </div>
                <div className={`${theme === 'dark' ? 'bg-white/5' : 'bg-slate-100'} rounded-xl p-3 col-span-2`}>
                  <div className={subTextClass}>Средний пульс</div>
                  <div className={`${textClass} font-bold`}>
                    {selected.avg_heart_rate ? `${selected.avg_heart_rate} bpm` : '—'}
                  </div>
                </div>
              </div>
              {selected.notes && <p className={`${subTextClass} text-sm mt-3`}>{selected.notes}</p>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
