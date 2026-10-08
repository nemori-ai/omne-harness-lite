# 兼容方言的完整映射

仅保留已限定方言快照下的翻译规则；不声称当前上游或已实现。源版本、未核语义及工作区发现沿[当前设计](../design.md)。事件不存在或不能映射的明定分支返回no_mapping；其他未核事实保持待核，不据此扩大拒绝范围。

## Claude Code 映射表

采用限定：Claude Code 2.1.280；Codex固定修订5c5308fc。Codex沿已采用与Claude Code同构的读取规则；精确原生结构/解释器尚未核实，保留此前采用限定，不把所有command改成no_mapping，也不声明最新上游事实。

| 事件 | 位置（维度） | 情形 · 情形取值 | 上限 | 阻断（含退出码 2） | 停止（`continue: false`） | 其余输出 | 报告里另带  |
|---|---|---|---|---|---|---|--- |
| `UserPromptSubmit` | `before_persist_message` | `producer = user` · 不读 matcher | 可否决 | `veto`，固定理由 | `veto`，固定理由（这一位置没有 `stop`） | `additionalContext`／纯文本 stdout → `inject`；**不能改写 prompt** | `block_reason_not_recorded`、`single_output_per_pass`  |
| `PreToolUse` | `before_action` | 情形无 · 工具名 `subject.call.tool` | 可否决 | `permissionDecision: deny` 或退出码 2 → `veto` | `stop { cancelled }` | `ask` → ask与回放（见当前设计）；`defer` → 报错；`updatedInput` → `rewrite`；`additionalContext` → `inject`；`allow` → `observed` | `allow_as_no_opinion`、`ask_uses_admission_options`、`defer_not_supported`、`single_output_per_pass`  |
| `PermissionRequest` | `before_action` | 情形无 · 工具名 | 可否决 | `decision.behavior: deny` → `veto`（理由取 `message`）；**退出码 2 不起作用 → `observed`** | `stop { cancelled }`；`deny` 且 `interrupt: true` 同 | `allow` → `observed`，带 `updatedInput` 则 `rewrite`；`updatedPermissions`／改模式 → 不生效 | `allow_as_no_opinion`、`runs_on_every_matching_call`、`asset_changing_output_ignored`  |
| `PostToolUse` | `after_action`（`each`） | `outcome` 为成功 · 工具名，从日志取那次调用 | 可改写 | 这一位置没有否决：`decision: block` 的 `reason` → `inject`；退出码 2 的 stderr → `inject` | `stop { cancelled }` → **越档**（可改写档不许 `stop`），按报错处置 | `updatedToolOutput` → `rewrite`（改 `result`）；`additionalContext` → `inject` | `single_output_per_pass`  |
| `PostToolUseFailure` | `after_action`（`each`） | `outcome` 为失败 · 工具名，从日志取 | 可改写 | 退出码 2 的 stderr → `inject` | 同上，越档 | `additionalContext` → `inject` | ——  |
| `PostToolBatch` | `after_action`（`batch`） | 情形无 · 不读 matcher | 可否决 | `decision: block`、退出码 2 → `stop { cancelled }` | `stop { cancelled }` | `additionalContext` → `inject` | `stop_as_cancelled`  |
| `Stop` | `before_terminal` | `proposed.state = completed`（CC 对用户中断与 API 错误不调） · 不读 matcher | 可否决 | `decision: block`、退出码 2 → `veto`，理由交给 agent；**`additionalContext` 同样译成 `veto`**（CC 里它也让对话继续） | `observed` | `stop_hook_active` 从日志数（从可信日志取续跑事实） | `no_host_continuation_cap`  |
| `StopFailure` | `after_terminal` | `terminal.state = failed` · matcher（错误类型）**取不到**：非全匹配即不导入 | 只观察 | 输出与退出码一律忽略 → `observed` | `observed` | —— | `broader_trigger`  |
| `PreCompact` | `before_compaction` | 情形无 · matcher（`manual`／`auto`）**取不到**：非全匹配即不导入 | 可否决 | `decision: block`、退出码 2 → `veto` | `stop { cancelled }` | —— | ——  |
| `PostCompact` | `after_compaction` | 情形无 · matcher **取不到**：非全匹配即不导入 | 只观察 | 退出码 2 只给用户看 → `observed` | 越档，按报错处置 | —— | ——  |
| `SessionStart`，matcher 匹配 `compact` 的部分 | `after_compaction` | 「压缩刚发生」 · matcher 按字面 `compact` 在导入时求值 | 可改写 | 这一事件不能阻断；退出码 2 只给用户看 → `observed` | 越档，按报错处置 | `additionalContext`／纯文本 stdout → `inject`；会话级副作用（环境文件、监视路径、标题）不生效 | 同时匹配别的来源时 `partial_matcher_imported`  |
| `SessionStart`，其余来源 | **非 loop**：PF-015 | | | | | |  |
| `UserPromptExpansion` | **无对应**：`before_persist_message` 上取不到「这是一次命令展开」与命令名 | | | | | |  |
| `PermissionDenied` | **无对应**：放行判断在 `before_action` 链末，它之后这一位置没有件 | | | | | |  |
| `InstructionsLoaded` | **非 loop**：PF-010（组装是纯派生，推不出位置） | | | | | |  |
| `Setup` | **非 loop**：PF-004 | | | | | |  |
| `SessionEnd` | **非 loop**：PF-015 | | | | | |  |
| `SubagentStart`、`SubagentStop` | **非 loop**：PF-007（父侧视角；子运行自己的 loop 另有装配） | | | | | |  |
| `Notification` | **非 loop**：PF-008 | | | | | |  |
| `MessageDisplay` | **非 loop**：PF-016 | | | | | |  |
| `TaskCreated`、`TaskCompleted` | **非 loop**：PF-006（工具私有状态） | | | | | |  |
| `TeammateIdle` | **非 loop**：PF-006（本项目没有「团队成员」对象） | | | | | |  |
| `ConfigChange`、`CwdChanged`、`DirectoryAdded`、`FileChanged` | **非 loop**：PF-002（设置与资产）、PF-005（执行环境） | | | | | |  |
| `WorktreeCreate`、`WorktreeRemove` | **非 loop**：PF-005 | | | | | |  |
| `PreModelSwitch`、`PostModelSwitch` | **非 loop**：PF-013（会话级设置变更，不是逐请求换模型） | | | | | |  |
| `Elicitation`、`ElicitationResult` | **非 loop**：PF-006（工具执行内部的等待）；它们的输出是替人作答，本项目不允许 | | | | | |  |

