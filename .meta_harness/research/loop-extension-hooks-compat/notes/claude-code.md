# Claude Code hooks：选择性观察

- 原始出处（一手，厂商自述）：官方 hooks 参考页 `https://code.claude.com/docs/en/hooks.md`，**2026-09-23 抓取**，
  原样字节随包存于 [`../sources/claude-code-hooks-2026-09-23.txt`](../sources/claude-code-hooks-2026-09-23.txt)
  （sha256 `dc59d7c4…d5422`，校验见 [`../sources/SHA256SUMS`](../sources/SHA256SUMS)，来历见 [`../sources/provenance.json`](../sources/provenance.json)）。
  下文「doc:行号」都指这份快照。
- 本机版本：`claude --version` = **2.1.280**。快照页里出现的最高版本号是 **v2.1.274**；
  页面本身不标注对应哪个发布，**「文档描述的就是 2.1.280 的行为」是假设，未逐条实测**。
- 一手实例（本机只读）：
  - `/data/qiwei/.claude/plugins/cache/cc-master/cc-master/0.21.1/hooks/hooks.json`
  - `/data/qiwei/.claude/plugins/cache/openai-codex/codex/1.0.5/hooks/hooks.json`
  - `/data/qiwei/.claude/plugins/marketplaces/claude-plugins-official/plugins/{claude-security,explanatory-output-style,hookify,learning-output-style,ralph-loop,security-guidance}/hooks/hooks.json`
  - 本机 transcript 里 hook 留下的记录：`/data/qiwei/.claude/projects/-data-qiwei-repos-omne-next/913a4b5c-732e-45fa-ad5e-d715556f2fd0.jsonl`（`version` 2.1.247）
- 二手线索（**只作线索，待核实**）：`/data/qiwei/repos/cc-master/design_docs/research/claude-code-hooks-reference.md`（2026-06-11 WebFetch 整理，早于 2.1.280，本轮未引用其任何结论）。
- 消费对象：[research.md](../research.md) 全部关于 Claude Code 的结论；[映射报告](../reports/2026-09-23-hooks-to-positions.md) 的 Claude Code 列。

## 当前可消费观察

### 一、事件清单（33 个）

doc:35-69 的总表列出 **33 个事件**：
`SessionStart` `Setup` `UserPromptSubmit` `UserPromptExpansion` `PreToolUse` `PermissionRequest` `PermissionDenied`
`PostToolUse` `PostToolUseFailure` `PostToolBatch` `Notification` `MessageDisplay` `SubagentStart` `SubagentStop`
`TaskCreated` `TaskCompleted` `Stop` `StopFailure` `TeammateIdle` `InstructionsLoaded` `ConfigChange` `CwdChanged`
`DirectoryAdded` `FileChanged` `WorktreeCreate` `WorktreeRemove` `PreCompact` `PostCompact` `PreModelSwitch`
`PostModelSwitch` `Elicitation` `ElicitationResult` `SessionEnd`。

文档自己把它们分成三种节奏（doc:19-23）：每会话（SessionStart/End）、每轮（UserPromptSubmit/Stop/StopFailure）、
**每次工具调用**（PreToolUse/PostToolUse）。其余多为「独立的异步事件」（doc:27 的图注）。

