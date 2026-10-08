本页的原生配置/退出/输出输入保持；工作区来源的现行采用是PF-020原位opt-in，不导入租户holding。运行事件的完整差异见[方言映射](dialects.md)。

# 规范场景

本域设计**不附 Schema**：导入报告与兼容件载荷的线上形状归组合契约，
所以下面的报告用**表**写内容，不写 JSON；结论记录照 `loop-extension（当前行为见本域设计） 的形状写。

**两条读法上的边界：**

- **路径、命令、标识串只是占位**：它们不承诺任何词法（`identity-values`）。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](README.md)。

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

**配置里十条handler，报告恰十项。**来源只说明出处，不授执行权；当前workspace发现按PF-020明确opt-in，不新增导入报告成员或租户启用写面。每一条导入了的 CC 件另带 `nonzero_exit_json_not_read`，它们的声明都显式带 `unavailability: skip`（当前设计），同样不逐行重复。

| # | 事件 · `g`.`h` | 项 | name | 位置（维度） · 声明 `power` | 降级说明（除上两条外） | 依据 |
|---|---|---|---|---|---|---|
| 1 | `UserPromptSubmit` · 1.1 | `degraded` | `hooks.claude_code.‹D›.UserPromptSubmit.1.1` | `before_persist_message` · `veto` | `fails_closed_on_error`、`block_reason_not_recorded`、`single_output_per_pass` | 当前设计 |
| 2 | `PreToolUse` · 1.1 | `degraded` | `hooks.claude_code.‹D›.PreToolUse.1.1` | `before_action` · `veto` | `fails_closed_on_error`、`allow_as_no_opinion`、`ask_uses_admission_options`、`defer_not_supported`、`single_output_per_pass` | 当前事件映射 |
| 3 | `PreToolUse` · 1.2 | `degraded` | `hooks.claude_code.‹D›.PreToolUse.1.2` | `before_action` · `veto`（`timeout` 5 秒随载荷走） | 同上 | 当前事件映射 |
| 4 | `PreToolUse` · 2.1 | `skipped` | —— | —— | `no_mapping`：**带 `if` 条件**，当前限定范围不求值（当前设计） | 当前设计 |
| 5 | `PreToolUse` · 2.2 | `skipped` | —— | —— | `no_mapping`：**handler 类型 `prompt`** 不导入 | 当前设计 |
| 6 | `PostToolUse` · 1.1 | `degraded` | `hooks.claude_code.‹D›.PostToolUse.1.1` | `after_action`（`each`） · `rewrite` | `single_output_per_pass` | 当前事件映射 |
| 7 | `Stop` · 1.1 | `degraded` | `hooks.claude_code.‹D›.Stop.1.1` | `before_terminal` · `veto` | `fails_closed_on_error`、`no_host_continuation_cap` | Stop 那一行 |
| 8 | `SessionStart` · 1.1 | `degraded` | `hooks.claude_code.‹D›.SessionStart.1.1` | `after_compaction` · `rewrite` | `partial_matcher_imported`：`startup` 那一半归 PF-015，不导入 | `SessionStart` 两行 |
| 9 | `PreCompact` · 1.1 | `skipped` | —— | —— | `no_mapping`：matcher `auto` 要比对的触发来由**本项目取不到** | 当前设计 |
| 10 | `Notification` · 1.1 | `skipped` | —— | —— | `non_loop_event`，归 **PF-008** | 当前设计 |

- **第 4、5 条补救不同**：第 4 条把条件写进脚本里自己判、去掉 `if` 再导；第 5 条改写成 command。报告要让导入者分得出来（当前设计）。
- **装配清单里 `before_action` 上的相对次序是 2 → 3**，放行判断在它们之后（当前设计）。
- **把 `matcher` 写成 `Bash(`**：整份 `invalidInput`，十条一条都不导入（当前设计）。
- **同一份文件改了第 2 条的脚本内容后再导**：十个 name 不变，第 1、2、3、6、7、8 条下次实际装配读取更新后的原位候选；不自动发布租户资产版本（当前设计）。
- **落地之后**：兼容来源默认关闭；本workspace明确打开来源后仍须逐件命令执行准入。候选留workspace layer，不复制到租户holding（当前设计）。

## 3. 运行时：`PreToolUse` 的几种收场

以下假设本workspace已打开兼容来源，第2、3条均已取得本次执行准入，`deny-prod-db.sh` 与 `audit.sh` 都挂在 `before_action`，放行判断在链末。模型要做 `call_21`：`Bash`，`{"command": "psql prod -c 'DROP TABLE t'"}`。

| hook 的行为 | 兼容件交回 | 记录 | 依据 |
|---|---|---|---|
| `deny-prod-db.sh` 退出码 2，stderr「不许动生产库」 | `veto { reason: "不许动生产库" }` | 跑出了结论 | 当前设计 |
| 它 stdout `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow"}}`，退出码 0 | `observed` | 跑出了结论；放行判断照常判 | 当前设计 |
| 它退出码 1（stdout 里有一段合法 JSON 说 `deny`） | **非阻断错误**：`skipped: errored`，`output` 为 `observed`，`error` 写「非零退出，退出码 1」；不否决，链往下走，放行判断照常判（记录见下） | 与 CC 一样不拦；CC 会读那段 JSON，这里不读（`nonzero_exit_json_not_read`） | 当前设计、`loop-extension-runner` |
| 它超过 600 秒没返回 | 先停组；**非阻断错误**：同上一行，`error` 写「超时」（请求停止后尚未确认真实退出时再写「已请求停止、未确认退出」） | 与 CC 一样不拦 | 当前设计、当前设计 |
| 它退出码 0，stdout 是坏 JSON（`{"hookSpecificOutput": `） | **非阻断错误**：同上，`error` 写「输出不合形状」，**不含那段输出原文** | 与 CC 一样不拦 | 当前设计 |
| 子进程起来之后，会话的执行环境被撤下（当前执行环境端口确认失联） | **报错**：`skipped: errored`；处置 `treat_as_veto` 落 `veto`，动作不做 | 来源产品没有这一情形；这里拦（`fails_closed_on_error`） | 当前设计 表末行 |
| `./hooks/deny-prod-db.sh` 在会话的执行环境里不存在（解释器 `sh` 在，起来之后以 127 退出） | 同退出码 1 那一行：**非阻断错误**，不否决、链往下走，退出码 127 记下 | 解释器已经起来，是开始之后的退出，按退出码归类 | 当前设计 |
| 这一条 hook 带 `args`（exec form） | **不导入**：报告 `skipped`，`no_mapping` ⑦ | 字段语义未核（当前设计），不静默按 `sh -c` 跑 | 当前设计 |
| 起子进程在开始之前被拒：「拓展件子进程的宿主机允许」不在，或实际开始前解释器找不到 | **不可用**：`skipped: unavailable`，不带 `output`，`unavailability: skip`；链往下走 | 看得见；这一次这道闸没了（安装者若在落地前把它改为 `veto`，这里按否决处置、动作不做）。宿主允许政策已有采用；本场景只在实际执行准入缺失时成立，不能声称每条hook都落此分支 | 当前设计、`loop-extension-runner` |
| `audit.sh` 被收窄成只观察，却退出码 2 | 译出 `veto` → **越档**：`skipped: errored`，`error` 为 `output_not_allowed_for_power`，处置 `ignore` 落 `observed` | 看得见 | 当前设计 |
| 它交回 `permissionDecision: defer` | 报错 → `veto` | 当前defer拒绝政策 | 当前设计 |

**退出码 1 那一行落下的记录**（形状与越档那一条相同，`loop-extension`「可用却报错」那一种）：

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

（`extension` 里的 `‹D›` 是占位，实际是那 64 位十六进制；四档选项照 `tool-admission` 原样。）

人点了「将来本租户所有会话，这类情况全允许」。下一次尝试回放这一件：**子进程不再跑**；它读到自己那张卡的答复，交回 `observed`。
**租户层没有任何权限值被写**；这个答复**不交给放行判断**——放行判断在链末照常判，执行权限是「问一下」就再出它自己的卡（当前设计）。

**若 hook 同时交回 `ask` 与改写**（`updatedInput` 把命令改成 `psql prod -c 'DROP TABLE t_tmp'`）：上面那条记录的 `card` 多一个成员，说明写的是改写后的那一份：

```json
"proposedRewrite": { "arguments": { "command": "psql prod -c 'DROP TABLE t_tmp'" } }
```

人点「这次允许」⇒ 回放交回 `rewrite`，`subject.call.arguments` 恰是 `proposedRewrite.arguments`，其余成员照输入；人点「不允许」⇒ `veto`，改写不生效。**两种情况子进程都只跑过一次**（当前设计 例外、当前设计）。

## 4. 运行时：别的几个事件

| 事件 | 这一次 | 兼容件交回 | 依据 |
|---|---|---|---|
| `UserPromptSubmit` | 用户发来一条消息；hook 输出 `{"decision": "block", "reason": "消息里有 API key：sk-…"}` | `veto { reason: "被导入的 hook 拒绝" }`——**来源产品的理由引用了被拦的原文，不进日志**；用户那条被拒、他被告知 | 当前设计 |
| `UserPromptSubmit` | 系统追加的一条提醒要落盘（`producer = system`） | `observed`，**不起子进程** | 当前设计 |
| `PostToolUse` | `Edit` 成功；hook 输出 `{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "已格式化"}}` | `inject`：一条以本件名义的提醒，正文「已格式化」 | 当前设计 |
| `PostToolUse` | `Edit` 失败 | `observed`，不起子进程（`PostToolUse` 只管成功那一路） | 同上 |
| `Stop` | 运行要以「完成」收束；hook 输出 `{"decision": "block", "reason": "测试还没跑"}` | `veto { reason: "测试还没跑" }`：接着转，理由到 agent 眼前 | 同上 |
| `Stop` | 下一次要收束，`stop_hook_active` 从日志数得为真；hook 无决定 | `observed`：收束 | 当前设计 |
| `Stop` | 运行要以「被取消」收束 | `observed`，不起子进程（CC 对中断不调 Stop） | 当前设计 |
| `SessionStart`（`compact` 部分） | 压缩刚发生；hook 输出纯文本「分支 feat/x」 | `inject`，正文「分支 feat/x」 | 同上 |
