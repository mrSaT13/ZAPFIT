import React, { useEffect, useState } from 'react';
import { Bike, Wrench, Plus, RefreshCw, Trash2, Edit3, Calendar, Package, Gauge, Clock, MapPin, Star, ChevronDown, ChevronUp, Activity, Zap } from 'lucide-react';
import { toast } from 'react-toastify';
import SecureImage from './SecureImage';
import GearDetail from './GearDetail';

// map mobile gearType to label - desktop stores Russian strings, but also numeric sync
const GEAR_TYPE_LABEL = { 1:'Велосипед', 2:'Кроссовки', 3:'Гидрокостюм',4:'Ракетка',5:'Лыжи',6:'Сноуборд' };
const DEFAULT_LIFE = (type) => {
  if (type==='Цепь' || type==='chain') return 2000;
  if (type==='Кроссовки' || type==='Велосипед' && false) return 800;
  if (String(type).includes('Кроссовки')) return 800;
  if (type==='Покрышки' || type==='покрышка') return 8000;
  if (type==='Велосипед') return 50000;
  if (type==='bike' || type===1) return 50000;
  return 5000;
};
const TYPE_ICON = (type) => {
  const t = String(type).toLowerCase();
  if (t.includes('вело') || t==='1' || t==='bike') return Bike;
  if (t.includes('кроссов') || t==='2' || t==='shoes') return Activity;
  return Package;
};
const componentLabels = {
  frame:'Рама', fork:'Вилка', handlebar:'Руль', stem:'Вынос', saddle:'Седло', seatpost:'Подседельный штырь',
  pedals:'Педали', crankset:'Система', chain:'Цепь', cassette:'Кассета',
  front_tire:'Переднее колесо', back_tire:'Заднее колесо', front_wheel:'Переднее колесо', back_wheel:'Заднее колесо',
  front_break_pads:'Передние колодки', back_break_pads:'Задние колодки', front_break_rotor:'Передний ротор', back_break_rotor:'Задний ротор',
  cleats:'Клипсы', insoles:'Стельки', laces:'Шнурки', bindings:'Крепления', boots:'Ботинки', poles:'Палки'
};

