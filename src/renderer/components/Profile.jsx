import React, { useState, useEffect } from 'react';
import { Camera, Save, User, Activity, Trophy, Zap, Heart, Bike, Trash2, Plus, Calendar, RefreshCcw, Info, Edit3 } from 'lucide-react';
import { toast } from 'react-toastify';

const Profile = ({ user, onSave, onLogout, onNavigate }) => {
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
  const [gears, setGears] = useState([]);
  const [isGearModalOpen, setIsGearModalOpen] = useState(false);
  const [appInfo, setAppInfo] = useState(null);
        const [newGear, setNewGear] = useState({ 
        name: '', 
        type: 'Велосипед', 
        brand: '', 
        model: '', 
        purchase_date: new Date().toISOString().split('T')[0], 
        initial_distance: 0,
          life_km: '',
          parts: '',
          purchase_is_new: true,
          icon: 'Bike',
          wheel_size: '29"',
          brake_type: 'disc_hydraulic'
    });
        const [editingGearId, setEditingGearId] = useState(null);
    const ICONS = { Bike, Trophy, Zap, Heart, Info, Calendar, RefreshCcw, Trash2, Plus, Camera, Save, User, Activity, Edit3 };
    const [isPartsModalOpen, setIsPartsModalOpen] = useState(false);
    const [partsForModal, setPartsForModal] = useState({ gearId: null, items: [] });
    const [newPartName, setNewPartName] = useState('');
    const [newPartKm, setNewPartKm] = useState(0);
    const [promptDialog, setPromptDialog] = useState({ open: false, message: '', value: '', onConfirm: null, onCancel: null });
    const [promptValue, setPromptValue] = useState('');
    const [confirmDialog, setConfirmDialog] = useState({ open: false, message: '', onConfirm: null });

    const showPrompt = (message, defaultValue = '', onConfirm, onCancel) => {
        setPromptValue(defaultValue);
        setPromptDialog({ open: true, message, value: defaultValue, onConfirm, onCancel });
    };

    const showConfirm = (message, onConfirm) => {
        setConfirmDialog({ open: true, message, onConfirm });
    };

    const handleConfirm = () => {
        try { if (confirmDialog.onConfirm) confirmDialog.onConfirm(); } catch (e) { console.error(e); }
        setConfirmDialog({ open: false, message: '', onConfirm: null });
    };

    const handleConfirmCancel = () => {
        setConfirmDialog({ open: false, message: '', onConfirm: null });
    };

    const handlePromptConfirm = () => {
        if (promptDialog.onConfirm) promptDialog.onConfirm(promptValue);
        setPromptDialog({ open: false, message: '', value: '', onConfirm: null, onCancel: null });
        setPromptValue('');
    };

    const handlePromptCancel = () => {
        if (promptDialog.onCancel) promptDialog.onCancel();
        setPromptDialog({ open: false, message: '', value: '', onConfirm: null, onCancel: null });
        setPromptValue('');
    };

    const openPartsModal = async (gearId) => {
        try {
            const parts = await window.electronAPI.getGearParts(gearId);
            setPartsForModal({ gearId, items: parts || [] });
            setIsPartsModalOpen(true);
        } catch (err) {
            console.error(err);
            toast.error('Нет ответа от main-процесса. Перезапустите приложение (`npx electron .`) чтобы зарегистрировать IPC-хендлеры.');
        }
    };

    const handleAddPart = async () => {
        try {
            await window.electronAPI.addGearPart(partsForModal.gearId, { part_name: newPartName, installed_km: newPartKm });
            const parts = await window.electronAPI.getGearParts(partsForModal.gearId);
            setPartsForModal({ ...partsForModal, items: parts });
            setNewPartName(''); setNewPartKm(0);
            loadData();
        } catch (err) { console.error(err); }
    };

    const handleReplacePart = async (partId) => {
        showPrompt('Введите пробег при снятии (км)', '0', async (removedKm) => {
            try {
                const removedKmNum = Math.round(removedKm || '0');
                const removedAt = new Date().toISOString();
                await window.electronAPI.replaceGearPart(partId, removedAt, removedKmNum, null);
                const parts = await window.electronAPI.getGearParts(partsForModal.gearId);
                setPartsForModal({ ...partsForModal, items: parts });
                // Find the replaced part to generate ML sample
                const replaced = partsForModal.items.find(p => p.id === partId);
                if (replaced && replaced.installed_at) {
                    const installedAt = replaced.installed_at;
                    const daysToFail = Math.max(0, Math.round((new Date(removedAt) - new Date(installedAt)) / (1000*60*60*24)));
                    try {
                        await window.electronAPI.trainGearML({ gear_id: partsForModal.gearId, sample_date: removedAt, life_km: replaced.installed_km || 0, current_wear: replaced.installed_km || 0, daily_avg: 0, days_to_fail: daysToFail });
                        toast.success('ML sample сохранён');
                    } catch (e) { console.error('trainGearML failed', e); }
                }
                loadData();
            } catch (err) { console.error(err); }
        });
    };

  const loadData = async () => {
    if (window.electronAPI) {
      const rides = await window.electronAPI.getRides();
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
        if (window.electronAPI.getGearAnalytics) {
            const g = await window.electronAPI.getGearAnalytics();
            setGears(g || []);
            // request model predictions asynchronously
            if (window.electronAPI.predictGearML) {
                g.forEach(async gear => {
                    try {
                        const p = await window.electronAPI.predictGearML(gear.id);
                        if (p && p.success) {
                            setGears(prev => prev.map(x => x.id === gear.id ? { ...x, model_predicted_days: p.predicted_days, model_used: p.model_used } : x));
                        }
                    } catch (e) {
                        // handler may be missing — show helpful toast once
                        console.error('predictGearML failed', e);
                    }
                });
            }
        }
        if (window.electronAPI.getAppInfo) {
            const info = await window.electronAPI.getAppInfo();
            setAppInfo(info);
        }
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

    const computeBMI = () => {
        const h = (formData.height || 180) / 100;
        const w = formData.weight || 75;
        const bmi = h > 0 ? (w / (h*h)) : 0;
        return parseFloat(bmi.toFixed(1));
    };

  const handleAddGear = async () => {
    if (!newGear.name) return;
    try {
                const gearToSave = { ...newGear };
                // Auto-fill default life_km based on type if not provided
                const defaultLife = (() => {
                    if (newGear.type === 'Цепь') return 2000;
                    if (newGear.type === 'Кроссовки') return 800;
                    if (newGear.type === 'Покрышки') return 8000;
                    if (newGear.type === 'Велосипед') return 50000;
                    return 2000;
                })();
                gearToSave.life_km = newGear.life_km ? parseFloat(newGear.life_km) : defaultLife;
                gearToSave.parts = newGear.parts || null;
                gearToSave.icon = newGear.icon || 'Bike';
                gearToSave.wheel_size = newGear.wheel_size || null;
                gearToSave.brake_type = newGear.brake_type || null;
        if (gearToSave.type === 'Другое' && gearToSave.custom_type) gearToSave.type = gearToSave.custom_type;
        delete gearToSave.custom_type;
        if (editingGearId) {
            // update
            const updates = { ...gearToSave };
            delete updates.id;
            await window.electronAPI.updateGear(editingGearId, updates);
            setEditingGearId(null);
        } else {
            await window.electronAPI.addGear(gearToSave);
        }
        loadData();
        setIsGearModalOpen(false);
        setNewGear({ name: '', type: 'Велосипед', brand: '', model: '', purchase_date: new Date().toISOString().split('T')[0], initial_distance: 0, life_km: '', parts: '', purchase_is_new: true, icon: 'Bike', wheel_size: '29"', brake_type: 'disc_hydraulic' });
        toast.success('Снаряжение добавлено!');
    } catch (err) {
        toast.error('Ошибка при добавлении');
    }
  };

    const getBMICategory = (bmi) => {
        if (!bmi) return '—';
        if (bmi < 18.5) return 'Недостаток';
        if (bmi < 25) return 'Норма';
        if (bmi < 30) return 'Избыточный';
        return 'Ожирение';
    };

  const handleResetGear = async (id) => {
    if (confirm('Сбросить данные? После сброса предыдущие значения будут утеряны.')) {
        try {
            await window.electronAPI.resetGear(id);
            loadData();
            toast.success('Сброшено!');
        } catch (err) {
            toast.error('Ошибка сброса');
        }
    }
  };

  const handleDeleteGear = async (id) => {
    try {
        await window.electronAPI.deleteGear(id);
        const g = await window.electronAPI.getGearAnalytics();
        setGears(g || []);
        toast.info('Удалено');
    } catch (err) {
        toast.error('Ошибка');
    }
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
    <div className="p-8 space-y-8 animate-fade-in text-white">
      {/* Header Profile */}
      <div className="flex items-center space-x-8 bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 shadow-xl">
        <div className="relative group">
          <img 
            src={formData.avatar_path || formData.avatar_url} 
            alt="Avatar" 
            className="w-32 h-32 rounded-full object-cover border-4 border-orange-500 shadow-lg transition-transform transform group-hover:scale-105"
          />
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
                          <div>Вес: {formData.weight} кг</div>
                          <div className="text-[12px] text-gray-300">BMI: {computeBMI()} ({getBMICategory(computeBMI())})</div>
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
                className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none transition-colors"
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
                className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none transition-colors [color-scheme:dark]"
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
                    className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none"
                  />
               </div>
               <div>
                        <label className="block text-sm text-gray-400 mb-1">Вес (кг)</label>
                  <input 
                    name="weight" 
                    type="number"
                    value={formData.weight} 
                    onChange={handleChange}
                    className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none"
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
                        className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none"
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
                        className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Макс ЧСС (уд/мин)</label>
                    <input
                        name="max_hr"
                        type="number"
                        value={formData.max_hr}
                        onChange={handleChange}
                        className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none"
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
                </div>
            </div>
                        <button 
                            onClick={async () => {
                                    await onSave(formData);
                                    // Trigger lightweight ML train save
                                    try { if (window.electronAPI && window.electronAPI.trainML) await window.electronAPI.trainML({ user: formData, stats }); } catch (err) { console.error('train ml failed', err); }
                            }}
              className="w-full bg-orange-500 hover:bg-orange-600 font-bold py-3 rounded-xl transition-all shadow-lg"
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
                                        <span className="text-gray-300">Z{i+1}: {z.name}</span>
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
                                    <span className="text-gray-300">Z{i+1}: {z.name}</span>
                                    <span className="font-mono">{low} - {high} {i === zones.length - 1 ? '' : 'Вт'}</span>
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>
        </div>

        {/* Gear Section */}
        <div className="mt-12 space-y-6">
          <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 rounded-lg">
                      <Bike className="text-indigo-400" size={24} />
                  </div>
                  <h3 className="text-2xl font-bold">Снаряжение и износ</h3>
              </div>
                  <button 
                          onClick={() => { setEditingGearId(null); setNewGear({ name: '', type: 'Велосипед', brand: '', model: '', purchase_date: new Date().toISOString().split('T')[0], initial_distance: 0, life_km: '', parts: '', purchase_is_new: true, icon: 'Bike', wheel_size: '29"', brake_type: 'disc_hydraulic' }); setIsGearModalOpen(true); }}
                          className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all flex items-center gap-2 px-4 py-2 font-bold text-sm"
                      >
                          <Plus size={16} /> Добавить
                      </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {gears.map(gear => {
                  const gearLimit = (gear.type === 'Цепь' ? 2000 : gear.type === 'Кроссовки' ? 800 : 5000);
                  const wearPercent = Math.min(100, Math.round((gear.current_distance / gearLimit) * 100));
                  
                  return (
                      <div key={gear.id} className="bg-white/5 border border-white/5 rounded-3xl p-6 space-y-4 hover:border-white/20 transition-all group relative overflow-hidden">
                          <div className="flex justify-between items-start">
                              <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-12 h-12 flex items-center justify-center p-3 rounded-2xl ${wearPercent > 80 ? 'bg-red-500/20 text-red-500' : 'bg-white/10 text-gray-400'}`}>
                                      {(() => { const Icon = ICONS[gear.icon] || Bike; return <Icon size={20} /> })()}
                                  </div>
                                  <div className="min-w-0">
                                      <h4 className="font-bold uppercase text-sm tracking-widest truncate">{gear.name}</h4>
                                      <p className="text-[10px] text-gray-500 truncate">{gear.brand} {gear.type}</p>
                                  </div>
                              </div>
                              <div className="flex gap-1 shrink-0 items-center">
                                <button onClick={() => handleResetGear(gear.id)} title="Сброс (км/дата)" className="p-2 text-emerald-500 hover:bg-emerald-500/20 rounded-lg transition-colors shrink-0">
                                    <RefreshCcw size={16} />
                                </button>
                                <button onClick={async () => {
                                    // Toggle primary/star
                                    try {
                                        await window.electronAPI.updateGear(gear.id, { is_primary: gear.is_primary ? 0 : 1 });
                                        loadData();
                                    } catch (err) { console.error(err); }
                                }} title={gear.is_primary ? 'Убрать звезду' : 'Отметить как основной'} className="p-2 text-yellow-400 hover:bg-yellow-400/10 rounded-lg">
                                    <Trophy size={16} />
                                </button>
                                <button onClick={() => {
                                    // Open edit modal
                                    setEditingGearId(gear.id);
                                    setNewGear({
                                        id: gear.id,
                                        name: gear.name || '',
                                        type: gear.type || 'Велосипед',
                                        brand: gear.brand || '',
                                        model: gear.model || '',
                                        purchase_date: gear.purchase_date || new Date().toISOString().split('T')[0],
                                        initial_distance: gear.initial_distance || 0,
                                        life_km: gear.life_km || gear.life_km === 0 ? gear.life_km : '',
                                        parts: gear.parts || '',
                                        purchase_is_new: (gear.initial_distance || 0) === 0,
                                        icon: gear.icon || 'Bike',
                                        wheel_size: gear.wheel_size || '29"',
                                        brake_type: gear.brake_type || 'disc_hydraulic'
                                    });
                                    setIsGearModalOpen(true);
                                }} title="Редактировать" className="p-2 text-gray-300 hover:bg-white/5 rounded-lg">
                                    <Edit3 size={16} />
                                </button>
                                <button onClick={() => showConfirm('Удалить снаряжение "' + (gear.name || '') + '"? Это действие нельзя отменить.', async () => { await handleDeleteGear(gear.id); })} className="p-2 text-gray-600 hover:text-red-500">
                                    <Trash2 size={16} />
                                </button>
                                <button onClick={async () => {
                                    if (!confirm('Привязать подходящие активности к этому снаряжению?')) return;
                                    try {
                                        const res = await window.electronAPI.assignGearToActivities(gear.id);
                                        toast.info(res.changes ? `Привязано записей: ${res.changes}` : 'Готово');
                                        loadData();
                                    } catch (err) { toast.error('Ошибка привязки'); }
                                }} title="Привязать активности" className="p-2 text-gray-300 hover:bg-white/5 rounded-lg">
                                    <Calendar size={16} />
                                </button>
                                <button onClick={async () => {
                                    try {
                                        const r = await window.electronAPI.predictGearService(gear.id);
                                        if (r.success) {
                                            toast.info(`Износ ${r.pct}% — ${r.alert}`);
                                        } else {
                                            toast.error(r.error || 'Ошибка предсказания');
                                        }
                                    } catch (err) { toast.error('Ошибка'); }
                                }} title="Предсказать сервис" className="p-2 text-gray-300 hover:bg-white/5 rounded-lg">
                                    <Info size={16} />
                                </button>
                              </div>
                          </div>
                          
                          <div className="space-y-3">
                              <div className="flex justify-between text-[10px]">
                                  <span className="text-gray-400">Пробег: {Math.round(gear.current_distance)} км</span>
                                  <span className={wearPercent > 80 ? 'text-red-400 font-bold' : 'text-gray-500'}>Износ: {wearPercent}%</span>
                              </div>
                              <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
                                  <div 
                                      className={`h-full transition-all duration-1000 ${wearPercent > 80 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : wearPercent > 50 ? 'bg-yellow-500' : 'bg-green-500'}`} 
                                      style={{ width: `${wearPercent}%` }}
                                  ></div>
                              </div>
                              
                              <div className="pt-2 border-t border-white/5 mt-2">
                                  {gear.daysToService !== null ? (
                                      <div className="flex items-center justify-between">
                                        <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                            <Calendar size={10} /> Сервис: {new Date(gear.predictedServiceDate).toLocaleDateString()}
                                        </p>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${gear.daysToService < 7 ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-gray-400'}`}>
                                            Осталось {Math.max(0, gear.daysToService)} дней
                                        </span>
                                      </div>
                                  ) : (
                                      <p className="text-[10px] text-gray-600 italic text-center">Нет данных для предсказания</p>
                                  )}
                                      {gear.model_predicted_days !== undefined && (
                                          <div className="mt-2 text-[10px] text-gray-300 flex items-center gap-2">
                                              <span className="text-gray-400">ML прогноз:</span>
                                              <span className="font-mono text-sm font-bold">{gear.model_predicted_days === null ? 'N/A' : `${gear.model_predicted_days} дн.`}</span>
                                              {gear.model_used && <span className="ml-2 text-[10px] text-green-400">(модель)</span>}
                                          </div>
                                      )}
                                  <div className="mt-3 flex gap-2">
                                    <button onClick={() => openPartsModal(gear.id)} className="px-3 py-2 bg-white/5 rounded text-sm">Управление частями</button>
                                  <button onClick={async ()=>{
                                      try {
                                          const r = await window.electronAPI.getGearMLModel(gear.id);
                                          if (r && r.success) {
                                              toast.info(`Модель: ${r.model.beta.map(b=>b.toFixed(2)).join(', ')} (MSE ${r.metrics?.mse?.toFixed(2)})`);
                                          } else {
                                              // try training quickly
                                              const t = await window.electronAPI.trainGearMLModel({ gear_id: gear.id, lambda: 1.0 });
                                              if (t && t.success) toast.success('Модель обучена'); else toast.error(t.error || 'Нет данных');
                                          }
                                      } catch (err) { console.error(err); toast.error('Ошибка модели'); }
                                  }} className="px-3 py-2 bg-white/5 rounded text-sm">Train model</button>
                                  </div>
                              </div>
                          </div>
                      </div>
                  )
              })}
              {gears.length === 0 && (
                  <div className="col-span-full py-12 text-center bg-white/5 border border-dashed border-white/10 rounded-3xl text-gray-600">
                      Снаряжение не добавлено.
                  </div>
              )}
          </div>
      </div>

      

      {isGearModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="bg-[#0f172a] border border-white/10 w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-6">
                  <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                      <Bike className="text-indigo-400" /> Новый элемент снаряжения
                  </h3>
                  
                  <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-2">
                      <div className="grid grid-cols-2 gap-4">
                          <label className="block">
                              <span className="text-xs text-gray-500 ml-1">Название</span>
                              <input 
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                  value={newGear.name} onChange={e => setNewGear({...newGear, name: e.target.value})} placeholder="напр. Cervelo S5"
                              />
                          </label>
                          <label className="block">
                              <span className="text-xs text-gray-500 ml-1">Тип</span>
                              <select 
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none appearance-none"
                                  value={newGear.type} onChange={e => setNewGear({...newGear, type: e.target.value})}
                              >
                                  <option value="Велосипед" className="bg-slate-800">Велосипед</option>
                                  <option value="Покрышки" className="bg-slate-800">Покрышки</option>
                                  <option value="Цепь" className="bg-slate-800">Цепь</option>
                                  <option value="Крутилка" className="bg-slate-800">Кассета</option>
                                  <option value="Кроссовки" className="bg-slate-800">Кроссовки</option>
                                  <option value="Другое" className="bg-slate-800">Другое</option>
                              </select>
                              {newGear.type === 'Другое' && (
                                  <input
                                      className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
                                      placeholder="Укажите тип"
                                      value={newGear.custom_type || ''}
                                      onChange={e => setNewGear({...newGear, custom_type: e.target.value})}
                                  />
                              )}
                          </label>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <label className="block">
                              <span className="text-xs text-gray-500 ml-1">Ресурс (км) — life_km</span>
                              <input
                                  type="number"
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
                                  value={newGear.life_km}
                                  onChange={e => setNewGear({...newGear, life_km: e.target.value})}
                                  placeholder="напр. 2000"
                              />
                          </label>
                          <label className="block">
                              <span className="text-xs text-gray-500 ml-1">Части / заметки (parts)</span>
                              <input list="parts-list" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" value={newGear.parts} onChange={e=>setNewGear({...newGear, parts: e.target.value})} placeholder="цепь;покрышки" />
                              <datalist id="parts-list">
                                  <option value="цепь" />
                                  <option value="покрышка" />
                                  <option value="кассета" />
                                  <option value="камера" />
                                  <option value="роллер" />
                                  <option value="тормоза" />
                              </datalist>
                          </label>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <label className="block">
                              <span className="text-xs text-gray-500 ml-1">Бренд</span>
                              <input list="brand-list" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" value={newGear.brand} onChange={e=>setNewGear({...newGear, brand: e.target.value})} placeholder="Fizik, Shimano..." />
                              <datalist id="brand-list">
                                  <option value="Fizik" />
                                  <option value="Shimano" />
                                  <option value="SRAM" />
                                  <option value="Specialized" />
                                  <option value="Trek" />
                                  <option value="Cannondale" />
                              </datalist>
                          </label>
                          <label className="block">
                              <span className="text-xs text-gray-500 ml-1">Модель</span>
                              <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" value={newGear.model} onChange={e=>setNewGear({...newGear, model: e.target.value})} placeholder="Model" />
                          </label>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <label className="block">
                              <span className="text-xs text-gray-500 ml-1">Размер колёс</span>
                              <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" value={newGear.wheel_size} onChange={e=>setNewGear({...newGear, wheel_size: e.target.value})}>
                                  <option value='26"'>26"</option>
                                  <option value='27.5"'>27.5"</option>
                                  <option value='29"'>29"</option>
                                  <option value='700C'>700C</option>
                              </select>
                          </label>
                          <label className="block">
                              <span className="text-xs text-gray-500 ml-1">Тормоза</span>
                              <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" value={newGear.brake_type} onChange={e=>setNewGear({...newGear, brake_type: e.target.value})}>
                                  <option value="rim">Ободные</option>
                                  <option value="disc_mechanical">Дисковые (механ.)</option>
                                  <option value="disc_hydraulic">Дисковые (гидр.)</option>
                                  <option value="v_brake">V-brake</option>
                              </select>
                          </label>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <label className="block">
                              <span className="text-xs text-gray-500 ml-1">Начальный пробег (км)</span>
                              <input type="number" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" value={newGear.initial_distance} onChange={e=>setNewGear({...newGear, initial_distance: parseFloat(e.target.value)||0})} disabled={newGear.purchase_is_new} />
                          </label>
                          <label className="block">
                              <div className="flex items-center gap-2">
                                  <input type="checkbox" checked={newGear.purchase_is_new} onChange={e=>{ const checked = e.target.checked; setNewGear({...newGear, purchase_is_new: checked, initial_distance: checked ? 0 : newGear.initial_distance}); }} />
                                  <span className="text-xs text-gray-400">Это покупка (начальный пробег = 0)</span>
                              </div>
                              <div className="mt-2">
                                  <label className="text-xs text-gray-500 ml-1">Дата покупки</label>
                                  <input type="date" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" value={newGear.purchase_date} onChange={e=>setNewGear({...newGear, purchase_date: e.target.value})} />
                              </div>
                          </label>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <label className="block">
                              <span className="text-xs text-gray-500 ml-1">Иконка</span>
                              <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" value={newGear.icon} onChange={e=>setNewGear({...newGear, icon: e.target.value})}>
                                  <option value="Bike">Велосипед</option>
                                  <option value="Trophy">Общее</option>
                                  <option value="Zap">Мощность</option>
                                  <option value="Heart">Пульс</option>
                              </select>
                          </label>
                      </div>
                      <label className="block">
                          <span className="text-xs text-gray-500 ml-1">Ресурс (км) — life_km</span>
                          <input
                              type="number"
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
                              value={newGear.life_km}
                              onChange={e => setNewGear({...newGear, life_km: e.target.value})}
                              placeholder="напр. 2000"
                          />
                      </label>
                      <label className="block">
                          <span className="text-xs text-gray-500 ml-1">Части / заметки (parts)</span>
                          <input
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
                              value={newGear.parts}
                              onChange={e => setNewGear({...newGear, parts: e.target.value})}
                              placeholder="цепь;покрышки"
                          />
                      </label>
                      {/* brand/model and purchase fields already present above; removed duplicate block */}
                  </div>

                                    <div className="flex gap-4">
                                        <button onClick={() => { setIsGearModalOpen(false); setEditingGearId(null); setNewGear({ name: '', type: 'Велосипед', brand: '', model: '', purchase_date: new Date().toISOString().split('T')[0], initial_distance: 0, life_km: '', parts: '', purchase_is_new: true, icon: 'Bike', wheel_size: '29"', brake_type: 'disc_hydraulic' }); }} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white font-bold hover:bg-white/5 transition-colors">Отмена</button>
                                        <button onClick={handleAddGear} className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-all shadow-lg active:scale-95">{editingGearId ? 'Сохранить' : 'Добавить'}</button>
                                    </div>
              </div>
          </div>
      )}
      {isPartsModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
              <div className="bg-[#0f172a] border border-white/10 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4">
                  <h4 className="text-lg font-bold">Части / История замен</h4>
                  <div className="space-y-2 max-h-64 overflow-auto">
                      {partsForModal.items.map(p => (
                          <div key={p.id} className="flex justify-between items-center bg-white/5 p-2 rounded">
                              <div>
                                  <div className="font-medium">{p.part_name}</div>
                                  <div className="text-xs text-gray-400">Установлен: {p.installed_at ? new Date(p.installed_at).toLocaleDateString() : '—'} · km: {p.installed_km}</div>
                                  {p.removed_at && <div className="text-xs text-red-400">Снят: {new Date(p.removed_at).toLocaleDateString()} · km: {p.removed_km}</div>}
                              </div>
                              <div className="flex flex-col gap-2">
                                  {!p.removed_at && <button onClick={() => handleReplacePart(p.id)} className="px-2 py-1 bg-yellow-600 rounded text-xs">Снять/Заменить</button>}
                                  <button onClick={async () => {
                                      try {
                                          // If removed_at exists compute days, else prompt
                                          let days = null;
                                          if (p.removed_at && p.installed_at) {
                                              days = Math.max(0, Math.round((new Date(p.removed_at) - new Date(p.installed_at)) / (1000*60*60*24)));
                                          } else {
                                              showPrompt('Введите days_to_fail (если известно), иначе нажмите Отмена', '', async (ans) => {
                                                  if (!ans) return;
                                                  days = Math.round(Number(ans));
                                                  // fetch gear info to fill life_km and current_wear
                                                  const gears = await window.electronAPI.getGears();
                                                  const gear = gears.find(g=>g.id === partsForModal.gearId);
                                                  const life_km = gear?.life_km || gear?.life_km === 0 ? gear.life_km : null;
                                                  const current_wear = gear?.current_distance || 0;
                                                  const res = await window.electronAPI.trainGearML({ gear_id: partsForModal.gearId, life_km, current_wear, days_to_fail: days });
                                                  if (res && res.success) toast.success('Sample добавлен'); else toast.error(res.error || 'Ошибка');
                                              }, () => { return; });
                                              return;
                                          }
                                          // fetch gear info to fill life_km and current_wear
                                          const gears = await window.electronAPI.getGears();
                                          const gear = gears.find(g=>g.id === partsForModal.gearId);
                                          const life_km = gear?.life_km || gear?.life_km === 0 ? gear.life_km : null;
                                          const current_wear = gear?.current_distance || 0;
                                          const res = await window.electronAPI.trainGearML({ gear_id: partsForModal.gearId, life_km, current_wear, days_to_fail: days });
                                          if (res && res.success) toast.success('Sample добавлен'); else toast.error(res.error || 'Ошибка');
                                      } catch (err) { console.error(err); toast.error('Ошибка добавления sample'); }
                                  }} className="px-2 py-1 bg-blue-600 rounded text-xs">Добавить sample</button>
                              </div>
                          </div>
                      ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                      <input className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2" placeholder="Название части" value={newPartName} onChange={e=>setNewPartName(e.target.value)} />
                      <input className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2" placeholder="Пробег при установке" type="number" value={newPartKm} onChange={e=>setNewPartKm(parseFloat(e.target.value)||0)} />
                  </div>
                  <div className="flex gap-3">
                      <button onClick={()=>{ setIsPartsModalOpen(false); setPartsForModal({gearId:null, items:[]}); }} className="flex-1 px-4 py-2 rounded-xl border border-white/10">Закрыть</button>
                      <button onClick={handleAddPart} className="px-4 py-2 rounded-xl bg-indigo-600">Добавить часть</button>
                      <button onClick={async () => {
                          try {
                              const res = await window.electronAPI.exportGearPartsCSV(partsForModal.gearId);
                              if (res && res.success) { toast.success(`CSV сохранён: ${res.path}`); }
                              else { toast.error(res.error || 'Экспорт не выполнен'); }
                          } catch (err) { console.error(err); toast.error('Ошибка экспорта'); }
                      }} className="px-4 py-2 rounded-xl border border-white/10">Экспорт CSV</button>
                  </div>
              </div>
          </div>
      )}
      
      {/* Prompt Dialog */}
      {promptDialog.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="bg-[#0f172a] border border-white/10 w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-6">
                  <h3 className="text-xl font-bold text-white">{promptDialog.message}</h3>
                  <input
                      autoFocus
                      type="text"
                      value={promptValue}
                      onChange={(e) => setPromptValue(e.target.value)}
                      onKeyDown={(e) => {
                          if (e.key === 'Enter') handlePromptConfirm();
                          if (e.key === 'Escape') handlePromptCancel();
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                      placeholder="Введите значение"
                  />
                  <div className="flex gap-4">
                      <button
                          onClick={handlePromptCancel}
                          className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white font-bold hover:bg-white/5 transition-colors"
                      >
                          Отмена
                      </button>
                      <button
                          onClick={handlePromptConfirm}
                          className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-all"
                      >
                          ОК
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Profile;
