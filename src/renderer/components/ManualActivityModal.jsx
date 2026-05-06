import React, { useState } from 'react';
import { X, Save, Clock, MapPin, TrendingUp, Activity, Zap } from 'lucide-react';

const ManualActivityModal = ({ isOpen, onClose, onSave, accentColor }) => {
  const [formData, setFormData] = useState({
    title: '',
    date: new Date().toISOString().slice(0, 16),
    type: 'RIDE',
    distance: '',
    duration: '',
    elevation_gain: '',
    avg_hr: '',
    avg_power: ''
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      distance: parseFloat(formData.distance) * 1000 || 0, // км в м
      duration: parseInt(formData.duration) * 60 || 0, // мин в сек
      elevation_gain: parseFloat(formData.elevation_gain) || 0,
      avg_hr: parseInt(formData.avg_hr) || 0,
      avg_power: parseFloat(formData.avg_power) || 0
    };
    onSave(data);
    onClose();
  };

  const activityTypes = [
    { id: 'RIDE', label: '🚴 Велосипед' },
    { id: 'RUN', label: '🏃 Бег' },
    { id: 'WALK', label: '🚶 Ходьба' },
    { id: 'SWIM', label: '🏊 Плавание' },
    { id: 'SKI', label: '⛷️ Лыжи' },
    { id: 'HIKE', label: '🥾 Поход' },
    { id: 'WORKOUT', label: '💪 Силовая' },
    { id: 'YOGA', label: '🧘 Йога' },
    { id: 'ROWING', label: '🚣 Гребля' },
    { id: 'ICESKATE', label: '⛸️ Коньки' },
    { id: 'TENNIS', label: '🎾 Теннис' },
    { id: 'FOOTBALL', label: '⚽ Футбол' },
    { id: 'OTHER', label: '✨ Другое' }
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-800/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="text-orange-500" /> Добавить активность
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Название</label>
            <input
              type="text"
              required
              className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-orange-500 outline-none transition-all"
              placeholder="Вечерний заезд"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Тип</label>
              <select
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-orange-500 outline-none transition-all appearance-none"
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value})}
              >
                {activityTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Дата и время</label>
              <input
                type="datetime-local"
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <MapPin size={12} /> Дистанция (км)
              </label>
              <input
                type="number"
                step="0.1"
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                placeholder="0.0"
                value={formData.distance}
                onChange={(e) => setFormData({...formData, distance: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Clock size={12} /> Время (мин)
              </label>
              <input
                type="number"
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                placeholder="0"
                value={formData.duration}
                onChange={(e) => setFormData({...formData, duration: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp size={12} /> Набор (м)
              </label>
              <input
                type="number"
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-2 py-2.5 text-white text-center focus:ring-2 focus:ring-orange-500 outline-none"
                placeholder="0"
                value={formData.elevation_gain}
                onChange={(e) => setFormData({...formData, elevation_gain: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Activity size={12} /> Пульс
              </label>
              <input
                type="number"
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-2 py-2.5 text-white text-center focus:ring-2 focus:ring-orange-500 outline-none"
                placeholder="--"
                value={formData.avg_hr}
                onChange={(e) => setFormData({...formData, avg_hr: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Zap size={12} /> Мощн.
              </label>
              <input
                type="number"
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-2 py-2.5 text-white text-center focus:ring-2 focus:ring-orange-500 outline-none"
                placeholder="0вт"
                value={formData.avg_power}
                onChange={(e) => setFormData({...formData, avg_power: e.target.value})}
              />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white font-semibold hover:bg-white/5 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-2 px-8 py-3 rounded-xl text-white font-bold shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              style={{ backgroundColor: accentColor || '#f97316' }}
            >
              <Save size={20} /> Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualActivityModal;