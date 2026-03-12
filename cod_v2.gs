// ============================================================================
// Kanban Board v2 - Backend API с системой пользователей
// ============================================================================

const SPREADSHEET_ID = '1TsUjce91h44W_PF4dzCqCwGTB_jqhjJxRWBsLiGPmjE';
const SHEET_NAME_TASKS = 'Задания';
const SHEET_NAME_USERS = 'Пользователи';
const LOCK_TIMEOUT_SECONDS = 30;
const TELEGRAM_BOT_TOKEN = '8664566561:AAEV11uRMZIxmqjcoQybafCWAmQhdoQdbXs';

// ============================================================================
// Триггеры
// ============================================================================

function checkUpdates() {
  // Пустая функция для триггера по времени
}

// ============================================================================
// Циклические задачи - Утилиты
// ============================================================================

function calculateNextDate(currentDate, interval, type) {
  const date = new Date(currentDate);
  const intInterval = parseInt(interval);
  
  switch(type) {
    case 'days':
      date.setDate(date.getDate() + intInterval);
      break;
    case 'weeks':
      date.setDate(date.getDate() + (intInterval * 7));
      break;
    case 'months':
      date.setMonth(date.getMonth() + intInterval);
      break;
    case 'years':
      date.setFullYear(date.getFullYear() + intInterval);
      break;
  }
  
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

// ============================================================================
// Утилиты
// ============================================================================

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getLock() {
  return LockService.getScriptLock();
}

function generateId() {
  return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function generateUserId() {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function formatDateForJS(dateVal) {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    const year = dateVal.getFullYear();
    const month = String(dateVal.getMonth() + 1).padStart(2, '0');
    const day = String(dateVal.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }
  if (typeof dateVal === 'number') {
    const ms = Math.round((dateVal - 25569) * 86400 * 1000);
    const d = new Date(ms);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }
  return String(dateVal);
}

// ============================================================================
// Работа с листами
// ============================================================================

function getTasksSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME_TASKS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_TASKS);
    // ID, Задание, Статус, Дата начала, Дата конца, Время выполнения, Плановая дата, AssignedTo
    sheet.appendRow(['ID', 'Задание', 'Статус', 'Дата начала', 'Дата конца', 'Время выполнения', 'Плановая дата', 'AssignedTo']);
    // Форматирование заголовков
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#f5f7fa');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getUsersSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME_USERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_USERS);
    sheet.appendRow(['UserID', 'Имя', 'TelegramID', 'Роль']);
    // Форматирование заголовков
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#f5f7fa');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ============================================================================
// Пользователи - API
// ============================================================================

function getUsers() {
  try {
    const sheet = getUsersSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();

    return data
      .filter(row => row[0] && row[1]) // Есть ID и Имя
      .map(row => ({
        userId: row[0] || '',
        name: row[1] || '',
        telegramId: row[2] || '',
        role: row[3] || 'user'
      }));
  } catch (e) {
    Logger.log('getUsers error: ' + e.message);
    return [];
  }
}

function addUser(name, telegramId, role) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getUsersSheet();
    const userId = generateUserId();
    
    sheet.appendRow([userId, name, telegramId || '', role || 'user']);
    
    return {
      ok: true,
      data: { userId, name, telegramId: telegramId || '', role: role || 'user' }
    };
  } finally {
    lock.releaseLock();
  }
}

function updateUser(userId, name, telegramId, role) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getUsersSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {
        const row = i + 1;
        if (name) sheet.getRange(row, 2).setValue(name);
        if (telegramId !== undefined) sheet.getRange(row, 3).setValue(telegramId || '');
        if (role) sheet.getRange(row, 4).setValue(role);
        
        return {
          ok: true,
          data: {
            userId,
            name: name || data[i][1],
            telegramId: telegramId !== undefined ? (telegramId || '') : data[i][2],
            role: role || data[i][3]
          }
        };
      }
    }
    
    return { ok: false, error: 'Пользователь не найден' };
  } finally {
    lock.releaseLock();
  }
}

function deleteUser(userId) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getUsersSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {
        sheet.deleteRow(i + 1);
        return { ok: true };
      }
    }
    
    return { ok: false, error: 'Пользователь не найден' };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// Задачи - API с фильтрацией по пользователям
