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
  // Обрабатываем циклические задачи по расписанию
  processRecurringTasks();
}

// ============================================================================
// Настройка триггера (вызвать один раз вручную)
// ============================================================================

// Установить триггер на каждый день в полночь
function setupDailyTrigger() {
  // Удаляем существующие триггеры
  const triggers = ScriptApp.getProjectTriggers();
  for (let trigger of triggers) {
    if (trigger.getHandlerFunction() === 'checkUpdates') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  // Создаем новый триггер на каждый день в полночь
  ScriptApp.newTrigger('checkUpdates')
    .timeBased()
    .atHour(0)  // в 00:00
    .everyDays(1)
    .create();
  
  Logger.log('Триггер установлен: checkUpdates будет выполняться ежедневно в полночь');
  return { ok: true, message: 'Триггер установлен на ежедневное выполнение в полночь' };
}

// Установить триггер на каждую минуту
function setupTestTriggerEveryMinute() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let trigger of triggers) {
    if (trigger.getHandlerFunction() === 'checkUpdates') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  ScriptApp.newTrigger('checkUpdates')
    .timeBased()
    .everyMinutes(1)
    .create();
  
  Logger.log('Триггер установлен: checkUpdates будет выполняться каждую минуту');
  return { ok: true, message: 'Триггер установлен на каждую минуту' };
}

// Установить триггер на каждые 5 минут
function setupTestTriggerEvery5Minutes() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let trigger of triggers) {
    if (trigger.getHandlerFunction() === 'checkUpdates') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  ScriptApp.newTrigger('checkUpdates')
    .timeBased()
    .everyMinutes(5)
    .create();
  
  Logger.log('Триггер установлен: checkUpdates будет выполняться каждые 5 минут');
  return { ok: true, message: 'Триггер установлен на каждые 5 минут' };
}

// Удалить все триггеры
function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;
  for (let trigger of triggers) {
    ScriptApp.deleteTrigger(trigger);
    deletedCount++;
  }
  Logger.log('Удалено триггеров: ' + deletedCount);
  return { ok: true, deleted: deletedCount };
}

// ============================================================================
// Циклические задачи - Утилиты
// ============================================================================

// Основная функция для создания задач по расписанию (вызывается триггером)
function processRecurringTasks() {
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const now = new Date();
    const nowStr = formatDateForJS(now);
    const nowTime = now.toTimeString().slice(0, 5); // HH:MM
    
    Logger.log('=== processRecurringTasks started ===');
    Logger.log('Current time: ' + nowStr + ' ' + nowTime);
    Logger.log('Total rows: ' + data.length);
    
    let createdCount = 0;
    
    // Начинаем с i = 0 (первая строка данных после заголовков)
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const taskId = row[0];
      const title = row[1] || 'Untitled';
      const isRecurring = String(row[11]).toUpperCase();
      const isPaused = String(row[12]).toUpperCase();
      
      Logger.log('Row ' + (i+2) + ': "' + title + '" isRecurring="' + isRecurring + '" isPaused="' + isPaused + '"');
      
      // Пропускаем нециклические задачи
      if (isRecurring !== 'TRUE') {
        Logger.log('  -> Skipping: not recurring (isRecurring=' + isRecurring + ')');
        continue;
      }
      
      // Пропускаем приостановленные
      if (isPaused === 'TRUE') {
        Logger.log('  -> Skipping: paused');
        continue;
      }
      
      let nextDueDate = row[10];
      Logger.log('  -> nextDueDate raw: ' + nextDueDate);
      
      // Пропускаем если нет даты
      if (!nextDueDate) {
        Logger.log('  -> Skipping: no nextDueDate');
        continue;
      }
      
      // Считываем СВЕЖЕЕ значение даты прямо из таблицы (строка i+2, столбец 11 = K)
      const freshRow = sheet.getRange(i + 2, 1, 1, 12).getValues()[0];
      const freshNextDueDate = freshRow[10];
      
      if (!freshNextDueDate) {
        Logger.log('  -> Skipping: no fresh nextDueDate');
        continue;
      }
      
      // Используем дату напрямую - Google Sheets возвращает Date объект
      // Если это не Date, пробуем преобразовать
      let dueDate;
      if (freshNextDueDate instanceof Date) {
        dueDate = freshNextDueDate;
      } else {
        dueDate = new Date(freshNextDueDate);
      }
      
      Logger.log('  -> Fresh dueDate: ' + dueDate.toString());
      Logger.log('  -> now: ' + now.toString());
      Logger.log('  -> dueDate <= now: ' + (dueDate <= now));
      
      if (dueDate <= now) {
        const assignedTo = row[7];
        const interval = row[8];
        const type = row[9];
        
        Logger.log('  -> interval=' + interval + ' type=' + type);
        Logger.log('  -> Creating new task instance!');
        
        // Создаем новую задачу-экземпляр
        addTaskInstance(title, assignedTo, taskId);
        
        // Вычисляем следующую дату от актуальной даты из таблицы
        Logger.log('  -> Calculating next date from fresh dueDate: ' + dueDate.toString());
        const newNextDate = calculateNextDate(dueDate, interval, type);
        Logger.log('  -> New next date: ' + newNextDate);
        
        // Обновляем nextDueDate у родительской задачи
        // Записываем в столбец K (11) той же строки
        const rowNum = i + 2;  // i - индекс в массиве (с 0), +1 для учёта заголовка, +1 для правильной строки
        sheet.getRange(rowNum, 11).setValue(newNextDate);
        
        // Принудительно применяем изменения
        SpreadsheetApp.flush();
        
        createdCount++;
        Logger.log('  -> Created! Next due: ' + newNextDate);
      } else {
        Logger.log('  -> Not yet time to create');
      }
    }
    
    Logger.log('=== processRecurringTasks finished: created ' + createdCount + ' tasks ===');
    return { ok: true, created: createdCount };
  } catch (e) {
    Logger.log('processRecurringTasks error: ' + e.message);
    Logger.log(e.stack);
    return { ok: false, error: e.message };
  }
}

