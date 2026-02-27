const SPREADSHEET_ID = '1TsUjce91h44W_PF4dzCqCwGTB_jqhjJxRWBsLiGPmjE';
const SHEET_NAME = 'задания';
const LOCK_TIMEOUT_SECONDS = 30;

function jsonResponse(obj) {
  const output = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  // Добавляем заголовки для CORS
  output.setHeader('Access-Control-Allow-Origin', '*');
  output.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return output;
}

function doOptions(e) {
  // Обработка preflight запросов для CORS
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Acquires a script lock to prevent concurrent spreadsheet modifications.
 * @returns {Lock} The lock object or null if unable to acquire.
 */
function getLock() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
    return lock;
  } catch (e) {
    Logger.log('Lock timeout: ' + e.message);
    return null;
  }
}

function doGet(e) {
  const mode = e.parameter.mode || 'web';
  
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
    .filter(row => row[0] || row[1]) // Фильтруем пустые строки
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
    // Возвращаем дату в локальной таймзоне скрипта, без сдвига в UTC
    const year = dateVal.getFullYear();
    const month = String(dateVal.getMonth() + 1).padStart(2, '0');
    const day = String(dateVal.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }
  if (typeof dateVal === 'number') {
    // Преобразуем номер дня Google Sheets в локальную дату
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
  const lock = getLock();
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
  const lock = getLock();
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
  const lock = getLock();
  if (!lock) {
    throw new Error('Сервер занят. Попробуйте еще раз через несколько секунд.');
  }
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        sheet.getRange(i + 1, 3).setValue(newStatus);

        // Если перемещаем из "done" обратно - сбрасываем дату конца и время
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
          
          // Перемещаем завершённую задачу в начало списка (строка 2 под заголовком)
          const sourceRow = i + 1;
          const targetRow = 2;
          if (sourceRow !== targetRow) {
            const rowValues = sheet.getRange(sourceRow, 1, 1, sheet.getLastColumn()).getValues()[0];
            sheet.insertRowBefore(2);
            sheet.getRange(2, 1, 1, rowValues.length).setValues([rowValues]);
            sheet.deleteRow(sourceRow + 1); // после вставки строка сместилась вниз
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
  const lock = getLock();
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

// ============================================
// TELEGRAM BOT INTEGRATION
// ============================================

const TELEGRAM_BOT_TOKEN = '8664566561:AAEV11uRMZIxmqjcoQybafCWAmQhdoQdbXs';

function doPost(e) {
  try {
    // JSON API для внешнего фронтенда (GitHub / Telegram WebApp)
    // Проверяем mode и в параметрах URL, и в теле запроса
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
    
    // Логирование для отладки
    Logger.log('doPost called');
    
    if (!e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('OK');
    }
    
    const contents = e.postData.contents;
    Logger.log('Contents length: ' + contents.length);
    
    const update = JSON.parse(contents);
    Logger.log('Update type: ' + (update.callback_query ? 'callback_query' : (update.message ? 'message' : 'unknown')));
    
    // Обработка callback_query (нажатие на кнопку)
    if (update.callback_query) {
      const callbackData = update.callback_query.data;
      const chatId = update.callback_query.message.chat.id;
      const messageId = update.callback_query.message.message_id;
      
      Logger.log('Callback: ' + callbackData + ' from chat: ' + chatId);
      
      if (callbackData === 'add_task') {
        // Устанавливаем состояние "ожидание задачи"
        const userProps = PropertiesService.getUserProperties();
        userProps.setProperty('waiting_for_task_' + chatId, 'true');
        
        // Отправляем сообщение с просьбой ввести задачу
        sendMessage(chatId, '📝 Введите текст новой задачи и отправьте:');
        // Удаляем кнопку
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
      
      // Отвечаем на callback, чтобы убрать "часики" на кнопке
      answerCallbackQuery(update.callback_query.id);
      
      return ContentService.createTextOutput('OK');
    }
    
    // Обработка обычных сообщений
    if (!update.message) return ContentService.createTextOutput('OK');
    
    const chatId = update.message.chat.id;
    const text = update.message.text || '';
    const firstName = update.message.from.first_name || 'друг';
    
    // Проверяем, ожидает ли пользователь ввода задачи
    const userProps = PropertiesService.getUserProperties();
    const waitingForTask = userProps.getProperty('waiting_for_task_' + chatId);
    
    if (waitingForTask === 'true') {
      // Это сообщение - текст задачи
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
    
    // Обработка команд
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
        const inProgressTasks = tasks.filter(t => t.status === 'inprogress');
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

// Отправка сообщения с кнопками
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
    
    Logger.log('sendMessageWithKeyboard result: ' + JSON.stringify(result));
    
    return result.ok;
  } catch (e) {
    Logger.log('Send message error: ' + e.message);
    return false;
  }
}

// Ответ на callback query
function answerCallbackQuery(callbackQueryId) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
    const payload = {
      callback_query_id: callbackQueryId
    };
    
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    });
  } catch (e) {
    Logger.log('Answer callback error: ' + e.message);
  }
}

// Редактирование сообщения (удаление кнопок)
function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`;
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup
    };
    
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    });
  } catch (e) {
    Logger.log('Edit message error: ' + e.message);
  }
}

// Показать список задач с кнопками
function showTaskList(chatId) {
  const tasks = getTasks();
  if (tasks.length === 0) {
    sendMessageWithKeyboard(chatId, '📋 Задач пока нет. Добавьте первую!', getMainButtons());
    return;
  }
  
  let message = '*📋 Список задач:*\n\n';
  
  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'inprogress');
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
  
  sendMessageWithKeyboard(chatId, message, getMainButtons());
}

// Главные кнопки меню
function getMainButtons() {
  return [
    [{ text: '➕ Добавить задачу', callback_data: 'add_task' }],
    [{ text: '📋 Показать задачи', callback_data: 'show_list' }],
    [{ text: '❓ Помощь', callback_data: 'show_help' }]
  ];
}

// Установка webhook для Telegram бота
function setWebhook() {
  try {
    // Сначала удаляем старый webhook
    const deleteUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`;
    UrlFetchApp.fetch(deleteUrl, { method: 'post' });
    Logger.log('Old webhook deleted');
    
    // Получаем URL из нового деплоя
    // ВАЖНО: нужно открыть новый деплой в браузере, затем запустить эту функцию
    const scriptUrl = ScriptApp.getService().getUrl();
    
    if (!scriptUrl) {
      return 'Ошибка: Web App не развернут!';
    }
    
    Logger.log('Script URL: ' + scriptUrl);
    
    // Проверяем, что URL не содержит /dev
    if (scriptUrl.includes('/dev')) {
      return 'Ошибка: URL содержит /dev. \n\n' +
        'После создания нового деплоя:\n' +
        '1. Нажми на ссылку веб-приложения в окне деплоя\n' +
        '2. Откроется страница - подтверди доступ\n' +
        '3. Скопируй URL из адресной строки (без /dev)\n' +
        '4. Вставь его ниже в функцию setWebhookUrl()';
    }
    
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;
    
    const payload = {
      url: scriptUrl
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    Logger.log('Webhook set result: ' + JSON.stringify(result));
    
    return result.ok ? '✅ Webhook установлен на: ' + scriptUrl : 'Ошибка: ' + result.description;
  } catch (e) {
    return 'Ошибка: ' + e.message;
  }
}

