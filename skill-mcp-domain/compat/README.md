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

## 2026-11-04 更正：SDK 钉回 2.3.1

978624857 把 SDK 提到 2.4.0，越过了已接受的 RFC-0001 r4（client 与 server 各 2.3.1，node 适配 2.1.1）。28ca6aaf8 改回 2.3.1，参考服务端的传递依赖用 workspace overrides 钉住（node 2.1.1、server-legacy 2.3.1）。官方 SDK 2.3.1 客户端重跑六个目标：server-everything 22、server-filesystem 14、mcp-server-fetch 1（都是 2026-07-28），DeepWiki 3、Context7 2（2026-07-28），Microsoft Learn 3（2025-06-18）。结论不变。

## 2026-11-05 换机重跑与本地 HTTP 目标

换机后在本机（接手机器）用当前 catalog 的 SDK 2.4.0 重跑。Python 参考服务端先执行 `uv sync --group mcp-fixtures`。

| 日期 | 客户端 | 目标 | 传输 | 修订 | 工具数 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-05 | 官方 SDK 2.4.0（对照） | server-everything 2.1.0 | stdio | 2026-07-28 | 22 | 通 |
| 2026-11-05 | 同上 | server-filesystem 2.1.0 | stdio | 2026-07-28 | 14 | 通 |
| 2026-11-05 | 同上 | mcp-server-fetch 2026.10.28（Python） | stdio | 2026-07-28 | 1 | 通 |
| 2026-11-05 | 同上 | DeepWiki | Streamable HTTP | 2026-07-28 | 3 | 通 |
| 2026-11-05 | 同上 | Context7 | Streamable HTTP | 2026-07-28 | 2 | 通 |
| 2026-11-05 | 同上 | Microsoft Learn | Streamable HTTP | 2025-06-18（旧修订） | 3 | 通 |
| 2026-11-05 | 同上 | server-everything 2.1.0 `streamableHttp` 模式（本机端口） | Streamable HTTP | 2026-07-28 | 22 | 通，`echo` 调用成功 |
| 2026-11-05 | 同上，`SSEClientTransport` | server-everything 2.1.0 `sse` 模式（本机端口） | 旧 HTTP+SSE | 2025-11-25（旧修订） | 16 | 通，`echo` 调用成功 |

最后两行是新增目标。三个远程目标都不用旧 HTTP+SSE 传输，所以旧传输只有本机目标能覆盖。本机 HTTP 目标不依赖外网，适合进成员测试。远程三个仍按出口判据跑，结论逐个记录。

## 2026-11-06 对照矩阵：官方 SDK 客户端与 createMcp（w3-mcp-e2e）

脚本 `mcp-compat-matrix.mjs`，同一次运行里对八行各跑两个客户端：官方 SDK 客户端与 `createMcp` 加 `createLocalTransportFactory`。每个客户端做发现、列工具、调一个只读工具三步。日期 2026-11-06，实现的提交号 3289bee2f（父分支 `PanQiWei/skill-mcp`，调用口与宿主口已合入）。

SDK client: @modelcontextprotocol/client 2.4.0; implementation: 3289bee2f; node v26.12.0
Excluded: GitHub MCP https://api.githubcopilot.com/mcp/ (OAuth; not in scope).

| row | target | transport | revision (sdk / ours) | tools (sdk / ours), names equal | call | conclusion (sdk / ours) | verdict | date -u (remote) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | server-everything 2.1.0 | stdio | 2026-07-28 / 2026-07-28 | 22 / 22, equal | `echo` {"message":"hi"} | complete / complete | agree |  |
| 2 | server-filesystem 2.1.0 | stdio | 2026-07-28 / 2026-07-28 | 14 / 14, equal | `read_text_file` {"path":"/tmp/omne-compat-fs-Lkuvfu/a.txt"} | complete / complete | agree |  |
| 3 | mcp-server-fetch 2026.10.28 (Python) | stdio | 2026-07-28 / 2026-07-28 | 1 / 1, equal | `fetch` {"url":"http://127.0.0.1:48705/page"} | complete / complete | agree |  |
| 4 | DeepWiki https://mcp.deepwiki.com/mcp | Streamable HTTP | 2026-07-28 / 2026-07-28 | 3 / 3, equal | `read_wiki_structure` {"repoName":"modelcontextprotocol/typescript-sdk"} | complete / complete | agree | Fri 06 Nov 2026 09:57:04 AM UTC |
| 5 | Context7 https://mcp.context7.com/mcp | Streamable HTTP | 2026-07-28 / 2026-07-28 | 2 / 2, equal | `resolve-library-id` {"libraryName":"React","query":"hooks"} | complete / complete | agree | Fri 06 Nov 2026 09:57:05 AM UTC |
| 6 | Microsoft Learn https://learn.microsoft.com/api/mcp | Streamable HTTP | 2025-06-18 / 2025-06-18 | 3 / 3, equal | `microsoft_docs_search` {"query":"azure functions timer trigger"} | complete / complete | agree | Fri 06 Nov 2026 09:57:07 AM UTC |
| 7 | server-everything 2.1.0 streamableHttp (local port) | Streamable HTTP | 2026-07-28 / 2026-07-28 | 22 / 22, equal | `echo` {"message":"hi"} | complete / complete | agree |  |
| 8 | server-everything 2.1.0 sse (local port) | legacy HTTP+SSE | 2025-11-25 / 2025-11-25 | 16 / 16, equal | `echo` {"message":"hi"} | complete / complete | agree |  |

结论：八行两边的修订、工具数、排序后的工具名与调用结论都相同，退出码 0。Microsoft Learn 协商旧修订 2025-06-18，两边相同。GitHub MCP 要 OAuth，排除。

运行记录：2026-11-06 10:39:10 至 10:39:26 UTC 重跑 `node mcp-compat-matrix.mjs`（在本目录运行），退出码 0。SDK 客户端 `@modelcontextprotocol/client` 2.4.0，实现的提交号 `3289bee2f`。八行的修订、工具数、工具名与调用结论与上表相同，全部 agree；三个远程目标的 `date -u` 是 10:39:14 至 10:39:16。输出文件 `delegate/handbacks/w3-mcp-e2e-fix1-logs/matrix.out`，sha256 前 16 位 `8628b91ca5013079`。
