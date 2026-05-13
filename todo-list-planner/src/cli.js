#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const { findTodoExe } = require('./electron-runner');
const {
  addTaskLive,
  deleteTasksLive,
  getFeaturesLive,
  getVersion,
  listCategoriesLive,
  listTagsLive,
  listTargets
} = require('./cdp');
const { runDbCommand } = require('./electron-runner');
const { normalizeTaskInput } = require('./task-shape');
const { appendAddRecords, appendDeleteRecords, listRecords, resolveRecords, LOG_PATH } = require('./audit-log');
const { formatLocal } = require('./time');

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      result._.push(arg);
      continue;
    }

    const eq = arg.indexOf('=');
    if (eq > 2) {
      result[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
    } else {
      result[key] = next;
      i += 1;
    }
  }
  return result;
}

function humanTask(result) {
  const task = result.task;
  return [
    `mode: ${result.mode}`,
    result.count && result.count > 1 ? `count: ${result.count}` : '',
    `taskId: ${task.taskId}`,
    `title: ${task.taskContent}`,
    `date: ${result.todoTimeText || ''}`,
    `reminder: ${result.reminderTimeText || ''}`,
    task.snowAssess ? `difficulty: ${task.snowAssess}` : '',
    task.standbyInt1 ? `categoryId: ${task.standbyInt1}` : '',
    task.standbyStr1 ? `repeatId: ${task.standbyStr1}` : '',
    result.uploadedFiles && result.uploadedFiles.length ? `attachments: ${result.uploadedFiles.map((item) => item.url || item.name).join(', ')}` : '',
    task.standbyStr2 ? `subtasks: ${task.standbyStr2}` : ''
  ].filter(Boolean).join('\n');
}

function printResult(result, json = false) {
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(humanTask(result));
}

function withAudit(result, input, source) {
  const audit = appendAddRecords(input, result, source);
  return {
    ...result,
    audit: {
      logPath: LOG_PATH,
      operationId: audit.operationId,
      recordIds: audit.records.map((record) => record.recordId)
    }
  };
}

async function addTodo(options) {
  const mode = String(options.mode || 'auto').toLowerCase();
  const port = Number(options.port || 9222);
  const input = {
    title: options.title || options.content || options._[1],
    description: options.desc || options.description || '',
    date: options.date || 'today',
    remind: options.remind || options.reminder || '',
    subtasks: options.subtasks || '',
    categoryId: options.categoryId || options['category-id'],
    category: options.category || options.categoryName || options['category-name'],
    difficulty: options.difficulty || options.workload,
    tags: options.tags || options.tag,
    repeat: options.repeat || options.repeatType || options['repeat-type'],
    repeatInterval: options.repeatInterval || options['repeat-interval'],
    repeatCount: options.repeatCount || options['repeat-count'],
    repeatWeekdays: options.repeatWeekdays || options['repeat-weekdays'],
    repeatMonthDays: options.repeatMonthDays || options['repeat-month-days'],
    repeatYearDate: options.repeatYearDate || options['repeat-year-date'],
    repeatSkipWeekends: options.repeatSkipWeekends || options['repeat-skip-weekends'],
    repeatSkipStatutoryHolidays: options.repeatSkipStatutoryHolidays || options['repeat-skip-statutory-holidays'],
    repeatStatutoryWorkdays: options.repeatStatutoryWorkdays || options['repeat-statutory-workdays'],
    image: options.image || options.images || options.attachment || options.attachments,
    sync: options.sync !== 'false'
  };

  const normalized = normalizeTaskInput(input);
  const requiresLive = normalized.imagePaths.length > 0 || Boolean(normalized.categoryName) || Boolean(normalized.repeat);

  if (mode === 'live' || mode === 'auto') {
    try {
      const result = await addTaskLive(input, { port });
      return withAudit(result, input, options.source || 'cli');
    } catch (error) {
      if (mode === 'live' || requiresLive) throw error;
      console.error(`[warn] live mode unavailable, falling back to db mode: ${error.message}`);
    }
  }

  if (mode === 'db' || mode === 'auto') {
    if (requiresLive) {
      throw new Error('This task uses category names, repeat rules, or image attachments; use live mode.');
    }
    const result = runDbCommand('add', {
      title: normalized.title,
      description: normalized.description,
      dateMs: normalized.dateMs,
      reminderMs: normalized.reminderMs,
      subtasks: normalized.subtasks,
      categoryId: normalized.categoryId,
      difficulty: normalized.difficulty,
      userId: normalized.userId
    }, options);
    return withAudit(result, input, options.source || 'cli');
  }

  throw new Error(`Unknown mode: ${mode}`);
}

function listToday(options) {
  return runDbCommand('list-today', {}, options);
}

async function listCategories(options) {
  return listCategoriesLive({ port: Number(options.port || 9222) });
}

async function listTags(options) {
  return listTagsLive({ port: Number(options.port || 9222) });
}