// ============================================================================

function getTasksData(userId) {
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const today = formatDateForJS(new Date());

    return data
      .filter(row => {
        // Скрываем будущие циклические задачи (NextDueDate > today)
        const nextDueDate = row[10] || '';
        const isRecurring = row[11] === 'TRUE';
        
        if (isRecurring && nextDueDate && nextDueDate > today) {
          return false;
        }
        
        // Если пользователь не админ — фильтруем по AssignedTo
        if (userId && userId !== 'admin') {
          return row[7] === userId;
        }
        return row[0] || row[1];
      })
      .map(row => ({
        id: row[0] || generateId(),
        title: row[1] || '',
        status: row[2] || 'todo',
        startDate: row[3] ? formatDateForJS(row[3]) : '',
        endDate: row[4] ? formatDateForJS(row[4]) : '',
        duration: row[5] || '',
        plannedDate: row[6] ? formatDateForJS(row[6]) : '',
        assignedTo: row[7] || null,
        recurrenceInterval: row[8] || '',
        recurrenceType: row[9] || '',
        nextDueDate: row[10] || '',
        isRecurring: row[11] === 'TRUE'
      }));
  } catch (e) {
    Logger.log('getTasksData error: ' + e.message);
    return [];
  }
}

function getTasks(userId) {
  return getTasksData(userId);
}

function addTask(title, plannedDate, assignedTo, recurrence) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getTasksSheet();
    
    // recurrence = { interval: 4, type: 'months', nextDueDate: '2026-07-01' }
    const isRecurring = recurrence && recurrence.interval && recurrence.type && recurrence.nextDueDate;
    
    const task = {
      id: generateId(),
      title: title,
      status: 'todo',
      startDate: new Date(),
      endDate: '',
      duration: '',
      plannedDate: plannedDate || '',
      assignedTo: assignedTo || null,
      recurrenceInterval: isRecurring ? recurrence.interval : '',
      recurrenceType: isRecurring ? recurrence.type : '',
      nextDueDate: isRecurring ? recurrence.nextDueDate : '',
      isRecurring: isRecurring ? 'TRUE' : ''
    };

    sheet.appendRow([
      task.id,
      task.title,
      task.status,
      task.startDate,
      task.endDate,
      task.duration,
      task.plannedDate,
      task.assignedTo,
      task.recurrenceInterval,
      task.recurrenceType,
      task.nextDueDate,
      task.isRecurring
    ]);

    return {
      ok: true,
      data: getTasksData(assignedTo)
    };
  } finally {
    lock.releaseLock();
  }
}

function updateTask(taskId, updates) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        const row = i + 1;
        
        if (updates.title !== undefined) {
          sheet.getRange(row, 2).setValue(updates.title);
        }
        if (updates.status !== undefined) {
          sheet.getRange(row, 3).setValue(updates.status);
          
          // Логика при смене статуса на done
          if (data[i][2] === 'done' && updates.status !== 'done') {
            sheet.getRange(row, 5).clearContent(); // endDate
            sheet.getRange(row, 6).clearContent(); // duration
          }
          
          if (updates.status === 'done') {
            const endDate = new Date();
            sheet.getRange(row, 5).setValue(endDate);
            
            const startDate = data[i][3] ? new Date(data[i][3]) : new Date();
            const diffTime = Math.abs(new Date() - startDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            sheet.getRange(row, 6).setValue(diffDays + ' дн.');
          }
        }
        if (updates.plannedDate !== undefined) {
          sheet.getRange(row, 7).setValue(updates.plannedDate || '');
        }
        if (updates.assignedTo !== undefined) {
          sheet.getRange(row, 8).setValue(updates.assignedTo || '');
        }
        
        // Возвращаем обновлённый список задач
        // Если обновлял админ — возвращаем все, иначе — только его
        const returnUserId = updates.assignedTo || data[i][7];
        return {
          ok: true,
          data: getTasksData(returnUserId !== 'admin' ? returnUserId : null)
        };
      }
    }
    
    return { ok: false, error: 'Задача не найдена' };
  } finally {
    lock.releaseLock();
  }
}

