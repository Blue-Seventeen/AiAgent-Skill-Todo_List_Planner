# Todo List Planner Skill

中文 | [English](README_EN.md)

`Todo List Planner` 是一个面向 Codex 的本地 Skill，用于把每天收到的信息、消息、笔记、截图描述或临时想法规划成可执行任务，并同步到本机 Windows 应用 [Todo清单](https://todo.evestudio.cn/)。

项目名称保留为 `todo-list-planner`。仓库名称可以使用更大的项目命名，例如 `Hack3rX_2026_008_AiSkills_todo-list-planner`。

## 项目结构

```text
.
├── .git/
├── .gitignore
├── docs/
│   └── images/
│       └── todo-live-example.svg
├── README.md
├── README_EN.md
└── todo-list-planner/
    ├── SKILL.md
    ├── agents/
    │   └── openai.yaml
    ├── package.json
    ├── todo.ps1
    ├── Start-TodoDebug.ps1
    ├── mcp.example.json
    └── src/
```

`todo-list-planner/` 是 Skill 本体。用户下载或安装时只需要使用这个目录。

## 能力

- 从自然语言信息中规划 Todo清单任务。
- 通过 live 模式调用 Todo清单运行时写入任务，不需要直接改数据库或重启应用。
- 支持任务标题、描述、日期、提醒、难度、分类、子任务、自定义重复、图片附件和 `#` 标签。
- 自动记录 AI 添加的任务，便于用户发现不合适时按记录删除。
- 提供 CLI 和 MCP 两种集成方式。

## 环境要求

- Windows
- Node.js 20+
- PowerShell
- 已安装 [Todo清单](https://todo.evestudio.cn/)
- 本机 Todo清单可正常打开

## 安装为 Skill

将 `todo-list-planner/` 放到 Codex Skills 目录，例如：

```powershell
Copy-Item -Recurse .\todo-list-planner "$env:USERPROFILE\.codex\skills\todo-list-planner"
```

如果你使用其他 Skills 根目录，只需要保持目录名为 `todo-list-planner` 即可。

## 快速开始

进入 Skill 目录：

```powershell
cd .\todo-list-planner
```

启动 Todo清单 live 桥：

```powershell
.\Start-TodoDebug.ps1 -Restart
```

检查运行状态：

```powershell
.\todo.ps1 doctor --port 9222
```

添加一个任务：

```powershell
.\todo.ps1 add --mode live --title "测试任务" --desc "这是一个测试任务" --date today --remind 10:00 --difficulty medium --category "工作任务" --tags "AI整理" --subtasks "步骤1,步骤2"
```

## 使用效果示例

下面是通过该 Skill 在 Todo清单中创建图片附件测试日程后的效果：

![Todo List Planner 使用效果示例](docs/images/todo-live-example.svg)

示例任务包含标题、描述、10:00 提醒、图片附件、`#AI测试` 标签和 3 个子任务。

## 常用命令

```powershell
.\todo.ps1 categories --json
.\todo.ps1 tags --json
.\todo.ps1 features
.\todo.ps1 records --json
.\todo.ps1 delete --record-id rec_...
```

说明：

- `categories` 读取 Todo清单中的用户分类。
- `tags` 读取 Todo清单中的 `#` 标签。
- `features` 查看当前桥接支持的任务字段。
- `records` 查看 AI 添加记录。
- `delete` 按 `recordId`、`operationId`、`taskId` 或 `--last 1` 删除 AI 添加错的任务。

## MCP 配置

Skill 内提供 `mcp.example.json`。使用时将 `<absolute-path-to-this-skill>` 改成你本机 `todo-list-planner` 的绝对路径：

```json
{
  "mcpServers": {
    "todo-list-planner": {
      "command": "node",
      "args": [
        "<absolute-path-to-this-skill>\\src\\mcp-server.js"
      ]
    }
  }
}
```

MCP 工具包括：

- `add_todo`
- `list_ai_records`
- `delete_ai_added`
- `list_categories`
- `list_tags`
- `features`
- `doctor`

## 数据与隐私

本项目不会在仓库中携带用户 Todo 数据或审计日志。运行时日志默认写入：

```text
%APPDATA%\todo-list-planner\ai-added-tasks.jsonl
```

可以通过 `TODO_LOG_PATH` 覆盖日志路径。

注意：

- live 模式会读取本机正在运行的 Todo清单状态，用于分类、标签、任务写入和删除。
- `db` 模式只是兜底能力，默认不推荐使用；如需使用，需要显式设置 `TODO_EXE` 和 `DB_ENCRYPTION_KEY`。
- 图片附件上传依赖 Todo清单应用自身登录状态和上传流程。
- 图片附件不与重复任务组合使用。

## 交流学习

欢迎加入交流学习渠道（后续我会持续更新内容）：

<p align="center">
  <img src="https://raw.githubusercontent.com/Blue-Seventeen/MarkTrans/main/doc/images/COMMUNITY_QQ_1.jpg" alt="QQ交流群二维码" width="220" />
  <img src="https://raw.githubusercontent.com/Blue-Seventeen/MarkTrans/main/doc/images/COMMUNITY_WECHAT_CHANNEL_1.jpg" alt="微信公众号二维码" width="220" />
</p>

以上“交流学习”内容与图片来自 [Blue-Seventeen/MarkTrans](https://github.com/Blue-Seventeen/MarkTrans)。
