# 📚 Технические заметки разработчика - Kanban Board v2

## 🗂️ Структура проекта

```
canban/
├── v2/                              # Новая версия с пользователями
│   ├── README.md                    # Общая документация
│   ├── SETUP_INSTRUCTIONS.md        # Инструкция по установке
│   ├── TESTING.md                   # Руководство по тестированию
│   ├── DEVELOPER_NOTES.md           # ЭТОТ ФАЙЛ - технические заметки
│   │
│   ├── cod_v2.gs                    # Backend (Google Apps Script)
│   │
│   ├── select_user_local.html       # Вход (локальная версия)
│   ├── index_local.html             # Kanban доска (локальная версия)
│   ├── admin_local.html             # Админка (локальная версия)
│   │
│   ├── select_user.html             # Вход (API версия)
│   ├── index_v2.html                # Kanban доска (API версия)
│   ├── admin.html                   # Админка (API версия)
│   │
│   ├── test_setup.html              # Тестовый стенд
│   └── debug_api.html               # Отладка API
│
├── index.html                       # Оригинальная версия (v1)
├── cod.gs                           # Оригинальный backend
└── DOCUMENTATION.md                 # Общая документация
```

---

## 🏗️ Архитектура приложения

### Уровни системы

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (HTML/JS)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ select_user │  │ index_v2    │  │ admin       │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                    BACKEND (Google Apps Script)         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  cod_v2.gs - API endpoints + бизнес-логика      │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                    DATA LAYER (Google Sheets)           │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │ задания      │  │ Пользователи │                    │
│  └──────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

---

## 💾 Хранение данных

### Локальный режим (localStorage)

**Ключи:**
```javascript
const USERS_KEY = 'kanban_v2_users_local';
const TASKS_KEY = 'kanban_v2_tasks_local';
const CURRENT_USER_KEY = 'kanban_current_user_v2_local';
```

**Структура данных:**

```javascript
// Пользователи (массив)
[
  {
    userId: 'user_1709654300_xxx',
    name: 'Артём',
    telegramId: '@artem',
    role: 'admin'
  }
]

// Задачи (массив)
[
  {
    id: 'task_1709654321_abc123',
    title: 'Купить молоко',
    status: 'todo',              // todo | in-progress | done
    startDate: '2026-03-05',
    endDate: '',
    duration: '',
    plannedDate: '2026-03-06',
    assignedTo: 'user_1'
  }
]
```

### Режим API (Google Sheets)

**Лист "задания":**
| Колонка | Поле | Тип |
|---------|------|-----|
| A | ID | String |
| B | Задание | String |
| C | Статус | String |
| D | Дата начала | Date |
| E | Дата конца | Date |
| F | Время выполнения | String |
| G | Плановая дата | Date |
| H | AssignedTo | String (userId) |

**Лист "Пользователи":**
| Колонка | Поле | Тип |
|---------|------|-----|
| A | UserID | String |
| B | Имя | String |
| C | TelegramID | String |
| D | Роль | String (admin/user) |

---

## 🔌 API Endpoints (Backend)

### GET запросы (JSONP)

```
?mode=jsonp&action=getUsers&callback=myCallback
?mode=jsonp&action=getTasks&userId=user_1&callback=myCallback
```

### POST запросы (JSON)

```javascript
// Пользователи
{ action: 'getUsers' }
{ action: 'addUser', name: 'Имя', telegramId: '@tg', role: 'user' }
{ action: 'updateUser', userId: 'user_1', name: '...', telegramId: '...', role: '...' }
{ action: 'deleteUser', userId: 'user_1' }

// Задачи
{ action: 'getTasks', userId: 'user_1' }
{ action: 'addTask', title: '...', plannedDate: '2026-03-06', assignedTo: 'user_1' }
{ action: 'updateTask', id: 'task_1', title: '...', status: 'done', assignedTo: '...', plannedDate: '...' }
{ action: 'updateStatus', id: 'task_1', status: 'in-progress' }
{ action: 'deleteTask', id: 'task_1' }
```

### Формат ответа

