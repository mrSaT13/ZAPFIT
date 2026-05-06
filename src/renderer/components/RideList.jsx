import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Trash2, Edit2, X, Check, Eye } from 'lucide-react';
import { toast } from 'react-toastify';
import RideModal from './RideModal';

export default function RideList({ theme, onImport, onOpenManual }) {
    const [rides, setRides] = useState([]);
    const [editingRide, setEditingRide] = useState(null);
    const [editData, setEditData] = useState({ title: '', type: 'Ride' });
    const [selectedRide, setSelectedRide] = useState(null);

    const loadRides = async () => {
        const data = await api.getRides();
        setRides(data);
    };

    useEffect(() => {
        loadRides();
    }, []);

    const handleDelete = async (id) => {
        if(confirm('Удалить запись?')) {
            await api.deleteRide(id);
            toast.info('Активность удалена');
            loadRides();
        }
    };

    const handleEditClick = (ride) => {
        setEditingRide(ride.id);
        setEditData({ title: ride.title, type: ride.type || 'Ride' });
    };

    const handleSaveEdit = async (id) => {
        if (window.electronAPI.updateRide) {
            await window.electronAPI.updateRide(id, editData);
            toast.success('Изменения сохранены');
            setEditingRide(null);
            loadRides();
        } else {
            toast.error('Функция редактирования еще не реализована в Main');
        }
    };

    return (
        <div className="space-y-4 sm:space-y-6 max-h-full flex flex-col">
            <h2 className={`text-xl sm:text-2xl font-bold px-4 sm:px-6 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>История активностей</h2>
            <div className={`rounded-3xl border overflow-hidden backdrop-blur-md transition-all flex-1 flex flex-col mx-4 sm:mx-6 ${
                theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-xl shadow-slate-200/50'
            }`}>
                <div className="flex items-center justify-end gap-3 p-4">
                    <button onClick={async () => {
                        try {
                            toast.info('Импорт GPX...');
                            const res = onImport ? await onImport() : await api.importGpx();
                            if (res && res.success) { toast.success('GPX успешно загружен!'); setTimeout(loadRides, 800); }
                            else if (res) toast.error('Ошибка: ' + res.error);
                        } catch (e) { toast.error('Ошибка импорта'); }
                    }} className={`px-3 py-1.5 rounded-xl font-semibold bg-indigo-600 text-white hover:opacity-90`}>Загрузить GPX</button>
                    <button onClick={() => { if (onOpenManual) onOpenManual(); else toast.info('Откройте ручную форму в другом месте'); }} className={`px-3 py-1.5 rounded-xl font-semibold bg-amber-500 text-white hover:opacity-90`}>Добавить вручную</button>
                </div>
                <div className="overflow-x-auto min-w-full">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                        <thead className="sticky top-0">
                            <tr className={`border-b ${theme === 'dark' ? 'border-white/10 bg-white/5' : 'border-slate-100 bg-slate-50' }`}>
                                <th className="p-2 sm:p-4 text-[10px] sm:text-xs font-bold uppercase text-gray-400">Дата</th>
                                <th className="p-2 sm:p-4 text-[10px] sm:text-xs font-bold uppercase text-gray-400">Название</th>
                                <th className="p-2 sm:p-4 text-[10px] sm:text-xs font-bold uppercase text-gray-400">Тип</th>
                                <th className="p-2 sm:p-4 text-[10px] sm:text-xs font-bold uppercase text-gray-400 hidden sm:table-cell">Расстояние</th>
                                <th className="p-2 sm:p-4 text-[10px] sm:text-xs font-bold uppercase text-gray-400 hidden md:table-cell">Время</th>
                                <th className="p-2 sm:p-4 text-[10px] sm:text-xs font-bold uppercase text-gray-400 hidden lg:table-cell">Скорость</th>
                                <th className="p-2 sm:p-4 text-[10px] sm:text-xs font-bold uppercase text-gray-400 hidden lg:table-cell">Пульс</th>
                                <th className="p-2 sm:p-4 text-[10px] sm:text-xs font-bold uppercase text-gray-400">TSS</th>
                                <th className="p-2 sm:p-4 text-[10px] sm:text-xs font-bold uppercase text-gray-400 text-center">Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rides.map(ride => (
                                <tr key={ride.id} className={`border-b transition-colors text-xs sm:text-sm ${
                                    theme === 'dark' ? 'border-white/5 hover:bg-white/5' : 'border-slate-50 hover:bg-slate-50/50'
                                }`}>
                                    <td className="p-2 sm:p-4 font-medium whitespace-nowrap">{new Date(ride.date).toLocaleDateString()}</td>
                                    <td className="p-2 sm:p-4 truncate">
                                        {editingRide === ride.id ? (
                                            <input 
                                                value={editData.title}
                                                onChange={(e) => setEditData({...editData, title: e.target.value})}
                                                className={`border rounded px-2 py-1 text-xs outline-none w-full ${
                                                    theme === 'dark' ? 'bg-black/40 border-gray-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                                                }`}
                                            />
                                        ) : (
                                            <span className={`font-semibold truncate ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{ride.title || 'Без названия'}</span>
                                        )}
                                    </td>
                                    <td className="p-2 sm:p-4 whitespace-nowrap">
                                        <span className="text-[9px] sm:text-[10px] font-bold bg-blue-500/10 text-blue-500 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full uppercase tracking-wider">{ride.type || 'Ride'}</span>
                                    </td>
                                    <td className="p-2 sm:p-4 font-bold hidden sm:table-cell">{ride.distance ? (ride.distance).toFixed(1) : '0.0'}</td>
                                    <td className="p-2 sm:p-4 text-gray-500 hidden md:table-cell">{ride.duration ? (ride.duration / 60).toFixed(0) : 0}м</td>
                                    <td className="p-2 sm:p-4 text-green-400 font-medium hidden lg:table-cell">{ride.avg_speed || '-'}</td>
                                    <td className="p-2 sm:p-4 text-red-400 font-medium hidden lg:table-cell">{ride.avg_hr || '-'}</td>
                                    <td className="p-2 sm:p-4 font-black text-orange-400 whitespace-nowrap">{ride.tss ? ride.tss.toFixed(0) : 0}</td>
                                    <td className="p-2 sm:p-4">
                                        <div className="flex gap-1 justify-center flex-nowrap">
                                            {editingRide === ride.id ? (
                                                <>
                                                    <button onClick={(e) => { e.stopPropagation(); handleSaveEdit(ride.id); }} className="p-2 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white rounded-xl transition-all"><Check size={16}/></button>
                                                    <button onClick={(e) => { e.stopPropagation(); setEditingRide(null); }} className="p-2 bg-gray-500/10 text-gray-500 hover:bg-gray-500 hover:text-white rounded-xl transition-all"><X size={16}/></button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={(e) => { e.stopPropagation(); setSelectedRide(ride); }} className={`p-2 rounded-xl transition-all ${
                                                        theme === 'dark' ? 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white'
                                                    }`} title="Посмотреть детали и карту"><Eye size={16}/></button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleEditClick(ride); }} className={`p-2 rounded-xl transition-all ${
                                                        theme === 'dark' ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white'
                                                    }`}><Edit2 size={16}/></button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(ride.id); }} className={`p-2 rounded-xl transition-all ${
                                                        theme === 'dark' ? 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white' : 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white'
                                                    }`}><Trash2 size={16}/></button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Детальное модальное окно */}
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