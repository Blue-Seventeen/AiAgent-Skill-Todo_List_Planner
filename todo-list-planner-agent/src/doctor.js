#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { loadConfig, validateConfig } = require('./config');
const { createFeishuClient } = require('./feishu');
const { doctorTodo } = require('./todo-bridge');

async function checkLlm(config) {
  if (!config.llm.baseUrl || !config.llm.apiKey || !config.llm.model) {
    return { ok: false, error: 'LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL are required.' };
  }
  const url = `${config.llm.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
  const body = {
    model: config.llm.model,
    messages: [{ role: 'user', content: 'Return JSON: {"ok":true}' }],
    temperature: 0,
    response_format: { type: 'json_object' }
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.llm.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok && response.status >= 400 && response.status < 500 && /response_format/i.test(text)) {
    delete body.response_format;
    const retry = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.llm.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const retryText = await retry.text();
    return {
      ok: retry.ok,
      status: retry.status,
      warning: retry.ok ? 'Provider does not support response_format; Agent will enforce JSON by prompt and parser.' : '',
      error: retry.ok ? '' : retryText.slice(0, 500)
    };
  }
  return {
    ok: response.ok,
    status: response.status,
    error: response.ok ? '' : text.slice(0, 500)
  };
}

async function checkFeishu(config) {
  if (!config.feishu.appId || !config.feishu.appSecret) {
    return { ok: false, error: 'FEISHU_APP_ID and FEISHU_APP_SECRET are required.' };
  }
  const client = createFeishuClient(config);
  try {
    const res = await client.auth.v3.tenantAccessToken.internal({
      data: {
        app_id: config.feishu.appId,
        app_secret: config.feishu.appSecret
      }
    });
    return { ok: !res.code, code: res.code || 0, msg: res.msg || '' };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function runDoctor() {
  const config = loadConfig({ cwd: process.cwd() });
  const missing = validateConfig(config);
  const report = {
    node: process.version,
    cwd: process.cwd(),
    config: {
      missing,
      todoSkillDir: config.todo.skillDir,
      dataDir: config.dataDir,
      attachmentDir: config.attachmentDir
    },
    filesystem: {
      todoSkillDirExists: fs.existsSync(config.todo.skillDir),
      dataDirExists: fs.existsSync(config.dataDir),
      attachmentDirExists: fs.existsSync(config.attachmentDir)
    },
    feishu: null,
    llm: null,
    todo: null
  };

  try {
    report.feishu = await checkFeishu(config);
  } catch (error) {
    report.feishu = { ok: false, error: error.message };
  }

  try {
    report.llm = await checkLlm(config);
  } catch (error) {
    report.llm = { ok: false, error: error.message };
  }

  try {
    report.todo = await doctorTodo(config);
  } catch (error) {
    report.todo = { ok: false, error: error.message };
  }

  console.log(JSON.stringify(report, null, 2));
  const ok = missing.length === 0 && report.feishu.ok && report.llm.ok && report.todo && report.todo.cdp && report.todo.cdp.available;
  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  runDoctor().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

module.exports = { runDoctor, checkLlm, checkFeishu };
