# 生态兼容验收（负责人 2026-11-04 要求）

问题：两个领域实现后，能不能加载、请求现成的社区资产——Claude 官方 Skill、Codex 官方 Skill、社区知名 Skill（pstack、Matt）、本机已装的 Skill、各厂商的 MCP 服务。

每波 reduce 跑一次，结果追加到下表。语料钉版本；探针脚本在本目录。

## Skill（`skill-compat.mjs`：`inspect` 加载，再经 `SkillAccess` 读正文、列条目、读第一个资源）

| 日期 | 实现 | 语料（钉版本） | 包 | 加载 | 请求 | 失败 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-04 | 父分支 05f281394 | Claude 官方 `anthropics/skills` @ ca45fc4 | 20 | 18 | 18 | `claude-api` 说明 1077 字符超 1024；`template` name 与目录名不同 |
| 2026-11-04 | 同上 | Codex 官方 `openai/skills` @ 49f948f | 44 | 44 | 44 | — |
| 2026-11-04 | 同上 | pstack 0.9.128 | 67 | 67 | 67 | — |
| 2026-11-04 | 同上 | Matt 1.3.2 | 39 | 37 | 37 | `pr` 的 `metadata` 是嵌套对象（规范写字符串映射）；`software-factory` 说明里有未加引号的 `: `，严格 YAML 解析失败 |
| 2026-11-04 | 同上 | 本机 `~/.claude/skills` | 15 | 14 | 14 | `session-start-hook` name 与目录名不同 |
| 2026-11-04 | 同上 | 本仓库项目技能 `.claude/skills` | 21 | 21 | 21 | — |
| 合计 | | | 197 | 191 | 191 | 6 个，全部是我们比主流宿主严 |

出口判据：上表六类语料加载率 100%（`w3-skill-compat` 之后）。真正读不了的包（缺 `SKILL.md`、无头部、缺 name、路径越界）仍拒绝，不算兼容失败。

## MCP（`mcp-http-baseline.mjs`：官方 SDK 客户端作对照基线；我们的实现在 B 段后跑同一组目标）

| 日期 | 客户端 | 目标 | 修订 | 工具数 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-04 | 官方 SDK 2.3.1（对照） | DeepWiki `https://mcp.deepwiki.com/mcp` | 2026-07-28 | 3 | 通 |
| 2026-11-04 | 同上 | Context7 `https://mcp.context7.com/mcp` | 2026-07-28 | 2 | 通 |
| 2026-11-04 | 同上 | Microsoft Learn `https://learn.microsoft.com/api/mcp` | 2025-06-18（旧修订） | 3 | 通 |
| 2026-11-04 | — | GitHub `https://api.githubcopilot.com/mcp/` | — | — | 401，要 OAuth（归凭据提供者） |

| 2026-11-04 | 官方 SDK 2.4.0（对照，`mcp-stdio-baseline.mjs`） | `@modelcontextprotocol/server-everything` 2.1.0（stdio，锁文件安装） | 2026-07-28 | 22 | 通 |
| 2026-11-04 | 同上 | `@modelcontextprotocol/server-filesystem` 2.1.0（stdio，锁文件安装） | 2026-07-28 | 14 | 通 |
| 2026-11-04 | 同上 | `mcp-server-fetch` 2026.10.28（stdio，Python，uv 组 `mcp-fixtures`） | 2026-07-28 | 1 | 通 |
| 2026-11-04 | 官方 SDK 2.4.0（对照） | 上面三个 HTTP 目标重跑 | 同上 | 同上 | 通 |

参考服务端是仓库的测试依赖（978624857，负责人 2026-11-04 决定）：npm 两个在 `mcp-host-local` 的 devDependencies，Python 一个在根 `pyproject.toml` 的非默认组 `mcp-fixtures`（`uv sync --group mcp-fixtures`）。SDK 同时从 2.3.1 钉到 2.4.0（参考服务端的依赖要求）；W2 探路结论在 2.3.1 上得出，`w3-mcp-host` 在 2.4.0 上用测试重新确认。

出口判据（`w3-mcp-e2e`）：我们的 `createMcp` + 本地传输在上表每个可达目标上完成「发现 → 列工具 → 调用一个只读工具」，结论与对照客户端一致；新旧两种修订都覆盖。