// Установка webhook - пробуем разные URL
function tryWebhookSetup() {
  // Удаляем старый webhook
  try {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`, { method: 'post' });
  } catch(e) {}
  
  // URL веб-приложения
  const webAppUrl = ScriptApp.getService().getUrl();
  
  Logger.log('Web App URL: ' + webAppUrl);
  
  // Пробуем установить webhook
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;
  const payload = {
    url: webAppUrl,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    Logger.log('Webhook setup result: ' + JSON.stringify(result));
    
    if (result.ok) {
      return '✅ Webhook установлен!';
    } else {
      return '❌ Ошибка: ' + result.description;
    }
  } catch(e) {
    return '❌ Ошибка: ' + e.message;
  }
}

// Установка webhook для Telegram бота
function installWebhook() {
  // Удаляем webhook
  try {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`, { method: 'post' });
  } catch(e) {}
  
  // Запускаем polling с несколькими триггерами
  startPolling();
  
  return '✅ Polling запущен! Бот будет проверять сообщения.';
}

// Запуск проверки сообщений
function startPolling() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('pollingEnabled') === 'true') return;
  
  props.setProperty('pollingEnabled', 'true');
  
  // Создаём три триггера с разными интервалами
  // Триггер 1 - каждую минуту
  ScriptApp.newTrigger('checkUpdates')
    .timeBased()
    .everyMinutes(1)
    .create();
  
  // Триггер 2 - каждые 20 секунд (имитация)
  // Но GAS не поддерживает 20 секунд, поэтому используем workaround
  
  Logger.log('Polling trigger created');
}