function updateTaskStatus(taskId, newStatus) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        const row = i + 1;
        const isRecurring = data[i][11] === 'TRUE';
        
        if (newStatus === 'done') {
          sheet.getRange(row, 3).setValue('done');
          
          const endDate = new Date();
          sheet.getRange(row, 5).setValue(endDate);
          
          const startDate = data[i][3] ? new Date(data[i][3]) : new Date();
          const diffTime = Math.abs(new Date() - startDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          sheet.getRange(row, 6).setValue(diffDays + ' дн.');
          
          // Если циклическая → создать следующую задачу
          if (isRecurring) {
            const interval = data[i][8];
            const type = data[i][9];
            const nextDueDate = data[i][10];
            const assignedTo = data[i][7];
            const title = data[i][1];
            
            const newNextDate = calculateNextDate(nextDueDate, interval, type);
            
            // Создаём новую задачу
            addTask(title, '', assignedTo, {
              interval: interval,
              type: type,
              nextDueDate: newNextDate
            });
          }
        } else {
          sheet.getRange(row, 3).setValue(newStatus);
        }
        
        return { ok: true, data: getTasksData(null) };
      }
    }
    
    return { ok: false, error: 'Задача не найдена' };
  } finally {
    lock.releaseLock();
  }
}

function deleteTask(taskId) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        sheet.deleteRow(i + 1);
        return { ok: true };
      }
    }

    return { ok: false, error: 'Задача не найдена' };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// Циклические задачи - API
// ============================================================================

function getRecurringTasks() {
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    
    return data
      .filter(row => row[11] === 'TRUE')
      .map(row => ({
        id: row[0] || generateId(),
        title: row[1] || '',
        status: row[2] || 'todo',
        startDate: row[3] ? formatDateForJS(row[3]) : '',
        endDate: row[4] ? formatDateForJS(row[4]) : '',
        duration: row[5] || '',
        plannedDate: row[6] ? formatDateForJS(row[6]) : '',
        assignedTo: row[7] || null,
        recurrenceInterval: row[8] || '',
        recurrenceType: row[9] || '',
        nextDueDate: row[10] || '',
        isRecurring: true
      }));
  } catch (e) {
    Logger.log('getRecurringTasks error: ' + e.message);
    return [];
  }
}

function updateRecurringTask(taskId, updates) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        const row = i + 1;

        if (updates.title !== undefined) {
          sheet.getRange(row, 2).setValue(updates.title);
        }
        if (updates.recurrenceInterval !== undefined) {
          sheet.getRange(row, 9).setValue(updates.recurrenceInterval);
        }
        if (updates.recurrenceType !== undefined) {
          sheet.getRange(row, 10).setValue(updates.recurrenceType);
        }
        if (updates.nextDueDate !== undefined) {
          sheet.getRange(row, 11).setValue(updates.nextDueDate);
        }
        if (updates.assignedTo !== undefined) {
          sheet.getRange(row, 8).setValue(updates.assignedTo);
        }

        return { ok: true, data: getRecurringTasks() };
      }
    }

    return { ok: false, error: 'Задача не найдена' };
  } finally {
    lock.releaseLock();
  }
}

function removeRecurring(taskId) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        const row = i + 1;
        sheet.getRange(row, 9).clearContent();
        sheet.getRange(row, 10).clearContent();
        sheet.getRange(row, 11).clearContent();
        sheet.getRange(row, 12).clearContent();

        return { ok: true };
      }
    }

    return { ok: false, error: 'Задача не найдена' };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// HTTP GET Handler
// ============================================================================

