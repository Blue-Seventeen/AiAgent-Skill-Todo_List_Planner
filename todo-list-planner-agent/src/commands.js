'use strict';

function parseCommand(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return { type: 'empty' };

  let match = normalized.match(/^(确认|confirm|ok|yes)\s+(draft_[\w-]+)/i);
  if (match) return { type: 'confirm', draftId: match[2] };

  match = normalized.match(/^(取消|cancel)\s+(draft_[\w-]+)/i);
  if (match) return { type: 'cancel', draftId: match[2] };

  match = normalized.match(/^(修改|modify|change)\s+(draft_[\w-]+)\s+([\s\S]+)$/i);
  if (match) return { type: 'modify', draftId: match[2], instruction: match[3].trim() };

  if (/^删除最近一条$/i.test(normalized) || /^delete\s+last$/i.test(normalized)) {
    return { type: 'delete', last: 1 };
  }

  match = normalized.match(/^(删除|delete)\s+(rec_[\w-]+)/i);
  if (match) return { type: 'delete', recordId: match[2] };

  match = normalized.match(/^(删除|delete)\s+(op_[\w-]+)/i);
  if (match) return { type: 'delete', operationId: match[2] };

  return { type: 'plan', text: normalized };
}

module.exports = { parseCommand };
