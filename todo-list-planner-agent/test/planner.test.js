'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractJson, normalizeDraft } = require('../src/planner');

test('extracts fenced json', () => {
  assert.deepEqual(extractJson('```json\n{"ok":true}\n```'), { ok: true });
});

test('normalizes draft fields', () => {
  const draft = normalizeDraft({
    task: {
      title: '提交周报',
      description: '整理并发送',
      date: 'tomorrow',
      remind: '10:00',
      difficulty: 'medium',
      tags: ['工作'],
      subtasks: ['整理数据']
    }
  });
  assert.equal(draft.title, '提交周报');
  assert.equal(draft.date, 'tomorrow');
  assert.deepEqual(draft.tags, ['工作']);
  assert.deepEqual(draft.subtasks, ['整理数据']);
});

test('rejects draft without title', () => {
  assert.throws(() => normalizeDraft({ task: { description: 'no title' } }), /missing task.title/);
});