export default function Gears({ theme, accentColor }) {
  const [gears, setGears] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [partsMap, setPartsMap] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [editGear, setEditGear] = useState(null);
  const [form, setForm] = useState({ name:'', type:'Велосипед', brand:'', model:'', purchase_date:new Date().toISOString().split('T')[0], initial_distance:0, life_km:'', parts:'', icon:'Bike' });
  const [detailGear, setDetailGear] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(() => {
    try { return localStorage.getItem('zapfit:gears:lastSync') || null; } catch { return null; }
  });

  const load = async () => {
    setLoading(true);
    try {
      const g = await window.electronAPI.getGears();
      let a = [];
      try { a = await window.electronAPI.getGearAnalytics?.() || []; } catch(e){ console.warn('[Gears] analytics',e.message); a = []; }
      setGears(Array.isArray(g)?g:[]);
      setAnalytics(Array.isArray(a)?a:[]);
      // fetch ML predictions
      if (window.electronAPI.predictGearML) {
        (Array.isArray(a)&&a.length?a:g||[]).forEach(async gear => {
          try { const p = await window.electronAPI.predictGearML(gear.id); if(p?.success) setAnalytics(prev=>prev.map(x=>x.id===gear.id?{...x, ml_days:p.predicted_days, ml_used:p.model_used}:x)); } catch(_){}
        });
      }
    } catch(e){ console.error('[Gears] load',e); setGears([]); setAnalytics([]); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); const h=()=>load(); window.addEventListener('gears-updated',h); window.addEventListener('activities-updated',h); return ()=>{window.removeEventListener('gears-updated',h);window.removeEventListener('activities-updated',h);} },[]);

  const merged = gears.map(g=>{
    const an = analytics.find(x=>x.id===g.id) || {};
    return { ...g, ...an };
  });

  const doSync = async (silent) => {
    if (syncing) return false;
    try {
      const st = await window.electronAPI?.zapfitStatus?.();
      if (!st?.authenticated) return false;
    } catch { return false; }
    setSyncing(true);
    try {
      const r = await window.electronAPI.zapfitSyncGears();
      if (r?.success) {
        const label = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        try { localStorage.setItem('zapfit:gears:lastSync', label); } catch {}
        setLastSync(label);
        load();
        if (!silent) toast.success(`Импорт: ${r.imported} новых, ${r.updated} обновлено`);
        return true;
      }
      if (!silent) toast.error(r?.error || 'Ошибка');
      return false;
    } catch (e) {
      if (!silent) toast.error(e.message);
      return false;
    } finally {
      setSyncing(false);
    }
  };

  const handleSync = () => doSync(false);
  useEffect(() => {
    // Автосинк при открытии не чаще раза в 10 мин (как в Здоровье)
    try {
      const last = Number(localStorage.getItem('zapfit:gears:lastSyncTs') || 0);
      if (Date.now() - last > 600000) {
        localStorage.setItem('zapfit:gears:lastSyncTs', String(Date.now()));
        doSync(true);
      }
    } catch {}
  }, []);
  const handleAdd = async () => {
    if(!form.name) return toast.error('Введите название');
    const payload = { ...form, life_km: form.life_km? parseFloat(form.life_km): null };
    try{
      if(editGear){ await window.electronAPI.updateGear(editGear.id, payload); toast.success('Обновлено'); }
      else { await window.electronAPI.addGear(payload); toast.success('Добавлено'); }
      setShowAdd(false); setEditGear(null); setForm({ name:'', type:'Велосипед', brand:'', model:'', purchase_date:new Date().toISOString().split('T')[0], initial_distance:0, life_km:'', parts:'' , icon:'Bike'}); load();
    }catch(e){ toast.error(e.message); }
  };
  const openEdit = (g)=>{ setEditGear(g); setForm({ name:g.name||'', type:g.type||'Велосипед', brand:g.brand||'', model:g.model||'', purchase_date:g.purchase_date||new Date().toISOString().split('T')[0], initial_distance:g.initial_distance||0, life_km:g.life_km||'', parts:g.parts||'', icon:g.icon||'Bike'}); setShowAdd(true); };
  const handleDelete = async(id)=>{ if(!confirm('Удалить снаряжение?')) return; await window.electronAPI.deleteGear(id); toast.info('Удалено'); load(); };
  const handleReset = async(id)=>{ if(!confirm('Сбросить пробег?')) return; await window.electronAPI.resetGear(id); toast.success('Сброшено'); load(); };
  const toggleExpand = async (id)=>{
    setExpanded(prev=>({...prev, [id]:!prev[id]}));
    if(!partsMap[id]){ try{ const p=await window.electronAPI.getGearParts(id); setPartsMap(m=>({...m, [id]:p||[]})); }catch(_){} }
  };

  if(loading) return <div className={`p-8 text-center ${theme==='dark'?'text-gray-400':'text-slate-500'}`}>Загрузка снаряжения...</div>;

  const cardBg = theme==='dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm';
  const muted = theme==='dark' ? 'text-gray-400' : 'text-slate-500';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl" style={{backgroundColor:`${accentColor}20`}}><Wrench size={22} style={{color:accentColor}}/></div>
          <div>
            <h2 className="text-2xl font-bold">Снаряжение</h2>
            <p className={`text-sm ${muted}`}>Как в мобильном Endurain — пробег, износ, компоненты, прогноз</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastSync && <span className={`text-xs ${muted} hidden sm:inline`}>Синк: {lastSync}</span>}
          <button onClick={handleSync} disabled={syncing} title="Синхронизировать с сервером" className="p-2.5 rounded-xl font-bold bg-white/10 flex items-center gap-2 disabled:opacity-50">
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          </button>
          <button onClick={()=>{setEditGear(null); setForm({ name:'', type:'Велосипед', brand:'', model:'', purchase_date:new Date().toISOString().split('T')[0], initial_distance:0, life_km:'', parts:'', icon:'Bike'}); setShowAdd(true);}} title="Добавить снаряжение" className="p-2.5 rounded-xl font-bold bg-white/10 flex items-center gap-2"><Plus size={16}/></button>
        </div>
      </div>

      {merged.length===0 ? (
        <div className={`${cardBg} border rounded-3xl p-12 text-center`}>
          <Package size={48} className={`mx-auto mb-3 ${muted}`}/>
          <p className={muted}>Снаряжение не найдено — добавьте или синхронизируйте с сервером ZAPFIT.</p>
          <button onClick={handleSync} className="mt-4 px-6 py-2 rounded-xl text-white font-bold" style={{backgroundColor:accentColor}}>Синхронизировать</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {merged.map(g=>{
            const life = g.life_km || DEFAULT_LIFE(g.type);
            // desktop analytics: current_distance is wear since last reset, total_life_distance is absolute
            const wearKm = g.current_distance != null ? g.current_distance : (g.currentDistance ?? 0);
            // display mileage like mobile: (totalDistance/1000)+initialKms => for desktop approximate total_life_distance
            const displayKm = g.total_life_distance != null ? g.total_life_distance : ((g.current_distance||0)+(g.initial_distance||0));
            const pct = Math.min(100, Math.round((wearKm / life)*100));
            const wearColor = pct>=90? 'bg-red-500' : pct>=70? 'bg-orange-500' : pct>=50? 'bg-yellow-500' : 'bg-emerald-500';
            const Icon = TYPE_ICON(g.type);
            const isExpanded = !!expanded[g.id];
            const parts = partsMap[g.id] || [];
            return (
              <div key={g.id} className={`${cardBg} border rounded-3xl p-5 space-y-3 hover:border-white/20 transition-all`}>
                <div className="flex gap-3 cursor-pointer" onClick={()=>setDetailGear(g)}>
                  <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center shrink-0" style={{backgroundColor:`${accentColor}15`, border:`1px solid ${accentColor}30`}}>
                    {(g.server_image || g.image_path) ? (
                      <SecureImage src={g.server_image||g.image_path} alt={g.name} className="w-full h-full object-cover" />
                    ) : <Icon size={22} style={{color:accentColor}}/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold truncate">{g.nickname || g.name}</h3>
                      {g.is_primary ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white flex items-center gap-1" style={{backgroundColor:accentColor}}><Star size={10}/> Основное</span> : null}
                      {g.server_id ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">с сервера</span> : null}
                    </div>
                    <p className={`text-xs truncate ${muted}`}>{g.brand||''} {g.model||''} • {g.type} {g.parts? `• ${String(g.parts).slice(0,60)}`:''}</p>
                    <div className="flex gap-3 mt-1 text-xs">
                      <span className="flex items-center gap-1"><Gauge size={12}/> {displayKm.toFixed(1)} км пробег</span>
                      <span className="flex items-center gap-1"><Clock size={12}/> {g.purchase_date ? new Date(g.purchase_date).toLocaleDateString() : '—'}</span>
                    </div>
                  </div>
                  <button onClick={(e)=>{e.stopPropagation(); toggleExpand(g.id);}} className="p-2 rounded-xl bg-white/5 h-fit">{isExpanded? <ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className={muted}>Износ: {wearKm.toFixed(0)} / {life} км</span>
                    <span className={pct>=80? 'text-red-400 font-bold' : muted}>{pct}%</span>
                  </div>
                  <div className="w-full bg-black/30 h-2 rounded-full overflow-hidden">
                    <div className={`h-full ${wearColor} transition-all`} style={{width:`${pct}%`}}/>
                  </div>
                  {pct>=90 && <p className="text-xs text-red-400">Срочно заменить!</p>}
                  {pct>=70 && pct<90 && <p className="text-xs text-orange-400">Готовьтесь к замене</p>}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className={`${theme==='dark'?'bg-black/20':'bg-slate-50'} rounded-xl p-3`}>
                    <div className={`text-[10px] ${muted}`}>До сервиса</div>
                    <div className="font-bold">{g.daysToService!=null ? `${g.daysToService} дн.` : g.ml_days!=null ? `${g.ml_days} дн. (ML${g.ml_used?'· модель':''})` : '—'}</div>
                    {g.predictedServiceDate && <div className={`text-[10px] ${muted}`}>{new Date(g.predictedServiceDate).toLocaleDateString()}</div>}
                  </div>
                  <div className={`${theme==='dark'?'bg-black/20':'bg-slate-50'} rounded-xl p-3`}>
                    <div className={`text-[10px] ${muted}`}>Пробег 30д (ср/сут)</div>
                    <div className="font-bold">{g.daily_avg != null ? `${g.daily_avg?.toFixed?.(1) ?? (g.daily_avg)} км/д` : (()=>{ const a=analytics.find(x=>x.id===g.id); return a?.daily_avg!=null? `${Number(a.daily_avg).toFixed(1)} км/д`:'—';})()}</div>
                    <div className={`text-[10px] ${muted}`}>Ресурс {life} км</div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pt-3 border-t border-white/10 space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={()=>openEdit(g)} className="px-3 py-1.5 rounded-lg bg-white/10 text-xs flex items-center gap-1"><Edit3 size={12}/> Редактировать</button>
                      <button onClick={()=>handleReset(g.id)} className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs flex items-center gap-1"><RefreshCw size={12}/> Сброс</button>
                      <button onClick={()=>handleDelete(g.id)} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs flex items-center gap-1"><Trash2 size={12}/> Удалить</button>
                      <button onClick={async()=>{ const r=await window.electronAPI.assignGearToActivities(g.id); toast.info(r.changes?`Привязано ${r.changes}`:'Готово'); load(); }} className="px-3 py-1.5 rounded-lg bg-white/10 text-xs">Привязать активности</button>
                      <button onClick={async()=>{ const r=await window.electronAPI.predictGearService(g.id); if(r.success) toast.info(`Износ ${r.pct}% — ${r.alert}`); }} className="px-3 py-1.5 rounded-lg bg-white/10 text-xs">Прогноз</button>
                      <button onClick={async()=>{ const r=await window.electronAPI.trainGearMLModel({gear_id:g.id, lambda:1}); if(r.success) toast.success('Модель обучена'); else toast.error(r.error||'Нет данных'); }} className="px-3 py-1.5 rounded-lg bg-white/10 text-xs">Train ML</button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold flex items-center gap-1.5"><Wrench size={14}/> Компоненты {parts.length? `(${parts.length})`:''}</h4>
                        <button onClick={async()=>{
                          const name = prompt('Название детали (напр. цепь, покрышка)');
                          if(!name) return;
                          const km = prompt('Пробег установки, км', '0');
                          await window.electronAPI.addGearPart(g.id, { part_name:name, installed_km: parseFloat(km)||0, installed_at:new Date().toISOString() });
                          const p=await window.electronAPI.getGearParts(g.id); setPartsMap(m=>({...m,[g.id]:p}));
                        }} className="text-xs px-2 py-1 rounded bg-white/10 flex items-center gap-1"><Plus size={10}/> Добавить деталь</button>
                      </div>
                      {parts.length===0 ? <p className={`text-xs ${muted} mt-2`}>Деталей нет. Добавьте цепь, покрышки и т.д. (как в мобильном gear_components).</p> : (
                        <div className="mt-2 space-y-1.5 max-h-48 overflow-auto pr-1">
                          {parts.map(p=>(
                            <div key={p.id} className={`${theme==='dark'?'bg-black/20':'bg-slate-50'} rounded-xl p-2 flex items-center justify-between text-xs`}>
                              <div>
                                <div className="font-bold">{componentLabels[p.part_name]||p.part_name}</div>
                                <div className={muted}>{p.installed_km} км • {p.installed_at ? new Date(p.installed_at).toLocaleDateString():''} {p.removed_at? `→ снят ${new Date(p.removed_at).toLocaleDateString()}`: ''}</div>
                              </div>
                              {!p.removed_at && <button onClick={async()=>{
                                const km=prompt('Пробег при снятии, км','0'); if(km==null) return;
                                await window.electronAPI.replaceGearPart(p.id, new Date().toISOString(), parseFloat(km)||0, null);
                                const np=await window.electronAPI.getGearParts(g.id); setPartsMap(m=>({...m,[g.id]:np}));
                              }} className="px-2 py-1 rounded bg-orange-500/20 text-orange-400">Снять</button>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className={`text-[11px] ${muted}`}>
                      Расчёты как в мобильном: displayMileageKm = (total_distance/1000)+initial_kms; wear% = currentDistance/expectedKms; прогноз дней = (life - wear)/dailyAvg. Компоненты — wearPercentage, isOverdue. Синхронизация фото: gear_images/{'{id}'}.jpg
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {detailGear && <GearDetail gear={detailGear} onClose={()=>setDetailGear(null)} theme={theme} accentColor={accentColor} />}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`${theme==='dark'?'bg-[#0f172a] border-white/10':'bg-white border-slate-200'} border w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-4`}>
            <h3 className="text-xl font-bold flex items-center gap-2"><Bike style={{color:accentColor}}/> {editGear?'Редактировать':'Новое снаряжение'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className={`text-xs ${muted}`}>Название *</span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className={`w-full ${theme==='dark'?'bg-white/5 border-white/10':'bg-slate-50 border-slate-200'} border rounded-xl px-3 py-2 outline-none`} placeholder="Cervelo S5"/></label>
              <label className="block"><span className={`text-xs ${muted}`}>Тип</span><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className={`w-full ${theme==='dark'?'bg-white/5 border-white/10':'bg-slate-50 border-slate-200'} border rounded-xl px-3 py-2 outline-none`}><option>Велосипед</option><option>Кроссовки</option><option>Цепь</option><option>Покрышки</option><option>Другое</option></select></label>
              <label className="block"><span className={`text-xs ${muted}`}>Бренд</span><input value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})} className={`w-full ${theme==='dark'?'bg-white/5 border-white/10':'bg-slate-50 border-slate-200'} border rounded-xl px-3 py-2 outline-none`}/></label>
              <label className="block"><span className={`text-xs ${muted}`}>Модель</span><input value={form.model} onChange={e=>setForm({...form,model:e.target.value})} className={`w-full ${theme==='dark'?'bg-white/5 border-white/10':'bg-slate-50 border-slate-200'} border rounded-xl px-3 py-2 outline-none`}/></label>
              <label className="block"><span className={`text-xs ${muted}`}>Ресурс life_km</span><input type="number" value={form.life_km} onChange={e=>setForm({...form,life_km:e.target.value})} placeholder="2000" className={`w-full ${theme==='dark'?'bg-white/5 border-white/10':'bg-slate-50 border-slate-200'} border rounded-xl px-3 py-2 outline-none`}/></label>
              <label className="block"><span className={`text-xs ${muted}`}>Начальный пробег км</span><input type="number" value={form.initial_distance} onChange={e=>setForm({...form,initial_distance:parseFloat(e.target.value)||0})} className={`w-full ${theme==='dark'?'bg-white/5 border-white/10':'bg-slate-50 border-slate-200'} border rounded-xl px-3 py-2 outline-none`}/></label>
              <label className="block col-span-2"><span className={`text-xs ${muted}`}>Заметки / parts</span><input value={form.parts} onChange={e=>setForm({...form,parts:e.target.value})} placeholder="цепь;кассета" className={`w-full ${theme==='dark'?'bg-white/5 border-white/10':'bg-slate-50 border-slate-200'} border rounded-xl px-3 py-2 outline-none`}/></label>
              <label className="block"><span className={`text-xs ${muted}`}>Дата покупки</span><input type="date" value={form.purchase_date} onChange={e=>setForm({...form,purchase_date:e.target.value})} className={`w-full ${theme==='dark'?'bg-white/5 border-white/10':'bg-slate-50 border-slate-200'} border rounded-xl px-3 py-2 outline-none`}/></label>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={()=>{setShowAdd(false);setEditGear(null);}} className="px-4 py-2 rounded-xl bg-white/10">Отмена</button>
              <button onClick={handleAdd} className="px-6 py-2 rounded-xl text-white font-bold" style={{backgroundColor:accentColor}}>{editGear?'Сохранить':'Добавить'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
