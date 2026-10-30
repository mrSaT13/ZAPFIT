import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, RefreshCw, Users, Activity, Watch, ShieldCheck, Megaphone } from 'lucide-react';
import { toast } from 'react-toastify';

const typeMeta = {
  1: { icon: Activity, color:'bg-green-500', label:'Новая активность' },
  2: { icon: Activity, color:'bg-orange-500', label:'Дубликат' },
  11:{ icon: Users, color:'bg-blue-500', label:'Запрос дружбы' },
  12:{ icon: Users, color:'bg-teal-500', label:'Приняли запрос' },
  21:{ icon: Watch, color:'bg-red-500', label:'Garmin токен' },
 101:{ icon: ShieldCheck, color:'bg-purple-500', label:'Админ' },
  default:{ icon: Bell, color:'bg-slate-500', label:'Уведомление' },
};

function getMeta(type){
  return typeMeta[type] || typeMeta.default;
}

export default function Notifications({ theme, accentColor }){
  const [list, setList] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState({ configured:false, authenticated:false });
  const timerRef = useRef(null);

  const load = async ()=>{
    try{
      setLoading(true);
      const s = await window.electronAPI.zapfitStatus();
      setStatus(s);
      if (!s.configured || !s.authenticated){ setLoading(false); return; }
      const res = await window.electronAPI.zapfitGetNotifications({ page:1, perPage:50 });
      if (res?.success){
        const arr = res.notifications || [];
        setList(arr);
        setUnread(arr.filter(n=>!n.read).length);
      } else if (res?.error) {
        // not fatal
      }
      // try count endpoint
      try{ const c = await window.electronAPI.zapfitGetNotificationsCount(); if(c?.success) setUnread(c.count||0); }catch(_){}
    }catch(e){ console.error(e); } finally { setLoading(false); }
  };

  useEffect(()=>{
    load();
    // polling like mobile: 60s
    timerRef.current = setInterval(()=>{ load(); }, 60000);
    return ()=> { if(timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const markRead = async (id)=>{
    try{ await window.electronAPI.zapfitMarkNotificationRead(id); setList(prev=>prev.map(n=> n.id===id? {...n, read:true}:n)); setUnread(v=> Math.max(0, v-1)); toast.success('Отмечено прочитанным'); }catch(e){ toast.error(e.message); }
  };
  const markAll = async ()=>{
    try{ await window.electronAPI.zapfitMarkAllNotificationsRead(); setList(prev=>prev.map(n=>({...n, read:true}))); setUnread(0); toast.success('Все отмечены'); }catch(e){ toast.error(e.message); }
  };

  const display = showAll ? list : list.filter(n=>!n.read);
  const cardClass = theme==='dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm';
  const textClass = theme==='dark' ? 'text-white' : 'text-slate-900';
  const subText = theme==='dark' ? 'text-gray-400' : 'text-slate-500';

  if (!status.configured || !status.authenticated){
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 rounded-2xl" style={{backgroundColor:`${accentColor}20`}}><Bell size={32} style={{color:accentColor}}/></div>
          <div>
            <h2 className={`text-3xl font-bold ${textClass}`}>Уведомления</h2>
            <p className={subText}>Подключитесь к серверу ZAPFIT в Настройках чтобы получать уведомления как в мобильном</p>
          </div>
        </div>
        <div className={`${cardClass} border rounded-2xl p-8 text-center ${subText}`}>Нет подключения к серверу</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl relative" style={{backgroundColor:`${accentColor}20`}}>
            <Bell style={{color:accentColor}} size={28}/>
            {unread>0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{unread}</span>}
          </div>
          <div>
            <h2 className={`text-3xl font-bold ${textClass}`}>Уведомления</h2>
            <p className={subText}>{unread ? `${unread} непрочитано` : 'Все прочитано'} · {list.length} всего</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={()=> setShowAll(v=>!v)} className={`px-3 py-2 rounded-xl text-sm font-bold border ${cardClass}`}>{showAll?'Только новые':'Показать все'}</button>
          <button onClick={load} disabled={loading} className={`px-3 py-2 rounded-xl text-sm flex items-center gap-1 ${theme==='dark'?'bg-white/10 hover:bg-white/20':'bg-slate-100 hover:bg-slate-200'} ${textClass}`}><RefreshCw size={14} className={loading?'animate-spin':''}/> Обновить</button>
          <button onClick={markAll} className="px-3 py-2 rounded-xl text-sm font-bold text-white" style={{backgroundColor:accentColor}}><CheckCheck size={14} className="inline mr-1"/> Все прочитано</button>
        </div>
      </div>

      {display.length===0 ? (
        <div className={`${cardClass} border rounded-2xl p-12 text-center`}>
          <Bell size={48} className="mx-auto text-gray-400 mb-3"/>
          <p className={subText}>{showAll ? 'Уведомлений пока нет' : 'Непрочитанных нет'}</p>
          {!showAll && <p className="text-xs text-gray-500 mt-1">Переключите «Показать все» чтобы увидеть прочитанные</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {display.map(n=>{
            const meta = getMeta(n.type);
            const Icon = meta.icon;
            const title = n.title || n.type_title || meta.label;
            const msg = n.message || n.body || n.options?.message || JSON.stringify(n.options||'').slice(0,120);
            const date = n.created_at || n.createdAt || n.date;
            return (
              <div key={n.id} className={`${cardClass} border rounded-2xl p-4 flex gap-4 ${!n.read?'ring-1 ring-white/10':''}`} style={!n.read?{backgroundColor: theme==='dark'?'rgba(255,255,255,0.07)':''}: {}}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${meta.color} text-white`}><Icon size={18}/></div>
                <div className="flex-1 min-w-0">
                  <p className={`${textClass} font-semibold ${!n.read?'font-bold':''} truncate`}>{title}</p>
                  <p className={`${subText} text-sm mt-1 break-words`}>{msg}</p>
                  {date && <p className="text-[11px] text-gray-500 mt-1">{new Date(date).toLocaleString('ru-RU')}</p>}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {!n.read && <button onClick={()=>markRead(n.id)} className="px-3 py-1 rounded-lg text-xs font-bold text-white" style={{backgroundColor:accentColor}}>Прочитано</button>}
                  <span className={`text-[10px] px-2 py-1 rounded-full text-center ${n.read?(theme==='dark'?'bg-white/10 text-gray-400':'bg-slate-100 text-slate-500'):'bg-green-500/20 text-green-400'}`}>{n.read?'✓ прочитано':'● новое'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