// Создает экземпляр задачи (без данных цикла)
function addTaskInstance(title, assignedTo, parentId) {
  const sheet = getTasksSheet();
  
  sheet.appendRow([
    generateId(),
    title,
    'todo',           // status
    new Date(),       // startDate
    '',               // endDate
    '',               // duration
    '',               // plannedDate
    assignedTo || null,
    '',               // recurrenceInterval - пусто для экземпляра
    '',               // recurrenceType - пусто для экземпляра
    '',               // nextDueDate - пусто для экземпляра
    ''                // isRecurring - пусто для экземпляра
  ]);
}

function calculateNextDate(currentDate, interval, type) {
  let date;
  
  // Обрабатываем разные форматы даты
  if (currentDate instanceof Date) {
    date = new Date(currentDate);
  } else if (typeof currentDate === 'string') {
    // Поддерживаем формат YYYY-MM-DD или YYYY-MM-DDTHH:MM
    if (currentDate.includes('T')) {
      date = new Date(currentDate.replace('T', ' '));
    } else {
      date = new Date(currentDate);
    }
  } else if (typeof currentDate === 'number') {
    date = new Date(currentDate);
  } else {
    // Если дата не определена, используем сегодня
    date = new Date();
  }
  
  const intInterval = parseInt(interval);
  
  switch(type) {
    case 'minutes':
      date.setMinutes(date.getMinutes() + intInterval);
      break;
    case 'hours':
      date.setHours(date.getHours() + intInterval);
      break;
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
  
  // Форматируем дату с временем
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  
  // Проверяем, было ли время в исходной дате ДО модификации
  let hasTime = false;
  let origDate;
  if (currentDate instanceof Date) {
    origDate = currentDate;
  } else if (typeof currentDate === 'string' && currentDate.includes('T')) {
    hasTime = true;
  }
  
  // Для Date объекта - проверяем исходную дату
  if (origDate) {
    const origHours = origDate.getHours();
    const origMinutes = origDate.getMinutes();
    hasTime = (origHours !== 0 || origMinutes !== 0);
  }
  
  if (hasTime) {
    return y + '-' + m + '-' + d + 'T' + h + ':' + min;
  }
  return y + '-' + m + '-' + d;
}

// ============================================================================
// Загрузка изображений в Google Drive
// ============================================================================

function uploadImageToDrive(base64Data, fileName, taskId) {
  try {
    // Удаляем префикс data:image/jpeg;base64,
    var base64String = base64Data.replace(/^data:image\/(jpeg|png|jpg|gif|webp);base64,/, '');
    
    // Декодируем Base64 в байты
    var blob = Utilities.newBlob(Utilities.base64Decode(base64String), 'image/jpeg', fileName);
    
    // Получаем или создаём папку для задач
    var folderName = 'Kanban Tasks Images';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder;
    
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }
    
    // Создаём файл с именем задачи
    var file = folder.createFile(blob);
    file.setName(taskId + '_' + fileName);
    
    // Делаем файл доступным по ссылке (только для чтения)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Получаем ссылку
    var fileUrl = file.getUrl();
    var fileId = file.getId();
    
    // Для прямого доступа к изображению используем drive.google.com/uc
    var directUrl = 'https://drive.google.com/uc?id=' + fileId + '&export=view';
    
    Logger.log('Image uploaded: ' + fileUrl);
    
    return {
      ok: true,
      data: {
        fileId: fileId,
        fileUrl: fileUrl,
        directUrl: directUrl,
        fileName: fileName
      }
    };
  } catch (e) {
    Logger.log('uploadImageToDrive error: ' + e.message);
    return {
      ok: false,
      error: e.message
    };
  }
}

