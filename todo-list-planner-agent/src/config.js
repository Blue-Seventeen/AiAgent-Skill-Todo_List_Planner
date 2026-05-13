'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function loadEnv(cwd = process.cwd()) {
  const envPath = path.resolve(cwd, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }
}

function resolvePath(value, baseDir) {
  return path.resolve(baseDir, value);
}

function splitCsv(value) {
  return String(value || '')
    .split(/[,\n，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadConfig(options = {}) {
  const cwd = options.cwd || process.cwd();
  if (options.loadEnv !== false) loadEnv(cwd);

  const agentDir = path.resolve(__dirname, '..');
  const dataDir = resolvePath(process.env.AGENT_DATA_DIR || './data', agentDir);
  const attachmentDir = resolvePath(process.env.ATTACHMENT_DIR || './data/attachments', agentDir);
  const todoSkillDir = resolvePath(process.env.TODO_SKILL_DIR || '../todo-list-planner', agentDir);

  return {
    agentDir,
    dataDir,
    attachmentDir,
    feishu: {
      appId: process.env.FEISHU_APP_ID || '',
      appSecret: process.env.FEISHU_APP_SECRET || ''
    },
    llm: {
      baseUrl: String(process.env.LLM_BASE_URL || '').replace(/\/+$/, ''),
      apiKey: process.env.LLM_API_KEY || '',
      model: process.env.LLM_MODEL || ''
    },
    todo: {
      skillDir: todoSkillDir,
      mode: process.env.TODO_MODE || 'live',
      port: Number(process.env.TODO_PORT || 9222)
    },
    groupTriggerWords: splitCsv(process.env.GROUP_TRIGGER_WORDS || 'todo,待办,日程'),
    timezone: process.env.TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  };
}

function validateConfig(config, options = {}) {
  const requireSecrets = options.requireSecrets !== false;
  const missing = [];
  if (requireSecrets) {
    if (!config.feishu.appId) missing.push('FEISHU_APP_ID');
    if (!config.feishu.appSecret) missing.push('FEISHU_APP_SECRET');
    if (!config.llm.baseUrl) missing.push('LLM_BASE_URL');
    if (!config.llm.apiKey) missing.push('LLM_API_KEY');
    if (!config.llm.model) missing.push('LLM_MODEL');
  }
  if (!fs.existsSync(config.todo.skillDir)) missing.push(`TODO_SKILL_DIR not found: ${config.todo.skillDir}`);
  return missing;
}

module.exports = {
  loadConfig,
  validateConfig,
  splitCsv
};
