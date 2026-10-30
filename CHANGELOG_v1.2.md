# ZAPFIT v1.2.0 — Parity with Mobile + Server Sync Fix

**Дата:** 31.08.2026  
**База:** mobile `0.8.5+27` + server `0.21.0` (Endurain fork)  
**Предыдущая:** `1.1.0`

## 🎯 Цель релиза
Довести Electron-десктоп до паритета с `endurain-flutter`: починить подключение к `serverZAPPFIT`, синхронизацию данных и отображение картинок. Поднять версию приложения.

## 🐛 Исправлено подключение

| Проблема | Файл:строка | Фикс |
|---|---|---|
| `vite.config.js:8 port 5173` vs `package.json:12 wait-on 5174` — dev никогда не стартовал | `vite.config.js:8` | `port 5174 strictPort:true` |
| `serverUrl` без нормализации (`trailing /`, без `https://`) | `src/main/endurain-api.js:13 normalizeBaseUrl()` | Портирован `UrlUtils.normalizeBaseUrl` из mobile |
| Нет `X-Client-Type`, пустой `detail` при `Login failed` | `endurain-api.js:103` | Добавлен header + `err.detail||message` |
| MFA ветка недостижима: `Settings.jsx:543 if(success) return` раньше `mfa_required` | `src/main/ipcHandlers.js:2270` | Разделен `if(mfa_required) return {mfa_required:true}` |
| `_loadFromDb` падал если DB не инициализирована на момент `constructor` | `endurain-api.js:34` | Try/catch + lazy `_ensureLoaded()` перед каждым запросом |
| `configureServer` без таймаута и без `X-Client-Type` | `endurain-api.js:78` | `AbortController 10s` + header, нормализация |

## 🔄 Синхронизация — доведена до mobile `activity_sync_service + health_service`

* `endurain-api.js`: добавлены `normalizeBaseUrl`, `buildImageCandidates`, `getActivitiesRefresh()`, `getAllActivities(paginated loop)`, `getActivityMedia()`, учет `records`-враппера (`data.records || data`).
* `getActivities`: теперь `request GET /activities/user/{id}/page_number/{pn}/num_records/{nr}` с unwrap + авторetry через `getAllActivities`.
* `ipcHandlers.js:2324 endurain-sync-activities`: полный пагинационный pull (`getAllActivities(50)` + `getActivitiesRefresh()` 24ч), дедуп по `server_id INTEGER UNIQUE` (а не `title+date`), корректный маппинг полей сервера `Activity` (`distance` м→км `/1000`, `average_hr/max_hr`, `average_speed/max_speed`, `average_power/max_power`, `calories`, `activity_type`, `visibility`, `map_thumbnail_path`, `tss`, `start_time/end_time`), `UPDATE` существующей записи при повторном синке, `INSERT` с `server_id`.
* `endurain-sync-health`: `toArray()` для `Weight/Sleep/Steps/Water` (`{records:[]}` vs `[]`), маппинг `weight/value`, `date/created_at`, `amount_ml/amount`.
* `db.js:326` миграция `activities`: `server_id INTEGER UNIQUE`, `map_thumbnail_path TEXT`, `comments TEXT`, `visibility`, `calories`, `average_cad/max_cad`, `average_power/max_power`, `normalized_power`, `workout_*`, `start_time/end_time`, `activity_type` + `CREATE INDEX idx_activities_server_id`.

## 🖼️ Картинки — портирован `ApiClient.getImageBytes` + `SecureImage`

* `endurain-api.js: getImageBytes(imageUrl)` — in-memory `Map`, `buildImageCandidates()` (пробы `/activity_thumbnails/`, `/activity_media/`, `/user_images/`, `/gear_images/`, `api/v1/...`), каждый кандидат `GET` с `Authorization: Bearer` + `X-CSRF-Token` + `X-Client-Type`, авто-refresh 401, таймаут 10s. `getImageUrl()`.
* `src/main/ipcHandlers.js`: новые IPC `endurain-get-image` (base64 + mime) и `endurain-get-activity-media`.
* `src/preload/index.js:113` — `endurainGetImage`, `endurainGetActivityMedia`.
* `src/renderer/components/SecureImage.jsx` — новый компонент паритет `shared/widgets/secure_image.dart`: `memoryCache + failedSet`, `useSecureImage()` хук, спиннер + fallback, автовыбор base64.
* `Profile.jsx:320` — аватар через `SecureImage` если `avatar_path` содержит `user_images`.
* `RideModal.jsx`: загрузка `serverMedia` через `endurainGetActivityMedia(server_id)`, рендер `map_thumbnail_path` через `SecureImage`, объединенный счетчик `photos + serverMedia`.

## 📦 Версионирование

* `package.json:3` `1.1.0 → 1.2.0`
* `electron-builder.json` без изменений (sql.js)
* Совместимость БД: авто-миграции, старые данные сохраняются. `server_id` nullable для локальных активностей (`gpx_path='server'` для серверных).

## 🧪 Проверка

* `npm run dev` → Vite 5174 + `wait-on 5174` OK
* `npm run electron:dev` → окно грузится, `endurainConfigure` → `endurainLogin` (MFA TOTP) → `endurainSyncActivities` → `get-rides` показывает дистанции/картинки.
* Сетевое: `GET /api/v1/public/server_settings`, `POST /api/v1/auth/login?code_challenge`, `GET /api/v1/activities/user/{id}/page_number/1/num_records/50`, `GET /activity_thumbnails/{file}` через `SecureImage`.

## 📝 TODO next (v1.3)

* Push локальных активностей → `POST /activities/create/upload` multipart (как `activity_upload_service.dart`)
* Gear фото sync `POST /gear_images/upload/gear/{id}`
* Auto-sync timer 15м + `Workmanager` аналог + WebSocket `ws://server/ws`
