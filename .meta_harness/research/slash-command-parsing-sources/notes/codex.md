# Codex `5c5308f`：斜杠命令的识别、解析与留痕

- 原始出处：openai/codex @ `5c5308fc9a9ee789049d646ef11e5400384b9c6f`（提交时间 2026-09-20 03:02 UTC）；
  Codex 官方文档离线副本 `tmp/sources/codex-docs-2026-09-20.tar.gz`（主检出，sha256 见同目录 `SHA256SUMS`）；
  GitHub issue 页（2026-09-23 用 `gh issue view` 抓取）。
- 取得方式：
  - 主检出钉住的 `tmp/sources/codex-5c5308f.tar.gz` **只含** `codex-rs/{core/src,hooks,protocol,rmcp-client}` 与 `docs`，**不含 `codex-rs/tui`**。
    本轮从本机另一份 openai/codex 克隆（HEAD 恰为 `5c5308f`，位于另一会话的 scratchpad，路径不钉、会失效）用
    `git archive 5c5308f -- codex-rs/tui/src codex-rs/core-plugins/src codex-rs/skills codex-rs/ext/skills codex-rs/core/src codex-rs/protocol/src codex-rs/app-server-protocol/src docs codex-rs/prompts codex-rs/external-agent-migration/src`
    打包到本任务 scratchpad，归档 sha256 `6cc8bce3d00f686bfa136aca6f07784c047ce5d4d1995cde7d7e2aeb0a527aae`（git 2.25.1 产出）。
    **同一性核对**：解出的 `codex-rs/core/src` 与 `codex-rs/protocol/src` 和钉住 tarball 的解包逐文件 `diff -rq` 无差异。
    复现：在任一 openai/codex 克隆里 `git archive 5c5308fc9a9ee789049d646ef11e5400384b9c6f -- <上列路径>`。
  - 下文路径以 codex 仓库根为起点；行号在该 SHA 下有效。
- 来源立场：源码与官方文档都是**厂商自述**；issue 是**独立用户报告**，维护者回复是厂商立场（评论者 `etraut-openai`，GitHub 关联标 CONTRIBUTOR）。
- 消费对象：research.md 的 Codex 相关结论与对照表 Codex 列。

## 当前可消费观察

### CX-1

**斜杠命令是 TUI 里的封闭枚举，协议与内核里没有「斜杠命令」这个概念**

- `codex-rs/tui/src/slash_command.rs:7-85`：`enum SlashCommand`，注释「Commands that can be invoked by starting a message with a leading slash」，「Enum order is presentation order in the popup」；共 61 个变体（含 `Rollout`、`TestApproval` 两个只在 debug 构建可见，`:306`）。
- `:89-155`：每个变体的 `description()` 是写死的静态字符串，是补全菜单的描述来源。
- `:23-24,56,63-64,74-75,78-79`：别名靠 strum 声明——`/approve`（变体 `AutoReview`）、`/pwd` 兼收 `cwd`、`/pets` 兼收 `pet`、`/stop` 兼收 `clean`、`/subagents`（变体 `MultiAgents`）。
- `codex-rs/tui/src/bottom_pane/slash_commands.rs:114-119`：`find_builtin_command` 另外把 `g` + 任意多个 `o` + `al` 都解析为 `/goal`（测试 `:208-214` 用 `goooooooooooal`）。
- `codex-rs/protocol/src/` 与 `codex-rs/core/src/`：`grep -rn slash` 只命中 `exclude_slash_tmp` 等路径相关字段，**没有命令名、命令解析或命令事件**。`codex-rs/protocol/src/user_input.rs:16-57` 的 `UserInput` 只有 `Text / Image / LocalImage / Audio / LocalAudio / Skill{name,path} / Mention{name,path}`。
- 支持范围：TUI 是唯一解析 `/` 的地方；app-server 与 exec 的 `/` 行为本轮未读（`codex-rs/app-server-protocol/src` grep `slash` 同样只命中路径字段）。

### CX-2

**识别：只认整段输入第 0 字节的 `/`，名字到第一个空白为止；前导空格与名字里再出现 `/` 是两条「当普通文本发」的出口**

