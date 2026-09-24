# 规范实例：合法与非法

属于 `data.loop-extension` v1 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`loop-extension.schema.json`](loop-extension.schema.json) 的主要定义项在这里各有正反实例，
非法的一律注明**给哪一个拒绝值**、**被哪一条挡住**。

**怎么读**：每节开头的「校验对象」给出该节实例要拿去求值的 `$defs`；表的「Schema」列是 **Schema 这一关**的预期（`通过` / `拒绝`），
「拒绝值」列按 [契约 S-37](contract.md#s-37-表示层拒绝值) 的次序给出**契约这一关**的结果（`—` 表示合法）。
两列可以不同：Schema 通过、契约仍拒，说明那一半要对照输入或本件 name，Schema 管不到。

**三条读法上的边界：**

- **`通过` 只说形状合规**，不说任何判定成立——一条合法的 `select_model` 仍要过合法目标集合（[S-24](contract.md#s-24-select_model)）。
- **示例里的标识串只是占位**，不要从 `run_`、`call_` 这样的前缀推出任何规则。
- **引到别的契约的部分**（块、消息、路由名、账、依赖名、时长、模型面名字）按那几份候选 v1 的 Schema 写；它们一改，要按它们的 `$defs` 复核一遍（[验证入口 V-1](../verification.md#证据义务)）。

## 1. 位置与维度

**校验对象**：`$defs/LoopPosition`（前七行）、`$defs/Dimension`（后七行）

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `"before_action"` | 通过 | — | [S-1](contract.md#s-1-十一个位置) |
| `"after_terminal"` | 通过 | — | [S-1](contract.md#s-1-十一个位置) |
| `"before_attempt_started"` | 拒绝 | `position_unknown` | [S-1](contract.md#s-1-十一个位置)：尝试开始之前不开，归 PF-015 |
| `"before_assembly"` | 拒绝 | `position_unknown` | [S-1](contract.md#s-1-十一个位置)：组装是纯派生的，前后推不出位置 |
| `"loop_guard"` | 拒绝 | `position_unknown` | [S-1](contract.md#s-1-十一个位置)：按位置命名，不按功能命名 |
| `"Before_Action"` | 拒绝 | `position_unknown` | [S-39](contract.md#s-39-判别式与枚举闭合)：不做「最接近」映射 |
| `7` | 拒绝 | `position_unknown` | [S-1](contract.md#s-1-十一个位置)：位置没有编号 |
| `{"ending": "complete_reply"}` | 通过 | — | [S-2](contract.md#s-2-两个维度) |
| `{"ending": "failure"}` | 通过 | — | [S-2](contract.md#s-2-两个维度) |
| `{"scope": "each"}` | 通过 | — | [S-2](contract.md#s-2-两个维度) |
| `{"scope": "batch"}` | 通过 | — | [S-2](contract.md#s-2-两个维度) |
| `{"ending": "interrupted"}` | 拒绝 | `dimension_not_allowed` | [S-2](contract.md#s-2-两个维度)：被中断的调用根本不触发 `after_model_call`，没有第三种收场 |
| `{"ending": "failure", "scope": "each"}` | 拒绝 | `dimension_not_allowed` | [S-2](contract.md#s-2-两个维度)：一个位置只有一种维度 |
| `{}` | 拒绝 | `dimension_not_allowed` | [S-2](contract.md#s-2-两个维度)：空维度不是「两种都管」 |

## 2. 声明

**校验对象**：`$defs/LoopExtensionDefinition`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"name": "prod-db-guard", "position": "before_action", "power": "veto", "implementation": {"kind": "command", "host": "claude_code", "dialect": "2.1.280", "event": "PreToolUse", "command": "./hooks/prod-db-guard.sh", "matcher": "Bash"}}` | 通过 | — | [S-6](contract.md#s-6-声明的成员与类别)：`onError` 缺席 → 按求得的干预力取默认 |
| `{"name": "default-retry", "position": "after_model_call", "dimension": {"ending": "failure"}, "power": "rewrite", "implementation": {"kind": "builtin", "builtinName": "default-retry"}}` | 通过 | — | [S-2](contract.md#s-2-两个维度)、[S-27](contract.md#s-27-retry)、[S-8](contract.md#s-8-装配进来的实现与外部命令)：系统自带件是装配进来的 |
| `{"name": "result-offloader", "position": "after_action", "dimension": {"scope": "each"}, "power": "rewrite", "onError": "record", "implementation": {"kind": "builtin", "builtinName": "result-offloader"}}` | 通过 | — | [S-5](contract.md#s-5-报错处置策略) |
| `{"name": "cc-pretooluse-audit", "position": "before_action", "power": "observe", "implementation": {"kind": "command", "host": "claude_code", "dialect": "2.1.280", "event": "PreToolUse", "command": "audit-log"}}` | 通过 | — | [S-8](contract.md#s-8-装配进来的实现与外部命令)：`matcher`、`timeout` 缺席即全匹配、那一家那一事件的默认 |
| `{"name": "codex-prompt-gate", "position": "before_persist_message", "power": "veto", "implementation": {"kind": "command", "host": "codex", "dialect": "5c5308fc", "event": "UserPromptSubmit", "command": "python3 gate.py", "timeout": "PT30S"}}` | 通过 | — | [S-8](contract.md#s-8-装配进来的实现与外部命令) |
| `{"name": "pii-scrubber", "position": "before_persist_message", "power": "rewrite", "needs": ["pii-detector"], "implementation": {"kind": "builtin", "builtinName": "pii-scrubber"}}` | 通过 | — | [S-9](contract.md#s-9-依赖声明与不可用) |
| `{"name": "prod-db-guard", "position": "before_action", "power": "veto", "order": 10, "implementation": {"kind": "command", "host": "claude_code", "dialect": "2.1.280", "event": "PreToolUse", "command": "./hooks/prod-db-guard.sh", "matcher": "Bash"}}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-本版没有-order)：本版没有次序成员 |
| `{"name": "prod-db-guard", "position": "before_action", "power": "veto", "implementation": {"kind": "command", "host": "claude_code", "dialect": "2.1.280", "event": "PreToolUse", "command": "./hooks/prod-db-guard.sh", "matcher": "Bash"}, "matcher": "Bash"}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-管哪些情形本版只有维度)：「情形」本版只有维度；`matcher` 只在外部命令的实现里（[S-8](contract.md#s-8-装配进来的实现与外部命令)） |
| `{"position": "before_action", "power": "veto", "implementation": {"kind": "command", "host": "claude_code", "dialect": "2.1.280", "event": "PreToolUse", "command": "./hooks/prod-db-guard.sh", "matcher": "Bash"}}` | 拒绝 | `malformed` | [S-7](contract.md#s-7-name-是身份)：没有身份就不是一件拓展件 |
| `{"name": "g", "position": "before_action", "power": "veto"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-声明的成员与类别)：`implementation` 必有 |
| `{"name": "g", "position": "before_action", "power": "observe", "onError": "treat_as_veto", "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-报错处置策略)：拦不住东西的件不能在报错时拦下东西 |
| `{"name": "g", "position": "after_persist_message", "power": "observe", "onError": "record", "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-报错处置策略)：只观察的件不能在报错时往日志里注入提醒 |
| `{"name": "g", "position": "after_persist_message", "power": "rewrite", "onError": "treat_as_veto", "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-报错处置策略)：策略不高于干预力 |
| `{"name": "g", "position": "before_action", "power": "veto", "needs": [], "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-依赖声明与不可用)：「不需要」只有缺席这一种写法 |
| `{"name": "g", "position": "before_action", "power": "veto", "implementation": {"kind": "command", "host": "cursor", "dialect": "1.6", "event": "beforeShellExecution", "command": "a.sh"}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-装配进来的实现与外部命令)：来源产品闭合 |
| `{"name": "g", "position": "before_action", "power": "veto", "implementation": {"kind": "command", "host": "codex", "dialect": "5c5308fc", "event": "PreToolUse"}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-装配进来的实现与外部命令)：外部命令必带来源产品 handler 条目里的命令原样 |
| `{"name": "g", "position": "before_action", "power": "veto", "implementation": {"kind": "command", "host": "codex", "command": "a.sh"}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-装配进来的实现与外部命令)：必须说是哪一家方言的哪一个事件 |
| `{"name": "g", "position": "before_action", "power": "veto", "implementation": {"kind": "native"}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-装配进来的实现与外部命令)：旧写法 `native` 作废 |
| `{"name": "g", "position": "before_action", "power": "veto", "implementation": {"kind": "builtin", "capability": "ext-g"}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-装配进来的实现与外部命令)：装配进来的实现那一格叫 `builtinName`，旧成员名 `capability` 不收（它不是能力标识，改名免得与 `AssetDefinition.capability` 同名） |
| `{"name": "g", "position": "before_action", "power": "veto", "implementation": {"kind": "builtin"}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-装配进来的实现与外部命令)：装配进来的实现必带名字 |
| `{"name": "g", "position": "before_action", "power": "veto", "implementation": {"kind": "builtin", "builtinName": "ext-g", "host": "codex"}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-装配进来的实现与外部命令)：两种实现的成员不混用 |
| `{"name": "injection-scan", "position": "before_persist_message", "power": "veto", "unavailability": "veto", "needs": ["injection-detector"], "implementation": {"kind": "builtin", "builtinName": "injection-scan"}}` | 通过 | — | [S-6](contract.md#s-6-声明的成员与类别)：把关件要「不在就不许跑」，注册时声明否决 |
| `{"name": "pii-scrubber", "position": "before_persist_message", "power": "rewrite", "unavailability": "skip", "needs": ["pii-detector"], "implementation": {"kind": "builtin", "builtinName": "pii-scrubber"}}` | 通过 | — | [S-6](contract.md#s-6-声明的成员与类别)：显式写 `skip` 与缺席同义 |
| `{"name": "g", "position": "before_action", "power": "rewrite", "unavailability": "veto", "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-声明的成员与类别)：拦不住东西的件，不在时不得比在时权力更大 |
| `{"name": "g", "position": "after_action", "dimension": {"scope": "each"}, "power": "veto", "unavailability": "veto", "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-声明的成员与类别)：「之后」的位置本来就没有可拦的，不收这个声明 |
| `{"name": "g", "position": "before_action", "power": "veto", "unavailability": "fallback", "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-声明的成员与类别)：指定挂件只给系统自带的五件、不经声明 |
| `{"name": "g", "position": "before_action", "power": "veto", "unavailability": "deny", "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | `malformed` | [S-39](contract.md#s-39-判别式与枚举闭合)：不可用处置闭合 |

## 3. 输入

**校验对象**：`$defs/ExtensionInput`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| [EX-1 的输入](#ex-1-可否决件在执行动作之前出卡) | 通过 | — | [S-11](contract.md#s-11-输入的成员)、[S-14](contract.md#s-14-按位置的-subject) |
| `{"position": "after_model_call", "dimension": {"ending": "failure"}, "run": "run_4c1e", "attempt": 2, "subject": {"failure": "upstream_unavailable", "statusCode": 503, "profile": {"providers": ["provider-a", "provider-b"], "allowFallback": true, "inputModalities": ["text"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "dispatches": [{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 1, "provider": "provider-a", "response": "rsp_01"}]}, "earlier": [], "log": "log_77a0"}` | 通过 | — | [S-14](contract.md#s-14-按位置的-subject)、[S-17](contract.md#s-17-failurecause)：状态码原样带；档案快照与已有的发出记录随主体给 |
| `{"position": "after_model_call", "dimension": {"ending": "failure"}, "run": "run_4c1e", "attempt": 2, "subject": {"failure": "upstream_unavailable", "statusCode": 503, "dispatches": [{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 1, "provider": "provider-a", "response": "rsp_01"}]}, "earlier": [], "log": "log_77a0"}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-按位置的-subject)：重试件只凭主体下结论，档案快照必带 |
| `{"position": "after_model_call", "dimension": {"ending": "failure"}, "run": "run_4c1e", "attempt": 2, "subject": {"failure": "upstream_unavailable", "profile": {"providers": ["provider-a"], "allowFallback": false, "inputModalities": ["text"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "dispatches": []}, "earlier": [], "log": "log_77a0"}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-按位置的-subject)：失败了就至少发出过一次 |
| `{"position": "before_terminal", "run": "run_4c1e", "attempt": 1, "subject": {"proposed": {"state": "completed"}}, "earlier": [], "log": "log_77a0"}` | 通过 | — | [S-18](contract.md#s-18-terminalfact) |
| `{"position": "before_model_call", "run": "run_4c1e", "attempt": 1, "subject": {"request": {"target": "fast-small", "parameters": {}, "messages": [], "tools": ["fetch_page", "issue-tracker__search_issues"]}}, "earlier": [], "log": "log_77a0"}` | 通过 | — | [S-15](contract.md#s-15-modelrequest)：`tools` 是模型面名字；MCP 来源的动作（没有能力标识）一样指认得到 |
| `{"position": "before_model_call", "run": "run_4c1e", "attempt": 1, "subject": {"request": {"target": "fast-small", "parameters": {}, "messages": [], "tools": [{"category": "tool", "name": "fetch_page"}]}}, "earlier": [], "log": "log_77a0"}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-modelrequest)：元素不是能力标识，是模型面名字 |
| `{"position": "before_model_call", "run": "run_4c1e", "attempt": 1, "subject": {"request": {"target": "fast-small", "parameters": {}, "messages": [], "tools": ["issue-tracker:search_issues"]}}, "earlier": [], "log": "log_77a0"}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-modelrequest)：`:` 不出现在模型面名字里（转写成 `__`，`data.tool-definition/v1#S-6`） |
| `{"position": "after_terminal", "run": "run_4c1e", "attempt": 1, "subject": {"terminal": {"state": "cancelled", "reason": "用户叫停", "initiator": "usr_a1"}}, "earlier": [], "log": "log_77a0"}` | 通过 | — | [S-18](contract.md#s-18-terminalfact)：被取消必带发起方（其表示是 [G-4](contract.md#十四已知缺口)） |
| `{"position": "attempt_started", "run": "run_4c1e", "attempt": 3, "subject": {"attempt": 3}, "earlier": [], "log": "log_77a0"}` | 通过 | — | [S-12](contract.md#s-12-三个引用) |
| `{"position": "before_persist_message", "run": "run_4c1e", "attempt": 1, "subject": {"message": {"id": "msg_1", "type": "user", "blocks": [], "createdAt": "2026-09-23T10:00:00Z"}, "producer": "user"}, "earlier": [], "log": "log_77a0"}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-输入的成员)：消息落盘之前看不到有没有运行在跑，不带 `run`/`attempt` |
| `{"position": "before_action", "subject": {"attempt": 1}, "earlier": [], "log": "log_77a0"}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-输入的成员)：别的位置必带 `run`/`attempt`；[S-14](contract.md#s-14-按位置的-subject)：主体与位置对不上 |
| `{"position": "after_model_call", "run": "run_4c1e", "attempt": 1, "subject": {"failure": "unrecognized", "profile": {"providers": ["provider-a", "provider-b"], "allowFallback": true, "inputModalities": ["text"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "dispatches": [{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 1, "provider": "provider-a", "response": "rsp_01"}]}, "earlier": [], "log": "log_77a0"}` | 拒绝 | `dimension_missing` | [S-2](contract.md#s-2-两个维度) |
| `{"position": "after_model_call", "dimension": {"ending": "failure"}, "run": "run_4c1e", "attempt": 1, "subject": {"failure": "timeout", "profile": {"providers": ["provider-a", "provider-b"], "allowFallback": true, "inputModalities": ["text"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "dispatches": [{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 1, "provider": "provider-a", "response": "rsp_01"}]}, "earlier": [], "log": "log_77a0"}` | 拒绝 | `malformed` | [S-17](contract.md#s-17-failurecause)：成因只有八个，「超时」并进 `upstream_unavailable`，差在哪由状态码说 |
| `{"position": "after_model_call", "dimension": {"ending": "failure"}, "run": "run_4c1e", "attempt": 1, "subject": {"failure": "interrupted_by_user", "profile": {"providers": ["provider-a", "provider-b"], "allowFallback": true, "inputModalities": ["text"], "outputModalities": ["text"], "maxInputTokens": 200000, "maxOutputTokens": 64000, "updatedAt": "2026-09-23T08:00:00Z"}, "dispatches": [{"kind": "model_call_dispatched", "call": "mc_01", "dispatch": 1, "provider": "provider-a", "response": "rsp_01"}]}, "earlier": [], "log": "log_77a0"}` | 拒绝 | `malformed` | [S-17](contract.md#s-17-failurecause)：被用户中断不是故障 |
| `{"position": "after_terminal", "run": "run_4c1e", "attempt": 1, "subject": {"terminal": {"state": "cancelled"}}, "earlier": [], "log": "log_77a0"}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-terminalfact)：被取消之前必有一条取消请求，发起方是它的事实 |
| `{"position": "after_terminal", "run": "run_4c1e", "attempt": 1, "subject": {"terminal": {"state": "waiting"}}, "earlier": [], "log": "log_77a0"}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-terminalfact)：等人不是终态 |

## 4. 结论

**校验对象**：`$defs/ExtensionOutput`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"kind": "observed"}` | 通过 | — | [S-19](contract.md#s-19-结论封闭八种) |
| `{"kind": "veto", "reason": "生产库上的破坏性命令"}` | 通过 | — | [S-25](contract.md#s-25-veto) |
| `{"kind": "stop", "reason": "本次运行已用尽预算"}` | 通过 | — | [S-26](contract.md#s-26-stop)：`terminal` 缺席即 `cancelled` |
| `{"kind": "stop", "terminal": "failed", "reason": "原地打转：同一工具同一参数已连续调用 6 次"}` | 通过 | — | [S-26](contract.md#s-26-stop)：循环守卫 L3 |
| `{"kind": "stop", "terminal": "completed", "reason": "任务已做完"}` | 拒绝 | `malformed` | [S-26](contract.md#s-26-stop)：拓展件不能替运行宣布完成 |
| `{"kind": "veto"}` | 拒绝 | `malformed` | [S-25](contract.md#s-25-veto)：否决必须说原因 |
| `{"kind": "allow"}` | 拒绝 | `malformed` | [S-29](contract.md#s-29-没有放宽)：没有放宽；别家的「允许」译成 `observed` |
| `{"kind": "goto", "step": "call_model"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-结论封闭八种)：拓展件不指定下一步 |
| `{"kind": "answer_card", "optionId": "deny"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-结论封闭八种)：没有替人作答 |
| `{"kind": "ask", "card": {"explanation": "要不要继续？", "options": [], "about": {"position": "before_terminal"}}}` | 拒绝 | `malformed` | [S-28](contract.md#s-28-ask)：选项至少一个 |
| `{"kind": "ask", "card": {"explanation": "要不要做？", "options": [{"id": "y", "label": "做"}], "about": {"position": "before_action"}}}` | 拒绝 | `malformed` | [S-28](contract.md#s-28-ask)：执行动作之前出的卡要说是为哪个动作 |
| `{"kind": "retry", "plan": {"provider": "provider-b", "model": "other-model"}}` | 拒绝 | `malformed` | [S-27](contract.md#s-27-retry)：「换一个模型」不是 `retry` 能做的 |
| `{"kind": "ask", "card": {"explanation": "要不要改成只读执行？", "options": [{"id": "ok", "label": "照改写后的执行"}], "about": {"position": "before_action", "callId": "call_01"}, "proposedRewrite": {"arguments": {"command": "psql prod -c 'SELECT 1'"}}}}` | 通过 | — | [S-28](contract.md#s-28-ask)：执行动作之前出卡，可附改写提议 |
| `{"kind": "ask", "card": {"explanation": "要不要继续？", "options": [{"id": "y", "label": "继续"}], "about": {"position": "before_terminal"}, "proposedRewrite": {"arguments": {}}}}` | 拒绝 | `malformed` | [S-28](contract.md#s-28-ask)：改写提议只在执行动作之前 |
| `{"kind": "ask", "card": {"explanation": "要不要做？", "options": [{"id": "y", "label": "做"}], "about": {"position": "before_action", "callId": "call_01"}, "proposedRewrite": {}}}` | 拒绝 | `malformed` | [S-28](contract.md#s-28-ask)：提议必带 `arguments` |

## 5. 结论记录

**校验对象**：`$defs/Conclusion`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"extension": "pii-scrubber", "position": "before_persist_message", "power": "rewrite", "skipped": "unavailable", "unavailability": "skip", "at": "2026-09-23T10:00:00Z"}` | 通过 | — | [S-31](contract.md#s-31-三种记录形状)：不可用，不带 `output`，写明按跳过处置 |
| `{"extension": "injection-scan", "position": "before_persist_message", "power": "veto", "skipped": "unavailable", "unavailability": "veto", "at": "2026-09-23T10:00:00Z"}` | 通过 | — | [S-31](contract.md#s-31-三种记录形状)、[S-33](contract.md#s-33-不可用与报错两分)：此刻不在、按否决处置——这条消息不落盘，之后按 `producer` 走 |
| `{"extension": "omne-official:admission-judgment", "position": "before_action", "power": "veto", "callId": "call_01", "skipped": "unavailable", "unavailability": "fallback", "at": "2026-09-23T10:00:00Z"}` | 通过 | — | [S-33](contract.md#s-33-不可用与报错两分)：系统自带件由指定挂件顶上，效果照 runner 的表（放行判断是全拒件）；「是不是系统自带件」Schema 管不到（第 8 节） |
| `{"extension": "pii-scrubber", "position": "before_persist_message", "power": "rewrite", "skipped": "unavailable", "at": "2026-09-23T10:00:00Z"}` | 拒绝 | `malformed` | [S-31](contract.md#s-31-三种记录形状)：「此刻不在、按 X 处置」的 X 必须写出来 |
| `{"extension": "g", "position": "before_action", "power": "rewrite", "callId": "call_01", "skipped": "unavailable", "unavailability": "veto", "at": "2026-09-23T10:00:00Z"}` | 拒绝 | `malformed` | [S-31](contract.md#s-31-三种记录形状)：求得的干预力不是 `veto`，这一次只能照跳过办 |
| `{"extension": "g", "position": "after_persist_message", "power": "veto", "skipped": "unavailable", "unavailability": "veto", "at": "2026-09-23T10:00:00Z"}` | 拒绝 | `malformed` | [S-31](contract.md#s-31-三种记录形状)：「之后」的位置没有可拦的 |
| `{"extension": "g", "position": "before_action", "power": "veto", "callId": "call_01", "skipped": "errored", "error": "boom", "unavailability": "skip", "output": {"kind": "veto", "reason": "拓展件报错，按 treat_as_veto 处置"}, "at": "2026-09-23T10:00:00Z"}` | 拒绝 | `malformed` | [S-31](contract.md#s-31-三种记录形状)：报错的记录不带不可用处置 |
| `{"extension": "prod-db-guard", "position": "before_action", "power": "veto", "callId": "call_02", "skipped": "errored", "error": "guard backend returned 500", "output": {"kind": "veto", "reason": "拓展件报错，按 treat_as_veto 处置"}, "at": "2026-09-23T10:00:01Z"}` | 通过 | — | [S-5](contract.md#s-5-报错处置策略)、[S-31](contract.md#s-31-三种记录形状) |
| `{"extension": "result-offloader", "position": "after_action", "dimension": {"scope": "each"}, "power": "rewrite", "callId": "call_01", "skipped": "errored", "error": "output_not_allowed_for_power", "output": {"kind": "inject", "message": {"id": "msg_r1", "type": "system_reminder", "blocks": [], "createdAt": "2026-09-23T10:00:02Z", "nature": "event", "source": {"kind": "extension", "extension": "result-offloader"}}}, "at": "2026-09-23T10:00:02Z"}` | 通过 | — | [S-34](contract.md#s-34-不合法的结论按报错处置)：它交回了一条 `veto`，被拒；`error` 恰为拒绝值，处置按 `record` 落一条以本件名义的提醒（内容块从略，只说「本件这一次没跑成」） |
| `{"extension": "loop-guard-x", "position": "after_model_call", "dimension": {"ending": "complete_reply"}, "power": "veto", "skipped": "errored", "error": "detector crashed", "output": {"kind": "stop", "terminal": "failed", "reason": "拓展件报错，按 treat_as_veto 处置"}, "at": "2026-09-23T10:00:04Z"}` | 通过 | — | [S-5](contract.md#s-5-报错处置策略)：「之后」的位置没有可否决的状态点，fail-closed 就是运行落失败 |
| `{"extension": "audit-tail", "position": "after_terminal", "power": "veto", "skipped": "errored", "error": "sink unreachable", "output": {"kind": "observed"}, "at": "2026-09-23T10:00:05Z"}` | 通过 | — | [S-5](contract.md#s-5-报错处置策略)：落终态之后三种策略都只落 `observed` |
| `{"extension": "loop-guard-x", "position": "after_model_call", "dimension": {"ending": "complete_reply"}, "power": "veto", "skipped": "errored", "error": "detector crashed", "output": {"kind": "stop", "reason": "拓展件报错"}, "at": "2026-09-23T10:00:04Z"}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-报错处置策略)：报错处置落的 `stop` 只能是 `failed`——不替运行编一条取消请求 |
| `{"extension": "g", "position": "before_model_call", "power": "rewrite", "skipped": "errored", "error": "boom", "output": {"kind": "rewrite", "subject": {"request": {"target": "m", "parameters": {}, "messages": [], "tools": []}}}, "at": "2026-09-23T10:00:00Z"}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-报错处置策略)：处置策略落不下 `rewrite` |
| `{"extension": "pii-scrubber", "position": "before_persist_message", "power": "rewrite", "skipped": "unavailable", "unavailability": "skip", "output": {"kind": "observed"}, "at": "2026-09-23T10:00:00Z"}` | 拒绝 | `malformed` | [S-31](contract.md#s-31-三种记录形状)：不替一件没跑的东西编结论 |
| `{"extension": "g", "position": "before_action", "power": "veto", "callId": "call_01", "skipped": "errored", "output": {"kind": "veto", "reason": "x"}, "at": "2026-09-23T10:00:00Z"}` | 拒绝 | `malformed` | [S-31](contract.md#s-31-三种记录形状)：报错必带 `error` |
| `{"extension": "g", "position": "before_action", "power": "veto", "output": {"kind": "observed"}, "at": "2026-09-23T10:00:00Z"}` | 拒绝 | `malformed` | [S-30](contract.md#s-30-每件的结论必留)：执行动作之前的结论要说是为哪个动作 |
| `{"extension": "g", "position": "before_model_call", "power": "veto", "callId": "call_01", "output": {"kind": "observed"}, "at": "2026-09-23T10:00:00Z"}` | 拒绝 | `malformed` | [S-30](contract.md#s-30-每件的结论必留)：别的位置不带 `callId` |
| `{"extension": "g", "position": "before_model_call", "power": "veto", "output": {"kind": "observed"}}` | 拒绝 | `malformed` | [S-30](contract.md#s-30-每件的结论必留)：`at` 必有 |

## 6. 四个完整走查

### EX-1 可否决件在执行动作之前出卡

一件「生产库操作先问人」：从 Claude Code 导入的一条 `PreToolUse` command hook、可否决、挂在执行动作之前。这一批模型要做两个动作，`call_01` 撞上它。

**声明**：

```json
{
  "name": "prod-db-guard",
  "position": "before_action",
  "power": "veto",
  "implementation": {
    "kind": "command", "host": "claude_code", "dialect": "2.1.280",
    "event": "PreToolUse", "command": "./hooks/prod-db-guard.sh", "matcher": "Bash"
  }
}
```

**`call_01` 这一次经过交给它的输入**（它排在瀑布第一个，`earlier` 为空）：

```json
{
  "position": "before_action",
  "run": "run_4c1e",
  "attempt": 1,
  "subject": {
    "call": {
      "id": "blk_c1",
      "visibility": { "toHuman": true, "toModel": true },
      "kind": "tool_call",
      "complete": true,
      "callId": "call_01",
      "tool": "shell",
      "arguments": { "command": "psql prod -c 'DROP TABLE t'" }
    },
    "definition": { "name": "shell" },
    "batch": ["call_01", "call_02"]
  },
  "earlier": [],
  "log": "log_77a0"
}
```

**它交回 `ask`，落下的结论记录**（非终结：这一次经过停在等人）：

```json
{
  "extension": "prod-db-guard",
  "position": "before_action",
  "power": "veto",
  "callId": "call_01",
  "output": {
    "kind": "ask",
    "card": {
      "explanation": "这条命令会在生产库上删除表 t。要不要改成只读执行？",
      "options": [
        { "id": "readonly", "label": "改成只读执行" },
        { "id": "deny", "label": "不许做" }
      ],
      "about": { "position": "before_action", "callId": "call_01" },
      "proposedRewrite": {
        "arguments": { "command": "psql prod --set=default_transaction_read_only=on -c 'SELECT count(*) FROM t'" }
      }
    }
  },
  "at": "2026-09-23T10:00:00Z"
}
```

卡片草稿里的 `proposedRewrite` 是这件 hook「问一下并附改写」的那一份改写（[S-28](contract.md#s-28-ask)）：出卡时不生效，随这条结论落进日志；人选了「改成只读执行」，回放时它从这一格重建下面那条 `rewrite`。

`call_02` 的那一份瀑布**并行**走（[S-13](contract.md#s-13-瀑布里的-subject-与-earlier)）；两个动作都有了结论或停在等人，运行才进等人，`call_01` 的卡片进池子。
协程可以被回收——卡片与这条记录都在日志里。

**人选了「不许做」。**下一次尝试回放 `prod-db-guard` 到出卡那一处，拿到记下的答复，**不再出卡**，交回最终结论：

```json
{
  "extension": "prod-db-guard",
  "position": "before_action",
  "power": "veto",
  "callId": "call_01",
  "output": { "kind": "veto", "reason": "人在卡片上选了「不许做」" },
  "at": "2026-09-23T10:05:00Z"
}
```

瀑布到此为止；agent 拿到的是「不许做」及其来由，**不是执行失败**（[S-25](contract.md#s-25-veto)）。

**若人选了「改成只读执行」**，最终结论是一条 `rewrite`，只动 `call.arguments`、取的就是卡片草稿里 `proposedRewrite` 那一份（[S-23](contract.md#s-23-rewrite)、[S-28](contract.md#s-28-ask)）；执行之前 runner 先落一条生效参数：

```json
{
  "extension": "prod-db-guard",
  "position": "before_action",
  "power": "veto",
  "callId": "call_01",
  "output": {
    "kind": "rewrite",
    "subject": {
      "call": {
        "id": "blk_c1",
        "visibility": { "toHuman": true, "toModel": true },
        "kind": "tool_call",
        "complete": true,
        "callId": "call_01",
        "tool": "shell",
        "arguments": { "command": "psql prod --set=default_transaction_read_only=on -c 'SELECT count(*) FROM t'" }
      },
      "definition": { "name": "shell" },
      "batch": ["call_01", "call_02"]
    }
  },
  "at": "2026-09-23T10:05:00Z"
}
```

> 这一支正是放行判断钉在 `before_action` 末位要守的（[S-10](contract.md#s-10-本版没有-order)）：若放行判断排在它**之前**、已经据原参数判过，改写之后「判的」与「执行的」就不是同一份。
> 放行判断在末位，所以它看到的一定是改写后的那一份。

### EX-2 外部命令件只观察

一件从 Claude Code 导入的 `PreToolUse` hook，只做审计，导入时定档为只观察：

```json
{
  "name": "cc-pretooluse-audit",
  "position": "before_action",
  "power": "observe",
  "implementation": {
    "kind": "command", "host": "claude_code", "dialect": "2.1.280",
    "event": "PreToolUse", "command": "audit-log"
  }
}
```

它拿到的输入与 EX-1 同形（运行时只认统一输入）；它把输入译成来源产品那一个事件的原生输入、跑 hook、把来源产品的输出译回。
来源产品输出里的 `"permissionDecision": "allow"` **只能译成**：

```json
{
  "extension": "cc-pretooluse-audit",
  "position": "before_action",
  "power": "observe",
  "callId": "call_01",
  "output": { "kind": "observed" },
  "at": "2026-09-23T10:00:00Z"
}
```

没有放宽（[S-29](contract.md#s-29-没有放宽)）；导入时要明示给装它的人——那是兼容层的义务。
hook 进程超时、崩溃：按 [S-33](contract.md#s-33-不可用与报错两分) 记成不可用或报错之一，**两家来源产品「超时即放行」的方向不照搬**（两者的分界是 D-033 的 G4）。

### EX-3 select_model

一件「简单问题走小模型」的件，可改写、挂在调模型之前：

```json
{
  "name": "cheap-router",
  "position": "before_model_call",
  "power": "rewrite",
  "implementation": { "kind": "builtin", "builtinName": "cheap-router" }
}
```

它交回的结论记录：

```json
{
  "extension": "cheap-router",
  "position": "before_model_call",
  "power": "rewrite",
  "output": {
    "kind": "select_model",
    "profile": "fast-small",
    "reason": "上一条用户消息少于 40 字且不含附件"
  },
  "at": "2026-09-23T10:00:00Z"
}
```

- `profile` 要在这一次的合法目标集合里——**判定归能力**；不在，这一次按 [S-34](contract.md#s-34-不合法的结论按报错处置) 记成报错，处置按 `record`（本件是可改写档）：落一条以本件名义的「本件这一次没跑成」提醒（`output` 为 `inject`），请求照原有效模型发出——注入之后日志变了，请求要重新组装，但不再回到这个位置（[S-22](contract.md#s-22-inject)）。
- 选中模型不变；这一次的响应体 `route.selectedBy` 记 `{ "extension": "cheap-router" }`。
- 瀑布里排在它后面的件拿到的 `request.target` 是 `fast-small` 这个名字（[S-13](contract.md#s-13-瀑布里的-subject-与-earlier)）。
- `profile` 是一个路由名（`data.model-profile` v1 的 `RouteName`，PF-013 rev 12），不是某一格某一行：这一次落到哪一行——比如组织层自建的那条 `fast-small`，或租户层把它盖住的同名那条——由模型请求运行时按层覆盖解析，那一行记在响应体的 `route.profile`。

### EX-4 retry

系统自带的重试件，可改写，挂在调模型之后、收场为失败：

```json
{
  "name": "default-retry",
  "position": "after_model_call",
  "dimension": { "ending": "failure" },
  "power": "rewrite",
  "implementation": { "kind": "builtin", "builtinName": "default-retry" }
}
```

输入的主体是 `{"failure": "upstream_unavailable", "statusCode": 503, "profile": …, "dispatches": [ …provider-a 那一次… ]}`（快照与发出记录的形状见 §3 第二行）。它照快照里的 `providers` 与已有的发出记录换下一家、退避两秒：

```json
{
  "extension": "default-retry",
  "position": "after_model_call",
  "dimension": { "ending": "failure" },
  "power": "rewrite",
  "output": { "kind": "retry", "plan": { "provider": "provider-b", "after": "PT2S" } },
  "at": "2026-09-23T10:00:03Z"
}
```

- 每一次发出只走一家；这一次失败的那一次发出是留痕，**不进方程**。
- 同一件若在主体为 `{"failure": "interrupted_mid_reply"}` 时交回 `retry`：形状合法，但**撞上事实三类**，不生效，记成报错（[S-27](contract.md#s-27-retry)）——**已经开口说话了，一个逻辑回复只发一次**。
- 不再试就交回 `{"kind": "observed"}`：试尽，上交。
- `after` 是 `data.tool-definition` v1 的 `Duration`（ISO 8601 时长，只用时、分、秒）。

## 7. 十个拒绝值，各一个反例

**校验对象**：各行注明。

| # | 拒绝值 | 校验对象 | 实例 | Schema | 为什么是这个值而不是更靠前的 |
|---|---|---|---|---|---|
| 1 | `malformed` | `LoopExtensionDefinition` | `{"name": "g", "position": "before_action", "power": "veto", "order": 1, "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | 多了成员，第一行就命中 |
| 2 | `position_unknown` | `LoopExtensionDefinition` | `{"name": "g", "position": "before_assembly", "power": "veto", "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | 形状完整，只是位置不在十一个里 |
| 3 | `power_unknown` | `LoopExtensionDefinition` | `{"name": "g", "position": "before_action", "power": "relax", "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | 没有「放宽」这一档（[S-4](contract.md#s-4-干预力三档)） |
| 4 | `dimension_missing` | `LoopExtensionDefinition` | `{"name": "g", "position": "after_action", "power": "rewrite", "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | 缺席不读作「两种都管」（[S-2](contract.md#s-2-两个维度)） |
| 5 | `dimension_not_allowed` | `LoopExtensionDefinition` | `{"name": "g", "position": "before_action", "dimension": {"scope": "each"}, "power": "veto", "implementation": {"kind": "builtin", "builtinName": "ext-g"}}` | 拒绝 | 执行动作之前不带维度 |
| 6 | `output_not_allowed_for_power` | `Conclusion` | `{"extension": "g", "position": "before_action", "power": "rewrite", "callId": "call_01", "output": {"kind": "veto", "reason": "x"}, "at": "2026-09-23T10:00:00Z"}` | 拒绝 | 位置允许 `veto`，档不允许（[S-20](contract.md#s-20-档与结论的合法组合)） |
| 7 | `ask_at_forbidden_position` | `Conclusion` | `{"extension": "g", "position": "before_persist_message", "power": "veto", "output": {"kind": "ask", "card": {"explanation": "要不要收下这条？", "options": [{"id": "y", "label": "收"}], "about": {"position": "before_persist_message"}}}, "at": "2026-09-23T10:00:00Z"}` | 拒绝 | 档允许 `ask`；这个位置等不了——比第 8 行更具体，先给它 |
| 8 | `output_not_allowed_at_position` | `Conclusion` | `{"extension": "g", "position": "after_action", "dimension": {"scope": "each"}, "power": "veto", "callId": "call_01", "output": {"kind": "veto", "reason": "x"}, "at": "2026-09-23T10:00:00Z"}` | 拒绝 | 档允许 `veto`；执行动作之后那一批动作已经对外发生了（[S-21](contract.md#s-21-位置与结论的合法组合)） |
| 8 | `output_not_allowed_at_position` | `Conclusion` | `{"extension": "g", "position": "after_terminal", "power": "rewrite", "output": {"kind": "inject", "message": {"id": "msg_9", "type": "system_reminder", "blocks": [], "createdAt": "2026-09-23T10:00:00Z", "nature": "event", "source": {"kind": "extension", "extension": "g"}}}, "at": "2026-09-23T10:00:00Z"}` | 拒绝 | 档允许 `inject`、来源也对；落终态之后注入会让队列非空、起下一次运行（[S-21](contract.md#s-21-位置与结论的合法组合)） |
| 9 | `rewrite_touches_immutable` | `Conclusion` | `{"extension": "g", "position": "before_action", "power": "rewrite", "callId": "call_01", "output": {"kind": "rewrite", "subject": {"proposed": {"state": "completed"}}}, "at": "2026-09-23T10:00:00Z"}` | 拒绝 | 档与位置都允许 `rewrite`；交回的主体不是本位置那一种（[S-23](contract.md#s-23-rewrite)） |
| 10 | `inject_source_mismatch` | `Conclusion` | `{"extension": "g", "position": "after_model_call", "dimension": {"ending": "complete_reply"}, "power": "rewrite", "output": {"kind": "inject", "message": {"id": "msg_9", "type": "system_reminder", "blocks": [], "createdAt": "2026-09-23T10:00:00Z", "nature": "event", "source": {"kind": "loop_guard", "level": "L1", "finding": "重复调用同一工具"}}}, "at": "2026-09-23T10:00:00Z"}` | 拒绝 | 档与位置都允许 `inject`；它冒循环守卫的名义说话（[S-22](contract.md#s-22-inject)） |

**第 9、10 行各有 Schema 管不到的另一半**（Schema 通过、契约拒）：

| 拒绝值 | 实例要点 | 为什么 Schema 放过 |
|---|---|---|
| `rewrite_touches_immutable` | EX-1 的 `rewrite`，但把 `call.callId` 改成 `"call_99"` | 形状仍是 `BeforeActionSubject`；**动没动**要与输入对照 |
| `inject_source_mismatch` | 第 10 行的提醒，`source` 改成 `{"kind": "extension", "extension": "someone-else"}`，而结论记录的 `extension` 是 `"g"` | `source.kind` 对了；**是不是本件的 name**要与 `extension` 对照 |

## 8. Schema 挡不住、但同样非法的

**本节不参与机检**——没有「校验对象」。它们形状上一概合法，只能由 runner 的核对或静态检查拒绝。

| 做了什么 | 违反 |
|---|---|
| 结论记录的 `power` 写的是声明里的值，而这一次求得的已被收窄 | [S-4](contract.md#s-4-干预力三档)、[S-30](contract.md#s-30-每件的结论必留)：两张表按求得的值判，记错了表就形同虚设 |
| 一件依赖挂了的可否决件被记成一条 `output` 为 `{"kind": "veto"}` 的结论 | [S-31](contract.md#s-31-三种记录形状)、[S-33](contract.md#s-33-不可用与报错两分)：不可用不编结论；它声明了否决，记 `skipped: unavailable` 与 `unavailability: veto`，效果由它算 |
| 一件租户件的不可用记录写了 `unavailability: fallback` | [S-6](contract.md#s-6-声明的成员与类别)、[S-33](contract.md#s-33-不可用与报错两分)：指定挂件只给系统自带的五件；「是不是系统自带件」要对照装配清单 |
| 声明了 `veto`、这一次求得的干预力与位置都够，依赖挂了却记成 `unavailability: skip` | [S-6](contract.md#s-6-声明的成员与类别)：记的是实际采用的那一种；这一关被悄悄打开了 |
| 系统自带件的声明里带了 `unavailability` | [S-6](contract.md#s-6-声明的成员与类别)：它们不可用时恒由指定挂件顶上，声明给不了别的 |
| 一件依赖挂了的件被记成 `{"kind": "observed"}` 而不是 `skipped: unavailable` | [S-31](contract.md#s-31-三种记录形状)：「此刻不在」必须看得见 |
| 报错按 `treat_as_veto` 处置，在 `before_action` 落了 `stop{ terminal: failed }` 而不是 `veto` | [S-5](contract.md#s-5-报错处置策略)：「之前」的位置拦住那个状态点，不停下整次运行 |
| 声明 `treat_as_veto`、这一次求得的干预力被收窄到 `rewrite`，报错时却落了 `veto` | [S-5](contract.md#s-5-报错处置策略)：按收窄后那一档的默认（`record`）处置 |
| `record` 那条提醒里抄了报错的堆栈 | [S-5](contract.md#s-5-报错处置策略)：提醒只说「本件这一次没跑成」，报错详情只在 `error` 里 |
| `veto.reason` 里原样抄了被拦下的那条用户消息 | [S-25](contract.md#s-25-veto)、P-11：被拦的内容不进日志 |
| `error` 里带着上游返回的鉴权头片段 | [S-31](contract.md#s-31-三种记录形状)：日志只增不改，写错就是永久的 |
| `earlier` 里混进了另一个位置的结论 | [S-13](contract.md#s-13-瀑布里的-subject-与-earlier) |
| `batch` 不含本次这个动作的 `callId` | [S-14](contract.md#s-14-按位置的-subject) |
| `result.outcome` 是 `failed`、外层 `outcome` 是 `completed` | [S-14](contract.md#s-14-按位置的-subject) |
| `rewrite` 在 `before_model_call` 改了 `request.target` | [S-15](contract.md#s-15-modelrequest)：`target` 只经 `select_model` |
| 拓展件在等人之前把一个计数器放在内存里，回来接着用 | [S-35](contract.md#s-35-跨过一次等待只能带已落日志的东西) |
| 交回的结论没落成记录就被状态转移表用了 | [S-32](contract.md#s-32-结论即走向) |
| 一条 `select_model` 换上的名字落到一条收不下会话里图块的档案，被照样发出 | [S-24](contract.md#s-24-select_model)：判定归能力，不在合法目标集合里即不生效 |

## 9. 两张合法组合表与 Schema 逐格对照

**对照方式：人工逐格比对**——把契约表里每一格的 ✓/✗ 与 Schema 里对应那条条件约束的 `enum` 逐项对，**未机检**
（本轮起草不跑校验器；状态登记在[验证入口 V-2](../verification.md#证据义务)）。
Schema 里每条约束以 `$comment` 标明它实现的是哪一行，下面按那个 `$comment` 找。

### 档 × 结论（[S-20](contract.md#s-20-档与结论的合法组合)）

| 档 | 契约表 ✓ 的格 | Schema：`Conclusion.allOf` 里那条的 `output.kind` 取值 | 一致 |
|---|---|---|---|
| `observe` | `observed` | `const: observed`（`$comment`「档 × 结论：observe 只能 observed」） | 是 |
| `rewrite` | `observed` `inject` `rewrite` `select_model` `retry` | `enum: [observed, inject, rewrite, select_model, retry]` | 是：✗ 的三格 `veto` `stop` `ask` 都不在 `enum` 里 |
| `veto` | 八种 | `enum` 八个全列 | 是：这一行在 Schema 里只起「封闭」作用，真正的约束来自位置那张表 |

### 位置 × 结论（[S-21](contract.md#s-21-位置与结论的合法组合)）

| 位置（维度） | 契约表 ✓ 的格 | Schema 那条的 `enum` | 一致 | ✗／⊘ 的格由 Schema 拒 |
|---|---|---|---|---|
| `attempt_started` | observed inject stop ask | `[observed, inject, stop, ask]` | 是 | rewrite select_model veto retry |
| `before_persist_message` | observed inject rewrite veto | `[observed, inject, rewrite, veto]` | 是 | select_model stop retry；**ask（⊘）** |
| `after_persist_message` | observed inject stop ask | `[observed, inject, stop, ask]` | 是 | rewrite select_model veto retry |
| `before_compaction` | observed inject veto stop ask | `[observed, inject, veto, stop, ask]` | 是 | rewrite select_model retry |
| `after_compaction` | observed inject stop ask | `[observed, inject, stop, ask]` | 是 | rewrite select_model veto retry |
| `before_model_call` | observed inject rewrite select_model veto stop ask | `[observed, inject, rewrite, select_model, veto, stop, ask]` | 是 | retry |
| `after_model_call`（`complete_reply`） | observed inject stop ask | `[observed, inject, stop, ask]` | 是 | rewrite select_model veto retry |
| `after_model_call`（`failure`） | observed inject stop retry ask | `[observed, inject, stop, retry, ask]` | 是 | rewrite select_model veto |
| `before_action` | observed inject rewrite veto stop ask | `[observed, inject, rewrite, veto, stop, ask]` | 是 | select_model retry |
| `after_action`（`each`） | observed inject rewrite stop ask | `[observed, inject, rewrite, stop, ask]` | 是 | select_model veto retry |
| `after_action`（`batch`） | observed inject stop ask | `[observed, inject, stop, ask]` | 是 | rewrite select_model veto retry |
| `before_terminal` | observed inject veto stop ask | `[observed, inject, veto, stop, ask]` | 是 | rewrite select_model retry |
| `after_terminal` | observed | `[observed]` | 是 | inject rewrite select_model veto stop retry；**ask（⊘）** |

**逐列复核**（与行向对照互为检查）：

| 结论 | ✓ 的行数 | Schema 里出现在几条位置约束的 `enum` 里 | 一致 |
|---|---|---|---|
| `observed` | 13 | 13 | 是 |
| `inject` | 12（除 `after_terminal`） | 12 | 是 |
| `rewrite` | 4（`before_persist_message` `before_model_call` `before_action` `after_action{each}`） | 4 | 是；这四格另各有一条「subject 必须是本位置那一种」的约束 |
| `select_model` | 1（`before_model_call`） | 1 | 是 |
| `veto` | 5（五个「之前」） | 5 | 是 |
| `stop` | 11（除 `before_persist_message`、`after_terminal`） | 11 | 是 |
| `retry` | 1（`after_model_call{failure}`） | 1 | 是 |
| `ask` | 11（除 ⊘ 两格） | 11 | 是 |

**两处 Schema 与契约分工，不是不一致**：

- **⊘ 两格给哪个值**：Schema 只说「拒绝」；给 `ask_at_forbidden_position` 而不是 `output_not_allowed_at_position`，由 [S-37](contract.md#s-37-表示层拒绝值) 的次序定（第 7 行先于第 8 行）。
- **两张表的前提**：Schema 按**结论记录上写的** `power`、`position`、`dimension` 判；这三个值是不是**这一次求得的**那三个，归 runner（第 8 节第 1 行）。

## 10. 推出的属性项（[S-40](contract.md#s-40-属性项的推出规则)）

每行左边是一份声明（只列相关成员），右边是推出规则产出的全部条目（`data.asset-model` 的 `AttributeDeclaration`，保留的 `disabled`、`usableBy` 不在内）。**干预力的 `values` 是声明档及其以下；位置只在同一维度成员里配**（D-040 §七 M3、M4）。

| 声明 | 推出的条目 |
|---|---|
| `position: before_action`、`power: rewrite` | `{"item": "position", "kind": "setting", "category": "binding", "domain": {"kind": "open", "schema": {"enum": ["attempt_started", "before_persist_message", "after_persist_message", "before_compaction", "after_compaction", "before_model_call", "before_action", "before_terminal", "after_terminal"]}}, "default": "before_action"}`；`{"item": "power", "kind": "permission", "domain": {"kind": "enum", "values": ["observe", "rewrite"]}, "default": "rewrite"}` |
| `position: after_model_call`、`dimension: {ending: failure}`、`power: veto` | `{"item": "position", "kind": "setting", "category": "binding", "domain": {"kind": "open", "schema": {"enum": ["after_model_call"]}}, "default": "after_model_call"}`；`{"item": "dimension", "kind": "setting", "category": "binding", "domain": {"kind": "open", "schema": {"type": "object", "properties": {"ending": {"enum": ["complete_reply", "failure"]}}, "required": ["ending"], "additionalProperties": false}}, "default": {"ending": "failure"}}`；`{"item": "power", "kind": "permission", "domain": {"kind": "enum", "values": ["observe", "rewrite", "veto"]}, "default": "veto"}` |
| `position: after_action`、`dimension: {scope: each}`、`power: observe` | `position` 的 `schema` 为 `{"enum": ["after_action"]}`；`dimension` 的 `schema` 只收 `scope`（`each`、`batch`）；`{"item": "power", "kind": "permission", "domain": {"kind": "enum", "values": ["observe"]}, "default": "observe"}` |

**由此得到的三个结论**（不是 Schema 判得出的，是取值域的直接后果）：

- 声明 `power: rewrite` 的件，任何一层给它配 `veto` 都是配了 `values` 以外的值——治理写面以 `valueOutOfDomain` 拒；它在任何求值下都拿不到 `veto`，报错时的缺席策略因此到不了 `treat_as_veto`（[S-5](contract.md#s-5-报错处置策略)）。
- 第一行的件被某一层配到 `after_action`：不在那份 `enum` 里，写面拒；它不会以一个缺维度的位置出现在 runner 面前。
- 第二行的件被配到 `after_action`：同样不在 `enum` 里——若只按「有维度／无维度」两类放行，这里就会得出 `(after_action, {ending: failure})`，违反 [S-2](contract.md#s-2-两个维度)。