逐事件的触发时机、输入、输出、能否阻断、能否注入、支持的 handler 类型与匹配器，全表在
[映射报告 §一](../reports/2026-09-23-hooks-to-positions.md#一claude-code-2128033-个事件逐项)。这里只记跨事件的机制。

### 二、配置与 handler

- 三层：事件 → matcher 组 → handler（doc:237-241）。来源：user/project/local settings、managed policy、plugin `hooks/hooks.json`、
  skill 与 subagent frontmatter（doc:253-261）；**各层合并不覆盖**（doc:278）。
- **五种 handler**：`command`、`http`、`mcp_tool`、`prompt`、`agent`（doc:408-414）。
  各事件支持的类型不同：12 个事件五种全支持；`PermissionRequest` 不支持 `agent`；18 个只支持 command/http/mcp_tool；
  `SessionStart`/`Setup` 只支持 command 与 mcp_tool（doc:3488-3530）。
- `prompt` handler 把输入发给模型（默认 Haiku）返回 `{ok, reason, impossible}`；`agent` handler 起一个最多 50 轮的子代理再返回同样的结构（doc:3571-3602、3633-3642），**标注为 experimental**（doc:3627）。
- **同一事件的所有匹配 handler 并行跑**（doc:416），不是依次传递。
- 匹配器：`*`/空/省略全匹配；只含字母数字 `_` `-` 空格 `,` `|` 时按精确字符串（列表）匹配，其余按**不锚定**的 JS 正则（doc:287-301）；
  连字符进入精确集要求 v2.1.195+，逗号分隔要求 v2.1.191+（doc:297-299）。每个事件匹配的字段不同，部分事件不支持 matcher（doc:307-327）。
  工具事件另有 `if` 字段，用权限规则语法同时匹配工具名与参数（doc:429、438-450），文档自承「best-effort」，硬性放行/拒绝应走权限系统（doc:450）。
- 超时默认：command/http/mcp_tool 600 s，prompt 30 s，agent 60 s；UserPromptSubmit/PreModelSwitch/PostModelSwitch 降到 30 s，MessageDisplay 10 s，SessionEnd 共用 1.5 s 预算（doc:430）。
- 信任：交互会话里，接受工作区信任之前**所有 settings 文件里的 hook 都不跑**；`-p`/SDK 会话不弹对话框、视为已信任（doc:3782-3789）。

### 三、输出与退出码

- 退出码 0 = 成功；**退出码 2 = 阻断**，在可阻断事件上即使 JSON 说 allow 也阻断（doc:824-830）；
  **其他退出码不阻断**，只是非阻断错误（doc:848-865），文档专门警告 exit 1 不阻断、策略 hook 要用 exit 2（doc:863-865）。
- **JSON 在所有退出码上都会被读**，不止 exit 0（doc:802、852-857）。
- 超时：command/http/mcp_tool 超时即取消、输出丢弃；在 **PreToolUse 上超时不阻断**，调用照常走权限流程（doc:867-874）；
  例外是 PreModelSwitch 超时=阻断（doc:871、3269）、Agent SDK 回调 hook 在 PreToolUse/UserPromptSubmit 超时=阻断（doc:874、1351、1599）。
- 起不来（路径不存在）同样落进非阻断桶：「a mistyped path in `settings.json` leaves the gate silently disabled」（doc:861）。
- 三类字段（doc:947-951）：通用字段（`continue`、`stopReason`、`suppressOutput`、`systemMessage`、`terminalSequence`，doc:953-959）；
  顶层 `decision`/`reason`；`hookSpecificOutput`（带 `hookEventName`）。
  `continue:false`「Claude stops processing entirely」，**优先于任何事件专属决定**（doc:955）。
- `additionalContext` 被包成 system reminder 插在 hook 触发处（doc:1004）；不同事件插的位置不同（doc:1017-1023）；多个 hook 的值全部送达（doc:1025）；
  单值超过 10,000 字符落盘、只给路径加 2,000 字符预览（doc:941-945、1027）。
- **注入文本存进 transcript；resume 时重放存下的文本而不重跑 hook**（doc:1039）。本机实测印证形态：transcript 里有
  `{"type":"attachment","attachment":{"type":"hook_additional_context","content":[…],"hookName":"PostToolUse:Edit","toolUseID":"toolu_…","hookEvent":"PostToolUse"}}`
  （上述 omne-next transcript，`version` 2.1.247）；本机全部 transcript 共见 `hook_system_message` 5、`hook_success` 3、`hook_additional_context` 2、`hook_non_blocking_error` 1 条。
- 决策控制总表（doc:1045-1060）与「能改写内容的事件」（doc:1062-1069）：`PreToolUse.updatedInput` 替换工具参数；
  `PermissionRequest.decision.updatedInput`；`PostToolUse.updatedToolOutput` 替换结果；**`UserPromptSubmit` 不能改写 prompt，只能注入**。

### 四、与人机协作相关的输出

- **PreToolUse**（doc:1808-1849）：`permissionDecision` = `allow`（跳过权限提示）/`deny`/`ask`（弹提示让用户确认）/`defer`；
  多个 hook 冲突时 **`deny` > `defer` > `ask` > `allow`**（doc:1819）；deny/ask 规则无论 hook 返回什么都照样评估（doc:1814）。
  `ask` 弹出的是标准权限提示，带来源标签 `[settings]`/`[plugin:<name>]`/`[skill]`（doc:1823），在 auto 模式下也强制弹（doc:1825）。
  `updatedInput` 与 `ask` 合用时把改写后的参数给用户看（doc:1816）；权限规则按**改写后**的参数评估（doc:1816）。
- **`defer`**（doc:1851-1889）：只在 `-p` 非交互模式生效，交互会话里记警告并忽略；工具不执行、进程以 `stop_reason: "tool_deferred"` 退出、
  挂起的调用留在 transcript；外部调用方收集答案后 `claude -p --resume`，同一调用**再次触发 PreToolUse**，hook 以 `allow`+`updatedInput` 放行。
  **没有超时或重试上限**（doc:1879）；**一轮里有多个工具调用时 `defer` 被忽略**（doc:1881）。
- **AskUserQuestion**：hook 可用 `allow`+`updatedInput` 带 `answers` 代答（doc:1787-1794、1843）。
- **PermissionRequest**（doc:1891-1989）：只在「即将向你要权限」时触发（PreToolUse 每次调用都触发，doc:1908）；
  `decision.behavior` allow/deny，allow 可带 `updatedInput` 与 `updatedPermissions`（增删规则、改权限模式、增删工作目录，可写进 `session`/`localSettings`/`projectSettings`/`userSettings`，doc:1961-1989）；
  deny 可带 `interrupt:true`「stops Claude」（doc:1943）；**exit 2 在此事件不起作用**（doc:1945）；
  **无法弹提示的会话（如 `-p` 下的后台子代理）里若没有 hook 给出决定就拒绝**（doc:1893）。
- **PermissionDenied**（doc:2217-2263）：只在 auto 模式拒绝时触发；`retry:true` 只是往对话里加一条「可以重试」，**不撤销拒绝**（doc:2261）。
- **Notification**（doc:2265-2357）：`permission_prompt` 在提示挂了约 6 秒后才触发（doc:2273、2297）；不能阻断或修改（doc:2357）。
- **Elicitation / ElicitationResult**（doc:3371-3440）：MCP 服务器在工具调用中途要用户输入时触发；hook 可 `accept`+`content` 代填表单跳过对话框。

### 五、Stop 与循环保护

- `Stop` 在主代理「结束回复」时触发，**用户中断不触发，API 错误走 `StopFailure`**（doc:2542-2546）。
- `decision:"block"` + `reason` 阻止停下，reason 作为继续的说明（doc:2614-2628）；`hookSpecificOutput.additionalContext` 也让对话继续但标为反馈而非错误（doc:2630-2642）。
- 输入带 `stop_hook_active`；**连续 8 次 block 后宿主强制结束这一轮**（doc:2554）。
- `SubagentStop` 同形；block 时 reason 作为子代理的下一条指令（doc:2430）。
- `StopFailure` 的输出与退出码一律忽略（除 `terminalSequence`），无决策控制（doc:2644-2670）。
- prompt handler 在 Stop 上 `ok:false` 把 reason 喂回；同时 `impossible:true` 则放行停下（doc:3585-3591）。

### 六、异步

- `async:true` 立即返回；进程结束后 `additionalContext`/`systemMessage` **下一轮**送达，空闲时等到用户下一次交互；`asyncRewake` 退出码 2 立即唤醒（doc:3706-3772）。
  异步 hook 的 `classifierContext` 被忽略，因为它到达时工具结果已记下（doc:2090）。

### 七、本机插件实例

全部是 `type: command`；没有一个用 http/mcp_tool/prompt/agent。事件分布：
cc-master 0.21.1 用 `UserPromptSubmit`、`Stop`（4 组）、`SessionStart`（matcher `startup|resume|compact`）、`PostToolBatch`、`PostToolUse`、`PreToolUse`；
openai-codex 1.0.5 用 `SessionStart`、`SessionEnd`、`Stop`（timeout 900 s 的 review gate）；
官方市场六个插件用 `UserPromptExpansion`、`PostToolUse`、`PostToolUseFailure`、`PreToolUse`、`Stop`、`SubagentStop`、`UserPromptSubmit`、`SessionStart`。
**这只说明本机样本的用法分布，不代表生态整体。**

## 局限

- 这份快照只证明 2026-09-23 线上页的表述；**未对 2.1.280 做逐事件探针实测**，行为与文档可能分叉。
- 没有 Claude Code 源码；多个 hook 同时返回 `updatedInput`（PreToolUse）时谁胜出，**文档未说**，本轮未找到。
- `updatedInput` 改写是否在 transcript 留下「原参数 → 生效参数」的记录，**本轮未核实**（本机 transcript 未见相关样本）。
- 一批并行工具调用的 PreToolUse 是否全部判完才开始执行任何一个，**文档未说**。