function addImageToTask(taskId, imageUrl, imageName) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        const row = i + 1;
        
        // Получаем текущие вложения (колонка N = 14)
        var attachments = sheet.getRange(row, 14).getValue();
        var attachmentsArray = [];
        
        if (attachments && typeof attachments === 'string') {
          try {
            attachmentsArray = JSON.parse(attachments);
          } catch (e) {
            attachmentsArray = [];
          }
        }
        
        // Добавляем новое вложение
        attachmentsArray.push({
          type: 'image',
          url: imageUrl,
          name: imageName || 'image.jpg',
          uploadedAt: new Date().toISOString()
        });
        
        // Сохраняем обратно в таблицу
        sheet.getRange(row, 14).setValue(JSON.stringify(attachmentsArray));
        
        return {
          ok: true,
          data: attachmentsArray
        };
      }
    }
    
    return { ok: false, error: 'Задача не найдена' };
  } finally {
    lock.releaseLock();
  }
}

function getTaskAttachments(taskId) {
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        var attachments = data[i][13]; // Колонка N
        if (attachments && typeof attachments === 'string') {
          try {
            return { ok: true, data: JSON.parse(attachments) };
          } catch (e) {
            return { ok: true, data: [] };
          }
        }
        return { ok: true, data: [] };
      }
    }
    
    return { ok: false, error: 'Задача не найдена' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function removeImageFromTask(taskId, imageIndex) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        const row = i + 1;
        
        var attachments = sheet.getRange(row, 14).getValue();
        var attachmentsArray = [];
        
        if (attachments && typeof attachments === 'string') {
          try {
            attachmentsArray = JSON.parse(attachments);
          } catch (e) {
            return { ok: false, error: 'Неверный формат вложений' };
          }
        }
        
        // Удаляем вложение по индексу
        if (imageIndex >= 0 && imageIndex < attachmentsArray.length) {
          attachmentsArray.splice(imageIndex, 1);
          sheet.getRange(row, 14).setValue(JSON.stringify(attachmentsArray));
          return { ok: true, data: attachmentsArray };
        }
        
        return { ok: false, error: 'Вложение не найдено' };
      }
    }
    
    return { ok: false, error: 'Задача не найдена' };
  } finally {
    lock.releaseLock();
  }
}

// Поставить циклическую задачу на паузу
function pauseRecurringTask(taskId) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        const row = i + 1;
        // Устанавливаем паузу (колонка M = 13)
        sheet.getRange(row, 13).setValue('TRUE');
        return { ok: true, data: getRecurringTasks() };
      }
    }
    
    return { ok: false, error: 'Задача не найдена' };
  } finally {
    lock.releaseLock();
  }
}

// Снять с паузы
function resumeRecurringTask(taskId) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        const row = i + 1;
        // Снимаем паузу
        sheet.getRange(row, 13).clearContent();
        return { ok: true, data: getRecurringTasks() };
      }
    }
    
    return { ok: false, error: 'Задача не найдена' };
  } finally {
    lock.releaseLock();
  }
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

