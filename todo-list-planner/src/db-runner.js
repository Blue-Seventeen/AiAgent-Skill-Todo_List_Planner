'use strict';

const crypto = require('crypto');
const path = require('path');
const os = require('os');

function decodeEnvJson(name) {
  const value = process.env[name];
  if (!value) return {};
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime();
}

function parseDateMs(value) {
  if (value === undefined || value === null || value === '' || String(value).toLowerCase() === 'today') {
    return startOfDay(new Date());
  }
  if (typeof value === 'number') return startOfDay(new Date(value));
  const text = String(value).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return startOfDay(parsed);
  throw new Error(`Invalid date: ${value}`);
}

function parseReminderMs(value, dateMs) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
    const [hour, minute, second = 0] = text.split(':').map(Number);
    const base = new Date(dateMs);
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, second).getTime();
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  throw new Error(`Invalid reminder time: ${value}`);
}

function parseSubtasks(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  return String(value).split(/[,\n，]/).map((s) => s.trim()).filter(Boolean);
}

function standbySubtasks(value) {
  const subtasks = parseSubtasks(value);
  return subtasks.length ? subtasks.map((item) => `- [ ]${item}`).join('[end] -') : '';
}

function normalize(input) {
  const title = String(input.title || input.taskContent || '').trim();
  if (!title) throw new Error('Task title is required.');
  const dateMs = input.dateMs !== undefined ? Number(input.dateMs) : parseDateMs(input.date || input.todoDate || 'today');
  const reminderMs = input.reminderMs !== undefined ? Number(input.reminderMs) : parseReminderMs(input.remind || input.reminder || input.reminderTime || '', dateMs);
  return {
    title,
    description: String(input.description ?? input.desc ?? input.taskDescribe ?? ''),
    dateMs,
    reminderMs,
    subtaskText: standbySubtasks(input.subtasks ?? input.todoSublist ?? input.standbyStr2),
    categoryId: Number(input.categoryId ?? input.standbyInt1 ?? 0),
    difficulty: Number(input.difficulty ?? input.snowAssess ?? 3),
    userId: input.userId ? Number(input.userId) : undefined
  };
}

function formatLocal(ms) {
  return ms ? new Date(ms).toLocaleString('zh-CN', { hour12: false }) : '';
}

function getDbPath() {
  return process.env.TODO_DB_PATH || path.join(os.homedir(), 'AppData', 'Roaming', 'todo-list', 'task.db');
}

function openDb() {
  const todoExe = process.env.TODO_EXE;
  if (!todoExe) {
    throw new Error('DB mode requires TODO_EXE so the bundled SQLite cipher module can be resolved.');
  }

  const modulePath = path.join(path.dirname(todoExe), 'resources', 'app.asar', 'node_modules', 'better-sqlite3-multiple-ciphers');
  const Database = require(modulePath);
  const key = process.env.DB_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('DB mode requires DB_ENCRYPTION_KEY. Prefer live mode when possible.');
  }
  const db = new Database(getDbPath(), { fileMustExist: true, encryption: { key } });
  db.pragma('key = ' + JSON.stringify(key));
  db.pragma('legacy = 4');
  db.pragma('busy_timeout = 5000');
  return db;
}

function addTask(input) {
  const task = normalize(input);
  const db = openDb();
  try {
    const now = Date.now();
    const userId = task.userId || db.prepare('select userId from table_task where userId is not null order by updateTime desc limit 1').get().userId;
    const maxId = db.prepare('select coalesce(max(id), 0) as v from table_task').get().v;
    const maxVersion = db.prepare('select coalesce(max(version), 0) as v from table_task').get().v;
    const maxSort = db.prepare('select coalesce(max(taskSort), 5000) as v from table_task where "delete"=0 and todoTime=?').get(task.dateMs).v;
    const taskId = `tid_${userId}${crypto.randomBytes(4).toString('base64url').slice(0, 6)}_${now}`;
    const row = {
      id: Number(maxId) + 1,
      userId,
      taskId,
      taskContent: task.title,
      taskDescribe: task.description,
      status: 'sync',
      complete: 0,
      createTime: now,
      updateTime: now,
      syncTime: now,
      reminderTime: task.reminderMs || 0,
      todoTime: task.dateMs || 0,
      taskSort: Math.fround(Number(maxSort || 5000) + 150),
      delete: 0,
      snowAdd: 3,
      snowAssess: task.difficulty,
      standbyInt1: task.categoryId,
      standbyStr1: '',
      standbyStr2: task.subtaskText,
      standbyStr3: '',
      standbyStr4: '',
      version: Number(maxVersion) + 1
    };
    db.prepare(`
      insert into table_task (
        id, userId, taskId, taskContent, taskDescribe, status, complete,
        createTime, updateTime, syncTime, reminderTime, todoTime, taskSort,
        "delete", snowAdd, snowAssess, standbyInt1, standbyStr1, standbyStr2,
        standbyStr3, standbyStr4, version
      ) values (
        @id, @userId, @taskId, @taskContent, @taskDescribe, @status, @complete,
        @createTime, @updateTime, @syncTime, @reminderTime, @todoTime, @taskSort,
        @delete, @snowAdd, @snowAssess, @standbyInt1, @standbyStr1, @standbyStr2,
        @standbyStr3, @standbyStr4, @version
      )
    `).run(row);
    return {
      success: true,
      mode: 'db',
      task: row,
      todoTimeText: formatLocal(row.todoTime),
      reminderTimeText: formatLocal(row.reminderTime),
      warning: 'DB mode does not notify the running Todo清单 renderer. Use live mode for instant UI updates.'
    };
  } finally {
    db.close();
  }
}

function listToday() {
  const db = openDb();
  try {
    const today = startOfDay(new Date());
    const rows = db.prepare(`
      select taskId, taskContent, taskDescribe, complete, reminderTime, todoTime, taskSort, standbyStr2
      from table_task
      where "delete"=0 and todoTime>=? and todoTime<?
      order by complete asc, taskSort asc
    `).all(today, today + 86400000);
    return {
      success: true,
      mode: 'db',
      tasks: rows.map((row) => ({
        ...row,
        todoTimeText: formatLocal(row.todoTime),
        reminderTimeText: formatLocal(row.reminderTime)
      }))
    };
  } finally {
    db.close();
  }
}

async function main() {
  const payload = decodeEnvJson('TODO_RUNNER_PAYLOAD_B64');
  const command = payload.command;
  let result;
  if (command === 'add') result = addTask(payload.input || {});
  else if (command === 'list-today') result = listToday();
  else throw new Error(`Unknown db-runner command: ${command}`);
  console.log('TODO_RESULT_JSON:' + JSON.stringify(result));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  console.log('TODO_RESULT_JSON:' + JSON.stringify({ success: false, error: error.message || String(error) }));
  process.exitCode = 1;
});
