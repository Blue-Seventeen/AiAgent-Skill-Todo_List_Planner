# Todo List Planner Feishu Agent

`todo-list-planner-agent` 是一个本机常驻飞书机器人，用于把飞书单聊消息或群聊 `@` 消息规划成 Todo清单任务草稿。用户确认后，Agent 会调用仓库内 `todo-list-planner` 的 live 桥写入本机 Todo清单。

## 工作方式

1. 飞书通过长连接推送 `im.message.receive_v1` 消息事件。
2. Agent 立即回复“已收到，正在规划”，避免事件处理超时。
3. Agent 调用 OpenAI 兼容模型，把消息解析成 Todo 草稿。
4. 用户回复 `确认 draft_...` 后，Agent 写入本机 Todo清单。
5. 写入结果会返回 `operationId` 和 `recordIds`，方便后续删除。

## 飞书应用要求

- 创建企业自建应用并启用机器人能力。
- 开启事件订阅的长连接模式。
- 订阅 `im.message.receive_v1`。
- 授权读取消息、回复消息、获取消息资源所需权限。
- 把机器人添加到需要使用的单聊或群聊中。

## 安装

```powershell
cd .\todo-list-planner-agent
npm install
Copy-Item .env.example .env
```

编辑 `.env`：

```dotenv
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
LLM_BASE_URL=https://api.openai.com
LLM_API_KEY=sk-xxx
LLM_MODEL=gpt-4.1-mini
TODO_SKILL_DIR=../todo-list-planner
TODO_MODE=live
TODO_PORT=9222
```

启动 Todo清单 live 桥：

```powershell
cd ..\todo-list-planner
.\Start-TodoDebug.ps1 -Restart
```

检查 Agent 环境：

```powershell
cd ..\todo-list-planner-agent
npm run doctor
```

启动机器人：

```powershell
npm start
```

## 使用

给机器人发送：

```text
明天上午 10 点提醒我提交周报，子任务：整理数据、写总结、发给负责人
```

机器人会回复草稿：

```text
草稿 draft_... 已生成
标题：提交周报
日期：tomorrow
提醒：10:00
子任务：整理数据、写总结、发给负责人

回复：
确认 draft_...
取消 draft_...
修改 draft_... 把提醒改成 9:30
```

确认写入：

```text
确认 draft_...
```

删除 AI 添加的任务：

```text
删除最近一条
删除 rec_...
删除 op_...
```

## 附件

第一版只处理飞书消息中的图片附件。Agent 会把图片下载到 `ATTACHMENT_DIR`，再把本地路径交给 Todo live 桥上传。如果飞书图片资源下载失败，Agent 会继续创建文字任务，并在回复里说明附件未同步。

注意：Todo live 桥当前不支持把图片附件和重复任务组合使用。

## 数据与隐私

- `.env` 不会入库。
- `data/` 不会入库。
- 飞书图片附件只保存在本机 `ATTACHMENT_DIR`。
- Todo 写入审计仍由 `todo-list-planner` 写入 `%APPDATA%\todo-list-planner\ai-added-tasks.jsonl`。