// Форматирует дату в строку YYYY-MM-DDTHH:MM для сравнения в таблице
function formatDateForSheets(dateVal) {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    const year = dateVal.getFullYear();
    const month = String(dateVal.getMonth() + 1).padStart(2, '0');
    const day = String(dateVal.getDate()).padStart(2, '0');
    const hours = String(dateVal.getHours()).padStart(2, '0');
    const minutes = String(dateVal.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + 'T' + hours + ':' + minutes;
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

    return data
      .filter(row => {
        // Скрываем родительские циклические задачи из доски и таблицы
        // Они доступны только во вкладке "Циклические"
        const isRecurring = String(row[11] || '').toUpperCase();
        if (isRecurring === 'TRUE') {
          return false;
        }
        
        // Если пользователь не админ — фильтруем по AssignedTo
        if (userId && userId !== 'admin') {
          return row[7] === userId;
        }
        return row[0] || row[1];
      })
      .map(row => {
        // Конвертируем nextDueDate для корректного отображения
        let nextDueDate = row[10];
        if (nextDueDate && typeof nextDueDate === 'object' && nextDueDate instanceof Date) {
          const y = nextDueDate.getFullYear();
          const m = String(nextDueDate.getMonth() + 1).padStart(2, '0');
          const d = String(nextDueDate.getDate()).padStart(2, '0');
          nextDueDate = y + '-' + m + '-' + d;
        } else {
          nextDueDate = nextDueDate || '';
        }
        
        return {
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
          nextDueDate: nextDueDate,
          isRecurring: row[11] === 'TRUE'
        };
      });
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
    
    // Поддержка двух форматов:
    // 1. recurrence = { interval: 4, type: 'months', nextDueDate: '2026-07-01' }
    // 2. Плоские параметры: recurrenceInterval, recurrenceType, nextDueDate, isRecurring
    let recurrenceInterval = '';
    let recurrenceType = '';
    let nextDueDate = '';
    let isRecurring = '';
    
    if (recurrence) {
      if (recurrence.interval) {
        // Формат 1: объект recurrence
        recurrenceInterval = recurrence.interval;
        recurrenceType = recurrence.type;
        nextDueDate = recurrence.nextDueDate;
        isRecurring = 'TRUE';
      } else if (recurrence.isRecurring) {
        // Формат 2: плоские параметры
        recurrenceInterval = recurrence.recurrenceInterval || '';
        recurrenceType = recurrence.recurrenceType || '';
        nextDueDate = recurrence.nextDueDate || '';
        isRecurring = recurrence.isRecurring === true ? 'TRUE' : (recurrence.isRecurring || '');
      }
    }
    
    const task = {
      id: generateId(),
      title: title,
      status: 'todo',
      startDate: new Date(),
      endDate: '',
      duration: '',
      plannedDate: plannedDate || '',
      assignedTo: assignedTo || null,
      recurrenceInterval: recurrenceInterval,
      recurrenceType: recurrenceType,
      nextDueDate: nextDueDate,
      isRecurring: isRecurring
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
          
          // Примечание: создание следующих задач теперь происходит автоматически
          // через processRecurringTasks() (триггер), поэтому здесь не создаем
          // новую задачу - это предотвращает дублирование
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
        // Проверяем, является ли это родительской циклической задачей
        const isRecurring = data[i][11];
        if (isRecurring === 'TRUE' || isRecurring === true || isRecurring === 'true') {
          return { ok: false, error: 'Нельзя удалить циклическую задачу из доски. Используйте вкладку "Циклические".' };
        }
        sheet.deleteRow(i + 1);
        return { ok: true };
      }
    }

    return { ok: false, error: 'Задача не найдена' };
  } finally {
    lock.releaseLock();
  }
}

