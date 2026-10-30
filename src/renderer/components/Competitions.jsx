import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
  Plus, Trash2, Edit2, Calendar, MapPin, Trophy, RefreshCw,
  CalendarPlus, Medal, X, Check,
} from 'lucide-react';
import { withAlpha } from '../theme';

export default function Competitions({ theme, accentColor, embedded = false }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [prizPlace, setPrizPlace] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  const muted = theme === 'dark' ? 'text-gray-400' : 'text-slate-500';
  const inputClass = `w-full px-4 py-2.5 rounded-2xl border text-sm outline-none ${
    theme === 'dark'
      ? 'bg-black/40 border-white/10 text-white'
      : 'bg-white border-slate-300 text-slate-900'
  }`;

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
      if (!api || !api.getCompetitions) { setList([]); return; }
      const res = await api.getCompetitions();
      setList(Array.isArray(res) ? res : (res || []));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDate('');
    setLocation('');
    setPrizPlace('');
    setFormOpen(false);
  };

  const save = async () => {
    if (!title || !date) {
      toast.error('Введите название и дату');
      return;
    }
    const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
    if (!api || (!api.addCompetition && !editingId) || (!api.updateCompetition && editingId)) {
      toast.error('API недоступен');
      return;
    }

    try {
      const payload = { title, date, location, prize_place: prizPlace };
      const res = editingId
        ? await api.updateCompetition(editingId, payload)
        : await api.addCompetition(payload);
      if (res && res.success) {
        toast.success(editingId ? 'Соревнование обновлено!' : 'Соревнование добавлено!');
        resetForm();
        load();
        window.dispatchEvent(new CustomEvent('competitions-updated'));
      } else {
        toast.error('Ошибка сохранения');
      }
    } catch (e) {
      toast.error('Ошибка: ' + e.message);
    }
  };

  const deleteComp = async (id) => {
    if (!window.confirm('Удалить соревнование?')) return;
    const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
    if (!api || !api.deleteCompetition) {
      toast.error('API недоступен');
      return;
    }

    try {
      const res = await api.deleteCompetition(id);
      if (res && res.success) {
        toast.success('Соревнование удалено!');
        load();
        window.dispatchEvent(new CustomEvent('competitions-updated'));
      } else {
        toast.error('Ошибка удаления');
      }
    } catch (e) {
      toast.error('Ошибка: ' + e.message);
    }
  };

  const handleEdit = (comp) => {
    setEditingId(comp.id);
    setTitle(comp.title);
    setDate(comp.date);
    setLocation(comp.location || '');
    setPrizPlace(comp.prize_place || '');
    setFormOpen(true);
  };

  const exportIcs = async (id) => {
    const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
    if (!api || !api.exportCompetitionIcs) {
      toast.error('API недоступен');
      return;
    }
    try {
      const res = await api.exportCompetitionIcs(id);
      if (res && res.success) {
        toast.success('Файл сохранён в календарь!');
      } else {
        toast.error('Ошибка экспорта');
      }
    } catch (e) {
      toast.error('Ошибка: ' + e.message);
    }
  };

  // Dispatch event so other components (calendar, profile) can refresh
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('competitions-updated', handler);
    return () => window.removeEventListener('competitions-updated', handler);
  }, []);

  // Ближайшие старты сверху (по возрастанию), прошедшие — ниже (по убыванию)
  const sorted = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const upcoming = [], past = [];
    list.forEach((c) => ((c.date || '') >= today ? upcoming : past).push(c));
    upcoming.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    past.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return [...upcoming, ...past];
  }, [list]);

  const statusOf = (comp) => {
    const today = new Date().toISOString().split('T')[0];
    const d = (comp.date || '').split('T')[0];
    if (!d) return null;
    const diff = Math.round((new Date(d) - new Date(today)) / 86400000);
    if (diff > 1) return { label: `через ${diff} дн.`, color: '#3b82f6' };
    if (diff === 1) return { label: 'завтра', color: '#3b82f6' };
    if (diff === 0) return { label: 'сегодня', color: '#22c55e' };
    return { label: 'прошло', color: null };
  };

  const renderCard = (comp) => {
    const st = statusOf(comp);
    const editing = editingId === comp.id;
    return (
      <div
        key={comp.id}
        className="zap-card p-4"
        style={editing ? { borderColor: withAlpha(accentColor, 0.5) } : undefined}
      >
        <div className="flex gap-3 items-center">
          <span
            className="p-2.5 rounded-2xl shrink-0"
            style={{ backgroundColor: withAlpha('#eab308', 0.14) }}
          >
            <Trophy size={20} style={{ color: '#eab308' }} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate text-sm">{comp.title}</div>
            <div className={`text-xs ${muted} flex items-center gap-1 mt-0.5`}>
              <Calendar size={12} className="shrink-0" />
              {comp.date ? new Date(comp.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </div>
          </div>
          {st && (
            <span
              className="text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shrink-0"
              style={st.color
                ? { backgroundColor: withAlpha(st.color, 0.14), color: st.color }
                : undefined}
            >
              {st.label}
            </span>
          )}
        </div>
        <div className={`px-1 pt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-sm ${muted}`}>
          <span className="flex items-center gap-1"><MapPin size={13} />{comp.location || '—'}</span>
          {comp.prize_place
            ? <span className="flex items-center gap-1 font-bold" style={{ color: '#eab308' }}><Medal size={13} />{comp.prize_place} место</span>
            : null}
        </div>
        <div className="flex gap-1.5 justify-end pt-2">
          <button
            onClick={() => exportIcs(comp.id)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{ backgroundColor: withAlpha('#3b82f6', 0.12), color: '#3b82f6' }}
            title="Экспорт в календарь (.ics)"
          >
            <CalendarPlus size={14} /> ICS
          </button>
          <button
            onClick={() => handleEdit(comp)}
            className="p-2 rounded-xl transition-all"
            style={{ backgroundColor: withAlpha(accentColor, 0.12), color: accentColor }}
            title="Редактировать"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => deleteComp(comp.id)}
            className="p-2 rounded-xl transition-all"
            style={{ backgroundColor: withAlpha('#ef4444', 0.12), color: '#ef4444' }}
            title="Удалить"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {!embedded && (
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl shrink-0" style={{ backgroundColor: withAlpha(accentColor, 0.16) }}>
          <Trophy size={22} style={{ color: accentColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold">Соревнования</h1>
          <p className={`text-sm ${muted}`}>Старты и результаты ({list.length})</p>
        </div>
        <button
          onClick={() => { setFormOpen((v) => !v); if (editingId) resetForm(); }}
          className="p-2.5 rounded-2xl shrink-0 transition-colors text-white"
          style={{ backgroundColor: accentColor }}
          title={formOpen ? 'Скрыть форму' : 'Добавить соревнование'}
        >
          {formOpen ? <X size={16} /> : <Plus size={16} />}
        </button>
        <button
          onClick={load}
          className="p-2.5 rounded-2xl shrink-0 transition-colors"
          style={{ backgroundColor: withAlpha(accentColor, 0.12), color: accentColor }}
          title="Обновить"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      )}
      {embedded && (
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${muted}`}>Старты и результаты ({list.length})</span>
          <span className="flex-1" />
          <button
            onClick={() => { setFormOpen((v) => !v); if (editingId) resetForm(); }}
            className="p-2 rounded-xl transition-colors text-white"
            style={{ backgroundColor: accentColor }}
            title={formOpen ? 'Скрыть форму' : 'Добавить соревнование'}
          >
            {formOpen ? <X size={14} /> : <Plus size={14} />}
          </button>
          <button
            onClick={load}
            className="p-2 rounded-xl transition-colors"
            style={{ backgroundColor: withAlpha(accentColor, 0.12), color: accentColor }}
            title="Обновить"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      )}

      {formOpen && (
        <div className="zap-card p-4 sm:p-5">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-sm">
            {editingId ? <Edit2 size={16} style={{ color: accentColor }} /> : <Plus size={16} style={{ color: '#22c55e' }} />}
            {editingId ? 'Редактировать соревнование' : 'Новое соревнование'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="sm:col-span-2">
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Название соревнования *"
                className={inputClass}
              />
            </div>
            <input
              value={date}
              onChange={e => setDate(e.target.value)}
              type="date"
              className={inputClass}
            />
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Место проведения"
              className={inputClass}
            />
            <div className="sm:col-span-2">
              <input
                value={prizPlace}
                onChange={e => setPrizPlace(e.target.value)}
                placeholder="Ваше место (например: 1, 2, 3)"
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl font-bold text-white text-sm transition-all"
              style={{ backgroundColor: '#16a34a' }}
            >
              <Check size={16} />
              {editingId ? 'Обновить' : 'Добавить'}
            </button>
            {editingId && (
              <button
                onClick={resetForm}
                className={`px-5 py-2.5 rounded-2xl font-bold text-sm hover:bg-white/10 ${muted}`}
              >
                Отмена
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className={`p-8 text-center text-sm ${muted}`}>Загрузка...</div>
      ) : error && list.length === 0 ? (
        <div className="zap-card p-4 text-sm" style={{ borderColor: withAlpha('#f59e0b', 0.4), backgroundColor: withAlpha('#f59e0b', 0.08) }}>
          <div className="font-bold mb-1">Не удалось загрузить соревнования</div>
          <div className={`text-xs ${muted} mb-3 break-words`}>{error}</div>
          <button
            onClick={load}
            className="px-4 py-2 rounded-2xl text-xs font-bold"
            style={{ backgroundColor: withAlpha(accentColor, 0.16), color: accentColor }}
          >
            Повторить
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="zap-card p-12 text-center">
          <Trophy size={40} className={`mx-auto mb-3 opacity-20 ${muted}`} />
          <p className={`text-sm ${muted}`}>Нет соревнований. Добавьте первый старт кнопкой «+».</p>
        </div>
      ) : (
        <div className="space-y-3">{sorted.map(renderCard)}</div>
      )}
    </div>
  );
}
