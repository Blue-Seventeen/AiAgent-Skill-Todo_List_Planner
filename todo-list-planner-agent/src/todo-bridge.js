'use strict';

const path = require('path');

function loadTodoCli(skillDir) {
  const cliPath = path.resolve(skillDir, 'src', 'cli.js');
  return require(cliPath);
}

function buildAddOptions(draft, config, source = 'feishu-agent') {
  return {
    _: ['add'],
    mode: config.todo.mode,
    port: config.todo.port,
    title: draft.title,
    desc: draft.description || '',
    date: draft.date || 'today',
    remind: draft.remind || '',
    difficulty: draft.difficulty || 'general',
    category: draft.category || '',
    categoryId: draft.categoryId,
    tags: Array.isArray(draft.tags) ? draft.tags.join(',') : (draft.tags || ''),
    subtasks: Array.isArray(draft.subtasks) ? draft.subtasks.join(',') : (draft.subtasks || ''),
    repeat: draft.repeat || '',
    repeatInterval: draft.repeatInterval,
    repeatCount: draft.repeatCount,
    repeatWeekdays: Array.isArray(draft.repeatWeekdays) ? draft.repeatWeekdays.join(',') : (draft.repeatWeekdays || ''),
    repeatMonthDays: Array.isArray(draft.repeatMonthDays) ? draft.repeatMonthDays.join(',') : (draft.repeatMonthDays || ''),
    repeatYearDate: draft.repeatYearDate || '',
    repeatSkipWeekends: draft.repeatSkipWeekends,
    repeatSkipStatutoryHolidays: draft.repeatSkipStatutoryHolidays,
    repeatStatutoryWorkdays: draft.repeatStatutoryWorkdays,
    image: Array.isArray(draft.imagePaths) ? draft.imagePaths.join(',') : (draft.image || ''),
    source,
    json: true
  };
}

async function addDraftToTodo(draft, config) {
  const cli = loadTodoCli(config.todo.skillDir);
  return cli.addTodo(buildAddOptions(draft, config));
}

async function deleteTodoRecords(selector, config) {
  const cli = loadTodoCli(config.todo.skillDir);
  return cli.deleteAiAdded({
    ...selector,
    port: config.todo.port,
    source: 'feishu-agent'
  });
}

async function doctorTodo(config) {
  const cli = loadTodoCli(config.todo.skillDir);
  return cli.doctor({ port: config.todo.port });
}

module.exports = {
  buildAddOptions,
  addDraftToTodo,
  deleteTodoRecords,
  doctorTodo
};
