# ZAPFIT — Твой тренировочный хаб под контролем

<img width="148" height="158" alt="ZAPFIT Logo" src="https://github.com/user-attachments/assets/883eea88-2b93-4a38-8150-07d14d49df10" />

**ZAPFIT** — это  фитнес-трекер. Анализирует тренировки, считает нагрузку (TSS), отслеживает гидратацию, сон, HRV и сравнивает заезды между собой. Всё в одном месте.

---

## 📱 Интерфейс приложения

### Desktop версия

<div align="center">
  <h3>📊 Главная панель</h3>
   <img width="1664" height="928" alt="1780478140" src="https://github.com/user-attachments/assets/23c00beb-2460-4070-91c6-1f5159155f34" />
  
  <h3>📈 Анализ и сравнение активностей</h3>
    <img width="1664" height="928" alt="1780478152" src="https://github.com/user-attachments/assets/74c1129d-cc60-4f37-960c-47d27e5844b6" />
  <h3>🗺️ Детальный просмотр тренировки</h3>
    <img width="1664" height="928" alt="1780478168" src="https://github.com/user-attachments/assets/a9127632-1bc3-410d-9678-e1cb70d12285" />
 
</div>

---

### Mobile приложение

<div align="center">
  <table>
    <tr>
      <td align="center">
        <h4>📋 Лента активностей</h4>
        <div style="display: inline-block; border: 12px solid #1a1a1a; border-radius: 40px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
           <img width="1664" height="928" alt="1780478106" src="https://github.com/user-attachments/assets/d98d4601-32ba-4d8e-974a-b1734927d9f7" />
        </div>
      </td>
      <td align="center">
        <h4>🚴 Мой велосипед</h4>
        <div style="display: inline-block; border: 12px solid #1a1a1a; border-radius: 40px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
          <img width="1664" height="928" alt="1780478122" src="https://github.com/user-attachments/assets/06c17be6-d0d5-40e4-8219-be99c1a4d34b" 
        </div>
      </td>
    </tr>
  </table>
</div>

---

## 🔥 Основные возможности

### 📊 Аналитика и метрики
- **AI Анализ** — баланс CTL/ATL/TSB, умные рекомендации по восстановлению
- **TSS (Training Stress Score)** — точный расчёт тренировочной нагрузки
- **Динамика формы** — график прогресса за 60 дней
- **HRV мониторинг** — контроль вариабельности сердечного ритма

### 💧 Здоровье и восстановление
- **Гидратация** — умный трекер воды с персональными рекомендациями
- **Сон** — отслеживание фаз и качества сна
- **BMI и вес** — полный контроль композиции тела
- **Восстановление** — AI-рекомендации по отдыху

### 🚴 Активности
- **Календарь тренировок** — визуализация активности по дням
- **Сравнение заездов** — пульс, мощность, время, дистанция бок о бок
- **GPX импорт** — загрузка маршрутов из любых устройств
- **Ручной ввод** — гибкость для любого типа активности
- **Карта маршрутов** — детальный просмотр треков на карте

---

## 🎨 Дизайн и UX

- 🌙 **Тёмная тема** с неоновыми акцентами
- ⚡ **Анимации** и плавные переходы
- 📱 **Адаптивный интерфейс** — desktop + mobile
- 🎯 **Минималистичный UI** — ничего лишнего
- 🎨 **Кастомные цвета** — подстрой под себя

---

## 🛠 Технологии

### Frontend
- React / Vue.js
- TypeScript
- TailwindCSS / Styled Components
- Chart.js / D3.js для визуализации

### Backend
- Node.js / Python
- PostgreSQL / MongoDB
- Redis для кэширования
- JWT аутентификация

### Mobile
- React Native / Flutter
- SQLite для офлайн-работы

### Интеграции
- Garmin Connect API
- Strava API
- Google Fit / Apple Health
- GPX/FIT форматы

---

## 🚀 Быстрый старт

### Требования
- Node.js 18+ / Python 3.9+
- PostgreSQL 14+
- npm / yarn / pip

### Установка

```bash
# Клонируйте репозиторий
git clone https://github.com/твой_ник/zapfit.git
cd zapfit

# Backend
cd backend
npm install
cp .env.example .env
# Отредактируйте .env файл
npm run migrate
npm start

# Frontend (в новом терминале)
cd ../frontend
npm install
npm start

# Mobile (опционально)
cd ../mobile
npm install
npx react-native run-ios  # для iOS
npx react-native run-android  # для Android
```

Docker (рекомендуется)

bash
```
docker-compose up -d
```

---
### 🗺️ Roadmap
-  Интеграция с умными весами 
-  Групповые тренировки и челленджи
-  Экспорт данных в PDF
-  Интеграция с календарём
- Push-уведомления
- Тёмная/светлая тема
---
## 🤝 Вклад
- Создайте feature branch (git checkout -b feature/AmazingFeature)
- Commit changes (git commit -m 'Add some AmazingFeature')
- Push to branch (git push origin feature/AmazingFeature)
- Open a Pull Request
---
## 📄 Лицензия
MIT License — свободно используй, меняй, распространяй. 
Только не забудь указать автора 😉
---

## 🙏 Благодарности
- OpenStreetMap  - за карты
- Leaflet - за картографическую библиотеку
- Всем beta-тестерам за фидбек
---


<div align="center">
  <strong>Сделано с ❤️ для спортсменов</strong><br>
  <sub>© 2024 ZAPFIT. All rights reserved.</sub>
</div>
```
