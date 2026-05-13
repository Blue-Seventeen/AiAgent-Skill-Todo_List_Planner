'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getTextFromMessage, shouldHandleMessage, extractImageKeys } = require('../src/message-utils');

test('reads text message content', () => {
  assert.equal(getTextFromMessage({ content: JSON.stringify({ text: 'hello' }) }), 'hello');
});

test('ignores group messages without mention or trigger', () => {
  assert.equal(shouldHandleMessage({ chat_type: 'group', mentions: [] }, '普通聊天', ['todo']), false);
});

test('handles group messages with trigger', () => {
  assert.equal(shouldHandleMessage({ chat_type: 'group', mentions: [] }, 'todo 明天提醒我', ['todo']), true);
});

test('extracts image keys', () => {
  const message = {
    content: JSON.stringify({
      image_key: 'img_a',
      images: [{ image_key: 'img_b' }]
    })
  };
  assert.deepEqual(extractImageKeys(message), ['img_a', 'img_b']);
});
