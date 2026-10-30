import React, { useEffect, useState } from 'react';
import { X, Star, Bike, Activity, Timer, Gauge, Package, Wrench, Calendar, MapPin, Heart, Image as ImageIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import SecureImage from './SecureImage';

// clone of mobile gear_detail_screen logic
const componentLabels = {
  frame:'Рама', fork:'Вилка', handlebar:'Руль', stem:'Вынос', saddle:'Седло', seatpost:'Подседельный штырь',
  pedals:'Педали', crankset:'Система', chain:'Цепь', cassette:'Кассета',
  front_tire:'Переднее колесо', back_tire:'Заднее колесо', front_wheel:'Переднее колесо', back_wheel:'Заднее колесо',
  front_break_pads:'Передние колодки', back_break_pads:'Задние колодки', front_break_rotor:'Передний ротор', back_break_rotor:'Задний ротор',
  cleats:'Клипсы', insoles:'Стельки', laces:'Шнурки', bindings:'Крепления', boots:'Ботинки', poles:'Палки'
};

export default function GearDetail({ gear, onClose, theme, accentColor }) {
  const [activities, setActivities] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [components, setComponents] = useState([]);
  const [photos, setPhotos] = useState([]);

  useEffect(()=>{
    (async()=>{
      try {
        const rides = await window.electronAPI.getRides();
        const filtered = (rides||[]).filter(r=> (gear.type==='Велосипед' ? r.type==='RIDE' : r.type===gear.type) || r.gear_id===gear.id);
        setActivities(filtered.slice(0,20));
        // weekly distances last 8 weeks
        const now = new Date();
        const weeks = [];
        for(let i=7;i>=0;i--){
          const weekEnd = new Date(now); weekEnd.setDate(now.getDate() - i*7);
          const weekStart = new Date(weekEnd); weekStart.setDate(weekEnd.getDate()-7);
          let dist=0;
          filtered.forEach(a=>{
            const d = new Date(a.date);
            if(d>weekStart && d<weekEnd) dist+= (a.distance||0);
          });
          weeks.push({ label: `${String(weekStart.getDate()).padStart(2,'0')}.${String(weekStart.getMonth()+1).padStart(2,'0')}`, dist: Number(dist.toFixed(1)) });
        }
        setWeekly(weeks);
      } catch(_){}
      try{ const p=await window.electronAPI.getGearParts(gear.id); setComponents(p||[]); }catch(_){}
      // photos: try to load local gear_images + server media via SecureImage not needed here
    })();
  },[gear]);

  if(!gear) return null;
  const muted = theme==='dark'?'text-gray-400':'text-slate-500';
  const cardBg = theme==='dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200';
  const displayKm = (gear.total_life_distance ?? ((gear.current_distance||0)+(gear.initial_distance||0))).toFixed(1);
  const distKm = Number(displayKm);
  const totalTime = gear.total_time || gear.totalTime || 0;
  const hours = Math.floor(totalTime/3600);
  const minutes = Math.floor((totalTime%3600)/60);
  // total_distance может быть в км (sync) или в метрах (server detail) — нормализуем в км
  const distForSpeedKm = (()=>{ const raw = gear.total_distance ?? gear.totalDistance ?? (gear.current_distance*1000) ?? 0; return raw>500 ? raw/1000 : raw; })();
  const totalDistanceKm = distForSpeedKm;
  const avgSpeed = totalTime>0 ? totalDistanceKm/(totalTime/3600) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className={`relative w-full max-w-3xl max-h-[90vh] overflow-auto rounded-3xl border shadow-2xl ${theme==='dark'?'bg-[#121212] border-white/10':'bg-white border-slate-200'}`} onClick={e=>e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-white/10 backdrop-blur" style={{backgroundColor: theme==='dark'? '#121212':'#fff'}}>
          <h3 className="font-bold text-lg">{gear.nickname||gear.name}</h3>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/10"><X size={18}/></button>
        </div>
        <div className="p-6 space-y-6">
          {/* Hero */}
          <div className="rounded-3xl p-6 flex gap-4 items-center" style={{backgroundColor: `${accentColor}15`, border:`1px solid ${accentColor}30`}}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0" style={{backgroundColor: `${accentColor}30`}}>
              <Bike size={28} style={{color:accentColor}}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-lg truncate">{gear.nickname||gear.name}</div>
              <div className={`text-sm ${muted} truncate`}>{[gear.brand,gear.model].filter(Boolean).join(' ')} • {gear.type}</div>
              {gear.wheel_size && <div className={`text-xs ${muted}`}>Колеса {gear.wheel_size}</div>}
            </div>
            {gear.is_primary && <span className="px-3 py-1 rounded-full text-xs font-bold text-white flex items-center gap-1" style={{backgroundColor:accentColor}}><Star size={12}/> Основное</span>}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {icon: Gauge, label:'Пробег', value:`${displayKm} км`},
              {icon: Timer, label:'Время', value:`${hours}ч ${minutes}м`},
              {icon: Activity, label:'Ср. скорость', value:`${avgSpeed.toFixed(1)} км/ч`},
            ].map(s=>(
              <div key={s.label} className={`${cardBg} border rounded-2xl p-4 text-center`}>
                <s.icon size={18} className="mx-auto mb-1" style={{color:accentColor}}/>
                <div className="font-bold">{s.value}</div>
                <div className={`text-xs ${muted}`}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Weekly graph */}
          {weekly.some(w=>w.dist>0) && (
            <div className={`${cardBg} border rounded-2xl p-4`}>
              <div className={`text-xs font-bold ${muted} mb-2`}>ПРОБЕГ ПО НЕДЕЛЯМ</div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly}>
                    <XAxis dataKey="label" tick={{fontSize:10}} stroke="#94a3b8"/>
                    <YAxis hide/>
                    <Tooltip/>
                    <Bar dataKey="dist" fill={accentColor} radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Details */}
          <div className={`${cardBg} border rounded-2xl divide-y divide-white/5`}>
            <div className="p-3 flex justify-between text-sm"><span className={muted}>Суммарный пробег</span><span className="font-bold" style={{color:accentColor}}>{displayKm} км</span></div>
            <div className="p-3 flex justify-between text-sm"><span className={muted}>Активностей</span><span>{activities.length}</span></div>
            {gear.purchase_date && <div className="p-3 flex justify-between text-sm"><span className={muted}>Добавлено</span><span>{new Date(gear.purchase_date).toLocaleDateString()}</span></div>}
            {gear.server_id && <div className="p-3 flex justify-between text-sm"><span className={muted}>ID сервера</span><span>{gear.server_id}</span></div>}
          </div>

          {/* Photo */}
          <div>
            <div className={`text-xs font-bold ${muted} mb-2`}>ФОТО</div>
            <div className={`${cardBg} border rounded-2xl p-4 flex items-center justify-center h-40`}>
              { (gear.image_path||gear.server_image) ? (
                <SecureImage src={gear.server_image||gear.image_path} className="max-h-36 w-full object-contain rounded-xl" fallback={<div className={`flex flex-col items-center ${muted}`}><ImageIcon size={32} className="mb-2 opacity-40"/><span className="text-xs">Нет фото</span></div>} />
              ) : (
                <div className={`flex flex-col items-center ${muted}`}><ImageIcon size={32} className="mb-2 opacity-40"/><span className="text-xs">Нет фото</span></div>
              )}
            </div>
          </div>

          {/* Components */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className={`text-xs font-bold ${muted}`}>КОМПОНЕНТЫ {components.length?`(${components.length})`:''}</div>
              <button onClick={async()=>{
                const name=prompt('Тип детали (chain, cassette...)'); if(!name) return;
                const brand=prompt('Бренд','Shimano')||'';
                const model=prompt('Модель','')||'';
                await window.electronAPI.addGearPart(gear.id,{part_name:name, brand, model, installed_km:0, installed_at:new Date().toISOString()});
                const p=await window.electronAPI.getGearParts(gear.id); setComponents(p||[]);
              }} className="text-xs px-3 py-1 rounded-lg bg-white/10">+ Добавить</button>
            </div>
            {components.length===0 ? <div className={`${cardBg} border rounded-2xl p-6 text-center ${muted} text-sm`}>Нет компонентов — добавьте как в мобильном gear_components</div> :
              <div className="space-y-2">
                {components.map(c=>{
                  const label = componentLabels[c.part_name]||c.part_name;
                  const wear = c.expected_kms ? Math.min(1, (c.currentDistance|| c.installed_km||0)/(c.expected_kms||1)) : 0;
                  const isOverdue = c.expected_kms && (c.currentDistance||0) > c.expected_kms;
                  return (
                    <div key={c.id} className={`${cardBg} border rounded-2xl p-3`}>
                      <div className="flex items-center gap-2">
                        <Wrench size={16} style={{color:accentColor}}/>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm truncate">{label}</div>
                          <div className={`text-xs ${muted} truncate`}>{c.brand||''} {c.model||''}</div>
                        </div>
                        {c.active!==false ? <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">Активен</span> : <span className="text-xs px-2 py-1 rounded-full bg-white/10">Заменён</span>}
                      </div>
                      {c.expected_kms ? (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs"><span>{((c.currentDistance||0)/1000).toFixed(0)} / {(c.expected_kms/1000).toFixed(0)} км</span><span className={isOverdue?'text-red-400 font-bold':''}>{Math.round(wear*100)}%</span></div>
                          <div className="w-full bg-black/20 h-1.5 rounded-full mt-1"><div className="h-full rounded-full" style={{width:`${Math.min(100,wear*100)}%`, backgroundColor: isOverdue?'#ef4444': wear>0.8?'#f97316':accentColor}} /></div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            }
          </div>

          {/* Recent activities */}
          {activities.length>0 && (
            <div>
              <div className={`text-xs font-bold ${muted} mb-2`}>ПОСЛЕДНИЕ АКТИВНОСТИ</div>
              <div className="space-y-2">
                {activities.slice(0,5).map(a=>(
                  <div key={a.id} className={`${cardBg} border rounded-2xl p-3 flex gap-3 items-center`}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{backgroundColor:`${accentColor}15`}}><Activity size={16} style={{color:accentColor}}/></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{a.title}</div>
                      <div className={`text-xs ${muted}`}>{new Date(a.date).toLocaleDateString()} • {(a.distance||0).toFixed(1)} км • {Math.round(a.tss||0)} TSS</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