**33 个事件全部在表里**（`SessionStart` 按 matcher 拆两行）。「非 loop」各行 `skipped { reason: non_loop_event }` 带表中的 PF；「无对应」各行 `skipped { reason: no_mapping }`。

## Codex 映射表

采用限定：Claude Code 2.1.280；Codex固定修订5c5308fc。Codex沿已采用与Claude Code同构的读取规则；精确原生结构/解释器尚未核实，保留此前采用限定，不把所有command改成no_mapping，也不声明最新上游事实。
**Codex 只在退出码 0 时解析 JSON**；退出码 2 要求 stderr 非空，否则按报错。

| 事件 | 位置（维度） | 情形 · 情形取值 | 上限 | 阻断（含退出码 2 ＋ stderr） | 停止（`continue: false`） | 其余输出 | 报告里另带  |
|---|---|---|---|---|---|---|--- |
| `UserPromptSubmit` | `before_persist_message` | `producer = user` · 不读 matcher | 可否决 | `decision: block`、退出码 2 → `veto`，固定理由 | `veto`，固定理由 | `additionalContext`／纯文本 stdout → `inject` | `block_reason_not_recorded`、`single_output_per_pass`  |
| `PreToolUse` | `before_action` | 情形无 · 工具名（含别名 `Edit`／`Write` 对 `apply_patch`） | 可否决 | `permissionDecision: deny`、`decision: block`、退出码 2 → `veto` | **来源产品不支持 → 报错** | `allow` ＋ `updatedInput` → `rewrite`；**单独 `allow`、`ask` 来源产品判为 hook 失败 → 报错**；`additionalContext` → `inject` | `single_output_per_pass`  |
| `PermissionRequest` | `before_action` | 情形无 · 工具名 | 可否决 | `decision.behavior: deny`、退出码 2 → `veto` | —— | `allow` → `observed`；保留字段（`updatedInput`、`updatedPermissions`、`interrupt`）来源产品判为无效 → 报错 | `allow_as_no_opinion`、`runs_on_every_matching_call`  |
| `PostToolUse` | `after_action`（`each`） | 成败都调 · 工具名，从日志取 | 可改写 | `decision: block`、退出码 2 → **`rewrite`：结果换成一块文字为那段反馈的结果块**，`callId` 与 `outcome` 不变 | 同左（来源产品也是用反馈替换结果） | `additionalContext` → `inject` | `single_output_per_pass`  |
| `Stop` | `before_terminal` | `proposed.state = completed` · 不读 matcher | 可否决 | `decision: block`、退出码 2 → `veto`，理由交给 agent（来源产品是生成一条续跑的用户提示） | `observed`（来源产品里它优先于续跑，即收束） | `stop_hook_active` 从日志数 | ——  |
| `PreCompact` | `before_compaction` | 情形无 · matcher **取不到**：非全匹配即不导入 | 可否决 | —— | **`veto`**（来源产品：在压缩前停住） | —— | ——  |
| `PostCompact` | `after_compaction` | 情形无 · matcher **取不到**：非全匹配即不导入 | 可否决 | —— | `stop { cancelled }` | —— | `stop_as_cancelled`  |
| `SessionStart`，matcher 匹配 `compact` 的部分 | `after_compaction` | 「压缩刚发生」 · matcher 按字面 `compact` 在导入时求值 | 可否决 | —— | `stop { cancelled }`（来源产品：结束这一轮、不再发模型请求） | `additionalContext`／纯文本 stdout → `inject` | `stop_as_cancelled`；同时匹配别的来源时 `partial_matcher_imported`  |
| `SessionStart`，其余来源 | **非 loop**：PF-015 | | | | | |  |
| `Interrupt` | `after_terminal` | `terminal.state = cancelled` · 不读 matcher | 只观察 | 输出只能是 `systemMessage` → `observed` | `observed` | —— | ——  |
| `SessionEnd` | **非 loop**：PF-015 | | | | | |  |
| `SubagentStart`、`SubagentStop` | **非 loop**：PF-007 | | | | | |  |

**12 个事件全部在表里**。legacy `notify`（`AfterAgent`）不是 hooks 配置里的条目，**不在导入范围内**；配置里即使有，也不出现在报告里——它不是一条 hook handler。

---