- `codex-rs/tui/src/bottom_pane/prompt_args.rs:1-25`：`parse_slash_name(line)` = `strip_prefix('/')`，名字取到第一个 `char::is_whitespace`，其余 `trim_start` 后为 `rest`；名字为空返回 `None`。
- `codex-rs/tui/src/bottom_pane/chat_composer/slash_input.rs:68-87`：`validate_submission` 对**整段文本**调用 `parse_slash_name`；`input_starts_with_space || name.contains('/')` 直接放行为普通文本；名字查不到则 `UnknownCommand`。
- `codex-rs/tui/src/bottom_pane/chat_composer.rs:3013`：`input_starts_with_space` 取自**未 trim 的原始输入**；`:3028-3031` 随后 `trim_submission` 把首尾空白去掉——于是 `" /x"` 以 `"/x"` 原文送给模型（测试 `:12088-12115` `slash_with_leading_space_submits_as_text` 断言 `text == "/this-looks-like-a-command"`）。
- `chat_composer.rs:12051-12086` 测试 `slash_path_input_submits_without_command_error`：`/Users/example/project/src/main.rs` 作为普通消息提交。
- `slash_input.rs:486`：注释「Slash commands are only valid at byte 0 of the first line」。
- 支持范围：代码与单测。URL（`https://…`）不以 `/` 开头，不进入这条路径；代码块、粘贴文本没有专门分支——粘贴占位符在 `:3018-3026` 先展开，再走同一校验（**推断**：一段以 `/foo bar` 开头的粘贴会被当成未知命令拒收；未见对应单测）。

### CX-3

**未知命令：报错、把原文放回输入框、不发送；排队时延后到出队再判**

- `chat_composer.rs:3034-3056`：`Unrecognized command '/{name}'. Type "/" for a list of supported commands.` 以 info 事件插入历史区，原文、元素、图片、粘贴全部还原，返回 `None`（不提交）。
- `slash_input.rs:125-127`：`should_parse_on_dequeue` = 未以空格开头且 trim 后以 `/` 开头；`:196-207` 排队动作 `ParseSlash / RunShell / Plain`。
- `codex-rs/tui/src/chatwidget/slash_dispatch.rs:1051-1100`：`submit_queued_slash_prompt` 出队时才解析；名字含 `/` 当普通消息；查不到则同样报 `Unrecognized command`，丢弃该排队项并继续出队（`QueueDrain::Continue`）。
- 文档 `developer-commands.md:381-384`（codex-docs 2026-09-20）：「Codex parses queued slash commands when they run, so command menus and errors appear after the current turn finishes」。
- 支持范围：代码、单测（`chatwidget/tests/slash_commands.rs:610-640` `queued_unknown_slash_reports_error_when_dequeued`）与文档一致。

### CX-4

**参数：每条内建命令自己决定吃不吃参数；没有模板占位符语法**

- `slash_command.rs:163-188`：`supports_inline_args()` 白名单 20 条（`review rename new clear fork plan goal voice ide keymap mcp export raw cd pwd usage pets side btw resume`）。
- `slash_input.rs:89-123`：不在白名单的命令只认「首行只有命令名」；带参数时 `inline_command` 返回 `None`，整段按未识别或普通文本处理。
- `slash_dispatch.rs:625-1049`：`dispatch_command_with_args` 按命令逐个解析 `rest`：`/voice settings|mute|stop`、`/mcp verbose`、`/raw on|off`、`/usage daily|weekly|cumulative`、`/goal clear|edit|pause|resume|<objective>`，其余文本各自当名字、路径或指令。
- `chat_composer.rs:3235-3276`：提交顺序是「裸命令（只看首行）→ 带参内联命令 → 普通提交」。**推断**（按代码演算，未见对应单测）：
  - `/model gpt-x`：`/model` 不在白名单，裸命令与内联两步都不认领；`validate_submission` 因名字已知判为 `Valid`，于是整行作为**普通消息**发给模型；
  - `/compact` 换行后再写一段话：首行是裸命令即分派 `/compact`，输入框随即清空（`:3326-3329`），第二行起的文字不发送。
- 支持范围：内建命令。Codex 在本 SHA **没有**用户可定义的 `/` 命令，因此不存在 `$ARGUMENTS` 一类模板语法（见 CX-7）。

### CX-5

**两种性质在同一个枚举里，靠分派代码区分；绝大多数起系统流程，少数把文本作为用户消息提交**

