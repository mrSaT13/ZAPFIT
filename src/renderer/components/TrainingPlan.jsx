import React, { useState, useEffect } from 'react';
import { Target, Zap, Trophy, Flame, ChevronRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-toastify';

const TrainingPlan = ({ user }) => {
  const [loading, setLoading] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [selectedActivities, setSelectedActivities] = useState([]);
  const [plan, setPlan] = useState(null);
  const [lmStudioUrl, setLmStudioUrl] = useState('http://localhost:1234/v1');

  useEffect(() => {
    const loadSavedPlan = async () => {
      // Загружаем настройки для URL LM Studio и плана
      if (window.electronAPI.getSettings) {
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
    };
    loadSavedPlan();
  }, []);

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
        "sessions": [
          {"day": "День 1", "type": "Вид", "duration": "Длительность", "intensity": "Интенсивность", "tss": "Число TSS"},
          ...
        ]
      }`;

      let response;
      try {
        response = await fetch(`${lmStudioUrl}/v1/chat/completions`, {
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

        const newPlan = {
          title: aiPlan.title || goals.find(g => g.id === selectedGoal).title,
          sessions: aiPlan.sessions
        };

        setPlan(newPlan);
        if (window.electronAPI.updateSetting) {
          await window.electronAPI.updateSetting('trainingPlan', JSON.stringify(newPlan));
        }
        toast.success('AI план успешно сгенерирован!');
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

  return (
    <div className="space-y-8 animate-fade-in p-2">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-8 border border-white/10 shadow-2xl">
        <h2 className="text-3xl font-bold text-white mb-6">Ваш AI Тренировочный План</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Левая колонка: Настройка */}
          <div className="space-y-6">
            <div>
              <p className="text-gray-400 mb-4 font-medium uppercase tracking-wider text-sm">1. Выберите основную цель</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {goals.map(goal => (
                  <button
                    key={goal.id}
                    onClick={() => setSelectedGoal(goal.id)}
                    className={`p-4 rounded-2xl border transition-all text-left flex items-start gap-4 ${
                      selectedGoal === goal.id 
                      ? 'bg-orange-500/20 border-orange-500 ring-1 ring-orange-500' 
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="p-2 bg-black/20 rounded-lg">{goal.icon}</div>
                    <div>
                      <h4 className="font-bold text-white">{goal.title}</h4>
                      <p className="text-xs text-gray-500">{goal.desc}</p>
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
          <div className="bg-black/20 rounded-2xl p-6 border border-white/5 min-h-[400px]">
            {plan && plan.sessions && Array.isArray(plan.sessions) ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <h3 className="text-xl font-bold text-orange-400">{plan.title}</h3>
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full border border-orange-500/30">Активен</span>
                </div>
                <div className="space-y-4">
                  {plan.sessions.map((s, i) => (
                    <div key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
                      <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-sm font-bold text-gray-400">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-blue-400 font-bold uppercase">{s.day}</span>
                          <span className="text-xs text-gray-500">TSS: {s.tss}</span>
                        </div>
                        <h4 className="text-white font-medium">{s.type}: {s.duration}</h4>
                        <p className="text-xs text-gray-400">Интенсивность: {s.intensity}</p>
                      </div>
                      <CheckCircle2 size={20} className="text-gray-700" />
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
    </div>
  );
};

export default TrainingPlan;