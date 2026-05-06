import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import Dashboard from './components/Dashboard';
import Profile from './components/Profile';
import RideList from './components/RideList';
import TrainingPlan from './components/TrainingPlan';
import Settings from './components/Settings';
import MapView from './components/MapView';
import RideAnalysis from './components/RideAnalysis';
import AIChat from './components/AIChat';
import TrainingCalendar from './components/Calendar';
import ManualActivityModal from './components/ManualActivityModal';
import Health from './components/Health';
import About from './components/About';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AnimatePresence, motion } from 'framer-motion';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [accentColor, setAccentColor] = useState('#f97316'); // default orange-500
  const [textColor, setTextColor] = useState('auto'); // auto, white, black
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [rides, setRides] = useState([]);

  const [isWaterModalOpen, setIsWaterModalOpen] = useState(false);
  const [waterCount, setWaterCount] = useState(0);
  const [recommendedWater, setRecommendedWater] = useState(null);
  const [waterHistory, setWaterHistory] = useState([]);
  const [totalWaterLiters, setTotalWaterLiters] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      if (window.electronAPI) {
        // 1. Загружаем пользователя
        const userData = await window.electronAPI.getUser();
        setUser(userData);

        // 2. Загружаем настройки
        const settings = await window.electronAPI.getSettings();
        if (settings.theme) setTheme(settings.theme);
        if (settings.accentColor) setAccentColor(settings.accentColor);
        if (settings.textColor) setTextColor(settings.textColor);
        if (settings.waterCount) setWaterCount(parseInt(settings.waterCount) || 0);
        // Daily reset: archive previous day and reset counter if needed
        try {
          if (window.electronAPI.dailyResetWater) {
            const dr = await window.electronAPI.dailyResetWater();
            if (dr && typeof dr.waterCount !== 'undefined') setWaterCount(parseInt(dr.waterCount)||0);
          } else if (window.electronAPI.dailyResetWater) {
            const dr = await window.electronAPI.dailyResetWater();
            if (dr && typeof dr.waterCount !== 'undefined') setWaterCount(parseInt(dr.waterCount)||0);
          }
        } catch (e) { console.error('daily reset failed', e); }

        // Recommended water
        try {
          if (window.electronAPI.getRecommendedWater) {
            const rec = await window.electronAPI.getRecommendedWater();
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
          if (window.electronAPI.getWaterHistory) {
            const h = await window.electronAPI.getWaterHistory();
            setWaterHistory(h || []);
            const total = (h || []).reduce((s, r) => s + (parseFloat(r.liters) || 0), 0);
            setTotalWaterLiters(+total.toFixed(2));
          }
        } catch (e) { console.error('getWaterHistory failed', e); }
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const handleUpdateWater = async (count) => {
    const newCount = waterCount + count;
    setWaterCount(newCount);
    if (window.electronAPI.updateSetting) {
      await window.electronAPI.updateSetting('waterCount', newCount.toString());
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

  if (loading) return <div className="flex items-center justify-center h-screen bg-[#0f172a] text-white">Загрузка...</div>;

  const currentTextColor = textColor === 'auto' 
    ? (theme === 'dark' ? 'text-white' : 'text-slate-900') 
    : (textColor === 'white' ? 'text-white' : 'text-black');

  return (
    <div className={`flex h-screen ${theme === 'dark' ? 'bg-[#0f172a]' : 'bg-slate-100'} ${currentTextColor} overflow-hidden font-sans`}>
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        theme={theme}
        toggleTheme={() => {
          const newTheme = theme === 'dark' ? 'light' : 'dark';
          setTheme(newTheme);
          if (window.electronAPI.updateSetting) {
            window.electronAPI.updateSetting('theme', newTheme);
          }
        }}
        accentColor={accentColor}
      />
      
      <main className={`flex-1 overflow-y-auto relative transition-colors ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-slate-50'}`}>
        <TitleBar />
        <ToastContainer theme={theme === 'dark' ? 'dark' : 'light'} position="bottom-right" />
        {/* Фон */}
        <div className={`fixed top-0 left-0 w-full h-full pointer-events-none z-0 ${theme === 'dark' ? 'opacity-40' : 'opacity-20'}`}>
           <div 
             className="absolute top-[-10%] right-[-5%] w-96 h-96 rounded-full blur-3xl opacity-50"
             style={{ backgroundColor: accentColor }}
           ></div>
           <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-blue-600 rounded-full blur-3xl opacity-30"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-6 sm:px-8 sm:py-8">
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
                />
              )}
              {activeTab === 'rides' && <RideList theme={theme} accentColor={accentColor} onImport={handleImportGpx} onOpenManual={() => setIsManualModalOpen(true)} />}
              {activeTab === 'calendar' && <TrainingCalendar theme={theme} accentColor={accentColor} />}
              {activeTab === 'plan' && <TrainingPlan user={user} theme={theme} accentColor={accentColor} />}
              {activeTab === 'profile' && <Profile user={user} onSave={handleSaveUser} onLogout={handleLogout} onNavigate={setActiveTab} theme={theme} accentColor={accentColor} />}
              {activeTab === 'health' && <Health theme={theme} accentColor={accentColor} />}
              {activeTab === 'about' && <About />}
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
              {activeTab === 'map' && <MapView theme={theme} accentColor={accentColor} />}
              {activeTab === 'analysis' && <RideAnalysis theme={theme} accentColor={accentColor} user={user} />}
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
      />
    </div>
  );
}

export default App;