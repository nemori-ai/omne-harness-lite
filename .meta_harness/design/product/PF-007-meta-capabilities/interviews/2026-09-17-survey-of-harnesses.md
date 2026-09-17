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

## 记录边界

- 本篇全部内容是 **PM 的调研摘要**，不是任何人的裁决。
- 外部系统的做法**不构成本 topic 的依据**。正文的每一条都能在
  [decisions.md](../decisions.md) 找到裁决出处或独立的推理链。
- 调研时间为 2026-09-17，各家版本随时在变；**引用请核对当时的来源**。
- `omne-next` 的 `ADR-005-skill-script-execution-and-tool-hints.md` 状态是 **Proposed**，
  位于 `adrs/archived/`——**提出过但从未被接受**，因此既不是有效方案也不是被否决的方案。
  本篇引用它只为说明「skill 带脚本」这个问题真实存在过，以及它当时打算走的路
  （`exec_python` 那条，而非 `Skills()`）。
