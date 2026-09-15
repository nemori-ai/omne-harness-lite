# Claude Code：原生定义与运行面

核对日期：2026-09-12。原生字段和版本例外以[官方 subagents 文档](https://code.claude.com/docs/en/sub-agents)为准。以下是编写时需要的取舍，不是完整字段规范副本。

## 文件与配置

项目角色使用 `.claude/agents/<name>.md`，个人角色使用 `~/.claude/agents/`。
文件第一行开始 YAML frontmatter；其中必填 `name` 和 `description`，随后 Markdown
正文成为该角色的系统提示词。`description` 应明确何时分派到这个职责。

| 配置 | 编写时的判断 |
|---|---|
| `model`、`effort` | 核对目标模型及支持值；`inherit` 不固定某个模型 |
| `tools`、`disallowedTools` | 选择实际需要的工具；包括文件、shell、检索与沟通渠道 |
| `permissionMode` | 不默认放宽权限；允许写设计文档的角色不等同于只读 plan 模式 |
| `skills` | 启动时注入所列 skill 的完整内容，按需选择而非全量预加载 |
| `mcpServers` | 真实可配置的外部能力；与 Codex 字段单独适配 |
| `maxTurns` | 执行上限，达到上限不是成功完成的证据 |
| `memory`、`hooks`、`background`、`isolation` | 有实际需要时核对语义与版本，不作为角色标配 |

`skills` 预加载与 `Skill` 工具调用不同；未预加载的 skill 可在工具与环境支持时
按需访问。不要假设一段正文写了 skill 名称，其内容就已注入。

## 上下文与任务交接

普通自定义 subagent 有独立上下文；自身提示、派发任务和项目 CLAUDE.md 会进入
其上下文，但主会话历史、此前读过的文件和调用过的 skills 不自动跟随。
fork 有不同继承行为，不把它外推给普通自定义角色。详见
[启动时加载内容](https://code.claude.com/docs/en/sub-agents#what-loads-at-startup)。

按实际工作区核对 CLAUDE.md 与 AGENTS.md 的引用和继承关系，不预设它们存在或互相引用。任务交接仍需带上本次目标、版本、
允许路径、规格/计划、未决问题和已授权决定，不能只说“按刚才讨论继续”。

## 权限与生效

工具限制不是按路径的写保护；开放 shell 也可能获得写能力。`disallowedTools`
不能被当成任意细粒度路径或命令策略。精确控制需要核对宿主真实权限配置。
需隔离工作树时核对任务或执行仓库明确采用的容器与拓扑，不能直接假设原生 `isolation: worktree`
会落到约定位置。

当前文档说明既存 agent 目录的文件变化可被监听，但首次创建目录等情形仍可能
需要重启。核对目标版本的发现机制；文件写入成功不代表当前会话已加载，更不代表
模型可用或实际执行成功。调用模型的探测与正式发布均保留原任务授权边界。

本页提供权限解释和任务交接判断；精确字段、默认值和版本
例外继续由官方原文拥有，不在这里复制不断增长的手册。
