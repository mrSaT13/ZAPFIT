import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Activity, Plus, X, Zap, Heart, Timer, TrendingUp } from "lucide-react";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function RideAnalysis({ theme, accentColor, user: initialUser }) {
    const [rides, setRides] = useState([]);
    const [selectedRides, setSelectedRides] = useState([]); // Поддержка нескольких заездов
    const [chartData, setChartData] = useState(null);
    const [compareMetrics, setCompareMetrics] = useState([]);
    const [user, setUser] = useState(initialUser || null);

    useEffect(() => {
        const load = async () => {
            const data = await api.getRides();
            setRides(data || []);
            if (!initialUser && window.electronAPI.getUser) {
              const u = await window.electronAPI.getUser();
              setUser(u);
            }
        };
        load();
    }, [initialUser]);

    useEffect(() => {
        if (selectedRides.length > 0) {
            updateChart();
            updateCompareMetrics();
        } else {
            setChartData(null);
            setCompareMetrics([]);
        }
    }, [selectedRides, theme]);

    const handleAddRide = (rideId) => {
        if (!rideId) return;
        const ride = rides.find(r => r.id === parseInt(rideId));
        if (ride && !selectedRides.find(r => r.id === ride.id)) {
            setSelectedRides([...selectedRides, ride]);
        }
    };

    const removeRide = (id) => {
        setSelectedRides(selectedRides.filter(r => r.id !== id));
    };

    const updateCompareMetrics = () => {
        const colors = [
            "text-red-500",
            "text-blue-500",
            "text-purple-500"
        ];
        
        const metrics = selectedRides.map((ride, idx) => ({
            id: ride.id,
            title: ride.title || "Заезд",
            color: colors[idx % colors.length],
            max_hr: ride.max_hr || 0,
            avg_hr: ride.avg_hr || 0,
            max_power: ride.max_power || 0,
            avg_power: ride.avg_power || 0,
            distance: (ride.distance || 0).toFixed(1),
            duration: Math.floor(ride.duration / 60) + 'м ' + (ride.duration % 60) + 'с',
            tss: Math.round(ride.tss || 0)
        }));
        setCompareMetrics(metrics);
    };

    const updateChart = () => {
        const colors = [
            { border: "rgb(239, 68, 68)", bg: "rgba(239, 68, 68, 0.1)" },
            { border: "rgb(59, 130, 246)", bg: "rgba(59, 130, 246, 0.1)" },
            { border: "rgb(168, 85, 247)", bg: "rgba(168, 85, 247, 0.1)" }
        ];

            const datasets = [];
            let maxLen = 0;

            const ftp = user?.ftp || 200;
            const maxHr = 220 - (new Date().getFullYear() - new Date(user?.birthday || '1990-01-01').getFullYear());

            selectedRides.forEach((ride, index) => {
                let points = [];
                try {
                    points = typeof ride.points === "string" ? JSON.parse(ride.points) : (ride.points || []);
                } catch (e) {
                    console.error(e);
                }

                if (points.length > 0) {
                    const sampling = Math.max(1, Math.floor(points.length / 200));
                    const filtered = points.filter((_, i) => i % sampling === 0);
                    maxLen = Math.max(maxLen, filtered.length);

                    datasets.push({
                        label: `${ride.title || "Заезд"} (Пульс)`,
                        data: filtered.map(p => p.hr || 0),
                        borderColor: colors[index % colors.length].border,
                        backgroundColor: colors[index % colors.length].bg,
                        fill: true,
                        tension: 0.4,
                    });
                }
            });

            // Добавляем линии зон, если выбран только один заезд
            if (selectedRides.length === 1 && user) {
                // Линия ПАНО (Threshold) - примерно 90% от макс пульса или фикс значение
                datasets.push({
                    label: 'Threshold HR',
                    data: Array(maxLen).fill(Math.round(maxHr * 0.85)),
                    borderColor: 'rgba(234, 179, 8, 0.5)',
                    borderDash: [5, 5],
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false,
                });
            }

            setChartData({
                labels: Array.from({
                    length: maxLen
                }, (_, i) => i),
                datasets
            });
        };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: theme === "dark" ? "white" : "#1e293b" } },
            tooltip: { mode: "index", intersect: false }
        },
        scales: {
            y: {
                grid: { color: theme === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)" },
                ticks: { color: theme === "dark" ? "#94a3b8" : "#475569" }
            },
            x: { 
                display: false 
            }
        }
    };

    return (
        <div className={`p-6 space-y-6 min-h-screen ${theme === "dark" ? "text-white" : "text-slate-900"}`}>
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Activity className="text-blue-500" />
                    Анализ и Сравнение
                </h2>
                <div className="flex gap-2">
                    <select 
                        className={`border rounded-lg px-4 py-2 text-sm outline-none ${theme === "dark" ? "bg-slate-800 text-white border-white/10" : "bg-white text-slate-800 border-slate-200 shadow-sm"}`}
                        onChange={(e) => handleAddRide(e.target.value)}
                        value=""
                    >
                        <option value="">Добавить заезд для сравнения...</option>
                        {rides.map(r => (
                            <option key={r.id} value={r.id}>
                                {new Date(r.date).toLocaleDateString()} - {r.title || "Заезд"}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {selectedRides.map(ride => (
                    <div key={ride.id} className="flex items-center gap-2 bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full border border-blue-500/30 text-sm">
                        <span>{ride.title || "Заезд"}</span>
                        <button onClick={() => removeRide(ride.id)}><X size={14} /></button>
                    </div>
                ))}
            </div>

            {compareMetrics.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {compareMetrics.map(m => (
                        <div key={m.id} className={`p-6 rounded-2xl border ${theme === "dark" ? "bg-white/5 border-white/10" : "bg-white border-slate-200 shadow-sm"}`}>
                            <div className={`text-lg font-bold mb-4 ${m.color}`}>{m.title}</div>
                            <div className="space-y-3">
                                <MetricRow icon={<Heart size={16} />} label="Пульс (Ср/Макс)" value={`${m.avg_hr} / ${m.max_hr}`} />
                                <MetricRow icon={<Zap size={16} />} label="Мощность (Ср/Макс)" value={`${m.avg_power} / ${m.max_power} Вт`} />
                                <MetricRow icon={<Timer size={16} />} label="Длительность" value={m.duration} />
                                <MetricRow icon={<TrendingUp size={16} />} label="Дистанция / TSS" value={`${m.distance}км / ${m.tss}`} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {chartData ? (
                <div className={`${theme === "dark" ? "bg-white/5 border-white/10" : "bg-white border-slate-200 shadow-xl"} p-6 rounded-2xl border backdrop-blur-md`}>
                    <div className="h-[400px]">
                        <Line data={chartData} options={options} />
                    </div>
                </div>
            ) : (
                <div className={`flex flex-col items-center justify-center h-96 ${theme === "dark" ? "text-gray-500 border-white/10" : "text-slate-400 border-slate-200"} border-2 border-dashed rounded-3xl`}>
                    <Activity size={48} className="mb-4 opacity-20" />
                    <p>Выберите одну или несколько активностей для сравнения</p>
                </div>
            )}
        </div>
    );
}

const MetricRow = ({ icon, label, value }) => (
    <div className="flex justify-between items-center text-sm">
        <div className="flex items-center gap-2 text-gray-400">
            {icon}
            <span>{label}</span>
        </div>
        <span className="font-semibold">{value}</span>
    </div>
);