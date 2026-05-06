import React from 'react';
import { X, Calendar, Clock, Map as MapIcon, Zap, Heart, TrendingUp, Info } from 'lucide-react';

const RideModal = ({ ride, onClose, theme }) => {
    if (!ride) return null;

    // Парсим точки для карты, если они есть
    let points = [];
    try {
        points = ride.points ? JSON.parse(ride.points) : [];
    } catch (e) {
        console.error("Failed to parse map points", e);
    }

    // Генерация SVG пути для мини-карты
    const renderMiniMap = () => {
        if (points.length < 2) return (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-black/20 rounded-3xl border border-white/5">
                <MapIcon size={48} className="mb-2 opacity-20" />
                <p className="text-sm">Данные GPS отсутствуют</p>
            </div>
        );

        const lats = points.map(p => p.lat);
        const lons = points.map(p => p.lon);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);

        const width = 500;
        const height = 300;
        const padding = 40;

        const scaleX = (width - padding * 2) / (maxLon - minLon || 1);
        const scaleY = (height - padding * 2) / (maxLat - minLat || 1);
        const scale = Math.min(scaleX, scaleY);

        const centerX = (maxLon + minLon) / 2;
        const centerY = (maxLat + minLat) / 2;

        const project = (lat, lon) => {
            const x = width / 2 + (lon - centerX) * scale;
            const y = height / 2 - (lat - centerY) * scale;
            return `${x},${y}`;
        };

        const pathData = points.map(p => project(p.lat, p.lon)).join(' L ');

        return (
            <div className="relative h-full bg-slate-900 rounded-3xl overflow-hidden border border-white/10 group shadow-2xl">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full p-4 drop-shadow-2xl">
                    <path
                        d={`M ${pathData}`}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                    />
                    {/* Start point */}
                    <circle cx={project(points[0].lat, points[0].lon).split(',')[0]} cy={project(points[0].lat, points[0].lon).split(',')[1]} r="4" fill="#22c55e" />
                    {/* End point */}
                    <circle cx={project(points[points.length-1].lat, points[points.length-1].lon).split(',')[0]} cy={project(points[points.length-1].lat, points[points.length-1].lon).split(',')[1]} r="4" fill="#ef4444" />
                </svg>
                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                    GPS Трек зафиксирован
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className={`relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-[2.5rem] border shadow-2xl flex flex-col ${
                theme === 'dark' ? 'bg-[#0f172a] border-white/10' : 'bg-white border-slate-200'
            }`}>
                {/* Header */}
                <div className="p-8 pb-4 flex justify-between items-start">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-bold uppercase tracking-wider border border-indigo-500/20">
                                {ride.type || 'Ride'} 
                            </span>
                            <div className="flex items-center text-gray-500 text-sm">
                                <Calendar size={14} className="mr-1.5" />
                                {new Date(ride.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </div>
                        </div>
                        <h2 className="text-3xl font-black text-white">{ride.title || 'Активность без названия'}</h2>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-gray-400 hover:text-white transition-all border border-white/5"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 pt-0 space-y-8">
                    {/* Main Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white/5 border border-white/5 rounded-3xl p-6 hover:border-white/20 transition-all group">
                            <div className="text-gray-500 text-xs mb-1 group-hover:text-indigo-400 transition-colors">Дистанция</div>
                            <div className="text-2xl font-black text-white">{ride.distance?.toFixed(2)} <span className="text-sm font-normal text-gray-400">км</span></div>
                        </div>
                        <div className="bg-white/5 border border-white/5 rounded-3xl p-6 hover:border-white/20 transition-all group">
                            <div className="text-gray-500 text-xs mb-1 group-hover:text-amber-400 transition-colors">Время</div>
                            <div className="text-2xl font-black text-white">{Math.floor(ride.duration / 3600)}<span className="text-sm font-normal text-gray-400">ч</span> {Math.floor((ride.duration % 3600) / 60)}<span className="text-sm font-normal text-gray-400">м</span></div>
                        </div>
                        <div className="bg-white/5 border border-white/5 rounded-3xl p-6 hover:border-white/20 transition-all group">
                            <div className="text-gray-500 text-xs mb-1 group-hover:text-emerald-400 transition-colors">Набор высоты</div>
                            <div className="text-2xl font-black text-white">{Math.round(ride.elevation_gain || 0)} <span className="text-sm font-normal text-gray-400">м</span></div>
                        </div>
                        <div className="bg-white/5 border border-white/5 rounded-3xl p-6 hover:border-white/20 transition-all group">
                            <div className="text-gray-500 text-xs mb-1 group-hover:text-orange-400 transition-colors">TSS Нагрузка</div>
                            <div className="text-2xl font-black text-white text-orange-400">{Math.round(ride.tss || 0)}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left Column: Map */}
                        <div className="lg:col-span-2 h-[400px]">
                            {renderMiniMap()}
                        </div>

                        {/* Right Column: Physiological Metrics */}
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Zap className="text-yellow-400" size={20} /> Физиология
                            </h3>
                            
                            <div className="space-y-4">
                                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-red-500/20 text-red-500 rounded-lg"><Heart size={16}/></div>
                                        <span className="text-sm text-gray-400">Средний пульс</span>
                                    </div>
                                    <span className="font-bold text-white">{ride.avg_hr || '—'} bpm</span>
                                </div>
                                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-500/20 text-blue-500 rounded-lg"><TrendingUp size={16}/></div>
                                        <span className="text-sm text-gray-400">Средняя скорость</span>
                                    </div>
                                    <span className="font-bold text-white">{ride.avg_speed || '—'} км/ч</span>
                                </div>
                                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-500/20 text-purple-500 rounded-lg"><Info size={16}/></div>
                                        <span className="text-sm text-gray-400">Сложность (RPE)</span>
                                    </div>
                                    <span className="font-bold text-white">{ride.rpe || '—'} / 10</span>
                                </div>
                            </div>

                            {/* AI Insights placeholder */}
                            <div className="p-6 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-3xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:rotate-12 transition-transform">
                                    <Zap size={40} />
                                </div>
                                <h4 className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase mb-3 relative z-10">
                                    <Zap size={14}/> Мнение AI-тренера
                                </h4>
                                <p className="text-sm text-gray-300 leading-relaxed italic relative z-10">
                                    {ride.tss > 150 ? (
                                        "Чудовищная нагрузка! Ваша сердечно-сосудистая система работала на пределе. Срочно восполните запас гликогена и забудьте о тренировках на следующие 48 часов."
                                    ) : ride.tss > 80 ? (
                                        "Отличная развивающая сессия. Вы эффективно поработали над выносливостью. Завтра лучше провести восстановительный заезд."
                                    ) : ride.type === 'Run' ? (
                                        "Хорошая беговая работа. Обратите внимание на каденс и технику приземления, чтобы минимизировать ударную нагрузку."
                                    ) : (
                                        "Легкая активность для поддержания тонуса. Идеально вписывается в план восстановления."
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RideModal;