# Интеграция Strava API в StraveFlow

## Шаг 1: Создание приложения на Strava

1. Перейди на https://www.strava.com/settings/api
2. Войди под своим аккаунтом Strava (или создай новый)
3. Нажми **"Create an API Application"**
4. Заполни форму:
   - **Application name**: StraveFlow
   - **Category**: Training
   - **Website**: http://localhost:3000
   - **Authorization Callback Domain**: localhost
   - Принимаешь Terms of Service

## Шаг 2: Получение Client ID и Client Secret

После создания приложения, ты получишь:
- **Client ID** (e.g., 12345)
- **Client Secret** (e.g., abcdef...)

## Шаг 3: Получение OAuth Token

### Вариант A: Используя Strava Web Authorization

1. Перейди по ссылке (замени `CLIENT_ID` на твой):
```
https://www.strava.com/oauth/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=http://localhost/strava&scope=read,activity:read_all
```

2. Разреши доступ к приложению
3. Ты будешь перенаправлен, скопируй **authorization code** из URL

4. Получи токен через curl:
```bash
curl -X POST https://www.strava.com/oauth/token \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET \
  -d code=YOUR_AUTH_CODE \
  -d grant_type=authorization_code
```

Ответ будет содержать `access_token`.

### Вариант B: Используя Personal Access Token (проще)

1. Перейди на https://www.strava.com/settings/api
2. Нажми **"Generate"** в секции "Personal Access Tokens"
3. Копируй полученный токен (30-дневный)

## Шаг 4: Вставка токена в StraveFlow

1. Открой StraveFlow
2. Перейди в **Настройки**
3. Найди секцию **"Strava API (Импорт активностей)"**
4. Вставь полученный токен в поле ввода
5. Нажми **"Сохранить"**
6. Нажми **"Импортировать"**

## Примечания

- **Срок действия**: Personal Access Token действует 6 часов, OAuth token - 1 месяц
- **Автоматическое обновление**: После импорта, новые активности синхронизируются при каждом открытии приложения
- **Поддерживаемые виды спорта**:
  - Ride (велосипед)
  - Run (бег)
  - Swim (плавание)
  - VirtualRide (виртуальный велосипед)
  - Trail Run
  - И другие с TSS расчетом

## Возможные ошибки

| Ошибка | Решение |
|--------|---------|
| `401 Unauthorized` | Токен истек или неверен, получи новый |
| `403 Forbidden` | У приложения нет доступа к активностям |
| `Invalid response from Strava` | Проверь интернет-соединение |

## Безопасность

- Токен хранится в локальной БД (не передается никому)
- Рекомендуется использовать **Personal Access Token** вместо OAuth для удобства
- Токен видно только в поле ввода (замаскирован как пароль)
