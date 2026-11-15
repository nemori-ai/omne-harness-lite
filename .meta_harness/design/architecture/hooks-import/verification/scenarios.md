# 规范场景

本设计**不附 Schema**：导入报告与兼容件载荷的线上形状归将来的组合契约，
所以下面的报告用**表**写内容，不写 JSON。结论记录照 [Agent 规格的扩展与卡片](../../../../../packages/agent/SPEC.md#扩展与卡片)里扩展调用记录的形状写。
原生配置、退出码与输出照下面原样作为输入。工作区来源原位读取，明确打开才发现，候选不导入成租户持有，见[设计](../design.md)的「工作区来源」。运行事件的完整差异见[方言映射](dialects.md)。

**两条读法上的边界：**

- **路径、命令、标识串只是占位**：它们不承诺任何词法。
- **「预期」是设计要求的可观察结果，不是某次执行的记录。**

## 1. 一份 Claude Code 项目配置

导入者以 `host = claude_code`、`scope = project`、`path = ".claude/settings.json"` 导入下面这份文件：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "./hooks/inject-branch.sh" } ] }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./hooks/deny-prod-db.sh" },
          { "type": "command", "command": "./hooks/audit.sh", "timeout": 5 }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "if": "Edit(*.ts)", "command": "./hooks/ts-guard.sh" },
          { "type": "prompt", "prompt": "Is this edit safe?" }
        ]
      }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [ { "type": "command", "command": "npx prettier --write \"$FILE\"" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "./hooks/require-tests.sh" } ] }
    ],
    "SessionStart": [
      { "matcher": "startup|compact", "hooks": [ { "type": "command", "command": "./hooks/context.sh" } ] }
    ],
    "PreCompact": [
      { "matcher": "auto", "hooks": [ { "type": "command", "command": "./hooks/save-notes.sh" } ] }
    ],
    "Notification": [
      { "hooks": [ { "type": "command", "command": "notify-send 'Claude'" } ] }
    ]
  }
}
```

`pathDigest` 是 `".claude/settings.json"` 的 UTF-8 字节的 SHA-256；下文记作 `‹D›`（64 位小写十六进制，这里不展开）。

## 2. 导入报告

**配置里十条 handler，报告恰十项。** 来源只说明出处，不授予执行权。工作区发现要明确打开，不因此新增导入报告的成员，也不新增租户启用的写面。每一条导入了的 Claude Code 件另带 `nonzero_exit_json_not_read`，它们的声明都显式带 `unavailability: skip`，这两条不逐行重复。

| # | 事件 · `g`.`h` | 项 | name | 位置（维度） · 声明 `power` | 降级说明（除上两条外） | 依据 |
|---|---|---|---|---|---|---|
| 1 | `UserPromptSubmit` · 1.1 | `degraded` | `hooks.claude_code.‹D›.UserPromptSubmit.1.1` | `before_persist_message` · `veto` | `fails_closed_on_error`、`block_reason_not_recorded`、`single_output_per_pass` | 方言映射 |
| 2 | `PreToolUse` · 1.1 | `degraded` | `hooks.claude_code.‹D›.PreToolUse.1.1` | `before_action` · `veto` | `fails_closed_on_error`、`allow_as_no_opinion`、`ask_uses_admission_options`、`defer_not_supported`、`single_output_per_pass` | 方言映射 |
| 3 | `PreToolUse` · 1.2 | `degraded` | `hooks.claude_code.‹D›.PreToolUse.1.2` | `before_action` · `veto`（`timeout` 5 秒随载荷走） | 同上 | 方言映射 |
| 4 | `PreToolUse` · 2.1 | `skipped` | 无 | 无 | `no_mapping`：**带 `if` 条件**，本设计不求值 `if` | 导入操作 |
| 5 | `PreToolUse` · 2.2 | `skipped` | 无 | 无 | `no_mapping`：**handler 类型 `prompt`** 不导入 | 导入操作 |
| 6 | `PostToolUse` · 1.1 | `degraded` | `hooks.claude_code.‹D›.PostToolUse.1.1` | `after_action`（`each`） · `rewrite` | `single_output_per_pass` | 方言映射 |
| 7 | `Stop` · 1.1 | `degraded` | `hooks.claude_code.‹D›.Stop.1.1` | `before_terminal` · `veto` | `fails_closed_on_error`、`no_host_continuation_cap` | 方言映射的 Stop 那一行 |
| 8 | `SessionStart` · 1.1 | `degraded` | `hooks.claude_code.‹D›.SessionStart.1.1` | `after_compaction` · `rewrite` | `partial_matcher_imported`：`startup` 那一半归会话与工作，不导入 | 方言映射的 `SessionStart` 两行 |
| 9 | `PreCompact` · 1.1 | `skipped` | 无 | 无 | `no_mapping`：matcher `auto` 要比对的触发来由**本项目取不到** | 方言映射 |
| 10 | `Notification` · 1.1 | `skipped` | 无 | 无 | `non_loop_event`，归**人在回路** | 方言映射 |

- **第 4、5 条补救不同**：第 4 条把条件写进脚本里自己判，去掉 `if` 再导；第 5 条改写成 command。报告要让导入者分得出来。
- **装配清单里 `before_action` 上的相对次序是 2 → 3**，放行判断在它们之后。
- **把 `matcher` 写成 `Bash(`**：整份 `invalidInput`，十条一条都不导入。
- **同一份文件改了第 2 条的脚本内容后再导**：十个 name 不变，第 1、2、3、6、7、8 条下次实际装配时读取更新后的原位候选；不自动发布租户资产版本。
- **落地之后**：兼容来源缺省关闭；本工作区明确打开来源之后，仍要逐件取得命令的执行准入。候选留在工作区层，不复制成租户持有。

## 3. 运行时：`PreToolUse` 的几种收场

以下假设本工作区已打开兼容来源，第 2、3 条都已取得本次执行准入，`deny-prod-db.sh` 与 `audit.sh` 都挂在 `before_action`，放行判断在链末。这一节的干预力按方言表的上限，依赖设计的未决「工作区来源的干预力上限」。模型要做 `call_21`：`Bash`，`{"command": "psql prod -c 'DROP TABLE t'"}`。

| hook 的行为 | 兼容件交回 | 记录 | 依据 |
|---|---|---|---|
| `deny-prod-db.sh` 退出码 2，stderr「不许动生产库」 | `veto { reason: "不许动生产库" }` | 跑出了结论 | 方言映射 |
| 它 stdout `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow"}}`，退出码 0 | `observed` | 跑出了结论；放行判断照常判 | 兼容执行：`allow` 不是放行 |
| 它退出码 1（stdout 里有一段合法 JSON 说 `deny`） | **非阻断错误**：`skipped: errored`，`output` 为 `observed`，`error` 写「非零退出，退出码 1」；不否决，链往下走，放行判断照常判（记录见下） | 与 Claude Code 一样不拦；Claude Code 会读那段 JSON，这里不读（`nonzero_exit_json_not_read`） | 兼容执行：非阻断错误；Agent 规格的扩展与卡片 |
| 它超过 600 秒没返回 | 先停组；**非阻断错误**：同上一行，`error` 写「超时」（请求停止后尚未确认真实退出时再写「已请求停止、未确认退出」） | 与 Claude Code 一样不拦 | 兼容执行：非阻断错误，请求停止与实际停止分开 |
| 它退出码 0，stdout 是坏 JSON（`{"hookSpecificOutput": `） | **非阻断错误**：同上，`error` 写「输出不合形状」，**不含那段输出原文** | 与 Claude Code 一样不拦 | 兼容执行：坏的原文不能泄漏 |
| 子进程起来之后，会话的执行环境被撤下（执行环境端口确认失联） | **报错**：`skipped: errored`；处置 `treat_as_veto` 落 `veto`，动作不做 | 来源产品没有这一情形；这里拦（`fails_closed_on_error`） | 兼容执行：失联适用干预力默认的错误政策 |
| `./hooks/deny-prod-db.sh` 在会话的执行环境里不存在（解释器 `sh` 在，起来之后以 127 退出） | 同退出码 1 那一行：**非阻断错误**，不否决、链往下走，退出码 127 记下 | 解释器已经起来，是开始之后的退出，按退出码归类 | 兼容执行 |
| 这一条 hook 带 `args`（exec form） | **不导入**：报告 `skipped`，`no_mapping` | 字段语义没核过，不静默按 `sh -c` 跑 | 导入操作 |
| 起子进程在开始之前被拒：「拓展件子进程的宿主机允许」不在，或实际开始前解释器找不到 | **不可用**：`skipped: unavailable`，不带 `output`，`unavailability: skip`；链往下走 | 看得见；这一次这道闸没了（安装者若在落地前把它改为 `veto`，这里按否决处置、动作不做）。本场景只在实际执行准入缺失时成立，不是每条 hook 都落这一支 | 兼容执行：起不来走声明的 `unavailability`；Agent 规格的扩展与卡片 |
| `audit.sh` 被收窄成只观察，却退出码 2 | 译出 `veto` → **越档**：`skipped: errored`，`error` 为 `output_not_allowed_for_power`，处置 `ignore` 落 `observed` | 看得见 | 兼容执行：超出干预力的输出 |
| 它交回 `permissionDecision: defer` | 报错 → `veto` | `defer` 按报错处置 | 方言映射 |

**退出码 1 那一行落下的记录**（形状与越档那一条相同，是扩展「可用却报错」的那一种）：

```json
{
  "extension": "hooks.claude_code.‹D›.PreToolUse.1.1",
  "position": "before_action",
  "power": "veto",
  "callId": "call_21",
  "skipped": "errored",
  "error": "非阻断错误：非零退出，退出码 1",
  "output": { "kind": "observed" },
  "at": "2026-09-23T12:00:00Z"
}
```

**若 hook 交回 `ask`**，`permissionDecisionReason` 为「要删表，确认一下」：

```json
{
  "extension": "hooks.claude_code.‹D›.PreToolUse.1.1",
  "position": "before_action",
  "power": "veto",
  "callId": "call_21",
  "output": {
    "kind": "ask",
    "card": {
      "explanation": "要删表，确认一下",
      "options": [
        { "id": "deny", "label": "不允许" },
        { "id": "allow_once", "label": "这次允许" },
        { "id": "allow_session", "label": "本会话内，这类情况都允许" },
        { "id": "allow_tenant", "label": "将来本租户所有会话，这类情况全允许" }
      ],
      "about": { "position": "before_action", "callId": "call_21" }
    }
  },
  "at": "2026-09-23T12:00:00Z"
}
```

（`extension` 里的 `‹D›` 是占位，实际是那 64 位十六进制；四档选项照工具准入的原样。）

人点了「将来本租户所有会话，这类情况全允许」。下一次尝试回放这一件：**子进程不再跑**；它读到自己那张卡的答复，交回 `observed`。
**租户层没有任何权限值被写**；这个答复**不交给放行判断**：放行判断在链末照常判，执行权限是「问一下」就再出它自己的卡。

**若 hook 同时交回 `ask` 与改写**（`updatedInput` 把命令改成 `psql prod -c 'DROP TABLE t_tmp'`）：上面那条记录的 `card` 多一个成员，说明写的是改写后的那一份：

```json
"proposedRewrite": { "arguments": { "command": "psql prod -c 'DROP TABLE t_tmp'" } }
```

人点「这次允许」⇒ 回放交回 `rewrite`，`subject.call.arguments` 恰是 `proposedRewrite.arguments`，其余成员照输入；人点「不允许」⇒ `veto`，改写不生效。**两种情况子进程都只跑过一次**。

## 4. 运行时：别的几个事件

| 事件 | 这一次 | 兼容件交回 | 依据 |
|---|---|---|---|
| `UserPromptSubmit` | 用户发来一条消息；hook 输出 `{"decision": "block", "reason": "消息里有 API key：sk-…"}` | `veto { reason: "被导入的 hook 拒绝" }`。**来源产品的理由引用了被拦的原文，不进日志**；用户那条被拒，他被告知 | 方言映射：`block_reason_not_recorded` |
| `UserPromptSubmit` | 系统追加的一条提醒要落盘（`producer = system`） | `observed`，**不起子进程** | 方言映射：情形 `producer = user` |
| `PostToolUse` | `Edit` 成功；hook 输出 `{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "已格式化"}}` | `inject`：一条以本件名义的提醒，正文「已格式化」 | 方言映射 |
| `PostToolUse` | `Edit` 失败 | `observed`，不起子进程（`PostToolUse` 只管成功那一路） | 方言映射 |
| `Stop` | 运行要以「完成」收束；hook 输出 `{"decision": "block", "reason": "测试还没跑"}` | `veto { reason: "测试还没跑" }`：接着转，理由到 agent 眼前 | 方言映射 |
| `Stop` | 下一次要收束，`stop_hook_active` 从日志数得为真；hook 无决定 | `observed`：收束 | 兼容执行：续跑标记从日志读 |
| `Stop` | 运行要以「被取消」收束 | `observed`，不起子进程（Claude Code 对中断不调 Stop） | 方言映射 |
| `SessionStart`（`compact` 部分） | 压缩刚发生；hook 输出纯文本「分支 feat/x」 | `inject`，正文「分支 feat/x」 | 方言映射 |