// Удаление циклической задачи (для вкладки "Циклические")
function deleteRecurringTask(taskId) {
  const lock = getLock();
  lock.waitLock(LOCK_TIMEOUT_SECONDS * 1000);
  try {
    const sheet = getTasksSheet();
    const data = sheet.getDataRange().getValues();

    Logger.log('deleteRecurringTask: looking for taskId=' + taskId);
    Logger.log('deleteRecurringTask: total rows=' + data.length);

    for (let i = 1; i < data.length; i++) {
      const rowId = data[i][0];
      const isRecurring = String(data[i][11] || '').toUpperCase();
      Logger.log('Row ' + (i+1) + ': id=' + rowId + ', isRecurring=' + isRecurring);
      if (String(rowId) === String(taskId)) {
        Logger.log('Found match at row ' + (i+1) + ', isRecurring=' + isRecurring);
        if (isRecurring !== 'TRUE') {
          Logger.log('Not a recurring task, using regular delete');
          // Use regular delete if not recurring
          sheet.deleteRow(i + 1);
          return { ok: true };
        }
        sheet.deleteRow(i + 1);
        return { ok: true };
      }
    }

    Logger.log('Task not found');
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
    
    Logger.log('getRecurringTasks: total rows=' + data.length);
    
    return data
      .filter(row => {
        const isRecurring = String(row[11] || '').toUpperCase();
        Logger.log('Task: ' + row[1] + ', IsRecurring=' + isRecurring + ', nextDueDate=' + row[10]);
        return isRecurring === 'TRUE';
      })
      .map(row => {
        let nextDueDate = row[10];
        // Если дата в формате Date объекта Google, конвертируем
        if (nextDueDate && typeof nextDueDate === 'object' && nextDueDate instanceof Date) {
          const y = nextDueDate.getFullYear();
          const m = String(nextDueDate.getMonth() + 1).padStart(2, '0');
          const d = String(nextDueDate.getDate()).padStart(2, '0');
          nextDueDate = y + '-' + m + '-' + d;
          Logger.log('Converted date: ' + nextDueDate);
        }
        return {
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
          nextDueDate: nextDueDate || '',
          isRecurring: true,
          isPaused: row[12] === 'TRUE' || row[12] === true
        };
      });
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
        // Передаём параметры цикличности
        const recurrence = {
          recurrenceInterval: e.parameter.recurrenceInterval || '',
          recurrenceType: e.parameter.recurrenceType || '',
          nextDueDate: e.parameter.nextDueDate || '',
          isRecurring: e.parameter.isRecurring || false
        };
        result = addTask(title, plannedDate, assignedTo, recurrence);
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
      } else if (action === 'deleteRecurringTask') {
        const id = e.parameter.id;
        result = deleteRecurringTask(id);
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
      } else if (action === 'setupTestTriggerEveryMinute') {
        result = setupTestTriggerEveryMinute();
      } else if (action === 'setupTestTriggerEvery5Minutes') {
        result = setupTestTriggerEvery5Minutes();
      } else if (action === 'deleteAllTriggers') {
        result = deleteAllTriggers();
      } else if (action === 'pauseRecurringTask') {
        result = pauseRecurringTask(e.parameter.id);
      } else if (action === 'resumeRecurringTask') {
        result = resumeRecurringTask(e.parameter.id);
      } else if (action === 'uploadImageToDrive') {
        // Для загрузки изображений используем POST
        result = { ok: false, error: 'Use POST method' };
      } else if (action === 'getTaskAttachments') {
        result = getTaskAttachments(e.parameter.id);
      } else if (action === 'removeImageFromTask') {
        result = removeImageFromTask(e.parameter.id, e.parameter.index);
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
          
          // Передаём параметры цикличности ТОЛЬКО если они явно указаны
          let recurrenceInterval = '';
          let recurrenceType = '';
          let nextDueDate = '';
          let isRecurring = '';
          
          if (payload.isRecurring && payload.recurrenceInterval && payload.recurrenceType) {
            recurrenceInterval = payload.recurrenceInterval;
            recurrenceType = payload.recurrenceType;
            nextDueDate = payload.nextDueDate || '';
            isRecurring = 'TRUE';
          }
          
          return jsonResponse(addTask(title, planned, assignedTo, {
            recurrenceInterval: recurrenceInterval,
            recurrenceType: recurrenceType,
            nextDueDate: nextDueDate,
            isRecurring: isRecurring
          }));
          
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
        
        case 'deleteRecurringTask':
          const deleteRecurringId = payload.id;
          return jsonResponse(deleteRecurringTask(deleteRecurringId));
          
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

        case 'pauseRecurringTask':
          return jsonResponse(pauseRecurringTask(payload.id));

        case 'resumeRecurringTask':
          return jsonResponse(resumeRecurringTask(payload.id));

        case 'setupTestTriggerEveryMinute':
          return jsonResponse(setupTestTriggerEveryMinute());

        case 'setupTestTriggerEvery5Minutes':
          return jsonResponse(setupTestTriggerEvery5Minutes());

        case 'deleteAllTriggers':
          return jsonResponse(deleteAllTriggers());

        case 'uploadImageToDrive':
          // Загрузка изображения в Drive
          return jsonResponse(uploadImageToDrive(payload.base64Data, payload.fileName, payload.taskId));

        case 'addImageToTask':
          // Добавление ссылки на изображение в задачу
          return jsonResponse(addImageToTask(payload.taskId, payload.imageUrl, payload.imageName));

        case 'getTaskAttachments':
          // Получить вложения задачи
          return jsonResponse(getTaskAttachments(payload.id));

        case 'removeImageFromTask':
          // Удалить вложение
          return jsonResponse(removeImageFromTask(payload.id, payload.index));

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
