import React, { useState, useEffect } from 'react';
import { Target, Plus, Trash2, CheckCircle2, Circle, ChevronDown, ChevronUp, Bike, Timer, CalendarDays, Zap, Scale, Sparkles, Cloud, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';

const SRV_INTERVAL = { daily: 'День', weekly: 'Неделя', monthly: 'Месяц', yearly: 'Год' };
const SRV_ACTIVITY = { run: 'Бег', bike: 'Вело', swim: 'Плавание', walk: 'Ходьба', strength: 'Силовые', cardio: 'Кардио' };
const SRV_GOALTYPE = { calories: 'Калории', activities: 'Тренировки', distance: 'Дистанция', elevation: 'Набор высоты', duration: 'Время' };

function srvTarget(g) {
    if (g.goal_type === 'distance') return `${((g.goal_distance || 0) / 1000).toFixed(g.goal_distance >= 10000 ? 0 : 1)} км`;
    if (g.goal_type === 'activities') return `${g.goal_activities_number || 0} тр.`;
    if (g.goal_type === 'calories') return `${g.goal_calories || 0} ккал`;
    if (g.goal_type === 'elevation') return `${g.goal_elevation || 0} м`;
    if (g.goal_type === 'duration') { const s = g.goal_duration || 0; return s >= 3600 ? `${(s / 3600).toFixed(1)} ч` : `${Math.round(s / 60)} мин`; }
    return '';
}

export default function GoalSetting({ theme, accentColor }) {
    const [expanded, setExpanded] = useState(false);
    const [goals, setGoals] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        goal_type: 'distance',
        target_value: '',
        unit: 'км',
        target_date: ''
    });

    const goalTypes = [
        { id: 'distance', label: 'Расстояние', unit: 'км', Icon: Bike },
        { id: 'duration', label: 'Время тренировок', unit: 'часов', Icon: Timer },
        { id: 'frequency', label: 'Частота тренировок', unit: 'дней', Icon: CalendarDays },
        { id: 'fitness', label: 'CTL', unit: 'TSS', Icon: Zap },
        { id: 'weight', label: 'Вес', unit: 'кг', Icon: Scale },
        { id: 'custom', label: 'Своя цель', unit: '', Icon: Sparkles }
    ];

    useEffect(() => {
        loadGoals();
        const h = () => { if (expanded) loadServerGoals(); };
        window.addEventListener('activities-updated', h);
        return () => window.removeEventListener('activities-updated', h);
    }, []);

    useEffect(() => { if (expanded) loadServerGoals(); }, [expanded]);

    // --- Серверные цели ZAPFIT (interval × activity × goal_type + /results) ---
    const [serverGoals, setServerGoals] = useState([]);
    const [serverProgress, setServerProgress] = useState({});
    const [serverOn, setServerOn] = useState(false);
    const [serverLoading, setServerLoading] = useState(false);
    const [showServerForm, setShowServerForm] = useState(false);
    const [serverForm, setServerForm] = useState({ interval: 'weekly', activity_type: 'bike', goal_type: 'distance', value: '' });

    const loadServerGoals = async () => {
        const api = window.electronAPI;
        if (!api?.zapfitGetGoals) return;
        try {
            const st = await api.zapfitStatus?.();
            if (!st?.authenticated) { setServerOn(false); return; }
            setServerOn(true);
            setServerLoading(true);
            const [g, p] = await Promise.all([
                api.zapfitGetGoals().catch(() => ({ success: false })),
                api.zapfitGetGoalsProgress ? api.zapfitGetGoalsProgress().catch(() => ({ success: false })) : { success: false },
            ]);
            const list = g?.success ? (Array.isArray(g.data) ? g.data : []) : [];
            setServerGoals(list);
            const pm = {};
            const parr = p?.success ? (Array.isArray(p.data) ? p.data : []) : [];
            parr.forEach(r => { if (r?.goal_id != null) pm[r.goal_id] = r; });
            setServerProgress(pm);
        } catch (err) { console.error('server goals', err); }
        finally { setServerLoading(false); }
    };

    const handleCreateServerGoal = async (e) => {
        e.preventDefault();
        const v = parseFloat(serverForm.value);
        if (!v || v <= 0) { toast.warn('Введите целевое значение'); return; }
        const body = { interval: serverForm.interval, activity_type: serverForm.activity_type, goal_type: serverForm.goal_type };
        if (serverForm.goal_type === 'distance') body.goal_distance = Math.round(v * 1000);
        else if (serverForm.goal_type === 'activities') body.goal_activities_number = Math.round(v);
        else if (serverForm.goal_type === 'calories') body.goal_calories = Math.round(v);
        else if (serverForm.goal_type === 'elevation') body.goal_elevation = Math.round(v);
        else if (serverForm.goal_type === 'duration') body.goal_duration = Math.round(v * 60);
        try {
            const r = await window.electronAPI.zapfitCreateGoal(body);
            if (r?.success) { toast.success('Цель создана на сервере'); setServerForm(f => ({ ...f, value: '' })); setShowServerForm(false); loadServerGoals(); }
            else toast.error(r?.error || 'Ошибка создания');
        } catch (err) { toast.error(err.message); }
    };

    const handleDeleteServerGoal = async (id) => {
        if (!window.confirm('Удалить цель на сервере?')) return;
        try {
            const r = await window.electronAPI.zapfitDeleteGoal(id);
            if (r?.success) { toast.info('Удалена'); loadServerGoals(); }
            else toast.error(r?.error || 'Ошибка');
        } catch (err) { toast.error(err.message); }
    };

    const loadGoals = async () => {
        const api = window.electronAPI;
        if (api?.query) {
            try {
                const data = await api.query('SELECT * FROM goals WHERE status = "active" ORDER BY created_at DESC');
                setGoals(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error('Failed to load goals:', err);
                setGoals([]);
            }
        } else {
            setGoals([]);
        }
        setLoading(false);
    };

    const handleAddGoal = async (e) => {
        e.preventDefault();
        if (!formData.title || !formData.target_value) {
            alert('Заполните все поля');
            return;
        }

        const api = window.electronAPI;
        if (api?.run) {
            try {
                const startDate = new Date().toISOString().split('T')[0];
                const result = await api.run(
                    `INSERT INTO goals (title, description, goal_type, target_value, unit, start_date, target_date, status, progress_percent)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 0)`,
                    [
                        formData.title,
                        formData.description,
                        formData.goal_type,
                        parseFloat(formData.target_value),
                        formData.unit,
                        startDate,
                        formData.target_date
                    ]
                );
                
                if (result?.success || result?.changes > 0) {
                    alert('Цель создана!');
                    setFormData({
                        title: '',
                        description: '',
                        goal_type: 'distance',
                        target_value: '',
                        unit: 'км',
                        target_date: ''
                    });
                    setShowForm(false);
                    loadGoals();
                }
            } catch (err) {
                console.error('Failed to create goal:', err);
                alert('Ошибка при создании цели');
            }
        }
    };

    const handleDeleteGoal = async (goalId) => {
        if (!window.confirm('Удалить эту цель?')) return;

        const api = window.electronAPI;
        if (api?.run) {
            try {
                await api.run('DELETE FROM goals WHERE id = ?', [goalId]);
                loadGoals();
            } catch (err) {
                console.error('Failed to delete goal:', err);
            }
        }
    };

    const calculateProgress = (goal) => {
        const startDate = new Date(goal.start_date);
        const endDate = new Date(goal.target_date);
        const now = new Date();
        
        const totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
        const elapsedDays = (now - startDate) / (1000 * 60 * 60 * 24);
        const timeProgress = Math.min(100, (elapsedDays / totalDays) * 100);
        
        return Math.max(timeProgress, goal.progress_percent || 0);
    };

    const getDaysLeft = (targetDate) => {
        const days = Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24));
        return days > 0 ? days : 0;
    };

    const selectedGoalType = goalTypes.find(t => t.id === formData.goal_type);
    const titleClass = theme === 'dark' ? 'text-white' : 'text-slate-900';
    const labelClass = theme === 'dark' ? 'text-gray-300' : 'text-slate-600';
    const inputClass = theme === 'dark' ? 'bg-white/5 border-white/10 text-white placeholder-slate-500' : 'bg-slate-100 border-slate-200 text-slate-900 placeholder-slate-400';

    return (
        <div className={`${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'} border rounded-2xl transition-all`}>
            {/* Header */}
            <div 
                onClick={() => setExpanded(!expanded)}
                className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center justify-between">
                    <h3 className={`text-lg font-bold ${titleClass} flex items-center gap-2`}>
                        <Target size={20} style={{ color: accentColor }} />
                        SMART Цели
                    </h3>
                    {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
                <p className={theme === 'dark' ? 'text-gray-400 text-sm mt-1' : 'text-slate-500 text-sm mt-1'}>
                    {serverOn ? `${serverGoals.length} на сервере · ` : ''}{goals.length} локальная цель{goals.length !== 1 ? 'и' : ''}
                </p>
            </div>

            {/* Content */}
            {expanded && (
                <div className="border-t border-white/10">
                    {/* Серверные цели */}
                    <div className="p-4 border-b border-white/10">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className={`text-sm font-bold flex items-center gap-1.5 ${labelClass}`}>
                                <Cloud size={15} style={{ color: accentColor }} />
                                Цели ZAPFIT {serverLoading && <RefreshCw size={13} className="animate-spin" />}
                            </h4>
                            {serverOn && !showServerForm && (
                                <button onClick={() => setShowServerForm(true)} className="text-xs font-bold flex items-center gap-1" style={{ color: accentColor }}>
                                    <Plus size={13} /> На сервер
                                </button>
                            )}
                        </div>
                        {!serverOn ? (
                            <p className="text-xs text-gray-500">Подключите сервер в Настройках — цели будут общие с мобильным и вебом.</p>
                        ) : serverGoals.length === 0 && !showServerForm ? (
                            <p className="text-xs text-gray-500">На сервере целей нет. Создайте первую — прогресс считается сервером.</p>
                        ) : (
                            <div className="space-y-2">
                                {serverGoals.map(g => {
                                    const pr = serverProgress[g.id] || {};
                                    const pct = Math.min(100, Math.max(0, pr.percentage_completed ?? 0));
                                    const done = g.goal_type === 'distance'
                                        ? `${((pr.total_distance || 0) / 1000).toFixed(1)} / ${((g.goal_distance || 0) / 1000).toFixed(1)} км`
                                        : g.goal_type === 'activities'
                                            ? `${pr.total_activities_number || 0} / ${g.goal_activities_number || 0}`
                                            : `${pct}%`;
                                    return (
                                        <div key={g.id} className={`${theme === 'dark' ? 'bg-black/20' : 'bg-slate-50 border border-slate-200'} rounded-xl p-3 flex items-center gap-3`}>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-sm font-bold ${titleClass} truncate`}>
                                                    {SRV_ACTIVITY[g.activity_type] || g.activity_type} · {SRV_GOALTYPE[g.goal_type] || g.goal_type}
                                                    <span className="font-normal text-gray-500"> · {SRV_INTERVAL[g.interval] || g.interval}</span>
                                                </div>
                                                <div className="mt-1.5 w-full h-2 bg-gray-700/40 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: accentColor }} />
                                                </div>
                                                <div className="mt-1 text-[11px] text-gray-500">{done} · цель {srvTarget(g)}</div>
                                            </div>
                                            <span className="text-sm font-bold shrink-0" style={{ color: accentColor }}>{pct}%</span>
                                            <button onClick={() => handleDeleteServerGoal(g.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 shrink-0" title="Удалить">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {showServerForm && (
                            <form onSubmit={handleCreateServerGoal} className="mt-3 space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                    <select value={serverForm.interval} onChange={(e) => setServerForm({ ...serverForm, interval: e.target.value })} className={`px-2 py-2 border rounded-lg text-xs focus:outline-none ${inputClass}`}>
                                        <option value="daily">День</option>
                                        <option value="weekly">Неделя</option>
                                        <option value="monthly">Месяц</option>
                                        <option value="yearly">Год</option>
                                    </select>
                                    <select value={serverForm.activity_type} onChange={(e) => setServerForm({ ...serverForm, activity_type: e.target.value })} className={`px-2 py-2 border rounded-lg text-xs focus:outline-none ${inputClass}`}>
                                        <option value="run">Бег</option>
                                        <option value="bike">Вело</option>
                                        <option value="swim">Плавание</option>
                                        <option value="walk">Ходьба</option>
                                        <option value="strength">Силовые</option>
                                        <option value="cardio">Кардио</option>
                                    </select>
                                    <select value={serverForm.goal_type} onChange={(e) => setServerForm({ ...serverForm, goal_type: e.target.value })} className={`px-2 py-2 border rounded-lg text-xs focus:outline-none ${inputClass}`}>
                                        <option value="distance">Дистанция (км)</option>
                                        <option value="activities">Тренировки</option>
                                        <option value="calories">Ккал</option>
                                        <option value="elevation">Набор (м)</option>
                                        <option value="duration">Время (мин)</option>
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <input type="number" value={serverForm.value} onChange={(e) => setServerForm({ ...serverForm, value: e.target.value })} placeholder="Цель" className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none ${inputClass}`} />
                                    <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: accentColor }}>OK</button>
                                    <button type="button" onClick={() => setShowServerForm(false)} className={`px-3 py-2 rounded-lg text-sm ${labelClass}`}>Отмена</button>
                                </div>
                            </form>
                        )}
                    </div>
                    <div className="px-4 pt-2">
                        <h4 className={`text-xs font-bold ${labelClass}`}>Локальные SMART-цели</h4>
                    </div>
                    {/* Add Goal Form */}
                    {showForm && (
                        <div className="p-4 border-b border-white/10 bg-white/5">
                            <form onSubmit={handleAddGoal} className="space-y-3">
                                <div>
                                    <label className={`text-sm font-semibold ${labelClass}`}>Название цели *</label>
                                    <input
                                        type="text"
                                        value={formData.title}
                                        onChange={(e) => setFormData({...formData, title: e.target.value})}
                                        className={`w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:border-white/20 ${inputClass}`}
                                        placeholder="Например: Проехать 500 км"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={`text-sm font-semibold ${labelClass}`}>Тип цели *</label>
                                        <select
                                            value={formData.goal_type}
                                            onChange={(e) => {
                                                const gt = goalTypes.find(t => t.id === e.target.value);
                                                setFormData({...formData, goal_type: e.target.value, unit: gt?.unit || ''});
                                            }}
                                            className={`w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none ${inputClass}`}
                                        >
                                            {goalTypes.map(t => (
                                                <option key={t.id} value={t.id}>{t.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={`text-sm font-semibold ${labelClass}`}>Целевое значение *</label>
                                        <div className="flex gap-2 mt-1">
                                            <input
                                                type="number"
                                                value={formData.target_value}
                                                onChange={(e) => setFormData({...formData, target_value: e.target.value})}
                                                className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none ${inputClass}`}
                                                placeholder="100"
                                            />
                                            <input
                                                type="text"
                                                value={formData.unit}
                                                onChange={(e) => setFormData({...formData, unit: e.target.value})}
                                                className={`w-20 px-3 py-2 border rounded-lg focus:outline-none ${inputClass}`}
                                                placeholder="км"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className={`text-sm font-semibold ${labelClass}`}>Описание</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                                        className={`w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none resize-none ${inputClass}`}
                                        rows="2"
                                        placeholder="Опишите вашу цель..."
                                    />
                                </div>

                                <div>
                                    <label className={`text-sm font-semibold ${labelClass}`}>Достичь до *</label>
                                    <input
                                        type="date"
                                        value={formData.target_date}
                                        onChange={(e) => setFormData({...formData, target_date: e.target.value})}
                                        className={`w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none ${inputClass}`}
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        className="flex-1 py-2 rounded-lg font-semibold transition-all"
                                        style={{ backgroundColor: accentColor, color: 'white' }}
                                    >
                                        Создать цель
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowForm(false)}
                                        className={`flex-1 py-2 rounded-lg font-semibold ${theme === 'dark' ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'}`}
                                    >
                                        Отмена
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Goals List */}
                    {loading ? (
                        <div className={`p-4 text-center ${theme === 'dark' ? 'text-gray-400' : 'text-slate-500'}`}>Загрузка...</div>
                    ) : goals.length === 0 ? (
                        <div className="p-6 text-center">
                            <p className="text-gray-500">Нет активных целей</p>
                            {!showForm && (
                                <button
                                    onClick={() => setShowForm(true)}
                                    className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all"
                                    style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                                >
                                    <Plus size={16} />
                                    Добавить первую цель
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y divide-white/10">
                            {goals.map((goal) => {
                                const progress = calculateProgress(goal);
                                const daysLeft = getDaysLeft(goal.target_date);
                                const gType = goalTypes.find(t => t.id === goal.goal_type);
                                
                                return (
                                    <div key={goal.id} className="p-4 hover:bg-white/5 transition-colors">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <h4 className={`font-semibold ${titleClass}`}>{goal.title}</h4>
                                                {goal.description && (
                                                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-slate-600'} mt-1`}>{goal.description}</p>
                                                )}
                                                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                                                    {gType?.Icon && <gType.Icon size={13} />}
                                                    {gType?.label}
                                                </p>

                                                {/* Progress Bar */}
                                                <div className="mt-3 space-y-1">
                                                    <div className="flex justify-between items-center">
                                                        <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-slate-600'}`}>
                                                            {goal.current_value || 0} / {goal.target_value} {goal.unit}
                                                        </span>
                                                        <span className="text-xs font-semibold" style={{ color: accentColor }}>
                                                            {Math.round(progress)}%
                                                        </span>
                                                    </div>
                                                    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full transition-all"
                                                            style={{
                                                                backgroundColor: accentColor,
                                                                width: `${progress}%`
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Days left */}
                                                <p className="text-xs text-gray-500 mt-2">
                                                    {daysLeft} дней осталось
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => handleDeleteGoal(goal.id)}
                                                className="p-2 hover:bg-red-500/10 rounded-lg text-red-400 transition-colors flex-shrink-0"
                                                title="Удалить цель"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Add Goal Button */}
                    {!showForm && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="w-full p-3 border-t border-white/10 hover:bg-white/5 transition-colors flex items-center justify-center gap-2 text-sm font-semibold"
                            style={{ color: accentColor }}
                        >
                            <Plus size={16} />
                            Добавить новую цель
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