- `slash_dispatch.rs:290-293`：`/init` 把编译进二进制的 `assets/prompt_for_init_command.md` 全文作为用户消息提交（`submit_user_message(INIT_PROMPT…)`）。
- `:855-899`：`/plan <文本>` 先切到计划模式，再把 `<文本>` 作为用户消息提交；计划模式不可用时把 `"/plan "` 前缀拼回原文、放回输入框。
- `:1006-1023`：`/side <文本>`、`/btw <文本>` 起一个临时分叉会话并把 `<文本>` 作为首条用户消息。
- `:1024-1028`：`/review <文本>` 提交 `AppCommand::review(ReviewTarget::Custom{instructions})`。
- `:294-312`：`/compact` 发 `app_event_tx.compact()`；`:552-557`：`/ps` 列后台终端、`/stop` 清后台终端；其余多数打开弹窗、切设置或只在本地显示。
- 支持范围：逐条分派代码。完整清单与每条的归类见[当轮报告](../reports/2026-09-23-slash-command-parsing.md#codex-5c5308f-内建清单)。

### CX-6

**任务运行中：按命令白名单决定可用与否，不可用就报错；插队与排队由 `Tab` 触发**

- `slash_command.rs:236-299`：`available_during_task()` 逐条给出真值（`/compact /new /review /plan /init …` 为 false；`/model /status /ps /stop /goal …` 为 true）。
- `slash_dispatch.rs:137-156,176-188`：不可用时插一条 `'/{cmd}' is disabled while a task is in progress.` 错误，不执行。
- 文档 `developer-commands.md:381-384`：运行中按 `Tab` 把斜杠命令排进下一轮。
- 支持范围：代码与文档。

### CX-7

**用户自定义的 `/` 命令（custom prompts）在本 SHA 已不存在；提示词型入口改由 skill 承担，手势是 `$name`**

- `codex-rs/tui/src/bottom_pane/slash_commands.rs:20-24`：菜单项只有 `Builtin(SlashCommand)` 与 `ServiceTier(ServiceTierCommand)` 两种；`grep -rn "prompts:\|custom_prompt"` 在 `codex-rs` 只命中审阅弹窗的 `CustomPromptView`（一个文本输入框组件），**没有** `~/.codex/prompts` 的加载代码。
- 文档 `manual.md:23462-23523`（codex-docs 2026-09-20）：「Custom prompts are deprecated」，旧形态是 `~/.codex/prompts/*.md`、以 `/prompts:<name>` 调用、`KEY=value` 具名参数。**文档仍描述、代码已删**——两者在本 SHA 分叉，本包以代码为准。
- issue [#17796](https://github.com/openai/codex/issues/17796)（2026-04-14 关闭）维护者回复：「Use `$` to specify a skill, not `/`. We previously supported a feature called "custom prompts", and those could be invoked using `/`. Those were deprecated and removed because skills provide a superset of the functionality.」；[#22674](https://github.com/openai/codex/issues/22674)（2026-05-15）：「We don't have any plans to bring back custom slash commands.」
- `codex-rs/skills/src/mentions.rs:41`：`TOOL_MENTION_SIGIL = '$'`；`:84-160`：在**整段文本任意位置**扫描 `$name` 与 `[$name](path)`；`:226-228` 名字字符 `[A-Za-z0-9_:-]`；`:208-224` 排除 `PATH HOME USER SHELL PWD TMPDIR TEMP TMP LANG TERM XDG_CONFIG_HOME` 这些环境变量名。
- `codex-rs/skills/src/selection.rs:31-109`：结构化 `UserInput::Skill` 先按路径解析；文本里的 `$name` 只在名字**无歧义**时选中（同名多个即跳过，测试 `selection_tests.rs:228` `skips_ambiguous_name`），与连接件 slug 同名时跳过纯名字（`:263`）。
- 支持范围：代码、官方文档与维护者评论。

### CX-8

**展开与留痕：内建命令不进会话记录；提示词型内容以展开后的全文进入**

- 推理链：CX-1 已证协议与内核没有斜杠命令概念，TUI 分派后发往内核的是 `Op`（如 compact）或 `UserMessage`。因此：
  - `/init`：会话记录里只有 `INIT_PROMPT` 全文作为用户消息，**没有 `/init` 字样**（由 `slash_dispatch.rs:290-293` 直接推出）。
  - `/compact`：内核落 `RolloutItem::Compacted`（`codex-rs/core/src/session/session.rs:1584`、`rollout_reconstruction.rs:174`），命令名本身不落。
  - `$skill`：用户原文（含 `$name`）作为 `UserInput::Text`；skill 正文由 `codex-rs/ext/skills/src/extension.rs:482-500` 包成 `SkillInstructions` 片段，`fragments.rs:61-105` 定其角色为 `user`、标记 `<skill>…</skill>`、内容种类 `skills.selected_skill_instructions`。
- `slash_dispatch.rs:353,949,1001`：`/goal` 类命令另写一条本地**召回历史**（`append_message_history_entry("/goal …")`），这是输入框 ↑ 键的历史，不是会话记录。
- 支持范围：代码阅读。**未核对**：`SkillInstructions` 片段是否写入 rollout、写入时的形状（未读 rollout 写入路径）。

### CX-9

**撞名：内建命令对服务档位命令优先；`/` 与 `$` 分属两套符号，内建与 skill 之间没有撞名面**

- `slash_commands.rs:130-149`：`find_slash_command` 先查内建，查不到再查模型目录给出的服务档位命令（如 `/fast`，`:86-107` 插在 `/model` 之后）。
- `slash_commands.rs:70-84`：内建命令按特性开关、平台、侧聊状态过滤可见性；`:109-113` 注释说明侧聊与用量开关故意留给分派阶段报「不可用」，而不是在查找阶段当作未知。
- 支持范围：代码。

### CX-10

**迁移代价：Claude Code 的命令文件迁成 Codex skill 时，凡用了参数占位符或内联 shell 的一律跳过**

- `codex-rs/core-plugins/src/command_migration.rs:418-436`：`has_unsupported_command_template_features` 对 `$ARGUMENTS`、`$0-$9`、`{{…}}`、`` !` ``、`@文件` 返回真；`:343-360` 据此不迁。`codex-rs/external-agent-migration/src/source_cla.rs:140` 调用它迁 Claude Code 的命令目录。
- `:339-341,398-416`：迁过来的 skill 名加前缀 `source-command-`，正文改写成「Use this skill when the user asks to run the migrated source command `<name>`」+ 原模板。
- issue [#15316](https://github.com/openai/codex/issues/15316)（2026-03-20，已关）：用户指出「skills do not currently have first-class named arguments like custom prompts did」。
- 支持范围：代码与用户报告。

### CX-11

**文档与代码的内建清单不一致**

- 文档 `developer-commands.md:388-440` 列出 `/sandbox-add-read-dir`、`/agent`、`/personality`、`/fast`；`slash_command.rs:12-85` 的枚举里**没有** `SandboxAddReadDir`、`Personality`，`/agent` 对应的是 `/agents`（打开 agent 指挥中心）与 `/subagents`，`/fast` 是运行时从模型目录生成的服务档位命令而非枚举成员。
- 反向：枚举里的 `/recap /worktree /voice /agents /export /daemon /warnings /cd /pwd` 不在文档表格里（`/rollout /test-approval` 只在 debug 构建可见，`/debug-m-drop /debug-m-update` 描述为「DO NOT USE」）。
- 支持范围：文档抓取日期 2026-09-20 与提交日期同日，二者仍分叉；本包以代码为准。

### CX-12

**独立用户报告的短板**

- [#29131](https://github.com/openai/codex/issues/29131)（2026-06-19，仍开）：以未知 `/xxx` 开头的消息**发不出去**，只报错并还原；用户要「讨论斜杠命令本身」时受阻（例「how do I use /diff?」不受影响，因为不以 `/` 开头——此括注为本包推断）。
- [#17796](https://github.com/openai/codex/issues/17796)（2026-04-14，已关）：用户以 `/babysit-pr` 开头调 skill 被报 Unrecognized，维护者答「用 `$`」。
- [#15939](https://github.com/openai/codex/issues/15939)（codex-cli 0.117.0，2026-03-27，已关）：升级后自定义斜杠命令从菜单消失，维护者答 skill 是超集。
- [#20548](https://github.com/openai/codex/issues/20548)（0.128.0，已关）：发布说明提到 `/goal`，CLI 却报 Unrecognized（特性开关导致的可见性差异）。
- 检索式与结果留在[当轮报告](../reports/2026-09-23-slash-command-parsing.md#issue-检索记录)。

## 局限

- 只读了 TUI 的 `/` 路径；`codex exec`（非交互）与 app-server 客户端对 `/` 的处理未读。
- 未读 git 史，不知道 custom prompts 删除的确切提交；「已删」由本 SHA 代码缺席与维护者评论两路支持。
- rollout 里 skill 片段的落盘形状未核对（CX-8）。
