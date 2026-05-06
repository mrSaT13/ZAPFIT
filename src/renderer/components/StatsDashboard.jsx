import React, { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Target, Zap, Heart, TrendingUp } from 'lucide-react';

const StatsDashboard = ({ theme }) => {
    const [zoneData, setZoneData] = useState([]);
    const [hrData, setHrData] = useState([]);
    const [summary, setSummary] = useState({ maxHr: 0, avgHr: 0 });

    useEffect(() => {
        const loadStats = async () => {
            if (window.electronAPI) {
                const rides = await window.electronAPI.getRides();
                if (rides && rides.length > 0) {
                    const zones = [
                        { name: 'Z1 (Восст)', range: [0, 130], count: 0, color: '#94a3b8' },
                        { name: 'Z2 (База)', range: [131, 145], count: 0, color: '#22c55e' },
                        { name: 'Z3 (Темп)', range: [146, 160], count: 0, color: '#eab308' },
                        { name: 'Z4 (Лактат)', range: [161, 175], count: 0, color: '#f97316' },
                        { name: 'Z5 (Анаэроб)', range: [176, 220], count: 0, color: '#ef4444' },
                    ];

                    rides.forEach(r => {
                        const hr = r.avg_hr || 0;
                        const zone = zones.find(z => hr >= z.range[0] && hr <= z.range[1]);
                        if (zone) zone.count += 1;
                    });

                    setZoneData(zones.map(z => ({ name: z.name, time: z.count, color: z.color })));

                    const trends = rides.slice(0, 15).reverse().map(r => ({
                        date: new Date(r.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
                        hr: r.avg_hr,
                        tss: r.tss
                    }));
                    setHrData(trends);

                    const allHrs = rides.map(r => r.avg_hr).filter(h => h > 0);
                    setSummary({
                        maxHr: Math.max(...rides.map(r => r.max_hr || 0)),
                        avgHr: allHrs.length > 0 ? Math.round(allHrs.reduce((a, b) => a + b, 0) / allHrs.length) : 0
                    });
                }
            }
        };
        loadStats();
    }, []);

    return (
        <div className="space-y-8 animate-fade-in p-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-black text-white">Анализ Зон Интенсивности</h2>
                <div className="flex gap-4">
                    <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                        <span className="text-[10px] text-gray-500 uppercase block">Max HR</span>
                        <span className="text-xl font-bold text-red-400">{summary.maxHr} bpm</span>
                    </div>
                    <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                        <span className="text-[10px] text-gray-500 uppercase block">Avg HR</span>
                        <span className="text-xl font-bold text-blue-400">{summary.avgHr} bpm</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-md">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Target className="text-indigo-400" size={20} /> Распределение заездов по зонам
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={zoneData} layout="vertical" margin={{ left: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" stroke="#94a3b8" tick={{fontSize: 12}} width={100} />
                                <Tooltip 
                                    cursor={{fill: 'transparent'}}
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                />
                                <Bar dataKey="time" radius={[0, 4, 4, 0]}>
                                    {zoneData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-md">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <TrendingUp className="text-emerald-400" size={20} /> Тренд ЧСС и Нагрузки (TSS)
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={hrData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                <XAxis dataKey="date" stroke="#64748b" tick={{fontSize: 10}} />
                                <YAxis yAxisId="left" stroke="#f87171" domain={['dataMin - 10', 'dataMax + 10']} hide />
                                <YAxis yAxisId="right" orientation="right" stroke="#fb923c" hide />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                />
                                <Line 
                                    yAxisId="left" 
                                    type="monotone" 
                                    dataKey="hr" 
                                    stroke="#f87171" 
                                    strokeWidth={3} 
                                    dot={{r: 4, fill: '#ef4444'}} 
                                    activeDot={{r: 6}}
                                    name="Пульс"
                                />
                                <Line 
                                    yAxisId="right" 
                                    type="monotone" 
                                    dataKey="tss" 
                                    stroke="#fb923c" 
                                    strokeWidth={2} 
                                    strokeDasharray="5 5"
                                    dot={false}
                                    name="Нагрузка"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
            
            <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-3xl p-6">
                <p className="text-sm text-indigo-300 flex items-center gap-2">
                    <Zap size={16}/> 
                    <strong>Инсайт:</strong> Большинство ваших тренировок проходит в Z2. Это отлично для построения аэробной базы, но добавьте 1 сессию в неделю в Z4, чтобы повысить FTP.
                </p>
            </div>
        </div>
    );
};

export default StatsDashboard;
