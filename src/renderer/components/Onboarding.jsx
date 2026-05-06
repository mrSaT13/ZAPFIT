import React, { useState } from 'react';
import { User, Activity, ArrowRight } from 'lucide-react';

export default function Onboarding({ onComplete }) {
    const [name, setName] = useState('');
    const [weight, setWeight] = useState(75);

    const handleCreate = () => {
        if (!name) return;
        // Здесь можно сохранить пользователя в БД через API
        localStorage.setItem('user_name', name);
        localStorage.setItem('user_weight', weight);
        onComplete();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm">
            <div className="glass-panel p-8 rounded-2xl w-full max-w-md text-center animate-fade-in-up">
                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/50">
                    <Activity size={32} className="text-white" />
                </div>
                <h1 className="text-3xl font-bold mb-2 text-white">Добро пожаловать</h1>
                <p className="text-slate-400 mb-8">Настрой свой профиль для точного расчета TSS и калорий.</p>
                
                <div className="space-y-4 text-left">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Имя атлета</label>
                        <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="Например: Alex"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Вес (кг)</label>
                        <input 
                            type="number" 
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>
                </div>

                <button 
                    onClick={handleCreate}
                    className="mt-8 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 group"
                >
                    Начать тренировки
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
    );
}