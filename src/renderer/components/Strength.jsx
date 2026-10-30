import React, { useState, useEffect } from 'react';
import { Dumbbell, Plus, Trash2, Search, Play, Info, Languages, X, ChevronDown, ChevronRight, CalendarDays, History, ClipboardList, BookOpen } from 'lucide-react';
import { withAlpha } from '../theme';

const api = () => (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;

function catalogName(ex, lang) {
  const l = (lang || 'ru').split('-')[0];
  return ex.translations?.[l]?.name || ex.translations?.en?.name || ex.name;
}

function catalogDescription(ex, lang) {
  const l = (lang || 'ru').split('-')[0];
  const own = (ex.translations?.[l]?.description || '').trim();
  const en = (ex.translations?.en?.description || '').trim();
  const text = own || en;
  if (!text) return null;
  const plain = text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text: plain, fellBack: l !== 'en' && !own };
}

export default function Strength({ theme, accentColor, embedded = false }) {
  const [tab, setTab] = useState('plans');
  const [plans, setPlans] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Plan editor draft
  const [draftName, setDraftName] = useState('');
  const [draftRows, setDraftRows] = useState([]);
  const [saving, setSaving] = useState(false);

  // Catalog picker
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [openPlanId, setOpenPlanId] = useState(null);
  const [transCache, setTransCache] = useState({});
  const [translating, setTranslating] = useState(null);

  // Session dialog
  const [sessionPlan, setSessionPlan] = useState(null);
  const [sessionRows, setSessionRows] = useState([]);
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split('T')[0]);

  const muted = theme === 'dark' ? 'text-gray-400' : 'text-slate-500';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const a = api();
      if (!a?.zapfitGetWorkoutPlans) {
        setError('Нет связи с приложением (IPC). Перезапустите ZAPFIT.');
        return;
      }
      const p = await a.zapfitGetWorkoutPlans();
      if (p?.success) {
        setPlans(Array.isArray(p.plans) ? p.plans : []);
      } else {
        const raw = p?.error || 'Не удалось загрузить планы';
        setError(/401|unauthorized|expired|не авторизован/i.test(raw)
          ? 'Сессия истекла (401). Войдите заново: Настройки → ZAPFIT.'
          : raw);
      }
      try {
        const s = await a.zapfitGetWorkoutSessions?.({});
        if (s?.success) setSessions(Array.isArray(s.sessions) ? s.sessions.slice(0, 20) : []);
      } catch (_) {}
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runSearch = async () => {
    const a = api();
    if (!a?.zapfitSearchWorkoutCatalog) return;
    setSearching(true);
    try {
      const r = await a.zapfitSearchWorkoutCatalog(query, { lang: 'ru', limit: 30 });
      if (r?.success) setResults(r.records || []);
      else setResults([]);
    } catch (_) {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => { if (tab === 'catalog') runSearch(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const translateEx = async (wgerId) => {
    const a = api();
    if (!a?.zapfitTranslateCatalogExercise || translating) return;
    setTranslating(wgerId);
    try {
      const r = await a.zapfitTranslateCatalogExercise(wgerId, 'ru');
      if (r?.success && r.translation?.description) {
        setTransCache((c) => ({ ...c, [wgerId]: r.translation }));
      }
    } catch (_) {} finally {
      setTranslating(null);
    }
  };

  const addToDraft = (ex) => {
    setDraftRows((rows) => ([
      ...rows,
      {
        wger_exercise_id: ex.wger_id,
        name: catalogName(ex, 'ru'),
        muscle_group: ex.category?.name || null,
        target_sets: '3',
        target_reps: '10',
        target_weight_kg: '',
        rest_s: '90',
      },
    ]));
  };

  const savePlan = async () => {
    const a = api();
    if (!draftName.trim() || !draftRows.length || saving) return;
    setSaving(true);
    try {
      const body = {
        name: draftName.trim(),
        description: null,
        exercises: draftRows.map((r, i) => ({
          position: i,
          day_label: null,
          name: r.name,
          muscle_group: r.muscle_group,
          wger_exercise_id: r.wger_exercise_id,
          notes: null,
          target_sets: r.target_sets ? Number(r.target_sets) : null,
          target_reps: r.target_reps?.trim() || null,
          target_weight_kg: r.target_weight_kg !== '' ? Number(r.target_weight_kg) : null,
          rest_s: r.rest_s !== '' ? Number(r.rest_s) : null,
        })),
      };
      const res = await a.zapfitCreateWorkoutPlan(body);
      if (res?.success) {
        setDraftName('');
        setDraftRows([]);
        load();
      } else {
        setError(res?.error || 'Не удалось сохранить план');
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async (id) => {
    if (!confirm('Удалить план?')) return;
    try {
      const res = await api()?.zapfitDeleteWorkoutPlan(id);
      if (res?.success) load();
      else setError(res?.error || 'Не удалось удалить');
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const openSession = (plan) => {
    setSessionPlan(plan);
    setSessionRows((plan.exercises || []).map((e) => ({
      exercise_name: e.name,
      wger_exercise_id: e.wger_exercise_id ?? null,
      sets: String(e.target_sets ?? 3),
      reps: String(e.target_reps ?? 10).replace(/[^0-9]/g, '') || '10',
      weight: e.target_weight_kg != null ? String(e.target_weight_kg) : '',
    })));
    setSessionDate(new Date().toISOString().split('T')[0]);
  };

  const saveSession = async () => {
    const a = api();
    if (!sessionPlan) return;
    const sets = [];
    sessionRows.forEach((r) => {
      const n = Math.max(1, Number(r.sets) || 1);
      for (let i = 1; i <= n; i++) {
        sets.push({
          exercise_name: r.exercise_name,
          wger_exercise_id: r.wger_exercise_id,
          set_no: i,
          weight_kg: r.weight !== '' ? Number(r.weight) : null,
          reps: r.reps !== '' ? Number(r.reps) : null,
          rpe: null,
          completed: true,
        });
      }
    });
    try {
      const res = await a.zapfitCreateWorkoutSession({
        date: sessionDate,
        plan_id: sessionPlan.id,
        duration_min: null,
        calories: null,
        comment: null,
        sets,
      });
      if (res?.success) {
        setSessionPlan(null);
        load();
      } else {
        setError(res?.error || 'Не удалось записать сессию');
      }
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const tabs = [
    { id: 'plans', label: 'Планы', Icon: ClipboardList },
    { id: 'catalog', label: 'Каталог', Icon: BookOpen },
    { id: 'journal', label: 'Журнал', Icon: History },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {!embedded && (
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl shrink-0" style={{ backgroundColor: withAlpha(accentColor, 0.16) }}>
          <Dumbbell size={22} style={{ color: accentColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent ${theme === 'dark' ? 'from-white to-gray-400' : 'from-slate-900 to-slate-500'}`}>Силовые</h1>
          <p className={`text-sm ${muted}`}>Планы, каталог 914 и журнал сессий</p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 rounded-2xl text-sm font-semibold shrink-0"
          style={{ backgroundColor: withAlpha(accentColor, 0.12), color: accentColor }}
        >
          Обновить
        </button>
      </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const active = tab === t.id;
          const TabIcon = t.Icon;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id === 'catalog' && !results.length) runSearch(); }}
              className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-all flex items-center gap-2 ${active ? 'shadow-sm' : muted}`}
              style={active ? { backgroundColor: withAlpha(accentColor, 0.16), color: accentColor } : {}}
            >
              <TabIcon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="zap-card p-4 text-sm" style={{ borderColor: withAlpha('#f59e0b', 0.4), backgroundColor: withAlpha('#f59e0b', 0.08) }}>
          <div className="font-bold mb-1">Сервер недоступен</div>
          <div className={`text-xs ${muted} mb-3 break-words`}>{error}</div>
          <button onClick={load} className="px-4 py-2 rounded-2xl text-xs font-bold" style={{ backgroundColor: withAlpha(accentColor, 0.16), color: accentColor }}>
            Повторить
          </button>
        </div>
      )}

      {loading ? (
        <div className={`p-8 text-center ${muted} text-sm`}>Загрузка...</div>
      ) : tab === 'plans' ? (
        <div className="space-y-3">
          {/* Editor */}
          <div className="zap-card p-4">
            <div className="font-bold text-sm mb-2">Новый план</div>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Название плана"
              className={`w-full px-3 py-2 rounded-xl border text-sm mb-2 outline-none ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
            />
            {draftRows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 py-1.5 border-t border-white/5">
                <span className="flex-1 min-w-[120px] text-sm truncate">{r.name}</span>
                <input value={r.target_sets} onChange={(e) => setDraftRows((rows) => rows.map((x, j) => (j === i ? { ...x, target_sets: e.target.value } : x)))} placeholder="Подх" className={`w-14 px-2 py-1 rounded-lg border text-xs ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'}`} />
                <input value={r.target_reps} onChange={(e) => setDraftRows((rows) => rows.map((x, j) => (j === i ? { ...x, target_reps: e.target.value } : x)))} placeholder="Повт" className={`w-14 px-2 py-1 rounded-lg border text-xs ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'}`} />
                <input value={r.target_weight_kg} onChange={(e) => setDraftRows((rows) => rows.map((x, j) => (j === i ? { ...x, target_weight_kg: e.target.value } : x)))} placeholder="кг" className={`w-14 px-2 py-1 rounded-lg border text-xs ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'}`} />
                <button onClick={() => setDraftRows((rows) => rows.filter((_, j) => j !== i))} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <button onClick={() => setTab('catalog')} className="px-3 py-2 rounded-xl text-xs font-semibold hover:bg-white/10 flex items-center gap-1.5">
                <Plus size={14} /> Добавить из каталога
              </button>
              <button
                onClick={savePlan}
                disabled={!draftName.trim() || !draftRows.length || saving}
                className="px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                style={{ backgroundColor: withAlpha(accentColor, 0.16), color: accentColor }}
              >
                {saving ? 'Сохранение...' : 'Сохранить план'}
              </button>
            </div>
          </div>
          {/* List */}
          {plans.length === 0 && <div className="zap-card p-8 text-center text-sm" style={{ opacity: 0.6 }}>Нет планов. Соберите первый из каталога.</div>}
          {plans.map((p) => {
            const open = openPlanId === p.id;
            return (
            <div key={p.id} className="zap-card p-4">
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setOpenPlanId(open ? null : p.id)}
                title={open ? 'Свернуть' : 'Показать упражнения'}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{p.name}</div>
                  <div className={`text-xs ${muted}`}>{(p.exercises || []).length} упр.</div>
                </div>
                {open ? <ChevronDown size={16} className="shrink-0 opacity-60" /> : <ChevronRight size={16} className="shrink-0 opacity-60" />}
                <button onClick={(e) => { e.stopPropagation(); openSession(p); }} title="Записать сессию" className="p-2 rounded-xl hover:bg-white/10" style={{ color: accentColor }}>
                  <Play size={16} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); deletePlan(p.id); }} title="Удалить" className="p-2 rounded-xl text-red-400 hover:bg-red-500/10">
                  <Trash2 size={16} />
                </button>
              </div>
              {!open ? (
                <div className={`text-xs ${muted} mt-1 truncate`}>
                  {(p.exercises || []).map((e) => e.name).join(' • ')}
                </div>
              ) : (
                <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                  {(p.exercises || []).map((e, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-xs opacity-70">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold break-words">{e.name}</div>
                        <div className={`text-xs ${muted}`}>
                          {[e.target_sets ? `${e.target_sets} подх.` : null, e.target_reps ? `× ${e.target_reps}` : null, e.target_weight_kg != null && e.target_weight_kg !== '' ? `${e.target_weight_kg} кг` : null, e.rest_s ? `отдых ${e.rest_s} c` : null].filter(Boolean).join(' • ') || 'без нормативов'}
                        </div>
                        {e.muscle_group && <div className={`text-xs ${muted} opacity-70`}>{e.muscle_group}</div>}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => openSession(p)}
                    className="w-full mt-1 px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
                    style={{ backgroundColor: withAlpha(accentColor, 0.16), color: accentColor }}
                  >
                    <Play size={14} /> Записать сессию
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      ) : tab === 'catalog' ? (
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск упражнения (жим, squat...)"
              className={`w-full pl-9 pr-3 py-2.5 rounded-2xl border text-sm outline-none ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
            />
          </div>
          {searching && <div className={`text-xs ${muted}`}>Поиск...</div>}
          {results.map((ex) => {
            const desc = catalogDescription(ex, 'ru');
            const tr = transCache[ex.wger_id];
            const shownDesc = tr?.description || desc?.text;
            const shownTip = tr?.tip || (ex.tips?.ru?.[0] ?? ex.tips?.en?.[0]);
            const hasRu = Boolean((ex.translations?.ru?.description || '').trim());
            return (
              <div key={ex.wger_id} className="zap-card overflow-hidden">
                <div className="p-3 flex items-center gap-2">
                  <button onClick={() => addToDraft(ex)} title="В план" className="p-2 rounded-xl shrink-0" style={{ backgroundColor: withAlpha(accentColor, 0.12), color: accentColor }}>
                    <Plus size={16} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{catalogName(ex, 'ru')}</div>
                    <div className={`text-[11px] ${muted} truncate`}>
                      {[ex.category?.name, (ex.muscles || []).map((m) => m.name).join(', ')].filter(Boolean).join(' • ')}
                    </div>
                  </div>
                  <button onClick={() => setExpandedId(expandedId === ex.wger_id ? null : ex.wger_id)} className="p-2 rounded-xl hover:bg-white/10">
                    {expandedId === ex.wger_id ? <ChevronDown size={16} /> : <Info size={16} />}
                  </button>
                </div>
                {expandedId === ex.wger_id && (
                  <div className="px-3 pb-3">
                    {shownDesc ? (
                      <p className="text-xs whitespace-pre-line leading-relaxed">{shownDesc}</p>
                    ) : (
                      <p className={`text-xs ${muted}`}>Без описания</p>
                    )}
                    {!hasRu && !tr && shownDesc && <p className={`text-[11px] ${muted} italic mt-1`}>Показано на английском</p>}
                    {shownTip && <p className="text-xs mt-1 opacity-80">{shownTip}</p>}
                    {!hasRu && !tr && shownDesc && (
                      <button
                        onClick={() => translateEx(ex.wger_id)}
                        disabled={translating === ex.wger_id}
                        className="mt-2 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 hover:bg-white/10 disabled:opacity-50"
                      >
                        <Languages size={14} />
                        {translating === ex.wger_id ? 'Перевожу...' : 'Перевести на русский'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!searching && !results.length && <div className="zap-card p-8 text-center text-sm" style={{ opacity: 0.6 }}>Ничего не найдено</div>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <CalendarDays size={16} style={{ color: accentColor }} />
            Последние сессии
          </div>
          {sessions.length === 0 && <div className="zap-card p-8 text-center text-sm" style={{ opacity: 0.6 }}>Журнал пуст. Откройте план и нажмите «Записать сессию».</div>}
          {sessions.map((s) => (
            <div key={s.id} className="zap-card p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{s.date} — {s.sets?.length || 0} подходов</div>
                  <div className={`text-[11px] ${muted} truncate`}>{s.comment || `${s.duration_min ?? '—'} мин • ${s.calories ?? '—'} ккал`}</div>
                </div>
                <button onClick={async () => { try { await api()?.zapfitDeleteWorkoutSession(s.id); load(); } catch (_) {} }} className="p-2 rounded-xl text-red-400 hover:bg-red-500/10">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Session dialog */}
      {sessionPlan && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSessionPlan(null)}>
          <div className="zap-card max-w-lg w-full max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{sessionPlan.name}</div>
                <div className={`text-xs ${muted}`}>Запись сессии</div>
              </div>
              <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className={`px-2 py-1.5 rounded-xl border text-xs ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'}`} />
              <button onClick={() => setSessionPlan(null)} className="p-2 rounded-xl hover:bg-white/10"><X size={16} /></button>
            </div>
            {sessionRows.map((r, i) => (
              <div key={i} className="py-2 border-t border-white/5">
                <div className="text-sm font-semibold truncate mb-1">{r.exercise_name}</div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-[11px]">Подходы<input value={r.sets} onChange={(e) => setSessionRows((rows) => rows.map((x, j) => (j === i ? { ...x, sets: e.target.value } : x)))} className={`w-full mt-0.5 px-2 py-1.5 rounded-lg border text-xs ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'}`} /></label>
                  <label className="text-[11px]">Повторы<input value={r.reps} onChange={(e) => setSessionRows((rows) => rows.map((x, j) => (j === i ? { ...x, reps: e.target.value } : x)))} className={`w-full mt-0.5 px-2 py-1.5 rounded-lg border text-xs ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'}`} /></label>
                  <label className="text-[11px]">Вес, кг<input value={r.weight} onChange={(e) => setSessionRows((rows) => rows.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))} className={`w-full mt-0.5 px-2 py-1.5 rounded-lg border text-xs ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'}`} /></label>
                </div>
              </div>
            ))}
            <button onClick={saveSession} className="w-full mt-3 py-2.5 rounded-2xl text-sm font-bold" style={{ backgroundColor: withAlpha(accentColor, 0.16), color: accentColor }}>
              Сохранить сессию
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