function doGet(e) {
  const mode = e.parameter.mode || 'web';
  const action = e.parameter.action || 'getTasks';
  const userId = e.parameter.userId || null;

  // JSONP режим для обхода CORS
  if (mode === 'jsonp') {
    const callback = e.parameter.callback || 'callback';

    let result;
    try {
      if (action === 'getTasks') {
        result = getTasks(userId);
      } else if (action === 'getUsers') {
        result = getUsers();
      } else if (action === 'addTask') {
        const title = e.parameter.title || '';
        const plannedDate = e.parameter.plannedDate || '';
        const assignedTo = e.parameter.assignedTo || userId;
        result = addTask(title, plannedDate, assignedTo);
      } else if (action === 'updateStatus') {
        const id = e.parameter.id;
        const status = e.parameter.status;
        result = updateTaskStatus(id, status);
      } else if (action === 'updateTask') {
        const id = e.parameter.id;
        const title = e.parameter.title || '';
        const status = e.parameter.status || '';
        const plannedDate = e.parameter.plannedDate || '';
        const assignedTo = e.parameter.assignedTo || '';
        result = updateTask(id, { title, status, plannedDate, assignedTo });
      } else if (action === 'deleteTask') {
        const id = e.parameter.id;
        result = deleteTask(id);
      } else if (action === 'addUser') {
        const name = e.parameter.name || '';
        const telegramId = e.parameter.telegramId || '';
        const role = e.parameter.role || 'user';
        result = addUser(name, telegramId, role);
      } else if (action === 'updateUser') {
        const uid = e.parameter.userId || '';
        const name = e.parameter.name || '';
        const telegramId = e.parameter.telegramId || '';
        const role = e.parameter.role || 'user';
        result = updateUser(uid, name, telegramId, role);
      } else if (action === 'deleteUser') {
        const uid = e.parameter.userId || '';
        result = deleteUser(uid);
      } else if (action === 'getRecurringTasks') {
        result = getRecurringTasks();
      } else if (action === 'updateRecurringTask') {
        result = updateRecurringTask(e.parameter.id, {
          title: e.parameter.title || '',
          assignedTo: e.parameter.assignedTo || '',
          recurrenceInterval: e.parameter.recurrenceInterval || '',
          recurrenceType: e.parameter.recurrenceType || '',
          nextDueDate: e.parameter.nextDueDate || ''
        });
      } else if (action === 'removeRecurring') {
        result = removeRecurring(e.parameter.id);
      } else {
        result = { ok: false, error: 'Unknown action' };
      }
    } catch (err) {
      result = { ok: false, error: err.message };
    }

    const output = ContentService
      .createTextOutput(callback + '(' + JSON.stringify({ ok: true, data: result }) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
    return output;
  }

  // JSON API для Telegram WebApp / внешнего фронтенда
  if (mode === 'tg-api') {
    try {
      if (action === 'getTasks') {
        return jsonResponse({ ok: true, data: getTasks(userId) });
      } else if (action === 'getUsers') {
        return jsonResponse({ ok: true, data: getUsers() });
      } else {
        return jsonResponse({ ok: false, error: 'Unknown action for GET' });
      }
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message });
    }
  }

  // Режим для Telegram Webview
  if (mode === 'telegram') {
    return HtmlService.createHtmlOutputFromFile('select_user')
      .setTitle('Kanban Board')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Режим админки
  if (mode === 'admin') {
    return HtmlService.createHtmlOutputFromFile('admin')
      .setTitle('Kanban Admin')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Основной режим - выбор пользователя
  return HtmlService.createHtmlOutputFromFile('select_user')
    .setTitle('Kanban Board')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================================
// HTTP POST Handler
// ============================================================================

function doPost(e) {
  try {
    // Проверяем TG-API режим через URL параметр или через тело запроса
    const isTgApi = (e.parameter && e.parameter.mode === 'tg-api');
    let payload;

    if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
        if (payload._tgApiMode === true) {
          isTgApi = true;
        }
      } catch (ee) {
        Logger.log('JSON parse error: ' + ee.message);
      }
    }

    // Обработка TG-API запросов
    if (isTgApi && payload) {
      const action = payload.action;

      switch (action) {
        case 'getTasks':
          const userId = payload.userId || null;
          return jsonResponse(getTasks(userId));

        case 'getUsers':
          return jsonResponse(getUsers());
          
        case 'addTask':
          const title = payload.title || '';
          const planned = payload.plannedDate || '';
          const assignedTo = payload.assignedTo || payload.userId || null;
          return jsonResponse(addTask(title, planned, assignedTo));
          
        case 'updateTask':
          const taskId = payload.id;
          const updates = {
            title: payload.title,
            status: payload.status,
            plannedDate: payload.plannedDate,
            assignedTo: payload.assignedTo
          };
          return jsonResponse(updateTask(taskId, updates));
          
        case 'updateStatus':
          const id = payload.id;
          const status = payload.status;
          return jsonResponse(updateTaskStatus(id, status));
          
        case 'deleteTask':
          const deleteId = payload.id;
          return jsonResponse(deleteTask(deleteId));
          
        case 'addUser':
          const name = payload.name || '';
          const telegramId = payload.telegramId || '';
          const role = payload.role || 'user';
          return jsonResponse(addUser(name, telegramId, role));
          
        case 'updateUser':
          const updUserId = payload.userId;
          const updName = payload.name;
          const updTelegramId = payload.telegramId;
          const updRole = payload.role;
          return jsonResponse(updateUser(updUserId, updName, updTelegramId, updRole));

        case 'deleteUser':
          const delUserId = payload.userId;
          return jsonResponse(deleteUser(delUserId));

        case 'getRecurringTasks':
          return jsonResponse(getRecurringTasks());

        case 'updateRecurringTask':
          return jsonResponse(updateRecurringTask(payload.id, {
            title: payload.title,
            assignedTo: payload.assignedTo,
            recurrenceInterval: payload.recurrenceInterval,
            recurrenceType: payload.recurrenceType,
            nextDueDate: payload.nextDueDate
          }));

        case 'removeRecurring':
          return jsonResponse(removeRecurring(payload.id));

        default:
          return jsonResponse({ ok: false, error: 'Unknown action' });
      }
    }

    // Обработка Telegram Bot запросов (оставляем обратную совместимость)
    if (!e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('OK');
    }

    const contents = e.postData.contents;
    const update = JSON.parse(contents);
    
    if (update.callback_query) {
      handleCallbackQuery(update);
      return ContentService.createTextOutput('OK');
    }
    
    if (!update.message) {
      return ContentService.createTextOutput('OK');
    }
    
    handleTelegramMessage(update);
    return ContentService.createTextOutput('OK');
    
  } catch (error) {
    Logger.log('doPost error: ' + error.message);
    return ContentService.createTextOutput('Error: ' + error.message);
  }
}

