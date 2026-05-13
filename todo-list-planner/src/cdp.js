'use strict';

const { normalizeTaskInput } = require('./task-shape');
const { formatLocal } = require('./time');

async function fetchJson(url, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function listTargets(port = 9222) {
  return fetchJson(`http://127.0.0.1:${port}/json/list`);
}

async function getVersion(port = 9222) {
  return fetchJson(`http://127.0.0.1:${port}/json/version`);
}

function selectMainTarget(targets) {
  const pages = targets.filter((target) => target.type === 'page');
  const isMainTodo = (target) => {
    const url = target.url || '';
    return url.includes('index.html') && url.includes('#/todo-list');
  };
  const isUsableMain = (target) => {
    const url = target.url || '';
    return url.includes('index.html')
      && !url.includes('widget.html')
      && !url.includes('#/floating/')
      && !url.includes('#/widget-calendar')
      && !url.includes('#/todo-edit-window')
      && !url.includes('date-picker')
      && !url.includes('context-menu');
  };

  return pages.find(isMainTodo)
    || pages.find(isUsableMain)
    || pages.find((target) => {
      const url = target.url || '';
      return url.includes('index.html') && !url.includes('widget.html');
    })
    || pages.find((target) => (target.url || '').startsWith('app://'));
}

class CdpClient {
  constructor(wsUrl) {
    if (typeof WebSocket !== 'function') {
      throw new Error('Global WebSocket is unavailable. Use Node.js 20+.');
    }

    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      const timeout = setTimeout(() => reject(new Error('Timed out connecting to CDP websocket.')), 3000);

      ws.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve(this);
      }, { once: true });

      ws.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error(`Unable to connect to ${this.wsUrl}`));
      }, { once: true });

      ws.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (!message.id || !this.pending.has(message.id)) return;
        const { resolve: ok, reject: fail } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) fail(new Error(message.error.message || JSON.stringify(message.error)));
        else ok(message.result);
      });
    });
  }

  call(method, params = {}, timeoutMs = 10000) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP call timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function evaluateLiveRuntime(fn, args = [], options = {}) {
  const port = Number(options.port || 9222);
  const timeoutMs = Number(options.timeoutMs || 10000);
  const targets = await listTargets(port);
  const target = selectMainTarget(targets);
  if (!target || !target.webSocketDebuggerUrl) {
    throw new Error(`No Todo main renderer target found on CDP port ${port}.`);
  }

  const client = await new CdpClient(target.webSocketDebuggerUrl).connect();
  try {
    await client.call('Runtime.enable');
    const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
    const result = await client.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    }, timeoutMs);
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception && result.exceptionDetails.exception.description;
      throw new Error(detail || result.exceptionDetails.text || 'Runtime evaluation failed.');
    }
    return result.result.value;
  } finally {
    client.close();
  }
}

function runtimeListCategories() {
  const store = window.vuexStore || window.$store;
  if (!store || !store.state || !store.dispatch) {
    throw new Error('Todo Vuex store is unavailable in the selected renderer.');
  }

  return {
    success: true,
    mode: 'live-cdp',
    categories: (store.state.category && store.state.category.list || [])
      .filter((item) => item && !item.delete)
      .map((item) => ({
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        categoryColor: item.categoryColor,
        listSort: item.listSort,
        folderIs: Boolean(item.folderIs),
        folderId: item.folderId || 0
      }))
  };
}

async function runtimeListTags() {
  const store = window.vuexStore || window.$store;
  if (!store || !store.state || !store.dispatch) {
    throw new Error('Todo Vuex store is unavailable in the selected renderer.');
  }

  if (store._actions && store._actions['tag/update']) {
    await store.dispatch('tag/update', (store.state.todo && store.state.todo.todoList) || []);
  }

  return {
    success: true,
    mode: 'live-cdp',
    tags: (store.state.tag && store.state.tag.list || []).map((item) => ({
      name: item.name,
      count: item.todos ? item.todos.length : 0,
      time: item.time || 0
    }))
  };
}

