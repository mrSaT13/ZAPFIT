import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import {
  Activity, Bike, BarChart3, Trophy, Eye, Edit2, Trash2, Check, X,
  Search, Upload, Plus, RefreshCw, Cloud, CloudOff, Footprints, Waves, Dumbbell, Mountain,
  ClipboardList,
} from 'lucide-react';
import { toast } from 'react-toastify';
import RideModal from './RideModal';
import RideAnalysis from './RideAnalysis';
import Competitions from './Competitions';
import TrainingPlan from './TrainingPlan';
import Strength from './Strength';
import { withAlpha } from '../theme';

const TYPE_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'ride', label: 'Вело' },
  { id: 'run', label: 'Бег' },
  { id: 'swim', label: 'Плава' },
  { id: 'walk', label: 'Ходьба' },
  { id: 'strength', label: 'Силовые' },
  { id: 'other', label: 'Прочее' },
];

function kindOf(ride) {
  return String(ride.type || ride.activity_type || '').toLowerCase();
}

function typeGroup(ride) {
  const k = kindOf(ride);
  if (!k) return 'other';
  if (k.includes('ride') || k.includes('bike') || k.includes('cycling') || k.includes('вело')) return 'ride';
  if (k.includes('run') || k.includes('бег')) return 'run';
  if (k.includes('swim') || k.includes('плав')) return 'swim';
  if (k.includes('walk') || k.includes('hike') || k.includes('ходь')) return 'walk';
  if (k.includes('strength') || k.includes('weight') || k.includes('gym') || k.includes('сил')) return 'strength';
  return 'other';
}

function TypeIcon({ group, size = 22, color }) {
  const props = { size, style: color ? { color } : undefined };
  switch (group) {
    case 'ride': return <Bike {...props} />;
    case 'run': return <Footprints {...props} />;
    case 'swim': return <Waves {...props} />;
    case 'walk': return <Footprints {...props} />;
    case 'strength': return <Dumbbell {...props} />;
    default: return <Activity {...props} />;
  }
}

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (_) { return ''; }
}

