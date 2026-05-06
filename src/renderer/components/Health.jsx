import React, { useEffect, useState } from 'react';
import { Heart, Moon, Thermometer, Plus } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, Tooltip } from 'recharts';
import AdvancedMetrics from './AdvancedMetrics';
import ExportReport from './ExportReport';

export default function Health({ theme, accentColor }) {
  const [user, setUser] = useState(null);
  const [fitness, setFitness] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [newMetric, setNewMetric] = useState({ type: 'weight', value: '', note: '' });
  const [sleepForm, setSleepForm] = useState({ start: '', end: '' });
  const [pulseForm, setPulseForm] = useState({ resting_hr: '', hrv: '' });

  const load = async () => {
    try {
      if (window.electronAPI) {
        const u = await window.electronAPI.getUser(); setUser(u);
        const f = await window.electronAPI.getFitnessForm(); setFitness(f);
        if (window.electronAPI.getHealthMetrics) {
          const m = await window.electronAPI.getHealthMetrics(); setMetrics(m || []);
        }
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { load(); }, []);

  const addMetric = async () => {
    if (!newMetric.value) return;
    try {
      await window.electronAPI.addHealthMetric({ ...newMetric, date: new Date().toISOString(), value: parseFloat(newMetric.value) });
      setNewMetric({ type: 'weight', value: '', note: '' });
      load();
    } catch (e) { console.error(e); }
  };

  const computeSleepQuality = ({ duration, start, hrv = null, resting_hr = null } = {}) => {
    // weights
    const w1 = 0.4, w2 = 0.25, w3 = 0.2, w4 = 0.15;

    const hours = Number.parseFloat(duration || 0);
    // durationScore: 100 at 8h, penalty 25 points per hour deviation
    const durationScore = Math.max(0, 100 - 25 * Math.abs(hours - 8));

    // consistencyScore: compute median start hour from existing sleep metrics
    const sleepStarts = metrics
      .filter(m => m.type === 'sleep' && m.date)
      .map(m => {
        try {
          const d = new Date(m.date);
          return d.getHours() + d.getMinutes() / 60;
        } catch (e) { return null; }
      })
      .filter(x => x !== null && !Number.isNaN(x));

    const startHour = start ? (new Date(start)).getHours() + (new Date(start)).getMinutes() / 60 : null;
    let consistencyScore = 100;
    if (sleepStarts.length > 0 && startHour !== null) {
      const sorted = sleepStarts.slice().sort((a,b)=>a-b);
      const mid = Math.floor(sorted.length/2);
      const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
      // handle wrap-around (e.g., 23.5 vs 0.5)
      const diff = Math.abs(startHour - median);
      const modDiff = Math.min(diff, 24 - diff);
      const deviation = modDiff; // hours
      consistencyScore = Math.max(0, 100 - 10 * deviation);
    }

    // HRV normalization (typical range 20..100 ms)
    let hrvScore = 50;
    if (hrv !== null && !Number.isNaN(hrv)) {
      const minH = 20, maxH = 100;
      const clamped = Math.max(minH, Math.min(maxH, Number(hrv)));
      hrvScore = ((clamped - minH) / (maxH - minH)) * 100;
    }

    // resting HR inverse normalization (typical 40..90 bpm)
    let restingScore = 50;
    if (resting_hr !== null && !Number.isNaN(resting_hr)) {
      const minR = 40, maxR = 90;
      const clamped = Math.max(minR, Math.min(maxR, Number(resting_hr)));
      restingScore = ((maxR - clamped) / (maxR - minR)) * 100;
    }

    const raw = w1*durationScore + w2*consistencyScore + w3*hrvScore + w4*restingScore;
    return Math.round(raw);
  };

  const addSleep = async () => {
    if (!sleepForm.start || !sleepForm.end) return;
    const parseLocal = (s) => {
      if (!s) return null;
      const parts = s.split(/[-T:]/).map(Number);
      const [year, month, day, hour = 0, minute = 0, second = 0] = parts;
      return new Date(year, (month || 1) - 1, day || 1, hour, minute, second);
    };
    const start = parseLocal(sleepForm.start);
    const end = parseLocal(sleepForm.end);
    if (!start || !end || isNaN(start) || isNaN(end) || end <= start) return alert('Проверьте время сна');
    const durationH = (end.getTime() - start.getTime()) / 1000 / 3600;
    const quality = computeSleepQuality(durationH);
    const note = `duration=${durationH.toFixed(2)}h;quality=${quality}`;
    try {
      const res = await window.electronAPI.addHealthMetric({ type: 'sleep', value: parseFloat(durationH.toFixed(2)), date: start.toISOString(), note });
      // отправляем фичи в ML для обучения/учёта
      if (window.electronAPI.trainML) {
        window.electronAPI.trainML({ type: 'sleep', duration: durationH, quality, metricId: res.id });
      }
      setSleepForm({ start: '', end: '' });
      load();
    } catch (e) { console.error(e); }
  };

  const addPulse = async () => {
    if (!pulseForm.resting_hr && !pulseForm.hrv) return;
    try {
      if (pulseForm.resting_hr) {
        await window.electronAPI.addHealthMetric({ type: 'resting_hr', value: parseFloat(pulseForm.resting_hr), date: new Date().toISOString(), note: pulseForm.hrv ? `hrv=${pulseForm.hrv}` : '' });
      }
      if (pulseForm.hrv) {
        await window.electronAPI.addHealthMetric({ type: 'hrv', value: parseFloat(pulseForm.hrv), date: new Date().toISOString(), note: pulseForm.resting_hr ? `resting_hr=${pulseForm.resting_hr}` : '' });
      }
      // отправка в ML
      if (window.electronAPI.trainML) window.electronAPI.trainML({ type: 'pulse', resting_hr: pulseForm.resting_hr, hrv: pulseForm.hrv });
      setPulseForm({ resting_hr: '', hrv: '' });
      load();
    } catch (e) { console.error(e); }
  };

  const addWeight = async () => {
    if (!newMetric.value) return;
    try {
      const valueNum = parseFloat(newMetric.value);
      const res = await window.electronAPI.addHealthMetric({ type: 'weight', value: valueNum, date: new Date().toISOString(), note: newMetric.note || null });
      // обновим профиль пользователя весом
      try {
        const u = await window.electronAPI.getUser();
        const upd = { ...(u || {}), weight: valueNum };
        await window.electronAPI.saveUser(upd);
      } catch (e) { /* ignore */ }
      if (window.electronAPI.trainML) window.electronAPI.trainML({ type: 'weight', value: valueNum, metricId: res.id });
      setNewMetric({ type: 'weight', value: '', note: '' });
      load();
    } catch (e) { console.error(e); }
  };

  const handleDeleteMetric = async (id) => {
    if (!confirm('Удалить запись?')) return;
    try {
      await window.electronAPI.deleteHealthMetric(id);
      load();
    } catch (e) { console.error(e); }
  };

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editNote, setEditNote] = useState('');

  const startEdit = (m) => { setEditingId(m.id); setEditValue(m.value); setEditNote(m.note || ''); };
  const saveEdit = async (id) => {
    try {
      await window.electronAPI.updateHealthMetric(id, { value: parseFloat(editValue), note: editNote });
      setEditingId(null); setEditValue(''); setEditNote(''); load();
    } catch (e) { console.error(e); }
  };

  const bmi = () => {
    if (!user) return null;
    const h = (user.height || 180) / 100; const w = user.weight || 0; if (!h) return null; return (w / (h*h)).toFixed(1);
  };

  // Build series for charts
  const series = (() => {
    const byType = (t) => metrics.filter(m => m.type === t).map(m => ({ date: m.date, value: Number(m.value) })).sort((a,b)=>new Date(a.date)-new Date(b.date));
    const sleep = byType('sleep');
    const weight = byType('weight');
    const hrv = byType('hrv');
    const avg30 = (arr) => {
      const now = Date.now();
      const cutoff = now - 30*24*3600*1000;
      const recent = arr.filter(x => new Date(x.date).getTime() >= cutoff).map(x=>x.value);
      if (!recent.length) return null;
      return (recent.reduce((s,v)=>s+v,0)/recent.length).toFixed(1);
    };
    return { sleep, weight, hrv, weightAvg30: avg30(weight), hrvAvg30: avg30(hrv) };
  })();

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in max-h-full overflow-y-auto pb-8 px-2 sm:px-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 px-2 sm:px-0">
        <div className="p-2 sm:p-3 rounded-lg bg-red-500/10 text-red-400 flex-shrink-0"><Heart size={20} className="sm:size-[24px]" /></div>
        <div>
          <h2 className="text-2xl font-bold">Здоровье</h2>
          <p className="text-xs sm:text-sm text-gray-400">Сон, HRV и показатели веса.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6 px-2 sm:px-0">
        <div className="bg-white/5 p-3 sm:p-6 rounded-xl sm:rounded-2xl border border-white/10">
          <h3 className="font-semibold mb-2 sm:mb-3 flex items-center gap-2 text-sm sm:text-base"><Moon size={14} className="sm:size-[16px]"/> Сон</h3>
          <div style={{ width: '100%', height: 50 }} className="mb-2 sm:mb-3">
            <ResponsiveContainer>
              <LineChart data={series.sleep}>
                <XAxis dataKey="date" hide />
                <Tooltip formatter={(v)=>[v,'ч']} labelFormatter={l=>new Date(l).toLocaleDateString()} />
                <Line type="monotone" dataKey="value" stroke="#60a5fa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {(() => {
            const last = metrics.find(m => m.type === 'sleep');
            if (!last) return <p className="text-sm text-gray-400">Данных о сне пока нет. Можно подключить интеграцию из внешних источников.</p>;
            const duration = Number.parseFloat(last.value || 0);
            const qMatch = last.note ? last.note.match(/quality=([0-9]+(?:\.[0-9]+)?)/) : null;
            const qualityFromNote = qMatch ? Number.parseFloat(qMatch[1]) : null;
            const computedQuality = computeSleepQuality(duration);
            const quality = qualityFromNote !== null ? qualityFromNote : computedQuality;
            return (
              <div>
                <p className="text-sm text-gray-200">Последний: <strong>{new Date(last.date).toLocaleString()}</strong></p>
                <p className="text-sm text-gray-400">Длительность: <strong>{duration.toFixed(2)} ч</strong> · Качество: <strong>{quality}</strong></p>
              </div>
            );
          })()}
        </div>
        <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
          <h3 className="font-semibold mb-2 flex items-center gap-2"><Thermometer size={16}/> Вес и BMI</h3>
          <p className="text-sm text-gray-400">Вес: <strong>{user?.weight ?? '—'} кг</strong></p>
          <p className="text-sm text-gray-400">Рост: <strong>{user?.height ?? '—'} см</strong></p>
          <p className="text-sm text-gray-400">BMI: <strong>{bmi() ?? '—'}</strong></p>
          <div style={{ width: '100%', height: 60 }} className="mt-3">
            <ResponsiveContainer>
              <LineChart data={series.weight}>
                <XAxis dataKey="date" hide />
                <Tooltip formatter={(v)=>[v,'кг']} labelFormatter={l=>new Date(l).toLocaleDateString()} />
                <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
          <h3 className="font-semibold mb-2">HRV / Пульс</h3>
          <p className="text-sm text-gray-400">CTL: {fitness?.ctl ?? '—'} · ATL: {fitness?.atl ?? '—'} · TSB: {fitness?.tsb ?? '—'}</p>
          <div style={{ width: '100%', height: 60 }} className="mt-3">
            <ResponsiveContainer>
              <LineChart data={series.hrv}>
                <XAxis dataKey="date" hide />
                <Tooltip formatter={(v)=>[v,'ms']} labelFormatter={l=>new Date(l).toLocaleDateString()} />
                <Line type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

        <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
        <h3 className="font-semibold mb-4">Замеры</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Sleep form */}
          <div className="p-3 bg-black/10 rounded">
            <div className="text-sm font-medium mb-2">Добавить сон</div>
            <label className="block text-xs text-gray-400">Начало</label>
            <input type="datetime-local" className="w-full p-2 rounded bg-black/30 mb-2" value={sleepForm.start} onChange={e => setSleepForm({...sleepForm, start: e.target.value})} />
            <label className="block text-xs text-gray-400">Конец</label>
            <input type="datetime-local" className="w-full p-2 rounded bg-black/30 mb-3" value={sleepForm.end} onChange={e => setSleepForm({...sleepForm, end: e.target.value})} />
            <button onClick={addSleep} className="w-full bg-indigo-600 py-2 rounded text-sm">Добавить сон</button>
          </div>

          {/* Pulse / HRV form */}
          <div className="p-3 bg-black/10 rounded">
            <div className="text-sm font-medium mb-2">Пульс / HRV</div>
            <label className="block text-xs text-gray-400">Пульс в покое (bpm)</label>
            <input type="number" className="w-full p-2 rounded bg-black/30 mb-2" value={pulseForm.resting_hr} onChange={e => setPulseForm({...pulseForm, resting_hr: e.target.value})} />
            <label className="block text-xs text-gray-400">HRV (ms)</label>
            <input type="number" className="w-full p-2 rounded bg-black/30 mb-3" value={pulseForm.hrv} onChange={e => setPulseForm({...pulseForm, hrv: e.target.value})} />
            <button onClick={addPulse} className="w-full bg-indigo-600 py-2 rounded text-sm">Добавить пульс</button>
          </div>

          {/* Weight form */}
          <div className="p-3 bg-black/10 rounded">
            <div className="text-sm font-medium mb-2">Вес</div>
            <label className="block text-xs text-gray-400">Вес (кг)</label>
            <input type="number" step="0.1" className="w-full p-2 rounded bg-black/30 mb-2" placeholder="вес" value={newMetric.value} onChange={e => setNewMetric({...newMetric, value: e.target.value})} />
            <label className="block text-xs text-gray-400">Заметка</label>
            <input className="w-full p-2 rounded bg-black/30 mb-3" placeholder="заметка" value={newMetric.note} onChange={e => setNewMetric({...newMetric, note: e.target.value})} />
            <button onClick={addWeight} className="w-full bg-indigo-600 py-2 rounded text-sm">Добавить вес</button>
            <div className="text-xs text-gray-400 mt-2">Последний: <strong>{(metrics.find(m=>m.type==='weight')||{}).value || user?.weight || '—'}</strong></div>
          </div>
        </div>

        <div className="space-y-2">
          {metrics.length === 0 && <p className="text-sm text-gray-400">Нет записей.</p>}
          {metrics.map(m => (
            <div key={m.id} className="flex justify-between items-center text-sm bg-black/20 p-2 rounded">
              <div>
                <div className="font-medium">{m.type}</div>
                <div className="text-xs text-gray-400">{new Date(m.date).toLocaleString()} {m.note ? `· ${m.note}` : ''}</div>
              </div>
              <div className="flex items-center gap-3">
                {editingId === m.id ? (
                  <div className="flex items-center gap-2">
                    <input className="w-20 p-1 rounded bg-black/30" value={editValue} onChange={e=>setEditValue(e.target.value)} />
                    <input className="w-36 p-1 rounded bg-black/30" value={editNote} onChange={e=>setEditNote(e.target.value)} />
                    <button onClick={() => saveEdit(m.id)} className="px-2 py-1 bg-green-600 rounded text-xs">Сохранить</button>
                    <button onClick={() => setEditingId(null)} className="px-2 py-1 bg-gray-600 rounded text-xs">Отмена</button>
                  </div>
                ) : (
                  <>
                    <div className="font-bold">{m.value}</div>
                    <button onClick={() => startEdit(m)} className="px-2 py-1 bg-indigo-600 rounded text-xs">Изм.</button>
                    <button onClick={() => handleDeleteMetric(m.id)} className="px-2 py-1 bg-red-600 rounded text-xs">Удал.</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Advanced Metrics Section */}
        <div className="mt-8">
          <AdvancedMetrics accentColor="#f97316" />
        </div>

        {/* Export Report Section */}
        <div className="mt-8">
          <ExportReport accentColor="#f97316" />
        </div>
      </div>
    </div>
  );
}
