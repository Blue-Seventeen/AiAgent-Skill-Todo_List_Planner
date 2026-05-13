'use strict';

const { DraftStore } = require('./draft-store');
const { downloadImages } = require('./attachments');
const { cancelledCard, draftCard, missingDraftCard, writingCard } = require('./cards');
const { parseCommand } = require('./commands');
const { replyCard, replyText } = require('./feishu');
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
    this.replyCard = options.replyCard || replyCard;
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

    const sentCard = await this.safeReplyCard(message.message_id, draftCard(draft));
    if (!sentCard) await this.safeReply(message.message_id, formatDraft(draft));
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

  async confirmDraftFromCard(draftId, actionMessageId) {
    const draft = this.drafts.get(draftId);
    if (!draft || draft.status !== 'pending') {
      return missingDraftCard(draftId);
    }

    this.addDraftToTodo(draft.task, this.config)
      .then(async (result) => {
        this.drafts.markConfirmed(draftId, result);
        if (actionMessageId) {
          await this.safeReply(actionMessageId, formatAddResult(draft, result));
        }
      })
      .catch(async (error) => {
        if (actionMessageId) {
          await this.safeReply(actionMessageId, `写入失败：${truncate(error.message, 1000)}`);
        }
      });

    return writingCard(draft);
  }

  async cancelDraft(messageId, draftId) {
    const draft = this.drafts.cancel(draftId);
    if (!draft) {
      await this.safeReply(messageId, `未找到可取消的草稿：${draftId}`);
      return;
    }
    await this.safeReply(messageId, `已取消草稿：${draftId}`);
  }

  cancelDraftFromCard(draftId) {
    const draft = this.drafts.cancel(draftId);
    if (!draft) return missingDraftCard(draftId);
    return cancelledCard(draftId);
  }

  async handleCardAction(data) {
    const value = data && data.action && data.action.value ? data.action.value : {};
    const action = value.action || value.type;
    const draftId = value.draftId || value.draft_id;
    const actionMessageId = data.open_message_id || (data.context && data.context.open_message_id) || '';

    if (action === 'confirm_draft') {
      return this.confirmDraftFromCard(draftId, actionMessageId);
    }

    if (action === 'cancel_draft') {
      return this.cancelDraftFromCard(draftId);
    }

    return missingDraftCard(draftId || 'unknown');
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

  async safeReplyCard(messageId, card) {
    try {
      await this.replyCard(this.feishuClient, messageId, card);
      return true;
    } catch (error) {
      console.error(`[card reply failed] ${error.stack || error.message || error}`);
      return false;
    }
  }
}

module.exports = { TodoFeishuAgent };