function runtimeFeatures() {
  const store = window.vuexStore || window.$store;
  if (!store || !store.state || !store.dispatch) {
    throw new Error('Todo Vuex store is unavailable in the selected renderer.');
  }

  const categories = (store.state.category && store.state.category.list || [])
    .filter((item) => item && !item.delete)
    .map((item) => ({ id: item.categoryId, name: item.categoryName }));
  const tags = (store.state.tag && store.state.tag.list || [])
    .map((item) => ({ name: item.name, count: item.todos ? item.todos.length : 0 }));

  return {
    success: true,
    mode: 'live-cdp',
    features: {
      difficulty: {
        supported: true,
        values: [
          { name: '一般', value: 3 },
          { name: '中等难度', value: 5 },
          { name: '较高难度', value: 9 }
        ],
        field: 'snowAssess'
      },
      date: {
        supported: true,
        values: ['today', 'tomorrow', 'YYYY-MM-DD', 'none'],
        field: 'todoTime'
      },
      category: {
        supported: true,
        field: 'standbyInt1',
        categories
      },
      subtasks: {
        supported: true,
        maxCount: 20,
        maxItemLength: 80,
        field: 'standbyStr2'
      },
      reminder: {
        supported: true,
        values: ['HH:mm', 'YYYY-MM-DD HH:mm'],
        field: 'reminderTime'
      },
      repeat: {
        supported: true,
        values: ['daily', 'weekly', 'monthly', 'yearly'],
        field: 'standbyStr1'
      },
      imageAttachments: {
        supported: true,
        mode: 'live upload through fileManager/upload',
        field: 'standbyStr4'
      },
      tags: {
        supported: true,
        rule: 'Parsed from taskContent by /#[^\\s]+\\s/g',
        tags
      }
    }
  };
}

function runtimeDeleteTasks(taskIds, reason) {
  const store = window.vuexStore || window.$store;
  if (!store || !store.state || !store.dispatch) {
    throw new Error('Todo Vuex store is unavailable in the selected renderer.');
  }

  const ids = Array.from(new Set((taskIds || []).map(String).filter(Boolean)));
  if (ids.length === 0) throw new Error('No task ids were provided.');

  const todoState = store.state.todo || {};
  const deletedTasks = [];
  for (const taskId of ids) {
    const todo = (todoState.todoList || []).find((item) => item && item.taskId === taskId && !item.delete);
    if (!todo) {
      throw new Error(`Active Todo task not found: ${taskId}`);
    }
    const snapshot = {
      id: todo.id || null,
      userId: todo.userId,
      taskId: todo.taskId,
      taskContent: todo.taskContent,
      taskDescribe: todo.taskDescribe || '',
      reminderTime: todo.reminderTime || 0,
      todoTime: todo.todoTime || 0,
      taskSort: todo.taskSort,
      snowAssess: todo.snowAssess,
      standbyInt1: todo.standbyInt1 || 0,
      standbyStr1: todo.standbyStr1 || '',
      standbyStr2: todo.standbyStr2 || '',
      standbyStr3: todo.standbyStr3 || '',
      standbyStr4: todo.standbyStr4 || ''
    };
    store.commit('todo/deleteTodo', todo);
    deletedTasks.push(snapshot);
  }

  if (store._actions && store._actions['tag/update']) {
    store.dispatch('tag/update', todoState.todoList || []);
  }
  if (store.state.auth && store.state.auth.user) {
    Promise.resolve(store.dispatch('todo/syncTodos')).catch((error) => {
      console.warn('Background sync after AI delete failed:', error);
    });
  }

  return new Promise((resolve) => {
    setTimeout(() => resolve({
      success: true,
      mode: 'live-cdp',
      reason: reason || '',
      deletedTasks,
      count: deletedTasks.length
    }), 500);
  });
}

