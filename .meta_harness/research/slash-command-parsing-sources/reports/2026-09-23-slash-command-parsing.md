# 斜杠命令的识别与解析：Codex `5c5308f`、Claude Code `2.1.280`、DSH `c291e796`、omne-next `6263fed`、pi `3390bd9`（2026-09-23）

**取代状态：** 当前有效，未被取代

- 执行者与日期：assets-runtimes 一程的只读调研子任务，2026-09-23。
- 调查范围：七个问题——识别、语法、两种性质怎么分、展开与留痕、发现与补全、权限与作用域、短板与代价；
  每问以产品基线条款为行、来源为列对照。**不含**任何方案选择。
- 输入与方法：
  - 产品基线（只作对照输入）：[PF-002 §4 Slash Command](../../../design/product/PF-002-assets-settings-and-permissions/design.md#slash-command)（rev 11）、
    [PF-014](../../../design/product/PF-014-inbound-intake-and-queueing/design.md)（rev 3）§5 与 §6、
    [PF-016](../../../design/product/PF-016-cli-tui-delivery-surface/design.md)（rev 3）§5.4、§5.7 与 §9、
    统一语言 [UL-slash-command](../../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command)；
    以及产品负责人 2026-09-23 的裁决（斜杠命令有两种性质：① 提示词的名称，展开成给 agent 的内容；② 触发一条系统业务流程的命令名，如压缩上下文、列后台任务、展示待办）。本轮只当输入，不评价。
  - 来源与取得方式逐条见 [evidence.md](../evidence.md) 与 `notes/` 五份笔记。
- 处置的既有结论：首次调查。与同程 topic [connector-and-slash-command-sources](../../connector-and-slash-command-sources/README.md) 的关系：那边回答「对象形状」（身份、绑定、生命周期），本轮回答「输入怎样被认成命令、怎样展开、留下什么」；重叠处直接引用，只有一处更正（见本报告「对已交付 topic 的补正」）。

## 完整报告正文

### 判定档位的含义

| 档 | 含义 |
|---|---|
| **可承载** | 该来源现有机制按原样就满足这条条款 |
| **需改** | 有对应机制，但形状或语义要改才满足 |
| **不可承载** | 该来源的机制与条款方向相反，照搬即违反 |
| **未覆盖** | 该来源没有对应机制，也没有与之冲突的机制 |
| **未核对** | 本轮没取到足以判定的证据 |

omne-next 的格子凡基于设计而无实现，加注〔设计〕。证据编号链到 `notes/` 各条。

### 总对照表：产品条款 × 五个来源

| # | 产品条款 | Codex `5c5308f` | Claude Code `2.1.280` | DSH `c291e796` | omne-next `6263fed` | pi `3390bd9` |
|---|---|---|---|---|---|---|
| 1 | PF-002 §4「用户敲 `/什么` 触发」——`/` 在哪里算命令 | **可承载**：只认第 0 字节；前导空格、名字含 `/` 都放行为文本（[CX-2](../notes/codex.md#cx-2)） | **可承载**：只认消息开头；首词以标点开头或是路径时当消息（[CC-1](../notes/claude-code.md#cc-1)） | **需改**：注册表只认第 0 字节，skill 手势认整条消息任意位置——同一个 `/` 两套规则（[DS-1](../notes/dsh.md#ds-1)、[DS-2](../notes/dsh.md#ds-2)） | **可承载〔设计〕**：只认开头（[ON-2](../notes/omne-next.md#on-2)）；代码分类器先裁前导空白且不排除路径（[ON-1](../notes/omne-next.md#on-1)） | **可承载**：先 trim 再判开头（[PI-1](../notes/pi.md#pi-1)） |
| 2 | PF-002 §4「身份 = 命令名」 | **需改**：封闭枚举 + 别名（`clean`→`stop`、`gooal`→`goal`），一个身份多个名字（[CX-1](../notes/codex.md#cx-1)） | **需改**：名字由文件位置派生，插件 / 嵌套 / 同步来源带命名空间前缀，bundled 有别名（[CC-4](../notes/claude-code.md#cc-4)） | **需改**：名字之外另有 `definitionId`，一方命令有中英本地化拼写别名（[DS-5](../notes/dsh.md#ds-5)） | **可承载〔设计〕**：恒限定名 `ns:cmd`（[ON-3](../notes/omne-next.md#on-3)） | 未核对 |
| 3 | PF-002 §4 命令「绑定」skill / prompt / 上下文，是指路牌；与 skill 多对多 | **不可承载**：`/` 上没有用户定义命令；skill 自己即入口，手势换成 `$name`（[CX-7](../notes/codex.md#cx-7)） | **不可承载**：「Custom commands have been merged into skills」，skill 名即命令名（[CC-4](../notes/claude-code.md#cc-4)） | **不可承载**：宿主命令是 handler 代码不绑 skill；skill 手势是 skill 自己当入口（[DS-5](../notes/dsh.md#ds-5)；同 E-S9） | **需改〔设计〕**：一条命令至多绑一个 skill（引已交付 topic E-S4） | 未核对 |
| 4 | PF-002 §4「不含键盘控制、shell 命令或系统命令」 | **不可承载**：`/` 下几乎全是宿主动作（[CX-5](../notes/codex.md#cx-5)）；shell 用 `!` | **不可承载**：内建 `local` / `local-jsx` 命令与 skill 共用 `/`（[CC-3](../notes/claude-code.md#cc-3)）；shell 用 `!` | **不可承载**：宿主命令注册表就是宿主动作（[DS-5](../notes/dsh.md#ds-5)） | **需改〔设计〕**：系统查询 / 变更原走 `$`，键盘走键位；但 2026-09-07 修订放开「斜杠必为聊天调用」，压缩类命令可挂在命令协议上（[ON-5](../notes/omne-next.md#on-5)） | **不可承载**：内建命令在 `/` 下（[PI-2](../notes/pi.md#pi-2)） |
| 5 | PF-002 §4 属性：参数提示、绑定目标；权限「谁可以用这个入口」 | **需改**：描述写死在枚举里，无参数提示字段；可用性由特性开关与运行态决定，无按人授权（[CX-1](../notes/codex.md#cx-1)、[CX-6](../notes/codex.md#cx-6)） | **需改**：`argument-hint` / `arguments` 齐；「谁可以用」只有 `Skill(...)` 规则（管模型调用）、`skillOverrides`、`UserPromptExpansion` 钩子与整体开关（[CC-6](../notes/claude-code.md#cc-6)、[CC-9](../notes/claude-code.md#cc-9)） | **需改**：`description` + `input.hint`；没有权限层，可用性等于插件组合（[DS-7](../notes/dsh.md#ds-7)、[DS-8](../notes/dsh.md#ds-8)） | **需改〔设计〕**：可见性与执行资格分离，散在四处（引 E-S7） | 未核对 |
| 6 | PF-002「身份是类别 ＋ name」：同类同名即替代 | **未覆盖**：`/` 下无用户定义命令，谈不上跨层替代 | **需改**：enterprise > personal > project 替代；插件因命名空间不替代而并存；本地 skill 替 bundled skill 但不替其别名（[CC-5](../notes/claude-code.md#cc-5)） | **需改**：agent 作用域遮蔽全局；同作用域重名即抛（[DS-8](../notes/dsh.md#ds-8)） | **不可承载〔设计〕**：限定名下跨命名空间不撞、同命名空间 fail-fast，「不需要任何优先级规则」——同名替代无处发生（[ON-3](../notes/omne-next.md#on-3)） | 未核对 |
| 7 | PF-014 §5.5 / §5.7：斜杠命令是一条入站到达，进队列，落成 `UserMessage`（内容） | **需改**：运行中排队的是**原始 `/…` 行**，出队时才解析与分派（[CX-3](../notes/codex.md#cx-3)）；只有 `/init`、`/plan <文本>` 等少数把文本作为用户消息提交（[CX-5](../notes/codex.md#cx-5)） | **需改**：命令排队到本轮结束，少数立即执行；提示词型展开为一条用户消息（[CC-7](../notes/claude-code.md#cc-7)、[CC-10](../notes/claude-code.md#cc-10)） | **需改**：宿主命令经 RPC 立即执行、不产生模型消息；skill 手势随 prompt 以 `mode:'queue'` 进队（[DS-3](../notes/dsh.md#ds-3)、[DS-5](../notes/dsh.md#ds-5)） | **可承载〔设计〕**：上下文装载型 slash 归约为一条普通 chat 调用；独立排队命令另算（[ON-5](../notes/omne-next.md#on-5)） | 未核对 |
| 8 | PF-014 §5.6：「消息落盘之前」的位置对这条到达可见、可改写、可否决 | **需改**：内建命令从未到达内核（[CX-1](../notes/codex.md#cx-1)），落盘前钩子看不到；提示词型内容作为普通用户输入可见（推断） | **需改**：提示词型有专门的 `UserPromptExpansion`（可否决、可加上下文）；本地内建命令是否触发 `UserPromptSubmit` 未核对（[CC-9](../notes/claude-code.md#cc-9)） | **需改**：`agent/pre-step` 看得到 skill 手势所在的用户消息；宿主命令不经过它（[DS-2](../notes/dsh.md#ds-2)、[DS-6](../notes/dsh.md#ds-6)） | 未核对 | 未核对 |
| 9 | PF-014 §6.1：先落账——每条到达都进会话日志 | **需改**：内建命令名不进会话记录；`/init` 只留展开后全文；另有输入框召回历史（[CX-8](../notes/codex.md#cx-8)） | **可承载**：本地命令三条记录、提示词型两条记录，本机会话记录实测（[CC-7](../notes/claude-code.md#cc-7)） | **可承载**：受理的宿主命令记 `command/run` / `command/done`；未受理的不记，但会作为 prompt 送出（[DS-4](../notes/dsh.md#ds-4)、[DS-6](../notes/dsh.md#ds-6)） | 未核对 | 未核对 |
| 10 | PF-016 §5.7：斜杠命令属会话族；交付面自己的动作到不了 agent 眼前，两者要让人分得出 | **不可承载**：会话动作（`/compact` `/new` `/resume`）与本机动作（`/theme` `/vim` `/pets` `/copy`）同处一个 `/` 菜单，只靠描述文字区分（[CX-1](../notes/codex.md#cx-1)） | **需改**：同处一个菜单；MCP prompt 标「(MCP)」、同步 skill 标来源；会话记录用 `local-command-caveat` 标出本地命令（[CC-4](../notes/claude-code.md#cc-4)、[CC-7](../notes/claude-code.md#cc-7)） | **需改**：客户端自有动作（`/file` `/model`）与宿主命令、skill 同菜单，菜单分「Add」「Commands」两段（[DS-7](../notes/dsh.md#ds-7)） | **可承载〔设计〕**：`/`、`$`、键位三种语法类分开（[ON-5](../notes/omne-next.md#on-5)） | 未核对 |
| 11 | PF-016 §9：交付面动作与斜杠命令撞名时的裁决 | **可承载**：`/` 只有内建，内建先于服务档位命令；提示词入口在 `$`，没有撞名面（[CX-9](../notes/codex.md#cx-9)） | **需改**：有多条规则，但「项目 skill 与非 skill 内建命令同名」文档未覆盖（[CC-5](../notes/claude-code.md#cc-5)） | **可承载**：客户端动作与宿主命令撞名 fail loud；宿主命令先于 skill（[DS-8](../notes/dsh.md#ds-8)） | **可承载〔设计〕**：分符号，无撞名面（[ON-5](../notes/omne-next.md#on-5)） | 未核对 |
| 12 | 2026-09-23 裁决①：提示词的名称，展开成给 agent 的内容 | **不可承载**（经 `/`）：`/` 上无用户提示词命令，只有写死的 `/init`；提示词入口在 `$`（[CX-7](../notes/codex.md#cx-7)） | **可承载**：skill、旧命令文件、插件、MCP prompt、账户同步五路来源（[CC-4](../notes/claude-code.md#cc-4)） | **可承载**：skill 手势（[DS-2](../notes/dsh.md#ds-2)） | **可承载〔设计〕**：上下文装载型 slash（[ON-5](../notes/omne-next.md#on-5)） | **可承载**：提示词模板与 `/skill:<name>`（[PI-1](../notes/pi.md#pi-1)） |
| 13 | 2026-09-23 裁决②：触发一条系统业务流程的命令名 | **可承载**：封闭枚举，插件不能扩（[CX-1](../notes/codex.md#cx-1)、[CX-5](../notes/codex.md#cx-5)） | **可承载**：`local` / `local-jsx` 类型（[CC-3](../notes/claude-code.md#cc-3)） | **可承载**：插件注册 handler，可扩（[DS-5](../notes/dsh.md#ds-5)） | **需改〔设计〕**：系统动作原归 `$`（[ON-5](../notes/omne-next.md#on-5)） | **可承载**：内建 + 扩展命令（[PI-1](../notes/pi.md#pi-1)） |

### 七问逐条

#### 问一：识别

| 输入 | Codex | Claude Code | DSH（Web） | omne-next | pi |
|---|---|---|---|---|---|
| 位置 | 第 0 字节（CX-2） | 消息开头（CC-1） | 注册表第 0 字节；skill 手势任意位置（DS-1、DS-2） | 开头〔设计〕；代码先 lstrip（ON-1、ON-2） | trim 后开头（PI-1） |
| 前导空白 | 当普通文本发，发出去时空白已被裁掉（CX-2） | 文档未写 | 客户端先 trim 再判（DS-3）；注册表本身不 trim（DS-1） | 代码裁掉后照常认（ON-1） | 裁掉后照常认 |
| 多行 | 名字到第一个空白（含换行）；非白名单命令只看首行，其余行被丢弃（推断，CX-4） | 文档未写 | 注册表 `rawInput` 含换行（DS-1） | 文档未写 | 模板正则 `[\s\S]*` 吃掉全部 |
| `/path/to/file` | 普通文本（单测，CX-2） | 普通消息（文档，CC-1） | 两套规则都不认，按 prompt 送出（DS-1、DS-2、DS-3） | 代码认作命令 `path/to/file`；设计要求字面发送路径（ON-1、ON-4） | 不命中模板，按 prompt 送出 |
| URL 里的 `/` | 不在开头，不涉及 | 同左 | 手势要求 `/` 前是空白或行首，`com/a` 不命中（DS-2） | 不涉及 | 不涉及 |
| 代码块里的 `/` | 无专门分支；若整段以 `/` 开头仍按命令判 | 文档未写 | 手势不看代码块边界（推断，DS-2） | 未设计 | 无专门分支 |
| 未知名 | 报错、还原输入、不发（CX-3） | 交互终端报错；其它会话送模型并附说明（CC-2） | 按普通 prompt 送出（DS-4） | fail loud〔设计〕（ON-4） | 按 prompt 送出（PI-1） |

#### 问二：语法

| | Codex | Claude Code | DSH | omne-next | pi |
|---|---|---|---|---|---|
| 命名空间 | 无；另有 `$name` 手势用 `:` 作名字字符（CX-7） | `plugin:name`、`dir:name`、`anthropic-skills:name`、`/mcp__server__prompt`（CC-4） | 无；本地化别名（DS-5） | 恒限定名〔设计〕（ON-3） | `/skill:<name>` 固定前缀（PI-1） |
| 参数 | 每条命令自解析，20 条白名单（CX-4） | `$ARGUMENTS`、`$ARGUMENTS[N]`、`$N`、具名 `$name`，shell 式引号，`\$` 转义，无占位符时追加 `ARGUMENTS:`（CC-6） | `rawInput` 原样，语法归命令自己（DS-1） | 两段式，先查声明；定长位置参数 + 重复具名参数（ON-3） | `$1`、`$@`、`$ARGUMENTS`、`${@:N}` 等（PI-2） |
| 一条消息多个命令 | 不支持 | 只对 skill：最多六个叠加，尾部文本给每个（CC-6） | skill 手势可多个；宿主命令一行一个 | 递归、有上限〔设计〕（ON-3） | 不支持 |
| 命令后跟自由文本 | 白名单命令当参数；其余整行按普通消息或丢弃（推断，CX-4） | 即参数（CC-6） | 即 `rawInput`；`/compact` 带任何文本报用法错误（DS-5） | 解析完剩余即自然语言〔设计〕 | 即参数 |

#### 问三：两种性质怎么分、谁优先、撞名怎么裁

- Codex：两种性质都在同一个枚举里，**在分派阶段**按命令区分（CX-5）；用户定义的提示词入口不在 `/`（CX-7），因此 `/` 下没有「内建 vs 用户定义」的撞名。
- Claude Code：**在命令对象上**有 `type` 判别（`prompt` / `local` / `local-jsx`，CC-3）；撞名规则按来源分层（CC-5），非 skill 内建与项目 skill 同名的裁决文档未覆盖。
- DSH：**在客户端判定阶段**按来源轮询（客户端动作 → 宿主命令 → 无人认领则整行当 prompt，宿主再按 skill 手势扫描），撞名规则固定（DS-3、DS-8）。
- omne-next：**在语法阶段**按前缀分类（`/` / `$` / 键位）〔设计〕；2026-09-07 起允许把压缩类命令挂到命令协议上（ON-5）。

各家内建清单见下节。

#### 问四：展开与留痕

| | 提示词型：会话记录里存什么 | 模型看到什么 | 系统流程型：进不进会话记录 |
|---|---|---|---|
| Codex | 只有展开后全文（`/init`）；`$skill` 原文 + 注入片段（CX-8） | 展开后全文 / `<skill>` 片段 | 不进（命令名不到内核）；效果本身可能落（如压缩检查点）（CX-8） |
| Claude Code | 原命令一条（`<command-name>` 等标签）+ 展开全文一条（`isMeta`）（CC-7） | 展开全文（文档：「enters the conversation as a single message」）；原命令标签是否送模型未核对 | 进：告诫 + 命令 + 输出三条（CC-7）；是否送模型未核对 |
| DSH | 原文 `/name …` 一条 + 注入 skill 正文一条（推断持久，DS-6） | 原文 + `<skill_content>` 注入 | 进：`command/run` / `command/done` log-only 事件，不是模型消息（DS-6） |
| omne-next | 未设计到这一层 | 归约为一条 chat 调用〔设计〕 | 未核对 |
| pi | 展开后全文（推断，PI-2） | 展开后全文 | 未核对 |

#### 问五：发现与补全

| | 清单来源 | 元数据 | 刷新 |
|---|---|---|---|
| Codex | 内建枚举 + 模型目录给出的服务档位命令（CX-1、CX-9）；`$` 另有 skill 菜单 | 枚举里写死的描述 | 编译期固定；服务档位随模型目录 |
| Claude Code | 内建 + bundled skill + 个人 / 项目 / 嵌套 skill + 旧命令文件 + 插件 + MCP prompt + 账户同步（CC-4） | `description`、`when_to_use`、`argument-hint`；MCP prompt 的参数定义 | 目录监视即时生效；`/reload-skills`、`/reload-plugins`；同步约 10 分钟；MCP 动态（CC-8） |
| DSH | 宿主注册表（按 agent 遮蔽后）+ 客户端贡献 + skill 目录（DS-7） | `description`、`input.hint`；一方命令本地化文案 | `commands/change` 广播；切 preset 重置（DS-7） |
| omne-next | 按用户 / 租户 / agent / 会话 / 客户端能力 / 撤销水位裁剪的有效目录〔设计〕（引 E-S7） | 限定名 + 描述 + 参数声明〔设计〕 | epoch 快照、落后即 fail-closed〔设计〕 |

#### 问六：权限与作用域

| | 分层遮蔽 | 能否禁用 | 执行走不走工具权限 |
|---|---|---|---|
| Codex | 无用户层 | 特性开关、平台、侧聊与运行态决定可见 / 可用（CX-6、CX-9）；嵌入式输入框整体关闭 `/`（`chat_composer.rs:538-580`） | 分派在 TUI；`/init` 等提交的消息随后照常走审批 |
| Claude Code | enterprise > personal > project；插件并存（CC-5） | `skillOverrides`、`disable-model-invocation`、`user-invocable`、`--disable-slash-commands`、`UserPromptExpansion` 拦截（CC-9） | 人敲的 `/skill` 绕过 `PreToolUse`；`allowed-tools` 在调用那一轮免审批，且不受工作区信任门控（CC-9） |
| DSH | agent 作用域遮蔽全局（DS-8） | 插件不装即无；skill 的 `userInvocable` | 宿主命令 handler 直接调领域 API，不经工具（DS-5） |
| omne-next | 限定名，无遮蔽〔设计〕 | 挂起 / 撤销 / 策展（引 E-S11） | 资格在执行端判〔设计〕（ON-4） |

#### 问七：短板与代价

见本节后「歧义案例集」与「issue 检索记录」，以及 research.md「短板与代价」各条。

### Codex `5c5308f` 内建清单

分派位置均在 `codex-rs/tui/src/chatwidget/slash_dispatch.rs`（无参 `:190-619`，带参 `:761-1045`）；描述在 `slash_command.rs:89-155`。
归类：**进对话** = 会产生一条用户消息或一次模型任务；**起流程** = 改会话 / 宿主状态或起后台过程；**本机** = 只影响本机界面或显示。

| 归类 | 命令（行号为分派分支） |
|---|---|
| 进对话 | `/init`（:290，提交写死 prompt）· `/plan <文本>`（:855，切模式 + 文本作用户消息；无文本时只切模式 :343）· `/side`、`/btw <文本>`（:1006，文本作分叉会话首条消息）· `/review <文本>`（:1024，审阅任务） |
| 起流程 | `/compact`（:294）· `/recap`（:313）· `/review`（无参，:323 开审阅弹窗）· `/new`（:204）· `/archive`（:207）· `/delete`（:235）· `/clear`（:268）· `/resume`（:271）· `/fork`（:274）· `/worktree`（:277）· `/app`（:280）· `/rename`（:334）· `/model`（:339）· `/goal`（:346 / :900）· `/voice`（:361）· `/permissions`（:373）· `/setup-default-sandbox`（:391）· `/approve`（:442）· `/memories`（:445）· `/logout`（:451）· `/import`（:496）· `/cd`（:520）· `/ps`（:552）· `/stop`（:555）· `/ide`（:534）· `/daemon`（:503）· `/usage`（:529）· `/experimental`（:439）· `/debug-m-drop`、`/debug-m-update`（:558、:561，占位）· 服务档位命令如 `/fast`（`handle_service_tier_command_dispatch` :57） |
| 本机 | `/keymap`（:388）· `/vim`（:385）· `/agents`（:367）· `/subagents`（:370）· `/copy`（:454）· `/export`（:457）· `/raw`（:460）· `/diff`（:464）· `/mention`（:490，插入 `@`）· `/skills`（:493，打开菜单插入 `$name`）· `/hooks`（:500）· `/warnings`（:504）· `/status`（:505）· `/pwd`（:523）· `/debug-config`（:537）· `/title`（:540）· `/statusline`（:543）· `/theme`（:546）· `/pets`（:549）· `/mcp`（:564）· `/apps`（:567）· `/plugins`（:570）· `/quit`、`/exit`（:448）· `/feedback`（:191）· `/rollout`（:573，debug）· `/test-approval`（:586，debug） |

文档（`developer-commands.md:388-440`）与枚举的差异：文档有而枚举无——`/sandbox-add-read-dir`、`/personality`、`/agent`（枚举是 `/agents` 与 `/subagents`）；`/fast` 在代码里是服务档位命令。枚举有而文档表无——`/recap /worktree /voice /agents /export /daemon /warnings /cd /pwd`，以及 debug 构建才可见的 `/rollout /test-approval` 与占位的 `/debug-m-drop /debug-m-update`（逐行比对，见 CX-11）。

### Claude Code `2.1.280` 内建清单

来源：`sources/claude-code-commands-2026-09-23.txt:52-165`（114 行，含三条已移除：`/pr-comments` :117、`/ultraplan` :154、`/vim` :161）。
文档自己的标注只有两种：**Skill**（bundled skill，提示词型）与 **Workflow**；其余是「built-in commands whose behavior is coded into the CLI」。下表「文档标注」照抄；「本包归类」是**按文档用途句推断**，不是实现读数。

| 文档标注 | 命令（行号） | 本包归类 |
|---|---|---|
| Skill | `/batch`(60) `/claude-api`(66) `/code-review`(68) `/dataviz`(75) `/debug`(76) `/design`(78) `/design-sync`(80) `/doctor`(83) `/fewer-permission-prompts`(89) `/loop`(106) `/run`(131) `/run-skill-generator`(132) `/simplify`(139) `/update-config`(156) `/verify`(160) `/workflow-authoring`(164)；别名 `/review`(129) | 进对话 |
| Workflow | `/deep-research`(77) | 进对话（后台扇出） |
| 无标注，但文档说可经 Skill 工具调用 | `/init`(98)、`/security-review`(136)（`slash-commands.txt:749`） | 进对话（推断为 `prompt` 类型） |
| 无标注，用途句写「Claude …」 | `/schedule`(134)「Claude walks you through the setup conversationally」· `/statusline`(144)「Describe what you want」· `/team-onboarding`(149)「Claude analyzes your sessions」· `/insights`(99) | 未判（可能进对话） |
| 无标注，起流程 | `/add-dir`(52) `/advisor`(53) `/auto-mode-setup`(56) `/autocompact`(57) `/autofix-pr`(58) `/background`(59) `/branch`(61) `/cd`(64) `/clear`(67) `/compact`(70) `/config`(71) `/effort`(84) `/fast`(87) `/fork`(91) `/goal`(92) `/import`(97) `/login`(104) `/logout`(105) `/mcp`(107) `/memory`(108) `/model`(110) `/output-style`(111) `/permissions`(113) `/plan`(114) `/plugin`(115) `/recap`(121) `/reload-plugins`(123) `/reload-skills`(124) `/remote-control`(125) `/remote-env`(126) `/rename`(127) `/resume`(128) `/rewind`(130) `/sandbox`(133) `/stop`(146) `/subtask`(147) `/tasks`(148) `/teleport`(150) `/tui`(153) `/ultrareview`(155) `/voice`(162) `/workflows`(165) `/btw`(62，旁问，「without adding to the conversation」) | 起流程（`/plan <描述>`、`/background <提示>`、`/fork <提示>`、`/subtask <任务>` 另把文本交给某个 agent） |
| 无标注，本机 | `/agents`(54) `/artifacts`(55) `/bug`(63) `/chrome`(65) `/color`(69) `/context`(72) `/copy`(73) `/cost`(74) `/design-login`(79) `/desktop`(81) `/diff`(82) `/exit`(85) `/export`(86) `/feedback`(88) `/focus`(90) `/heapdump`(93) `/help`(94) `/hooks`(95) `/ide`(96) `/install-github-app`(100) `/install-slack-app`(101) `/keybindings`(102) `/list-agents`(103) `/mobile`(109) `/passes`(112) `/powerup`(116) `/privacy-settings`(118) `/radio`(119) `/rate-limit-options`(120) `/release-notes`(122) `/scroll-speed`(135) `/setup-bedrock`(137) `/setup-vertex`(138) `/skill-doctor`(140) `/skills`(141) `/stats`(142) `/status`(143) `/stickers`(145) `/terminal-setup`(151) `/theme`(152) `/upgrade`(157) `/usage`(158) `/usage-credits`(159) `/web-setup`(163) | 本机 |

实测旁证：`/compact`、`/model`、`/tasks`、`/goal` 在会话记录里以本地命令三条形态出现（CC-7），与「起流程 / 本机」归类一致；`/claude-api` 以提示词型两条形态出现。

### DSH `c291e796` 内建清单

| 命令 | 实现 | 归类 |
|---|---|---|
| `/compact` | 宿主，`packages/compaction/command-compact/src/index.ts:101-106`；带参数即报用法错误 | 起流程 |
| `/goal` | 宿主，`packages/goal/command-goal/src/index.ts:191-197`；带附件时 `followup` 一条用户消息（:119） | 起流程（可附带进对话） |
| `/plan` | 宿主，`packages/plan/plan-mode/src/index.ts:226-231`；`/plan <message>` 时 `steer` 一条用户消息（:255） | 起流程（可附带进对话） |
| `/export` | 宿主，`packages/session-query/session-log-export/src/index.ts:79-83` | 本机（下载会话日志） |
| `/permission` | 宿主，`packages/interaction/permission-presets/src/index.ts:257-262` | 起流程 |
| `/feedback` | 宿主，`packages/feedback/command-feedback/src/index.ts:119-124`；客户端另有裸调用装饰 | 起流程（写反馈记录） |
| `/file` | 客户端 action，`packages/client/ui-conversation/src/client/apply.ts:214-219` | 本机 |
| `/model` | 客户端 popupSelect，`packages/client/ui-model-selection/src/client/index.ts:144-150` | 起流程（经客户端调宿主） |
| `/<skill-name>` | skill 手势，`packages/skill/tool-skill/src/index.ts:177-203` | 进对话 |

### omne-next `6263fed`

无已交付的命令（E-S2）。设计上的三类：键位（控制）、`/`（上下文装载，串行）、`$`（系统查询 / 变更，非串行）；2026-09-07 起「压缩」等独立排队命令从 chat 归约里划出（ON-5）。

### pi `3390bd9` 内建清单

`packages/coding-agent/src/core/slash-commands.ts:19-44` 共 24 条（PI-2），外加扩展命令、`/skill:<name>`、提示词模板三类来源。

### 歧义案例集

每格给出该来源的实际（或按代码 / 文档推出的）处理，括号为证据编号；「推断」表示未见单测或实测。

| # | 输入 | Codex | Claude Code | DSH（Web） | omne-next | pi |
|---|---|---|---|---|---|---|
| A1 | `/usr/bin/python 为什么报错` | 普通消息（CX-2，单测） | 普通消息（CC-1，文档） | 两套规则都不认 → 普通 prompt（DS-1、DS-2、DS-3） | 代码：命令名 `usr/bin/python`（ON-1，推断）；设计：须走字面路径（ON-4） | 普通 prompt（PI-1，推断） |
| A2 | ` /foo`（前导空格） | 普通消息，送出的文本是 `/foo`（CX-2，单测） | 文档未写 | trim 后与 `/foo` 同判（DS-3，推断） | 与 `/foo` 同判（ON-1） | 与 `/foo` 同判（PI-1） |
| A3 | `/foo bar`（无此命令） | 报错、还原、不发（CX-3，单测） | 交互终端报错；`-p` 等送模型并附说明（CC-2） | 普通 prompt（DS-4） | fail loud〔设计〕（ON-4） | 普通 prompt（PI-1） |
| A4 | `请看 /tmp 目录` | 普通消息（不在开头） | 普通消息（不在开头） | 若存在名为 `tmp` 的 user-invocable skill，则注入该 skill（DS-2，推断） | 普通文本〔设计〕（ON-2） | 普通 prompt |
| A5 | `https://a.com/review` | 普通消息 | 普通消息 | `/review` 前是 `m` 不是空白，不命中（DS-2） | 普通文本 | 普通 prompt |
| A6 | `/model gpt-x`（命令存在但不收参数） | 整行作为普通消息发给模型（CX-4，推断） | 文档：`/model [model]` 收参数 | 客户端 `/model` 只认裸调用；带参行客户端不认领、宿主无同名命令，无人认领 → 普通 prompt（`service.ts:292-301`，DS-3） | 未设计 | 命中 `/model ` 前缀，余下文字作模型搜索词（`interactive-mode.ts:3058-3059`） |
| A7 | `/compact` 换行 `请保留 X` | 分派 `/compact`，第二行被清掉不发（CX-4，推断） | `/compact [instructions]` 收参数，是否跨行未写 | 宿主 `/compact` 带任何文本报用法错误（DS-5） | 未设计 | 不命中 `text === "/compact"`，命中 `startsWith("/compact ")`？——换行不是空格，推断不命中，整段当 prompt |
| A8 | `/a /b 做 X`（两个提示词命令） | 不支持 | 两个 skill 都加载，`做 X` 给两者（CC-6） | 两个手势都注入（DS-2） | 递归两条命令〔设计〕（ON-3） | 只看第一个 |
| A9 | `/Deploy`（大小写） | strum 按 kebab-case 解析，大写查不到 → 未知（推断） | 同步 skill 比较忽略大小写（CC-5）；本地命令大小写未写，见 issue #79981 | 注册表只收小写，查不到 → prompt（DS-1、DS-4） | 未设计 | 字符串相等比较，查不到 → prompt |
| A10 | `/` 开头的大段粘贴 | 粘贴先展开再校验，名字未知即拒收（CX-2，推断） | 移动端粘贴不触发执行（issue #60781，2.1.145） | 与键入同判（推断） | 未设计 | 与键入同判 |
| A11 | 运行中发 `/compact` | 运行中不可用，报错（CX-6） | 排队到本轮结束（CC-10） | 立即经 RPC 执行（DS-5） | 独立排队命令，等安全点〔设计〕（ON-5） | 未核对 |

### Claude Code 实例探针

对 `strings -n 6 claude.exe`（511 009 行）用 `grep -c -F` 计行数：`<command-name>` 11、`<command-message>` 2、`<command-args>` 2、`<local-command-stdout>` 6、`local-command-caveat` 2、`Unknown command: ` 5、`Did you mean` 45、`isMeta` 175、`UserPromptExpansion` 21、`expansion_type` 5、`disableSlashCommands` 13、`disable-slash-commands` 5、`mcp_prompt` 4、`userInvocable` 47、`user-invocable` 22、`ARGUMENTS:` 4、`skillOverrides` 19；
用 `grep -o -F | wc -l` 计出现次数：`type:"local-jsx"` 84、`type:"local"` 48、`type:"prompt"` 19、`case"local-jsx"` 2、`case"local"` 29、`case"prompt"` 8、`shouldQuery` 151、`isNonInteractiveSession` 162、`cmd_unknown` 5、`unknown_command_fallback` 6。
全部探针都有命中；本轮没有基于「零命中」写任何负面结论。

### issue 检索记录

2026-09-23 用 `gh search issues --repo <repo> "<检索式>" --limit 8`：

- anthropics/claude-code：`slash command path treated as command`（0）、`skill same name as built-in command`（0）、`unknown command`（8：#88387 #89216 #90515 #95107 #82349 #79981 #88814 #95000）、`slash command middle of message`（0）、`skill expanded transcript`（0）、`multiple slash commands`（8：#93076 #89398 #49780 #56082 #52250 #37987 #45606 #49412）、`custom command shadow`（0）、`slash command pasted`（1：#60781）；另一次 `slash command` 前 5 条含 #92545（可配置触发前缀）、#85429。
- openai/codex：`custom prompts removed`（0）、`custom prompts deprecated`（1：#15316）、`prompts slash command arguments`（0）、`unrecognized command`（8：#29131 #24929 #23532 #17796 #20548 #22028 #20279 #19968）、`slash command path`（8，与主题无关的居多）、`skill slash command`（3：#31088 #40224 #19249）、`slash command queue`（0）、`custom slash commands`（8：#27515 #31666 #8925 #15939 #13893 #22674 #10848 #7480）。
- 细读正文的：CC #95000 #89398 #88814 #60781 #85429；Codex #29131 #17796 #15316 #15939 #22674。其余只读标题，未据以下结论。
- 「0 条」只说明这些检索式在 `gh search` 的前 8 条里没有命中，不证明该类问题不存在。

### 对已交付 topic 的补正

[connector-and-slash-command-sources](../../connector-and-slash-command-sources/README.md) 的 E-S13 与其 research.md「撞名」一条写 DSH「未知 `/xxx` 行被适配器拒绝，不变成 prompt」，依据是 `packages/interaction/commands/README.md` 与 `packages/client/ui-commands/README.md`。本轮读到 Web 客户端的判定代码：无人认领的 `/xxx` 走默认发送，成为 prompt（DS-3、DS-4）。**这是那边记录的文档说法与本 SHA 代码的分叉**，不是本轮推翻其观察——那边写明了「未读候选合成的实现，也未读 TUI 的 `/` 处理」。是否在那个 topic 记演进事件，由派发者决定。

## 本轮结论

见 [research.md](../research.md)，本轮结论与之一致，不另起副本。

## 本轮局限

- Codex 的 TUI 源码来自一份不钉的本机克隆，已与钉住 tarball 的公共部分逐文件比对一致，但 TUI 本身没有钉存字节。
- Claude Code 无源码；实现层面只有字符串探针与本机会话记录，`/compact`、`/goal` 的会话记录样本来自 2.1.227。
- 未做任何运行实验：「推断」格子都没有被构造反例验证过。
- 未读 Codex `exec` / app-server、CC 非交互路径的实现、DSH git 史、pi 的持久化。
