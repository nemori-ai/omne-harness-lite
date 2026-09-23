# 斜杠命令的识别与解析：五个来源现在该信什么

- 调查对象与日期：Codex `5c5308fc9a9ee789049d646ef11e5400384b9c6f`；Claude Code `2.1.280`（官方文档 2026-09-23 抓取 + 本机实例 + 本机会话记录）；
  DSH `c291e7961a515f6d7af9304e7fd1d257929aef26`；omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；pi `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`（只作对照）。2026-09-23。
- 消费者：本程 proposal「斜杠命令识别与解析基线」（待出现）。
- 最近核对：2026-09-23 / 上列版本。
- 当前结论：五个来源都在输入**开头**认 `/`（DSH 的 skill 手势是唯一的任意位置例外）；
  对「不存在的命令名」给出四种互不相同的处理；四家都让「展开成提示词的命令」与「宿主内置动作」共用 `/`，
  区分发生在不同阶段；只有 Claude Code 的会话记录同时留下原命令与展开全文。
  产品正文对未知命令、字面发送、留痕形态、运行中时机、参数语法都还没有说法，
  且 2026-09-23 裁决的「系统业务流程命令」在现有产品正文里没有落点——见「对照产品正文时撞上的缺口」。

本页不拥有方案选择：每条结论写到「这条事实让什么变得不可能、什么要额外付出代价」为止。
完整对照表（13 条产品条款 × 5 个来源，五档判定）、各家内建清单与歧义案例集在[当轮报告](reports/2026-09-23-slash-command-parsing.md)。

## 问题与区分条件

