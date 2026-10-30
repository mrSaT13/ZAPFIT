# Инструкция загрузки ZAPFIT v1.1.0 на GitHub

## 📝 Подготовка

### 1. Инициализирование Git репозитория (если еще не сделано)

```bash
cd d:\ZAPFIT
git init
git add .
git commit -m "ZAPFIT v1.1.0 - Initial commit with AI training plans, improved DB schema, and new features"
```

### 2. Создание .gitignore (если еще не создан)

```bash
# Уже должен быть, но проверьте наличие важных папок:
echo "
node_modules/
dist/
build/
release/
*.db
*.log
.env
.env.local
.DS_Store
.idea
.vscode
" >> .gitignore
```

---

## 🚀 Загрузка на GitHub

### Вариант 1: Создать новый репозиторий на GitHub

1. Перейдите на https://github.com/new
2. Заполните форму:
   - **Repository name**: `zapfit`
   - **Description**: `ZAPFIT — приложение для анализа активностей и управления тренировочными планами с AI`
   - **Public** (или Private если нужна приватность)
   - Не инициализируйте с README, .gitignore, license

3. Нажмите **Create repository**

### Вариант 2: Использовать GitHub CLI (быстрее)

```bash
# Установить GitHub CLI (если еще не установлен)
# https://cli.github.com/

# Авторизироваться
gh auth login

# Создать репозиторий
gh repo create zapfit --public --source=. --remote=origin --push
```

---

## 📤 Загрузка кода

### Способ 1: Git команды (классический)

```bash
cd d:\ZAPFIT

# Добавить remote (замените USERNAME на ваш GitHub username)
git remote add origin https://github.com/USERNAME/zapfit.git

# Переименовать branch (если нужно)
git branch -M main

# Загрузить код
git push -u origin main
```

### Способ 2: GitHub Desktop (графический)

1. Откройте GitHub Desktop
2. File → Add local repository
3. Выберите папку `d:\ZAPFIT`
4. Нажмите **Publish repository**
5. Заполните данные и опубликуйте

---

## 📦 Загрузка Release (ЕХЕ файл)

После завершения сборки (`npm run electron:build`):

### Способ 1: Веб-интерфейс GitHub

1. Перейдите на https://github.com/USERNAME/zapfit
2. На правой панели нажмите **Releases** → **Create a new release**
3. Заполните:
   - **Tag version**: `v1.1.0`
   - **Release title**: `ZAPFIT v1.1.0 - AI Training Plans & Improved UI`
   - **Description**: (скопируйте из `CHANGELOG_v1.1.md`)
4. Прикрепите файлы:
   - Перетащите `release/ZAPFIT Setup 1.1.0.exe` в область загрузки
   - Также добавьте `release/ZAPFIT Setup 1.1.0.exe.blockmap`
5. Нажмите **Publish release**

### Способ 2: GitHub CLI (быстрее)

```bash
gh release create v1.1.0 \
  --title "ZAPFIT v1.1.0 - AI Training Plans & Improved UI" \
  --notes-file CHANGELOG_v1.1.md \
  release/ZAPFIT\ Setup\ 1.1.0.exe \
  release/ZAPFIT\ Setup\ 1.1.0.exe.blockmap
```

---

## 🐳 Загрузка Docker образа

### На Docker Hub

```bash
# 1. Создайте аккаунт на https://hub.docker.com

# 2. Авторизируйтесь
docker login

# 3. Соберите образ (если еще не собран)
docker build -t USERNAME/zapfit:1.1.0 .

# 4. Загрузите образ
docker push USERNAME/zapfit:1.1.0

# 5. Также пометьте как latest
docker tag USERNAME/zapfit:1.1.0 USERNAME/zapfit:latest
docker push USERNAME/zapfit:latest
```

### На GitHub Container Registry (GHCR)