// ============================================================================
// Telegram Bot Helpers (обратная совместимость)
// ============================================================================

function handleCallbackQuery(update) {
  const callbackData = update.callback_query.data;
  const chatId = update.callback_query.message.chat.id;
  const messageId = update.callback_query.message.message_id;
  
  if (callbackData === 'add_task') {
    const userProps = PropertiesService.getUserProperties();
    userProps.setProperty('waiting_for_task_' + chatId, 'true');
    sendMessage(chatId, '📝 Введите текст новой задачи и отправьте:');
    editMessageReplyMarkup(chatId, messageId, null);
  } else if (callbackData === 'show_list') {
    showTaskList(chatId);
    editMessageReplyMarkup(chatId, messageId, null);
  } else if (callbackData === 'show_help') {
    sendMessage(chatId, '📚 *Справка по командам:*\n\n' +
      '*📝 /add <текст>* - добавить новую задачу\n' +
      '*📋 /list* - показать все задачи\n' +
      '*❓ /help* - показать справку\n\n' +
      'Или используй кнопки ниже!', 'Markdown');
    editMessageReplyMarkup(chatId, messageId, null);
  }
  
  answerCallbackQuery(update.callback_query.id);
}

function handleTelegramMessage(update) {
  const chatId = update.message.chat.id;
  const text = update.message.text || '';
  const firstName = update.message.from.first_name || 'друг';
  
  const userProps = PropertiesService.getUserProperties();
  const waitingForTask = userProps.getProperty('waiting_for_task_' + chatId);
  
  if (waitingForTask === 'true') {
    userProps.deleteProperty('waiting_for_task_' + chatId);
    
    const taskTitle = text.trim();
    if (taskTitle) {
      try {
        addTask(taskTitle, '', null);
        const taskCount = getTasksData(null).length;
        sendMessage(chatId, '✅ Задача "' + taskTitle + '" добавлена!\n\n📋 Всего задач: ' + taskCount);
      } catch (e) {
        sendMessage(chatId, '❌ Ошибка при добавлении задачи');
      }
    }
    return;
  }
  
  if (text.startsWith('/start')) {
    const message = 'Привет, ' + firstName + '! 👋\n\nЯ бот для управления задачами в Kanban-доске.';
    const buttons = [
      [{ text: '➕ Добавить задачу', callback_data: 'add_task' }],
      [{ text: '📋 Показать задачи', callback_data: 'show_list' }],
      [{ text: '❓ Помощь', callback_data: 'show_help' }]
    ];
    sendMessageWithKeyboard(chatId, message, buttons);
  } else if (text.startsWith('/help')) {
    const message = '📚 *Справка по командам:*\n\n' +
      '*📝 /add <текст>* - добавить новую задачу\n' +
      '*📋 /list* - показать все текущие задачи\n' +
      '*🔄 /refresh* - обновить данные\n' +
      '*❓ /help* - показать эту справку';
    const buttons = [
      [{ text: '➕ Добавить задачу', callback_data: 'add_task' }],
      [{ text: '📋 Показать задачи', callback_data: 'show_list' }]
    ];
    sendMessageWithKeyboard(chatId, message, buttons);
  } else if (text.startsWith('/add ')) {
    const taskTitle = text.substring(5).trim();
    if (taskTitle) {
      try {
        addTask(taskTitle, '', null);
        const taskCount = getTasksData(null).length;
        sendMessage(chatId, '✅ Задача "' + taskTitle + '" добавлена!\n\n📋 Всего задач: ' + taskCount);
      } catch (e) {
        sendMessage(chatId, '❌ Ошибка при добавлении задачи');
      }
    } else {
      sendMessage(chatId, '⚠️ Укажите текст задачи после команды /add\nПример: /add Купить молоко');
    }
  } else if (text.startsWith('/list')) {
    showTaskList(chatId);
  } else if (text.startsWith('/refresh')) {
    sendMessage(chatId, '🔄 Данные обновлены!\nВсего задач: ' + getTasksData(null).length);
  } else {
    sendMessage(chatId, 'Я не понял команду. Напишите /help для справки.');
  }
}