```javascript
{
  ok: true,
  data: { ... }  // или массив
}

// Или ошибка:
{
  ok: false,
  error: 'Сообщение об ошибке'
}
```

---

## 📱 Frontend компоненты

### 1. select_user.html / select_user_local.html

**Назначение:** Страница входа, выбор пользователя

**Ключевые функции:**
```javascript
loadUsers()           // Загрузка списка пользователей
renderUserList()      // Отрисовка карточек пользователей
selectUser(userId)    // Выбор пользователя
saveUser()            // Сохранение (add/update)
deleteUser(userId)    // Удаление
```

**State:**
```javascript
let users = [];              // Список пользователей
let selectedUserId = null;   // Выбранный пользователь
let editingUserId = null;    // Редактируемый пользователь
```

---

### 2. index_v2.html / index_local.html

**Назначение:** Kanban-доска для обычного пользователя

**Ключевые функции:**
```javascript
loadUser()            // Загрузка текущего пользователя
loadTasks()           // Загрузка задач (фильтр по userId)
renderBoard()         // Отрисовка 3 колонок
renderTask(task)      // Отрисовка карточки задачи
moveTask(taskId, dir) // Перемещение (back/forward)
```

**Date Picker:**
```javascript
selectPlannedDate(days)      // Быстрый выбор (сегодня/завтра)
adjustPlannedDate(delta)     // +/- день
toggleDatePicker()           // Открыть календарь
renderDatePicker()           // Рендер календаря
```

**State:**
```javascript
let tasks = [];              // Задачи текущего пользователя
let currentUserId = null;    // Текущий пользователь
let users = [];              // Все пользователи (для dropdown)
let selectedPlannedDays = null;
```

---

### 3. admin.html / admin_local.html

**Назначение:** Админская панель с полным доступом

**Два режима просмотра:**
- **Таблица** - все задачи в виде таблицы
- **Доска** - 3 колонки (как у пользователя)

**Ключевые функции:**
```javascript
setView(view)         // Переключение таблица/доска
loadData()            // Загрузка пользователей и задач
applyFilters()        // Применение фильтров (таблица)
applyFiltersBoard()   // Применение фильтров (доска)
renderTasksTable()    // Отрисовка таблицы
renderBoardView()     // Отрисовка доски
renderTaskCard(task)  // Карточка для доски
saveTask()            // Сохранение задачи
deleteTaskById(id)    // Удаление задачи
```

**State:**
```javascript
let tasks = [];              // Все задачи
let users = [];              // Все пользователи
let filteredTasks = [];      // Отфильтрованные задачи
let currentView = 'table';   // Текущий вид
let editingTaskId = null;
let editingUserId = null;
```

**Синхронизация фильтров:**
```javascript
// При изменении фильтров в таблице → обновляется доска
// При изменении фильтров на доске → обновляется таблица
applyFilters() → синхронизирует filterUserBoard, filterStatusBoard, filterSearchBoard
applyFiltersBoard() → синхронизирует filterUser, filterStatus, filterSearch
```

---

## 🎨 CSS структура

### CSS переменные (в оригинале index.html)

```css
:root {
  --bg-primary: #e8eef5;
  --bg-secondary: #dee3ea;
  --bg-card: #ffffff;
  --text-primary: #37474f;
  --accent-color: #4a90d9;
  --success-color: #4caf50;
  --task-title-font-size: 16px;
  /* ... */
}
```

### Темы

```javascript
// Переключение темы
document.documentElement.setAttribute('data-theme', 'dark');
localStorage.setItem('app_theme', 'dark');
```

### Адаптивность

```css
@media (max-width: 768px) {
  .board { grid-template-columns: 1fr; }
  .app-header { flex-direction: column; }
}
```

---

## 🔐 Бизнес-логика

### Матрица прав доступа

| Действие | user | admin |
|----------|------|-------|
| Видеть свои задачи | ✅ | ✅ |
| Видеть все задачи | ❌ | ✅ |
| Создать задачу | ✅ | ✅ |
| Назначить на себя | ✅ | ✅ |
| Назначить на другого | ❌ | ✅ |
| Редактировать свои | ✅ | ✅ |
| Редактировать чужие | ❌ | ✅ |
| Удалять | ❌ | ✅ |
| Управление пользователями | ❌ | ✅ |