七问：识别、语法、两种性质怎么分、展开与留痕、发现与补全、权限与作用域、短板与代价。
产品基线：[PF-002 §4 Slash Command](../../design/product/PF-002-assets-settings-and-permissions/design.md#slash-command)（rev 11）、
[PF-014](../../design/product/PF-014-inbound-intake-and-queueing/design.md) §5 / §6（rev 3）、
[PF-016 §5.7](../../design/product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) 与 [§9](../../design/product/PF-016-cli-tui-delivery-surface/design.md#九未决项)（rev 3）、
[UL-slash-command](../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command)，
以及产品负责人 2026-09-23 裁决（两种性质：① 提示词的名称；② 触发系统业务流程的命令名）。

会改变判断的观察：Codex 的 app-server / exec 或 Claude Code 的非交互路径对 `/` 另有一套规则；DSH 在本 SHA 之后恢复终端 TUI 并拒收未知命令；
Claude Code 的会话记录里本地命令三条其实不送模型（会改写「模型看到什么」一行）。

## 证据入口

逐条来源在 [evidence.md](evidence.md)，按来源拆成五份笔记：Codex（CX-n）、Claude Code（CC-n）、DSH（DS-n）、omne-next（ON-n）、pi（PI-n）。
下文每条结论的「来源」给出这些编号。

## 当前结论 · 识别与语法

### 五个来源都只把输入开头的 `/` 认作命令，唯一的例外是 DSH 的 skill 手势

Codex 只认整段输入第 0 字节（CX-2）；Claude Code 文档写明「only recognized at the start of your message」（CC-1）；
DSH 宿主命令注册表只认第 0 字节（DS-1）；omne-next 设计只认开头并明确拒绝了根级 ADR 原先的「任意位置」（ON-2）；pi 先 trim 再判开头（PI-1）。
例外：DSH 的 skill 手势在整条用户消息里任意位置、被空白包围的 `/name` 都算（DS-2）。

- 适用范围：各来源上列版本的交互输入路径。Codex 的 exec / app-server、Claude Code 的非交互实现未读。
- 代价与不适用：「只认开头」让「一句话中间提到一个命令」不可能触发它——Codex 用户以 `/skill` 开句被拒后改用 `$`（issue #17796）；
  Claude Code 用户要求一行多个内建命令（#93076）。DSH 的任意位置手势让 `请看 /tmp 目录` 在恰有名为 `tmp` 的 skill 时注入该 skill（推断，DS-2）。
  omne-next 记录了取舍理由：任意位置解析与「剩余文本仍以 `/` 开头则递归下一条」的切分规则不相容（ON-2）。
- 来源：CX-2、CC-1、DS-1、DS-2、ON-2、PI-1
- 最近核对：2026-09-23 / 上列版本

### 前导空白、路径与名字字符集，五个来源各给一套边界，没有两家相同

Codex：前导空格是「当普通文本发」的出口，名字里再出现 `/` 也放行为文本（CX-2，单测）。
Claude Code：首词以标点开头或是路径时当普通消息（CC-1，文档）；前导空白未写。
DSH：注册表名字限 `[a-z][a-z0-9_-]*` 且后接空白或行尾，`/usr/bin` 与 `/Users/x` 因此不被认领（DS-1，推断）；客户端先 trim（DS-3）。
omne-next：分类器代码先 `lstrip`，且**不排除路径**——`/usr/bin/python` 在代码里被认作命令名 `usr/bin/python`（ON-1，推断）；设计另要求一条字面发送路径（ON-4）。
pi：先 trim，不命中任何命令的原样当 prompt（PI-1）。

- 适用范围：上列版本。只有 Codex 的两条出口有单测；其余是文档、代码阅读或推断。
- 代价与不适用：Codex 的前导空格出口在提交前被 trim 掉，模型收到的文本仍以 `/` 开头（CX-2）——「字面发送」与「送达的字面」不是同一件事。
  omne-next 的代码与其设计在「路径算不算命令」上方向相反（ON-1 对 ON-4）。
- 来源：CX-2、CC-1、DS-1、DS-3、ON-1、ON-4、PI-1
- 最近核对：2026-09-23 / 上列版本

### 对不存在的命令名，五个来源给出四种处理，其中 Claude Code 按会话形态分叉且两个版本内改了两次

| 处理 | 来源 |
|---|---|
| 报错、原文放回输入框、**不发送** | Codex（CX-3，单测） |
| 交互终端报错；`-p`、SDK、桌面、IDE、云会话**送模型并附「命令没执行」说明** | Claude Code（CC-2） |
| **当普通 prompt 送出** | DSH Web 客户端（DS-4）、pi（PI-1） |
| **fail loud**，另须显式字面发送路径 | omne-next〔设计〕（ON-4） |

- 适用范围：上列版本。Claude Code 的规则 v2.1.273 之前是「一律 Unknown」，v2.1.273 只对云会话改为送模型，v2.1.274 扩到全部非交互形态（CC-2）。
- 代价与不适用：拒收让「以 `/` 开头讨论命令本身」发不出去（Codex #29131，仍开）；送模型让一次拼写错误变成一次付费调用，
  同一输入在 2.1.274 七次成本 $0.009–$0.123（Claude Code #95000，仍开），且脚本拿不到非零退出码（#88387，仍开）；
  当 prompt 送出则拼错的动作命令不报错、悄悄变成一句话——DSH 作者在 2026-07-19 的决策记录里正是以此否决了这种做法（DS-4），而本 SHA 的 Web 客户端却是这样做的。
- 撞上这条事实会怎样：同一个交付面若同时有交互与脚本两种入口，照搬 Claude Code 的形态分叉，会让同一行输入在两处得到不同后果。
- 来源：CX-3、CC-2、DS-4、ON-4、PI-1
- 最近核对：2026-09-23 / 上列版本

### 只有 Claude Code 与 pi 有提示词模板的参数占位符；Codex 与 DSH 由每条命令自解析；这些占位符迁到 Codex skill 时整条被放弃

Claude Code：`$ARGUMENTS`、`$ARGUMENTS[N]`、`$N`、具名 `$name`，shell 式引号，`\$` 转义，没有占位符时在正文末尾追加 `ARGUMENTS: <输入>`（CC-6，本机会话记录实测追加行为）。
pi：`$1`、`$@` / `$ARGUMENTS`、`${@:N}` 等（PI-2）。Codex：20 条内建命令各自解析参数，其余不收参数（CX-4）。DSH：名字后的全部文本原样交给 handler（DS-1）。
omne-next〔设计〕：先查声明再按 UNIX CLI 语法解析，禁止可变数量位置参数（ON-3）。

- 适用范围：上列版本。
- 代价与不适用：Codex 的迁移器把含 `$ARGUMENTS`、`$0-$9`、`{{…}}`、内联 shell、`@文件` 的 Claude Code 命令文件一律**跳过不迁**（CX-10）——
  带占位符的提示词命令在两家之间不可移植。Codex 按命令自解析的代价在边界上：`/model gpt-x` 这类「名字已知但不收参数」的行按代码推断会整行作为普通消息发给模型；
  `/compact` 换行后的文字会被清掉（CX-4，推断）。Claude Code 的叠加只对 skill 成立、最多六个，遇到 fork 型 skill 或 `/loop` 即停（CC-6）。
- 来源：CC-6、PI-2、CX-4、CX-10、DS-1、ON-3
- 最近核对：2026-09-23 / 上列版本

## 当前结论 · 两种性质

### 四个有实现的来源都让「展开成提示词的命令」与「宿主内置动作」共用 `/`，区分发生在四个不同阶段

| 来源 | 在哪一步区分 | 依据 |
|---|---|---|
| Codex | **分派**：同一个封闭枚举，逐条分派代码决定是提交用户消息还是起宿主动作 | CX-1、CX-5 |
| Claude Code | **命令对象**：`type` 为 `prompt` / `local` / `local-jsx`（字符串探针） | CC-3 |
| DSH | **客户端判定**：客户端动作 → 宿主命令 → 无人认领则整行当 prompt，宿主再扫 skill 手势 | DS-3、DS-5 |
| pi | **固定认领顺序**：TUI 内建 → 扩展命令 → `/skill:` → 提示词模板 | PI-1 |

omne-next 的设计在**语法阶段**就分开：`/` 是上下文装载，`$` 是系统查询 / 变更，键位是控制；但 2026-09-07 修订写明「命令效果与触发语法解耦，压缩等命令可以等待安全执行点」（ON-5）。

- 适用范围：上列版本。Claude Code 的 `type` 判别只有字符串证据，不知道在解析流程哪一步生效（CC-3）。
- 代价与不适用：共用 `/` 让「这一行会不会被 agent 看到」无法从拼写判断，只能靠菜单描述或事后记录——
  Codex 菜单里 `/compact` 与 `/theme` 并列，只靠描述文字区分（报告对照表第 10 行）。分符号（omne-next）消除撞名面，代价是用户要记两套前缀，且 `$` 只能是 official（引已交付 topic E-S12）。
- 来源：CX-1、CX-5、CC-3、DS-3、DS-5、PI-1、ON-5
- 最近核对：2026-09-23 / 上列版本

### Codex 在 `5c5308f` 已删除用户定义的 `/` 命令：`/` 只剩系统流程型与一条写死的提示词，提示词入口改为 skill 的 `$name`

代码里 `/` 菜单只有内建枚举与服务档位命令两种，没有 `~/.codex/prompts` 的加载代码（CX-7）；`/init` 把编译进二进制的提示词全文作为用户消息提交（CX-5）。
skill 以 `$name` 在整段文本任意位置被识别，歧义名跳过、常见环境变量名排除（CX-7）。维护者在 issue 里写明 custom prompts「deprecated and removed」、「no plans to bring back custom slash commands」（CX-7）。
同日文档仍在描述 `/prompts:<name>`（CX-7）——**文档与代码分叉**，本条以代码为准。

- 适用范围：Codex `5c5308f` 的 TUI。
- 代价与不适用：skill 没有具名参数（Codex #15316 的用户原话，CX-10）；以 `/` 开头调 skill 被拒（#17796）；升级后自定义命令从菜单消失（#15939，0.117.0）。
  「提示词的名称」在 Codex 里不经 `/` 承载（报告对照表第 12 行判「不可承载」）。
- 来源：CX-5、CX-7、CX-10
- 最近核对：2026-09-23 / Codex `5c5308f`

### Claude Code 把用户定义命令并入 skill：命令名就是 skill 名，由文件位置派生，没有独立的命令对象

「Custom commands have been merged into skills」；`.claude/commands/x.md` 与 `.claude/skills/x/SKILL.md` 都生成 `/x`（CC-4）。
个人 / 项目 skill 的命令名取**目录名**，frontmatter `name` 只改显示；插件、嵌套目录、账户同步来源带命名空间前缀；MCP prompt 以 `/server:prompt (MCP)` 出现（CC-4）。

- 适用范围：Claude Code 2.1.280 文档。
- 代价与不适用：一个 skill 只能有一个用户入口（bundled skill 的别名除外），「同一 skill 多个入口」与「一个入口绑 skill 加一段 prompt」都没有表达位置——
  与 PF-002「绑定关系是多对多」方向相反（报告对照表第 3 行，与已交付 topic 对 DSH 的判断同向）。名字含空格时只取第一个词（#88814）。
  自定义命令无法触发内建命令（#85429，「Custom slash commands are prompts, so they can't trigger built-in commands」）。
- 来源：CC-4、CC-6
- 最近核对：2026-09-23 / Claude Code 2.1.280

## 当前结论 · 展开与留痕

### Claude Code 的会话记录对提示词型命令同时保存原命令与展开全文，对系统流程型命令保存「告诫 + 命令 + 输出」三条

本机会话记录实测（2.1.280）：`/worktree-discipline <参数>` 留两条 user 记录——一条是 `<command-message>` / `<command-name>` / `<command-args>` 标签，一条 `isMeta: true` 的展开全文（末尾追加 `ARGUMENTS:`）；
`/model`、`/tasks` 留三条——`isMeta` 的 `<local-command-caveat>`（「DO NOT respond to these messages」）、命令标签、`<local-command-stdout>`（CC-7）。
文档另说展开正文「enters the conversation as a single message」并在压缩后按预算重新附上（CC-7）。

- 适用范围：本机用过的命令与版本；`/compact`、`/goal` 的同形样本来自 2.1.227。
- 代价与不适用：本地命令的三条记录**是否送进模型请求**本轮未核对（未抓请求体）；告诫文本是写给模型的，这是间接依据，不是直接观察。
  两条并存意味着「原文」与「展开」在记录里各有一份，任何只读其中一条的下游会得到不同的「用户说了什么」。
- 来源：CC-7
- 最近核对：2026-09-23 / Claude Code 2.1.280（部分样本 2.1.227）

### Codex 的内建命令不进会话记录；提示词型内容只以展开后的全文进入

协议与内核里没有斜杠命令概念，`UserInput` 没有命令变体（CX-1）；`/init` 在会话记录里只剩提示词全文（CX-8）；`/compact` 落的是压缩检查点，不是命令名（CX-8）。
输入框另有本地召回历史记 `/goal …` 等，那不是会话记录（CX-8）。

- 适用范围：Codex `5c5308f` TUI；由代码推出，未读 rollout 写入路径（skill 片段的落盘形状未核对）。
- 代价与不适用：事后无法从会话记录区分「用户敲了 `/init`」与「用户粘贴了同样一段话」。
- 来源：CX-1、CX-8
- 最近核对：2026-09-23 / Codex `5c5308f`

### DSH 的宿主命令只在被受理时记一对 log-only 事件，不产生模型消息；未受理的 `/xxx` 被当成 prompt，与其 README 的「适配器拒收」冲突

受理：`command/run`（含名字、默认含参数）与 `command/done`，「no turn wraps them」（DS-6）。未受理（语法不合或名字未知）：注册表什么都不记（DS-4），
Web 客户端随即把整行作为 prompt 送出（DS-3、DS-4）。注册表 README 与 2026-07-19 决策记录写的是「rejected by the adapter instead of becoming a model prompt」（DS-4）。
skill 手势：原文作为用户消息，skill 正文由 pre-step 追加一条 user 消息（DS-2、DS-6；持久性为推断）。

- 适用范围：DSH `c291e796`，交互适配器只有 Web 客户端（读遍 `packages/` 与 `apps/` 未找到终端 TUI 的 `/` 适配器，探针词见 DS-4）。
- 代价与不适用：同一份上游在文档与代码上对「未知命令」方向相反；只读 README 的人会得出与代码相反的结论。
  这也更正了已交付 topic 对同一行为的记述（见[当轮报告](reports/2026-09-23-slash-command-parsing.md#对已交付-topic-的补正)）。
- 来源：DS-2、DS-3、DS-4、DS-6
- 最近核对：2026-09-23 / DSH `c291e796`

## 当前结论 · 发现、权限与作用域

### 没有一家有按人授权的「谁可以用这个入口」；Claude Code 的权限规则只管模型的调用，人敲的 `/skill` 绕过工具权限钩子

Codex：可见与可用由特性开关、平台、侧聊与运行态决定（CX-6、CX-9）。DSH：没有权限层，可用性等于插件组合，agent 作用域遮蔽全局（DS-8）。
Claude Code：`Skill(name)` 规则约束 **Claude** 能调哪些 skill；人直接敲 `/skill` 不经 `PreToolUse`，只有 `UserPromptExpansion` 钩子可拦；
`allowed-tools` 在调用那一轮免审批且不受工作区信任门控；`skillOverrides` 不管插件 skill（CC-9）。omne-next〔设计〕：可见与执行资格分离、散在四处（引 E-S7）。

- 适用范围：上列版本。Claude Code 本地内建命令是否触发 `UserPromptSubmit` 未核对。
- 代价与不适用：在 Claude Code 里，「模型能不能用某 skill」与「人能不能用同一 skill」是两套开关；只配前者的 deny 规则拦不住人敲的入口。
- 来源：CX-6、CX-9、DS-8、CC-9
- 最近核对：2026-09-23 / 上列版本

### 撞名规则没有一家覆盖「提示词型与系统流程型同名」的全部组合

Codex 与 omne-next 用不同符号让两类名字不在同一命名空间（CX-7、CX-9、ON-5）。DSH：客户端动作与宿主命令同名 fail loud，宿主命令先于同名 skill（DS-8）。
Claude Code：来源分层替代、插件并存、同步 skill 让位、名字比较忽略大小写与全角（CC-5）；**个人或项目 skill 与非 skill 内建命令（如 `/compact`）同名时谁生效，文档未写**，本轮也未做实验（CC-5）。

- 适用范围：上列版本。
- 代价与不适用：DSH 的「宿主命令先于 skill」让同名 skill 从 `/` 入口够不着，是否提示未知（DS-8）；
  Claude Code 本地 skill 替换 bundled skill 却不替换其别名，同一个意图的两个拼写落到两份实现上（CC-5）。
- 来源：CX-7、CX-9、ON-5、DS-8、CC-5
- 最近核对：2026-09-23 / 上列版本

### 运行中发系统流程型命令，四家的时机各不相同

Codex：按逐条白名单，不可用即报错（CX-6）；运行中按 `Tab` 排的是原始 `/…` 行，出队时才解析（CX-3）。
Claude Code：多数排队到本轮结束，`/status`、`/tasks`、`/usage` 立即执行，`/model` `/effort` `/fast` 立即生效（CC-10）。
DSH：宿主命令经 RPC 立即执行（DS-5）。omne-next〔设计〕：独立排队命令等安全执行点（ON-5）。

- 适用范围：上列版本。
- 代价与不适用：「出队时才解析」让一条排队的 `/xxx` 在排队那一刻不报错、到出队才报（Codex 文档自述，CX-3）；
  按命令逐条决定时机意味着时机是每条命令的属性，而不是「斜杠命令」这一类的属性。
- 来源：CX-3、CX-6、CC-10、DS-5、ON-5
- 最近核对：2026-09-23 / 上列版本

## 当前结论 · 短板与协议稳定性

### 两家有实现的厂商文档都与各自代码分叉，Claude Code 的斜杠行为在自述版本史里频繁变动

Codex：同日文档列出 `/sandbox-add-read-dir`、`/personality`，枚举里没有；枚举里的 `/recap /worktree /voice /cd /pwd` 等不在文档表（CX-11）；文档仍描述已删的 custom prompts（CX-7）。
DSH：注册表 README 说拒收未知命令，Web 代码当 prompt 送出（DS-4）；tool-skill 源码注释说「首行开头」，实现是任意位置（DS-2）。
Claude Code：skills 页有 17 个不同的 `v2.1.x` 注记（v2.1.196–v2.1.280），commands 页 38 个；与斜杠解析直接相关的变更至少五处（CC-11），其中未知命令处理在 v2.1.273 与 v2.1.274 连改两次（CC-2）。

- 适用范围：上列版本与抓取日期；Claude Code 的频率来自厂商自述，未与完整发布日志核对。
- 代价与不适用：以任何一家的文档为准复刻，都会在某些条款上复刻出与其实现不同的行为；以 Claude Code 为参照时，参照物本身在以周计的尺度上变化。
- 来源：CX-7、CX-11、DS-2、DS-4、CC-2、CC-11
- 最近核对：2026-09-23 / 上列版本

## 对照产品正文时撞上的缺口

以下只报告，不裁决；「谁来裁」按产品正文现有的归属写，未写归属的标「未写」。

| # | 缺口 | 撞上的条款 | 来源里的事实 |
|---|---|---|---|
| G1 | **2026-09-23 裁决②「触发系统业务流程的命令名」在现有正文里没有落点。**PF-002 §4 与 UL-slash-command 写「不含……系统命令」；PF-014 §5.5 / §5.7 与 PF-016 §5.7 写斜杠命令「是内容、进队列、属会话族」；PF-016 §5.4 第二类「具名的会话动作」写明「可以数得过来，不是一个开口」，目前只列换模型与归档 | [PF-002 §4](../../design/product/PF-002-assets-settings-and-permissions/design.md#slash-command)、[UL-slash-command](../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command)、[PF-014 §5.5](../../design/product/PF-014-inbound-intake-and-queueing/design.md#看着像控制指令其实不是)、[PF-014 §5.7](../../design/product/PF-014-inbound-intake-and-queueing/design.md#57-穷举一什么会让队列从空变成非空)、[PF-016 §5.4](../../design/product/PF-016-cli-tui-delivery-surface/design.md#第二类具名的那几条会话动作它们不经入站到达)、[PF-016 §5.7](../../design/product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) | 四家有实现的来源里，压缩、列后台任务这类命令都不是内容：不产生模型消息（DS-5）、不进会话记录（CX-8）或以「本地命令 + 告诫」形态留痕（CC-7）；时机逐条不同（见「运行中」一条） |
| G2 | **未知命令名怎么处理，正文没有说法** | PF-002 §4、PF-014 | 四种互斥做法（见对应结论）；omne-next 设计把它连同「字面发送」写成验收条件（ON-4） |
| G3 | **以 `/` 开头的普通文本怎样字面发送，正文没有说法** | PF-002 §4 | Codex 用前导空格且送达时被裁掉（CX-2）；Claude Code 靠「首词是路径或标点」启发式（CC-1）；omne-next 设计禁止「先失败再回退」作为字面机制（ON-4） |
| G4 | **识别位置与一条消息里多个命令，正文没有说法** | PF-002 §4「敲 `/什么` 触发」 | 开头 vs 任意位置（DSH 手势）；Claude Code 叠加最多六个 skill；omne-next 递归有上限（CC-6、DS-2、ON-3） |
| G5 | **留痕形态没有说法：会话日志里存原文、展开全文，还是两者** | [PF-014 §6.1](../../design/product/PF-014-inbound-intake-and-queueing/design.md#61-先落账再谈别的) | Claude Code 两者都存（CC-7）；Codex 只存展开（CX-8）；DSH 存原文 + 注入（DS-6） |
| G6 | **展开发生在哪一刻、「消息落盘之前」位置看到的是哪个形态，没有说法** | [PF-014 §5.6](../../design/product/PF-014-inbound-intake-and-queueing/design.md#56-消息落盘之前那一刻看得到什么) | Claude Code 为展开另设 `UserPromptExpansion`，携带原始 `prompt` 与 `command_name`（CC-9）；DSH 在 pre-step 注入（DS-2） |
| G7 | **参数语法没有说法**：PF-002 只把「参数提示」列为设置 | PF-002 §4「自带的属性」 | 占位符模板（CC-6、PI-2）、命令自解析（CX-4、DS-1）、先查声明的两段式（ON-3）三类，且彼此不可移植（CX-10） |
| G8 | **「谁可以用这个入口」对人敲与模型调用是否是同一个属性，没有说法** | PF-002 §4 权限 | Claude Code 是两套开关（CC-9） |
| G9 | **PF-016 §9 只问「交付面动作 vs 斜杠命令」撞名；两种性质之间撞名、以及与 PF-002「同类同名即替代」的交互未覆盖**（§9 写「撞名的处置归斜杠命令那一侧」，谁来裁：PF-002 / PF-006 的 owner） | [PF-016 §9](../../design/product/PF-016-cli-tui-delivery-surface/design.md#九未决项)、[PF-002 身份段](../../design/product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现) | omne-next 的限定名让同名替代无处发生（ON-3）；Claude Code 替代却不替别名（CC-5） |
| G10 | **脚本 / 非交互入口下的斜杠命令行为没有说法** | [PF-016 §6.5](../../design/product/PF-016-cli-tui-delivery-surface/design.md#65-人能做的脚本能做脚本能做的人能做)「人能做的脚本能做」 | Claude Code 按会话形态分叉，且被用户报告为成本与退出码问题（CC-2） |

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| 用于读 Codex TUI 的本机克隆与 `5c5308f` 一致 | Codex 的全部结论 | 部分核对：克隆 HEAD 为该 SHA；与钉住 tarball 共有的 `core/src`、`protocol/src` 逐文件一致（CX 笔记头） |
| Claude Code 文档描述的就是 2.1.280 的行为 | 「未知命令四种处理」「参数占位符」「撞名规则」「权限」各条的 Claude Code 部分 | 部分核对：会话记录与字符串探针支持留痕、未知命令分叉、命令类型三处；其余只有文档 |
| 2.1.227 的 `/compact`、`/goal` 记录形态在 2.1.280 未变 | 「Claude Code 会话记录……三条」一条对这两个命令的推广 | 部分核对：`/model`、`/tasks` 在 2.1.280 同形 |
| DSH 本 SHA 里 `/` 的交互适配器只有 Web 客户端 | 「DSH 未受理的 `/xxx` 被当成 prompt」一条对 DSH 整体的推广 | 读遍未找到其它适配器（探针词见 DS-4），未构造反例 |
| omne-next 的命令设计没有实现 | omne-next 各格的〔设计〕标注 | 沿用已交付 topic E-S1、E-S2 的核对 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查 / 实验 | 受影响选择及消费时点 | 所需产物 / 责任 |
|---|---|---|---|
| Claude Code 本地命令三条记录是否送进模型请求 | 抓一次含 `/model` 的会话的请求体（或读 SDK 流输出） | 「模型看到什么」的对照；proposal 定留痕形态前 | 派发者或 proposal 作者 |
| Claude Code 项目 skill 与非 skill 内建命令同名谁生效 | 在临时目录建 `.claude/skills/compact/SKILL.md`，交互敲 `/compact` 看记录形态 | 撞名规则的参照；proposal 定撞名前 | 同上（本轮只读，未做） |
| Claude Code 前导空白、代码块内 `/`、多行命令的处理 | 同上方式各试一次 | 识别边界的参照 | 同上 |
| Codex `$skill` 注入片段在 rollout 里的形状；`/model gpt-x` 与 `/compact`+换行 两条推断 | 读 rollout 写入路径；跑 TUI 单测或加一条测试 | 留痕与参数边界的参照 | 同上 |
| DSH 的 TUI 拒收未知命令是否曾存在、何时移除 | 查 DSH git 史里 `unknown-command rejection` 测试的去向 | 「DSH 文档与代码分叉」一条的成因 | 同上 |
| omne-next 的压缩类独立排队命令用什么符号拼写 | 读 ADR-131 与 pending-input-scheduling-spec | G1 的参照 | 同上 |

## 采用与后续核对

尚无消费者采用；消费者为本程 proposal「斜杠命令识别与解析基线」（待出现）。
与 [connector-and-slash-command-sources](../connector-and-slash-command-sources/README.md) 的关系：那边回答对象形状，本包回答输入识别与留痕；
本包对其 E-S13 所记「DSH 未知命令被适配器拒收」给出了代码层面的反向观察（见[当轮报告](reports/2026-09-23-slash-command-parsing.md#对已交付-topic-的补正)），是否在那边记演进事件由派发者决定。
