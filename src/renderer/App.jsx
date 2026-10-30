import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import useAutoSync from './hooks/useAutoSync';
import Dashboard from './components/Dashboard';
import Profile from './components/Profile';
import RideList from './components/RideList';
import Trainings from './components/Trainings';
import TrainingPlan from './components/TrainingPlan';
import Settings from './components/Settings';
import AIChat from './components/AIChat';
import TrainingCalendar from './components/Calendar';
import ManualActivityModal from './components/ManualActivityModal';
import Health from './components/Health';
import Strength from './components/Strength';
import About from './components/About';
import Gears from './components/Gears';
import Competitions from './components/Competitions';
import Notifications from './components/Notifications';
import Followers from './components/Followers';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AnimatePresence, motion } from 'framer-motion';

function App() {
  useAutoSync();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [accentColor, setAccentColor] = useState('#5EADEB'); // mobile darkPrimary, light #1976D2
  const [textColor, setTextColor] = useState('auto'); // auto, white, black
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [rides, setRides] = useState([]);

  const [waterCount, setWaterCount] = useState(0);
  const [waterCupMl, setWaterCupMl] = useState(200);
  const [recommendedWater, setRecommendedWater] = useState(null);
  const [waterHistory, setWaterHistory] = useState([]);
  const [totalWaterLiters, setTotalWaterLiters] = useState(0);
  const [appVersion, setAppVersion] = useState('1.0.0');

  useEffect(() => {
    const loadData = async () => {
      console.log('[App] window.electronAPI check:', {
        windowExists: typeof window !== 'undefined',
        electronAPIExists: !!(window?.electronAPI),
        electronAPI: window?.electronAPI
      });
      const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
      if (api) {
        // 1. Загружаем пользователя
        const userData = await api.getUser();
        setUser(userData);
        if (!userData) {
          // first run: prompt to create profile
          toast.info('Похоже у вас ещё нет профиля — создайте его в разделе Профиль');
        }

        // 2. Загружаем настройки
        const settings = await api.getSettings();
        if (settings.theme) setTheme(settings.theme);
        if (settings.accentColor) setAccentColor(settings.accentColor);
        if (settings.textColor) setTextColor(settings.textColor);
        if (settings.waterCount) setWaterCount(parseInt(settings.waterCount) || 0);
        if (settings.waterCupMl) setWaterCupMl(parseInt(settings.waterCupMl) || 200);
        // Daily reset: archive previous day and reset counter if needed
        try {
          if (api.dailyResetWater) {
            const dr = await api.dailyResetWater();
            if (dr && typeof dr.waterCount !== 'undefined') setWaterCount(parseInt(dr.waterCount)||0);
          }
        } catch (e) { console.error('daily reset failed', e); }

        // Recommended water
        try {
          if (api.getRecommendedWater) {
            const rec = await api.getRecommendedWater();
            if (rec && rec.success) setRecommendedWater(rec.liters);
          }
        } catch (e) { console.error('getRecommendedWater failed', e); }

        // 3. Определяем время суток (теперь только для стейта)
        const hour = new Date().getHours();
        if (hour < 6) setGreeting('Доброй ночи');
        else if (hour < 12) setGreeting('Доброе утро');
        else if (hour < 18) setGreeting('Добрый день');
        else setGreeting('Добрый вечер');

        // 4. Load water history and totals
        try {
          if (api.getWaterHistory) {
            const h = await api.getWaterHistory();
            setWaterHistory(h || []);
            const total = (h || []).reduce((s, r) => s + (parseFloat(r.liters) || 0), 0);
            setTotalWaterLiters(+total.toFixed(2));
          }
        } catch (e) { console.error('getWaterHistory failed', e); }
      }
      setLoading(false);
    };
    loadData();
    const onSettings = async () => {
      const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
      if (api && api.getSettings) {
        const settings = await api.getSettings();
        if (settings.waterCupMl) setWaterCupMl(parseInt(settings.waterCupMl));
      }
    };
    window.addEventListener('settings-updated', onSettings);
    const onProfile = async ()=>{
      const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
      if (api?.getUser){ const u = await api.getUser(); setUser(u); }
    };
    window.addEventListener('profile-updated', onProfile);
    window.addEventListener('activities-updated', onProfile);
    window.addEventListener('water-updated', async () => {
      // refresh water history and total
      const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
      if (api && api.getWaterHistory) {
        const h = await api.getWaterHistory();
        setWaterHistory(h || []);
        const total = (h || []).reduce((s, r) => s + (parseFloat(r.liters) || 0), 0);
        setTotalWaterLiters(+total.toFixed(2));
        // update today's ml as well
        if (api.getWaterToday) {
          const w = await api.getWaterToday();
          setWaterCount(w && w.row && w.row.ml ? Math.floor((w.row.ml || 0) / (waterCupMl || 200)) : 0);
        }
      }
    });
    return () => {
      window.removeEventListener('settings-updated', onSettings);
      window.removeEventListener('profile-updated', onProfile);
      window.removeEventListener('activities-updated', onProfile);
      window.removeEventListener('water-updated', ()=>{});
    };
  }, []);

  // Toggle CSS-vars theme for zap-card/glass (global.css .light-theme)
  useEffect(() => {
    try { document.documentElement.classList.toggle('light-theme', theme === 'light'); } catch {}
  }, [theme]);

  const handleUpdateWater = async (count) => {
    // `count` may be passed as liters (from WaterTabContent) -> convert to number of cups
    const cupMl = waterCupMl || 200;
    const addedCups = (count && count < 10) ? Math.round((count * 1000) / cupMl) : Math.round(count);
    const newCount = Math.max(0, Math.round(waterCount + addedCups));
    setWaterCount(newCount);
    const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
    if (api && api.updateSetting) {
      await api.updateSetting('waterCount', newCount.toString());
    }
  };

  const handleLogout = () => {
    // Для нашего локального приложения "выход" - это сброс к онбордингу или просто уведомление
    toast.info('Выход из профиля...');
    setTimeout(() => {
        setUser(null);
        setActiveTab('profile'); // Или на страницу входа, если она будет
    }, 1000);
  };

  const handleSaveUser = async (data) => {
    if (window.electronAPI) {
      try {
        const updatedUser = await window.electronAPI.saveUser(data);
        setUser(updatedUser);
        toast.success('Профиль сохранен!');
      } catch (err) {
        toast.error('Ошибка сохранения: ' + err.message);
      }
    }
  };

    // Handlers
    const handleSaveManual = async (data) => {
        try {
            const res = await window.electronAPI.addManualActivity(data);
            if (res.success) {
                setIsManualModalOpen(false);
                toast.success('Активность добавлена!');
                // Обновление без перезагрузки: если мы на дашборде или в списке, 
                // можно вызвать повторный фетч данных. Для простоты сейчас:
                setTimeout(() => window.location.reload(), 1000);
            }
        } catch (err) {
            console.error("Save error:", err);
            toast.error('Ошибка сохранения');
        }
    };

    const handleImportGpx = async () => {
    if (window.electronAPI) {
      toast.info('Импорт GPX...');
      const res = await window.electronAPI.importGpx();
      if (res && res.success) {
        toast.success('GPX успешно загружен!');
        setTimeout(() => window.location.reload(), 1500);
      } else if (res) {
        toast.error('Ошибка: ' + res.error);
      }
      return res;
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-[#0f172a] to-[#1a2a3a] text-white">
      <motion.div
        className="mb-8"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="w-20 h-20 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
      </motion.div>
      <motion.h1
        className="text-3xl font-bold mb-2"
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        ZAPFIT
      </motion.h1>
      <p className="text-gray-400 mb-8">Загрузка приложения...</p>
    </div>
  );

  const currentTextColor = textColor === 'auto' 
    ? (theme === 'dark' ? 'text-white' : 'text-slate-900') 
    : (textColor === 'white' ? 'text-white' : 'text-black');

  return (
    <div className={`flex h-screen ${theme === 'dark' ? 'bg-[#101418]' : 'bg-white'} ${currentTextColor} overflow-hidden font-sans`}>
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        theme={theme}
        toggleTheme={() => {
          const newTheme = theme === 'dark' ? 'light' : 'dark';
          setTheme(newTheme);
          // Акцент НЕ трогаем — выбор пользователя переживает смену темы
          const api = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
          if (api && api.updateSetting) {
            api.updateSetting('theme', newTheme);
          }
        }}
        accentColor={accentColor}
      />
      
      <main className={`flex-1 min-w-0 overflow-y-auto relative transition-colors ${theme === 'dark' ? 'bg-[#101418]' : 'bg-[#F4F6FA]'}`}>
        <TitleBar />
        <ToastContainer theme={theme === 'dark' ? 'dark' : 'light'} position="bottom-right" />
        {/* Фон как в мобилке: сид-градиент + мягкие пятна */}
        <div className={`fixed top-0 left-0 w-full h-full pointer-events-none z-0 ${theme === 'dark' ? 'opacity-50' : 'opacity-30'}`}>
           <div
             className="absolute top-[-12%] right-[-5%] w-[28rem] h-[28rem] rounded-full blur-3xl"
             style={{ background: `linear-gradient(135deg, ${accentColor}55, #7C3AED44)` }}
           ></div>
           <div
             className="absolute bottom-[-12%] left-[10%] w-[24rem] h-[24rem] rounded-full blur-3xl opacity-40"
             style={{ backgroundColor: accentColor }}
           ></div>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-6 sm:px-8 sm:py-8">
          {/* Приветствие переехало в Dashboard */}
          
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && (
                <Dashboard 
                  theme={theme} 
                  accentColor={accentColor} 
                  user={user} 
                  greeting={greeting}
                  waterCount={waterCount}
                  onUpdateWater={handleUpdateWater}
                  recommendedWater={recommendedWater}
                  totalWaterLiters={totalWaterLiters}
                  onOpenManual={() => setIsManualModalOpen(true)} 
                   onNavigate={(tab) => setActiveTab(tab)}
                  />
              )}
              {activeTab === 'rides' && <RideList theme={theme} accentColor={accentColor} onImport={handleImportGpx} onOpenManual={() => setIsManualModalOpen(true)} user={user} />}
              {activeTab === 'trainings' && <Trainings theme={theme} accentColor={accentColor} user={user} />}
              {activeTab === 'gears' && <Gears theme={theme} accentColor={accentColor} />}
              {activeTab === 'followers' && <Followers theme={theme} accentColor={accentColor} onNavigate={(tab) => setActiveTab(tab)} />}
              {activeTab === 'calendar' && <TrainingCalendar theme={theme} accentColor={accentColor} />}
              {activeTab === 'competitions' && <Competitions theme={theme} accentColor={accentColor} />}
              {activeTab === 'profile' && <Profile user={user} onSave={handleSaveUser} onLogout={handleLogout} onNavigate={setActiveTab} theme={theme} accentColor={accentColor} />}
              {activeTab === 'health' && <Health theme={theme} accentColor={accentColor} waterCount={waterCount} onUpdateWater={handleUpdateWater} recommendedWater={recommendedWater} totalWaterLiters={totalWaterLiters} />}
              {activeTab === 'strength' && <Strength theme={theme} accentColor={accentColor} />}
              {activeTab === 'notifications' && <Notifications theme={theme} accentColor={accentColor} />}
              {activeTab === 'about' && <About theme={theme} />}
              {activeTab === 'settings' && (
                <Settings 
                  onNavigate={setActiveTab} 
                  theme={theme} 
                  setTheme={setTheme}
                  accentColor={accentColor}
                  setAccentColor={setAccentColor}
                  textColor={textColor}
                  setTextColor={setTextColor}
                />
              )}
              {activeTab === 'plan' && <TrainingPlan theme={theme} accentColor={accentColor} user={user} />}
              {activeTab === 'chat' && <AIChat theme={theme} accentColor={accentColor} user={user} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <ManualActivityModal 
        isOpen={isManualModalOpen} 
        onClose={() => setIsManualModalOpen(false)} 
        onSave={handleSaveManual}
        accentColor={accentColor}
        theme={theme}
      />
    </div>
  );
}

export default App;