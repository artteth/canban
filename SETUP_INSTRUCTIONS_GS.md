# 📋 Kanban Board v2 - Инструкция по установке Google Sheets

## 🎯 Обзор

Эта версия использует **Google Таблицы** из примера (`/пример`). Все данные синхронизируются в реальном времени.

**Используемые значения:**
- **SPREADSHEET_ID**: `1TsUjce91h44W_PF4dzCqCwGTB_jqhjJxRWBsLiGPmjE`
- **API_URL**: `https://script.google.com/macros/s/AKfycbwOmfbiY6qcoZtJJFyazXATEQKiVakQoFvRtVBwJbtGIFQUlhxFSiXlL89mI2_cxEg0/exec`

---

## 📁 Структура файлов

```
canban/
├── README.md
├── cod_v2.gs                 # Backend (готов к использованию)
├── select_user.html          # Выбор пользователя
├── index.html                # Kanban-доска
├── admin.html                # Админская панель
└── SETUP_INSTRUCTIONS_GS.md  # Эта инструкция
```

---

## ⚙️ Быстрая настройка

### Шаг 1: Проверка Google Таблицы

Таблица уже настроена:
- **ID**: `1TsUjce91h44W_PF4dzCqCwGTB_jqhjJxRWBsLiGPmjE`
- Лист **задания** с колонной H (AssignedTo)
- Лист **Пользователи**

Откройте: https://docs.google.com/spreadsheets/d/1TsUjce91h44W_PF4dzCqCwGTB_jqhjJxRWBsLiGPmjE/edit

### Шаг 2: Проверка API

Frontend файлы уже содержат правильный `API_URL`. Проверьте:
- `select_user.html` (строка 426)
- `index.html` (строка 776)
- `admin.html` (строка 855)

### Шаг 3: Добавление пользователей

1. Откройте `select_user.html`
2. Нажмите "➕ Добавить пользователя"
3. Создайте пользователя с ролью **admin**

### Шаг 4: Проверка

1. Выберите пользователя → "Продолжить"
2. Создайте задачу
3. Проверьте в таблице: https://docs.google.com/spreadsheets/d/1TsUjce91h44W_PF4dzCqCwGTB_jqhjJxRWBsLiGPmjE/edit

---

## 🔧 Если нужно изменить настройки

### Изменить Google Таблицу

1. Откройте https://script.google.com/
2. Найдите проект с кодом из `cod_v2.gs`
3. При необходимости создайте новую таблицу

### Обновить API_URL

Если развёртываете новую версию:
1. Apps Script → Развернуть → Новое развёртывание
2. Скопируйте новый URL
3. Обновите в HTML файлах

---

## 📝 Чек-лист

- [ ] Таблица доступна по ID
- [ ] Лист "задания" имеет колонку H (AssignedTo)
- [ ] Лист "Пользователи" существует
- [ ] API_URL правильный во всех файлах
- [ ] Создан первый пользователь (admin)
- [ ] Задачи создаются и видны в таблице

**Готово!** 🎉