### Фильтрация задач

```javascript
// Backend (cod_v2.gs)
function getTasksData(userId) {
  const allTasks = // ... из таблицы
  
  if (userId === 'admin') {
    return allTasks;  // Админ видит всё
  }
  
  if (userId) {
    return allTasks.filter(t => t.assignedTo === userId);
  }
  
  return allTasks;
}
```

### Статусы задач

```javascript
const statusLabels = {
  'todo': '📝 Задания',
  'in-progress': '🔄 В работе',
  'done': '✅ Готово'
};

const statusOrder = ['todo', 'in-progress', 'done'];
```

### Логика завершения задачи

```javascript
// При установке status = 'done':
// 1. Заполняется endDate = сегодня
// 2. Вычисляется duration = разница между startDate и endDate
// 3. Задача перемещается вверх списка
```

---

## 📅 Работа с датами

### Форматы

```javascript
// Хранение: YYYY-MM-DD
'2026-03-05'

// Отображение:
formatDate('2026-03-05') → '5 марта'
formatDateWithDay('2026-03-05') → 'среда, 5 марта'
```

### Утилиты

```javascript
getTodayStr()           // '2026-03-05'
getDateOffsetStr(1)     // Завтра
getDateOffsetStr(-1)    // Вчера
getDateOffsetStrFrom(base, delta)  // Сдвиг от даты
```

### Стилизация карточек по дате

```javascript
// planned-active (сегодня) - красный фон
// planned-tomorrow (завтра) - жёлтый фон
// planned-overdue (просрочено) - оранжевый фон
```

---

## 🐛 Отладка

### Логирование frontend

```javascript
console.log('API response:', response);
console.log('Users loaded:', users);
console.error('Error:', e);
```

### Логирование backend (GAS)

```javascript
Logger.log('getUsers called');
Logger.log('Error: ' + e.message);
// Просмотр: ExpLog → Просмотр журналов
```

### Тестовые страницы

1. **test_setup.html** - создание тестовых данных
2. **debug_api.html** - прямые вызовы API

---

## 🚀 Развёртывание

### Backend (Google Apps Script)

1. script.google.com → Новый проект
2. Вставить cod_v2.gs
3. Обновить константы (SPREADSHEET_ID, TOKEN)
4. Развернуть → Веб-приложение
5. Доступ: "Все пользователи"
6. Скопировать URL

### Frontend

1. Обновить API_URL во всех файлах
2. Разместить на GitHub Pages или любом хостинге
3. Для локального тестирования - открыть файлы в браузере

---

## 📝 Чек-лист при изменениях

### Добавление новой фичи:

- [ ] Обновить backend (cod_v2.gs)
- [ ] Обновить frontend (все 3 страницы)
- [ ] Проверить локальный режим
- [ ] Проверить режим API
- [ ] Обновить документацию

### Исправление багов:

- [ ] Воспроизвести в локальном режиме
- [ ] Проверить в режиме API
- [ ] Проверить в обоих видах (таблица/доска)
- [ ] Обновить тестовые данные

### Перед коммитом:

- [ ] Работает локально без API
- [ ] Работает с API
- [ ] Фильтры синхронизированы
- [ ] Drag-and-drop работает
- [ ] Date picker работает
- [ ] Адаптивность проверена

---

## 🔑 Ключевые файлы

| Файл | Назначение | Строк |
|------|-----------|-------|
| cod_v2.gs | Backend API | ~720 |
| select_user_local.html | Вход | ~700 |
| index_local.html | Kanban доска | ~1020 |
| admin_local.html | Админка | ~1150 |

---

## 💡 Советы по разработке

1. **Всегда тестируйте в локальном режиме** - быстрее и проще
2. **Синхронизируйте изменения** между local и API версиями
3. **Используйте console.log** для отладки
4. **Проверяйте оба режима** (таблица/доска) в админке
5. **Сохраняйте обратную совместимость** со старым API

---

**Создано:** 2026-03-05  
**Версия:** 2.0  
**Автор:** Artem
