'use strict';

function field(label, value) {
  return {
    is_short: true,
    text: {
      tag: 'lark_md',
      content: `**${label}**\n${value || '无'}`
    }
  };
}

function list(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('、') || '无';
  return value || '无';
}

function baseCard(title, template, elements) {
  return {
    config: {
      wide_screen_mode: true,
      enable_forward: false,
      update_multi: false
    },
    header: {
      template,
      title: {
        tag: 'plain_text',
        content: title
      }
    },
    elements
  };
}

function draftCard(draft) {
  const task = draft.task || {};
  return baseCard('Todo 草稿待确认', 'blue', [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${task.title || '未命名任务'}**\n${task.description || '无描述'}`
      }
    },
    {
      tag: 'div',
      fields: [
        field('日期', task.date),
        field('提醒', task.remind),
        field('难度', task.difficulty || 'general'),
        field('分类', task.category || task.categoryId),
        field('标签', list(task.tags)),
        field('子任务', list(task.subtasks))
      ]
    },
    draft.attachmentSummary ? {
      tag: 'note',
      elements: [{
        tag: 'plain_text',
        content: `附件：${draft.attachmentSummary}`
      }]
    } : null,
    {
      tag: 'hr'
    },
    {
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '确认写入' },
          type: 'primary',
          value: { action: 'confirm_draft', draftId: draft.id }
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '取消' },
          type: 'default',
          value: { action: 'cancel_draft', draftId: draft.id }
        }
      ]
    },
    {
      tag: 'note',
      elements: [{
        tag: 'plain_text',
        content: `草稿 ID：${draft.id}。也可以回复“确认 ${draft.id}”或“修改 ${draft.id} ...”。`
      }]
    }
  ].filter(Boolean));
}

function statusCard(title, template, lines) {
  return baseCard(title, template, [{
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: lines.filter(Boolean).join('\n')
    }
  }]);
}

function writingCard(draft) {
  return statusCard('正在写入 Todo清单', 'wathet', [
    `**${draft && draft.task ? draft.task.title : 'Todo 草稿'}**`,
    '请稍候，写入完成后我会在当前会话中回复结果。'
  ]);
}

function cancelledCard(draftId) {
  return statusCard('Todo 草稿已取消', 'grey', [
    `草稿 ID：${draftId}`
  ]);
}

function missingDraftCard(draftId) {
  return statusCard('草稿不可用', 'orange', [
    `未找到可操作的草稿：${draftId}`,
    '可能已经确认、取消，或 Agent 重启后内存草稿已失效。'
  ]);
}

function writtenCard(draft, result) {
  const audit = result.audit || {};
  return statusCard('已写入 Todo清单', 'green', [
    `**${draft.task.title}**`,
    draft.task.remind ? `提醒：${draft.task.remind}` : '',
    audit.operationId ? `operationId：${audit.operationId}` : '',
    audit.recordIds && audit.recordIds.length ? `recordIds：${audit.recordIds.join(', ')}` : ''
  ]);
}

module.exports = {
  draftCard,
  writingCard,
  cancelledCard,
  missingDraftCard,
  writtenCard
};
