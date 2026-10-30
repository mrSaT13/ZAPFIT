import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Flame, TrendingUp, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

export default function NutritionTabContent({ theme, accentColor }) {
  const [nutritionData, setNutritionData] = useState([]);
  const [todayNutrition, setTodayNutrition] = useState(null);
  const [standardDishes, setStandardDishes] = useState([]);
  const [form, setForm] = useState({ dish_name: '', calories: '', protein: '', carbs: '', fat: '', notes: '' });
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDish, setSelectedDish] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  // Локальная дата YYYY-MM-DD (toISOString даёт UTC-день и ломается 00:00–03:00 МСК)
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const loadData = async () => {
    try {
      const api = window.electronAPI;
      const today = localToday();

      // Load today's nutrition
      const todayData = await api.query(
        'SELECT * FROM nutrition_data WHERE date = ? ORDER BY created_at DESC',
        [today]
      );
      if (todayData && todayData.length > 0) {
        setTodayNutrition(todayData);
      }

      // Load standard dishes
      if (api && typeof api.getStandardDishes === 'function') {
        const dishes = await api.getStandardDishes();
        console.log('Loaded dishes:', dishes);
        setStandardDishes(Array.isArray(dishes) ? dishes : []);
      } else {
        console.warn('getStandardDishes not available');
        setStandardDishes([]);
      }
    } catch (err) {
      console.error('Failed to load nutrition data:', err);
      setStandardDishes([]);
    }
    setLoading(false);
  };

  const handleSelectDish = (dish) => {
    setForm({
      dish_name: dish.name || '',
      calories: (dish.calories || '') .toString(),
      protein: (dish.protein || '').toString(),
      carbs: (dish.carbs || '').toString(),
      fat: (dish.fat || '').toString(),
      notes: dish.portion_size || ''
    });
    setSelectedDish(dish);
    setShowForm(true);
  };

  const handleSaveNutrition = async (e) => {
    e.preventDefault();
    if (!form.dish_name || !form.calories) return alert('Укажите блюдо и калории');

    try {
      const today = localToday();
      await window.electronAPI.run(
        `INSERT INTO nutrition_data (date, dish_name, calories, protein, carbs, fat, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          today,
          form.dish_name,
          parseInt(form.calories),
          parseFloat(form.protein) || 0,
          parseFloat(form.carbs) || 0,
          parseFloat(form.fat) || 0,
          form.notes || null
        ]
      );

      setForm({ dish_name: '', calories: '', protein: '', carbs: '', fat: '', notes: '' });
      setSelectedDish(null);
      setShowForm(false);
      loadData();
    } catch (err) {
      console.error('Failed to save nutrition:', err);
    }
  };

  const handleDeleteNutrition = async (id) => {
    if (!confirm('Удалить запись?')) return;
    try {
      await window.electronAPI.run('DELETE FROM nutrition_data WHERE id = ?', [id]);
      loadData();
    } catch (err) {
      console.error('Failed to delete nutrition:', err);
    }
  };

  // Calculate totals
  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  };

  if (todayNutrition && todayNutrition.length > 0) {
    todayNutrition.forEach(item => {
      totals.calories += item.calories || 0;
      totals.protein += item.protein || 0;
      totals.carbs += item.carbs || 0;
      totals.fat += item.fat || 0;
    });
  }

  const macroData = [
    { name: 'Белки', value: Math.round(totals.protein * 4), color: '#3b82f6' },
    { name: 'Углеводы', value: Math.round(totals.carbs * 4), color: '#f59e0b' },
    { name: 'Жиры', value: Math.round(totals.fat * 9), color: '#ef4444' }
  ];

  const bgClass = theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const textClass = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const subTextClass = theme === 'dark' ? 'text-gray-400' : 'text-slate-600';
  const inputClass = theme === 'dark'
    ? 'bg-white/10 border-white/20 text-white placeholder-gray-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400';

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Калории (сегодня)</p>
          <p className={`text-3xl font-bold ${textClass}`}>{totals.calories}</p>
          <p className={`${subTextClass} text-xs mt-1`}>из ~2500 рекомендуемых</p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Белки</p>
          <p className={`text-3xl font-bold text-blue-400`}>{totals.protein.toFixed(1)}g</p>
          <p className={`${subTextClass} text-xs mt-1`}>1.6-2.2g/кг</p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Углеводы</p>
          <p className={`text-3xl font-bold text-amber-400`}>{totals.carbs.toFixed(1)}g</p>
          <p className={`${subTextClass} text-xs mt-1`}>основной источник энергии</p>
        </div>
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={subTextClass}>Жиры</p>
          <p className={`text-3xl font-bold text-red-400`}>{totals.fat.toFixed(1)}g</p>
          <p className={`${subTextClass} text-xs mt-1`}>20-30% калорий</p>
        </div>
      </div>

      {/* Macros Chart */}
      {totals.calories > 0 && (
        <div className={`${bgClass} border rounded-lg p-4`}>
          <h3 className={`${textClass} font-semibold mb-4`}>Распределение макросов</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={macroData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {macroData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Add Nutrition Button */}
      <div className="flex gap-2">
      <button
        onClick={() => {
          setShowForm(!showForm);
          if (showForm) setSelectedDish(null);
        }}
        className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
          theme === 'dark'
            ? 'bg-white/10 hover:bg-white/20 text-white'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
        }`}
        style={showForm ? { backgroundColor: accentColor, color: 'white' } : {}}
      >
        <Plus size={20} />
        {showForm ? 'Отменить' : 'Добавить блюдо'}
      </button>
      <button
        onClick={async () => {
          const api = window.electronAPI;
          if (!api?.zapfitSyncNutrition) { setSyncMsg('Синк недоступен (нет IPC)'); return; }
          setSyncing(true);
          setSyncMsg(null);
          try {
            const r = await api.zapfitSyncNutrition();
            if (r?.success) {
              setSyncMsg(`С сервера: ${r.synced} записей`);
              loadData();
            } else {
              setSyncMsg(`Ошибка: ${r?.error || 'неизвестно'}`);
            }
          } catch (e) {
            setSyncMsg(`Ошибка: ${e.message}`);
          } finally {
            setSyncing(false);
          }
        }}
        disabled={syncing}
        className={`px-4 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
          theme === 'dark' ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
        }`}
        title="Подтянуть записи с сервера"
      >
        <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
      </button>
      </div>
      {syncMsg && <p className={`text-xs ${subTextClass}`}>{syncMsg}</p>}

      {/* Quick Dishes */}
      {showForm && standardDishes.length > 0 && (
        <div className={`${bgClass} border rounded-lg p-4`}>
          <h3 className={`${textClass} font-semibold mb-4`}>Стандартные блюда</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
            {standardDishes.map((dish) => (
              <button
                key={dish.id}
                onClick={() => handleSelectDish(dish)}
                className={`p-3 rounded-lg text-left transition-all border ${
                  selectedDish?.id === dish.id
                    ? `border-2 ${theme === 'dark' ? 'bg-white/10' : 'bg-blue-50'}`
                    : theme === 'dark'
                    ? 'border-white/10 hover:bg-white/5'
                    : 'border-slate-200 hover:bg-slate-100'
                }`}
                style={selectedDish?.id === dish.id ? { borderColor: accentColor } : {}}
              >
                <p className={`font-semibold ${textClass}`}>{dish.name}</p>
                <p className={`${subTextClass} text-sm`}>
                  {dish.calories}кал | Б:{dish.protein}г У:{dish.carbs}г Ж:{dish.fat}г
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSaveNutrition} className={`${bgClass} border rounded-lg p-4 space-y-4`}>
          <div>
            <label className={`block ${subTextClass} font-semibold mb-2`}>Название блюда</label>
            <input
              type="text"
              value={form.dish_name || ''}
              onChange={(e) => setForm({ ...form, dish_name: e.target.value })}
              placeholder="Например: Омлет с беконом"
              className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block ${subTextClass} font-semibold mb-2`}>Калории</label>
              <input
                type="number"
                value={form.calories || ''}
                onChange={(e) => setForm({ ...form, calories: e.target.value })}
                placeholder="300"
                className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
              />
            </div>
            <div>
              <label className={`block ${subTextClass} font-semibold mb-2`}>Белки (г)</label>
              <input
                type="number"
                step="0.1"
                value={form.protein || ''}
                onChange={(e) => setForm({ ...form, protein: e.target.value })}
                placeholder="20"
                className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block ${subTextClass} font-semibold mb-2`}>Углеводы (г)</label>
              <input
                type="number"
                step="0.1"
                value={form.carbs || ''}
                onChange={(e) => setForm({ ...form, carbs: e.target.value })}
                placeholder="30"
                className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
              />
            </div>
            <div>
              <label className={`block ${subTextClass} font-semibold mb-2`}>Жиры (г)</label>
              <input
                type="number"
                step="0.1"
                value={form.fat || ''}
                onChange={(e) => setForm({ ...form, fat: e.target.value })}
                placeholder="10"
                className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
              />
            </div>
          </div>
          <div>
            <label className={`block ${subTextClass} font-semibold mb-2`}>Заметки (размер порции)</label>
            <input
              type="text"
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Например: 200g"
              className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
            />
          </div>
          <button
            type="submit"
            className="w-full px-4 py-2 rounded-lg font-semibold text-white transition-all"
            style={{ backgroundColor: accentColor }}
          >
            Добавить
          </button>
        </form>
      )}

      {/* Today's Nutrition */}
      {todayNutrition && todayNutrition.length > 0 && (
        <div className={`${bgClass} border rounded-lg`}>
          <div className={`p-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-slate-200'}`}>
            <h3 className={`${textClass} font-semibold`}>Блюда сегодня ({todayNutrition.length})</h3>
          </div>
          <div className="divide-y divide-slate-200">
            {todayNutrition.map((item) => (
              <div key={item.id} className={`p-4 flex items-center justify-between ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-slate-50'} transition-colors`}>
                <div className="flex items-center gap-3">
                  <Flame size={20} style={{ color: accentColor }} />
                  <div>
                    <p className={`${textClass} font-semibold`}>{item.dish_name}</p>
                    <p className={subTextClass}>
                      {item.calories}кал | Б:{item.protein}г У:{item.carbs}г Ж:{item.fat}g
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteNutrition(item.id)}
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
    </div>
  );
}
