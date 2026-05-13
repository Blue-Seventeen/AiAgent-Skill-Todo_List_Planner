'use strict';

const crypto = require('crypto');

class DraftStore {
  constructor(options = {}) {
    this.ttlMs = options.ttlMs || 24 * 60 * 60 * 1000;
    this.drafts = new Map();
  }

  create(payload) {
    const id = `draft_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const draft = {
      id,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...payload
    };
    this.drafts.set(id, draft);
    return draft;
  }

  get(id) {
    this.prune();
    return this.drafts.get(id) || null;
  }

  update(id, patch) {
    const current = this.get(id);
    if (!current) return null;
    const next = {
      ...current,
      ...patch,
      updatedAt: Date.now()
    };
    this.drafts.set(id, next);
    return next;
  }

  cancel(id) {
    return this.update(id, { status: 'cancelled' });
  }

  markConfirmed(id, result) {
    return this.update(id, { status: 'confirmed', result });
  }

  latestForConversation(conversationId) {
    this.prune();
    const drafts = Array.from(this.drafts.values())
      .filter((draft) => draft.conversationId === conversationId && draft.status === 'pending')
      .sort((a, b) => b.createdAt - a.createdAt);
    return drafts[0] || null;
  }

  prune() {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, draft] of this.drafts.entries()) {
      if (draft.createdAt < cutoff) this.drafts.delete(id);
    }
  }
}

module.exports = { DraftStore };
