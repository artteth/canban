// ============================================================================
// Kanban Board v2 - Backend API с системой пользователей
// ============================================================================

const SPREADSHEET_ID = '1TsUjce91h44W_PF4dzCqCwGTB_jqhjJxRWBsLiGPmjE';
const SHEET_NAME_TASKS = 'задания';
const SHEET_NAME_USERS = 'Пользователи';
const LOCK_TIMEOUT_SECONDS = 30;
const TELEGRAM_BOT_TOKEN = '8664566561:AAEV11uRMZIxmqjcoQybafCWAmQhdoQdbXs';

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
  }
  return sheet;
}

function getUsersSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME_USERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_USERS);
    sheet.appendRow(['UserID', 'Имя', 'TelegramID', 'Роль']);
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

    const users = data
      .filter(row => row[0] && row[1]) // Есть ID и Имя
      .map(row => ({
        userId: row[0] || '',
        name: row[1] || '',
        telegramId: row[2] || '',
        role: row[3] || 'user'
      }));
    
    return { ok: true, data: users };
  } catch (e) {
    Logger.log('getUsers error: ' + e.message);
    return { ok: false, error: e.message, data: [] };
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
    
    return data
      .filter(row => {
        // Если пользователь не админ — фильтруем по AssignedTo
        if (userId && userId !== 'admin') {
          return row[7] === userId; // колонка H (AssignedTo)
        }
        return row[0] || row[1]; // Показываем строки с ID или Заданием
      })
      .map(row => ({
        id: row[0] || generateId(),
        title: row[1] || '',
        status: row[2] || 'todo',
        startDate: row[3] ? formatDateForJS(row[3]) : '',
        endDate: row[4] ? formatDateForJS(row[4]) : '',
        duration: row[5] || '',
        plannedDate: row[6] ? formatDateForJS(row[6]) : '',
        assignedTo: row[7] || null
      }));
  } catch (e) {
    Logger.log('getTasksData error: ' + e.message);
    return [];
  }
}

function getTasks(userId) {
  return {
    ok: true,
    data: getTasksData(userId)
  };
}

function addTask(title, plannedDate, assignedTo) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getTasksSheet();
    const task = {
      id: generateId(),
      title: title,
      status: 'todo',
      startDate: new Date(),
      endDate: '',
      duration: '',
      plannedDate: plannedDate || '',
      assignedTo: assignedTo || null
    };
    
    sheet.appendRow([
      task.id,
      task.title,
      task.status,
      task.startDate,
      task.endDate,
      task.duration,
      task.plannedDate,
      task.assignedTo
    ]);
    
    return {
      ok: true,
      data: getTasksData(assignedTo) // Возвращаем задачи для этого пользователя
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
  return updateTask(taskId, { status: newStatus });
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
      } else if (action === 'deleteTask') {
        const id = e.parameter.id;
        result = deleteTask(id);
      } else {
        result = { ok: false, error: 'Unknown action' };
      }
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    
    const output = ContentService
      .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
    return output;
  }

  // JSON API для Telegram WebApp / внешнего фронтенда
  if (mode === 'tg-api') {
    try {
      if (action === 'getTasks') {
        return jsonResponse(getTasks(userId));
      } else if (action === 'getUsers') {
        return jsonResponse(getUsers());
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
