'use strict';

function list(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('、') || '无';
  return value || '无';
}

function formatDraft(draft) {
  return [
    `草稿 ${draft.id} 已生成`,
    `标题：${draft.task.title}`,
    `描述：${draft.task.description || '无'}`,
    `日期：${draft.task.date || '无'}`,
    `提醒：${draft.task.remind || '无'}`,
    `难度：${draft.task.difficulty || 'general'}`,
    `分类：${draft.task.category || draft.task.categoryId || '无'}`,
    `标签：${list(draft.task.tags)}`,
    `子任务：${list(draft.task.subtasks)}`,
    draft.attachmentSummary ? `附件：${draft.attachmentSummary}` : '',
    '',
    '回复：',
    `确认 ${draft.id}`,
    `取消 ${draft.id}`,
    `修改 ${draft.id} 把提醒改成 9:30`
  ].filter((line) => line !== '').join('\n');
}

function formatAddResult(draft, result) {
  const audit = result.audit || {};
  return [
    `已写入 Todo清单：${draft.task.title}`,
    draft.task.remind ? `提醒：${draft.task.remind}` : '',
    draft.attachmentSummary ? `附件：${draft.attachmentSummary}` : '',
    audit.operationId ? `operationId：${audit.operationId}` : '',
    audit.recordIds && audit.recordIds.length ? `recordIds：${audit.recordIds.join(', ')}` : ''
  ].filter(Boolean).join('\n');
}

function formatDeleteResult(result) {
  const tasks = Array.isArray(result.deletedTasks) ? result.deletedTasks : [];
  return [
    `已删除 Todo清单任务：${result.count || tasks.length}`,
    ...tasks.map((task) => `- ${task.taskContent || task.taskId}`)
  ].join('\n');
}

module.exports = {
  formatDraft,
  formatAddResult,
  formatDeleteResult
};
