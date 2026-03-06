# 🚀 ДЕПЛОЙ - Пошаговая инструкция

## ✅ У вас уже есть:
- ✅ Google Таблица с 2 листами
- ✅ Развёрнутый backend (Apps Script)
- ✅ URL: `https://script.google.com/macros/s/AKfycbwOmfbiY6qcoZtJJFyazXATEQKiVakQoFvRtVBwJbtGIFQUlhxFSiXlL89mI2_cxEg0/exec`

---

## 📝 Шаг 1: Подготовьте файлы

### 1.1 Создайте папку для деплоя

В терминале:
```bash
cd /Users/artem/Documents/canban
mkdir deploy_for_github
```

### 1.2 Скопируйте файлы

```bash
cp v2/select_user.html deploy_for_github/index.html
cp v2/admin.html deploy_for_github/admin.html
cp v2/index.html deploy_for_github/dashboard.html
cp v2/cod_v2.gs deploy_for_github/
```

### 1.3 Откройте каждый HTML файл для редактирования

Откройте в текстовом редакторе (TextEdit, VS Code, Sublime):
- `deploy_for_github/index.html`
- `deploy_for_github/admin.html`
- `deploy_for_github/dashboard.html`

### 1.4 Найдите место для вставки API URL

В каждом файле найдите строку (примерно 800-850):
```javascript
// ===== Initialization =====
```

**ПЕРЕД этой строкой** вставьте:

```javascript
// ===== API Configuration =====
const API_URL = 'https://script.google.com/macros/s/AKfycbwOmfbiY6qcoZtJJFyazXATEQKiVakQoFvRtVBwJbtGIFQUlhxFSiXlL89mI2_cxEg0/exec';
```

### 1.5 Сохраните файлы

---

## 🌐 Шаг 2: GitHub Pages (бесплатный хостинг)

### 2.1 Создайте репозиторий на GitHub

1. https://github.com/new
2. Название: `kanban-v2` (или любое)
3. **Public**
4. Нажмите **Create repository**

### 2.2 Загрузите файлы

В терминале:
```bash
cd /Users/artem/Documents/canban/deploy_for_github
git init
git add .
git commit -m "Kanban v2 - готово к деплою"
git branch -M main
git remote add origin https://github.com/ВАШ_НИК/kanban-v2.git
git push -u origin main
```

**Замените `ВАШ_НИК` на ваш GitHub логин!**

### 2.3 Включите GitHub Pages

1. Откройте репозиторий на GitHub
2. **Settings** → **Pages** (слева в меню)
3. **Source**: Deploy from a branch
4. **Branch**: main → **/ (root)**
5. Нажмите **Save**

### 2.4 Подождите 1-2 минуты

Через 1-2 минуты ваш сайт будет доступен:

```
https://ВАШ_НИК.github.io/kanban-v2/
```

---

## 🎯 Шаг 3: Проверка

### 3.1 Откройте ваш сайт

Перейдите по ссылке из шага 2.4

### 3.2 Создайте пользователей

1. Нажмите "➕ Добавить пользователя"
2. Создайте:
   - Имя: `Админ`, Роль: `admin`
   - Имя: `Игорь`, Роль: `user`
   - Имя: `Мария`, Роль: `user`

### 3.3 Проверьте работу

1. Выберите пользователя
2. Создайте задачу
3. Назначьте на исполнителя
4. Откройте админку → проверьте, что задачи видны

---

## 🔄 Альтернатива: Netlify (ещё проще)

### 1. Откройте https://app.netlify.com/drop

### 2. Перетащите папку `deploy_for_github` в окно браузера

### 3. Через 30 секунд получите ссылку:
```
https://random-name-12345.netlify.app
```

**Готово!**

---

## 📊 Что где открывается

| Файл | URL | Назначение |
|------|-----|------------|
| `index.html` | `.../index.html` | Главная (выбор пользователя) |
| `dashboard.html` | `.../dashboard.html` | Kanban доска |
| `admin.html` | `.../admin.html` | Админская панель |

---

## 🐛 Если что-то не работает

### Ошибка: "JSONP request failed"

**Причина:** Неправильный API_URL

**Решение:**
1. Проверьте, что вставили API_URL во все 3 файла
2. Проверьте, что URL без опечаток
3. Откройте консоль (F12) → посмотрите ошибку

### Ошибка: "Пользователи не загружаются"

**Причина:** Лист "Пользователи" пуст

**Решение:**
1. Откройте Google Таблицу
2. Проверьте лист "Пользователи"
3. Добавьте хотя бы одного пользователя вручную

---

## ✅ Чек-лист

- [ ] Папка `deploy_for_github` создана
- [ ] Файлы скопированы
- [ ] API_URL вставлен во все 3 файла
- [ ] Репозиторий на GitHub создан
- [ ] Файлы загружены (`git push`)
- [ ] GitHub Pages включён
- [ ] Сайт открывается
- [ ] Пользователи создаются
- [ ] Задачи создаются
- [ ] Админка работает

---

**Готово!** 🎉
