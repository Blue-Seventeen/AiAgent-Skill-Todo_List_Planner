'use strict';

const { DraftStore } = require('./draft-store');
const { downloadImages } = require('./attachments');
const { parseCommand } = require('./commands');
const { replyText } = require('./feishu');
const { formatAddResult, formatDeleteResult, formatDraft } = require('./format');
const { planTask } = require('./planner');
const {
  conversationIdFromEvent,
  extractImageKeys,
  getTextFromMessage,
  shouldHandleMessage,
  truncate
} = require('./message-utils');
const { addDraftToTodo, deleteTodoRecords } = require('./todo-bridge');

class TodoFeishuAgent {
  constructor(config, feishuClient, options = {}) {
    this.config = config;
    this.feishuClient = feishuClient;
    this.drafts = options.drafts || new DraftStore();
    this.planTask = options.planTask || planTask;
    this.replyText = options.replyText || replyText;
    this.downloadImages = options.downloadImages || downloadImages;
    this.addDraftToTodo = options.addDraftToTodo || addDraftToTodo;
    this.deleteTodoRecords = options.deleteTodoRecords || deleteTodoRecords;
  }

  async handleEvent(data) {
    const message = data.message || {};
    const messageId = message.message_id;
    const imageKeys = extractImageKeys(message);
    const text = getTextFromMessage(message) || (imageKeys.length ? '用户发送了图片，请根据图片附件创建一个待处理任务。' : '');
    if (!messageId || !text) return;
    if (!shouldHandleMessage(message, text, this.config.groupTriggerWords)) return;

    try {
      await this.handleText(data, text);
    } catch (error) {
      await this.safeReply(messageId, `处理失败：${truncate(error.message, 1000)}`);
    }
  }

  async handleText(data, text) {
    const message = data.message || {};
    const messageId = message.message_id;
    const conversationId = conversationIdFromEvent(data);
    const command = parseCommand(text);

    if (command.type === 'confirm') {
      await this.confirmDraft(messageId, command.draftId);
      return;
    }

    if (command.type === 'cancel') {
      await this.cancelDraft(messageId, command.draftId);
      return;
    }

    if (command.type === 'modify') {
      await this.modifyDraft(messageId, conversationId, command.draftId, command.instruction);
      return;
    }

    if (command.type === 'delete') {
      await this.deleteTask(messageId, command);
      return;
    }

    await this.createDraft(data, text, conversationId);
  }

  async createDraft(data, text, conversationId) {
    const message = data.message || {};
    await this.safeReply(message.message_id, '已收到，正在规划 Todo 草稿。');

    const imageKeys = extractImageKeys(message);
    const attachmentResult = imageKeys.length
      ? await this.downloadImages(this.feishuClient, message, imageKeys, this.config)
      : { saved: [], failed: [] };

    const task = await this.planTask(this.config, {
      text,
      imageCount: imageKeys.length
    });
    task.imagePaths = attachmentResult.saved;

    const attachmentSummary = this.formatAttachmentSummary(attachmentResult);
    const draft = this.drafts.create({
      conversationId,
      sourceMessageId: message.message_id,
      rawText: text,
      task,
      attachmentResult,
      attachmentSummary
    });

    await this.safeReply(message.message_id, formatDraft(draft));
  }

  async confirmDraft(messageId, draftId) {
    const draft = this.drafts.get(draftId);
    if (!draft || draft.status !== 'pending') {
      await this.safeReply(messageId, `未找到可确认的草稿：${draftId}`);
      return;
    }

    const result = await this.addDraftToTodo(draft.task, this.config);
    this.drafts.markConfirmed(draftId, result);
    await this.safeReply(messageId, formatAddResult(draft, result));
  }

  async cancelDraft(messageId, draftId) {
    const draft = this.drafts.cancel(draftId);
    if (!draft) {
      await this.safeReply(messageId, `未找到可取消的草稿：${draftId}`);
      return;
    }
    await this.safeReply(messageId, `已取消草稿：${draftId}`);
  }

  async modifyDraft(messageId, conversationId, draftId, instruction) {
    const draft = this.drafts.get(draftId);
    if (!draft || draft.status !== 'pending') {
      await this.safeReply(messageId, `未找到可修改的草稿：${draftId}`);
      return;
    }

    await this.safeReply(messageId, '已收到修改要求，正在重新规划草稿。');
    const task = await this.planTask(this.config, {
      text: draft.rawText,
      previousDraft: draft.task,
      modifyInstruction: instruction,
      imageCount: draft.attachmentResult && draft.attachmentResult.saved ? draft.attachmentResult.saved.length : 0
    });
    task.imagePaths = draft.task.imagePaths || [];

    const updated = this.drafts.update(draftId, {
      conversationId,
      task,
      rawText: draft.rawText,
      attachmentResult: draft.attachmentResult,
      attachmentSummary: draft.attachmentSummary
    });

    await this.safeReply(messageId, formatDraft(updated));
  }

  async deleteTask(messageId, selector) {
    const result = await this.deleteTodoRecords(selector, this.config);
    await this.safeReply(messageId, formatDeleteResult(result));
  }

  formatAttachmentSummary(result) {
    const saved = result.saved || [];
    const failed = result.failed || [];
    if (!saved.length && !failed.length) return '';
    if (saved.length && !failed.length) return `${saved.length} 张图片已下载并等待上传`;
    if (!saved.length && failed.length) return `${failed.length} 张图片下载失败，已保留文字任务`;
    return `${saved.length} 张图片已下载，${failed.length} 张图片下载失败`;
  }

  async safeReply(messageId, text) {
    try {
      await this.replyText(this.feishuClient, messageId, text);
    } catch (error) {
      console.error(`[reply failed] ${error.stack || error.message || error}`);
    }
  }
}

module.exports = { TodoFeishuAgent };