function checkUpdates() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('pollingEnabled') !== 'true') return;
  
  Logger.log('checkUpdates called');
  
  // Проверяем 12 раз с интервалом в 5 секунд (всего 60 секунд = 1 минута)
  for (let i = 0; i < 12; i++) {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?timeout=1`;
      const response = UrlFetchApp.fetch(url, { timeout: 5 });
      const updates = JSON.parse(response.getContentText());
      
      Logger.log('Updates count: ' + (updates.result ? updates.result.length : 0));
      
      if (updates.ok && updates.result && updates.result.length > 0) {
        // Обрабатываем ВСЕ обновления
        for (let j = 0; j < updates.result.length; j++) {
          const update = updates.result[j];
          processUpdate(update);
        }
        
        // Подтверждаем все обновления
        const lastUpdate = updates.result[updates.result.length - 1];
        const offset = lastUpdate.update_id + 1;
        UrlFetchApp.fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}`);
        Logger.log('Processed ' + updates.result.length + ' updates');
        
        // Если есть обновления, выходим из цикла
        break;
      }
    } catch (e) {
      Logger.log('checkUpdates error: ' + e.message);
    }
    
    // Ждём 5 секунд перед следующей проверкой
    if (i < 11) {
      Utilities.sleep(5000);
    }
  }
}