async function getFeatures(options) {
  return getFeaturesLive({ port: Number(options.port || 9222) });
}

function listAiRecords(options) {
  return {
    success: true,
    logPath: LOG_PATH,
    records: listRecords({
      status: options.status || 'active',
      limit: options.limit || 100
    })
  };
}

async function deleteAiAdded(options) {
  const port = Number(options.port || 9222);
  const taskIds = resolveRecords({
    taskId: options.taskId || options['task-id'],
    taskIds: options.taskIds || options['task-ids'],
    recordId: options.recordId || options['record-id'],
    recordIds: options.recordIds || options['record-ids'],
    operationId: options.operationId || options['operation-id'],
    operationIds: options.operationIds || options['operation-ids'],
    last: options.last
  });

  if (taskIds.length === 0) {
    throw new Error('No AI-added task records matched. Use records --json to inspect recordId/operationId, or pass --task-id.');
  }

  const result = await deleteTasksLive(taskIds, {
    port,
    reason: options.reason || ''
  });
  const audit = appendDeleteRecords({
    ...result,
    source: options.source || 'cli'
  }, options.reason || '');

  return {
    ...result,
    audit: {
      logPath: LOG_PATH,
      operationId: audit.operationId,
      recordIds: audit.records.map((record) => record.recordId)
    }
  };
}

function getTodoProcesses() {
  try {
    const script = "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Todo清单.exe' } | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress";
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function doctor(options) {
  const port = Number(options.port || 9222);
  const report = {
    node: process.version,
    todoExe: process.env.TODO_EXE || findTodoExe() || '',
    processes: getTodoProcesses(),
    cdp: {
      port,
      available: false
    }
  };

  try {
    report.cdp.version = await getVersion(port);
    report.cdp.targets = await listTargets(port);
    report.cdp.available = true;
  } catch (error) {
    report.cdp.error = error.message;
  }

  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0] || 'help';

  if (command === 'add') {
    const result = await addTodo(options);
    printResult(result, Boolean(options.json));
    return;
  }

  if (command === 'today' || command === 'list-today') {
    const result = listToday(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const task of result.tasks) {
        const mark = task.complete ? '[x]' : '[ ]';
        const reminder = task.reminderTimeText ? ` @ ${task.reminderTimeText}` : '';
        console.log(`${mark} ${task.taskContent}${reminder}`);
      }
    }
    return;
  }

  if (command === 'categories') {
    const result = await listCategories(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const category of result.categories) {
        console.log(`${category.categoryId}\t${category.categoryName}\t${category.categoryColor || ''}`);
      }
    }
    return;
  }

  if (command === 'records' || command === 'log') {
    const result = listAiRecords(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const record of result.records) {
        const task = record.task || {};
        const date = task.todoTime ? formatLocal(task.todoTime) : '无日期';
        const reminder = task.reminderTime ? ` @ ${formatLocal(task.reminderTime)}` : '';
        console.log(`${record.status}\t${record.recordId}\t${record.operationId}\t${task.taskId}\t${date}${reminder}\t${task.taskContent}`);
      }
      if (result.records.length === 0) console.log(`No records. Log path: ${result.logPath}`);
    }
    return;
  }

  if (command === 'delete' || command === 'delete-ai') {
    const result = await deleteAiAdded(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`deleted: ${result.count}`);
      for (const task of result.deletedTasks) {
        console.log(`${task.taskId}\t${task.taskContent}`);
      }
      console.log(`audit: ${result.audit.logPath}`);
    }
    return;
  }

  if (command === 'tags') {
    const result = await listTags(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const tag of result.tags) {
        console.log(`${tag.name}\t${tag.count}`);
      }
    }
    return;
  }

  if (command === 'features') {
    console.log(JSON.stringify(await getFeatures(options), null, 2));
    return;
  }

  if (command === 'doctor') {
    console.log(JSON.stringify(await doctor(options), null, 2));
    return;
  }

  console.log(`Usage:
  .\\todo.ps1 add --title "测试任务" --desc "这是一个测试任务" --date today --remind 10:00 --subtasks "1,2,3"
  .\\todo.ps1 add --mode live --title "测试任务" --difficulty high --category "工作任务" --tags "测试"
  .\\todo.ps1 add --mode live --title "带图片" --image "C:\\path\\to\\image.jpg"
  .\\todo.ps1 categories
  .\\todo.ps1 tags
  .\\todo.ps1 records
  .\\todo.ps1 delete --record-id rec_...
  .\\todo.ps1 features
  .\\todo.ps1 today
  .\\todo.ps1 doctor

Modes:
  auto  Try live CDP first, then fallback to database mode.
  live  Use Todo清单 runtime store. Requires Start-TodoDebug.ps1.
  db    Write encrypted task.db directly. UI may need refresh/restart.
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

module.exports = {
  addTodo,
  listToday,
  listCategories,
  listTags,
  getFeatures,
  listAiRecords,
  deleteAiAdded,
  doctor,
  parseArgs
};
