---
name: todo-list-planner
description: Plan incoming messages, notes, screenshots, or daily information into actionable Todo清单 tasks and sync them to the local Windows Todo清单 app through the bundled live CLI/MCP bridge. Use when the user asks AI to organize received information, create schedules, add tasks, reminders, subtasks, categories, image attachments, # tags, review AI-created Todo records, or delete AI-added Todo items that were planned incorrectly.
---

# Todo List Planner

Use this skill to convert raw user information into Todo清单 tasks on the current Windows machine.

## Runtime

Run commands from this skill directory. If the skill was installed into a Codex skills directory, first change into that installed `todo-list-planner` folder.

Start or repair the live bridge before writing tasks:

```powershell
.\Start-TodoDebug.ps1 -Restart
.\todo.ps1 doctor --port 9222
```

Prefer `--mode live`. Live mode calls Todo清单's running renderer store, updates the UI immediately, and uses the app's own local sync and attachment upload path.

## Planning Workflow

1. Extract actionable tasks from the user's message.
2. Assign title, description, date, reminder, difficulty, category, subtasks, repeat rule, image attachment, and tags when supported by the source information.
3. Read categories before assigning categories:

```powershell
.\todo.ps1 categories --json
```

4. Read current tags before creating or reusing `#` tags:

```powershell
.\todo.ps1 tags --json
```

5. Add tasks with explicit fields:

```powershell
.\todo.ps1 add --mode live --title "任务标题" --desc "来源摘要或执行说明" --date today --remind 10:00 --difficulty medium --category "工作任务" --tags "AI整理" --subtasks "步骤1,步骤2"
```

6. Report the audit `operationId` and `recordIds` returned by the command so the user can ask to delete incorrect AI-created tasks later.

## Field Rules

- Difficulty: use `general`, `medium`, or `high`.
- Dates: use `today`, `tomorrow`, `YYYY-MM-DD`, or `none`.
- Reminders: use `HH:mm` when tied to the task date.
- Categories: choose from `categories`; if uncertain, state the assumption.
- Subtasks: maximum 20 items, maximum 80 characters each.
- Repeats: use `--repeat daily|weekly|monthly|yearly`, `--repeat-count`, and `--repeat-interval`.
- Tags: pass `--tags "标签名"`; the bridge writes `#标签名 ` into the title.
- Images: pass a local image path with `--image`. Do not combine images with repeated tasks.

## Audit And Delete

The bridge records AI-created tasks in the user's app data directory by default:

```text
%APPDATA%\todo-list-planner\ai-added-tasks.jsonl
```

Override with `TODO_LOG_PATH` when needed.

Find AI-created records:

```powershell
.\todo.ps1 records
.\todo.ps1 records --json
```

Delete incorrect AI-created tasks:

```powershell
.\todo.ps1 delete --record-id rec_...
.\todo.ps1 delete --operation-id op_...
.\todo.ps1 delete --last 1 --reason "用户确认删除最近一次 AI 添加"
```

Deletion also appends an audit event.

## MCP

Run the MCP server from this skill directory:

```powershell
node .\src\mcp-server.js
```

Useful MCP tools: `add_todo`, `list_ai_records`, `delete_ai_added`, `list_categories`, `list_tags`, `features`, `doctor`.
