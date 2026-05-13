#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { TodoFeishuAgent } = require('./agent');
const { loadConfig, validateConfig } = require('./config');
const { createFeishuClient, createWsClient } = require('./feishu');
const lark = require('@larksuiteoapi/node-sdk');

async function main() {
  const config = loadConfig({ cwd: process.cwd() });
  const missing = validateConfig(config);
  if (missing.length) {
    console.error(`配置缺失或无效：\n- ${missing.join('\n- ')}`);
    process.exit(1);
  }

  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.attachmentDir, { recursive: true });

  const feishuClient = createFeishuClient(config);
  const wsClient = createWsClient(config);
  const agent = new TodoFeishuAgent(config, feishuClient);

  const dispatcher = new lark.EventDispatcher({}).register({
    'im.message.receive_v1': (data) => {
      // Keep the long-connection event handler short; actual planning runs in the background.
      agent.handleEvent(data).catch((error) => {
        console.error(error && error.stack ? error.stack : String(error));
      });
    }
  });

  await wsClient.start({ eventDispatcher: dispatcher });
  console.log('Todo List Planner Feishu Agent started.');
  console.log(`Todo Skill: ${config.todo.skillDir}`);
  console.log(`Data dir: ${config.dataDir}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

module.exports = { main };