```bash
# 1. Создайте token (https://github.com/settings/tokens)
#    Выберите scopes: write:packages

# 2. Авторизируйтесь
echo YOUR_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# 3. Соберите образ
docker build -t ghcr.io/USERNAME/zapfit:1.1.0 .

# 4. Загрузите
docker push ghcr.io/USERNAME/zapfit:1.1.0

# Также как latest
docker tag ghcr.io/USERNAME/zapfit:1.1.0 ghcr.io/USERNAME/zapfit:latest
docker push ghcr.io/USERNAME/zapfit:latest
```

---

## 📋 Проверка на GitHub

### После загрузки проверьте:

1. **README.md** отображается правильно ✅
2. **Releases** содержит v1.1.0 с файлами ✅
3. **Docker images** доступны (если загружали) ✅
4. **Commits** видны в истории ✅

Пример URL для проверки:
- Репозиторий: `https://github.com/USERNAME/zapfit`
- Release: `https://github.com/USERNAME/zapfit/releases/tag/v1.1.0`
- Docker Hub: `https://hub.docker.com/r/USERNAME/zapfit`

---

## 🔄 Создание GitHub Actions для автоматической сборки (опционально)

Создайте файл `.github/workflows/build.yml`:

```yaml
name: Build ZAPFIT

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Build application
        run: npm run electron:build
      
      - name: Upload release
        uses: softprops/action-gh-release@v1
        with:
          files: release/ZAPFIT\ Setup\ *.exe*
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 📚 Дополнительные файлы для GitHub

### Создайте CONTRIBUTING.md

```markdown
# Contributing to ZAPFIT

Спасибо за интерес к проекту!

## Как помочь

1. Fork репозиторий
2. Создайте feature branch (`git checkout -b feature/amazing`)
3. Сделайте изменения
4. Коммитьте (`git commit -m 'Add amazing feature'`)
5. Пушьте (`git push origin feature/amazing`)
6. Откройте Pull Request

## Требования

- Node.js >= 16
- npm >= 8
- Соблюдайте код стиль проекта
```

### Создайте SECURITY.md

```markdown
# Security Policy

## Reporting Security Vulnerabilities

Если вы нашли уязвимость, пожалуйста, сообщите на email вместо публичного issue.

Email: security@zapfit.dev

Спасибо за ответственное раскрытие!
```

---

## ✅ Чеклист перед загрузкой

- [ ] Версия в `package.json` обновлена до 1.1.0
- [ ] `CHANGELOG_v1.1.md` создан и заполнен
- [ ] `README.md` обновлен
- [ ] ЕХЕ файл собран (`release/ZAPFIT Setup 1.1.0.exe`)
- [ ] Dockerfile протестирован (`docker build .`)
- [ ] `.gitignore` содержит необходимые папки
- [ ] Все коммиты сделаны локально
- [ ] Ветка `main` готова к push

---

## 🎯 Команды для быстрого выполнения

```bash
# Вся подготовка и загрузка в одну команду (для bash/zsh)
cd d:\ZAPFIT && \
git add . && \
git commit -m "ZAPFIT v1.1.0" && \
git remote add origin https://github.com/USERNAME/zapfit.git && \
git branch -M main && \
git push -u origin main

# Загрузить Release
gh release create v1.1.0 \
  --title "ZAPFIT v1.1.0" \
  --notes-file CHANGELOG_v1.1.md \
  release/ZAPFIT\ Setup\ 1.1.0.exe
```

---

## 🆘 Если что-то не сработало

### Ошибка: "remote origin already exists"
```bash
git remote remove origin
git remote add origin https://github.com/USERNAME/zapfit.git
```

### Ошибка: "permission denied"
```bash
# Проверьте SSH ключи или используйте HTTPS с token
gh auth refresh --scopes repo
```

### Ошибка: "Nothing to commit"
```bash
# Убедитесь что есть изменения
git status
git add -A
git commit -m "Update for v1.1.0"
```

---

**Версия**: 1.1.0  
**Дата**: 15 мая 2026  
**Автор**: mrSaT13
