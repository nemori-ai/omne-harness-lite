# 规范实例：一份 Claude Code 配置的导入报告，与几次运行时翻译

属于 `capability.hooks-import` v1 的规范工件。本契约**不附 Schema**：导入报告与兼容件载荷的线上形状归组合契约，
所以下面的报告用**表**写内容，不写 JSON；结论记录照 [`data.loop-extension` v1](../../../data/loop-extension/v1/contract.md) 的形状写。

**两条读法上的边界：**

- **路径、命令、标识串只是占位**：它们不承诺任何词法（`data.identity-values/v1#S-31`）。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

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

**配置里十条 handler，报告里恰十项**（[S-12](contract.md#s-12-导入报告)）。**每一条导入了的**（`imported`、`degraded`）都带 `requires_tenant_enablement`——来源是 `project`（[S-9](contract.md#s-9-工作区来源的-hook导入即禁用)），下表不再逐行重复；`skipped` 的几项不带兼容件，也就不带它；
每一条导入了的 CC 件另带 `nonzero_exit_json_not_read`，它们的声明都显式带 `unavailability: skip`（[S-10](contract.md#s-10-兼容件要带的东西)），同样不逐行重复。

| # | 事件 · `g`.`h` | 项 | name | 位置（维度） · 声明 `power` | 降级说明（除上两条外） | 依据 |
|---|---|---|---|---|---|---|
| 1 | `UserPromptSubmit` · 1.1 | `degraded` | `hooks.claude_code.‹D›.UserPromptSubmit.1.1` | `before_persist_message` · `veto` | `fails_closed_on_error`、`block_reason_not_recorded`、`single_output_per_pass` | [S-23](contract.md#s-23-claude-code-映射表) 第 1 行 |
| 2 | `PreToolUse` · 1.1 | `degraded` | `hooks.claude_code.‹D›.PreToolUse.1.1` | `before_action` · `veto` | `fails_closed_on_error`、`allow_as_no_opinion`、`ask_uses_admission_options`、`defer_not_supported`、`single_output_per_pass` | 第 2 行 |
| 3 | `PreToolUse` · 1.2 | `degraded` | `hooks.claude_code.‹D›.PreToolUse.1.2` | `before_action` · `veto`（`timeout` 5 秒随载荷走） | 同上 | 第 2 行 |
| 4 | `PreToolUse` · 2.1 | `skipped` | —— | —— | `no_mapping`：**带 `if` 条件**，本版不求值（[G-9](contract.md#十一已知缺口)） | [S-14](contract.md#s-14-不导入的理由) ③ |
| 5 | `PreToolUse` · 2.2 | `skipped` | —— | —— | `no_mapping`：**handler 类型 `prompt`** 不导入 | [S-6](contract.md#s-6-一条-command-一件兼容件)、[S-14](contract.md#s-14-不导入的理由) ① |
| 6 | `PostToolUse` · 1.1 | `degraded` | `hooks.claude_code.‹D›.PostToolUse.1.1` | `after_action`（`each`） · `rewrite` | `single_output_per_pass` | 第 4 行 |
| 7 | `Stop` · 1.1 | `degraded` | `hooks.claude_code.‹D›.Stop.1.1` | `before_terminal` · `veto` | `fails_closed_on_error`、`no_host_continuation_cap` | Stop 那一行 |
| 8 | `SessionStart` · 1.1 | `degraded` | `hooks.claude_code.‹D›.SessionStart.1.1` | `after_compaction` · `rewrite` | `partial_matcher_imported`：`startup` 那一半归 PF-015，不导入 | `SessionStart` 两行 |
| 9 | `PreCompact` · 1.1 | `skipped` | —— | —— | `no_mapping`：matcher `auto` 要比对的触发来由**本项目取不到** | [S-14](contract.md#s-14-不导入的理由) ④ |
| 10 | `Notification` · 1.1 | `skipped` | —— | —— | `non_loop_event`，归 **PF-008** | [S-23](contract.md#s-23-claude-code-映射表) |

- **第 4、5 条补救不同**：第 4 条把条件写进脚本里自己判、去掉 `if` 再导；第 5 条改写成 command。报告要让导入者分得出来（[S-14](contract.md#s-14-不导入的理由)）。
- **装配清单里 `before_action` 上的相对次序是 2 → 3**，放行判断在它们之后（[S-15](contract.md#s-15-报告里的次序)）。
- **把 `matcher` 写成 `Bash(`**：整份 `invalidInput`，十条一条都不导入（[S-11](contract.md#s-11-importhosthooks) ⑥）。
- **同一份文件改了第 2 条的脚本内容后再导**：十个 name 不变，第 1、2、3、6、7、8 条是那几件资产的新版本（[S-7](contract.md#s-7-能力标识怎样导出)）。
- **落地之后**：租户层那一格的 `disabled` 为真，六件兼容件在任何会话里都不被调到，直到有资格的人在租户层把它们逐件打开（[S-9](contract.md#s-9-工作区来源的-hook导入即禁用)）。

## 3. 运行时：`PreToolUse` 的几种收场

以下假设第 2、3 条已在租户层启用，`deny-prod-db.sh` 与 `audit.sh` 都挂在 `before_action`，放行判断在链末。模型要做 `call_21`：`Bash`，`{"command": "psql prod -c 'DROP TABLE t'"}`。

| hook 的行为 | 兼容件交回 | 记录 | 依据 |
|---|---|---|---|
| `deny-prod-db.sh` 退出码 2，stderr「不许动生产库」 | `veto { reason: "不许动生产库" }` | 跑出了结论 | [S-19](contract.md#s-19-起不来与报错)、[S-20](contract.md#s-20-输出怎样译回) 第 2 行 |
| 它 stdout `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow"}}`，退出码 0 | `observed` | 跑出了结论；放行判断照常判 | [S-20](contract.md#s-20-输出怎样译回) 第 7 行 |
| 它退出码 1（stdout 里有一段合法 JSON 说 `deny`） | **报错**：`skipped: errored`，`error` 写「退出码 1」；处置 `treat_as_veto` 落 `veto` | CC 会读那段 JSON；这里不读（`nonzero_exit_json_not_read`） | [S-19](contract.md#s-19-起不来与报错) |
| 它超过 600 秒没返回 | 同上，报错 → `veto` | CC 会放行；这里拦（`fails_closed_on_error`） | 同上 |
| `./hooks/deny-prod-db.sh` 在会话的执行环境里不存在（解释器 `sh` 在，起来之后以 127 退出） | **报错**：`skipped: errored`，`error` 写「退出码 127」；处置 `treat_as_veto` 落 `veto` | 解释器已经起来，是开始之后的失败（2026-09-25 修订波：解释器写成 `program`，「程序不存在」只指解释器） | [S-18](contract.md#s-18-子进程在哪跑钱记在哪)、[S-19](contract.md#s-19-起不来与报错) |
| 起子进程在开始之前被拒：「拓展件子进程的宿主机允许」不在（`noLanding`），或解释器找不到（`startFailed{ programNotFound }`） | **不可用**：`skipped: unavailable`，不带 `output`，`unavailability: skip`；链往下走 | 看得见；这一次这道闸没了（安装者若在落地前把它改为 `veto`，这里按否决处置、动作不做）。**本版产品装配里那一项允许还没给，每一件都走这一行**（`capability.execution-environments` v1 的 G-3） | [S-10](contract.md#s-10-兼容件要带的东西)、[S-19](contract.md#s-19-起不来与报错)、`capability.loop-extension-runner/v1#S-12` |
| `audit.sh` 被收窄成只观察，却退出码 2 | 译出 `veto` → **越档**：`skipped: errored`，`error` 为 `output_not_allowed_for_power`，处置 `ignore` 落 `observed` | 看得见 | [S-22](contract.md#s-22-越档的输出) |
| 它交回 `permissionDecision: defer` | 报错 → `veto` | 主线裁定 G2 | [S-20](contract.md#s-20-输出怎样译回) 第 4 行 |

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

（`extension` 里的 `‹D›` 是占位，实际是那 64 位十六进制；四档选项照 `capability.tool-admission/v1#S-15` 原样。）

人点了「将来本租户所有会话，这类情况全允许」。下一次尝试回放这一件：**子进程不再跑**；它读到自己那张卡的答复，交回 `observed`。
**租户层没有任何权限值被写**；这个答复**不交给放行判断**——放行判断在链末照常判，执行权限是「问一下」就再出它自己的卡（[S-21](contract.md#s-21-ask-与回放)）。

**若 hook 同时交回 `ask` 与改写**（`updatedInput` 把命令改成 `psql prod -c 'DROP TABLE t_tmp'`）：上面那条记录的 `card` 多一个成员，说明写的是改写后的那一份：

```json
"proposedRewrite": { "arguments": { "command": "psql prod -c 'DROP TABLE t_tmp'" } }
```

人点「这次允许」⇒ 回放交回 `rewrite`，`subject.call.arguments` 恰是 `proposedRewrite.arguments`，其余成员照输入；人点「不允许」⇒ `veto`，改写不生效。**两种情况子进程都只跑过一次**（[S-20](contract.md#s-20-输出怎样译回) 例外、[S-21](contract.md#s-21-ask-与回放) 第 3 条）。

## 4. 运行时：别的几个事件

| 事件 | 这一次 | 兼容件交回 | 依据 |
|---|---|---|---|
| `UserPromptSubmit` | 用户发来一条消息；hook 输出 `{"decision": "block", "reason": "消息里有 API key：sk-…"}` | `veto { reason: "被导入的 hook 拒绝" }`——**来源产品的理由引用了被拦的原文，不进日志**；用户那条被拒、他被告知 | [S-20](contract.md#s-20-输出怎样译回) |
| `UserPromptSubmit` | 系统追加的一条提醒要落盘（`producer = system`） | `observed`，**不起子进程** | [S-16](contract.md#s-16-情形筛选) |
| `PostToolUse` | `Edit` 成功；hook 输出 `{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "已格式化"}}` | `inject`：一条以本件名义的提醒，正文「已格式化」 | [S-23](contract.md#s-23-claude-code-映射表) |
| `PostToolUse` | `Edit` 失败 | `observed`，不起子进程（`PostToolUse` 只管成功那一路） | 同上 |
| `Stop` | 运行要以「完成」收束；hook 输出 `{"decision": "block", "reason": "测试还没跑"}` | `veto { reason: "测试还没跑" }`：接着转，理由到 agent 眼前 | 同上 |
| `Stop` | 下一次要收束，`stop_hook_active` 从日志数得为真；hook 无决定 | `observed`：收束 | [S-17](contract.md#s-17-输入怎样译成来源产品的原生输入) 第 3 条 |
| `Stop` | 运行要以「被取消」收束 | `observed`，不起子进程（CC 对中断不调 Stop） | [S-23](contract.md#s-23-claude-code-映射表) |
| `SessionStart`（`compact` 部分） | 压缩刚发生；hook 输出纯文本「分支 feat/x」 | `inject`，正文「分支 feat/x」 | 同上 |
