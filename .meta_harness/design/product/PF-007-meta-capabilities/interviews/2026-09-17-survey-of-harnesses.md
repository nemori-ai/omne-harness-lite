# 2026-09-17 · 外部实现调研

**这是原始材料，不是结论，更不是依据。**
本篇记录的是**当时查到了什么**，用途只有两个：**发现缺口**、**印证边界**。
十三扇门的构成来自产品负责人的裁决，不来自这里；
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
**这印证了「工具必须与技能配套」**（[PF-002](../../PF-002-assets-settings-and-permissions/design.md#八类资产)）。

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

## 十、HITL：问人与请示

指示来自产品负责人：「Ask() 这个工具，我希望你再调研 claude code 的具体机制，
并同时参考一下 omne-next/omne_harness 的 hitl tools」，以及紧接的补充：
「你自己就运行在 claude code harness 里，你这边自己能用的问用户问题 / 让用户决策 /
出选项卡片的工具具体长什么样你是能直接看到的」。

**后一句改变了这次调研的性质**：Claude Code 那一侧不是二手资料，
而是 PM 手上那把工具的完整说明书，**逐字可读**。

### 10.1 Claude Code 的 `AskUserQuestion`（一手材料）

| 项 | 内容 |
|---|---|
| **用途限定** | 「**只在你被一个真正属于用户的决定卡住时用**——那种你无法从请求、代码或合理默认值推出答案的决定」 |
| 一次带几个问题 | **1–4 个** |
| 每个问题 | 问题正文 · 一个**渲染成标签的极短标题**（≤12 字符）· 2–4 个选项 · 是否允许多选 |
| 每个选项 | 显示文本（1–5 词）· 说明（这个选项意味着什么、会导致什么，**含取舍**）· 可选的对照材料 |
| **对照材料** | 聚焦该选项时渲染，等宽 markdown、支持多行；**任一选项带它时，界面切换成左右并排**（左边竖排选项，右边预览）。**只有单选支持** |
| **「其他」** | **系统自动提供，且明文要求 agent 不要自己加**：「用户总是可以选 Other 来提供自定义文本输入」 |
| 推荐项 | 放**第一个**，文本末尾标 `(Recommended)` |
| 备注 | 另有一路收**用户对所选项附加的自由文本** |
| **没有的东西** | **没有任何超时、等待上限或默认答案字段。一个都没有。** |
| **负面清单** | 「不要用于有常规默认值的选择，也不要用于你自己能在代码库里查证的事实。那些情况下**选那个显而易见的选项、在回复里提一句、然后继续**。」 |
| 对照材料的用法 | 用于**需要视觉比较的具体产物**：界面布局草图、不同实现的代码片段、图表变体、配置示例。**不要**用于简单偏好问题 |
| plan mode 下 | 可以用它澄清需求，但**不许问「计划好了吗」「要继续吗」**——用户在退出 plan mode 之前根本看不到计划 |

**没有对应的「请示 / 审批」工具。**Claude Code 的审批走**权限系统**——
工具调用时由系统弹窗，**不是 agent 主动发起的动作**。

### 10.2 omne-next/omne_harness 的两个 HITL 工具

来源：`omne_harness/design_docs/interfaces/hitl-agent-request-tools-contract.md`（Draft / Maturing）。

| 工具 | 干什么 |
|---|---|
| `ask_user` | 索取信息或判断，**开放式** |
| `request_approval` | 对一个**拟执行的动作**要准或驳，**封闭式** |

**三条设计依据**（它自己写明的）：

| 依据 | 推出什么 |
|---|---|
| **控制论** | agent 是执行层控制器，人是上一级。等待必须**可观测、可控** |
| **人因工程** | 人一次能处理的信息有限，**每次打断都有成本**；问询要有固定骨架 |
| **安全态** | 等待期间**零副作用、不占贵重资源、随时可恢复** |

**两个工具各自的骨架**：

| `ask_user` | `request_approval` |
|---|---|
| **问什么**（多个问题要编号写在同一条里——一次问全） | **做什么**（动作 + 对象，**具体到人能凭它签字**：「把草稿 #12/#13/#14 发给客户 A/B/C」，不是「发邮件」） |
| **为什么问**（信息缺失 / 意图不明 / 两路都合理 / 风险需你判断） | **为什么**（一句因果） |
| **答了会怎样**（你答 A 我就…，答 B 我就…） | **影响范围**（涉及谁、什么、多少） |
| **现成选项**（≤5 条，**只是提示，人可自由作答，不是枚举约束**） | **撤不撤得回**（可撤回 / 部分可撤回 / 不可撤回）——原文标为「**决策权重最大的一项**」 |
| | **不准我会怎样**（备选方案或「就此打住」） |

**关键不变式**（原编号 HT-1 ~ HT-10，摘其要）：

| 编号 | 内容 |
|---|---|
| **HT-2** | args schema **永不含**任何时间或默认答案语义的字段。黑名单点名 `timeout` / `max_wait` / `deadline` / `default_answer` / `default_reply` / `fallback_answer`，且**任何「不回我就当作…」的字段一律拒绝**。结论：**无超时、无默认答案、系统永不替人作答** |
| **HT-4** | **一轮至多停驻一次**（框架的构造性保证），因此说明书要求 agent **一次问全** |
| **HT-5** | **等待期间零副作用**——调用发生在 agent 打算做某事**之前**，工具本身不执行任何动作 |
| **HT-6** | 审批裁决**一次性**：不产生长期授权。人若说「以后都允许」，工具**不得静默升格**，返回「有话说」+ 原文，由说明书指引 agent 告知正式授权路径。回给 agent 的结果**固定附一句**：`This decision applies to this single action only.` |
| **HT-7** | 回复翻译只发生在工具返回边界；**翻不出即「有话说」，绝不合成裁决** |
| **HT-10** | 字段演化 **additive only**；新语义（如多选）= 新的 kind 变体，不改老的 |

**回复怎么翻译成裁决**——保守到近乎刻薄，而这正是重点：

| 输入 | 输出 |
|---|---|
| 结构化的准 / 驳 | 准 / 驳 |
| 自由文本，**整句**是无条件的肯定或否定（有词表） | 准 / 驳 + 原文 |
| 自由文本，**带条件、带修改要求、带反问、或词表没命中** | **有话说**（默认档） |
| **空回复** | **有话说**（**不是批准**） |

判定细到：去掉首尾标点与语气词后**整句等于**词表项才算命中；
**句中只要含「但 / 不过 / 先 / 如果 / 除非 / 改 / 再」任一个，直接判「有话说」**。

**`ask_user` 的四个出口**：人回复 / 人取消 / 强停 / 会话终态清扫。**没有第五个。**

**它明文列的「不该用 `ask_user` 的场合」**：能自己查到的；纯礼貌确认
（「我可以开始了吗」）；对拟执行动作要准或驳（那是另一个工具）；
系统权限名单会自动拦的动作。

**`request_approval` 与系统拦截的关系**（原话）：**两道独立的门**
（agent 的判断 vs 系统的强制），**不互相抵扣**——agent 获批后若动作命中名单，
系统仍会走自己的流程。「**这是有意的纵深防御，不是缺陷**」。

**多次请示**：判成「有话说」之后再请示是**新的一轮**，
且上一轮的话**应当体现在新一轮的动作描述里**——让人看到 agent 听进去了。

### 10.3 两家撞在一起，看到了什么

**四处独立收敛。**两边没有关系，却定在同一个地方——这是本次调研最硬的发现：

| 收敛点 | Claude Code | omne_harness |
|---|---|---|
| **不设超时、不替人作答** | 一个相关字段都没有 | HT-2 明文黑名单 |
| **一次问全** | 一次调用带 1–4 个问题 | HT-4 一轮至多停一次 |
| **选项是提示不是牢笼** | 系统自动给「其他」，且**不许 agent 自己加** | 明说「不是枚举约束」 |
| **自己查得到的别问** | 负面清单明文 | 「不该用」明文 |

**两处分歧：**

| 分歧 | Claude Code | omne_harness |
|---|---|---|
| **审批算不算「问」** | 不是工具，走权限系统弹窗 | **独立的第二个工具**，agent 主动发起 |
| **可视对照** | 有（等宽预览 + 左右并排） | 无 |

两处分歧**各采纳了一边**，理由见 [decisions.md 第二节](../decisions.md#二pm-推导)。

### 10.4 与本 topic 已有设计的冲突

rev 1 的 `Ask()` 写的是「**等不到应答有上限**，到头按第六种收场走」，
**与 HT-2 直接冲突**，也与 Claude Code 的形态不符。

这一处不是调研笔记能处置的——它牵连到 PF-006 的一条推导，
已记入 [decisions.md 第四节](../decisions.md#四已知的来源问题)。

## 十一、Cordis：DSH 的系统自省工具

指示来自产品负责人：「Cordis() 工具，对照着 deepseek harness 的，
完整复刻产品设计，只是标注现阶段不实现」。

来源：`deepseek-ai/deepseek-harness` 的 `packages/extensions/tool-cordis/README.md`
与 `docs/tool-catalog.md`，2026-09-17 取。

### 11.1 两个工具，都是只读

| 工具 | 干什么 |
|---|---|
| `cordis_inspect_list` | 列出 Host 当前已知的**每一个 Cordis Inspect Provider**，带 platform、用途与 schema |
| `cordis_inspect_query` | 向某个 provider 发一个**只读**查询 |

`cordis_inspect_query` 的参数：

| 参数 | 值 |
|---|---|
| `platform` | `host` / `client` |
| `provider` | **从 list 的结果里取** |
| `method` | **精确**方法名 |
| `input` | 可选，须匹配该方法的 schema |

**能查到**：服务的方法、事件、界面槽位，以及活着的树结构——**不改动运行时**。

另一处剖析记的是更早的合一形态 `cordis_inspect`：一份覆盖当前进程的只读报告——
服务、**所有活着的 plugin fiber**、已注册的工具、**本 session 的动态包**、
reflection 支持的 api / events 引用，以及编译期的 client slot 面；
**给出精确名字（api / events / client）则收窄报告并附完整契约**。

> **「不给限定 = 概览；给了限定 = 收窄 + 完整契约」**——
> 这正是拆成 list 与 query 两条命令之后的同一件事。本 topic 取两条命令的形态。

### 11.2 它明文写死的边界

| 红线 | 原文 |
|---|---|
| 不能调用服务方法 | Cannot invoke service methods |
| 不能配置插件 | Cannot configure plugins（that responsibility belongs to Plugin Manager） |
| 不能执行生成的代码 | Cannot execute generated code |
| 界面侧要有页面 | Client queries require a connected page or user cancellation |

**检视与配置是两个不同的东西**：`cordis_*` 只读，而**持久的 profile 变更归
`plugin_manager`**（list / enable / disable / install / remove）。原文：
「Creator mode provides these read-only tools alongside Plugin Manager,
which owns persistent profile changes.」

### 11.3 它为谁存在

DSH 把它放在 **creator mode**，定位是**给正在开发插件的 agent 的发现机制**——
在动手写代码之前拿到运行时信息，**不带任何变更能力**。

### 11.4 我们复刻了什么、加了什么

| 项 | 处置 |
|---|---|
| 两条命令（概览 + 精确查询） | **照搬** |
| 检视面由各插件自己贡献 | **照搬**，并在正文点明这是「检视面随系统生长」 |
| 前三条红线 | **照搬** |
| host / client 两侧 | **形状保留**，但第一版单机、界面侧还不存在 |
| creator mode 的用途 | **照搬**，作为这扇门值一个常驻槽位的理由 |
| 与配置变更的分界 | **照搬**，且本版只做只读那一半 |
| **「只看得见自己那一份，不是整个部署」** | **我们加的第四条红线**——DSH 是单租户工具，没有这个问题 |

## 记录边界

- 本篇全部内容是 **PM 的调研摘要**，不是任何人的裁决。
- 外部系统的做法**不构成本 topic 的依据**。正文的每一条都能在
  [decisions.md](../decisions.md) 找到裁决出处或独立的推理链。
- 调研时间为 2026-09-17，各家版本随时在变；**引用请核对当时的来源**。
- `omne-next` 的 `ADR-005-skill-script-execution-and-tool-hints.md` 状态是 **Proposed**，
  位于 `adrs/archived/`——**提出过但从未被接受**，因此既不是有效方案也不是被否决的方案。
  本篇引用它只为说明「skill 带脚本」这个问题真实存在过，以及它当时打算走的路
  （`exec_python` 那条，而非 `Skills()`）。