function fmtDur(sec) {
  const s = Number(sec) || 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

// Источник записи (parity с мобильным ActivitySource): серверный синк,
// ручной ввод или GPX/TCX-импорт. Сигнал — gpx_path + server_id.
function sourceOf(ride) {
  if (ride.server_id != null || ride.gpx_path === 'server') return 'server';
  if (ride.gpx_path === 'manual') return 'manual';
  return 'gpx';
}

const SOURCE_META = {
  gpx: { label: 'GPX', color: '#3b82f6' },
  manual: { label: 'Вручную', color: '#f59e0b' },
  server: { label: 'Сервер', color: '#10b981' },
};

const SYNC_FILTERS = [
  { id: 'all', label: 'Все статусы' },
  { id: 'synced', label: 'В облаке' },
  { id: 'local', label: 'Локальные' },
];

function isSynced(ride) {
  return ride.server_id != null;
}

export default function RideList({ theme, accentColor, onImport, onOpenManual, user }) {
    const [rides, setRides] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editingRide, setEditingRide] = useState(null);
    const [editData, setEditData] = useState({ title: '', type: 'Ride' });
    const [selectedRide, setSelectedRide] = useState(null);
    const [activeTab, setActiveTab] = useState('list');
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [syncFilter, setSyncFilter] = useState('all');

    const muted = theme === 'dark' ? 'text-gray-400' : 'text-slate-500';

    const loadRides = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.getRides();
            const arr = Array.isArray(data) ? data : [];
            arr.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
            setRides(arr);
        } catch (e) {
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRides();
        const h = ()=> loadRides();
        window.addEventListener('settings-updated', h);
        window.addEventListener('activities-updated', h);
        window.addEventListener('gears-updated', h);
        return ()=> { window.removeEventListener('settings-updated', h); window.removeEventListener('activities-updated', h); window.removeEventListener('gears-updated', h); };
    }, []);

    const filtered = useMemo(() => rides.filter((r) => {
        if (typeFilter !== 'all' && typeGroup(r) !== typeFilter) return false;
        if (syncFilter === 'synced' && !isSynced(r)) return false;
        if (syncFilter === 'local' && isSynced(r)) return false;
        if (query.trim()) {
            const q = query.trim().toLowerCase();
            const hay = `${r.title || ''} ${r.type || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    }), [rides, query, typeFilter, syncFilter]);

    const handleDelete = async (id) => {
        if(confirm('Удалить запись?')) {
            try {
                await api.deleteRide(id);
                toast.info('Активность удалена');
                loadRides();
            } catch (e) {
                toast.error('Ошибка удаления: ' + (e?.message || e));
            }
        }
    };

    const handleEditClick = (ride) => {
        setEditingRide(ride.id);
        setEditData({ title: ride.title, type: ride.type || 'Ride' });
    };

    const handleSaveEdit = async (id) => {
        if (window.electronAPI.updateRide) {
            try {
                await window.electronAPI.updateRide(id, editData);
                toast.success('Изменения сохранены');
                setEditingRide(null);
                loadRides();
            } catch (e) {
                toast.error('Ошибка сохранения: ' + (e?.message || e));
            }
        } else {
            toast.error('Функция редактирования еще не реализована в Main');
        }
    };

    const handleImport = async () => {
        try {
            toast.info('Импорт GPX...');
            const res = onImport ? await onImport() : await api.importGpx();
            if (res && res.success) { toast.success('GPX успешно загружен!'); setTimeout(loadRides, 800); }
            else if (res) toast.error('Ошибка: ' + res.error);
        } catch (e) { toast.error('Ошибка импорта'); }
    };

    const tabs = [
        { id: 'list', label: `История (${rides.length})`, icon: <Eye size={16} /> },
        { id: 'analysis', label: 'Анализ', icon: <BarChart3 size={16} /> },
        { id: 'plan', label: 'Тренировки', icon: <ClipboardList size={16} /> },
        { id: 'strength', label: 'Силовые', icon: <Dumbbell size={16} /> },
        { id: 'competitions', label: 'Соревнования', icon: <Trophy size={16} /> },
    ];

    const renderCard = (ride) => {
        const group = typeGroup(ride);
        const synced = isSynced(ride);
        const editing = editingRide === ride.id;
        const src = SOURCE_META[sourceOf(ride)];
        return (
            <div
                key={ride.id}
                className="zap-card p-4 cursor-pointer transition-transform hover:scale-[1.005]"
                onClick={() => !editing && setSelectedRide(ride)}
                title="Открыть детали"
            >
                <div className="flex gap-3 items-center">
                    <span
                        className="p-2.5 rounded-2xl shrink-0"
                        style={{ backgroundColor: withAlpha(accentColor, 0.12) }}
                    >
                        <TypeIcon group={group} color={accentColor} />
                    </span>
                    <div className="flex-1 min-w-0">
                        {editing ? (
                            <input
                                value={editData.title}
                                onChange={(e) => { e.stopPropagation(); setEditData({...editData, title: e.target.value}); }}
                                onClick={(e) => e.stopPropagation()}
                                className={`border rounded-xl px-2.5 py-1.5 text-sm outline-none w-full ${
                                    theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'
                                }`}
                            />
                        ) : (
                            <div className="font-bold truncate text-sm">{ride.title || 'Без названия'}</div>
                        )}
                        <div className={`text-xs ${muted} truncate`}>
                            {ride.type || 'Ride'} • {fmtDate(ride.date)}
                        </div>
                    </div>
                    <span
                        className="text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shrink-0"
                        style={{ backgroundColor: withAlpha(src.color, 0.12), color: src.color }}
                        title={src.label}
                    >
                        {src.label}
                    </span>
                    {synced
                        ? <Cloud size={16} className="shrink-0 opacity-60" style={{ color: accentColor }} />
                        : <CloudOff size={16} className={`shrink-0 opacity-40 ${muted}`} />}
                </div>
                <div className="px-1 pt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <div><span className="font-bold">{ride.distance ? Number(ride.distance).toFixed(1) : '0.0'}</span> <span className={`text-[11px] ${muted}`}>км</span></div>
                    <div><span className="font-bold">{fmtDur(ride.duration)}</span> <span className={`text-[11px] ${muted}`}>время</span></div>
                    {ride.avg_hr ? <div><span className="font-bold">{ride.avg_hr}</span> <span className={`text-[11px] ${muted}`}>пульс</span></div> : null}
                    {ride.tss ? <div><span className="font-bold" style={{ color: '#fb923c' }}>{Number(ride.tss).toFixed(0)}</span> <span className={`text-[11px] ${muted}`}>TSS</span></div> : null}
                </div>
                <div className="flex gap-1.5 justify-end pt-2" onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                        <>
                            <button onClick={() => handleSaveEdit(ride.id)} className="p-2 rounded-xl transition-all" style={{ backgroundColor: withAlpha('#22c55e', 0.14), color: '#22c55e' }} title="Сохранить"><Check size={16}/></button>
                            <button onClick={() => setEditingRide(null)} className={`p-2 rounded-xl transition-all ${muted} hover:bg-white/10`} title="Отмена"><X size={16}/></button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setSelectedRide(ride)} className="p-2 rounded-xl transition-all" style={{ backgroundColor: withAlpha(accentColor, 0.12), color: accentColor }} title="Открыть детали и карту"><Eye size={16}/></button>
                            <button onClick={() => handleEditClick(ride)} className="p-2 rounded-xl transition-all" style={{ backgroundColor: withAlpha('#3b82f6', 0.12), color: '#3b82f6' }} title="Переименовать"><Edit2 size={16}/></button>
                            <button onClick={() => handleDelete(ride.id)} className="p-2 rounded-xl transition-all" style={{ backgroundColor: withAlpha('#ef4444', 0.12), color: '#ef4444' }} title="Удалить"><Trash2 size={16}/></button>
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl shrink-0" style={{ backgroundColor: withAlpha(accentColor, 0.16) }}>
                    <Mountain size={22} style={{ color: accentColor }} />
                </div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold">Активности</h1>
                    <p className={`text-sm ${muted}`}>История тренировок из локальной базы</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        onClick={handleImport}
                        className="p-2.5 rounded-2xl transition-colors text-white"
                        style={{ backgroundColor: accentColor }}
                        title="Загрузить GPX"
                    >
                        <Upload size={16} />
                    </button>
                    <button
                        onClick={() => { if (onOpenManual) onOpenManual(); else toast.info('Откройте ручную форму в другом месте'); }}
                        className="p-2.5 rounded-2xl transition-colors text-white bg-amber-500 hover:bg-amber-600"
                        title="Добавить вручную"
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        onClick={loadRides}
                        className="p-2.5 rounded-2xl transition-colors"
                        style={{ backgroundColor: withAlpha(accentColor, 0.12), color: accentColor }}
                        title="Обновить"
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {tabs.map(tab => {
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold transition-all"
                            style={active ? { backgroundColor: withAlpha(accentColor, 0.16), color: accentColor } : {}}
                            onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = withAlpha(accentColor, 0.07); }}
                            onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'list' && (
                <>
                    <div className="flex items-center gap-2 zap-card px-3 py-2">
                        <Search size={16} className={`shrink-0 ${muted}`} />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Поиск по названию или типу..."
                            className="flex-1 min-w-0 bg-transparent outline-none text-sm py-1"
                        />
                        {query && (
                            <button onClick={() => setQuery('')} className={`p-1 rounded-lg ${muted} hover:opacity-70`} title="Очистить">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        {TYPE_FILTERS.map(f => {
                            const active = typeFilter === f.id;
                            return (
                                <button
                                    key={f.id}
                                    onClick={() => setTypeFilter(f.id)}
                                    className="px-3 py-1.5 rounded-2xl text-xs font-semibold transition-all"
                                    style={active ? { backgroundColor: withAlpha(accentColor, 0.16), color: accentColor } : {}}
                                >
                                    {f.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap gap-1.5 items-center">
                        <Cloud size={13} className={muted} />
                        {SYNC_FILTERS.map(f => {
                            const active = syncFilter === f.id;
                            return (
                                <button
                                    key={f.id}
                                    onClick={() => setSyncFilter(f.id)}
                                    className="px-3 py-1.5 rounded-2xl text-xs font-semibold transition-all"
                                    style={active ? { backgroundColor: withAlpha(accentColor, 0.16), color: accentColor } : {}}
                                >
                                    {f.label}
                                </button>
                            );
                        })}
                    </div>

                    {loading ? (
                        <div className={`p-8 text-center text-sm ${muted}`}>Загрузка...</div>
                    ) : error && rides.length === 0 ? (
                        <div className="zap-card p-4 text-sm" style={{ borderColor: withAlpha('#f59e0b', 0.4), backgroundColor: withAlpha('#f59e0b', 0.08) }}>
                            <div className="font-bold mb-1">Не удалось загрузить активности</div>
                            <div className={`text-xs ${muted} mb-3 break-words`}>{error}</div>
                            <button
                                onClick={loadRides}
                                className="px-4 py-2 rounded-2xl text-xs font-bold"
                                style={{ backgroundColor: withAlpha(accentColor, 0.16), color: accentColor }}
                            >
                                Повторить
                            </button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="zap-card p-12 text-center text-sm" style={{ opacity: 0.6 }}>
                            {rides.length === 0
                                ? 'Активностей пока нет. Загрузите GPX или добавьте вручную.'
                                : 'Ничего не найдено. Измените поиск или фильтр.'}
                        </div>
                    ) : (
                        <div className="space-y-3">{filtered.map(renderCard)}</div>
                    )}
                </>
            )}

            {activeTab === 'analysis' && (
                <div className="zap-card p-4">
                    <RideAnalysis theme={theme} accentColor={accentColor} user={user} />
                </div>
            )}

            {activeTab === 'plan' && (
                <TrainingPlan theme={theme} accentColor={accentColor} user={user} embedded />
            )}

            {activeTab === 'strength' && (
                <Strength theme={theme} accentColor={accentColor} embedded />
            )}

            {activeTab === 'competitions' && (
                <div className="zap-card p-4">
                    <Competitions theme={theme} accentColor={accentColor} embedded />
                </div>
            )}

            {selectedRide && (
                <RideModal
                    ride={selectedRide}
                    onClose={() => setSelectedRide(null)}
                    theme={theme}
                />
            )}
        </div>
    );
}
