# DSH hook-protocol 与两个桥接包：选择性观察

- 原始出处（一手，作者自述 + 实现）：`deepseek-ai/deepseek-harness` @ **`c291e7961a515f6d7af9304e7fd1d257929aef26`**（`0.1.5-rc.2`），
  本机钉住副本 `tmp/sources/dsh-c291e79.tar.gz`，解包在 `/data/qiwei/repos/omne-harness-lite/tmp/sources/extracted/dsh/`。下文路径相对该目录。
  - `packages/hooks/hook-protocol/src/{index,types,matcher,codec,merge,runner,events,detached,invariant}.ts`
  - `packages/hooks/hooks-claude-code/src/{config,index}.ts`、`packages/hooks/hooks-codex/src/{config,index}.ts` 与两者 `README.md`
  - 作者笔记：`.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md`、`.agents/notes/archived/feature/2026-06-30-hook-bridges.md`、
    `.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.md`、`.agents/notes/implemented/feature/2026-06-30-interception-extension-points.md`
- 立场：作者自述。「兼容到什么程度」的缺口清单来自作者自己的 README 与笔记；与今天的 Claude Code / Codex 对照的漂移由本轮对照 [claude-code.md](claude-code.md)、[codex.md](codex.md) 得出。
- 消费对象：[research.md](../research.md) 关于 DSH 的结论；[映射报告 §三](../reports/2026-09-23-hooks-to-positions.md#三dsh-hook-protocol-与两个桥接包)。

## 当前可消费观察

### 一、分层：原生插件是正路，桥接只是兼容适配

- 「native hooks are not a package」——原生 hook 就是订阅规范生命周期事件的普通 Cordis 插件；CC/Codex 桥接只是把外部 shell-hook 协议翻译到同一套 API 的翻译器（`interception-extension-points.md:9`）。
- 「a bridge is a compatibility adapter, not a power tool」（`hook-bridges.md:12`）。
- DSH 的规范拦截面（`interception-extension-points.md:15-31`）：`agent/session-start`（emit，不能阻断）、`agent/pre-step`（瀑布，`enter`/`reject`）、
  `tools/pre-execute`（瀑布，allow/deny/ask）、`ctx.tools.guard()`（只能 deny 或弃权）、`tools/execute`（**环绕**，重试/超时/度量）、
  `tools/post-execute`（瀑布，accept/block/replace/附加 context）、`agent/turn-stopping`（awaited 通知，靠 `agent.steer()` 续跑）、`subagent/start|end`（emit）。
  **压缩（PreCompact/PostCompact）、Notification、Codex PermissionRequest 不在这套拦截面里**（`interception-extension-points.md:50`）。

### 二、hook-protocol 库的对象模型

| 组件 | 做什么 | 依赖 | 位置 |
|---|---|---|---|
| `HookOutput` / `MatcherGroup` / `CommandHook` 类型 | 方言中立的结果；只有 `command` 形状能到 runner | 仅类型；`declare module '@deepseek-ai/dsh-session/types'` 扩 `SessionEventMap` | `types.ts:8-41、56-61、89-137` |
| matcher | `claude-code` 模式：纯 `[A-Za-z0-9_|]+` 精确匹配，其余正则；`codex` 模式：一律不锚定正则；非法正则运行时当不匹配、配置期报诊断 | 无 | `matcher.ts:18、37-65` |
| codec `parseHookOutput` | exit 2 → `decision:'block'`+stderr 为 reason；**只在 exit 0 时解析 JSON**；以 `{` 开头才尝试 JSON，坏 JSON 当纯文本；`hookEventName` 不符则丢弃事件专属字段 | 无 | `codec.ts:59-134` |
| merge `mergeHookOutputs` | `deny > ask > allow`；首个 `continue:false` 粘住；赢家档位的 reason 用空行拼接；context 与 systemMessage 按序累积；**与顺序无关** | 无 | `merge.ts:35-100` |
| runner `runHook` | 经 `ctx.shell`（`ShellExecutor`）跑命令：凭据清洗、进程组取消、超时、`AbortSignal`；执行器拒绝 → 无退出码的非阻断结果，**永不抛** | `@deepseek-ai/dsh-shell` | `runner.ts:67-106` |
| `hook/invoked` / `hook/result` 会话事件 | log-only（非 surface 事件）；结果记 decision（parsed / `stop` / `pass`）、退出码、≤500 字符 stderr 摘要、耗时 | `@deepseek-ai/dsh-session` | `events.ts:75-104`、`types.ts:19-39` |
| invariant 伴随插件 | `hook/*` 必须在开着的 turn 内、invoked/result 成对 | `@deepseek-ai/cordis`、`dsh-invariants`、`dsh-session` | `invariant.ts:31-122` |
| `createDetachedRuns` | emit 型 hook 的在途登记；dispose 时 abort 并排空 | 无 | `detached.ts:43-62` |

`package.json` 的 peerDependencies：`dsh-shell`、`dsh-invariants`、`dsh-session`、`cordis`。**matcher、codec、merge、detached 与 `HookOutput` 类型不依赖任何 DSH 运行时**；runner 依赖 shell 执行器接缝，events/invariant 依赖 DSH 的 Session 与 turn 结构。

### 三、两个桥接的转译规则

| | `dsh-hooks-claude-code` | `dsh-hooks-codex` |
|---|---|---|
| 支持的事件 | 7 个：SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop、SubagentStart、SubagentStop（`hooks-claude-code/src/config.ts:11-19`） | 5 个：PreToolUse、PostToolUse、SessionStart、UserPromptSubmit、Stop（`hooks-codex/src/config.ts:11`） |
| handler | 只跑 `command`；http/mcp_tool/prompt/agent 解析后跳过并警告（`config.ts:97-101`） | 只跑同步 `command`；`async:true` 与非 command 跳过（`config.ts:64-67`） |
| 同事件多个 hook | **串行**（`index.ts:151-184` 循环内 `await`），作者说明理由：让 `hook/*` 成对相邻、顺序确定，折叠本就与顺序无关（`hook-bridges.md:67-69`） | 同左（`index.ts:128-167`） |
| SessionStart | detached 运行，`additionalContext` → `agent.inject()`；可能赶不上首个请求（`index.ts:202-214`） | 同左，纯文本 stdout 也当 context（`index.ts:151-155、184-195`） |
| UserPromptSubmit → `agent/pre-step` | deny → `{kind:'reject'}`；只有 context 时先 `next()` 再把 context 并进 `enter`（`index.ts:218-234`） | 同左（`index.ts:197-221`） |
| PreToolUse → `tools/pre-execute` | deny → deny；**ask → ask**（经审批接缝，没有应答方就 fail-closed 为 deny，`hook-bridges.md:35`）；allow 不预批、`defer` 不支持、`additionalContext` 忽略（README:177） | 只有 deny（`index.ts:223-230`） |
| PostToolUse → `tools/post-execute` | deny → `block`+feedback；context 附加；`updatedToolOutput` 不支持、`tool_response` 压成文本（README:178） | 同左 |
| Stop → `agent/turn-stopping` | block → `agent.steer()` 注入一条用户消息续跑（`index.ts:269-276`） | 同左（`index.ts:259-269`） |
| SubagentStart/Stop | Start 注入子代理上下文；**Stop 只观察**；`agent_type` 恒为 `general-purpose`（`index.ts:280-303`） | 不支持 |
| 注入来源标记 | 所有 context 都是 `source:{kind:'plugin', plugin:'hooks-claude-code'}` 的 `user/message`（`index.ts:86、191-195`；`hook-bridges.md:37-39`） | 同左 |
| payload 失真 | `transcript_path` 恒 `''`（`index.ts:320-329`）；`stop_hook_active` 恒 `false`（`:343-345`） | `transcript_path` 恒 `null`、`permission_mode` 恒 `'default'`（`index.ts:290-301`）；**`tool_input` 只剩 `{command}`**（`:317-327`） |

### 四、作者自认的未覆盖与延期

- `updatedInput`：**解析、记日志、告警，不生效**（`types.ts:131-136`；`hooks-claude-code/src/index.ts:174-176`）。理由见 `pre-tool-input-rewrite.md:11-19`：执行前的参数有三个读者——
  `assistant/message`（模型历史）、`tool/call`（审计）、界面呈现——只改执行不改另两个，会出现「UI 显示一条命令、实际跑的是另一条」；
  提案要求改写成为「pre-identity consistency transaction」，三处原子一致、`tool/call` 同时留原参数（`:21-29`）；
  未决问题含「改写 assistant 消息里的 tool-call 块，重放时会不会被某些提供方拒收」（`:45-50`）。状态 **proposed**。
  笔记说 loop 分派处有 `TODO(pre-tool-input-rewrite)` 锚点（`:35`），**本 SHA 全仓 grep 未命中该锚点**。
- `continue:false`：merge 折叠进 `stop`，但**没有任何桥接执行它**——拦截面没有「硬停整个 run」的原语（`hook-bridges.md:63`；`index.ts:188`）。
- Stop 循环保护：两边都恒报 `stop_hook_active:false`，无 8 次上限（`hook-bridges.md:62`）。
- 配置发现：只读一个进程级 `configPath`；多层优先级、项目本地发现、信任/哈希模型都没实现（`hook-bridges.md:64`）。
- 未支持事件：CC README 写「23 of Claude Code's current 30」（`hooks-claude-code/README.md:174`）；Codex README 写「5 of Codex's current 10」（`hooks-codex/README.md:170`）。

### 五、与今天两家宿主的漂移（本轮对照得出）

- CC 事件数：DSH 基线 30，2026-09-23 线上文档 33（多了 `DirectoryAdded`、`PreModelSwitch`、`PostModelSwitch`）。Codex：DSH 基线 10，`5c5308f` 源码 12（多了 `SessionEnd`、`Interrupt`）。
- CC 精确匹配字符集：DSH `CLAUDE_LITERAL = /^[A-Za-z0-9_|]+$/`（`matcher.ts:18`）；CC 现行规则把 `-`、空格、`,` 也算精确集（2.1.191/2.1.195 起，claude-code.md「二」）。
  于是 `code-reviewer` 这类 matcher 在 DSH 里按不锚定正则跑、会同时命中 `senior-code-reviewer`——正是 CC 旧版行为。
- CC 现在**所有退出码上都读 JSON**、坏 JSON 报非阻断错误且不当上下文（v2.1.248 起）；DSH codec 只在 exit 0 解析、坏 JSON 当纯文本。
- CC PreToolUse 优先级是 `deny > defer > ask > allow`；DSH merge 没有 `defer` 档。
- Codex 现行 `tool_input` 对 MCP/本地 function 工具是完整参数（codex.md「三」），DSH Codex 桥只给 `{command}`。

## 局限

- 只读了 hook 相关包与笔记，没有跑 DSH 的测试；「串行执行与参考实现结果一致」是作者的论证，本轮未复现。
- 桥接对 DSH agent loop 的耦合只按 import 与事件名判断（两个桥的 peerDependencies：`cordis`、`dsh-agent`、`dsh-hook-protocol`、`dsh-llm`、`dsh-session`、`dsh-session-projection`、`dsh-tools`，CC 桥另加 `dsh-subagent`），未逐一读 `dsh-agent`/`dsh-tools` 的实现。
