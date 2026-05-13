'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommand } = require('../src/commands');

test('parses confirm command', () => {
  assert.deepEqual(parseCommand('确认 draft_123'), { type: 'confirm', draftId: 'draft_123' });
});

test('parses modify command', () => {
  assert.deepEqual(parseCommand('修改 draft_123 把提醒改成 9:30'), {
    type: 'modify',
    draftId: 'draft_123',
    instruction: '把提醒改成 9:30'
  });
});

test('parses delete commands', () => {
  assert.deepEqual(parseCommand('删除最近一条'), { type: 'delete', last: 1 });
  assert.deepEqual(parseCommand('删除 rec_abc'), { type: 'delete', recordId: 'rec_abc' });
  assert.deepEqual(parseCommand('删除 op_abc'), { type: 'delete', operationId: 'op_abc' });
});

test('falls back to planning command', () => {
  assert.deepEqual(parseCommand('明天提醒我提交周报'), { type: 'plan', text: '明天提醒我提交周报' });
});