function runtimeAddTask(payload) {
  const store = window.vuexStore || window.$store;
  if (!store || !store.state || !store.dispatch) {
    throw new Error('Todo Vuex store is unavailable in the selected renderer.');
  }

  const todoState = store.state.todo || {};
  const user = (store.state.auth && store.state.auth.user) || {};
  const existingUserId = payload.userId
    || user.userId
    || ((todoState.todoList || []).find((item) => item && item.userId) || {}).userId;

  if (!existingUserId) {
    throw new Error('Unable to determine Todo userId from runtime store.');
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function dayKey(ms) {
    const date = new Date(ms);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime();
  }

  function addDays(ms, days) {
    const date = new Date(ms);
    return startOfDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function addMonths(ms, months, daySpec) {
    const base = new Date(ms);
    const first = new Date(base.getFullYear(), base.getMonth() + months, 1);
    const maxDay = daysInMonth(first.getFullYear(), first.getMonth());
    const wantedDay = daySpec === 'last' ? maxDay : Number(daySpec || base.getDate());
    if (wantedDay > maxDay) return null;
    return startOfDay(new Date(first.getFullYear(), first.getMonth(), wantedDay));
  }

  function addYears(ms, years, yearDate) {
    const base = new Date(ms);
    let month = base.getMonth();
    let day = base.getDate();
    if (yearDate) {
      const match = String(yearDate).match(/^(\d{1,2})[-/.](\d{1,2})$/);
      if (!match) throw new Error(`Invalid repeat year date: ${yearDate}. Use MM-DD.`);
      month = Number(match[1]) - 1;
      day = Number(match[2]);
    }
    const year = base.getFullYear() + years;
    const result = new Date(year, month, day, 0, 0, 0, 0);
    if (result.getFullYear() !== year || result.getMonth() !== month || result.getDate() !== day) {
      return null;
    }
    return result.getTime();
  }

  function withReminderDate(reminderMs, dateMs) {
    if (!reminderMs) return 0;
    const reminder = new Date(reminderMs);
    const date = new Date(dateMs);
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      reminder.getHours(),
      reminder.getMinutes(),
      reminder.getSeconds(),
      0
    ).getTime();
  }

  function isSkipDate(ms) {
    const repeat = payload.repeat || {};
    const date = new Date(ms);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const holiday = ((store.state.nui && store.state.nui.holidayList) || [])
      .find((item) => item && item.dateString === dayKey(ms));

    if (repeat.statutoryWorkdays) {
      if (holiday && holiday.holiday === true) return true;
      if (weekend && !(holiday && holiday.holiday === false)) return true;
      return false;
    }

    if (repeat.skipStatutoryHolidays && holiday && holiday.holiday === true) return true;
    if (repeat.skipWeekends && weekend) return true;
    return false;
  }

  function expandDates() {
    const repeat = payload.repeat;
    const baseMs = payload.dateMs || 0;
    if (!repeat) return [baseMs];
    if (!baseMs) throw new Error('Repeat tasks require a task date.');

    const interval = Number(repeat.interval || 1);
    const count = Number(repeat.count || 1);
    const dates = [];

    if (repeat.type === 'day') {
      for (let i = 0; i < count; i += 1) dates.push(addDays(baseMs, i * interval));
    } else if (repeat.type === 'week') {
      const baseDay = new Date(baseMs).getDay();
      const weekdays = (repeat.weekdays && repeat.weekdays.length) ? repeat.weekdays : [baseDay];
      const weekStart = addDays(baseMs, -baseDay);
      for (let week = 0; week < count; week += 1) {
        for (const weekday of weekdays) {
          const ms = addDays(weekStart, week * interval * 7 + Number(weekday));
          if (ms >= baseMs) dates.push(ms);
        }
      }
    } else if (repeat.type === 'month') {
      const monthDays = (repeat.monthDays && repeat.monthDays.length)
        ? repeat.monthDays
        : [new Date(baseMs).getDate()];
      for (let month = 0; month < count; month += 1) {
        for (const day of monthDays) {
          const ms = addMonths(baseMs, month * interval, day);
          if (ms !== null && ms >= baseMs) dates.push(ms);
        }
      }
    } else if (repeat.type === 'year') {
      for (let year = 0; year < count; year += 1) {
        const ms = addYears(baseMs, year * interval, repeat.yearDate);
        if (ms !== null && ms >= baseMs) dates.push(ms);
      }
    } else {
      throw new Error(`Unknown repeat type: ${repeat.type}`);
    }

    return Array.from(new Set(dates)).sort((a, b) => a - b).filter((ms) => !isSkipDate(ms));
  }

  function resolveCategoryId() {
    if (payload.categoryId) return Number(payload.categoryId);
    if (!payload.categoryName) return 0;
    const target = String(payload.categoryName).trim().toLowerCase();
    const categories = (store.state.category && store.state.category.list) || [];
    const found = categories.find((item) => item && !item.delete && String(item.categoryName).trim().toLowerCase() === target);
    if (!found) {
      throw new Error(`Category not found: ${payload.categoryName}`);
    }
    return Number(found.categoryId);
  }

  function createRepeatId() {
    return `repeat_${existingUserId}${Math.random().toString(36).slice(2, 8)}${Date.now()}`;
  }

  function snapshotTask(task) {
    return {
      id: task.id || null,
      userId: task.userId,
      taskId: task.taskId,
      taskContent: task.taskContent,
      taskDescribe: task.taskDescribe,
      reminderTime: task.reminderTime || 0,
      todoTime: task.todoTime || 0,
      taskSort: task.taskSort,
      snowAssess: task.snowAssess,
      standbyInt1: task.standbyInt1 || 0,
      standbyStr1: task.standbyStr1 || '',
      standbyStr2: task.standbyStr2 || '',
      standbyStr3: task.standbyStr3 || '',
      standbyStr4: task.standbyStr4 || ''
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function mimeFromPath(filePath) {
    const ext = String(filePath).split('.').pop().toLowerCase();
    const map = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp'
    };
    return map[ext] || 'application/octet-stream';
  }

  async function uploadImages(taskId, imagePaths) {
    if (!imagePaths || !imagePaths.length) return [];
    if (imagePaths.length && payload.repeat) {
      throw new Error('Image upload with repeated tasks is not supported by this bridge yet. Add images to a single task, or add repeated tasks without images.');
    }
    if (!store._actions || !store._actions['fileManager/upload']) {
      throw new Error('Todo fileManager/upload action is unavailable.');
    }

    const fs = require('fs');
    const path = require('path');
    const uploaded = [];
    for (const filePath of imagePaths) {
      if (!fs.existsSync(filePath)) throw new Error(`Image file not found: ${filePath}`);
      const bytes = fs.readFileSync(filePath);
      const file = new File([bytes], path.basename(filePath), { type: mimeFromPath(filePath) });
      Object.defineProperty(file, 'path', { value: filePath });
      await store.dispatch('fileManager/upload', { taskId, file });
      uploaded.push({ path: filePath, name: path.basename(filePath) });
    }

    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const list = store.getters['fileManager/taskFileList'](taskId) || [];
      const related = list.filter((item) => imagePaths.some((filePath) => item.name === path.parse(filePath).name));
      const failed = related.find((item) => item.status === 'uploadFailed');
      if (failed) throw new Error(`Image upload failed: ${failed.name || failed.url || taskId}`);
      const completed = related.filter((item) => item.status === 'waitingToDownload' || item.status === 'downloaded');
      if (completed.length >= imagePaths.length) {
        return completed.map((item) => ({
          name: item.name,
          suffix: item.suffix,
          size: item.size,
          url: item.url,
          status: item.status
        }));
      }
      await sleep(500);
    }
    throw new Error('Timed out waiting for image upload to finish.');
  }

  return Promise.resolve().then(async () => {
    const dates = expandDates();
    if (dates.length === 0) throw new Error('Repeat settings produced no task dates.');

    const categoryId = resolveCategoryId();
    const repeatId = payload.repeat && dates.length > 1 ? createRepeatId() : null;
    const addedTasks = [];
    const lastRepeatMessage = '此为重复组中最后一个事件，如需继续重复请手动创建新的重复事件组';

    for (let i = 0; i < dates.length; i += 1) {
      const dateMs = dates[i] || 0;
      const isLastRepeat = Boolean(repeatId) && i === dates.length - 1;
      let description = payload.description || '';
      if (isLastRepeat) {
        description = description ? `${description}\n\n${lastRepeatMessage}` : lastRepeatMessage;
      }

      const request = {
        todoSublist: payload.subtaskText || null,
        categoryId,
        todoContent: payload.title,
        todoDescription: description,
        todoDate: dateMs,
        todoReminderTime: dateMs ? withReminderDate(payload.reminderMs || 0, dateMs) : (payload.reminderMs || 0),
        todoDifficultyLevel: payload.difficulty || 3,
        todoImage: '',
        fileList: '',
        userId: existingUserId,
        repeatId
      };

      await store.dispatch('todo/addTodo', request);
      const added = (store.getters && store.getters['todo/getRecentlyAddedTodo'])
        || (todoState.todoList || [])[todoState.todoList.length - 1];
      if (!added || !added.taskId) {
        throw new Error('Todo runtime did not expose the newly added task.');
      }
      addedTasks.push(snapshotTask(added));
    }

    let uploadedFiles = [];
    if (payload.imagePaths && payload.imagePaths.length) {
      uploadedFiles = await uploadImages(addedTasks[0].taskId, payload.imagePaths);
      const current = (todoState.todoList || []).find((item) => item.taskId === addedTasks[0].taskId);
      if (current) addedTasks[0] = snapshotTask(current);
    }

    if (store._actions && store._actions['tag/update']) {
      await store.dispatch('tag/update', todoState.todoList || []);
    }

    if (payload.sync !== false && store.state.auth && store.state.auth.user) {
      Promise.resolve(store.dispatch('todo/syncTodos')).catch((error) => {
        console.warn('Background sync after AI add failed:', error);
      });
    }

    await sleep(500);
    return {
      success: true,
      mode: 'live-cdp',
      task: addedTasks[0],
      tasks: addedTasks,
      count: addedTasks.length,
      uploadedFiles
    };
  });
}

async function addTaskLive(input, options = {}) {
  const task = normalizeTaskInput(input);
  const result = await evaluateLiveRuntime(runtimeAddTask, [task], {
    port: options.port,
    timeoutMs: task.imagePaths && task.imagePaths.length ? 90000 : 20000
  });
  return {
    ...result,
    todoTimeText: formatLocal(result.task.todoTime),
    reminderTimeText: formatLocal(result.task.reminderTime)
  };
}

async function listCategoriesLive(options = {}) {
  return evaluateLiveRuntime(runtimeListCategories, [], { port: options.port });
}

async function listTagsLive(options = {}) {
  return evaluateLiveRuntime(runtimeListTags, [], { port: options.port });
}

async function getFeaturesLive(options = {}) {
  return evaluateLiveRuntime(runtimeFeatures, [], { port: options.port });
}

async function deleteTasksLive(taskIds, options = {}) {
  return evaluateLiveRuntime(runtimeDeleteTasks, [taskIds, options.reason || ''], {
    port: options.port,
    timeoutMs: 20000
  });
}

module.exports = {
  addTaskLive,
  deleteTasksLive,
  listCategoriesLive,
  listTagsLive,
  getFeaturesLive,
  getVersion,
  listTargets
};
