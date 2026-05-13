'use strict';

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime();
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0);
}

function parseDateMs(value) {
  if (value === undefined || value === null || value === '') {
    return startOfDay(new Date());
  }

  if (typeof value === 'number') {
    if (value === 0) return 0;
    return startOfDay(new Date(value));
  }

  const text = String(value).trim();
  const normalized = text.toLowerCase();
  if (['today', '今天', '今日'].includes(normalized)) {
    return startOfDay(new Date());
  }
  if (['tomorrow', '明天'].includes(normalized)) {
    return startOfDay(addDays(new Date(), 1));
  }
  if (['none', 'no-date', 'nodate', 'null', '0', '没有日期', '无日期', '无'].includes(normalized)) {
    return 0;
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return startOfDay(parsed);
  }

  throw new Error(`Invalid date: ${value}`);
}

function parseReminderMs(value, dateMs) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  const text = String(value).trim().replace('：', ':');
  if (['none', 'null', '0', '无', '不提醒', '没有提醒'].includes(text.toLowerCase())) {
    return 0;
  }

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
    const [hour, minute, second = 0] = text.split(':').map(Number);
    const base = dateMs ? new Date(dateMs) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, second, 0).getTime();
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getTime();
  }

  throw new Error(`Invalid reminder time: ${value}`);
}

function formatLocal(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('zh-CN', { hour12: false });
}

module.exports = {
  startOfDay,
  addDays,
  parseDateMs,
  parseReminderMs,
  formatLocal
};
