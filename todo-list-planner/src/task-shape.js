'use strict';

const crypto = require('crypto');
const { parseDateMs, parseReminderMs } = require('./time');

const MAX_SUBTASKS = 20;
const MAX_SUBTASK_LENGTH = 80;

const DIFFICULTY_MAP = new Map([
  ['general', 3],
  ['normal', 3],
  ['easy', 3],
  ['low', 3],
  ['一般', 3],
  ['普通', 3],
  ['medium', 5],
  ['middle', 5],
  ['moderate', 5],
  ['中等', 5],
  ['中等难度', 5],
  ['high', 9],
  ['hard', 9],
  ['difficult', 9],
  ['较高', 9],
  ['较高难度', 9],
  ['高', 9]
]);

function splitList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => splitList(item));
  }
  return String(value)
    .split(/[,\n，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSubtasks(value) {
  const subtasks = splitList(value);
  if (subtasks.length > MAX_SUBTASKS) {
    throw new Error(`Todo清单子任务最多支持 ${MAX_SUBTASKS} 个，当前 ${subtasks.length} 个。`);
  }

  for (const item of subtasks) {
    if (item.length > MAX_SUBTASK_LENGTH) {
      throw new Error(`子任务单项最多 ${MAX_SUBTASK_LENGTH} 字符：${item}`);
    }
  }

  return subtasks;
}

function toStandbySubtasks(value) {
  const subtasks = parseSubtasks(value);
  if (subtasks.length === 0) return '';
  return subtasks.map((item) => `- [ ]${item}`).join('[end] -');
}

function randomIdPart(length = 6) {
  return crypto.randomBytes(Math.ceil(length * 0.75)).toString('base64url').slice(0, length);
}

function parseDifficulty(value) {
  if (value === undefined || value === null || value === '') return 3;
  if (typeof value === 'number') return value;

  const text = String(value).trim();
  if (/^-?\d+$/.test(text)) return Number(text);

  const normalized = text.toLowerCase();
  if (DIFFICULTY_MAP.has(normalized)) return DIFFICULTY_MAP.get(normalized);
  throw new Error(`Unknown difficulty: ${value}. Use general/medium/high or 一般/中等难度/较高难度.`);
}

function normalizeTagName(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return `#${text.replace(/^#+/, '').replace(/\s+/g, '')}`;
}

function parseTags(value) {
  if (!value) return [];
  const values = Array.isArray(value)
    ? value.flatMap((item) => parseTags(item))
    : String(value).split(/[,\n，\s]+/).map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(values.map(normalizeTagName).filter(Boolean)));
}

function appendTagsToTitle(title, tags) {
  let result = title.trim();
  for (const tag of tags) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const alreadyPresent = new RegExp(`${escaped}(?=\\s|$)`).test(result);
    if (!alreadyPresent) result += ` ${tag} `;
  }
  const endsWithTag = /#[^\s]+$/.test(result);
  return result.replace(/(#[^\s]+)$/g, '$1 ').replace(/\s+$/g, (tags.length || endsWithTag) ? ' ' : '');
}

function normalizeCategory(input) {
  const categoryIdRaw = input.categoryId ?? input['category-id'] ?? input.standbyInt1;
  const categoryRaw = input.category ?? input.categoryName ?? input['category-name'];

  if (categoryIdRaw !== undefined && categoryIdRaw !== null && categoryIdRaw !== '') {
    return { categoryId: Number(categoryIdRaw), categoryName: '' };
  }

  if (categoryRaw !== undefined && categoryRaw !== null && categoryRaw !== '') {
    const text = String(categoryRaw).trim();
    if (/^\d+$/.test(text)) return { categoryId: Number(text), categoryName: '' };
    return { categoryId: 0, categoryName: text };
  }

  return { categoryId: 0, categoryName: '' };
}

function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got: ${value}`);
  }
  return parsed;
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'y', 'on', '是'].includes(String(value).trim().toLowerCase());
}

function normalizeRepeatType(value) {
  if (value === undefined || value === null || value === '' || value === false) return '';
  if (value === true) return 'day';
  const normalized = String(value).trim().toLowerCase();
  const map = new Map([
    ['day', 'day'],
    ['daily', 'day'],
    ['days', 'day'],
    ['天', 'day'],
    ['每天', 'day'],
    ['week', 'week'],
    ['weekly', 'week'],
    ['weeks', 'week'],
    ['周', 'week'],
    ['每周', 'week'],
    ['month', 'month'],
    ['monthly', 'month'],
    ['months', 'month'],
    ['月', 'month'],
    ['每月', 'month'],
    ['year', 'year'],
    ['yearly', 'year'],
    ['years', 'year'],
    ['年', 'year'],
    ['每年', 'year']
  ]);
  if (!map.has(normalized)) {
    throw new Error(`Unknown repeat type: ${value}. Use daily/weekly/monthly/yearly.`);
  }
  return map.get(normalized);
}

function parseWeekdays(value) {
  const map = new Map([
    ['sun', 0], ['sunday', 0], ['周日', 0], ['星期日', 0], ['日', 0],
    ['mon', 1], ['monday', 1], ['周一', 1], ['星期一', 1], ['一', 1],
    ['tue', 2], ['tuesday', 2], ['周二', 2], ['星期二', 2], ['二', 2],
    ['wed', 3], ['wednesday', 3], ['周三', 3], ['星期三', 3], ['三', 3],
    ['thu', 4], ['thursday', 4], ['周四', 4], ['星期四', 4], ['四', 4],
    ['fri', 5], ['friday', 5], ['周五', 5], ['星期五', 5], ['五', 5],
    ['sat', 6], ['saturday', 6], ['周六', 6], ['星期六', 6], ['六', 6]
  ]);

  return splitList(value).map((item) => {
    const text = String(item).trim().toLowerCase();
    if (/^[0-6]$/.test(text)) return Number(text);
    if (map.has(text)) return map.get(text);
    throw new Error(`Unknown weekday: ${item}. Use 0-6 or mon/tue/...`);
  });
}

function parseMonthDays(value) {
  return splitList(value).map((item) => {
    const text = String(item).trim().toLowerCase();
    if (['last', '最后一天', '月末'].includes(text)) return 'last';
    const parsed = Number(text);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
      throw new Error(`Invalid month day: ${item}. Use 1-31 or last.`);
    }
    return parsed;
  });
}

function normalizeRepeat(input) {
  const type = normalizeRepeatType(input.repeat || input.repeatType || input['repeat-type']);
  if (!type) return null;

  return {
    type,
    interval: parseInteger(input.repeatInterval ?? input['repeat-interval'], 1),
    count: parseInteger(input.repeatCount ?? input['repeat-count'], 1),
    weekdays: parseWeekdays(input.repeatWeekdays ?? input['repeat-weekdays']),
    monthDays: parseMonthDays(input.repeatMonthDays ?? input['repeat-month-days']),
    yearDate: String(input.repeatYearDate ?? input['repeat-year-date'] ?? '').trim(),
    skipWeekends: parseBoolean(input.repeatSkipWeekends ?? input['repeat-skip-weekends']),
    skipStatutoryHolidays: parseBoolean(input.repeatSkipStatutoryHolidays ?? input['repeat-skip-statutory-holidays']),
    statutoryWorkdays: parseBoolean(input.repeatStatutoryWorkdays ?? input['repeat-statutory-workdays'])
  };
}

function normalizeTaskInput(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Task input must be an object.');
  }

  const rawTitle = String(input.title || input.taskContent || '').trim();
  if (!rawTitle) {
    throw new Error('Task title is required.');
  }

  const tags = parseTags(input.tags || input.tag);
  const title = appendTagsToTitle(rawTitle, tags);
  const dateMs = input.dateMs !== undefined ? Number(input.dateMs) : parseDateMs(input.date || input.todoDate || 'today');
  const reminderMs = input.reminderMs !== undefined
    ? Number(input.reminderMs)
    : parseReminderMs(input.remind || input.reminder || input.reminderTime || '', dateMs);
  const { categoryId, categoryName } = normalizeCategory(input);
  const subtasks = parseSubtasks(input.subtasks ?? input.todoSublist ?? input.standbyStr2);
  const repeat = normalizeRepeat(input);

  return {
    title,
    description: String(input.description ?? input.desc ?? input.taskDescribe ?? ''),
    dateMs,
    reminderMs,
    subtasks,
    subtaskText: toStandbySubtasks(subtasks),
    categoryId,
    categoryName,
    difficulty: parseDifficulty(input.difficulty ?? input.snowAssess ?? input.workload ?? input['workload']),
    tags,
    repeat,
    imagePaths: splitList(input.image || input.images || input.attachment || input.attachments || input['image-paths']),
    userId: input.userId ? Number(input.userId) : undefined,
    sync: input.sync !== false,
    raw: input
  };
}

function buildDbRow(input, defaults) {
  const task = normalizeTaskInput(input);
  const now = Date.now();
  const userId = task.userId || defaults.userId;
  if (!userId) throw new Error('Unable to determine Todo userId.');

  return {
    id: Number(defaults.maxId || 0) + 1,
    userId,
    taskId: `tid_${userId}${randomIdPart(6)}_${now}`,
    taskContent: task.title,
    taskDescribe: task.description,
    status: 'sync',
    complete: 0,
    createTime: now,
    updateTime: now,
    syncTime: now,
    reminderTime: task.reminderMs || 0,
    todoTime: task.dateMs || 0,
    taskSort: Math.fround(Number(defaults.maxSort || 5000) + 150),
    delete: 0,
    snowAdd: 3,
    snowAssess: task.difficulty,
    standbyInt1: task.categoryId,
    standbyStr1: '',
    standbyStr2: task.subtaskText,
    standbyStr3: '',
    standbyStr4: '',
    version: Number(defaults.maxVersion || 0) + 1
  };
}

module.exports = {
  normalizeTaskInput,
  buildDbRow,
  parseSubtasks,
  toStandbySubtasks,
  parseDifficulty,
  parseTags,
  appendTagsToTitle,
  MAX_SUBTASKS,
  MAX_SUBTASK_LENGTH
};
