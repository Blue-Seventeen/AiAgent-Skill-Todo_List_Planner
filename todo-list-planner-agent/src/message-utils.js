'use strict';

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getTextFromMessage(message = {}) {
  const content = safeJsonParse(message.content || '{}', {});
  if (typeof content.text === 'string') return content.text.trim();
  if (typeof content.title === 'string') return content.title.trim();
  return '';
}

function getMentionNames(message = {}) {
  const mentions = Array.isArray(message.mentions) ? message.mentions : [];
  return mentions.flatMap((mention) => [
    mention.name,
    mention.key,
    mention.id && mention.id.open_id,
    mention.id && mention.id.union_id,
    mention.id && mention.id.user_id
  ]).filter(Boolean).map(String);
}

function isGroupChat(message = {}) {
  return ['group', 'group_chat'].includes(String(message.chat_type || '').toLowerCase());
}

function shouldHandleMessage(message, text, triggerWords = []) {
  if (!isGroupChat(message)) return true;
  const mentions = getMentionNames(message);
  if (mentions.length > 0) return true;
  const normalized = String(text || '').trim().toLowerCase();
  return triggerWords.some((word) => normalized.includes(String(word).toLowerCase()));
}

function conversationIdFromEvent(data = {}) {
  const message = data.message || {};
  const sender = data.sender || {};
  const senderId = sender.sender_id || {};
  return [
    message.chat_id || '',
    senderId.open_id || senderId.user_id || senderId.union_id || ''
  ].join(':');
}

function extractImageKeys(message = {}) {
  const content = safeJsonParse(message.content || '{}', {});
  const keys = [];
  const candidates = [
    content.image_key,
    content.file_key,
    content.key
  ];
  for (const candidate of candidates) {
    if (candidate) keys.push(String(candidate));
  }
  if (Array.isArray(content.images)) {
    for (const image of content.images) {
      if (image && image.image_key) keys.push(String(image.image_key));
      if (image && image.file_key) keys.push(String(image.file_key));
    }
  }
  return Array.from(new Set(keys));
}

function truncate(text, max = 3500) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

module.exports = {
  safeJsonParse,
  getTextFromMessage,
  shouldHandleMessage,
  conversationIdFromEvent,
  extractImageKeys,
  truncate
};
