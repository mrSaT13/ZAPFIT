import React, { useState, useEffect } from 'react';
import { Heart, Activity, TrendingUp, Trash2, Plus } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';

// Паритет с mobile heart_rate_tab.dart — пульс за сегодня, зоны, история
export default function PulseTabContent({ theme, accentColor }) {
  const [records, setRecords] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [stats, setStats] = useState({ avg: 0, max: 0, min: 0, resting: null });
  const [form, setForm] = useState({ bpm: '', date: new Date().toISOString().slice(0,16), note: '' });
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const bgClass = theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const textClass = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const subTextClass = theme === 'dark' ? 'text-gray-400' : 'text-slate-600';
  const inputClass = theme === 'dark' ? 'bg-white/10 border-white/20 text-white placeholder-gray-500' : 'bg-white border-slate-300 text-slate-900';

  const load = async () => {
    try {
      const api = window.electronAPI;
      // heart_rate / pulse from health_metrics plus heart_rate_records table
      let data = [];
      try {
        data = await api.query('SELECT * FROM health_metrics WHERE type IN ("heart_rate","pulse","hr","resting_hr") ORDER BY date DESC LIMIT 100', []) || [];
      } catch(e){ data = []; }
      // fallback to heart_rate_records if exists
      let hrRecords = [];
      try {
        hrRecords = await api.query('SELECT * FROM heart_rate_records ORDER BY timestamp_ms DESC LIMIT 100', []) || [];
        // merge
        for (const r of hrRecords) {
          const t = new Date(r.timestamp_ms);
          const d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
          data.push({ id: r.id, value: r.bpm, date: d, type: 'heart_rate', source: r.source });
        }
      } catch(_){}
      // sleep_data HR fallback
      try {
        const sleepHr = await api.query('SELECT date, sleep_quality, notes FROM sleep_data WHERE sleep_quality IS NOT NULL ORDER BY date DESC LIMIT 20', []) || [];
      } catch(_){}
      setRecords(data);
      const n = new Date();
      const todayStr = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
      const today = data.filter(r => (r.date||'').startsWith(todayStr));
      setTodayRecords(today);
      if (data.length) {
        const vals = data.map(r=> Number(r.value)).filter(v=>!isNaN(v) && v>0);
        if (vals.length) {
          setStats({
            avg: Math.round(vals.reduce((a,b)=>a+b,0)/vals.length),
            max: Math.max(...vals),
            min: Math.min(...vals),
            resting: vals[vals.length-1]
          });
        }
      }
      // also fetch user resting/max for zones
      try {
        const u = await api.getUser();
        if (u) setStats(s => ({ ...s, resting: u.resting_hr || s.resting, maxHr: u.max_hr }));
      } catch(_){}
    } catch(e){ console.error('pulse load', e); }
    setLoading(false);
  };

  useEffect(()=>{ load(); }, []);

  const handleAdd = async (e)=>{
    e.preventDefault();
    const bpm = parseInt(form.bpm);
    if (!bpm || bpm < 30 || bpm > 250) return alert('Введите корректный пульс 30-250');
    try {
      const toLocalDay = (v) => {
        const t = new Date(v);
        if (isNaN(t)) return '';
        return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      };
      const dateStr = form.date ? toLocalDay(form.date) : toLocalDay(Date.now());
      const tsMs = form.date ? new Date(form.date).getTime() : Date.now();
      await window.electronAPI.run('INSERT INTO health_metrics (type, value, date, note, user_id) VALUES (?,?,?,?,?)', ['heart_rate', bpm, dateStr, form.note || '', 0]);
      await window.electronAPI.run('INSERT INTO health_metrics (type, value, date, note, user_id) VALUES (?,?,?,?,?)', ['pulse', bpm, dateStr, form.note || '', 0]);
      try { await window.electronAPI.run('INSERT INTO heart_rate_records (timestamp_ms, bpm, source, is_synced, date) VALUES (?,?,?,?,?)', [tsMs, bpm, 'manual', 0, dateStr]); } catch(_){}
      const nd = new Date();
      const pad = (v) => String(v).padStart(2, '0');
      setForm({ bpm:'', date: `${nd.getFullYear()}-${pad(nd.getMonth()+1)}-${pad(nd.getDate())}T${pad(nd.getHours())}:${pad(nd.getMinutes())}`, note:''});
      setShowForm(false);
      load();
    } catch(err){ console.error(err); alert('Ошибка сохранения'); }
  };

  const handleDelete = async (id)=>{
    if(!confirm('Удалить запись пульса?')) return;
    try { await window.electronAPI.run('DELETE FROM health_metrics WHERE id=?', [id]); load(); } catch(e){ console.error(e); }
  };

  const getZone = (bpm, resting, max)=>{
    const r = resting || 60; const m = max || 190;
    const reserve = m - r;
    if (reserve <=0) return { label:'—', color:'#6b7280' };
    const pct = ((bpm - r)/reserve)*100;
    if (pct <50) return { label:'Восстановление', color:'#6b7280' };
    if (pct <60) return { label:'Выносливость', color:'#3b82f6' };
    if (pct <70) return { label:'Темп', color:'#10b981' };
    if (pct <80) return { label:'Порог', color:'#f59e0b' };
    if (pct <90) return { label:'VO2 Max', color:'#ef4444' };
    return { label:'Анаэроб', color:'#7c3aed' };
  };

  const chartData = records.slice(0,30).reverse().map(r=>({ date: (r.date||'').slice(5), bpm: Number(r.value)||0 }));
  const zonesForToday = (()=> {
    if (!todayRecords.length) return null;
    const counts = {};
    todayRecords.forEach(r=> {
      const z = getZone(Number(r.value), stats.resting, stats.maxHr).label;
      counts[z] = (counts[z]||0)+1;
    });
    return counts;
  })();

  if (loading) return <div className={`${textClass} p-4`}>Загрузка...</div>;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={`${bgClass} border rounded-lg p-4 text-center`}>
          <p className={subTextClass}>Сегодня записей</p>
          <p className={`text-3xl font-bold ${textClass}`}>{todayRecords.length}</p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4 text-center`}>
          <p className={subTextClass}>Средний</p>
          <p className={`text-3xl font-bold ${textClass}`}>{stats.avg || '—'} <span className="text-sm font-normal">bpm</span></p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4 text-center`}>
          <p className={subTextClass}>Макс</p>
          <p className={`text-3xl font-bold text-red-500`}>{stats.max || '—'}</p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4 text-center`}>
          <p className={subTextClass}>Мин / Покой</p>
          <p className={`text-3xl font-bold ${textClass}`}>{stats.min || '—'} / {stats.resting || '—'}</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length >1 && (
        <div className={`${bgClass} border rounded-lg p-4`}>
          <h3 className={`${textClass} font-semibold mb-4 flex items-center gap-2`}><TrendingUp size={18} style={{color:accentColor}}/> Пульс — тренд (30 записей)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid stroke={theme==='dark'?'#374151':'#e5e7eb'} strokeDasharray="3 3"/>
              <XAxis dataKey="date" stroke={theme==='dark'?'#9ca3af':'#6b7280'} tick={{fontSize:10}}/>
              <YAxis stroke={theme==='dark'?'#9ca3af':'#6b7280'} domain={[40,200]}/>
              <Tooltip contentStyle={{ backgroundColor: theme==='dark'?'#1f2937':'#fff', border:`1px solid ${theme==='dark'?'#374151':'#e5e7eb'}`}}/>
              <Line type="monotone" dataKey="bpm" stroke={accentColor} dot={{r:2}} name="bpm"/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Zones today */}
      {zonesForToday && (
        <div className={`${bgClass} border rounded-lg p-4`}>
          <h3 className={`${textClass} font-semibold mb-3`}>Зоны пульса (сегодня)</h3>
          <div className="space-y-2">
            {Object.entries(zonesForToday).map(([label,count])=> (
              <div key={label} className="flex items-center gap-2">
                <span className={`text-xs w-32 ${subTextClass}`}>{label}</span>
                <div className={`flex-1 h-3 rounded overflow-hidden ${theme==='dark'?'bg-white/10':'bg-slate-200'}`}>
                  <div className="h-full" style={{ width: `${(count/todayRecords.length)*100}%`, backgroundColor: getZone(80,stats.resting,stats.maxHr).color }}></div>
                </div>
                <span className={`text-xs ${textClass}`}>{count} записей</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Karvonen zones reference */}
      <div className={`${bgClass} border rounded-lg p-4`}>
        <h3 className={`${textClass} font-semibold mb-2`}>Зоны Karvonen (профиль)</h3>
        {(() => {
          const r = stats.resting || 60; const m = stats.maxHr || 190;
          if (!r || !m || r>=m) return <p className={subTextClass}>Укажите пульс покоя и макс. в профиле</p>;
          const reserve=m-r;
          const zones=[
            { name:'Восстановление', pct:[0,50]},
            { name:'Выносливость', pct:[50,60]},
            { name:'Темп', pct:[60,70]},
            { name:'Порог', pct:[70,80]},
            { name:'VO2 Max', pct:[80,90]},
            { name:'Анаэроб', pct:[90,100]},
          ];
          return zones.map(z=> {
            const low=Math.round(r+reserve*z.pct[0]/100);
            const high=Math.round(r+reserve*z.pct[1]/100);
            return <div key={z.name} className="flex justify-between text-sm py-1"><span className={subTextClass}>{z.name}</span><span className={textClass} style={{fontFamily:'monospace'}}>{low}–{high} bpm</span></div>;
          });
        })()}
      </div>

      {/* Add */}
      <button onClick={()=>setShowForm(!showForm)} className={`w-full px-4 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 ${theme==='dark'?'bg-white/10 hover:bg-white/20 text-white':'bg-slate-100 hover:bg-slate-200'}`} style={showForm?{backgroundColor:accentColor,color:'white'}:{}}>
        <Plus size={18}/>{showForm?'Отменить':'Добавить пульс'}
      </button>
      {showForm && (
        <form onSubmit={handleAdd} className={`${bgClass} border rounded-lg p-4 space-y-3`}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block ${subTextClass} text-sm mb-1`}>Пульс (bpm)</label>
              <input type="number" value={form.bpm} onChange={e=>setForm({...form,bpm:e.target.value})} className={`w-full px-3 py-2 rounded-lg border ${inputClass}`} placeholder="75"/>
            </div>
            <div>
              <label className={`block ${subTextClass} text-sm mb-1`}>Дата/время</label>
              <input type="datetime-local" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}/>
            </div>
          </div>
          <div>
            <label className={`block ${subTextClass} text-sm mb-1`}>Заметка</label>
            <input value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="после тренировки" className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}/>
          </div>
          <button type="submit" className="w-full py-2 rounded-lg text-white font-semibold" style={{backgroundColor:accentColor}}>Сохранить</button>
        </form>
      )}

      {/* History */}
      <div className={`${bgClass} border rounded-lg`}>
        <div className={`p-4 border-b ${theme==='dark'?'border-white/10':'border-slate-200'} flex justify-between`}>
          <h3 className={`${textClass} font-semibold flex items-center gap-2`}><Heart size={16} style={{color:accentColor}}/> История пульса</h3>
          <button onClick={load} className={`text-xs ${subTextClass} flex items-center gap-1`}><Activity size={12}/> Обновить</button>
        </div>
        {records.length===0 ? (
          <div className="p-8 text-center">
            <Heart size={40} className="mx-auto text-gray-400 mb-2"/>
            <p className={subTextClass}>Нет записей пульса</p>
            <p className="text-xs text-gray-500 mt-1">Синхронизируйте со вкладки Настройки → Синхронизировать здоровье или добавьте вручную</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5 max-h-[320px] overflow-auto">
            {records.slice(0,30).map(r=> {
              const bpm=Number(r.value)||0;
              const col = bpm<60?'#3b82f6':bpm<100?'#10b981':bpm<130?'#f59e0b':'#ef4444';
              return (
                <div key={r.id} className={`p-3 flex items-center justify-between ${theme==='dark'?'hover:bg-white/5':'hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-3">
                    <Heart size={16} style={{color:col}}/>
                    <div>
                      <p className={`${textClass} font-bold`}>{bpm} bpm</p>
                      <p className={`text-xs ${subTextClass}`}>{r.date} {r.note?`· ${r.note}`:''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded ${theme==='dark'?'bg-white/10 text-gray-400':'bg-slate-200 text-slate-600'}`}>{r.type}</span>
                    <button onClick={()=>handleDelete(r.id)} className="p-2 hover:bg-red-500/20 rounded-lg"><Trash2 size={14} className="text-red-500"/></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
