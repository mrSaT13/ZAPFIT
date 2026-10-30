import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ShoppingCart, Edit2 } from 'lucide-react';

export default function FridgeTabContent({ theme, accentColor }) {
  const [dishes, setDishes] = useState([]);
  const [standardDishes, setStandardDishes] = useState([]);
  const [form, setForm] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '', category: '', portion: '' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const api = window.electronAPI;
      const allDishes = await api.getStandardDishes?.();
      setStandardDishes(allDishes || []);

      const cats = await api.getDishCategories?.();
      setCategories(cats?.map(c => c.category) || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const handleSaveDish = async (e) => {
    e.preventDefault();
    if (!form.name || !form.calories) return alert('Укажите название и калории');

    try {
      const api = window.electronAPI;
      // Save to local custom dishes (you would need a custom_dishes table)
      // For now, we just add it locally
      const newDish = {
        id: editingId || Date.now(),
        name: form.name,
        calories: parseInt(form.calories),
        protein: parseFloat(form.protein) || 0,
        carbs: parseFloat(form.carbs) || 0,
        fat: parseFloat(form.fat) || 0,
        category: form.category || 'Кастомное',
        portion_grams: parseFloat(form.portion) || 100
      };

      if (editingId) {
        const index = dishes.findIndex(d => d.id === editingId);
        if (index !== -1) {
          dishes[index] = newDish;
          setDishes([...dishes]);
        }
      } else {
        setDishes([...dishes, newDish]);
      }

      setForm({ name: '', calories: '', protein: '', carbs: '', fat: '', category: '', portion: '' });
      setEditingId(null);
      setShowForm(false);
    } catch (err) {
      console.error('Failed to save dish:', err);
    }
  };

  const handleDeleteDish = (id) => {
    if (!confirm('Удалить блюдо?')) return;
    setDishes(dishes.filter(d => d.id !== id));
  };

  const handleEditDish = (dish) => {
    setForm({
      name: dish.name,
      calories: dish.calories,
      protein: dish.protein,
      carbs: dish.carbs,
      fat: dish.fat,
      category: dish.category,
      portion: dish.portion_grams
    });
    setEditingId(dish.id);
    setShowForm(true);
  };

  const allDishes = [...standardDishes, ...dishes];
  const filtered = filterCategory
    ? allDishes.filter(d => d.category === filterCategory)
    : allDishes;

  const bgClass = theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const textClass = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const subTextClass = theme === 'dark' ? 'text-gray-400' : 'text-slate-600';
  const inputClass = theme === 'dark'
    ? 'bg-white/10 border-white/20 text-white placeholder-gray-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400';

  return (
    <div className="space-y-6">
      {/* Info Card */}
      <div className={`${bgClass} border rounded-lg p-4 flex items-start gap-3`}>
        <ShoppingCart size={20} style={{ color: accentColor }} className="mt-1 flex-shrink-0" />
        <div>
          <p className={`${textClass} font-semibold`}>Холодильник</p>
          <p className={subTextClass}>
            Здесь вы можете управлять список стандартных блюд и создавать свои рецепты для быстрого добавления в питание.
          </p>
        </div>
      </div>

      {/* Add Custom Dish */}
      <button
        onClick={() => {
          setShowForm(!showForm);
          if (showForm) {
            setEditingId(null);
            setForm({ name: '', calories: '', protein: '', carbs: '', fat: '', category: '', portion: '' });
          }
        }}
        className={`w-full px-4 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
          theme === 'dark'
            ? 'bg-white/10 hover:bg-white/20 text-white'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
        }`}
        style={showForm ? { backgroundColor: accentColor, color: 'white' } : {}}
      >
        <Plus size={20} />
        {showForm ? 'Отменить' : 'Добавить блюдо'}
      </button>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSaveDish} className={`${bgClass} border rounded-lg p-4 space-y-4`}>
          <div>
            <label className={`block ${subTextClass} font-semibold mb-2`}>Название</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Мой рецепт"
              className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block ${subTextClass} font-semibold mb-2`}>Категория</label>
              <div className="flex gap-2">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className={`flex-1 px-3 py-2 rounded-lg border ${inputClass}`}
                >
                  <option value="">Выбрать</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="Кастомное">Кастомное</option>
                </select>
                <input
                  type="text"
                  placeholder="Новая категория"
                  value={form.newCategory || ''}
                  onChange={(e) => setForm({ ...form, newCategory: e.target.value })}
                  className={`w-40 px-3 py-2 rounded-lg border ${inputClass}`}
                />
                <button
                  type="button"
                  onClick={async () => {
                    const api = window.electronAPI;
                    const name = (form.newCategory || '').trim();
                    if (!name) return alert('Введите имя категории');
                    const res = await api.addDishCategory?.(name);
                    if (res?.success) {
                      setCategories(res.categories.map(c => c.category));
                      setForm({ ...form, category: name, newCategory: '' });
                    } else {
                      alert('Не удалось создать категорию');
                    }
                  }}
                  className={`px-3 py-2 rounded-lg ${theme === 'dark' ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'}`}
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <label className={`block ${subTextClass} font-semibold mb-2`}>Размер порции (g)</label>
              <input
                type="number"
                value={form.portion}
                onChange={(e) => setForm({ ...form, portion: e.target.value })}
                placeholder="100"
                className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block ${subTextClass} font-semibold mb-2`}>Калории</label>
              <input
                type="number"
                value={form.calories}
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
                value={form.protein}
                onChange={(e) => setForm({ ...form, protein: e.target.value })}
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
                value={form.carbs}
                onChange={(e) => setForm({ ...form, carbs: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
              />
            </div>
            <div>
              <label className={`block ${subTextClass} font-semibold mb-2`}>Жиры (г)</label>
              <input
                type="number"
                step="0.1"
                value={form.fat}
                onChange={(e) => setForm({ ...form, fat: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full px-4 py-2 rounded-lg font-semibold text-white transition-all"
            style={{ backgroundColor: accentColor }}
          >
            {editingId ? 'Обновить' : 'Добавить'}
          </button>
        </form>
      )}

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className={`${bgClass} border rounded-lg p-4`}>
          <p className={`${subTextClass} font-semibold mb-3`}>Фильтр по категориям</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterCategory('')}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterCategory === ''
                  ? 'text-white'
                  : theme === 'dark'
                  ? 'bg-white/5 text-white hover:bg-white/10'
                  : 'bg-slate-100 text-slate-900'
              }`}
              style={filterCategory === '' ? { backgroundColor: accentColor } : {}}
            >
              Все ({allDishes.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-4 py-2 rounded-lg transition-all ${
                  filterCategory === cat
                    ? 'text-white'
                    : theme === 'dark'
                    ? 'bg-white/5 text-white hover:bg-white/10'
                    : 'bg-slate-100 text-slate-900'
                }`}
                style={filterCategory === cat ? { backgroundColor: accentColor } : {}}
              >
                {cat} ({allDishes.filter(d => d.category === cat).length})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dishes List */}
      <div className={`${bgClass} border rounded-lg`}>
        <div className={`p-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-slate-200'}`}>
          <h3 className={`${textClass} font-semibold`}>
            Блюда ({filtered.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-200 max-h-96 overflow-y-auto">
          {filtered.map((dish) => (
            <div
              key={`${dish.id}-${dish.name}`}
              className={`p-4 flex items-center justify-between ${
                theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-slate-50'
              } transition-colors`}
            >
              <div className="flex-1">
                <p className={`${textClass} font-semibold`}>{dish.name}</p>
                <p className={subTextClass}>
                  {dish.calories}кал | Б:{dish.protein}г У:{dish.carbs}г Ж:{dish.fat}g | {dish.portion_grams}g
                </p>
              </div>
              <div className="flex gap-2">
                {dishes.some(d => d.id === dish.id) && (
                  <>
                    <button
                      onClick={() => handleEditDish(dish)}
                      className={`p-2 rounded-lg transition-colors ${
                        theme === 'dark' ? 'hover:bg-blue-500/20' : 'hover:bg-blue-50'
                      }`}
                    >
                      <Edit2 size={18} style={{ color: accentColor }} />
                    </button>
                    <button
                      onClick={() => handleDeleteDish(dish.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        theme === 'dark' ? 'hover:bg-red-500/20' : 'hover:bg-red-50'
                      }`}
                    >
                      <Trash2 size={18} className="text-red-500" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