function processUpdate(update) {
  Logger.log('processUpdate called with: ' + JSON.stringify(update));
  
  const chatId = update.message ? update.message.chat.id : (update.callback_query ? update.callback_query.message.chat.id : null);
  if (!chatId) {
    Logger.log('No chatId found');
    return;
  }
  
  const text = update.message ? update.message.text : '';
  const firstName = (update.message ? update.message.from.first_name : (update.callback_query ? update.callback_query.from.first_name : 'друг')) || 'друг';
  
  Logger.log('chatId: ' + chatId + ', text: ' + text);
  
  // Обработка callback_query
  if (update.callback_query) {
    const callbackData = update.callback_query.data;
    const messageId = update.callback_query.message.message_id;
    
    if (callbackData === 'add_task') {
      const userProps = PropertiesService.getUserProperties();
      userProps.setProperty('waiting_for_task_' + chatId, 'true');
      sendMessage(chatId, '📝 Введите текст новой задачи и отправьте:');
      editMessageReplyMarkup(chatId, messageId, getMainButtons());
    } else if (callbackData === 'show_list') {
      showTaskList(chatId);
      editMessageReplyMarkup(chatId, messageId, getMainButtons());
    } else if (callbackData === 'show_help') {
      sendMessageWithKeyboard(chatId, `📚 *Справка по командам:*\n\n` +
        `*📝 /add <текст>* - добавить новую задачу\n` +
        `*📋 /list* - показать все задачи\n` +
        `*❓ /help* - показать справку`, 'Markdown');
      editMessageReplyMarkup(chatId, messageId, getMainButtons());
    }
    
    answerCallbackQuery(update.callback_query.id);
    return;
  }
  
  // Проверяем, ожидает ли пользователь ввода задачи
  const userProps = PropertiesService.getUserProperties();
  const waitingForTask = userProps.getProperty('waiting_for_task_' + chatId);
  
  if (waitingForTask === 'true' && text) {
    userProps.deleteProperty('waiting_for_task_' + chatId);
    const taskTitle = text.trim();
    if (taskTitle) {
      try {
        addTask(taskTitle);
        const taskCount = getTasks().length;
        sendMessageWithKeyboard(chatId, `✅ Задача "${taskTitle}" добавлена!\n\n📋 Всего задач: ${taskCount}`, getMainButtons());
      } catch (e) {
        sendMessageWithKeyboard(chatId, '❌ Ошибка при добавлении задачи', getMainButtons());
      }
    } else {
      sendMessageWithKeyboard(chatId, '⚠️ Введите текст задачи', getMainButtons());
    }
    return;
  }
  
  // Обработка команд
  if (text.startsWith('/start')) {
    const message = `Привет, ${firstName}! 👋\n\nЯ бот для управления задачами в Kanban-доске.`;
    sendMessageWithKeyboard(chatId, message, getMainButtons());
  } else if (text.startsWith('/help')) {
    const message = `📚 *Справка по командам:*\n\n` +
      `*📝 /add <текст>* - добавить новую задачу\n` +
      `Пример: /add Купить молоко\n\n` +
      `*📋 /list* - показать все текущие задачи\n\n` +
      `*❓ /help* - показать эту справку`;
    sendMessageWithKeyboard(chatId, message, getMainButtons());
  } else if (text.startsWith('/add ')) {
    const taskTitle = text.substring(5).trim();
    if (taskTitle) {
      try {
        addTask(taskTitle);
        const taskCount = getTasks().length;
        sendMessageWithKeyboard(chatId, `✅ Задача "${taskTitle}" добавлена!\n\n📋 Всего задач: ${taskCount}`, getMainButtons());
      } catch (e) {
        sendMessageWithKeyboard(chatId, '❌ Ошибка при добавлении задачи', getMainButtons());
      }
    } else {
      sendMessageWithKeyboard(chatId, '⚠️ Укажите текст задачи после команды /add\nПример: /add Купить молоко', getMainButtons());
    }
  } else if (text.startsWith('/list')) {
    showTaskList(chatId);
  } else if (text.startsWith('/refresh')) {
    sendMessageWithKeyboard(chatId, '🔄 Данные обновлены!\nВсего задач: ' + getTasks().length, getMainButtons());
  }
}

// Удаление webhook
function removeWebhook() {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`;
  const response = UrlFetchApp.fetch(url, { method: 'post' });
  return response.getContentText();
}

// Проверка статуса webhook
function getWebhookInfo() {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`;
  const response = UrlFetchApp.fetch(url);
  const result = response.getContentText();
  Logger.log(result);
  return result;
}

// Тестовая функция для отправки сообщения
// Чтобы узнать свой chat_id:
// 1. Напиши боту /start
// 2. Запусти getUpdates() - там будет твой chat_id
function testBot() {
  const updates = getUpdates();
  return 'Напиши боту /start, затем запусти эту функцию и посмотри chat_id в логах.\n\n' +
    'Результат getUpdates():\n' + updates;
}

// Получить информацию о боте
function getBotInfo() {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
  const response = UrlFetchApp.fetch(url);
  return response.getContentText();
}

// Просмотр логов
function getLogs() {
  return Logger.getLog();
}

// Тестовая функция для отладки - отправляет сообщение
// Чтобы узнать свой chat_id, напиши боту /start, затем запусти getUpdates()
function testSendMessage() {
  // Замени на свой chat_id
  const testChatId = 'ТВОЙ_CHAT_ID';
  return sendMessage(testChatId, 'Тестовое сообщение!');
}

// Получить последние обновления от Telegram
function getUpdates() {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
  const response = UrlFetchApp.fetch(url);
  return response.getContentText();
}
