import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Target, Clock, Zap,
  Bike, Droplet, Flag, Check, X, RefreshCw, MapPin,
} from 'lucide-react';
import { eventEmitter } from '../services/EventEmitter';
import { withAlpha } from '../theme';

export default function TrainingCalendar({ theme, accentColor }) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [rides, setRides] = useState([]);
    const [selectedDayContent, setSelectedDayContent] = useState(null);
    const [trainingPlan, setTrainingPlan] = useState(null);
    const [waterHistory, setWaterHistory] = useState([]);
    const [competitions, setCompetitions] = useState([]);

    const muted = theme === 'dark' ? 'text-gray-400' : 'text-slate-500';
    const cellBorder = theme === 'dark' ? 'border-white/10' : 'border-slate-200';

    useEffect(() => {
        const fetchData = async () => {
            const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
            if (api && api.getRides) {
                const data = await api.getRides();
                setRides(Array.isArray(data) ? data : []);
            }

            // Load training plans from new DB table
            try {
                if (api && api.getTrainingPlans) {
                    const plans = await api.getTrainingPlans();
                    if (plans && plans.length > 0) {
                        // Load all plans or current one
                        let allSessions = [];
                        for (const p of plans) {
                            const detail = await api.getTrainingPlanDetail(p.id);
                            if (detail.success) {
                                const formatted = formatTrainingPlan(detail.plan, detail.weeks, detail.sessions);
                                allSessions = [...allSessions, ...formatted];
                            }
                        }
                        setTrainingPlan(allSessions);
                    }
                } else if (api && api.getTrainingPlan) {
                    const plans = await api.getTrainingPlan();
                    setTrainingPlan(Array.isArray(plans) ? plans : (plans || null));
                } else if (api && api.getSettings) {
                    const settings = await api.getSettings();
                    if (settings.trainingPlan) {
                        try { setTrainingPlan(JSON.parse(settings.trainingPlan)); } catch (e) { console.error("Error parsing training plan", e); }
                    }
                }
            } catch (e) { console.error('load training plan', e); }

            // Load water history and competitions
            try {
                if (api && api.getWaterHistory) {
                    const wh = await api.getWaterHistory();
                    setWaterHistory(Array.isArray(wh) ? wh : (wh || []));
                }
                if (api && api.getCompetitions) {
                    const comps = await api.getCompetitions();
                    setCompetitions(Array.isArray(comps) ? comps : (comps || []));
                }
            } catch (e) { console.error('load water history or competitions', e); }
        };
        fetchData();
        const onSync = ()=> fetchData();
        window.addEventListener('settings-updated', onSync);
        window.addEventListener('activities-updated', onSync);

        // Listen for training plan updates
        const unsubscribe = eventEmitter.on('training-plan-updated', async () => {
            const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
            if (api?.getTrainingPlans) {
                const plans = await api.getTrainingPlans();
                if (plans && plans.length > 0) {
                    const detail = await api.getTrainingPlanDetail(plans[0].id);
                    if (detail.success) {
                        const formattedPlan = formatTrainingPlan(detail.plan, detail.weeks, detail.sessions);
                        setTrainingPlan(formattedPlan);
                    }
                }
            }
        });

        const onComps = async () => {
            const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
            if (api && api.getCompetitions) {
                const comps = await api.getCompetitions();
                setCompetitions(Array.isArray(comps) ? comps : (comps || []));
            }
        };
        window.addEventListener('competitions-updated', onComps);

        return () => {
            window.removeEventListener('settings-updated', onSync);
            window.removeEventListener('activities-updated', onSync);
            unsubscribe();
            window.removeEventListener('competitions-updated', onComps);
        };
    }, []);

    const formatTrainingPlan = (plan, weeks, sessions) => {
        // Convert training plan weeks/sessions to date-based format for calendar display
        const planSessions = [];
        const startDate = new Date(plan.start_date);

        weeks.forEach((week, idx) => {
            const weekStart = new Date(startDate);
            weekStart.setDate(weekStart.getDate() + (week.week_number - 1) * 7);

            if (sessions[week.id]) {
                sessions[week.id].forEach(session => {
                    if (session.day_of_week !== null) {
                        const sessionDate = new Date(weekStart);
                        sessionDate.setDate(sessionDate.getDate() + (session.day_of_week || 0));

                        planSessions.push({
                            id: session.id,
                            date: sessionDate.toISOString().split('T')[0],
                            type: session.session_type,
                            title: session.session_type,
                            duration: session.duration_minutes,
                            intensity: session.intensity_level,
                            notes: session.notes,
                            completed: session.completed
                        });
                    }
                });
            }
        });

        return planSessions;
    };

    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const goToday = () => setCurrentDate(new Date());

    const monthNames = [
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days = daysInMonth(year, month);
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // Понедельник - первый день

    const calendarDays = [];
    for (let i = 0; i < firstDay; i++) {
        calendarDays.push(null);
    }
    for (let i = 1; i <= days; i++) {
        calendarDays.push(i);
    }

    const dayKey = (day) => new Date(year, month, day).toISOString().split('T')[0];

    const getRidesForDay = (day) => {
        if (!day) return [];
        return rides.filter(ride => {
            const rideDate = new Date(ride.date);
            return rideDate.getDate() === day &&
                   rideDate.getMonth() === month &&
                   rideDate.getFullYear() === year;
        });
    };

    const getPlanForDay = (day) => {
        if (!day || !trainingPlan) return null;
        // If trainingPlan is array of entries from DB, match by date
        if (Array.isArray(trainingPlan)) {
            const dateStr = dayKey(day);
            return trainingPlan.find(p => p.date && p.date.startsWith(dateStr)) || null;
        }
        if (trainingPlan.sessions) return trainingPlan.sessions[day - 1] || null;
        return null;
    };

    const markSessionDone = async () => {
        const api = window.electronAPI;
        if (api?.updateTrainingSession && selectedDayContent.plan?.id) {
            try {
                const result = await api.updateTrainingSession(selectedDayContent.plan.id, {
                    completed: 1,
                    actual_duration: selectedDayContent.plan.duration
                });
                if (result.success) {
                    await api.calculateFitnessMetrics?.();
                    setSelectedDayContent(null);
                    // Reload plans to update UI
                    const plans = await api.getTrainingPlans();
                    if (plans && plans.length > 0) {
                        const detail = await api.getTrainingPlanDetail(plans[0].id);
                        if (detail.success) {
                            setTrainingPlan(formatTrainingPlan(detail.plan, detail.weeks, detail.sessions));
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to mark session complete:', err);
            }
        }
    };

    const reload = async () => {
        const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
        if (!api?.getRides) return;
        const data = await api.getRides();
        setRides(Array.isArray(data) ? data : []);
    };

    const modalBg = theme === 'dark' ? 'bg-[#0f172a] border-white/10' : 'bg-white border-slate-200';
    const rowBg = theme === 'dark' ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200';

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl shrink-0" style={{ backgroundColor: withAlpha(accentColor, 0.16) }}>
                    <CalendarIcon size={22} style={{ color: accentColor }} />
                </div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold">Календарь</h1>
                    <p className={`text-sm ${muted}`}>План и история тренировок</p>
                </div>
                <button
                    onClick={goToday}
                    className="px-3 py-2 rounded-2xl text-xs font-bold shrink-0 transition-colors"
                    style={{ backgroundColor: withAlpha(accentColor, 0.12), color: accentColor }}
                    title="Вернуться к текущему месяцу"
                >
                    Сегодня
                </button>
                <button
                    onClick={reload}
                    className="p-2.5 rounded-2xl shrink-0 transition-colors"
                    style={{ backgroundColor: withAlpha(accentColor, 0.12), color: accentColor }}
                    title="Обновить"
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            <div className="zap-card p-2 flex items-center justify-between">
                <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-white/10 transition-colors" title="Предыдущий месяц">
                    <ChevronLeft size={20} />
                </button>
                <span className="font-bold min-w-[120px] text-center">
                    {monthNames[month]} {year}
                </span>
                <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-white/10 transition-colors" title="Следующий месяц">
                    <ChevronRight size={20} />
                </button>
            </div>

            <div className="zap-card overflow-hidden">
                <div className={`grid grid-cols-7 border-b ${cellBorder}`}>
                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                        <div key={day} className={`p-2 sm:p-3 text-center text-[11px] font-bold uppercase tracking-wider ${muted}`}>
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7">
                    {calendarDays.map((day, idx) => {
                        const dayRides = getRidesForDay(day);
                        const planSession = getPlanForDay(day);
                        const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                        const key = day ? dayKey(day) : null;
                        const dayWater = key ? waterHistory.find(w => w.date && w.date.startsWith(key)) : null;
                        const dayCompetition = key ? (competitions || []).find(c => c.date && c.date.startsWith(key)) : null;

                        return (
                            <div
                                key={idx}
                                className={`border-r border-b ${cellBorder} p-1.5 sm:p-2 transition-colors hover:bg-white/5 cursor-pointer relative min-h-[64px] sm:min-h-[88px] ${!day ? 'opacity-30' : ''}`}
                                onClick={() => day && setSelectedDayContent({ day, rides: dayRides, plan: planSession, water: dayWater, competition: dayCompetition })}
                            >
                                {day && (
                                    <>
                                        <span
                                            className="text-xs sm:text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full"
                                            style={isToday ? { backgroundColor: accentColor, color: '#fff' } : undefined}
                                        >
                                            {day}
                                        </span>

                                        <div className="mt-1.5 space-y-1 overflow-hidden">
                                            {planSession && (
                                                <div
                                                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-lg truncate"
                                                    style={{ backgroundColor: withAlpha('#f59e0b', 0.15), color: '#f59e0b' }}
                                                    title={planSession.title || planSession.type}
                                                >
                                                    <Target size={10} className="shrink-0" />
                                                    <span className="truncate">{planSession.type || planSession.title}</span>
                                                </div>
                                            )}
                                            {dayRides.map(ride => (
                                                <div
                                                    key={ride.id}
                                                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-lg truncate"
                                                    style={{ backgroundColor: withAlpha(accentColor, 0.14), color: accentColor }}
                                                    title={ride.title}
                                                >
                                                    <Bike size={10} className="shrink-0" />
                                                    <span className="truncate">{Number(ride.distance || 0).toFixed(1)} км</span>
                                                </div>
                                            ))}
                                            {dayWater && (
                                                <div
                                                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-lg truncate"
                                                    style={{ backgroundColor: withAlpha('#22d3ee', 0.12), color: '#22d3ee' }}
                                                >
                                                    <Droplet size={10} className="shrink-0" />
                                                    <span className="truncate">{dayWater.liters} л</span>
                                                </div>
                                            )}
                                            {dayCompetition && (
                                                <div
                                                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-lg truncate"
                                                    style={{ backgroundColor: withAlpha('#eab308', 0.12), color: '#eab308' }}
                                                    title={dayCompetition.title}
                                                >
                                                    <Flag size={10} className="shrink-0" />
                                                    <span className="truncate">{dayCompetition.title}</span>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className={`flex flex-wrap gap-x-4 gap-y-1 text-[11px] ${muted} px-1`}>
                <span className="flex items-center gap-1"><Target size={11} style={{ color: '#f59e0b' }} /> план</span>
                <span className="flex items-center gap-1"><Bike size={11} style={{ color: accentColor }} /> тренировка</span>
                <span className="flex items-center gap-1"><Droplet size={11} style={{ color: '#22d3ee' }} /> вода</span>
                <span className="flex items-center gap-1"><Flag size={11} style={{ color: '#eab308' }} /> старт</span>
            </div>

            {/* Модальное окно деталей дня */}
            {selectedDayContent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedDayContent(null)}>
                    <div className={`${modalBg} border w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl`} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-bold">{selectedDayContent.day} {monthNames[month]}</h3>
                            <button onClick={() => setSelectedDayContent(null)} className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Закрыть">
                                <X size={20} className={muted} />
                            </button>
                        </div>

                        <div className="space-y-5">
                            {selectedDayContent.plan ? (
                                <div>
                                    <p className="zap-section-label" style={{ color: '#f59e0b' }}>План тренера</p>
                                    <div className="rounded-2xl p-4 mt-1" style={{ backgroundColor: withAlpha('#f59e0b', 0.08), border: `1px solid ${withAlpha('#f59e0b', 0.25)}` }}>
                                        <h4 className="font-bold flex items-center gap-2">
                                            <Target size={16} style={{ color: '#f59e0b' }} /> {selectedDayContent.plan.title || selectedDayContent.plan.type}
                                        </h4>
                                        <div className={`flex flex-wrap gap-3 mt-2 text-xs ${muted}`}>
                                            <span className="flex items-center gap-1"><Clock size={12} /> {selectedDayContent.plan.duration} мин</span>
                                            <span className="flex items-center gap-1"><Zap size={12} /> Уровень {selectedDayContent.plan.intensity}</span>
                                        </div>
                                        {selectedDayContent.plan.notes && <div className="mt-2 text-xs opacity-80">{selectedDayContent.plan.notes}</div>}
                                    </div>
                                    <button
                                        onClick={markSessionDone}
                                        className="flex items-center justify-center gap-1.5 w-full mt-3 py-2.5 text-white font-bold rounded-2xl transition-all text-sm"
                                        style={{ backgroundColor: '#f59e0b' }}
                                    >
                                        <Check size={16} /> Выполнено
                                    </button>
                                </div>
                            ) : (
                                <div className={`text-center p-4 border border-dashed rounded-2xl text-sm ${muted} ${cellBorder}`}>
                                    На этот день план не задан
                                </div>
                            )}

                            <div>
                                <p className="zap-section-label" style={{ color: accentColor }}>Завершенные тренировки</p>
                                {selectedDayContent.rides.length > 0 ? (
                                    <div className="space-y-2 mt-1">
                                        {selectedDayContent.rides.map((a, i) => (
                                            <div key={i} className={`${rowBg} border p-4 rounded-2xl flex items-center justify-between`}>
                                                <div>
                                                    <h4 className="font-bold text-sm">{a.title}</h4>
                                                    <p className={`text-[11px] ${muted}`}>{Math.round(a.duration / 60)} мин | {Number(a.distance || 0).toFixed(1)} км</p>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-bold" style={{ color: '#fb923c' }}>TSS: {Math.round(a.tss)}</div>
                                                    <div className={`text-[10px] ${muted}`}>{a.avg_hr} bpm</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={`text-xs italic text-center p-4 ${muted}`}>Нет выполненных тренировок</p>
                                )}
                            </div>

                            {selectedDayContent.water && (
                                <div>
                                    <p className="zap-section-label" style={{ color: '#22d3ee' }}>Вода</p>
                                    <div className="rounded-2xl p-4 mt-1" style={{ backgroundColor: withAlpha('#22d3ee', 0.08), border: `1px solid ${withAlpha('#22d3ee', 0.25)}` }}>
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold flex items-center gap-1.5"><Droplet size={15} style={{ color: '#22d3ee' }} /> {selectedDayContent.water.liters} л</span>
                                            <span className="text-xs opacity-70">{selectedDayContent.water.glasses} стакана</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedDayContent.competition && (
                                <div>
                                    <p className="zap-section-label" style={{ color: '#eab308' }}>Соревнование</p>
                                    <div className="rounded-2xl p-4 mt-1" style={{ backgroundColor: withAlpha('#eab308', 0.08), border: `1px solid ${withAlpha('#eab308', 0.25)}` }}>
                                        <h4 className="font-bold flex items-center gap-1.5"><Flag size={15} style={{ color: '#eab308' }} /> {selectedDayContent.competition.title}</h4>
                                        {selectedDayContent.competition.location && (
                                            <p className="text-xs opacity-70 mt-2 flex items-center gap-1"><MapPin size={12} /> {selectedDayContent.competition.location}</p>
                                        )}
                                        {selectedDayContent.competition.notes && (
                                            <p className="text-xs mt-1 italic opacity-80">{selectedDayContent.competition.notes}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setSelectedDayContent(null)}
                            className="w-full mt-6 py-3 font-bold rounded-2xl transition-all text-sm"
                            style={{ backgroundColor: withAlpha(accentColor, 0.12), color: accentColor }}
                        >
                            Понятно
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
