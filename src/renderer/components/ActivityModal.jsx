import React, { useState } from 'react';
import { X, MapPin, Clock, Zap, Heart, TrendingUp, Mountain } from 'lucide-react';

export default function ActivityModal({ activity, onClose, theme }) {
  if (!activity) return null;

  const bgClass = theme === 'dark' ? 'bg-slate-900' : 'bg-white';
  const borderClass = theme === 'dark' ? 'border-slate-700' : 'border-slate-200';
  const textClass = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const subTextClass = theme === 'dark' ? 'text-slate-400' : 'text-slate-600';

  const durationMinutes = Math.round(activity.duration / 60);
  const durationHours = (activity.duration / 3600).toFixed(1);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`${bgClass} rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${borderClass}`}>
          <div>
            <h2 className={`text-2xl font-bold ${textClass}`}>{activity.title || 'Тренировка'}</h2>
            <p className={subTextClass}>{new Date(activity.date).toLocaleString('ru-RU')}</p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-slate-100'
            }`}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Main Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className={subTextClass}>Расстояние</p>
              <p className={`text-2xl font-bold ${textClass}`}>{activity.distance || 0} км</p>
            </div>
            <div>
              <p className={subTextClass}>Время</p>
              <p className={`text-2xl font-bold ${textClass}`}>{durationHours}h</p>
              <p className={`${subTextClass} text-xs`}>{durationMinutes} мин</p>
            </div>
            <div>
              <p className={subTextClass}>Средняя скорость</p>
              <p className={`text-2xl font-bold ${textClass}`}>
                {activity.distance && activity.duration
                  ? ((activity.distance * 3600) / activity.duration).toFixed(1)
                  : 0}{' '}
                км/ч
              </p>
            </div>
            <div>
              <p className={subTextClass}>TSS</p>
              <p className={`text-2xl font-bold ${textClass}`}>{activity.tss || 0}</p>
            </div>
          </div>

          {/* HR Stats */}
          {(activity.avg_hr || activity.max_hr) && (
            <div className="grid grid-cols-2 gap-4">
              {activity.avg_hr && (
                <div>
                  <p className={`${subTextClass} flex items-center gap-2`}>
                    <Heart size={16} /> Средний пульс
                  </p>
                  <p className={`text-xl font-bold ${textClass}`}>{activity.avg_hr} bpm</p>
                </div>
              )}
              {activity.max_hr && (
                <div>
                  <p className={`${subTextClass} flex items-center gap-2`}>
                    <Heart size={16} /> Макс пульс
                  </p>
                  <p className={`text-xl font-bold ${textClass}`}>{activity.max_hr} bpm</p>
                </div>
              )}
            </div>
          )}

          {/* Power Stats */}
          {activity.avg_power && (
            <div>
              <p className={`${subTextClass} flex items-center gap-2 mb-2`}>
                <Zap size={16} /> Средняя мощность
              </p>
              <p className={`text-xl font-bold ${textClass}`}>{activity.avg_power} W</p>
            </div>
          )}

          {/* Elevation */}
          {activity.elevation_gain && (
            <div>
              <p className={`${subTextClass} flex items-center gap-2 mb-2`}>
                <Mountain size={16} /> Набор высоты
              </p>
              <p className={`text-xl font-bold ${textClass}`}>{activity.elevation_gain} м</p>
            </div>
          )}

          {/* Type & RPE */}
          <div className="grid grid-cols-2 gap-4">
            {activity.type && (
              <div>
                <p className={subTextClass}>Тип</p>
                <p className={`text-lg font-semibold ${textClass}`}>{activity.type}</p>
              </div>
            )}
            {activity.rpe && (
              <div>
                <p className={subTextClass}>RPE (1-10)</p>
                <p className={`text-lg font-semibold ${textClass}`}>{activity.rpe}/10</p>
              </div>
            )}
          </div>

          {/* Notes */}
          {activity.notes && (
            <div>
              <p className={`${subTextClass} mb-2`}>Заметки</p>
              <p className={`${textClass} text-sm`}>{activity.notes}</p>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className={`p-6 border-t ${borderClass} flex gap-3`}>
          <button
            onClick={onClose}
            className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-all ${
              theme === 'dark'
                ? 'bg-white/10 hover:bg-white/20 text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
            }`}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
