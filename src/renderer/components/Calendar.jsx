import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, Target, Clock, Zap } from 'lucide-react';

export default function TrainingCalendar({ theme, accentColor }) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [rides, setRides] = useState([]);
    const [selectedDayContent, setSelectedDayContent] = useState(null);
    const [trainingPlan, setTrainingPlan] = useState(null);
    const [waterHistory, setWaterHistory] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            if (window.electronAPI.getRides) {
                const data = await window.electronAPI.getRides();
                setRides(data);
            }
            // Load training plan from DB table if available
            try {
                if (window.electronAPI.getTrainingPlan) {
                    const plans = await window.electronAPI.getTrainingPlan();
                    // normalize to object with sessions by day index if legacy format not present
                    setTrainingPlan(Array.isArray(plans) ? plans : (plans || null));
                } else if (window.electronAPI.getSettings) {
                    const settings = await window.electronAPI.getSettings();
                    if (settings.trainingPlan) {
                        try { setTrainingPlan(JSON.parse(settings.trainingPlan)); } catch (e) { console.error("Error parsing training plan", e); }
                    }
                }
            } catch (e) { console.error('load training plan', e); }

            // Load water history
            try {
                if (window.electronAPI.getWaterHistory) {
                    const wh = await window.electronAPI.getWaterHistory();
                    setWaterHistory(wh || []);
                }
            } catch (e) { console.error('load water history', e); }
        };
        fetchData();
    }, []);

    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const monthNames = [
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days = daysInMonth(year, month);
    const firstDay = (firstDayOfMonth(year, month) + 6) % 7; // Понедельник - первый день

    const calendarDays = [];
    for (let i = 0; i < firstDay; i++) {
        calendarDays.push(null);
    }
    for (let i = 1; i <= days; i++) {
        calendarDays.push(i);
    }

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
            const dateStr = new Date(year, month, day).toISOString().split('T')[0];
            return trainingPlan.find(p => p.date && p.date.startsWith(dateStr)) || null;
        }
        if (trainingPlan.sessions) return trainingPlan.sessions[day - 1] || null;
        return null;
    };

    const cardClass = theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm';

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl" style={{ backgroundColor: `${accentColor}20` }}>
                        <CalendarIcon style={{ color: accentColor }} size={32} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold">Календарь</h2>
                        <p className={theme === 'dark' ? 'text-gray-400' : 'text-slate-500'}>Ваш план и история тренировок</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4 bg-white/5 p-2 rounded-2xl border border-white/10">
                    <button onClick={prevMonth} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                        <ChevronLeft size={20} />
                    </button>
                    <span className="font-bold min-w-[120px] text-center">
                        {monthNames[month]} {year}
                    </span>
                    <button onClick={nextMonth} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            <div className={`${cardClass} border rounded-3xl overflow-hidden`}>
                <div className="grid grid-cols-7 border-b border-white/10">
                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                        <div key={day} className="p-4 text-center text-sm font-bold text-slate-500 uppercase tracking-wider">
                            {day}
                        </div>
                    ))}
                </div>
                
                <div className="grid grid-cols-7 grid-rows-5 h-[600px]">
                    {calendarDays.map((day, idx) => {
                        const dayRides = getRidesForDay(day);
                        const planSession = getPlanForDay(day);
                        const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                        
                        return (
                            <div 
                                key={idx} 
                                className={`border-r border-b border-white/10 p-2 transition-colors hover:bg-white/5 cursor-pointer relative ${!day ? 'bg-black/5' : ''}`}
                                onClick={() => day && setSelectedDayContent({ day, rides: dayRides, plan: planSession })}
                            >
                                {day && (
                                    <>
                                        <span className={`text-sm font-medium ${isToday ? 'bg-blue-600 text-white w-6 h-6 flex items-center justify-center rounded-full' : 'text-slate-400'}`}>
                                            {day}
                                        </span>
                                        
                                        <div className="mt-2 space-y-1 overflow-y-auto max-h-[80px]">
                                            {planSession && (
                                                    <div className="text-[10px] p-1 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 truncate">
                                                        🎯 {planSession.type || planSession.title}
                                                    </div>
                                            )}
                                                {dayRides.map(ride => (
                                                <div 
                                                    key={ride.id}
                                                    className="text-[10px] p-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 truncate"
                                                    title={ride.title}
                                                >
                                                    🚴 {ride.distance} км
                                                </div>
                                            ))}
                                                {/* show water badge if present */}
                                                {(() => {
                                                    const dateStr = new Date(year, month, day).toISOString().split('T')[0];
                                                    const wh = waterHistory.find(w => w.date && w.date.startsWith(dateStr));
                                                    if (wh) return (
                                                        <div className="text-[10px] p-1 rounded bg-blue-200/10 text-blue-200 border border-blue-200/20 truncate mt-1">💧 {wh.liters} л</div>
                                                    );
                                                    return null;
                                                })()}
                                        </div>

                                        <button className="absolute bottom-2 right-2 p-1 rounded-full opacity-0 hover:opacity-100 transition-opacity bg-white/10 text-slate-400">
                                            <Plus size={14} />
                                        </button>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Модальное окно деталей дня */}
            {selectedDayContent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedDayContent(null)}>
                    <div className="bg-[#0f172a] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-bold text-white">{selectedDayContent.day} {monthNames[month]}</h3>
                            <button onClick={() => setSelectedDayContent(null)} className="p-2 hover:bg-white/5 rounded-full text-gray-500"><Plus className="rotate-45" /></button>
                        </div>

                        <div className="space-y-6">
                            {selectedDayContent.plan ? (
                                <div>
                                    <p className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-3">План тренера:</p>
                                    <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl">
                                        <h4 className="font-bold text-white flex items-center gap-2">
                                            <Target size={16} className="text-orange-500" /> {selectedDayContent.plan.title || selectedDayContent.plan.type}
                                        </h4>
                                        <div className="flex flex-wrap gap-3 mt-2">
                                            <span className="text-xs text-gray-400 flex items-center gap-1"><Clock size={12}/> {selectedDayContent.plan.duration}</span>
                                            <span className="text-xs text-gray-400 flex items-center gap-1"><Zap size={12}/> {selectedDayContent.plan.intensity}</span>
                                        </div>
                                        <div className="mt-2 text-xs text-orange-400 font-medium">Рекомендуемый TSS: {selectedDayContent.plan.tss}</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center p-4 border border-dashed border-white/10 rounded-2xl text-gray-600 text-sm">
                                    На этот день план не задан
                                </div>
                            )}

                            <div>
                                <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-3">Завершенные тренировки:</p>
                                {selectedDayContent.rides.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedDayContent.rides.map((a, i) => (
                                            <div key={i} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                                                <div>
                                                    <h4 className="font-bold text-white text-sm">{a.title}</h4>
                                                    <p className="text-[10px] text-gray-500">{Math.round(a.duration/60)} мин | {a.distance} км</p>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-bold text-blue-400">TSS: {Math.round(a.tss)}</div>
                                                    <div className="text-[10px] text-gray-600">{a.avg_hr} bpm</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-600 text-xs italic text-center p-4">Нет выполненных тренировок</p>
                                )}
                            </div>
                        </div>
                        
                        <button 
                            onClick={() => setSelectedDayContent(null)}
                            className="w-full mt-8 py-4 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 font-bold rounded-2xl transition-all border border-orange-500/20"
                        >
                            Понятно
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
