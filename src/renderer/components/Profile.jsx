import React, { useState, useEffect } from 'react';
import { Camera, User, Activity, Trophy, Zap, Heart, Bike } from 'lucide-react';
import { toast } from 'react-toastify';
import SecureImage from './SecureImage';

const Profile = ({ user, onSave, onLogout, onNavigate, theme }) => {
  const [formData, setFormData] = useState({
    
    name: '',
    ftp: 200,
    weight: 75,
    height: 180,
    resting_hr: 60,
    max_hr: 200,
    avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    avatar_path: '',
    birth_date: '1990-01-01'
  });

  const [stats, setStats] = useState({ calories: 0, totalDist: 0, totalRides: 0 });
  const [latestWeight, setLatestWeight] = useState(null); // {value, date} из health_metrics — свежее users.weight
    const [competitions, setCompetitions] = useState([]);
  const [appInfo, setAppInfo] = useState(null);

  const loadData = async () => {
        const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
        if (api && api.getRides) {
            const rides = await api.getRides();
      if (rides) {
          const totalD = rides.reduce((sum, r) => sum + (r.distance || 0), 0);
          const totalC = rides.reduce((sum, r) => {
              if (r.avg_power > 0) return sum + (r.avg_power * r.duration / 1000) * 1.1; 
              return sum + (r.distance * 30); 
          }, 0);
          setStats({
              calories: Math.round(totalC),
              totalDist: totalD.toFixed(1),
              totalRides: rides.length
          });
      }
      
      try {
        if (api && api.getAppInfo) {
            const info = await api.getAppInfo();
            setAppInfo(info);
        }
        // Свежайшее взвешивание (Health пишет сюда, а не в users)
        try {
            if (api && api.query) {
                const w = await api.query("SELECT value, date FROM health_metrics WHERE type='weight' ORDER BY date DESC LIMIT 1", []);
                if (w && w.length) setLatestWeight({ value: Number(w[0].value), date: w[0].date });
                else setLatestWeight(null);
            }
        } catch (e) { console.error('load latest weight', e); }
        // load competitions for awards
        try {
            if (api && api.getCompetitions) {
                const comps = await api.getCompetitions();
                setCompetitions(Array.isArray(comps) ? comps : (comps || []));
            }
        } catch (e) { console.error('load competitions', e); }
      } catch (err) {
          console.error(err);
          // If IPC handlers missing, notify user to restart main
          if (err && err.message && err.message.includes('No handler registered')) {
              toast.error('Похоже, main-процесс не зарегистрировал новые IPC-хендлеры. Перезапустите приложение (полностью остановите процессы node/electron и запустите `npx electron .`)');
          }
      }
    }
  };

  useEffect(() => {
    loadData();
    if (user) {
      setFormData({
        name: user.name || '',
        ftp: user.ftp || 200,
        weight: user.weight || 75,
        height: user.height || 180,
        resting_hr: user.resting_hr || 60,
        max_hr: user.max_hr || 200,
        avatar_url: user.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
        avatar_path: user.avatar_path || '',
        birth_date: user.birth_date || '1990-01-01'
      });
    }
  }, [user]);

    useEffect(() => {
        const onComps = async () => {
            const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
            if (api && api.getCompetitions) {
                const comps = await api.getCompetitions();
                setCompetitions(Array.isArray(comps) ? comps : (comps || []));
            }
        };
        const onData = () => loadData();
        window.addEventListener('competitions-updated', onComps);
        window.addEventListener('activities-updated', onData);
        window.addEventListener('profile-updated', onData);
        return () => {
          window.removeEventListener('competitions-updated', onComps);
          window.removeEventListener('activities-updated', onData);
          window.removeEventListener('profile-updated', onData);
        };
    }, []);

    // Simple awards widget: show competitions count
    const AwardsWidget = () => (
        <div className="bg-white/5 p-4 rounded-2xl">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-medium">Соревнования</div>
                    <div className="text-2xl font-bold">{competitions.length}</div>
                </div>
                <div>
                    <button onClick={() => onNavigate && onNavigate('competitions')} className="px-3 py-2 bg-blue-600 text-white rounded-lg">Открыть</button>
                </div>
            </div>
        </div>
    );


    const computeBMI = () => {
        const h = (formData.height || 180) / 100;
        const w = effWeight() || 75;
        const bmi = h > 0 ? (w / (h*h)) : 0;
        return parseFloat(bmi.toFixed(1));
    };

    // Эффективный вес: свежайшее взвешивание важнее залежавшегося users.weight
    function effWeight() {
        if (latestWeight && isFinite(latestWeight.value)) return latestWeight.value;
        return formData.weight;
    }

    const getBMICategory = (bmi) => {
        if (!bmi) return '—';
        if (bmi < 18.5) return 'Недостаток';
        if (bmi < 25) return 'Норма';
        if (bmi < 30) return 'Избыточный';
        return 'Ожирение';
    };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: (name === 'name' || name === 'birth_date') ? value : Number(value) });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, avatar_path: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={`p-8 space-y-8 animate-fade-in ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
      {/* Header Profile */}
      <div className="flex items-center space-x-8 bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 shadow-xl">
        <div className="relative group">
          {formData.avatar_path && formData.avatar_path.startsWith('data:') ? (
            <img 
              src={formData.avatar_path} 
              alt="Avatar" 
              className="w-32 h-32 rounded-full object-cover border-4 border-orange-500 shadow-lg transition-transform transform group-hover:scale-105"
            />
          ) : formData.avatar_path && (formData.avatar_path.includes('user_images') || formData.avatar_path.startsWith('/')) ? (
            <SecureImage
              src={formData.avatar_path}
              alt="Avatar"
              className="w-32 h-32 rounded-full object-cover border-4 border-orange-500 shadow-lg"
            />
          ) : (
            <img 
              src={formData.avatar_path || formData.avatar_url} 
              alt="Avatar" 
              className="w-32 h-32 rounded-full object-cover border-4 border-orange-500 shadow-lg transition-transform transform group-hover:scale-105"
            />
          )}
          <label className="absolute bottom-0 right-0 bg-orange-500 p-2 rounded-full cursor-pointer hover:bg-orange-600 transition-colors">
            <Camera size={18} className="text-white" />
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
        </div>
        <div className="flex-1">
          <h2 className="text-3xl font-bold mb-2">{formData.name || 'Имя'}</h2>
          <p className="text-gray-400">Уровень: <span className="text-orange-400 font-semibold">Pro</span></p>
          <div className="flex gap-4 mt-4">
             <div className="bg-black/30 px-4 py-2 rounded-lg flex items-center gap-2">
                <Activity size={16} className="text-blue-400"/>
                <span>FTP: {formData.ftp} W</span>
             </div>
             <div className="bg-black/30 px-4 py-2 rounded-lg flex items-center gap-2">
                <Trophy size={16} className="text-yellow-400"/>
                <span>{stats.calories} ккал</span>
             </div>
             <div className="bg-black/30 px-4 py-2 rounded-lg flex items-center gap-2">
                <User size={16} className="text-green-400"/>
                     <div>
                          <div>Вес: {effWeight()} кг</div>
                          <div className={`text-[12px] ${theme === 'dark' ? 'text-gray-300' : 'text-slate-600'}`}>BMI: {computeBMI()} ({getBMICategory(computeBMI())}){latestWeight?.date ? ' · ' + latestWeight.date : ''}</div>
                     </div>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <User size={20}/> Личные данные
                    </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Имя</label>
              <input 
                name="name" 
                value={formData.name} 
                onChange={handleChange}
                className={`w-full border rounded-lg p-3 outline-none transition-colors focus:border-orange-500 ${theme === 'dark' ? 'bg-black/40 border-gray-700 text-white' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                                placeholder="Введите имя"
              />
            </div>
            <div>
                            <label className="block text-sm text-gray-400 mb-1">Дата рождения</label>
              <input 
                type="date"
                name="birth_date" 
                value={formData.birth_date} 
                onChange={handleChange}
                className={`w-full border rounded-lg p-3 outline-none transition-colors focus:border-orange-500 ${theme === 'dark' ? 'bg-black/40 border-gray-700 text-white [color-scheme:dark]' : 'bg-white border-slate-300 text-slate-900 [color-scheme:light]'}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">FTP (Вт)</label>
                  <input 
                    name="ftp" 
                    type="number"
                    value={formData.ftp} 
                    onChange={handleChange}
                    className={`w-full border rounded-lg p-3 outline-none focus:border-orange-500 ${theme === 'dark' ? 'bg-black/40 border-gray-700 text-white' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                  />
               </div>
               <div>
                        <label className="block text-sm text-gray-400 mb-1">Вес (кг)</label>
                  <input 
                    name="weight" 
                    type="number"
                    value={formData.weight} 
                    onChange={handleChange}
                    className={`w-full border rounded-lg p-3 outline-none focus:border-orange-500 ${theme === 'dark' ? 'bg-black/40 border-gray-700 text-white' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                  />
               </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Рост (см)</label>
                    <input
                        name="height"
                        type="number"
                        value={formData.height}
                        onChange={handleChange}
                        className={`w-full border rounded-lg p-3 outline-none focus:border-orange-500 ${theme === 'dark' ? 'bg-black/40 border-gray-700 text-white' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                    />
                </div>
                <div className="flex items-end">
                    <div className="text-sm text-gray-400">&nbsp;</div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                    <label className="block text-sm text-gray-400 mb-1">ЧСС покоя (уд/мин)</label>
                    <input
                        name="resting_hr"
                        type="number"
                        value={formData.resting_hr}
                        onChange={handleChange}
                        className={`w-full border rounded-lg p-3 outline-none focus:border-orange-500 ${theme === 'dark' ? 'bg-black/40 border-gray-700 text-white' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Макс ЧСС (уд/мин)</label>
                    <input
                        name="max_hr"
                        type="number"
                        value={formData.max_hr}
                        onChange={handleChange}
                        className={`w-full border rounded-lg p-3 outline-none focus:border-orange-500 ${theme === 'dark' ? 'bg-black/40 border-gray-700 text-white' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
                </div>
            </div>
                        <button 
                            onClick={async () => {
                                    await onSave(formData);
                                    // Вес из профиля — и в health_metrics, чтобы табы Здоровья видели то же значение
                                    try {
                                        const v = Number(formData.weight);
                                        if (isFinite(v) && v > 0 && window.electronAPI?.run) {
                                            const d = new Date();
                                            const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                            await window.electronAPI.run(`DELETE FROM health_metrics WHERE type='weight' AND date=?`, [today]);
                                            await window.electronAPI.run(`INSERT INTO health_metrics (type, value, date) VALUES ('weight', ?, ?)`, [v, today]);
                                            setLatestWeight({ value: v, date: today });
                                        }
                                    } catch (e) { console.error('sync weight to health_metrics', e); }
                                    if (typeof window !== 'undefined') window.dispatchEvent(new Event('profile-updated'));
                                    // Trigger lightweight ML train save
                                    try { if (window.electronAPI && window.electronAPI.trainML) await window.electronAPI.trainML({ user: formData, stats }); } catch (err) { console.error('train ml failed', err); }
                            }}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg"
                        >
                            Сохранить профиль
                        </button>
            <button 
              onClick={() => onLogout()}
              className="w-full text-red-400 hover:text-red-300 text-sm font-medium pt-2 underline"
            >
                            Выйти из профиля
            </button>
          </div>
        </div>

        <div className="space-y-6">
            <AwardsWidget />
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <Heart size={20} className="text-red-500"/> Зоны пульса (HR)
                </h3>
                <div className="space-y-3">
                    {(() => {
                        const age = new Date().getFullYear() - new Date(formData.birth_date || '1990-01-01').getFullYear();
                        const maxHr = 220 - age;
                        const zones = [
                            { name: 'Восстановление', pct: '50-60%', color: 'bg-gray-500' },
                            { name: 'Выносливость', pct: '60-70%', color: 'bg-blue-500' },
                            { name: 'Темп', pct: '70-80%', color: 'bg-green-500' },
                            { name: 'Порог', pct: '80-90%', color: 'bg-orange-500' },
                            { name: 'VO2 Max', pct: '90-100%', color: 'bg-red-500' },
                        ];
                        return zones.map((z, i) => {
                            const low = Math.round(maxHr * (0.5 + i * 0.1));
                            const high = Math.round(maxHr * (0.6 + i * 0.1));
                            return (
                                <div key={i} className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-3 h-3 rounded-full ${z.color}`}></div>
                                        <span className={theme === 'dark' ? 'text-gray-300' : 'text-slate-600'}>Z{i+1}: {z.name}</span>
                                    </div>
                                    <span className="font-mono">{low} - {high} bpm</span>
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>

            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <Zap size={20} className="text-yellow-400"/> Зоны мощности (Power)
                </h3>
                <div className="space-y-3">
                    {(() => {
                        const ftp = formData.ftp || 200;
                        const zones = [
                            { name: 'Active Recovery', pct: '< 55%', range: [0, 0.55] },
                            { name: 'Endurance', pct: '55-75%', range: [0.55, 0.75] },
                            { name: 'Tempo', pct: '75-90%', range: [0.75, 0.90] },
                            { name: 'Threshold', pct: '90-105%', range: [0.90, 1.05] },
                            { name: 'VO2 Max', pct: '105-120%', range: [1.05, 1.20] },
                            { name: 'Anaerobic', pct: '> 120%', range: [1.20, 2.0] },
                        ];
                        return zones.map((z, i) => {
                            const low = Math.round(ftp * z.range[0]);
                            const high = i === zones.length - 1 ? '+' : Math.round(ftp * z.range[1]);
                            return (
                                <div key={i} className="flex justify-between items-center text-sm">
                                    <span className={theme === 'dark' ? 'text-gray-300' : 'text-slate-600'}>Z{i+1}: {z.name}</span>
                                    <span className="font-mono">{low} - {high} {i === zones.length - 1 ? '' : 'Вт'}</span>
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>
        </div>

        {/* Снаряжение живёт в отдельном разделе */}
        <div className="mt-12">
          <button
            onClick={() => onNavigate && onNavigate('gears')}
            className="w-full flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-white/25 transition-all text-left"
          >
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Bike className="text-indigo-400" size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold">Снаряжение и износ</div>
              <div className="text-xs text-gray-400">Пробег, компоненты, прогноз — в разделе «Снаряжение»</div>
            </div>
            <span className="text-sm text-indigo-400 shrink-0">Открыть →</span>
          </button>
        </div>
    </div>
  );
};

export default Profile;
