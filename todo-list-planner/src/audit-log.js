'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

function defaultLogPath() {
  if (process.env.TODO_LOG_PATH) return process.env.TODO_LOG_PATH;
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, 'todo-list-planner', 'ai-added-tasks.jsonl');
}

const LOG_PATH = defaultLogPath();

function ensureLogDir() {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
}

function randomId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function appendEvent(event) {
  ensureLogDir();
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event
  });
  fs.appendFileSync(LOG_PATH, `${line}\n`, 'utf8');
}

function readEvents() {
  if (!fs.existsSync(LOG_PATH)) return [];
  const text = fs.readFileSync(LOG_PATH, 'utf8').trim();
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function summarizeTask(task) {
  return {
    taskId: task.taskId,
    title: task.taskContent || '',
    todoTime: task.todoTime || 0,
    reminderTime: task.reminderTime || 0,
    snowAssess: task.snowAssess || 0,
    standbyInt1: task.standbyInt1 || 0,
    repeatId: task.standbyStr1 || ''
  };
}

function appendAddRecords(input, result, source = 'cli') {
  const operationId = randomId('op');
  const tasks = Array.isArray(result.tasks) && result.tasks.length ? result.tasks : [result.task];
  const records = tasks.filter(Boolean).map((task) => {
    const record = {
      event: 'add',
      recordId: randomId('rec'),
      operationId,
      source,
      mode: result.mode || '',
      status: 'active',
      task: summarizeTask(task),
      hasAttachment: Array.isArray(result.uploadedFiles) && result.uploadedFiles.length > 0,
      sourceTitle: input && input.title ? String(input.title).slice(0, 160) : ''
    };
    appendEvent(record);
    return record;
  });
  return { operationId, records };
}

function appendDeleteRecords(deleteResult, reason = '') {
  const operationId = randomId('delop');
  const tasks = Array.isArray(deleteResult.deletedTasks) ? deleteResult.deletedTasks : [];
  const records = tasks.map((task) => {
    const record = {
      event: 'delete',
      recordId: randomId('delrec'),
      operationId,
      source: deleteResult.source || 'cli',
      reason,
      task: summarizeTask(task)
    };
    appendEvent(record);
    return record;
  });
  return { operationId, records };
}

function listRecords(options = {}) {
  const status = String(options.status || 'active').toLowerCase();
  const limit = options.limit ? Number(options.limit) : 100;
  const events = readEvents();
  const deletedTaskIds = new Set();
  for (const event of events) {
    if (event.event === 'delete' && event.task && event.task.taskId) {
      deletedTaskIds.add(event.task.taskId);
    }
  }

  const adds = events.filter((event) => event.event === 'add').map((event) => ({
    ...event,
    status: deletedTaskIds.has(event.task && event.task.taskId) ? 'deleted' : 'active'
  }));

  const filtered = adds.filter((event) => {
    if (status === 'all') return true;
    return event.status === status;
  });

  return filtered.slice(-limit).reverse();
}

function resolveRecords(selectors = {}) {
  const active = listRecords({ status: 'active', limit: 100000 });
  const taskIds = new Set();
  const recordIds = String(selectors.recordId || selectors.recordIds || '')
    .split(/[,\n，]/).map((item) => item.trim()).filter(Boolean);
  const operationIds = String(selectors.operationId || selectors.operationIds || '')
    .split(/[,\n，]/).map((item) => item.trim()).filter(Boolean);
  const directTaskIds = String(selectors.taskId || selectors.taskIds || '')
    .split(/[,\n，]/).map((item) => item.trim()).filter(Boolean);

  for (const taskId of directTaskIds) taskIds.add(taskId);

  for (const record of active) {
    if (recordIds.includes(record.recordId) || operationIds.includes(record.operationId)) {
      if (record.task && record.task.taskId) taskIds.add(record.task.taskId);
    }
  }

  if (selectors.last) {
    const count = selectors.last === true ? 1 : Number(selectors.last);
    for (const record of active.slice(0, count)) {
      if (record.task && record.task.taskId) taskIds.add(record.task.taskId);
    }
  }

  return Array.from(taskIds);
}

module.exports = {
  LOG_PATH,
  appendAddRecords,
  appendDeleteRecords,
  listRecords,
  resolveRecords
};
