# 🎯 ZAPFIT v1.1.0 - Performance & Training Analytics

**ZAPFIT** — это приложение для анализа спортивных активностей, управления тренировочными планами и отслеживания здоровья с применением AI.

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![License](https://img.shields.io/badge/license-UNLICENSED-red)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)

## 🌟 Главные возможности v1.1.0

### 🤖 AI Тренировочные планы
- Автоматическая генерация 12-недельных оптимизированных планов
- Периодизация: Linear / Block / Undulating
- Фазы: Build → Peak → Taper
- Автоматическое планирование сессий

### 📊 Аналитика активностей
- Анализ данных из Strava (интеграция)
- CTL/ATL/TSB метрики (Chronic Training Load)
- Карты маршрутов с GPX поддержкой
- История всех активностей

### 🎯 Система целей
- SMART цели (Specific, Measurable, Achievable, Relevant, Time-bound)
- Типы: Distance, Duration, Elevation, Power, HR-based
- Отслеживание прогресса в реальном времени
- Архив завершенных целей

### 🍽️ Управление питанием
- 70 предзагруженных блюд с БЖУ
- Холодильник для создания кастомных рецептов
- Категоризация и фильтрация
- Расчет питательных показателей

### 💧 Отслеживание воды
- Ежедневный счетчик (синхронизирован)
- История потребления
- Уведомления о нормах

### 📅 Интеллектуальный календарь
- Визуализация тренировок из плана
- История активностей
- Вода и соревнования
- День подробно

### 📸 Загрузка фото
- Сохранение фото активностей
- Галерея маршрутов
- Экспорт

---

## 🚀 Быстрый старт

### Требования
- **Node.js** ≥ 16.0.0
- **npm** ≥ 8.0.0
- **Electron** 42.0.1 (устанавливается автоматически)

### Установка для разработки

```bash
# Клонировать репозиторий
git clone https://github.com/yourname/zapfit.git
cd zapfit

# Установить зависимости
npm install

# Запустить dev сервер + Electron
npm run electron:dev
```

### Сборка приложения

```bash
# Собрать ЕХЕ для Windows
npm run electron:build

# Только Vite build
npm run build

# Preview Vite build
npm run preview
```

Готовый установщик будет в папке `release/`

---

## 🐳 Docker

### Запуск в Docker

```bash
# Собрать образ
docker build -t zapfit:1.1.0 .

# Запустить контейнер
docker run -p 8000:5000 zapfit:1.1.0
```

Приложение будет доступно на `http://localhost:8000`

### Docker Compose

```bash
docker-compose up -d
```

---

## 📁 Структура проекта

```
zapfit/
├── src/
│   ├── main/                      # Electron Main Process
│   │   ├── index.js               # App entry point
│   │   ├── db.js                  # SQLite БД (sql.js)
│   │   └── ipcHandlers.js         # IPC handlers (500+ LOC)
│   ├── preload/
│   │   └── index.js               # Preload script (API expose)
│   └── renderer/                  # React компоненты
│       ├── App.jsx
│       ├── components/
│       │   ├── Dashboard.jsx      # Главная страница
│       │   ├── Health.jsx         # Здоровье (вода, питание, сон)
│       │   ├── Calendar.jsx       # Календарь тренировок
│       │   ├── GoalSetting.jsx    # Настройка целей
│       │   ├── TrainingPlans.jsx  # Планы тренировок
│       │   ├── RideModal.jsx      # Детали активности
│       │   └── health-tabs/       # Компоненты вкладок
│       ├── services/
│       │   └── EventEmitter.js    # Event bus
│       └── styles/
│           └── index.css
├── tools/                         # Вспомогательные скрипты
├── scripts/                       # Migration скрипты
├── docker/                        # Docker конфиг
├── release/                       # Собранные ЕХЕ
├── vite.config.js                # Vite конфиг
├── electron-builder.json         # Electron Builder конфиг
├── tailwind.config.js            # Tailwind CSS
├── postcss.config.cjs            # PostCSS
└── package.json
```

---

## 🗄️ База данных

### Используемая технология
- **sql.js** (SQLite в памяти с сохранением на диск)
- Расположение: `~/.config/zapfit/ZAPFIT.db` (Linux/Mac) или `%APPDATA%/zapfit/ZAPFIT.db` (Windows)

### Таблицы

| Таблица | Назначение | Ключевые колонки |
|---------|-----------|-----------------|
| `activities` | Активности из Strava | id, date, distance, duration, type |
| `training_plans` | Тренировочные планы | id, name, start_date, end_date |
| `training_weeks` | Недели плана | id, plan_id, week_number, focus_type |
| `training_sessions` | Сессии тренировок | id, week_id, session_type, intensity |
| `goals` | Цели пользователя | id, goal_type, target_value, progress |
| `water` | Дневная вода | date, ml |
| `water_entries` | История воды | id, amount, time |
| `nutrition_data` | Питание | date, dish_name, calories, protein |
| `standard_dishes` | Шаблоны блюд | id, name, category, calories, protein |
| `sleep_data` | Сон | date, duration, quality |
| `fitness_data` | Fitness метрики | date, ctl, atl, tsb |
| `competitions` | Соревнования | date, name, type |
| `gears` | Снаряжение | id, name, type |

---

## 🔌 IPC API (Main ↔ Renderer)

### Активности
```javascript
window.electronAPI.getRides()                     // Получить все активности
window.electronAPI.refreshStravaToken()           // Обновить токен Strava
window.electronAPI.importStrava()                 // Импортировать из Strava
```

### Тренировочные планы
```javascript
window.electronAPI.generateAIPlan(params)         // Генерация AI плана 🆕
window.electronAPI.createTrainingPlan(data)       // Создать план
window.electronAPI.getTrainingPlans()             // Получить все планы
window.electronAPI.getTrainingPlanDetail(id)      // Детали плана
window.electronAPI.updateTrainingPlan(id, data)   // Обновить план
```

### Цели
```javascript
window.electronAPI.addGoal(goal)                  // Добавить цель
window.electronAPI.getGoals()                     // Получить цели
window.electronAPI.updateGoal(id, data)           // Обновить цель
window.electronAPI.deleteGoal(id)                 // Удалить цель
```

### Вода
```javascript
window.electronAPI.addWater(amount)               // Добавить воду
window.electronAPI.getWater()                     // Получить дневную воду
window.electronAPI.getWaterHistory()              // История воды
window.electronAPI.updateWater(id, amount)        // Обновить запись
window.electronAPI.deleteWater(id)                // Удалить запись
```

### Питание
```javascript
window.electronAPI.getStandardDishes(category)    // Получить блюда
window.electronAPI.getDishCategories()            // Категории блюд
window.electronAPI.addDishCategory(name)          // Добавить категорию
window.electronAPI.query(sql, params)             // Прямой SQL запрос
window.electronAPI.run(sql, params)               // Прямое SQL выполнение
```

### Фото
```javascript
window.electronAPI.updateActivityPhotos(id, photos)  // Сохранить фото 🆕
```

---

## 📝 Миграции БД

При обновлении с v1.0.x на v1.1.0 автоматически выполняются:

```sql
-- Добавление колонок в goals
ALTER TABLE goals ADD COLUMN goal_type TEXT DEFAULT "distance";
ALTER TABLE goals ADD COLUMN unit TEXT DEFAULT "км";
ALTER TABLE goals ADD COLUMN start_date TEXT;
ALTER TABLE goals ADD COLUMN target_date TEXT;
ALTER TABLE goals ADD COLUMN progress_percent REAL DEFAULT 0;

-- Добавление фото в activities
ALTER TABLE activities ADD COLUMN photos TEXT;

-- Добавление fitness метрик
ALTER TABLE fitness_data ADD COLUMN ctl REAL DEFAULT 0;
ALTER TABLE fitness_data ADD COLUMN atl REAL DEFAULT 0;
ALTER TABLE fitness_data ADD COLUMN tsb REAL DEFAULT 0;
```

---

## 🔐 Переменные окружения

Создайте `.env` в корне проекта:

```env
# Strava API
VITE_STRAVA_CLIENT_ID=your_client_id
VITE_STRAVA_CLIENT_SECRET=your_client_secret

# БД путь (опционально, по-умолчанию ~/.config/zapfit)
DB_PATH=~/.config/zapfit/ZAPFIT.db

# AI План (опционально)
OPENAI_API_KEY=sk-...
```

---

## 📊 События (Event Bus)

```javascript
import { eventEmitter } from './services/EventEmitter';

// Слушать событие
eventEmitter.on('training-plan-updated', (data) => {
  console.log('План обновлен:', data);
});

// Отправить событие
eventEmitter.emit('training-plan-updated', {
  planId: 123,
  action: 'create'
});
```

Поддерживаемые события:
- `training-plan-updated` - План изменился
- `water-updated` - Вода добавлена/удалена
- `goal-created` - Цель создана
- `competitions-updated` - Соревнования изменились

---

## 🐛 Исправления v1.1.0

- ✅ Фиксирована синхронизация воды между Dashboard и Water страницей
- ✅ Фиксированы блюда без названий (проблема с prepare())
- ✅ Добавлена поддержка загрузки фото
- ✅ Тренировочные планы теперь синхронизируются с календарем
- ✅ Добавлена полная система целей с отслеживанием прогресса
- ✅ Исправлены missing tables ошибки (sleep_data, training_weeks, dish_categories)

---

## 💡 Советы для разработчиков

### Добавление новой активности/метрики

1. Создать таблицу в `src/main/db.js`
2. Добавить IPC handler в `src/main/ipcHandlers.js`
3. Expose в `src/preload/index.js`
4. Использовать в React компонентах

### Отладка

```bash
# Включить dev tools
npm run electron:dev  # Автоматически открывает DevTools

# Посмотреть логи
tail -f ~/.config/zapfit/logs.txt  # Linux/Mac
Get-Content $env:APPDATA\zapfit\logs.txt -Tail 50  # PowerShell
```

### БД инспекция

```bash
# Выполнить скрипт инспекции
node scripts/inspect_db.js
```

---

## 🚀 Развертывание

### Самостоятельно
1. Скачать `ZAPFIT Setup 1.1.0.exe`
2. Запустить установщик
3. Выбрать папку установки
4. Завершить

### На сервере (Docker)
```bash
docker run -d \
  --name zapfit \
  -p 8000:5000 \
  -v /data/zapfit:/app/data \
  zapfit:1.1.0
```

### На облаке

Готовые образы для:
- Docker Hub
- GitHub Container Registry
- AWS ECR

---

## 📞 Поддержка

- **Issues**: [GitHub Issues](https://github.com/yourname/zapfit/issues)
- **Email**: support@zapfit.dev
- **Docs**: [Full Documentation](https://zapfit.dev/docs)

---

## 🙏 Благодарности

Спасибо:
- **Strava** за API
- **React** сообществу
- **Electron** разработчикам
- Всем тестировщикам и контрибьюторам

---

## 📄 Лицензия

UNLICENSED - Все права защищены © 2026 ZAPFIT Team

---

**Текущая версия**: 1.1.0  
**Последнее обновление**: 15 мая 2026  
**Автор**: mrSaT13  
**Repository**: [GitHub](https://github.com/yourname/zapfit)
