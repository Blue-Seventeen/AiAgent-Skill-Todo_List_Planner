#!/usr/bin/env node
'use strict';

const {
  addTodo,
  deleteAiAdded,
  doctor,
  getFeatures,
  listAiRecords,
  listCategories,
  listTags,
  listToday
} = require('./cli');

let buffer = Buffer.alloc(0);

function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function result(id, value) {
  send({ jsonrpc: '2.0', id, result: value });
}

function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(request) {
  const { id, method, params = {} } = request;

  if (method === 'initialize') {
    result(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'todo-list-planner', version: '0.1.0' }
    });
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'tools/list') {
    result(id, {
      tools: [
        {
          name: 'add_todo',
          description: 'Add a task to the local Todo清单 app. Uses live mode when available.',
          inputSchema: {
            type: 'object',
            required: ['title'],
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              date: { type: 'string', description: 'today or YYYY-MM-DD' },
              remind: { type: 'string', description: 'HH:mm or full date time' },
              difficulty: { type: 'string', description: 'general/medium/high or 一般/中等难度/较高难度' },
              category: { type: 'string', description: 'Category name or id from list_categories' },
              categoryId: { type: 'number' },
              tags: {
                oneOf: [
                  { type: 'string', description: 'Comma/space separated # tags' },
                  { type: 'array', items: { type: 'string' } }
                ]
              },
              subtasks: {
                oneOf: [
                  { type: 'string', description: 'Comma/newline separated subtasks' },
                  { type: 'array', items: { type: 'string' } }
                ]
              },
              repeat: { type: 'string', description: 'daily, weekly, monthly, yearly' },
              repeatInterval: { type: 'number' },
              repeatCount: { type: 'number' },
              repeatWeekdays: {
                oneOf: [
                  { type: 'string', description: 'Comma separated weekdays, 0=Sunday' },
                  { type: 'array', items: { type: 'string' } }
                ]
              },
              repeatMonthDays: {
                oneOf: [
                  { type: 'string', description: 'Comma separated 1-31 or last' },
                  { type: 'array', items: { type: 'string' } }
                ]
              },
              repeatYearDate: { type: 'string', description: 'MM-DD for yearly repeat' },
              repeatSkipWeekends: { type: 'boolean' },
              repeatSkipStatutoryHolidays: { type: 'boolean' },
              repeatStatutoryWorkdays: { type: 'boolean' },
              image: { type: 'string', description: 'Local image path to upload as attachment' },
              mode: { type: 'string', enum: ['auto', 'live', 'db'] },
              port: { type: 'number' }
            }
          }
        },
        {
          name: 'list_today',
          description: 'List tasks scheduled for today from the local Todo清单 database.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'list_ai_records',
          description: 'List AI-added Todo records from the local audit log.',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['active', 'deleted', 'all'] },
              limit: { type: 'number' }
            }
          }
        },
        {
          name: 'delete_ai_added',
          description: 'Delete AI-added Todo tasks by recordId, operationId, taskId, or last N records.',
          inputSchema: {
            type: 'object',
            properties: {
              recordId: { type: 'string' },
              operationId: { type: 'string' },
              taskId: { type: 'string' },
              last: { type: 'number' },
              reason: { type: 'string' },
              port: { type: 'number' }
            }
          }
        },
        {
          name: 'list_categories',
          description: 'List user categories from the running Todo清单 app.',
          inputSchema: {
            type: 'object',
            properties: { port: { type: 'number' } }
          }
        },
        {
          name: 'list_tags',
          description: 'List # tags parsed by the running Todo清单 app.',
          inputSchema: {
            type: 'object',
            properties: { port: { type: 'number' } }
          }
        },
        {
          name: 'features',
          description: 'Report supported Todo清单 task fields and current category/tag values.',
          inputSchema: {
            type: 'object',
            properties: { port: { type: 'number' } }
          }
        },
        {
          name: 'doctor',
          description: 'Check Todo清单 process and live bridge status.',
          inputSchema: {
            type: 'object',
            properties: { port: { type: 'number' } }
          }
        }
      ]
    });
    return;
  }

  if (method === 'tools/call') {
    const name = params.name;
    const args = params.arguments || {};
    if (name === 'add_todo') {
      const added = await addTodo({
        _: ['add'],
        title: args.title,
        desc: args.description || args.desc || '',
        date: args.date || 'today',
        remind: args.remind || args.reminder || '',
        difficulty: args.difficulty || args.workload,
        category: args.category || args.categoryName,
        categoryId: args.categoryId,
        tags: Array.isArray(args.tags) ? args.tags.join(',') : (args.tags || ''),
        subtasks: Array.isArray(args.subtasks) ? args.subtasks.join(',') : (args.subtasks || ''),
        repeat: args.repeat || args.repeatType,
        repeatInterval: args.repeatInterval,
        repeatCount: args.repeatCount,
        repeatWeekdays: Array.isArray(args.repeatWeekdays) ? args.repeatWeekdays.join(',') : (args.repeatWeekdays || ''),
        repeatMonthDays: Array.isArray(args.repeatMonthDays) ? args.repeatMonthDays.join(',') : (args.repeatMonthDays || ''),
        repeatYearDate: args.repeatYearDate,
        repeatSkipWeekends: args.repeatSkipWeekends,
        repeatSkipStatutoryHolidays: args.repeatSkipStatutoryHolidays,
        repeatStatutoryWorkdays: args.repeatStatutoryWorkdays,
        image: args.image || args.attachment,
        mode: args.mode || 'auto',
        port: args.port || 9222,
        source: 'mcp',
        json: true
      });
      result(id, { content: [{ type: 'text', text: JSON.stringify(added, null, 2) }] });
      return;
    }

    if (name === 'list_categories') {
      const listed = await listCategories({ port: args.port || 9222 });
      result(id, { content: [{ type: 'text', text: JSON.stringify(listed, null, 2) }] });
      return;
    }

    if (name === 'list_ai_records') {
      const listed = listAiRecords({
        status: args.status || 'active',
        limit: args.limit || 100
      });
      result(id, { content: [{ type: 'text', text: JSON.stringify(listed, null, 2) }] });
      return;
    }

    if (name === 'delete_ai_added') {
      const deleted = await deleteAiAdded({
        recordId: args.recordId,
        operationId: args.operationId,
        taskId: args.taskId,
        last: args.last,
        reason: args.reason || '',
        port: args.port || 9222,
        source: 'mcp'
      });
      result(id, { content: [{ type: 'text', text: JSON.stringify(deleted, null, 2) }] });
      return;
    }

    if (name === 'list_tags') {
      const listed = await listTags({ port: args.port || 9222 });
      result(id, { content: [{ type: 'text', text: JSON.stringify(listed, null, 2) }] });
      return;
    }

    if (name === 'features') {
      const report = await getFeatures({ port: args.port || 9222 });
      result(id, { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] });
      return;
    }

    if (name === 'list_today') {
      const listed = listToday({});
      result(id, { content: [{ type: 'text', text: JSON.stringify(listed, null, 2) }] });
      return;
    }

    if (name === 'doctor') {
      const report = await doctor({ port: args.port || 9222 });
      result(id, { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] });
      return;
    }

    error(id, -32602, `Unknown tool: ${name}`);
    return;
  }

  if (id !== undefined) error(id, -32601, `Unknown method: ${method}`);
}

function pump() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;

    const header = buffer.slice(0, headerEnd).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) return;

    const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.slice(bodyEnd);

    Promise.resolve()
      .then(() => handle(JSON.parse(body)))
      .catch((err) => {
        try {
          const parsed = JSON.parse(body);
          error(parsed.id, -32000, err.message || String(err));
        } catch {
          process.stderr.write(String(err) + '\n');
        }
      });
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  pump();
});
