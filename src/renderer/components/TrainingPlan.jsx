import React, { useState, useEffect } from 'react';
import { Target, Zap, Trophy, Flame, ChevronRight, CheckCircle2, Plus, Trash2, TrendingUp, TrendingDown, Moon, Calendar, ClipboardList, Sparkles } from 'lucide-react';
import { toast } from 'react-toastify';
import { withAlpha } from '../theme';

const TrainingPlan = ({ user, theme = 'dark', accentColor = '#5EADEB', embedded = false }) => {
  const [activeTab, setActiveTab] = useState('ai'); // 'ai' or 'plans'
  const [loading, setLoading] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [selectedActivities, setSelectedActivities] = useState([]);
  const [plan, setPlan] = useState(null);
  const [lmStudioUrl, setLmStudioUrl] = useState('http://localhost:1234/v1');
  const [activitiesList, setActivitiesList] = useState([]);
  const [activityModal, setActivityModal] = useState(null);
  
  const [editSessionModal, setEditSessionModal] = useState(null);
  
  // Training Plans state
  const [savedPlans, setSavedPlans] = useState([]);
  const [activePlan, setActivePlan] = useState(null);
  const [activePlanWeeks, setActivePlanWeeks] = useState([]);
  const [activePlanSessions, setActivePlanSessions] = useState({});
  const [showPlanCreator, setShowPlanCreator] = useState(false);
  const [showPlansLoading, setShowPlansLoading] = useState(true);
  const [expandedSessionIds, setExpandedSessionIds] = useState([]);
  const [newPlanData, setNewPlanData] = useState({
    name: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    periodization_type: 'linear',
    goal: ''
  });

  useEffect(() => {
    const loadSavedPlan = async () => {
      // Загружаем настройки для URL LM Studio и плана
      if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getSettings) {
        const settings = await window.electronAPI.getSettings();
        if (settings.lmStudioUrl) setLmStudioUrl(settings.lmStudioUrl);
        
        if (settings.trainingPlan) {
          try {
            setPlan(JSON.parse(settings.trainingPlan));
          } catch (e) {
            console.error("Error loading saved plan", e);
          }
        }
      }
      // load recent activities for assignment
      try {
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getActivities) {
          const acts = await window.electronAPI.getActivities();
          setActivitiesList(acts || []);
        }
      } catch (e) { console.error('load activities failed', e); }
      
      // Load training plans from DB
      loadTrainingPlans();
    };
    loadSavedPlan();
  }, []);
  
  const loadTrainingPlans = async () => {
    try {
      setShowPlansLoading(true);
      const plans = await window.electronAPI.getTrainingPlans();
      setSavedPlans(plans || []);
      if (plans && plans.length > 0) {
        // Find current active plan or use first one
        const currentId = activePlan?.id || plans[0].id;
        const detail = await window.electronAPI.getTrainingPlanDetail(currentId);
        if (detail.success) {
          setActivePlan(detail.plan);
          setActivePlanWeeks(detail.weeks || []);
          setActivePlanSessions(detail.sessions || {});
        }
      }
    } catch (err) {
      console.error('Failed to load training plans:', err);
    } finally {
      setShowPlansLoading(false);
    }
  };

  const handleEditSession = (session) => {
    setEditSessionModal(session);
  };

  const saveEditedSession = async () => {
    if (!editSessionModal) return;
    try {
      const res = await window.electronAPI.updateTrainingSession(editSessionModal.id, {
        session_type: editSessionModal.session_type,
        duration_minutes: parseInt(editSessionModal.duration_minutes),
        intensity_level: parseInt(editSessionModal.intensity_level),
        notes: editSessionModal.notes,
        tss: parseFloat(editSessionModal.tss || 0)
      });
      if (res.success) {
        toast.success('Сессия обновлена');
        setEditSessionModal(null);
        loadTrainingPlans();
      }
    } catch (err) {
      console.error(err);
      toast.error('Ошибка сохранения');
    }
  };

  const deleteSession = async (sessionId) => {
    if (!window.confirm('Удалить эту сессию?')) return;
    try {
      const res = await window.electronAPI.deleteTrainingSession(sessionId);
      if (res.success) {
        toast.success('Сессия удалена');
        loadTrainingPlans();
      }
    } catch (err) {
      console.error(err);
      toast.error('Ошибка удаления');
    }
  };
  
  const deletePlan = async (planId) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот план?')) return;
    try {
      const res = await window.electronAPI.deleteTrainingPlan(planId);
      if (res.success) {
        toast.success('План удален');
        if (activePlan?.id === planId) {
          setActivePlan(null);
          setActivePlanWeeks([]);
          setActivePlanSessions({});
        }
        loadTrainingPlans();
      }
    } catch (err) {
      console.error(err);
      toast.error('Ошибка удаления');
    }
  };

  const toggleSessionExpand = (id) => {
    setExpandedSessionIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const addToCalendar = async (session) => {
    try {
      // Calculate actual date if not already there
      let date = session.date;
      if (!date && activePlan && activePlanWeeks.length > 0) {
          // Find week for this session
          const week = activePlanWeeks.find(w => activePlanSessions[w.id]?.find(s => s.id === session.id));
          if (week) {
            const planStart = new Date(activePlan.start_date);
            const sessionDate = new Date(planStart);
            sessionDate.setDate(sessionDate.getDate() + (week.week_number - 1) * 7 + (session.day_of_week === 0 ? 6 : session.day_of_week - 1));
            date = sessionDate.toISOString().split('T')[0];
          }
      }

      if (!date) {
        toast.error('Не удалось определить дату сессии');
        return;
      }

      const res = await window.electronAPI.saveTrainingPlan({
        date: date,
        title: session.session_type,
        type: session.session_type,
        notes: session.notes || '',
        created_by: 'user'
      });

      if (res.success) {
        toast.success('Добавлено в календарь');
      }
    } catch (err) {
      console.error(err);
      toast.error('Ошибка добавления');
    }
  };
  
  const createTrainingPlan = async () => {
    if (!newPlanData.name || !newPlanData.end_date) {
      toast.warn('Заполните все поля');
      return;
    }

    try {
      const result = await window.electronAPI.createTrainingPlan(newPlanData);
      if (result.success) {
        toast.success('План создан!');
        setNewPlanData({
          name: '',
          start_date: new Date().toISOString().split('T')[0],
          end_date: '',
          periodization_type: 'linear',
          goal: ''
        });
        setShowPlanCreator(false);
        loadTrainingPlans();
      }
    } catch (err) {
      console.error('Failed to create plan:', err);
      toast.error('Ошибка при создании плана');
    }
  };
  
  const createAIBasedPlan = async () => {
    if (!activePlan) {
      toast.warn('Выберите план из списка или создайте новый, чтобы использовать его как основу для AI');
      return;
    }
    
    setLoading(true);
    try {
      // Logic for AI generation using activePlan.goal and user stats
      const result = await window.electronAPI.generateAIPlan({
        goal: activePlan.goal,
        name: activePlan.name
      });
      
      if (result.success) {
        setPlan(result.plan);
        toast.success(`План "${activePlan.name}" оптимизирован тренером!`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Не удалось сгенерировать AI план');
    } finally {
      setLoading(false);
    }
  };

  const goals = [
    { id: 'endurance', title: 'Выносливость', desc: 'Длительные поездки в низкой зоне', icon: <Target className="text-blue-400" /> },
    { id: 'power', title: 'Мощность', desc: 'Короткие взрывные интервалы', icon: <Zap className="text-yellow-400" /> },
    { id: 'weight', title: 'Снижение веса', desc: 'Жиросжигающие тренировки', icon: <Flame className="text-orange-400" /> },
    { id: 'race', title: 'Подготовка к гонке', desc: 'Смешанная нагрузка (Build)', icon: <Trophy className="text-purple-400" /> },
  ];

  const activities = ['Велосипед', 'Бег', 'Плавание', 'Ходьба'];

  const generatePlan = async () => {
    if (!selectedGoal || selectedActivities.length === 0) {
      toast.warn('Выберите цель и виды активности!');
      return;
    }

    setLoading(true);
    
    try {
      const prompt = `Ты - профессиональный спортивный тренер. Составь тренировочный план на 3 сессии для атлета.
      Цель: ${goals.find(g => g.id === selectedGoal).title}.
      Виды спорта: ${selectedActivities.join(', ')}.
      FTP атлета: ${user?.ftp || 200} Вт.
      Вес: ${user?.weight || 75} кг.
      Верни ответ СТРОГО в формате JSON:
      {
        "title": "Название стратегии",
        "suggested_start_date": "YYYY-MM-DD",
        "sessions": [
          {"day": "День 1", "type": "Вид", "duration": "Длительность", "intensity": "Интенсивность", "tss": "Число TSS", "notes": "Описание МЛ..."}
        ]
      }`;

      let response;
      try {
        response = await fetch(`${lmStudioUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: "local-model",
            messages: [
              { role: "system", content: "Ты - эксперт по физической подготовке. Ответ всегда в формате JSON." },
              { role: "user", content: prompt }
            ],
            temperature: 0.7
          })
        });

        if (!response.ok) throw new Error('API error');
        const data = await response.json();
        const aiContent = data.choices[0].message.content;
        const cleanJson = aiContent.replace(/```json|```/g, '').trim();
        const aiPlan = JSON.parse(cleanJson);

        if (!aiPlan.sessions || !Array.isArray(aiPlan.sessions)) {
          throw new Error("Invalid response format");
        }

        // Build weekly plan (7 days) from AI-provided sessions; if AI returned fewer, repeat/expand
        const baseTitle = aiPlan.title || goals.find(g => g.id === selectedGoal).title;
        const sessions = [];
        for (let i = 0; i < 7; i++) {
          const aiSession = aiPlan.sessions[i % aiPlan.sessions.length] || aiPlan.sessions[0];
          const date = new Date();
          date.setDate(date.getDate() + i + 1); // next days
          sessions.push({
            day: date.toISOString().split('T')[0],
            type: aiSession.type || selectedActivities[0],
            duration: aiSession.duration || aiSession.time || aiSession.dur || '60 мин',
            intensity: aiSession.intensity || aiSession.zone || '',
            tss: parseFloat(aiSession.tss) || (aiSession.tss ? +aiSession.tss : null),
            completed: false
          });
        }

        const newPlan = { title: baseTitle, sessions };

        // check activities for each session date and mark completed/partial
        const acts = activitiesList || (window.electronAPI.getActivities ? await window.electronAPI.getActivities() : []);
        for (let si = 0; si < newPlan.sessions.length; si++) {
          const s = newPlan.sessions[si];
          const found = (acts || []).find(a => (a.date || '').split('T')[0] === s.day || (new Date(a.date).toISOString().split('T')[0] === s.day));
          if (found) {
            s.completed = true;
            s.activityId = found.id;
            s.activityTitle = found.title || found.type;
            // undershoot handling: if planned TSS exists and activity tss exists
            if (s.tss && found.tss) {
              const pct = Math.round((found.tss / s.tss) * 100);
              s.completionPercent = Math.min(100, pct);
              if (pct < 80) {
                // mark as partial (50%) if significantly undershot
                s.status = 'partial';
                s.completionPercent = Math.max(50, s.completionPercent);
              } else {
                s.status = 'done';
              }
            }
          }
        }

        setPlan(newPlan);
        if (window.electronAPI.updateSetting) {
          await window.electronAPI.updateSetting('trainingPlan', JSON.stringify(newPlan));
        }

        // Persist each session into training_plan table
        if (window.electronAPI.saveTrainingPlan) {
          for (const s of newPlan.sessions) {
            try {
              await window.electronAPI.saveTrainingPlan({ date: s.day, title: newPlan.title, type: s.type, notes: s.intensity || '', created_by: 'ai' });
            } catch (e) { console.error('save session failed', e); }
          }
        }

        // Save to training plans database
        if (selectedGoal && selectedActivities.length > 0) {
          try {
            const lastActivity = activitiesList && activitiesList.length > 0 ? activitiesList[0] : null;
            let startDate = new Date();
            if (lastActivity) {
                const lastDate = new Date(lastActivity.date);
                // Suggest start date = last activity + 2 days for rest
                startDate = new Date(lastDate.getTime() + (86400000 * 2));
                if (startDate < new Date()) startDate = new Date(Date.now() + 86400000);
            }

            await window.electronAPI.createTrainingPlan({
              name: newPlan.title,
              start_date: startDate.toISOString().split('T')[0],
              end_date: new Date(startDate.getTime() + (86400000 * 7)).toISOString().split('T')[0],
              periodization_type: 'undulating',
              goal: `${goals.find(g => g.id === selectedGoal).title} - ${selectedActivities.join(', ')}`,
              description: "AI Generated Plan based on recent performance and goals."
            });
            loadTrainingPlans();
          } catch (e) { console.error('save to plans failed', e); }
        }

        toast.success('AI план сгенерирован и сохранен!');
      } catch (apiErr) {
        // API недоступен, используем локальный алгоритм
        console.log('LM Studio недоступен, используем локальный алгоритм...');
        
        // Fallback к локальному алгоритму
        const ftp = user?.ftp || 200;
        let duration, intensity, tss;
        if (selectedGoal === 'endurance') {
          duration = '120-180 мин'; intensity = '55-65% FTP'; tss = '90';
        } else if (selectedGoal === 'power') {
          duration = '60-90 мин'; intensity = '90-110% FTP'; tss = '130';
        } else {
          duration = '45-75 мин'; intensity = '70-85% FTP'; tss = '70';
        }

        const fallbackPlan = {
          title: goals.find(g => g.id === selectedGoal).title,
          sessions: [
            { day: 'Сессия 1', type: selectedActivities[0], duration, intensity, tss },
            { day: 'Сессия 2', type: selectedActivities[0], duration: '45 мин', intensity: 'Recovery', tss: '20' },
            { day: 'Сессия 3', type: selectedGoal === 'race' ? 'Интервалы' : 'Длительная', duration: '120 мин', intensity: 'Zone 2', tss: '100' }
          ]
        };
        setPlan(fallbackPlan);
        if (window.electronAPI.updateSetting) {
          await window.electronAPI.updateSetting('trainingPlan', JSON.stringify(fallbackPlan));
        }
        toast.info('Локальный план создан (AI недоступен)');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleActivity = (act) => {
    setSelectedActivities(prev => 
      prev.includes(act) ? prev.filter(a => a !== act) : [...prev, act]
    );
  };

  // Intensity color helper
  const intensityColor = (level) => {
    if (level <= 3) return 'text-green-400';
    if (level <= 6) return 'text-yellow-400';
    if (level <= 8) return 'text-orange-400';
    return 'text-red-400';
  };

  const focusMeta = (focus) => {
    const metas = {
      build: { label: 'Нагрузка', Icon: TrendingUp },
      peak: { label: 'Пик', Icon: Zap },
      recovery: { label: 'Восстановление', Icon: Moon },
      taper: { label: 'Снижение', Icon: TrendingDown },
    };
    return metas[focus] || { label: focus, Icon: null };
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      {!embedded && (
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl shrink-0" style={{ backgroundColor: withAlpha(accentColor, 0.16) }}>
          <Target size={22} style={{ color: accentColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent ${theme === 'dark' ? 'from-white to-gray-400' : 'from-slate-900 to-slate-500'}`}>Тренировки</h1>
          <p className="text-sm text-gray-400">Планы и AI-генератор</p>
        </div>
      </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { id: 'plans', label: 'Мои тренировки', Icon: ClipboardList },
          { id: 'ai', label: 'AI Генератор', Icon: Sparkles },
        ].map((t) => {
          const active = activeTab === t.id;
          const TabIcon = t.Icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-all flex items-center gap-2 ${active ? 'shadow-sm' : 'text-gray-400'}`}
              style={active ? { backgroundColor: withAlpha(accentColor, 0.16), color: accentColor } : {}}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = withAlpha(accentColor, 0.07); }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <TabIcon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Plans Tab */}
      {activeTab === 'plans' && (
        <div className="zap-card p-4 sm:p-6 min-w-0">
          <div className="flex justify-between items-center gap-3 mb-6 min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold truncate min-w-0">Мои тренировочные планы</h2>
            <button
              onClick={() => setShowPlanCreator(!showPlanCreator)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg shrink-0"
            >
              <Plus size={20} />
              Новый
            </button>
          </div>

          {/* Plan Creator */}
          {showPlanCreator && (
            <div className={`p-6 rounded-2xl border mb-6 ${ theme === 'dark' ? 'bg-slate-700 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
              <h3 className="text-lg font-bold mb-4">Создание нового плана</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <input
                  type="text"
                  placeholder="Название плана"
                  value={newPlanData.name}
                  onChange={(e) => setNewPlanData({ ...newPlanData, name: e.target.value })}
                  className={`px-4 py-2 rounded-lg border outline-none focus:border-blue-500 ${
                    theme === 'dark' ? 'bg-slate-600 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <input
                  type="date"
                  value={newPlanData.start_date}
                  onChange={(e) => setNewPlanData({ ...newPlanData, start_date: e.target.value })}
                  className={`px-4 py-2 rounded-lg border outline-none focus:border-blue-500 ${
                    theme === 'dark' ? 'bg-slate-600 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <input
                  type="date"
                  value={newPlanData.end_date}
                  onChange={(e) => setNewPlanData({ ...newPlanData, end_date: e.target.value })}
                  className={`px-4 py-2 rounded-lg border outline-none focus:border-blue-500 ${
                    theme === 'dark' ? 'bg-slate-600 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <select
                  value={newPlanData.periodization_type}
                  onChange={(e) => setNewPlanData({ ...newPlanData, periodization_type: e.target.value })}
                  className={`px-4 py-2 rounded-lg border outline-none focus:border-blue-500 ${
                    theme === 'dark' ? 'bg-slate-600 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="linear">Линейная периодизация</option>
                  <option value="undulating">Волнообразная периодизация</option>
                </select>
              </div>
              <textarea
                placeholder="Цель плана"
                value={newPlanData.goal}
                onChange={(e) => setNewPlanData({ ...newPlanData, goal: e.target.value })}
                className={`w-full px-4 py-2 rounded-lg border outline-none focus:border-blue-500 h-20 ${
                  theme === 'dark' ? 'bg-slate-600 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={createTrainingPlan}
                  className="px-6 py-2 bg-green-500 hover:bg-green-600 rounded-lg font-bold"
                >
                  Сохранить
                </button>
                <button
                  onClick={() => setShowPlanCreator(false)}
                  className="px-6 py-2 bg-gray-500 hover:bg-gray-600 rounded-lg font-bold"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Plans List and Detail */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Sidebar */}
            <div className={`rounded-2xl border p-4 ${ theme === 'dark' ? 'bg-slate-700 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
              <h3 className="font-bold mb-3">Планы</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {savedPlans.length === 0 ? (
                  <p className="text-xs text-gray-400">Нет планов</p>
                ) : (
                  savedPlans.map(p => (
                    <div key={p.id} className="relative group">
                      <button
                        onClick={async () => {
                          const detail = await window.electronAPI.getTrainingPlanDetail(p.id);
                          if (detail.success) {
                            setActivePlan(detail.plan);
                            setActivePlanWeeks(detail.weeks || []);
                            setActivePlanSessions(detail.sessions || {});
                          }
                        }}
                        className={`w-full text-left px-3 py-2 pr-10 rounded-lg transition-all text-sm mb-2 ${
                          activePlan?.id === p.id
                            ? 'bg-blue-500 text-white'
                            : theme === 'dark' ? 'bg-slate-600 hover:bg-slate-500 text-gray-300' : 'bg-white hover:bg-slate-100 text-slate-900'
                        }`}
                      >
                        <p className="font-bold">{p.name}</p>
                        <p className="text-xs opacity-70">{p.start_date} - {p.end_date}</p>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePlan(p.id); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Detail */}
            <div className="md:col-span-2 space-y-4 min-w-0">
              {activePlan ? (
                <>
                  <div className={`p-6 rounded-2xl border ${ theme === 'dark' ? 'bg-slate-700 border-white/10' : 'bg-white border-slate-200'}`}>
                    <h2 className="text-2xl font-bold mb-4">{activePlan.name}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Период</p>
                        <p className="font-bold">{activePlan.start_date} → {activePlan.end_date}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Периодизация</p>
                        <p className="font-bold">{activePlan.periodization_type === 'linear' ? 'Линейная' : 'Волнообразная'}</p>
                      </div>
                      {activePlan.goal && (
                        <div className="col-span-2">
                          <p className="text-xs text-gray-400 mb-1">Цель</p>
                          <p className="font-bold">{activePlan.goal}</p>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={createAIBasedPlan}
                      className="w-full px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                    >
                      <Sparkles size={16} /> Оптимизировать AI
                    </button>
                  </div>

                  {/* Sessions Display */}
                  <div className="space-y-4">
                    {activePlanWeeks.map(week => (
                      <div key={week.id} className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-slate-800 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold flex items-center gap-2">
                                <span className="text-blue-400">Неделя {week.week_number}</span>
                                <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20 flex items-center gap-1">
                                    {(() => { const m = focusMeta(week.focus_type); return (<>{m.Icon && <m.Icon size={12} />}{m.label}</>); })()}
                                </span>
                            </h3>
                            <div className="text-xs text-gray-500">Интенсивность: {week.intensity_level}/10</div>
                        </div>

                        <div className="space-y-2">
                            {activePlanSessions[week.id]?.map((s, idx) => {
                                // Calculate actual date
                                const planStart = new Date(activePlan.start_date);
                                const sessionDate = new Date(planStart);
                                sessionDate.setDate(sessionDate.getDate() + (week.week_number - 1) * 7 + (s.day_of_week === 0 ? 6 : s.day_of_week - 1));
                                const dateStr = sessionDate.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });

                                return (
                                    <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border ${theme === 'dark' ? 'bg-slate-700/50 border-white/5' : 'bg-white border-slate-100'}`}>
                                        <div className="text-[10px] font-bold text-gray-500 w-16 leading-tight uppercase">
                                            {dateStr}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-bold ${intensityColor(s.intensity_level)}`}>{s.session_type}</span>
                                                <span className="text-[10px] text-gray-500">{s.duration_minutes} мин</span>
                                                <button 
                                                  onClick={() => toggleSessionExpand(s.id)}
                                                  className="text-[9px] text-blue-400 hover:underline"
                                                >
                                                  Описание МЛ
                                                </button>
                                            </div>
                                            {(s.notes || expandedSessionIds.includes(s.id)) && (
                                              <p className={`text-[10px] text-gray-400 ${expandedSessionIds.includes(s.id) ? '' : 'truncate max-w-[200px]'}`}>
                                                {s.notes || "Описание от ML модели уточняется..."}
                                              </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={() => addToCalendar(s)}
                                                className="p-1.5 hover:bg-green-500/10 rounded-lg text-green-400 hover:text-green-300 transition-colors"
                                                title="Добавить в календарь"
                                            >
                                                <Calendar size={14} />
                                            </button>
                                            <button 
                                                onClick={() => handleEditSession(s)}
                                                className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                                            >
                                                <ChevronRight size={14} />
                                            </button>
                                            <button 
                                                onClick={() => deleteSession(s.id)}
                                                className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 hover:text-red-300 transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-96 text-gray-400">
                  <p>Выберите или создайте план для просмотра</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Tab */}
      {activeTab === 'ai' && (
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-4 sm:p-8 border border-white/10 shadow-2xl min-w-0">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 break-words">Ваш AI Тренировочный План</h2>
        
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-12">
          {/* Левая колонка: Настройка */}
          <div className="space-y-6 min-w-0">
            <div>
              <p className="text-gray-400 mb-4 font-medium uppercase tracking-wider text-sm">1. Выберите основную цель</p>
              <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-4">
                {goals.map(goal => (
                  <button
                    key={goal.id}
                    onClick={() => setSelectedGoal(goal.id)}
                    className={`p-4 rounded-2xl border transition-all text-left flex items-start gap-3 min-w-0 ${
                      selectedGoal === goal.id 
                      ? 'bg-orange-500/20 border-orange-500 ring-1 ring-orange-500' 
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="p-2 bg-black/20 rounded-lg shrink-0">{goal.icon}</div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-white break-words">{goal.title}</h4>
                      <p className="text-xs text-gray-500 break-words">{goal.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-gray-400 mb-4 font-medium uppercase tracking-wider text-sm">2. Любимые дисциплины</p>
              <div className="flex flex-wrap gap-3">
                {activities.map(act => (
                  <button
                    key={act}
                    onClick={() => toggleActivity(act)}
                    className={`px-6 py-2 rounded-full border transition-all font-medium ${
                      selectedActivities.includes(act)
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-white/10 text-gray-400 hover:border-white/30'
                    }`}
                  >
                    {act}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={generatePlan}
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2"
            >
              {loading ? 'Анализируем ваши данные...' : 'Создать план тренировок'} <ChevronRight />
            </button>
          </div>

          {/* Правая колонка: Результат */}
          <div className="bg-black/20 rounded-2xl p-4 sm:p-6 border border-white/5 min-h-[400px] min-w-0">
            {plan && plan.sessions && Array.isArray(plan.sessions) ? (
              <div className="space-y-6 min-w-0">
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-4 min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-orange-400 break-words min-w-0">{plan.title}</h3>
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full border border-orange-500/30 shrink-0">Активен</span>
                </div>
                <div className="space-y-4">
                  {plan.sessions.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 sm:gap-4 bg-white/5 p-3 sm:p-4 rounded-xl border border-white/5 min-w-0">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 bg-white/10 rounded-full flex items-center justify-center text-sm font-bold text-gray-400">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center gap-2 mb-1">
                          <span className="text-xs text-blue-400 font-bold uppercase truncate min-w-0">{s.day}</span>
                          <span className="text-xs text-gray-500 shrink-0">TSS: {s.tss}</span>
                        </div>
                        <h4 className="text-white font-medium break-words">{s.type}: {s.duration}</h4>
                        <p className="text-xs text-gray-400 break-words">Интенсивность: {s.intensity}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <CheckCircle2
                          size={20}
                          className={`cursor-pointer ${s.completed ? 'text-green-400' : 'text-gray-700'}`}
                          onClick={async () => {
                            const updated = { ...plan };
                            updated.sessions = updated.sessions.map((ss, idx) => idx === i ? { ...ss, completed: !ss.completed } : ss);
                            setPlan(updated);
                            if (window.electronAPI && window.electronAPI.updateSetting) {
                              await window.electronAPI.updateSetting('trainingPlan', JSON.stringify(updated));
                            }
                            // persist a single session row
                            try {
                              const srow = updated.sessions[i];
                              if (window.electronAPI.saveTrainingPlan) {
                                await window.electronAPI.saveTrainingPlan({ date: srow.day, title: updated.title || '', type: srow.type, notes: srow.intensity || '', created_by: 'user' });
                              }
                            } catch (e) { console.error('save single session', e); }
                            toast.info(!s.completed ? 'Сессия помечена как пройденная' : 'Сессия помечена как непройденная');
                          }}
                        />
                        <button
                          className="text-xs text-gray-400 hover:text-white underline"
                          onClick={async () => {
                            // simple assignment UI: open modal with list of recent activities
                            const acts = activitiesList.slice(0, 10);
                            if (!acts || acts.length === 0) {
                              toast.info('Нет доступных активностей для выбора');
                              return;
                            }
                            setActivityModal({ activities: acts, sessionIndex: i });
                          }}
                        >
                          Привязать
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                  <Target size={40} className="text-gray-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-500">План не сформирован</h3>
                  <p className="text-sm text-gray-600 max-w-[250px]">Выберите параметры слева, чтобы наш алгоритм подобрал для вас идеальную нагрузку.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Activity Selection Modal */}
      {activityModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-3xl p-8 max-w-2xl w-full max-h-96 overflow-y-auto border border-white/10">
            <h3 className="text-2xl font-bold text-white mb-6">Выберите активность для сессии {activityModal.sessionIndex + 1}</h3>
            
            <div className="space-y-3 mb-6">
              {activityModal.activities.map((act, idx) => (
                <button
                  key={idx}
                  onClick={async () => {
                    const chosen = act;
                    const updated = { ...plan };
                    updated.sessions = updated.sessions.map((ss, sidx) => 
                      sidx === activityModal.sessionIndex 
                        ? { ...ss, activityId: chosen.id, activityTitle: chosen.title || chosen.type, completed: true }
                        : ss
                    );
                    setPlan(updated);
                    if (window.electronAPI && window.electronAPI.updateSetting) {
                      await window.electronAPI.updateSetting('trainingPlan', JSON.stringify(updated));
                    }
                    
                    // persist binding
                    try {
                      const srow = updated.sessions[activityModal.sessionIndex];
                      if (window.electronAPI.saveTrainingPlan) {
                        await window.electronAPI.saveTrainingPlan({ 
                          date: srow.day, 
                          title: updated.title || '', 
                          type: srow.type, 
                          notes: `assigned:${srow.activityId}`, 
                          created_by: 'user' 
                        });
                      }
                    } catch (e) { console.error('save binding', e); }
                    
                    toast.success('Активность привязана к сессии');
                    setActivityModal(null);
                  }}
                  className="w-full text-left p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all flex items-start gap-4"
                >
                  <div className="flex-1">
                    <div className="font-bold text-white">{act.title || act.type || 'Activity'}</div>
                    <div className="text-xs text-gray-400">
                      Дата: {new Date(act.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    {act.tss && <div className="text-xs text-blue-400">TSS: {act.tss}</div>}
                    {act.duration && <div className="text-xs text-gray-500">Длит.: {act.duration}</div>}
                  </div>
                  <ChevronRight className="text-gray-600 mt-1" size={20} />
                </button>
              ))}
            </div>

            <button
              onClick={() => setActivityModal(null)}
              className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingPlan;