const SPREADSHEET_ID = '1TsUjce91h44W_PF4dzCqCwGTB_jqhjJxRWBsLiGPmjE';
const SHEET_NAME = 'задания';
const LOCK_TIMEOUT_SECONDS = 30;

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const mode = e.parameter.mode || 'web';
  
  // JSONP режим для обхода CORS с GitHub Pages
  if (mode === 'jsonp') {
    const callback = e.parameter.callback || 'callback';
    const action = e.parameter.action || 'getTasks';
    
    let result;
    try {
      if (action === 'getTasks') {
        result = getTasks();
      } else if (action === 'addTask') {
        const title = e.parameter.title || '';
        const plannedDate = e.parameter.plannedDate || '';
        result = addTask(title, plannedDate);
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
      .createTextOutput(callback + '(' + JSON.stringify({ ok: true, data: result }) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
    return output;
  }
  
  // JSON API для внешнего фронтенда (GitHub / Telegram WebApp)
  if (mode === 'tg-api') {
    const action = e.parameter.action || 'getTasks';
    if (action === 'getTasks') {
      return jsonResponse({ ok: true, data: getTasks() });
    }
    return jsonResponse({ ok: false, error: 'Unknown action for GET' });
  }
  
  if (mode === 'telegram') {
    return HtmlService.createHtmlOutputFromFile('telegram_v2')
      .setTitle('Kanban Board')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Kanban Board')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['ID', 'Задание', 'Статус', 'Дата начала', 'Дата конца', 'Время выполнения', 'Плановая дата']);
  }
  return sheet;
}

function getTasks() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();

  return data
    .filter(row => row[0] || row[1])
    .map(row => ({
      id: row[0] || generateId(),
      title: row[1] || '',
      status: row[2] || 'todo',
      startDate: row[3] ? formatDateForJS(row[3]) : '',
      endDate: row[4] ? formatDateForJS(row[4]) : '',
      duration: row[5] || '',
      plannedDate: row[6] ? formatDateForJS(row[6]) : ''
    }));
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

function generateId() {
  return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function saveTask(task) {
  const lock = LockService.getScriptLock();
  if (!lock) {
    throw new Error('Сервер занят. Попробуйте еще раз через несколько секунд.');
  }
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === task.id) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 2).setValue(task.title);
      sheet.getRange(rowIndex, 3).setValue(task.status);
      sheet.getRange(rowIndex, 4).setValue(task.startDate);
      sheet.getRange(rowIndex, 5).setValue(task.endDate);
      sheet.getRange(rowIndex, 6).setValue(task.duration);
      sheet.getRange(rowIndex, 7).setValue(task.plannedDate || '');
    } else {
      sheet.appendRow([
        task.id,
        task.title,
        task.status,
        task.startDate,
        task.endDate,
        task.duration,
        task.plannedDate || ''
      ]);
    }
    
    return getTasks();
  } finally {
    lock.releaseLock();
  }
}

function addTask(title, plannedDate) {
  const lock = LockService.getScriptLock();
  if (!lock) {
    throw new Error('Сервер занят. Попробуйте еще раз через несколько секунд.');
  }
  try {
    const task = {
      id: generateId(),
      title: title,
      status: 'todo',
      startDate: new Date(),
      endDate: '',
      duration: '',
      plannedDate: plannedDate || ''
    };

    const sheet = getSheet();
    sheet.appendRow([
      task.id,
      task.title,
      task.status,
      task.startDate,
      task.endDate,
      task.duration,
      task.plannedDate
    ]);

    return getTasks();
  } finally {
    lock.releaseLock();
  }
}

function updateTaskStatus(taskId, newStatus) {
  const lock = LockService.getScriptLock();
  if (!lock) {
    throw new Error('Сервер занят. Попробуйте еще раз через несколько секунд.');
  }
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        sheet.getRange(i + 1, 3).setValue(newStatus);

        if (data[i][2] === 'done' && newStatus !== 'done') {
          sheet.getRange(i + 1, 5).clearContent();
          sheet.getRange(i + 1, 6).clearContent();
        }

        if (newStatus === 'done') {
          const endDate = new Date();
          sheet.getRange(i + 1, 5).setValue(endDate);
          
          const startDate = data[i][3] ? new Date(data[i][3]) : new Date();
          const diffTime = Math.abs(new Date() - startDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          sheet.getRange(i + 1, 6).setValue(diffDays + ' дн.');
          
          const sourceRow = i + 1;
          const targetRow = 2;
          if (sourceRow !== targetRow) {
            const rowValues = sheet.getRange(sourceRow, 1, 1, sheet.getLastColumn()).getValues()[0];
            sheet.insertRowBefore(2);
            sheet.getRange(2, 1, 1, rowValues.length).setValues([rowValues]);
            sheet.deleteRow(sourceRow + 1);
          }
        }
        
        break;
      }
    }

    return getTasks();
  } finally {
    lock.releaseLock();
  }
}

function deleteTask(taskId) {
  const lock = LockService.getScriptLock();
  if (!lock) {
    throw new Error('Сервер занят. Попробуйте еще раз через несколько секунд.');
  }
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
    
    return getTasks();
  } finally {
    lock.releaseLock();
  }
}

const TELEGRAM_BOT_TOKEN = '8664566561:AAEV11uRMZIxmqjcoQybafCWAmQhdoQdbXs';

function doPost(e) {
  try {
    var isTgApi = (e.parameter && e.parameter.mode === 'tg-api');
    
    if (!isTgApi && e.postData && e.postData.contents) {
      try {
        var payloadCheck = JSON.parse(e.postData.contents);
        if (payloadCheck._tgApiMode === true) {
          isTgApi = true;
        }
      } catch (ee) {}
    }
    
    if (isTgApi) {
      const payloadRaw = e.postData && e.postData.contents ? e.postData.contents : '{}';
      const payload = JSON.parse(payloadRaw);
      const action = payload.action;

      if (action === 'getTasks') {
        return jsonResponse({ ok: true, data: getTasks() });
      } else if (action === 'addTask') {
        const title = payload.title || '';
        const planned = payload.plannedDate || '';
        const data = addTask(title, planned);
        return jsonResponse({ ok: true, data });
      } else if (action === 'updateStatus') {
        const id = payload.id;
        const status = payload.status;
        const data = updateTaskStatus(id, status);
        return jsonResponse({ ok: true, data });
      }

      return jsonResponse({ ok: false, error: 'Unknown action' });
    }
    
    Logger.log('doPost called');
    
    if (!e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('OK');
    }
    
    const contents = e.postData.contents;
    Logger.log('Contents length: ' + contents.length);
    
    const update = JSON.parse(contents);
    Logger.log('Update type: ' + (update.callback_query ? 'callback_query' : (update.message ? 'message' : 'unknown')));
    
    if (update.callback_query) {
      const callbackData = update.callback_query.data;
      const chatId = update.callback_query.message.chat.id;
      const messageId = update.callback_query.message.message_id;
      
      Logger.log('Callback: ' + callbackData + ' from chat: ' + chatId);
      
      if (callbackData === 'add_task') {
        const userProps = PropertiesService.getUserProperties();
        userProps.setProperty('waiting_for_task_' + chatId, 'true');
        
        sendMessage(chatId, '📝 Введите текст новой задачи и отправьте:');
        editMessageReplyMarkup(chatId, messageId, null);
      } else if (callbackData === 'show_list') {
        showTaskList(chatId);
        editMessageReplyMarkup(chatId, messageId, null);
      } else if (callbackData === 'show_help') {
        sendMessage(chatId, `📚 *Справка по командам:*\n\n` +
          `*📝 /add <текст>* - добавить новую задачу\n` +
          `*📋 /list* - показать все задачи\n` +
          `*❓ /help* - показать справку\n\n` +
          `Или используй кнопки ниже!`, 'Markdown');
        editMessageReplyMarkup(chatId, messageId, null);
      }
      
      answerCallbackQuery(update.callback_query.id);
      
      return ContentService.createTextOutput('OK');
    }
    
    if (!update.message) return ContentService.createTextOutput('OK');
    
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
          addTask(taskTitle);
          const taskCount = getTasks().length;
          sendMessage(chatId, `✅ Задача "${taskTitle}" добавлена!\n\n📋 Всего задач: ${taskCount}`);
        } catch (e) {
          sendMessage(chatId, '❌ Ошибка при добавлении задачи');
        }
      }
      return ContentService.createTextOutput('OK');
    }
    
    Logger.log('Processing command: ' + text);
    
    if (text.startsWith('/start')) {
      const message = `Привет, ${firstName}! 👋\n\nЯ бот для управления задачами в Kanban-доске.`;
      const buttons = [
        [{ text: '➕ Добавить задачу', callback_data: 'add_task' }],
        [{ text: '📋 Показать задачи', callback_data: 'show_list' }],
        [{ text: '❓ Помощь', callback_data: 'show_help' }]
      ];
      sendMessageWithKeyboard(chatId, message, buttons);
    } else if (text.startsWith('/help')) {
      const message = `📚 *Справка по командам:*\n\n` +
        `*📝 /add <текст>* - добавить новую задачу\n` +
        `Пример: /add Купить молоко\n\n` +
        `*📋 /list* - показать все текущие задачи\n\n` +
        `*🔄 /refresh* - обновить данные\n\n` +
        `*❓ /help* - показать эту справку`;
      const buttons = [
        [{ text: '➕ Добавить задачу', callback_data: 'add_task' }],
        [{ text: '📋 Показать задачи', callback_data: 'show_list' }]
      ];
      sendMessageWithKeyboard(chatId, message, buttons);
    } else if (text.startsWith('/add ')) {
      const taskTitle = text.substring(5).trim();
      Logger.log('Adding task: ' + taskTitle);
      if (taskTitle) {
        try {
          addTask(taskTitle);
          const taskCount = getTasks().length;
          Logger.log('Task added, total: ' + taskCount);
          sendMessage(chatId, `✅ Задача "${taskTitle}" добавлена!\n\n📋 Всего задач: ${taskCount}`);
        } catch (e) {
          Logger.log('Error adding task: ' + e.message);
          sendMessage(chatId, '❌ Ошибка при добавлении задачи');
        }
      } else {
        sendMessage(chatId, '⚠️ Укажите текст задачи после команды /add\nПример: /add Купить молоко');
      }
    } else if (text.startsWith('/list')) {
      const tasks = getTasks();
      if (tasks.length === 0) {
        sendMessage(chatId, '📋 Задач пока нет. Добавьте первую командой /add');
      } else {
        let message = '*📋 Список задач:*\n\n';
        
        const todoTasks = tasks.filter(t => t.status === 'todo');
        const inProgressTasks = tasks.filter(t => t.status === 'in-progress');
        const doneTasks = tasks.filter(t => t.status === 'done');
        
        if (todoTasks.length > 0) {
          message += '*📌 К выполнению:*\n';
          todoTasks.forEach(t => message += `• ${t.title}\n`);
          message += '\n';
        }
        
        if (inProgressTasks.length > 0) {
          message += '*🔄 В процессе:*\n';
          inProgressTasks.forEach(t => message += `• ${t.title}\n`);
          message += '\n';
        }
        
        if (doneTasks.length > 0) {
          message += '*✅ Выполнено:*\n';
          doneTasks.forEach(t => message += `• ${t.title}\n`);
        }
        
        sendMessage(chatId, message, 'Markdown');
      }
    } else if (text.startsWith('/refresh')) {
      sendMessage(chatId, '🔄 Данные обновлены!\nВсего задач: ' + getTasks().length);
    } else {
      sendMessage(chatId, `Я не понял команду. Напишите /help для справки.`);
    }
    
    return ContentService.createTextOutput('OK');
  } catch (error) {
    return ContentService.createTextOutput('Error: ' + error.message);
  }
}

function sendMessage(chatId, text, parseMode) {
  try {
    Logger.log('sendMessage called: chatId=' + chatId + ', text=' + text);
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text
    };
    
    if (parseMode) {
      payload.parse_mode = parseMode;
    }
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    Logger.log('Send message result: ' + JSON.stringify(result));
    
    return result.ok;
  } catch (e) {
    Logger.log('Send message error: ' + e.message);
    return false;
  }
}

function sendMessageWithKeyboard(chatId, text, buttons) {
  try {
    Logger.log('sendMessageWithKeyboard called: chatId=' + chatId + ', text=' + text);
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text,
      reply_markup: {
        inline_keyboard: buttons
      }
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    Logger.log('Send message result: ' + JSON.stringify(result));
    
    return result.ok;
  } catch (e) {
    Logger.log('Send message error: ' + e.message);
    return false;
  }
}

function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`;
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
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
    const payload = {
      callback_query_id: callbackQueryId
    };
    
    if (text) {
      payload.text = text;
    }
    
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

function showTaskList(chatId) {
  const tasks = getTasks();
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
    todoTasks.forEach(t => message += `• ${t.title}\n`);
    message += '\n';
  }
  
  if (inProgressTasks.length > 0) {
    message += '*🔄 В процессе:*\n';
    inProgressTasks.forEach(t => message += `• ${t.title}\n`);
    message += '\n';
  }
  
  if (doneTasks.length > 0) {
    message += '*✅ Выполнено:*\n';
    doneTasks.forEach(t => message += `• ${t.title}\n`);
  }
  
  sendMessage(chatId, message, 'Markdown');
}
