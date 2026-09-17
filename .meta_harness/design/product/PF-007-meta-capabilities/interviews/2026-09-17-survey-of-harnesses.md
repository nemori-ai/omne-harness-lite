# 2026-09-17 · 外部实现调研

**这是原始材料，不是结论，更不是依据。**
本篇记录的是**当时查到了什么**，用途只有两个：**发现缺口**、**印证边界**。
十二扇门的构成来自产品负责人的裁决，不来自这里；
命令集的取舍在 [decisions.md 第二节](../decisions.md#二pm-推导)各有推理链。

执行者：PM。指示来自 [INT-002](2026-09-17-meta-capabilities.md#int-002-不可禁用不可替换六个必需的-meta以及调研指示)。

## 一、各家提供了什么

| 系统 | 查到的内置能力 |
|---|---|
| **pi** | read, bash, edit, write, grep, find, ls。**只有七个，明确不做 sub-agent 与 plan mode**，其余留给用户扩展 |
| **DeepSeek Harness** | 按**能力域**分包：terminal（bash / bash-persistent / pwsh / 六个交互终端）、fs、fs_search、str_replace_editor、subagent + subagent_control、get/create/update_goal、**jobs**、todo、session_search、**ask_user_question**、web_search / web_fetch、lsp、**cordis**（动态插件管理与检视）、workflow、ralph、schedule |
| **opencode** | bash, read, edit, glob, grep, list, webfetch, websearch, task（派子 agent）, todowrite, lsp, skill |
| **deepagents** | write_todos（规划）、虚拟文件系统（当记忆用）、task（子 agent） |
| **Kimi Code** | 文件族、Plan Mode（ExitPlanMode）、TodoList、协作族（子 agent 委派、与用户交互、Skill 调用） |
| **Codex** | shell, apply_patch, update_plan, view_image, web_search |
| **Claude Code** | Bash, Read/Edit/Write, Glob/Grep, Agent, WebFetch/WebSearch, TodoWrite, Skill, AskUserQuestion, ExitPlanMode, BashOutput/KillShell, ToolSearch, Schedule/Cron |
| **Cursor** | 读写编辑、codebase 搜索、终端、真实浏览器（E2E）、MCP 外接。**公开文档未给出完整清单，这一行不完整** |

## 二、omne-next 的现成形态

| toolset | 命令 |
|---|---|
| `file_system` | read_file, write_file, edit_file, list_dir, glob, grep, get_file_info, copy_file, move_file, delete_file, create_dir |
| `cli` | run_command, run_script, get_system_info |
| `code_execution` | **start_repl, exec_in_repl, get_repl_namespace, reset_repl, close_repl**, exec_python, exec_python_script |
| `web` | fetch（带缓存、markdown 转换、摘要、预批准、重定向处理）、search（多 provider + coordinator） |
| `omne_agent_capabilities` | discover_capabilities, inspect_tool, execute_tool, manage_skills, browse_capability_marketplace |

`code_execution` 那套**有状态 REPL 会话**的命令族（开 / 执行 / 看状态 / 重置 / 关）
正是[会话级沙箱](../../PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)在命令层面的样子，
`Shell().session` 取的是同一个形状。

## 三、把它们按「作用对象」摊开之后看到的

| 作用于 | 各家普遍有的 | 产品负责人最初给的六个 |
|---|---|---|
| **世界** | 文件、命令行、网络、浏览器、图形界面 | ✅ `Shell()` `Computer()` `Web()` `Browser()` |
| **自己的能力集** | 技能调用、工具发现 | ✅ `Tools()` `Skills()` |
| **自己的运行状态** | todos、plan、**jobs**、goals、历史检索 | ❌ 空 |
| **他者** | 子 agent 派发、**向人提问** | ❌ 空 |
| **系统自身** | DSH 的 `cordis` | ❌ 空 |

**这张表是本次调研唯一有产品价值的产物**：它让两个缺口显出来了。

## 四、两个被指认为 PF-006 自己挖的坑

| 缺口 | 依据 | 各家的做法 |
|---|---|---|
| **看不见、停不掉后台的执行** | [PF-006 §6.6](../../PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度) 定了执行可转后台、可跨轮存活，**却没有任何入口** | DSH 有 `jobs`（输出 / 列举 / 终止），Claude Code 有 BashOutput / KillShell。**七家里没有一家把后台做成单向的** |
| **agent 想问人一句，没有入口** | [PF-006 的等待态](../../PF-006-tools-and-skills/design.md#等待态)是**工具内部**停下来等，与 agent 主动发问方向不同 | DSH 有 `ask_user_question`，Claude Code 有 AskUserQuestion，Kimi 归在协作族 |

两者随后由产品负责人拍板补入（见
[INT-004](2026-09-17-meta-capabilities.md#int-004-五个全收cordis-非首批全部多命令范式)）。

## 五、印证到的边界

- **七家里没有一家让文件操作都走 shell。**每一家都有独立的文件族。
  这印证了 `Files()` 与 `Shell()` 必须分开，理由在 decisions 第二节独立成立
  （编辑不可靠、权限管不住、结果没形状）。
- **`Tools()` 的三步链（找 → 看参数 → 执行）在 omne-next 与 DSH 都是同一个形状。**
  它提示了一件本来会漏掉的事：**非常驻工具的参数格式同样不常驻**，
  而那往往比说明文字还长。
- **todos 各家都是整份写。**Kimi 的做法是：传空数组即清空，不传即查询。

## 六、看过但本版没有采纳的

| 外部有、本版没有 | 为什么没进来 |
|---|---|
| **lsp / 代码智能**（DSH、opencode） | 编码场景专用。本系统不是编码工具，**没有理由把它放进每个 agent 的基本盘** |
| **goals / 长期目标**（DSH） | 它与 `Todos()` 的差别是跨不跨会话。**跨会话的目标是另一个对象**，不在本 topic |
| **session_search / 历史检索**（DSH） | 会话历史归 run 与会话那一块 |
| **schedule / 定时**（DSH、Claude Code） | 「安排未来的事」是调度，归 run 那一块 |
| **workflow / ralph**（DSH） | 编排。本系统的编排形态尚未设计 |
| **view_image / 多模态输入**（Codex） | 那是模型输入的形态，不是一扇门 |
| **marketplace 浏览与安装**（omne-next） | 资产怎么到手，归 [PF-002](../../PF-002-assets-settings-and-permissions/README.md) 与 [PF-003](../../PF-003-asset-transfer-and-sharing/README.md) |
| **plan mode**（Kimi、Claude Code） | 那是交互形态，不是能力 |
| **脚本回调 agent 工具的桥**（omne-next ADR-005，`__TOOL_CALL__` 协议） | skill 脚本跑在沙箱里、反过来调用 agent 的工具，是一个很重的机制。**它有一个未解的问题：脚本回调时以谁的身份、谁的权限？**不解决就做，会在权限上开一个大洞。本版 `Skills().exec_script` **只跑脚本，不提供回调** |

**这一节存在的意义**：将来有人问「为什么我们没有 lsp」，
答案在这里，而不是「当时没想到」。

## 七、shell / bash tool：三家的具体设计

指示来自 [INT-006](2026-09-17-meta-capabilities.md#int-006-shell--bash-tool-三家怎么设计的)。

| | **Codex** | **Claude Code** | **pi** |
|---|---|---|---|
| **参数** | `command`（必需）、`workdir`、`timeout_ms`、**`with_escalated_permissions`**、**`justification`** | `command`、`description`、`timeout`（ms，默认 120000／上限 600000）、`run_in_background`、`dangerouslyDisableSandbox` | 未公开 |
| **持久状态** | **有，且隐式**：`ShellSnapshot` 自动保留 alias／环境变量／函数跨命令，落盘存 3 天 | **没有**。只有工作目录跨调用保持；shell 状态每次从 profile 重新初始化 | 未公开 |
| **交互 vs 非交互** | `exec_command`（交互式 PTY）与 `shell_command`（非交互脚本）分开 | 一个 Bash，靠 `run_in_background` 分叉 | 一个 bash，另有可选 `powershell` |
| **后台** | 走 PTY 会话 | **`run_in_background` + 两个独立工具**：`BashOutput` 读输出、`KillShell` 终止；前台 `sleep` 被禁 | 未公开 |
| **沙箱与权限** | 三档：ReadOnly → WorkspaceWrite → DangerFullAccess。**patched zsh 拦截 `execve`，即时审批**；**读权限跨平台一律不限**（刻意——防的是写与网络，不是信息外泄） | `dangerouslyDisableSandbox` 逃生口 | **没有权限系统**。明说不限制文件系统／进程／网络／凭据，要隔离自己上容器 |

### 对本 topic 的两点影响

**一、`with_escalated_permissions` + `justification` 没有采纳。**
那是 agent **主动申请提权并给出一句话理由**。不采纳的理由不是它不好，
而是它与本系统的模型不兼容：执行环境在这里是**注入**的，
[flows.md §4](../flows.md#四谁决定什么) 写死了「agent 不选落点」。
让它申请提权等于让它影响注入，
[PF-005 的热替换模型](../../PF-005-execution-environments-and-sandboxes/design.md#53-换执行环境是换一个值不是开关一套机制)当场被捅破。
**同一个问题本系统的答案是「不可用 + 说明原因，agent 绕路」。**

**二、`Shell().session` 取显式而非隐式。**
Codex 的持久是隐式的——每条命令都自动保持状态；本 topic 是显式开会话。
显式更对：[PF-005](../../PF-005-execution-environments-and-sandboxes/README.md) 花了一整个 topic
给执行环境定绑定层级，隐式持久会让「这条命令的状态活多久」变成第二套解释。
**显式开会话，状态的寿命就等于那个执行环境的寿命。**

### 一处顺带的印证

**Claude Code 把后台输出与终止做成了两个散落的独立工具**（`BashOutput`、`KillShell`），
而本 topic 把它们归进 `Jobs()` 一扇门。
这印证了[四、两个被指认为 PF-006 自己挖的坑](#四两个被指认为-pf-006-自己挖的坑)里的判断——
**它们是一族能力，不该散成独立工具。**

## 八、omne-next 的 computer use tool

`Computer()` 直接对标它（[INT-008](2026-09-17-meta-capabilities.md#int-008-逐扇门-reviewshell--computer--agents--todoitems--bkgjobs) 第 2 条）。

它本身就是 `BaseMultiCommandTool`，动作以**数组**形式传入（`actions=[{...}]`）。
动作分四层，门槛不同：

| 层 | 动作 | 门槛 |
|---|---|---|
| `TIER_BASIC` | click, type, key, scroll, move, wait, screenshot, cursor_position | 无 |
| `TIER_ADVANCED` | drag, zoom, mouse_press, mouse_release, hold_key, clipboard_read, clipboard_write | **要先读 help** |
| `TIER_WINDOW` | window_info, focus_window, close_window, set_window_state | **要先读 help** |
| `TIER_APPLICATION` | launch_application, open_resource | **要先读 help** |

另有四个机制被本 topic 采纳为**产品性质**：**批量动作**、**`help` 与其他动作互斥**、
**截图预算**（超出时裁掉历史里的旧截图）、**动作之后等界面稳定**。
还有一个 `SKILL_GATED_ACTIONS` 是预留的（当时为空集），本 topic 未采纳。

它配套一份 `using-computer` 技能，含 `action-batching` 与 `interaction-loop`——
**这印证了「工具必须与技能配套」**（[PF-002](../../PF-002-assets-settings-and-permissions/design.md#七类资产)）。

## 九、omne-next 的 subagent dispatch

`Agents()` 的派发模式对标它（[INT-008](2026-09-17-meta-capabilities.md#int-008-逐扇门-reviewshell--computer--agents--todoitems--bkgjobs) 第 3 条）。

那边是一只 `subagent_dispatch` 工具挂十个命令，**三种派发关系**：

| | 前身的承诺 |
|---|---|
| `delegate` | master 保留对直接子的**监督关系**，可发送后续消息，也可撤回 |
| `spawn` | 创建**自身 blueprint 的独立执行 clone**；clone 有独立 session，可被撤回，但**不因此获得 delegate 的持续监督** |
| `handoff` | 交出任务后不再介入、**不可撤回**；报告**永不回到这张 ack** |

还有一条被本 topic 采纳的判断：**执行姿态由实现钉死，agent 不参与决策**——
判据是「执行后还要不要等子回报」，**因此它不需要一个 agent 可选的开关**。

以及 `expected_report_shape`：发起方对报告形状的**可选指引**，
送给子并在完成时回显以供比对，**系统不校验子的报告内容**。

### 一处本系统与前身相反

前身那份产品权威条款写着：

> **本决定不批准跨 Tenant 或 third-party harness dispatch。**

而本 topic **要支持派给外部 harness 的 agent**（产品负责人裁决），
技术上约定走 **ACP**（Agent Client Protocol——Zed / JetBrains 那套，
原为「IDE ↔ 编码 agent」的协议，2026 年 1 月起有 Registry，
Codex CLI、Claude Code、Gemini CLI、Copilot CLI 均在其中）。

**这是有意的偏离，不是疏漏。**四条产品后果写在
[design.md §6.8](../design.md#68-agents通向别的-agent)。

## 记录边界

- 本篇全部内容是 **PM 的调研摘要**，不是任何人的裁决。
- 外部系统的做法**不构成本 topic 的依据**。正文的每一条都能在
  [decisions.md](../decisions.md) 找到裁决出处或独立的推理链。
- 调研时间为 2026-09-17，各家版本随时在变；**引用请核对当时的来源**。
- `omne-next` 的 `ADR-005-skill-script-execution-and-tool-hints.md` 状态是 **Proposed**，
  位于 `adrs/archived/`——**提出过但从未被接受**，因此既不是有效方案也不是被否决的方案。
  本篇引用它只为说明「skill 带脚本」这个问题真实存在过，以及它当时打算走的路
  （`exec_python` 那条，而非 `Skills()`）。
