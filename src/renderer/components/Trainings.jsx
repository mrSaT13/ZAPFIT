import React, { useState } from 'react';
import { ClipboardList, Dumbbell } from 'lucide-react';
import { withAlpha } from '../theme';
import TrainingPlan from './TrainingPlan';
import Strength from './Strength';

// Топ-уровень «Тренировки» (parity с мобилой WorkoutsScreen):
// планы тренировок + силовые. Раньше жили скрытыми табами внутри Активностей.
export default function Trainings({ theme, accentColor, user }) {
  const [tab, setTab] = useState('plans');
  const tabs = [
    { id: 'plans', label: 'Планы', icon: ClipboardList },
    { id: 'strength', label: 'Силовые', icon: Dumbbell },
  ];
  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent flex items-center gap-3 mb-1 ${theme === 'dark' ? 'from-white to-gray-400' : 'from-slate-900 to-slate-500'}`}>
          <Dumbbell size={28} style={{ color: accentColor }} />
          Тренировки
        </h1>
        <p className={theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}>
          Планы тренировок и силовые сессии
        </p>
      </div>
      <div className="zap-card mb-6 overflow-hidden">
        <div className="flex flex-wrap gap-1.5 p-3">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-4 py-2 rounded-2xl font-semibold transition-all flex items-center gap-2 text-sm"
                style={active ? { backgroundColor: withAlpha(accentColor, 0.16), color: accentColor } : { color: undefined }}
                onMouseEnter={(e) => { if (tab !== t.id) e.currentTarget.style.backgroundColor = withAlpha(accentColor, 0.07); }}
                onMouseLeave={(e) => { if (tab !== t.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Icon size={18} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="p-4 sm:p-6 border-t border-white/5">
          {tab === 'plans' && <TrainingPlan theme={theme} accentColor={accentColor} user={user} embedded />}
          {tab === 'strength' && <Strength theme={theme} accentColor={accentColor} embedded />}
        </div>
      </div>
    </div>
  );
}
