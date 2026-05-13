'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TodoFeishuAgent } = require('../src/agent');

function event(text, extraMessage = {}) {
  return {
    message: {
      message_id: `mid_${Math.random()}`,
      chat_id: 'chat_1',
      chat_type: 'p2p',
      content: JSON.stringify({ text }),
      ...extraMessage
    },
    sender: {
      sender_id: {
        open_id: 'ou_1'
      }
    }
  };
}

function createAgent(overrides = {}) {
  const replies = [];
  const cards = [];
  const addCalls = [];
  const agent = new TodoFeishuAgent({
    groupTriggerWords: ['todo'],
    attachmentDir: 'data/attachments',
    todo: { mode: 'live', port: 9222, skillDir: '../todo-list-planner' },
    llm: {},
    feishu: {}
  }, {}, {
    replyText: async (_client, _messageId, text) => {
      replies.push(text);
    },
    replyCard: async (_client, _messageId, card) => {
      cards.push(card);
    },
    planTask: async () => ({
      title: '提交周报',
      description: '整理并发送周报',
      date: 'tomorrow',
      remind: '10:00',
      difficulty: 'medium',
      tags: ['工作'],
      subtasks: ['整理数据']
    }),
    downloadImages: async () => ({ saved: [], failed: [] }),
    addDraftToTodo: async (draft) => {
      addCalls.push(draft);
      return {
        audit: {
          operationId: 'op_1',
          recordIds: ['rec_1']
        }
      };
    },
    deleteTodoRecords: async () => ({ count: 1, deletedTasks: [{ taskContent: '提交周报' }] }),
    ...overrides
  });
  return { agent, replies, cards, addCalls };
}

test('creates a draft and confirms it into Todo', async () => {
  const { agent, replies, cards, addCalls } = createAgent();
  await agent.handleEvent(event('明天 10 点提醒我提交周报'));

  assert.equal(replies[0], '已收到，正在规划 Todo 草稿。');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].header.title.content, 'Todo 草稿待确认');
  const draftId = cards[0].elements
    .find((item) => item.tag === 'action')
    .actions[0].value.draftId;

  await agent.handleEvent(event(`确认 ${draftId}`));
  assert.equal(addCalls.length, 1);
  assert.equal(addCalls[0].title, '提交周报');
  assert.match(replies[1], /operationId：op_1/);
});

test('does not write Todo when planning fails', async () => {
  const { agent, replies, addCalls } = createAgent({
    planTask: async () => {
      throw new Error('LLM response does not contain a JSON object.');
    }
  });
  await agent.handleEvent(event('明天提醒我提交周报'));

  assert.equal(addCalls.length, 0);
  assert.match(replies[1], /处理失败/);
});

test('deletes Todo records through command', async () => {
  const { agent, replies } = createAgent();
  await agent.handleEvent(event('删除最近一条'));
  assert.match(replies[0], /已删除 Todo清单任务：1/);
});

test('keeps planning when image download fails', async () => {
  const { agent, cards } = createAgent({
    downloadImages: async () => ({
      saved: [],
      failed: [{ key: 'img_1', error: 'download failed' }]
    })
  });
  await agent.handleEvent(event('把这张图加入待办', {
    content: JSON.stringify({ text: '把这张图加入待办', image_key: 'img_1' })
  }));

  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].elements.some((item) => JSON.stringify(item).includes('图片下载失败')), true);
});

test('creates a draft for image-only message', async () => {
  const { agent, cards } = createAgent({
    downloadImages: async () => ({
      saved: ['image.jpg'],
      failed: []
    })
  });
  await agent.handleEvent(event('', {
    content: JSON.stringify({ image_key: 'img_1' })
  }));

  assert.equal(cards.length, 1);
  assert.deepEqual(JSON.stringify(cards[0]).includes('1 张图片已下载'), true);
});

test('falls back to text draft when card sending fails', async () => {
  const originalError = console.error;
  console.error = () => {};
  const { agent, replies } = createAgent({
    replyCard: async () => {
      throw new Error('card unavailable');
    }
  });
  try {
    await agent.handleEvent(event('明天提醒我提交周报'));
    assert.match(replies[1], /草稿 draft_/);
  } finally {
    console.error = originalError;
  }
});

test('confirms draft through card action', async () => {
  const { agent, cards, addCalls } = createAgent();
  await agent.handleEvent(event('明天 10 点提醒我提交周报'));
  const draftId = cards[0].elements.find((item) => item.tag === 'action').actions[0].value.draftId;

  const responseCard = await agent.handleCardAction({
    context: { open_message_id: 'mid_card' },
    action: { value: { action: 'confirm_draft', draftId } }
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(responseCard.header.title.content, '正在写入 Todo清单');
  assert.equal(addCalls.length, 1);
});

test('cancels draft through card action', async () => {
  const { agent, cards } = createAgent();
  await agent.handleEvent(event('明天 10 点提醒我提交周报'));
  const draftId = cards[0].elements.find((item) => item.tag === 'action').actions[1].value.draftId;

  const responseCard = await agent.handleCardAction({
    action: { value: { action: 'cancel_draft', draftId } }
  });

  assert.equal(responseCard.header.title.content, 'Todo 草稿已取消');
  assert.equal(agent.drafts.get(draftId).status, 'cancelled');
});