function showTaskList(chatId) {
  const tasks = getTasksData(null);
  if (tasks.length === 0) {
    sendMessage(chatId, '📋 Задач пока нет.');
    return;
  }
  
  let message = '*📋 Список задач:*\n\n';
  
  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress');
  const doneTasks = tasks.filter(t => t.status === 'done');
  
  if (todoTasks.length > 0) {
    message += '*📌 К выполнению:*\n';
    todoTasks.forEach(t => message += '• ' + t.title + '\n');
    message += '\n';
  }
  
  if (inProgressTasks.length > 0) {
    message += '*🔄 В процессе:*\n';
    inProgressTasks.forEach(t => message += '• ' + t.title + '\n');
    message += '\n';
  }
  
  if (doneTasks.length > 0) {
    message += '*✅ Выполнено:*\n';
    doneTasks.forEach(t => message += '• ' + t.title + '\n');
  }
  
  sendMessage(chatId, message, 'Markdown');
}

function sendMessage(chatId, text, parseMode) {
  try {
    const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
    const payload = { chat_id: chatId, text: text };
    if (parseMode) payload.parse_mode = parseMode;
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };
    
    const response = UrlFetchApp.fetch(url, options);
    return JSON.parse(response.getContentText()).ok;
  } catch (e) {
    Logger.log('Send message error: ' + e.message);
    return false;
  }
}

function sendMessageWithKeyboard(chatId, text, buttons) {
  try {
    const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
    const payload = {
      chat_id: chatId,
      text: text,
      reply_markup: { inline_keyboard: buttons }
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };
    
    const response = UrlFetchApp.fetch(url, options);
    return JSON.parse(response.getContentText()).ok;
  } catch (e) {
    Logger.log('Send message error: ' + e.message);
    return false;
  }
}

function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  try {
    const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/editMessageReplyMarkup';
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup || { inline_keyboard: [] }
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };
    
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    Logger.log('Edit message error: ' + e.message);
  }
}

function answerCallbackQuery(callbackQueryId, text) {
  try {
    const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/answerCallbackQuery';
    const payload = { callback_query_id: callbackQueryId };
    if (text) payload.text = text;
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };
    
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    Logger.log('Answer callback query error: ' + e.message);
  }
}
