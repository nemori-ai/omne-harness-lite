# data.slash-command v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.slash-command, 1)`——
  `family = data`、`topic = slash-command`、规范路径 `spec/data/slash-command/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-002 rev 16、PF-014 rev 5、PF-016 rev 5** 为准；起点方向是 [D-036](../../../../record/decisions/slash-command-parsing-baseline/decision.md)
- **精确语义依赖**：

  | 坐标 | 消费的条款 | 取它的什么 | 本契约怎么用 |
  |---|---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.asset-model · v1` | [S-2](../../asset-model/v1/contract.md#s-2-能力标识名的词法)、[S-3](../../asset-model/v1/contract.md#s-3-能力标识与它的规范串)、[S-5](../../asset-model/v1/contract.md#s-5-资产来源)、[S-10](../../asset-model/v1/contract.md#s-10-八类正文的外壳)、[S-12](../../asset-model/v1/contract.md#s-12-属性声明由正文推出)、[S-15](../../asset-model/v1/contract.md#s-15-disabled-是保留项名)、[S-36](../../asset-model/v1/contract.md#s-36-usableby-是保留项名) | 能力标识名的词法（「正文契约可再收窄、不得放宽」）、能力标识的形状、资产来源、`slash_command` 类正文的外壳与「身份只在 `capability`」、属性项推出规则的义务、保留项 `disabled` 与 `usableBy` | `$ref` 它的 `$defs/CapabilityName`（`CommandName` 在其上加保留区）与 `$defs/CapabilityId`（skill 型的绑定目标）；本契约就是 S-10 里 `slash_command` 那一行 `$ref` 的正文契约 |
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1` | [S-8](../../content-blocks/v1/contract.md#s-8-文本块与来源标记) | 文本块与它的四种来源标记 `slash_command_args`、`skill_body`、`slash_command_expansion`、`slash_command_record` | ① ② 的展开物与留痕就是这四种来路的文本块（[S-21](#s-21-提示词型的展开)、[S-22](#s-22-技能型的引用与两块展开物)、[S-25](#s-25-留痕)）；不 `$ref` 它的 Schema |
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) | 显式空白码点集合与不透明标识的交换表示 | 识别文法与参数切分的「空白」一律是那个集合；`ServiceName` 按它的散文自定义，**不 `$ref` 它的 `OpaqueIdentifier`** |
  | `omne-harness-lite-design-2026-09-15 · data.skill-package · v1` | [S-8](../../skill-package/v1/contract.md#s-8-正文逐字不展开不执行) | 技能的「正文」是哪一段，逐字、不展开 | skill 型展开时第一块的文字（[S-22](#s-22-技能型的引用与两块展开物)） |

- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.slash-command/v1#S-13`。
  本文引另一份契约的条款一律带坐标，**`S-8` 这类裸号只指本契约**

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 斜杠命令是人发起的入口、命令是指路牌；绑定目标恰三种；① 的正文与 ③ 的流程不是资产；不含键盘控制与 shell 命令 | [PF-002 §4 Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) · [UL-slash-command](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command) | S-1、S-6、S-21～S-23 |
| 身份是命令名；绑定目标、参数都不是身份；① ② 同名即同一身份、按替换规则 | [PF-002 §4 身份是「类别 ＋ name」](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现) · [§5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级) | S-1、S-2 |
| 交付面动作名与 ③ 型名是系统保留名、一律在 `omne-official` 前缀下；① ② 型（含官方提供的）不得使用；保留名只认前缀不认清单；分隔符与拼法归规格 | [PF-002 §4 Slash Command「名字与撞名」](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) · [PF-016 §5.7「名字撞了」](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) · [PF-002 decisions 2026-09-23 原话「未决三」](../../../../product/PF-002-assets-settings-and-permissions/decisions.md#2026-09-23--斜杠命令参数无权限即不存在会话认得哪些命令③-型不开放保留名前缀) | S-3、S-4、S-5 |
| ③ 型本版只由系统提供，不开放组织或租户创作 | [PF-002 §2 非目标](../../../../product/PF-002-assets-settings-and-permissions/design.md#非目标) | S-4 |
| 「交付面动作与斜杠命令撞名听谁的」由保留名规则闭合 | [PF-016 decisions「rev 4 新推的」](../../../../product/PF-016-cli-tui-delivery-surface/decisions.md#rev-4-新推的) · [PF-016 §5.4 第二类](../../../../product/PF-016-cli-tui-delivery-surface/design.md#第二类具名的那几条会话动作它们不经入站到达) | S-5 |
| 参数声明可选；声明了的像命令行程序那样按声明解析，解析不通过当场明说、不发送，三种绑定一条规则；没声明的，命令名之后的整段文字作一个自由参数 | [PF-002 §4 Slash Command「自带的属性」](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) · [PF-016 §5.7](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) · [PF-002 decisions 2026-09-23 原话（一）问题二、（二）第 2 条](../../../../product/PF-002-assets-settings-and-permissions/decisions.md#2026-09-23--斜杠命令参数无权限即不存在会话认得哪些命令③-型不开放保留名前缀) | S-8、S-9、S-17～S-19、S-24 |
| 只有经交付面送进来的输入才被识别，人读、机读两种呈现形式一样；连接件等不经交付面的来源送来的 `/xxx` 原样是内容；模型不调用 | [PF-002 §4「只有人用它」](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) · [PF-014 §5.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走) · [PF-016 §5.7](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) · [§5.5](../../../../product/PF-016-cli-tui-delivery-surface/design.md#55-两种呈现形式同一份事实) · [§6.5](../../../../product/PF-016-cli-tui-delivery-surface/design.md#65-人能做的脚本能做脚本能做的人能做) | S-12 |
| 只认输入开头的一条，一条输入至多一条命令；想发 `/` 开头的普通话必须有办法原样发出去 | [PF-016 §5.7](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) · [PF-014 §5.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走) | S-13、S-15 |
| 名字按会话斜杠命令集认；不在里面的（含没权限的）当场明说「没有这个命令」、不发送，没有「你不能用」这第二种失败，也不当普通文本送进会话；受理时以此刻为准 | [PF-002 §4「会话认得哪些命令，什么时候变」](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变) · [UL-session-slash-command-set](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-session-slash-command-set--会话斜杠命令集--session-slash-command-set) · [PF-014 §5.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走) · [PF-002 decisions 2026-09-23 原话（二）第 1 条](../../../../product/PF-002-assets-settings-and-permissions/decisions.md#2026-09-23--斜杠命令参数无权限即不存在会话认得哪些命令③-型不开放保留名前缀) | S-16 |
| ① 展开成消息内容（带上参数）；② 的 skill 正文逐字成一块、人附带的参数另成一块；③ 不进队列不成为消息，只留一条条目 | [PF-002 §4 Slash Command 三行表](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) · [PF-014 §5.10 分两路表](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走) | S-21～S-23、S-25 |
| ② 型展开的 skill 照样过它自己的「谁可以使用它」；入口权限只对人 | [PF-002 §4 Slash Command 表后一段](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) | S-11、S-22 |
| 原命令与展开后的全文都留；「消息落盘之前」看到的是展开后的消息外加原命令的标注 | [PF-014 §5.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走) · [§5.6](../../../../product/PF-014-inbound-intake-and-queueing/design.md#56-消息落盘之前那一刻看得到什么) | S-25 |
| 自研统一解析器：从 Codex 借识别边界、从 omne-next 借失败纪律与声明优先、从 Claude Code 借占位符与留痕形状 | [D-036](../../../../record/decisions/slash-command-parsing-baseline/decision.md) · [提案「D 的组成」](../../../../record/proposals/slash-command-parsing-baseline/alternatives.md#d-的组成借什么从哪借为什么只借这些) | S-13、S-10、S-17、S-19、S-25 |
| Codex `5c5308f` 的识别边界：只认整段第 0 个码点的 `/`，名字到第一个空白为止，名字里再有 `/` 即普通文本 | [调研 CX-2](../../../../../research/slash-command-parsing-sources/notes/codex.md#cx-2) | S-13 |
| Claude Code `2.1.280` 的占位符：`$ARGUMENTS` 是整段参数原文；`$N` 从 0 起；声明过的参数没给时展开为空串；`\` 只对紧跟的占位符起转义；没有占位符收到参数时在正文末尾追加 `ARGUMENTS:` 一行 | [调研 CC-6](../../../../../research/slash-command-parsing-sources/notes/claude-code.md#cc-6) | S-10、S-21 |
| 统一语言正式名 | [能力与构成](../../../../ubiquitous_language/terms/capabilities-and-composition.md) · [作用域与求值](../../../../ubiquitous_language/terms/scope-and-resolution.md) · [交互与分派](../../../../ubiquitous_language/terms/interaction-and-dispatch.md) | 全部英文名 |
| 规格形式；部署边界 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | 见下方引文 |

> **没有产品行、或产品行不足以单独支撑的条款，逐条点名：**
>
> | 条款 | 依据来自哪 |
> |---|---|
> | [S-2](#s-2-命令名的词法) 名字许冒号、禁斜杠 | **主线裁定 2026-09-23，待产品负责人确认**（账本 S9-c）；`data.asset-model` v1 的 S-2 已同向。**尚未落进设计链里任何一处**，本表无处可链——见 [G-10](#十已知缺口) |
> | [S-3](#s-3-保留区与它唯一的拼法) 保留区按 ASCII 不区分大小写判定、`omne-official:` 以冒号作分隔符 | 起草简报定分隔符为冒号；**按 ASCII 不区分大小写判保留区是本契约的推导**，理由在条款正文 |
> | [S-11](#s-11-属性项的推出规则) 「谁可以用」是 `data.asset-model` 的 `usableBy`；[S-1](#s-1-斜杠命令定义是资产的正文) 正文不带名字；[S-8](#s-8-参数声明) 的参数提示 `hint`；[S-17](#s-17-参数文字的切分) 的 `unterminated_quote`；[S-13](#s-13-识别的三种结果)、[S-14](#s-14-commandinvocation-与位置) 的 `Recognition`、`Span`；[S-25](#s-25-留痕) 留痕是一种来源标记 | **主线裁定 2026-09-23，待产品负责人确认**（账本 S20-b～S20-e、S18-c），同样无处可链（[G-10](#十已知缺口)） |
> | [S-8](#s-8-参数声明)～[S-10](#s-10-提示词模板与占位符)、[S-17](#s-17-参数文字的切分)～[S-19](#s-19-解析失败取第一处) 的具体文法 | 产品只说「像命令行程序那样按声明解析」、「语法长什么样归规格」；**切分、绑定、取值与判定次序是本契约的推导**，借用来源逐条写在正文 |
> | [S-26](#s-26-规范表示)～[S-29](#s-29-表示层拒绝与解析失败分开都不修补) | **SYS-SPEC**：规范表示、闭合枚举、表示层拒绝值与「表示层不等于判定」是规格形式的要求 |
> | [第六节](#六装配给与协议给) | **SYS-DEPLOY** |

## 一、目的与消费者

### 这份契约拥有什么

**三样东西，都是纯粹的值与纯函数：**

1. **斜杠命令定义**——一份 `slash_command` 资产的正文：恰一个绑定目标、可选的参数声明、提示词模板的占位符；命令名（所在记录能力标识的 name）的保留前缀，
   以及它按 `data.asset-model` v1 的 [S-12](../../asset-model/v1/contract.md#s-12-属性声明由正文推出) 推出的属性项。
2. **识别文法**——交付面上的一段输入，是普通文字、字面发送，还是一次命令尝试；是的话，名字与参数文字各是哪一段。
3. **解析规则与解析结果**——一次命令尝试按会话斜杠命令集与命令定义解析成什么：展开成的文字、所指的技能、所指的系统业务流程与参数，
   或者一个带原因与位置的失败值；以及把它们留痕进消息时用的判别值。

它是一份**数据契约**：没有操作、没有提交点、没有状态转移，**因此不需要插件**。识别与解析是**纯计算**——
同一段输入、同一个会话斜杠命令集，永远得出同一个结果；交付面（两种呈现形式）与受理面各跑一遍，**必须得出同一个答案**，
所以它们写在这里，由两处引用，**不各自实现一套同义规则**。

**它不拥有**：

| 不拥有 | 归谁 |
|---|---|
| 一个会话认得哪些命令、什么时候换、reload 一族有哪几条与各刷哪张注册表 | [`capability.asset-registry`](../../../capabilities/asset-registry/v1/contract.md) v1（candidate）＋ [`capability.asset-evaluation`](../../../capabilities/asset-evaluation/v1/contract.md) v1（candidate） |
| 「谁可以用」各层取哪个值、怎样求交 | `capability.asset-evaluation` |
| 发布、登记官方件时的写面与拒绝值怎样落进写面的失败集合 | [`capability.asset-governance`](../../../capabilities/asset-governance/v1/contract.md) v1（candidate） |
| 受理：预判之后受理面以此刻为准再判、① ② 展开成消息、② 的 skill 权限、③ 交给流程、条目落账 | 受理契约（PF-014 的规格化，**未立**） |
| 交付面怎样呈现失败、菜单与补全、交付面自己的动作表 | 交付面呈现与受理契约（**未立**） |
| 任何一条系统业务流程的语义、时机与结果摘要 | 定义那条流程的一侧；登记处见 [G-7](#十已知缺口) |
| 留痕块与展开物的标注 | 写下它们的受理一方（`data.content-blocks` v1 的 [S-4](../../content-blocks/v1/contract.md#s-4-两个标注)） |
| 外部格式（Claude Code 命令文件与 skill、pi 提示词模板、omne-next 绑定表）的导入映射 | 导入器（[D-036](../../../../record/decisions/slash-command-parsing-baseline/decision.md) 起点；未立） |

### 消费者

| 消费者 | 消费什么 |
|---|---|
| 交付面呈现与受理契约（PF-016，**未立**） | [S-12](#s-12-只识别经交付面的输入)～[S-15](#s-15-一条输入至多一条命令)（识别，两种呈现形式同一文法）、[S-16](#s-16-名字只按会话斜杠命令集认)～[S-20](#s-20-parseresult-四支)（预判：当场明说、不发送）、[S-24](#s-24-解析失败即什么都不发) |
| 受理契约（PF-014，**未立**） | 同上的识别与解析（以受理那一刻的命令集再判）；[S-21](#s-21-提示词型的展开)～[S-23](#s-23-命令型的参数)（① ② 的展开物、③ 的参数）；[S-25](#s-25-留痕)（留痕块的判别值） |
| `capability.asset-registry` v1（candidate） | 命令名与 `SlashCommandDefinition` 这一对（会话斜杠命令集的元素）、[S-2](#s-2-命令名的词法)～[S-5](#s-5-保留名在系统内唯一没有优先级)（名字与保留区） |
| `capability.asset-evaluation` v1（candidate） | [S-11](#s-11-属性项的推出规则)（`slash_command` 类的属性项推出规则） |
| `capability.asset-governance` v1（candidate） | [S-26](#s-26-规范表示)～[S-29](#s-29-表示层拒绝与解析失败分开都不修补)（发布与登记官方件时的表示层拒绝值），[S-4](#s-4-保留区只归系统提供的命令型)（`customized` 记录不带 `command` 绑定） |
| `data.asset-model` v1 | `SlashCommandDefinition` 作为 `AssetContent` 里 `slash_command` 外壳 `body` 的形状（它的 [S-10](../../asset-model/v1/contract.md#s-10-八类正文的外壳)，结构上的 `$ref`）；[S-28](#s-28-表示层拒绝值) 的拒绝值原名携带进它的 S-27 |
| `data.content-blocks` v1 | `CommandName` 作为它 S-8 `origin.command` 的词法（它只约束到非空，不反向引用） |
| 提供 ③ 型流程的一侧（本版只点名 reload 一族） | `ServiceName`（[S-7](#s-7-servicename)）、[S-23](#s-23-命令型的参数)（参数怎样交到手上） |
| 导入器（未立） | [S-10](#s-10-提示词模板与占位符)（占位符子集与它与 Claude Code 的差异）、[S-8](#s-8-参数声明) |

> 上表没有一行是本契约的依赖：方向一律是消费者 → 本契约，登记在各消费者自己的 catalog 条目里。

## 二、含义与使用范围

**适用范围**：一个部署之内；识别与解析在哪个进程里跑都一样。本版完整交付是单机，但每一条的**领域语义在跨进程之后必须原样成立**——
交付面（本机客户端）与受理面在演化后可能是两个进程、两种语言的两个实现；哪些结论在单机由装配给出、之后必须由协议重新兑现，列在[第六节](#六装配给与协议给)。

### 规格层 token 与词条的对应

交换表示用 token，对外文档用词条名，**两者不得互相替代**。

| 规格层 token | 词条 |
|---|---|
| `SlashCommandDefinition`（一份 `slash_command` 资产的正文，不带名字） | [斜杠命令 · Slash Command](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command) 的一份具体实现的内容 |
| `CommandName` | [能力标识 · Capability Identifier](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) 在 `slash_command` 类上的 name 分量 |
| `CommandBinding.kind`：`prompt` · `skill` · `command` | 斜杠命令词条的三种绑定目标：一段自定义提示词 · 装配的一个 [技能 · Skill](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-skill--技能--skill) · 一条系统业务流程 |
| 会话斜杠命令集（本契约的解析输入，不是一个 `$defs`） | [会话斜杠命令集 · Session Slash-Command Set](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-session-slash-command-set--会话斜杠命令集--session-slash-command-set) |
| 「经交付面的输入」「人读／机读」 | [交付面 · Delivery Surface](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-delivery-surface--交付面--delivery-surface) · [呈现形式 · Presentation Form](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-presentation-form--呈现形式--presentation-form) |

**下列是规格层的名字，不是统一语言词条**，因此本契约与 Schema 里**不给它们「中文 · English」那种词条式标题**：
`ServiceName`（系统业务流程名——「系统业务流程」只在斜杠命令词条的定义里出现，**自己无词条**）、`ParameterDeclaration`（命令参数声明）、
`CommandInvocation`（一次命令尝试，**无词条**）、`Recognition`（识别结果，**无词条**）、`Span`（位置区间，**无词条**）、`ParseResult`（解析结果，**无词条**）、保留区（**无词条**）、
字面发送（**无词条**）、占位符（**无词条**）、留痕块（**无词条**）。它们在本契约里各有精确定义，**不是产品概念**。

### 与相近概念的差异

- **命令定义 ≠ 资产记录。**记录是一份实现的全部（记录号、来源、所有者、版本线），归 `data.asset-model`；本契约只定记录里 `slash_command` 那一类**正文**的形状。
- **绑定 ≠ 组合 ≠ 所有权。**skill 型命令指向一个技能的能力标识，不拥有它（[PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)）；① 带的正文与 ③ 指的流程都不是资产。
- **命令名 ≠ 输入里的名字那一段。**`CommandInvocation.name` 是输入里 `/` 之后、第一个空白之前的那一段，**它不一定是一个合法的命令名，更不一定在会话斜杠命令集里**；判它是哪条命令是解析的事（[S-16](#s-16-名字只按会话斜杠命令集认)）。
- **识别 ≠ 解析。**识别只看文字，不看任何命令集（[S-13](#s-13-识别的三种结果)）；解析才拿命令集与命令定义（[S-16](#s-16-名字只按会话斜杠命令集认)）。
- **解析失败 ≠ 表示层拒绝。**前者是人敲错了、一个判定结果值；后者是一份数据不合形状（[S-29](#s-29-表示层拒绝与解析失败分开都不修补)）。
- **斜杠命令 ≠ 交付面自己的动作。**换模型、归档这类具名会话动作不经入站到达，**不是斜杠命令**；拼成 `/` 开头时它们的名字也在保留区里（[S-5](#s-5-保留名在系统内唯一没有优先级)）。
- **字面发送 ≠ 失败之后的回退。**字面发送是文法上独立的一条出路（[S-13](#s-13-识别的三种结果)），**不是**解析失败之后改当普通话发出去。

## 三、命令定义

| 元素 | 精确含义 | 条款 |
|---|---|---|
| `SlashCommandDefinition` | 一份 `slash_command` 资产的正文 | [S-1](#s-1-斜杠命令定义是资产的正文) |
| `CommandName` | 命令名（所在记录能力标识的 name）的词法与保留区 | [S-2](#s-2-命令名的词法)～[S-5](#s-5-保留名在系统内唯一没有优先级) |
| `CommandBinding` | 恰一个绑定目标 | [S-6](#s-6-三种绑定目标) |
| `ServiceName` | 系统业务流程名 | [S-7](#s-7-servicename) |
| `ParameterDeclaration` | 参数声明 | [S-8](#s-8-参数声明)、[S-9](#s-9-参数声明的结构约束) |
| 提示词模板 | ① 的正文与占位符 | [S-10](#s-10-提示词模板与占位符) |
| 属性项推出规则 | `声明(正文) → AttributeDeclaration[]` | [S-11](#s-11-属性项的推出规则) |

### S-1 斜杠命令定义是资产的正文

**`SlashCommandDefinition` 是一份 `slash_command` 资产的正文：`{ description, binding, parameters? }`。**

| 成员 | 必填 | 含义 |
|---|---|---|
| `description` | 是 | 给人看的一句说明，非空。**不是身份，也不进任何给模型的内容** |
| `binding` | 是 | 恰一个绑定目标（[S-6](#s-6-三种绑定目标)） |
| `parameters` | 否 | 参数声明的数组（[S-8](#s-8-参数声明)）。**缺席与空数组是两个不同的意思**：缺席 = 没有声明，命令名之后的整段文字作一个自由参数；`[]` = 声明了「不收任何参数」，给了就是 `unexpected_argument` |

- **正文里没有名字**（主线裁定 2026-09-23，待产品负责人确认；账本 S20）：**命令名就是所在资产记录 `capability` 的 name 分量**（`data.asset-model` v1 的 [S-10](../../asset-model/v1/contract.md#s-10-八类正文的外壳)），不在正文里另存一份——两份就会分叉。
  会话斜杠命令集按名字认命令（[S-16](#s-16-名字只按会话斜杠命令集认)），它的元素因此是「命令名 ＋ 这份正文」一对，由提供它的一方从记录里一起取（`capability.asset-registry`）。
- **一条命令恰绑一个目标**（规格层推导：产品正文的三行表每行一个目标，没有「一条命令同时绑两种」的读法）。
- **参数提示在参数声明上**（`ParameterDeclaration.hint`，[S-8](#s-8-参数声明)；账本 S20-d）。
- 它就是 `data.asset-model` v1 的 `AssetContent` 里 `slash_command` 那一支 `body` 的形状（那边 `$ref` 本条）。

### S-2 命令名的词法

**`CommandName` 是命令名——所在资产记录能力标识的 name 分量。它的词法就是 `data.asset-model` v1 的 [`CapabilityName`](../../asset-model/v1/contract.md#s-2-能力标识名的词法)**：
非空、任何位置都不含空白、不含斜杠 `/`、允许冒号 `:`、区分大小写（主线裁定 2026-09-23，待产品负责人确认；账本 S9-c）。
本契约对它**不再收窄字符集**，只加 [S-3](#s-3-保留区与它唯一的拼法) 的保留区一条。
**它恰好保证每一个合法的命令名都敲得出、认得回**：对任何合法命令名 `n`，输入 `"/" + n` 在[识别文法](#s-13-识别的三种结果)下必定得出一次名字为 `n` 的命令尝试——
名字里没有空白，所以不会被截断；没有 `/`，所以不会落进「名字里有斜杠即普通文字」那一支，也不会以 `//` 开头。

- **与 `data.asset-model` v1 一致**：那边的 [S-29](../../asset-model/v1/contract.md#s-29-名字里的斜杠) 把 `omne-official:reload-skills` 列为正例；本契约的 Schema `$ref` 那边的 `CapabilityName`（原 G-1）。
- 违反词法的拒绝值是 **`name_invalid`**（[S-28](#s-28-表示层拒绝值)）——与 `data.asset-model` v1 的同名值同义。

### S-3 保留区与它唯一的拼法

**保留前缀恰是 14 个码点 `omne-official:`**（`o m n e - o f f i c i a l :`）——`omne-official` 加一个冒号作分隔符。

1. **一个名字在保留区里，当且仅当它的前 14 个码点按 ASCII 不区分大小写等于 `omne-official:`**——只把 `A`～`Z` 与 `a`～`z` 视同，别的码点一律逐码点比较。
2. **保留区里的名字只有一种拼法**：前 14 个码点必须**恰是**小写的 `omne-official:`，且**其后至少还有一个码点**。
   `OMNE-OFFICIAL:reload-skill`、`Omne-Official:review`、`omne-official:` 本身，拒绝值都是 **`name_invalid`**。
3. **保留只认前缀，不认清单**（[PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)）：一个名字在不在保留区，只看它的拼写，不看系统此刻有没有这条命令或这个交付面动作。
   `omne-official`（没有冒号）、`omne-officially`、`team:omne-official:x` 都不在保留区。

**为什么保留区按 ASCII 不区分大小写判**（本契约的推导）：名字本身区分大小写，若保留区也只认小写，
一个组织就能发布一条叫 `OMNE-OFFICIAL:reload-skill` 的提示词命令——机器上它与系统那条不同名，**人眼里它就是系统那条**，
而[「人敲下一个名字，只可能有一种解释」](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族)守的正是人眼里的这一种解释。
**只折叠 ASCII 字母**，是因为别的大小写折叠随 Unicode 版本与语言而变，两个实现会判出两个结果；
形近字（如西里尔字母 о）本版不管——那是[相似字判定](../../asset-model/v1/contract.md#s-2-能力标识名的词法)那一类过早复杂度，挡不全也挡不稳。

### S-4 保留区只归系统提供的命令型

**名字在保留区里，当且仅当绑定目标是 `command`（③ 型），并且这份定义由系统提供。**逐条：

| 情形 | 拒绝值 | 依据 |
|---|---|---|
| `prompt` 或 `skill` 型（① ②）的名字在保留区里——**不论记录的来源是不是 `official`** | `name_reserved` | [PF-002 §4「名字与撞名」](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)：官方提供的 ① ② 型也一样，它们可以被替换，保留名不能 |
| `command` 型（③）的名字不在保留区里 | `name_reserved` | 同上：③ 型命令名是系统保留名，一律在前缀下 |
| `command` 型的定义出现在一份 `origin` 不是 `official` 的资产记录里 | `name_reserved` | [PF-002 §2 非目标](../../../../product/PF-002-assets-settings-and-permissions/design.md#非目标)：③ 型本版只由系统提供；资产来源见 `data.asset-model` v1 的 [S-5](../../asset-model/v1/contract.md#s-5-资产来源) |

- **三行都要看所在记录**：前两行看记录的 `capability.name` 与正文的绑定种类，第三行看记录的 `origin`；由看得见记录的接收边界判——登记官方件与发布的写面（`capability.asset-governance`）、以及接收资产记录的任何一方（`data.asset-model` v1 的 [S-27](../../asset-model/v1/contract.md#s-27-表示层拒绝值) 原名携带 `name_reserved`）。
- **判这一条的前提是 `binding.kind` 认得出**：`kind` 缺席或不是三个取值之一时，保留区规则无从判起，拒绝值按 [S-28](#s-28-表示层拒绝值) 的次序是 `malformed` 或 `binding_unknown`。
- **直接后果**：① ② 型的名字与保留区**从定义上不相交**，系统将来再添多少 ③ 型流程与交付面动作，都撞不上已发布的 ① ② 型；
  ③ 型本版无人能新建，也就无人能顶替系统那一条（[PF-002 §2 非目标](../../../../product/PF-002-assets-settings-and-permissions/design.md#非目标)）。

### S-5 保留名在系统内唯一，没有优先级

**交付面自己的动作名与 ③ 型命令名同在保留区里，同一个名字不得同时是两者。**
这是[「人敲下一个名字，只可能有一种解释」](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族)在系统自己那一侧的推论：
① ② 型已由 [S-4](#s-4-保留区只归系统提供的命令型) 挡在保留区外，保留区里只剩系统自己发的两类名字，它们之间也只能有一种解释。

- **因此本契约不定义、也不需要「交付面动作优先」或「命令优先」**：
  「交付面自己的动作与斜杠命令撞名听谁的」[已由保留名规则闭合](../../../../product/PF-016-cli-tui-delivery-surface/decisions.md#rev-4-新推的)，产品正文里没有一条优先级。
  **实现不得靠先查哪张表来消歧**——撞了就是系统自己的缺陷，不是一条要在运行时裁决的规则。
- **谁核对这一条**：交付面动作表归交付面，③ 型命令归系统提供的官方件；两者合在一起的不相交，是一项静态检查（[验证入口 SC-2](../verification.md#静态检查义务)），不是本契约能在一份数据里判的。
- 换模型、归档这些[具名会话动作](../../../../product/PF-016-cli-tui-delivery-surface/design.md#第二类具名的那几条会话动作它们不经入站到达)拼成 `/` 开头时，**它们仍不是斜杠命令**：它们不经入站到达，不进会话斜杠命令集，本契约的解析不认它们。

### S-6 三种绑定目标

**`CommandBinding` 按 `kind` 判别，恰三种：**

| `kind` | 成员 | 是什么 | 敲下去之后（产品正文） |
|---|---|---|---|
| `prompt` | `template`：非空字符串 | ① 一段自定义提示词，**命令自带的正文**；占位符见 [S-10](#s-10-提示词模板与占位符) | 展开后的文字成为那条用户消息的内容（[S-21](#s-21-提示词型的展开)） |
| `skill` | `skill`：一个能力标识，类别必为 `skill` | ② 装配里的一个[技能](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-skill--技能--skill) | 那个技能的正文逐字成一块，人附带的参数另成一块（[S-22](#s-22-技能型的引用与两块展开物)） |
| `command` | `service`：一个 `ServiceName` | ③ 一条系统业务流程（[S-7](#s-7-servicename)） | 交给那条流程；不进队列、不成为消息（[S-23](#s-23-命令型的参数)） |

- **`skill` 指向能力标识，不指向某一份具体记录**（[PF-002 §6.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识)）：
  换上一份同标识的实现，绑定自动指到新的那份；形状是 `data.asset-model` v1 的 [`CapabilityId`](../../asset-model/v1/contract.md#s-3-能力标识与它的规范串)，类别不是 `skill` 即 `malformed`。
  **绑定不转移所有权**：命令指向一个技能，不代表它拥有那个技能。
- **① 的正文与 ③ 的流程都不是资产**，不进组合图；skill 型是斜杠命令唯一的组合边（PF-002「谁能组合谁」）。
- `kind` 集合闭合：出现了但不是三者之一，拒绝值是 **`binding_unknown`**；`kind` 缺席是 `malformed`（[S-28](#s-28-表示层拒绝值)）。

### S-7 ServiceName

**`ServiceName` 是 `command` 型绑定所指那一条系统业务流程的名字**（「系统业务流程」本身**无词条**，见[规格层名字的清单](#规格层-token-与词条的对应)）。

- **不透明**：交换表示按 `data.identity-values` v1 的 [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示)——非空字符串，首字符与末字符都不属于那个空白码点集合，逐码点相等；**消费者不解析它**，不从它推出是哪个服务、哪个动作。
- **它解到哪一个命令服务或查询服务的哪一个动作、此刻办不办得了、办完交回什么结果摘要，不归本契约**——归系统业务流程的登记处（[G-7](#十已知缺口)）与定义那条流程的一侧。
- **解析不检查它此刻解不解得到**：一条 ③ 型命令所指的流程不在了，是**执行时**那项服务明说的一次失败（[PF-002 §4「会话认得哪些命令」](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)），不是解析失败。

### S-8 参数声明

**`ParameterDeclaration` 是命令声明的一个参数：`{ name, kind, values?, required, positional?, hint? }`。**

| 成员 | 必填 | 含义 |
|---|---|---|
| `name` | 是 | 参数名：小写 ASCII 字母起头，其后是小写 ASCII 字母、数字、`_`、`-`。它在具名参数的写法里出现（`--name`），也是解析结果里 `arguments` 的键 |
| `kind` | 是 | 恰四种，闭合：`string`、`integer`、`boolean`、`enum`；取值规则见 [S-18](#s-18-参数的绑定与取值) |
| `values` | `enum` 必有，其余必无 | 非空、各不相同的非空字符串数组：这个参数只能取其中之一 |
| `required` | 是 | 这个参数必须给 |
| `positional` | 否 | **只取 `true`**：位置参数，按声明次序依次取值。**缺席即具名参数**，以 `--name` 给出。写成 `false` 是 `malformed`——一个含义只留一种写法 |
| `hint` | 否 | 参数提示：给人看的一句话，非空，交付面据以提示这个参数怎样填。**不进任何给模型的内容，不参与解析**（主线裁定 2026-09-23，待产品负责人确认；账本 S20-d）。缺席即作者没给提示 |

- **没有 `default`**：没给的参数在解析结果里**缺席**，不补一个值（[S-18](#s-18-参数的绑定与取值)）。它缺席时意味着什么，归拿到它的那一方。
- **没有可变数量的位置参数、没有短选项（`-x`）、没有「重复同一个具名参数得到多个值」**（借 omne-next 的「禁可变数量位置参数」，[提案「D 的组成」](../../../../record/proposals/slash-command-parsing-baseline/alternatives.md#d-的组成借什么从哪借为什么只借这些)）。
- **参数名为什么这样窄**（本契约的推导）：它要能在 `--name` 与 `--name=value` 里原样敲出、不含 `=` 与空白，还要做结果里的键；
  取小写 ASCII 让两个语言的实现不在大小写与规范化上分歧。不合即 `malformed`。

### S-9 参数声明的结构约束

**一份定义的 `parameters` 数组整体还要满足三条**——都要看整个数组，Schema 管不到，由接收边界判：

| 约束 | 违反时的拒绝值 |
|---|---|
| **参数名两两不同**（位置参数与具名参数共用一个名字空间） | `parameter_duplicate` |
| **全部位置参数排在全部具名参数之前**——位置参数的次序就是它们在数组里的次序，具名参数之间的次序无意义 | `positional_after_named` |
| **必填的位置参数不排在可选的位置参数之后** | `malformed` |

- 第三条的理由（本契约的推导）：位置参数严格按次序取值，一个排在可选参数之后的必填参数，会让那个可选参数在「必填的那个给了」时**事实上必填**——
  声明写着「可选」，敲的人却省不掉它，只会在少给一个时得到一个指错了位置的 `missing_required`。
- **空数组合法**，意思是「这条命令不收任何参数」（[S-1](#s-1-斜杠命令定义是资产的正文)）。

### S-10 提示词模板与占位符

**`prompt` 型的 `template` 是命令自带的正文。其中恰有两种占位符**——借自 Claude Code `2.1.280`（[CC-6](../../../../../research/slash-command-parsing-sources/notes/claude-code.md#cc-6)）的一个子集：

| 占位符 | 写法 | 展开为 |
|---|---|---|
| `$ARGUMENTS` | 恰是这 10 个码点 | 这次命令尝试的 `argumentText`（[S-14](#s-14-commandinvocation-与位置)），原样 |
| `$N` | `$` 后紧跟一串**最长的** ASCII 数字 `0`～`9`（至少一位），`N` 是它的十进制值 | 第 `N` 个**位置参数**（从 0 起，按声明次序）这次得到的那段文字（去掉引号与转义之后，[S-17](#s-17-参数文字的切分)）；这个参数是可选的且这次没给，展开为**空串** |

**转义**：一个占位符**紧前恰有一个** `\`（它前面那个码点不是 `\`）时，这个占位符不展开——那一个 `\` 被去掉，占位符原样留在文字里；
紧前是两个或更多 `\` 时，那些 `\` 全部原样保留、占位符照常展开；`\` 在别的 `$` 前原样保留。与 Claude Code 的规则相同。

**扫描是一遍、从左到右、不重叠**：展开进去的参数文字**不再被扫描**——参数里写着 `$0` 或 `$ARGUMENTS`，就是字面的这几个字。
其余的 `$` 都是字面字符。

**不借的部分**（导入器的事，见 [CS-6](#cs-6-导入一个-claude-code-命令文件)）：`$ARGUMENTS[N]` 不是本契约的占位符（`$ARGUMENTS` 照常展开，其后的 `[N]` 是字面）；
Claude Code 按 `arguments` 前置声明的具名 `$name` 不借；`${CLAUDE_*}` 变量、内联 shell、`@文件` 都不借。

**模板的合法性**（定义时即判，不合即 `malformed`，Schema 管不到）：

1. **每个没被转义的 `$N` 都指得到一个声明过的位置参数**：`N` 小于位置参数的个数。
   **没有参数声明的命令，模板里不得有没被转义的 `$N`**——没声明，就没有「第 N 个」可言。
2. **声明了参数的命令，模板必须装得下每一个参数**：要么含一个没被转义的 `$ARGUMENTS`；
   要么**没有具名参数**、并且每个位置参数的序号都作为没被转义的 `$N` 出现过。

**第 2 条的理由**（本契约的推导）：参数按声明解析通过之后，人给的每一个参数都要进展开后的文字——产品正文说 ① 的正文「带上参数」成为消息内容。
一个声明了具名参数、模板里却只有 `$0` 的命令，会把人给的 `--target` 验过一遍之后**悄悄丢掉**；这一条让作者在发布时就知道，而不是让敲的人事后才发现。
**这也回答了「声明与占位符谁为准」**（[提案 Q2](../../../../record/proposals/slash-command-parsing-baseline/alternatives.md#推荐与仍待区分的事项)）：声明为准，占位符对不上声明的，发布即拒。

### S-11 属性项的推出规则

**`声明(SlashCommandDefinition) → AttributeDeclaration[]` 恒为空。**
这是 `data.asset-model` v1 [S-12](../../asset-model/v1/contract.md#s-12-属性声明由正文推出) 要每份正文契约交出的那条确定函数；它对任何一份合法的命令定义都产出同一个结果，与持有方、所在格、时间、环境无关。

- **「谁可以用这个入口」不由本规则产出**：它是 `data.asset-model` v1 保留的 [`usableBy`](../../asset-model/v1/contract.md#s-36-usableby-是保留项名)——取值域是租户角色两值加 `self`、默认 `self`，与技能、MCP 接入点共用一份声明（主线裁定 2026-09-23，待产品负责人确认；账本 S18-c、S20-b）。
  一条斜杠命令的全部属性项因此恰是 `disabled` 与 `usableBy` 两项。
- **只对人**：`usableBy` 在这里管「哪个人能敲这个命令」。模型不调用斜杠命令（[PF-002 §4「只有人用它」](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)）。
- **它不替 skill 放权**：skill 型命令展开的那个技能，还要过**技能自己的** `usableBy`（[S-22](#s-22-技能型的引用与两块展开物)）。
- **绑定目标、参数声明（含参数提示）、说明都不作属性项**：它们是正文，不是各层能配的值（主线裁定 2026-09-23，待产品负责人确认；账本 S20-d）。
  产品正文把「参数声明、参数提示、绑定目标」列在「设置」一栏——**那一处要随产品修订改成正文成员**（已报主线，产品修订批）。
- **这一项的值怎样求、没权限的命令怎样不进会话斜杠命令集**，归 `capability.asset-evaluation` 与 `capability.asset-registry`。

## 四、识别文法

### S-12 只识别经交付面的输入

**识别文法只作用于经[交付面](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-delivery-surface--交付面--delivery-surface)送进来的那段输入，人读、机读两种[呈现形式](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-presentation-form--呈现形式--presentation-form)用同一套文法、得出同一个结果。**

- **不经交付面的来源——连接件、定时到点、别的会话捎话——送来的文字一律不交给识别文法**，其中的 `/xxx` 原样是内容（[PF-014 §5.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走)）。
  守这一条的是**调用方**：受理面知道一条输入从哪来，交付面只把自己收到的交出去。本契约是纯函数，不看来源——**它只能被正确的来源调用**，这是它唯一的调用前提（[验证入口 SC-1](../verification.md#静态检查义务)）。
- **模型的输出永远不交给识别文法**：斜杠命令只对人，模型不调用它。
- **识别的输入**是交付面这一次提交里人打的那段文字，一个 Unicode 码点序列。它若同时带着附件等别的东西，那些东西怎样随命令走不归本契约——[G-9](#十已知缺口)。

### S-13 识别的三种结果

**对输入 `T`，识别的结果恰是三种之一，按下面的次序判，第一条成立即停：**

```text
W ≝ data.identity-values/v1#S-31 逐个列出的空白码点集合

recognize(T) ≝
  1. T 为空，或 T 的第一个码点不是 "/"          → 普通文字：T 原样是内容
  2. T 的第二个码点是 "/"                      → 字面发送：内容是 T 去掉第一个码点
  3. 令 N = T 从第二个码点起、到第一个属于 W 的码点之前（或到末尾）的那一段
     N 为空                                    → 普通文字：T 原样是内容
     N 含 "/"                                  → 普通文字：T 原样是内容
     否则                                      → 一次命令尝试（S-14）
```

- **只看第一个码点**（借 Codex `5c5308f` 的识别边界，[CX-2](../../../../../research/slash-command-parsing-sources/notes/codex.md#cx-2)）：
  前导空白、前导 U+FEFF、中间出现的 `/xxx` 都不构成命令——`" /review"` 与 `"请看 /review"` 是普通文字，**原样**送出，前导空白**不被裁掉**。
- **名字里再有 `/` 即普通文字**：`/usr/bin/python3`、`/Users/x/src` 这类路径开头的话自然放行（同一处借用）。
- **字面发送是 `//`**：想发一句以 `/` 开头的普通话，写成 `//` 开头，送出的内容**恰去掉第一个 `/`**——`//review 是个命令名` 送出 `/review 是个命令名`，`///x` 送出 `//x`。
  **它是文法上一条独立的出路**，不是「解析失败之后改当普通话发出去」（借 omne-next 的失败纪律）；两种呈现形式用同一个写法，所以对称。
  **不借** Codex「前导空格即字面、提交时再裁掉」那条出口：它看不见、易误触，而且机读形式里没有对应物（[提案「D 的组成」](../../../../record/proposals/slash-command-parsing-baseline/alternatives.md#d-的组成借什么从哪借为什么只借这些)）。
- **识别不查任何命令集**：结果只由 `T` 决定。一个不存在的名字照样是「一次命令尝试」——判它不存在是解析的事（[S-16](#s-16-名字只按会话斜杠命令集认)），
  而那一步的结果是**明说失败、不发送**，**不是**退回普通文字。所以 `/tmp 满了` 得到的是「没有这个命令」；要把它当话发出去，写 `//tmp 满了`。
- **三种结果的形状是 `Recognition`**（账本 S20-b）：`{ kind: "text", text }`（普通文字，`text` 是 `T` 原样）、`{ kind: "literal", text }`（字面发送，`text` 是 `T` 去掉第一个码点）、`{ kind: "invocation", invocation }`（一次命令尝试，[S-14](#s-14-commandinvocation-与位置)）。
  前两种交出去的是一段文字，落成什么块归受理。**交出去的就是上面写的那段，一个码点不改**：不裁剪、不规范化、不改换行。

### S-14 CommandInvocation 与位置

**一次命令尝试是 `CommandInvocation`：`{ raw, name, argumentText, span }`。**

| 成员 | 含义 |
|---|---|
| `raw` | 输入 `T` 原样 |
| `name` | [S-13](#s-13-识别的三种结果) 第 3 步的 `N`：非空、不含空白与 `/`。**它不一定是合法的命令名**（`OMNE-OFFICIAL:x`、`--` 都可能出现在这里），更不一定在会话斜杠命令集里 |
| `argumentText` | `N` 之后的全部文字，**去掉开头与结尾的空白**（空白恒是 `W`），中间原样，含换行；可以是空串，空串即「人没有附带参数」 |
| `span` | `/name` 这一段在 `raw` 里的位置，恒为 `{ start: 0, end: 1 + N 的码点数 }` |

**位置的单位**：本契约里的一切位置（`span` 与解析失败的 `at`）都是 **`Span` = `{ start, end }`，以 Unicode 码点计、从 0 起、左闭右开，相对 `raw`**（账本 S20-b）。
**不是 UTF-16 码元，也不是字节**——两个语言的实现要对同一段输入指出同一处。`raw` 必须是合法的 Unicode 码点序列（没有落单的代理项）。

- **一致性**：一个 `CommandInvocation` 的 `name`、`argumentText`、`span` 必须恰是对它的 `raw` 重新识别得出的那三样；不一致即 `malformed`。
  接收它的一方（受理面接交付面交来的那一份）**按 `raw` 重新识别一遍再比对**，不信任对方「已经识别过」。
- **Schema 只管得到一部分**：`raw` 以 `/` 开头且第二个码点不是 `/`、`name` 的字符、`argumentText` 首尾无空白；其余由接收边界兑现。

### S-15 一条输入至多一条命令

**一条输入至多一条命令：命令名之后的一切都是参数文字，哪怕它又以 `/` 开头。**
`/a /b 说话` 是一次名为 `a` 的命令尝试，`argumentText` 是 `/b 说话`。本契约**不**支持一行叠多条命令（omne-next 的递归、Claude Code 的叠 skill 都不借），
那与产品正文[「一条输入至多一条命令」](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族)相反。

## 五、解析

**解析是纯函数 `parse(invocation, S) → ParseResult`**：`invocation` 是一次命令尝试，`S` 是这一刻这个会话的[会话斜杠命令集](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-session-slash-command-set--会话斜杠命令集--session-slash-command-set)——
一组「命令名 ＋ `SlashCommandDefinition`」对，命令名两两不同，每一份正文都合本契约的形状（这是提供它的一方的义务，`capability.asset-registry`；命令名取自那份记录的 `capability.name`）。
**同一个 `invocation`、同一个 `S`，结果永远相同**；它不读 `S` 以外的任何东西——不读权限、不读别处有没有这条命令、不读时间。

### S-16 名字只按会话斜杠命令集认

**在 `S` 里找命令名逐码点等于 `invocation.name` 的那一对；找不到，结果是 `failed`，`reason` 为 `unknown_command`，`at` 为 `invocation.span`。**

- **没权限的与不存在的，回答完全相同。**没权限用的命令本来就不在 `S` 里（它在装配时就没装进来，或权限收回时已被去掉，归 `capability.asset-registry`）；
  而解析**只读 `S`**，所以一个名字「根本不存在」「存在但这个人没权限」「被 reload 下架了」「刚被收回权限」，对同一个 `S` 得出**逐成员相同**的结果——
  **没有「你不能用」这第二种失败**（[PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)）。
  `explanation` 同样只许由 `invocation` 与 `S` 决定：它可以说「这个会话没有这个命令」、可以从 `S` 里提示相近的名字；**不得**提到权限、别的层、别的会话或别的租户。
- **不认得即失败，不退回普通文字**：`unknown_command` 不是「那就当一句话发出去」——产品负责人的补裁原话是「无权限 = 不存在 = 当场明说不发送」（[PF-002 decisions](../../../../product/PF-002-assets-settings-and-permissions/decisions.md#2026-09-23--斜杠命令参数无权限即不存在会话认得哪些命令③-型不开放保留名前缀)）。
- **大小写不同即不同名**：`S` 里有 `review` 时，`/Review` 是 `unknown_command`。
- **交付面自己的动作不在 `S` 里**：交付面在调用本契约之前先认它自己的动作；两者的名字不相交（[S-5](#s-5-保留名在系统内唯一没有优先级)），所以先后不改变结果。
- **两次解析各用各的 `S`**：交付面的预判用它手上的那一份，受理面以受理那一刻的那一份再判（[PF-014 §5.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走)）；
  两次结果不同时以受理面为准，那一步的收场归受理契约。本契约只保证：**两处拿到同一个 `S`，必得同一个结果**。

### S-17 参数文字的切分

**只有当找到的定义带 `parameters`（哪怕是空数组）时，才切分 `argumentText`；没有声明的命令不切分，`argumentText` 整段就是那个自由参数，永远不会因为参数而失败。**

切分从左到右，把 `argumentText` 切成一串**记号**，每个记号有它的**文字**与它在 `raw` 里的**位置**：

1. 引号之外的空白（`W`）分隔记号；连续的空白只算一处分隔。
2. 引号之外，`\` 让紧随其后的**一个**码点失去特殊含义、原样进入文字（空白、引号、`\` 都可以这样写）；`\` 是整段的最后一个码点时，它自己原样进入文字。
3. `'` 开启单引号段，直到下一个 `'`：其间一切原样进入文字，**没有转义**。
4. `"` 开启双引号段，直到下一个没被转义的 `"`：其间 `\"` 与 `\\` 分别写一个 `"` 与一个 `\`，别的 `\` 原样保留。
5. 相邻的段拼成同一个记号：`a"b c"d` 是一个记号，文字为 `ab cd`。`""` 与 `''` 是一个文字为空串的记号——**它与「没有这个记号」不同**。
6. 一个记号的位置从它的第一个码点（含开引号）到它的最后一个码点（含闭引号）之后。

**引号没有闭合**——`"` 或 `'` 开了、到整段末尾也没等到对应的闭引号——**解析失败、什么都不发**，`reason` 为 **`unterminated_quote`**（主线裁定 2026-09-23，待产品负责人确认；账本 S20-b），`at` 从那个开引号到 `raw` 的末尾。
**不**把没闭合的引号当成字面照收。

切分规则借 Claude Code 的 shell 式引号（[CC-6](../../../../../research/slash-command-parsing-sources/notes/claude-code.md#cc-6)），但在这里**钉死成上面六条**：
「用现成的 shell 词法库」会把参数文法交给库去定义，不同库在转义与引号上各不相同（[提案「D 的组成」](../../../../record/proposals/slash-command-parsing-baseline/alternatives.md#d-的组成借什么从哪借为什么只借这些)）。

### S-18 参数的绑定与取值

**从左到右处理每个记号：**

1. **文字以 `--` 开头、且长于两个码点的记号是具名写法。**去掉 `--`，在第一个 `=` 处分成参数名与值（没有 `=` 就只有参数名）。
   - 参数名不是这条命令声明过的某个**具名**参数（包括它其实是个位置参数的名字、`--=x` 这种空名字）→ `unexpected_argument`，`at` 为这个记号。
   - 这个具名参数前面已经给过一次 → `unexpected_argument`，`at` 为这第二次的记号。
   - `boolean` 型：`--name` 即 `true`；`--name=true`、`--name=false` 即相应的值；`=` 后是别的任何文字 → `type_mismatch`，`at` 为这个记号。**`boolean` 型从不吃掉下一个记号。**
   - 其余三型：有 `=` 时，`=` 之后的文字（可以是空串）就是值，出错时 `at` 为这个记号；没有 `=` 时，**下一个记号不论长什么样都是它的值**，出错时 `at` 为那个值记号；没有下一个记号 → `missing_required`，`at` 为这个具名写法的记号。
2. **其余的记号都是位置值**，依次交给还没取到值的下一个位置参数；位置参数已经取满 → `unexpected_argument`，`at` 为这个记号。
   `--` 本身（恰两个码点）、`-x`、`-7` 都是位置值。
3. **取值规则**，同一条对具名与位置都成立：

   | `kind` | 合法的文字 | 得到的值 | 不合时 |
   |---|---|---|---|
   | `string` | 任何文字，含空串 | 那段文字 | — |
   | `integer` | 可选的一个 `-`，其后一位或多位 ASCII 数字；数值在 −(2^53−1) 与 2^53−1 之间（含） | 那个整数 | `type_mismatch` |
   | `boolean` | 恰是 `true` 或 `false` | 相应的布尔值 | `type_mismatch` |
   | `enum` | 逐码点等于 `values` 里的某一个 | 那段文字 | `enum_out_of_range` |

4. **全部记号处理完之后**，按声明次序看每个 `required` 为真的参数：第一个没有取到值的 → `missing_required`，**没有 `at`**（它缺在哪里没有一处可指）。

**成功时**得到一张表：参数名 → 值，**只含这次给了的参数**；没给的可选参数**缺席**，不补 `null`、不补空串、不补 `false`。
整数的界取 2^53−1，是为了让它在 JSON 与每一种常见语言里都能被精确表示——超出的不是被舍入，而是 `type_mismatch`。

**不借的部分**：结尾选项标记 `--`（「此后一律是位置值」）、短选项、选项合并、同一具名参数重复取多个值——本版一律没有；
一个位置参数的值要以 `--` 开头，本版写不出来，**而它的后果是明说失败，不是被悄悄读成别的东西**。

### S-19 解析失败取第一处

**一次解析至多报一处失败，按下面的阶段次序取第一处：**

```text
1. 名字：S 里没有这个名字                               → unknown_command
2. 切分：引号没有闭合（仅当有参数声明）                  → unterminated_quote
3. 绑定：从左到右的第一个出错的记号                      → unexpected_argument / type_mismatch / enum_out_of_range / missing_required（具名写法缺值）
4. 必填：按声明次序第一个没取到值的必填参数               → missing_required（无 at）
```

同一段输入，两个实现报出**同一个 `reason`、同一个 `at`**，与遍历次序无关。`explanation` 是给人看的说明，**不参与这个相等**，只要求非空、说得出哪里不对。

### S-20 ParseResult 四支

**`ParseResult` 按 `kind` 判别，恰四支：**

| `kind` | 成员 | 何时 |
|---|---|---|
| `expanded` | `text` | `prompt` 型解析通过：展开后的文字（[S-21](#s-21-提示词型的展开)） |
| `skill` | `skill`：能力标识，类别为 `skill` | `skill` 型解析通过：所指的技能（[S-22](#s-22-技能型的引用与两块展开物)） |
| `command` | `service`；`arguments`（**出现当且仅当这条命令有参数声明**） | `command` 型解析通过：所指的系统业务流程与解析出的参数（[S-23](#s-23-命令型的参数)） |
| `failed` | `reason`；`at`（按 [S-18](#s-18-参数的绑定与取值)、[S-19](#s-19-解析失败取第一处) 该有时有）；`explanation`：非空 | 解析没通过 |

- **`reason` 恰六个取值，闭合**：`unknown_command`、`unterminated_quote`、`missing_required`、`type_mismatch`、`unexpected_argument`、`enum_out_of_range`。
  **没有「你不能用」，也没有「其他」。**
- **`ParseResult` 恒与产生它的那个 `CommandInvocation` 一起用**：原文、名字与参数文字都在后者里，前者**不重复携带**——两份会分叉，而没有人知道该信哪一份。
- **`failed` 是一个判定结果值，不是表示层拒绝**（[S-29](#s-29-表示层拒绝与解析失败分开都不修补)）：输入的形状完全合法，只是人敲的东西对不上。

### S-21 提示词型的展开

**`prompt` 型解析通过时，结果是 `{ kind: "expanded", text }`，`text` 是按 [S-10](#s-10-提示词模板与占位符) 展开模板得到的文字，另加一条：**

> **命令没有参数声明、模板里没有一个没被转义的 `$ARGUMENTS`、而 `argumentText` 非空时**，
> `text` 是展开后的模板，后接两个换行（U+000A U+000A）、`ARGUMENTS: `、再接 `argumentText`。

这一条借自 Claude Code `2.1.280`（[CC-6](../../../../../research/slash-command-parsing-sources/notes/claude-code.md#cc-6)，本机会话记录实测的就是这个形状）。
**它保证人附带的文字不会被一条没写占位符的模板悄悄吞掉**；有参数声明的命令不需要它——[S-10](#s-10-提示词模板与占位符) 第 2 条已在发布时保证每个参数都有去处。

- `text` 可以是空串以外的任何文字，也可以恰是空串（例如模板只有 `$ARGUMENTS`、人又什么都没附带）。
- 这段文字在受理时成为那条用户消息的内容（[PF-014 §5.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走)）：一个文本块，来源标记 `{ kind: "slash_command_expansion", command: <命令名> }`（`data.content-blocks` v1 [S-8](../../content-blocks/v1/contract.md#s-8-文本块与来源标记)）；块的标注归受理。

### S-22 技能型的引用与两块展开物

**`skill` 型解析通过时，结果是 `{ kind: "skill", skill }`：只是一个引用。**展开发生在受理时，由受理面做，展开物恰是 `data.content-blocks` v1 [S-8](../../content-blocks/v1/contract.md#s-8-文本块与来源标记) 的两种来路块：

| 次序 | 块 | 文字 | 来源标记 |
|---|---|---|---|
| 1 | 文本块 | 那个技能此刻生效的那份实现的**正文，逐字**——`data.skill-package` v1 [S-8](../../skill-package/v1/contract.md#s-8-正文逐字不展开不执行) 的 `body` | `{ kind: "skill_body", command: <命令名>, skill: <技能名> }` |
| 2 | 文本块，**仅当 `argumentText` 非空** | `argumentText`，原样 | `{ kind: "slash_command_args", command: <命令名> }` |

- **参数不拼进正文**（[PF-002 decisions 原话（一）问题一「另成一个内容块」](../../../../product/PF-002-assets-settings-and-permissions/decisions.md#2026-09-23--斜杠命令参数无权限即不存在会话认得哪些命令③-型不开放保留名前缀)）。
  有参数声明的 skill 型命令，参数先按声明验过（不通过即 `failed`），通过之后第二块的文字**仍是 `argumentText` 原样**，不是解析出的那张表。
- 两块的次序是本契约的推导：先方法、后人给的话，与人敲下去的次序一致。
- **技能自己的「谁可以使用它」（`usableBy`）不在解析里判**：解析看不到技能的权限。受理面展开时以**敲命令的那个人**的身份判它；不通过由受理面具名拒绝，**不是**本契约的失败值（[PF-002 §4 表后一段](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)）。
  所指的技能此刻不在这个会话的装配里、或者是一份不可用的同名替换件时展开什么，也归受理与 `capability.asset-evaluation`。

### S-23 命令型的参数

**`command` 型解析通过时，结果是 `{ kind: "command", service, arguments? }`。**

- **有参数声明**：`arguments` 是 [S-18](#s-18-参数的绑定与取值) 得到的那张表——键是参数名，值是字符串、整数或布尔；声明了参数、这次一个都没给时是 `{}`。
- **没有参数声明**：`arguments` **缺席**；那个自由参数就是 `invocation.argumentText`，由把事交出去的一方连同 `service` 一起交给流程。
  **缺席在这里有确定的意思——「这条命令不声明参数」**，与「声明了、这次没给」的 `{}` 不同。
- 这个结果**不成为任何内容**：③ 不进队列、不成为消息（[PF-014 §5.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走)）；
  流程什么时候办、办不办得了、交回什么，归那条流程与受理（[S-7](#s-7-servicename)）。

### S-24 解析失败即什么都不发

**拿到 `failed` 的一方，什么都不发出**：

- 交付面预判拿到它：**当场**把 `explanation` 与 `at` 呈现给人（机读形式交给脚本一个明确的失败，带 `reason`），
  **不产生入站到达**、不进队列、不展开、不触发任何流程、**不把这段输入当一句普通的话送出去**（[PF-016 §5.7](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族)）。
- 受理面再判拿到它：同样不进队列、不展开、不触发流程；它已经到了受理面，**照 [PF-014 §6.1](../../../../product/PF-014-inbound-intake-and-queueing/design.md#61-先落账再谈别的) 落一条具名拒绝**，效力是留痕——那条条目的形状归受理契约（[G-8](#十已知缺口)）。
- **`failed` 永不降级成「普通文字」**：没有「先失败再回退」。人要发一句 `/` 开头的话，走字面发送（[S-13](#s-13-识别的三种结果)）。

### S-25 留痕

**① ② 型：受理面产出的那条用户消息里，除展开物之外另有一块留痕块——一个来源标记为 `{ kind: "slash_command_record", command: <命令名> }` 的文本块，`text` 是这次的 `raw`，逐字**
（`data.content-blocks` v1 [S-8](../../content-blocks/v1/contract.md#s-8-文本块与来源标记)；主线裁定 2026-09-23，待产品负责人确认；账本 S20-c：**留痕不是第八类块，是一种来源标记**）。
它与同一条消息里 `command` 相同、来源标记为 `slash_command_expansion`、`skill_body`、`slash_command_args` 的那几块一起，
兑现「原命令与展开后的全文都留」「消息落盘之前看得到原命令的标注」（[PF-014 §5.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走)、[§5.6](../../../../product/PF-014-inbound-intake-and-queueing/design.md#56-消息落盘之前那一刻看得到什么)）。留痕的形状借 Claude Code 「原命令一份、展开全文一份」（[CC-7](../../../../../research/slash-command-parsing-sources/notes/claude-code.md#cc-7)）。

- **`ParseResult` 不另存**：成功的解析结果就是那几块展开物本身；要重看「当时解析成什么」，读展开物，**不按此刻的命令集重新解析**（命令集会变）。
- **留痕块与展开物的标注**由写下它们的受理一方定（`data.content-blocks` v1 的 [S-4](../../content-blocks/v1/contract.md#s-4-两个标注)）；本契约不预设留痕块给不给模型读。
- **③ 型不产生消息**：会话日志里那一条「记它发生过的条目」（命令名、参数、结果摘要）装的正是这里的 `CommandInvocation` 与 `command` 那一支的 `ParseResult`，再加流程交回的结果摘要；
  **条目的形状归受理契约**（[G-8](#十已知缺口)）。受理面再判得到 `failed` 时的具名拒绝条目同理。
- **留痕不改变展开物**：展开物照常是给模型读的内容。

## 六、装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。

> **本表只列跨部署形态会变的保证**——单机由装配（同一进程、同一份实现、同一个字符串对象）顺带给出的那些；
> 右列写分布式后**必须由协议重新兑现什么**，以及**做不到会怎样**。不在表里的条款在任何部署形态下一律成立，**不在表里不等于不适用**。
> **这张表是契约的一部分，不是流程笔记**：装配给的那些，演化到分布式时不会自动成立。

| 保证 | 单机由谁给 | 分布式必须由协议兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **交付面与受理面对同一段输入识别出同一个结果**（[S-12](#s-12-只识别经交付面的输入)、[S-13](#s-13-识别的三种结果)） | 两处调用同一份实现 | 两处是两个实现（本机客户端与据点进程，可能两种语言）：**各自跑通 [`examples.md` 的判定用例集](examples.md#4-判定用例集)**；输入在两处之间**逐码点原样**传递 | 交付面认成命令、受理面认成普通话（或反过来）：人以为下了命令，agent 收到一串字；人读与机读两种形式的记录分叉（[PF-016 §5.5](../../../../product/PF-016-cli-tui-delivery-surface/design.md#55-两种呈现形式同一份事实)） |
| **位置以码点计、相对 `raw`**（[S-14](#s-14-commandinvocation-与位置)） | 同一个字符串在同一个进程里 | `raw` 跨进程传递时**不做 Unicode 规范化、不改换行、不裁空白**，编码可换、码点序列不变；每一跳都按码点、不按 UTF-16 码元或字节计位置 | `at` 指错了字；留痕里的原文与人敲的不是同一串 |
| **接收方按 `raw` 重新识别**（[S-14](#s-14-commandinvocation-与位置)） | 同一进程里交出与收到的是同一个值 | 受理面收到交付面交来的 `CommandInvocation`，**重新识别再比对**，不信任对方的成员 | 一个伪造或变形的 `name` 绕过识别文法，触发了人没敲过的命令 |
| **没权限与不存在同一回答**（[S-16](#s-16-名字只按会话斜杠命令集认)） | 同一个函数、同一个 `S` | 失败值在任何一跳（代理、网关、客户端桩）**不得被加料**：不得补一句「你没有权限」、不得换成另一个失败 | 人从回答里分辨出「这条命令存在、只是我不能用」——产品正文刻意去掉的那第二种失败回来了，还能被用来探测别人有哪些命令 |
| **整数取值的界**（[S-18](#s-18-参数的绑定与取值)） | 同一个实现 | **不变**，但每个实现要各自兑现 ±(2^53−1) 这一界；不在界内的一律 `type_mismatch`，不舍入 | 同一个 `--limit 9007199254740993` 在两个实现里一收一拒，或被悄悄改成另一个数 |
| **保留名在系统内唯一**（[S-5](#s-5-保留名在系统内唯一没有优先级)） | 交付面动作表与系统的 ③ 型命令随同一个发布物 | 交付面与中心、据点分开发布时，**发布流程核对两类保留名不相交**（[SC-2](../verification.md#静态检查义务)） | 同一个 `/omne-official:x` 在这一处是交付面动作、在那一处是一条系统业务流程——一个名字两种解释 |

## 七、表示与边界校验

### S-26 规范表示

- **规范表示**：[`slash-command.schema.json`](slash-command.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/slash-command/v1/slash-command.schema.json`
- **定义项（9 项）**：`CommandName`、`ServiceName`、`CommandBinding`、`ParameterDeclaration`、`SlashCommandDefinition`、`Span`、`CommandInvocation`、`Recognition`、`ParseResult`。
  消费者 `$ref` 这些定义，**不复制一份同义类型**。**根模式不约束任何文档**：本文件是共享定义的登记处。
- **位置 `Span` 只定义一次**，`span` 与 `at` 都引它（账本 S20-b）；`ParseResult` 的 `skill` 支以 JSON Pointer 引 `CommandBinding` 的 `skill` 支，不另立定义名。
- **识别与解析是函数，Schema 表达不了**：它们的规范表达是本文件第四、五节的条款与 [`examples.md` 的判定用例集](examples.md#4-判定用例集)。
- **成员名一律 camelCase**，枚举值一律 snake_case 字符串；判别成员一律叫 `kind`。
- **外部引用**：`CapabilityName`、`CapabilityId` 取自 `data.asset-model` v1。
- **正反实例与判定用例集**：[`examples.md`](examples.md)。它是本版的规范工件，不是说明材料。

### S-27 判别式与枚举闭合

`CommandBinding.kind`、`ParameterDeclaration.kind`、`Recognition.kind`、`ParseResult.kind`、`ParseResult` 里 `failed` 的 `reason` 各是一个**闭合集合**，没有「其他」。

遇到未知取值**一律作表示非法拒绝**：**不得**映射到「最接近」的已知值、**不得**当作缺省、**不得**忽略该成员继续。
一个未知的绑定种类被当成 `prompt`，一条本该交给流程的命令就成了一段送给模型的话；一个未知的失败原因被当成成功，**什么都不发**就变成了发出去。

### S-28 表示层拒绝值

**一个值不合本契约的形状时，拒绝值恰为下面六个之一，集合闭合：**

| 拒绝值 | 什么时候 | 条款 |
|---|---|---|
| `binding_unknown` | 绑定目标的 `kind` 出现了，但不是 `prompt`、`skill`、`command` 之一 | [S-6](#s-6-三种绑定目标) |
| `name_invalid` | 一份 `slash_command` 记录的 `capability.name`（或一个单独校验的 `CommandName`）是字符串，但违反 [S-2](#s-2-命令名的词法)（空串、含空白、含 `/`）或 [S-3](#s-3-保留区与它唯一的拼法) 第 2 条（保留区里的名字前缀拼法不对、或前缀之后什么都没有） | S-2、S-3 |
| `name_reserved` | 绑定目标的 `kind` 认得出，而所在记录的命令名与保留区的对应违反 [S-4](#s-4-保留区只归系统提供的命令型)：① ② 型在保留区里、③ 型不在、或 ③ 型定义出现在非 `official` 的记录里 | S-4 |
| `parameter_duplicate` | `parameters` 里两个参数同名 | [S-9](#s-9-参数声明的结构约束) |
| `positional_after_named` | `parameters` 里一个位置参数排在一个具名参数之后 | [S-9](#s-9-参数声明的结构约束) |
| `malformed` | 其余一切不合形状：缺必填成员（含判别成员缺席）、多出成员、类型不对、`positional` 写成 `false`、`enum` 型缺 `values` 或别的型带了 `values`、`values` 有重复、参数名不合词法、必填位置参数排在可选位置参数之后、skill 型的目标类别不是 `skill`、模板为空或占位符对不上声明（[S-10](#s-10-提示词模板与占位符)）、`ServiceName` 首尾有空白、正文里带了 `name` 这类未登记成员、`CommandInvocation` 与它的 `raw` 重新识别的结果不一致、位置越界或 `start > end`、`ParseResult` 的 `reason` 或 `Recognition` 的 `kind` 不认得、带了多余的成员。**判据只有一条**：不合 Schema，或违反本契约第三、四节的约束；上面只是举例 | 各条 |

**一份输入里有多处违例时，拒绝值取其中优先级最高的那个**，次序固定：

```text
binding_unknown  >  name_invalid  >  name_reserved  >  parameter_duplicate  >  positional_after_named  >  malformed
```

这个次序让两个实现对同一份输入给出**同一个**拒绝值，与遍历次序无关（本契约的推导）：
绑定种类决定其余规则怎么判（保留区规则要先知道是不是 ③ 型），所以排第一；名字的拼写先于名字的归属；参数在名字之后；`malformed` 是剩余项，不是「其他」——它有确定的判据，只是不再细分。

拒绝值怎样落进各个操作自己的失败集合（发布、登记官方件、受理面收到一份 `CommandInvocation`），归那些契约；**它们引用本条的名字，不另起一套同义值**。
一份资产记录里的命令正文违反本条，`data.asset-model` v1 的 [S-27](../../asset-model/v1/contract.md#s-27-表示层拒绝值) 原名携带这里的值；`name_invalid` 与那边同名值同义。

### S-29 表示层拒绝与解析失败分开，都不修补

- **表示非法的输入在进入任何判定之前被拒绝**，这次拒绝**不表示**「这条命令不存在」「这个人没资格」，也**不得被记成一次判定结果**——
  与 `data.asset-model` v1 的 S-28 是同一条规矩。
- **解析失败不是表示层拒绝**：`ParseResult` 的 `failed` 是对一份**形状合法**的命令尝试做出的判定——人敲的名字这个会话没有、参数对不上声明。
  它的六个 `reason` 与上面六个拒绝值**不是同一个集合，不得混用**：一份合法的 `CommandInvocation` 永远不会得到 `malformed`，一份坏的命令定义也永远不会得到 `unknown_command`。
- **不修补、不降级、不尽力而为**：不把 `OMNE-OFFICIAL:` 改成小写后接受、不把带 `/` 的名字「清洗」一下、不补缺的 `required`、不把 `positional: false` 读成具名、
  不把一个没闭合的引号当字面照收、不把类型不对的参数值「尽量转一下」、不把 `unknown_command` 改当普通话送出。**修补等于替写的人或敲的人做了一个他没做的决定。**
- **表示合法不表示任何资格**：Schema 校验通过只说明形状合规，不说明这个人能用这条命令、这个技能他用得了、这条流程此刻办得了。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 管不到的那部分归谁 |
|---|---|---|
| [S-1](#s-1-斜杠命令定义是资产的正文) | 管三个成员、必填与否、不多成员（正文里带 `name` 即拒） | —— |
| [S-2](#s-2-命令名的词法)、[S-3](#s-3-保留区与它唯一的拼法) | **管得到**（对一个单独的 `CommandName`）：`data.asset-model` 的名字词法、保留区的判定与唯一拼法 | 一份记录的 `capability.name` 是不是合 `CommandName`——`data.asset-model` 的 Schema 只管到通用词法，保留区拼法归接收边界 |
| [S-4](#s-4-保留区只归系统提供的命令型) | **管不到**：三行都要看所在记录 | 写面与接收边界 |
| [S-5](#s-5-保留名在系统内唯一没有优先级) | **管不到** | 静态检查 [SC-2](../verification.md#静态检查义务) |
| [S-6](#s-6-三种绑定目标)、[S-7](#s-7-servicename) | **管得到**：三支、skill 类别、`ServiceName` 的首尾 | `ServiceName` 解不解得到归登记处（[G-7](#十已知缺口)） |
| [S-8](#s-8-参数声明) | **管得到**：成员、四种 `kind`、`values` 与 `kind` 的对应、`positional` 只取 `true`、参数名词法、`hint` 非空 | — |
| [S-9](#s-9-参数声明的结构约束) | **管不到**（要看整个数组） | 接收边界；[`examples.md` 第 5 节](examples.md#5-schema-挡不住但同样非法的) |
| [S-10](#s-10-提示词模板与占位符) | 只管模板非空 | 占位符对得上声明——接收边界 |
| [S-11](#s-11-属性项的推出规则) | 不是形状 | 推出规则的实现与 `capability.asset-evaluation` |
| [S-12](#s-12-只识别经交付面的输入)～[S-25](#s-25-留痕) | 只管 `Recognition`、`CommandInvocation`、`Span` 与 `ParseResult` 的形状 | **识别与解析是函数**：判定用例集（[`examples.md` 第 4 节](examples.md#4-判定用例集)）＋ 两处实现的符合性 |

**非法输入的含义**：Schema 校验失败 ⇒ 该输入**不是**本契约的一个值 ⇒ 按 [S-28](#s-28-表示层拒绝值) 取拒绝值、按 [S-29](#s-29-表示层拒绝与解析失败分开都不修补) 收场。
**Schema 通过也可能仍然非法**——上表「管不到」那一列里属于形状的那些，由接收边界的校验兑现。

## 八、性质与场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 识别只由输入文字决定；同一段文字，交付面两种形式与受理面得出同一个结果 | 不变量 | [PF-016 §5.5](../../../../product/PF-016-cli-tui-delivery-surface/design.md#55-两种呈现形式同一份事实)、[§5.7](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) | 文法（[S-13](#s-13-识别的三种结果)）＋ 每个实现跑通判定用例集 | 同一行字人敲触发了流程、脚本发却进了队列 |
| P-2 | 一条输入至多一条命令，只认第一个码点 | 不变量 | [PF-016 §5.7](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) | 文法（[S-13](#s-13-识别的三种结果)、[S-15](#s-15-一条输入至多一条命令)） | 一句话中间的 `/xxx` 触发了命令；一行敲出两条 |
| P-3 | 每个合法命令名都敲得出、认得回 | 不变量 | 本契约推导 | 词法（[S-2](#s-2-命令名的词法)）与文法的配合 | 发布成功的一条命令，人怎么敲都认不出 |
| P-4 | 以 `/` 开头的普通话有一条独立的字面出路，不经「先失败再回退」 | 安全 | [PF-016 §5.7](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) | 文法（[S-13](#s-13-识别的三种结果)）＋ [S-24](#s-24-解析失败即什么都不发) | 拼错的命令悄悄变成一句话、一次付费调用 |
| P-5 | 没权限用的命令与不存在的名字得到逐成员相同的回答 | 安全 | [PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变) | 解析只读 `S`（[S-16](#s-16-名字只按会话斜杠命令集认)）＋ 注册表不把无权命令装进 `S` ＋ 各跳不加料（第六节） | 回答里出现「你不能用」；或能据回答探出别人有哪些命令 |
| P-6 | 解析失败时什么都不发出，并说得出哪里不对 | 安全 | [PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)、[PF-016 §5.7](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) | `failed` 是一个值（[S-20](#s-20-parseresult-四支)）＋ 消费者义务（[S-24](#s-24-解析失败即什么都不发)） | 参数对不上声明的命令照样进了队列或触发了流程 |
| P-7 | 保留区只归系统提供的 ③ 型；① ② 型从定义上撞不上任何保留名 | 安全 | [PF-002 §4「名字与撞名」](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)、[§2 非目标](../../../../product/PF-002-assets-settings-and-permissions/design.md#非目标) | Schema（[S-3](#s-3-保留区与它唯一的拼法) 的拼法）＋ 写面与接收边界（[S-4](#s-4-保留区只归系统提供的命令型) 三行） | 一个仓库发布的提示词顶掉了「压缩上下文」；一个名字从此有两种解释 |
| P-8 | 声明了参数的按声明解析；没声明的整段一个自由参数、永不因参数失败 | 不变量 | [PF-002 §4「自带的属性」](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) | [S-17](#s-17-参数文字的切分)～[S-19](#s-19-解析失败取第一处) | 没声明参数的命令因为一个引号被拒；或声明了参数的命令照收了对不上的参数 |
| P-9 | 人附带的每一段参数都进 ① 的展开物，不被悄悄丢掉 | 不变量 | [PF-002 §4 三行表 ①](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)（「带上参数」） | 模板合法性（[S-10](#s-10-提示词模板与占位符) 第 2 条）＋ 追加规则（[S-21](#s-21-提示词型的展开)） | 验过的参数没进消息，模型不知道人给过它 |
| P-10 | ② 的技能正文逐字成一块、参数另成一块 | 不变量 | [PF-002 §4 三行表 ②](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) | 展开物的对应（[S-22](#s-22-技能型的引用与两块展开物)）；受理面照做 | 参数被拼进了技能正文，正文不再逐字 |
| P-11 | 解析是 `(invocation, S)` 的纯函数，失败取第一处 | 不变量 | SYS-SPEC | [S-16](#s-16-名字只按会话斜杠命令集认)、[S-19](#s-19-解析失败取第一处) | 两个实现对同一段输入报出不同的 `reason` 或 `at` |

**进展性质：本契约不拥有任何进展性质。**识别与解析是一步算完的纯函数；「命令集什么时候换」「流程什么时候办」归注册表、受理与流程的一侧。

**不建形式工件。**本契约没有状态转移；它的结构约束 Schema 与条款即可表达，识别与解析是全函数，
它们的证据形式是**判定用例集**（[`examples.md` 第 4 节](examples.md#4-判定用例集)）在每一个实现上跑通——
一个有界的输入表比一份与文法同义的模型更能在该语义消失时失败。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**任一条走不通，缺口在本契约；停在一个已登记的缺口不算走不通，如实记为「本版到此为止」。

#### CS-1 交付面预判一行输入

交付面（人读形式）在**人敲下 `/fix-issue abc`** 时，依赖 [S-13](#s-13-识别的三种结果)、[S-16](#s-16-名字只按会话斜杠命令集认)、[S-18](#s-18-参数的绑定与取值)、[S-24](#s-24-解析失败即什么都不发)，得到：
一次命令尝试；按它手上的会话斜杠命令集找到 `fix-issue`，第一个位置参数要整数、给的是 `abc`，`failed{type_mismatch}`，`at` 指着 `abc`；当场呈现、不发送。
脚本（机读形式）发同一行，得到同一个 `reason` 与 `at`。

#### CS-2 受理面以此刻为准再判

受理面在**交付面预判通过、发出之后、受理之前那个人对这条命令的权限被收回**时，依赖 [S-14](#s-14-commandinvocation-与位置)、[S-16](#s-16-名字只按会话斜杠命令集认)、[S-24](#s-24-解析失败即什么都不发)，得到：
先按 `raw` 重新识别、与交来的成员比对一致；再以受理那一刻的 `S` 解析，名字已不在 `S` 里，`failed{unknown_command}`——与敲一个根本不存在的名字逐成员相同；不进队列、不触发流程。
**落那条具名拒绝的形状停在 [G-8](#十已知缺口)**。

#### CS-3 受理面展开一条技能型命令

受理面在**人敲 `/code-review focus on error handling`** 时，依赖 [S-20](#s-20-parseresult-四支)、[S-22](#s-22-技能型的引用与两块展开物)、[S-25](#s-25-留痕)，得到：
`skill{code-review}`；以敲命令的人的身份判技能自己的使用权限（不在本契约）；通过之后，技能正文逐字一块（`skill_body`）、`focus on error handling` 一块（`slash_command_args`）；
另有一块 `slash_command_record` 留痕，`text` 是 `/code-review focus on error handling` 原样（[S-25](#s-25-留痕)）。

#### CS-4 注册表装一个会话的命令集

`capability.asset-registry` 在**会话创建时装配、以及人发 `/omne-official:reload-slash_command` 这类 reload 时重填命令那一张注册表**时，依赖 [S-1](#s-1-斜杠命令定义是资产的正文)～[S-4](#s-4-保留区只归系统提供的命令型)，得到：
会话斜杠命令集的元素是「命令名（记录的 `capability.name`）＋ `SlashCommandDefinition`」一对，命令名两两不同；reload 一族的名字都在保留区里、绑定是 `command`。
**一族里有哪几条、各叫什么归那份契约**——本契约只保证它们的名字合法、在保留区里（示例用的 `omne-official:reload-skill` 只是示意）。

#### CS-5 发布一条名字带保留前缀的提示词命令

`capability.asset-governance` 在**某组织发布一份能力标识为 `slash_command/omne-official:summarize`、正文 `{ binding: { kind: "prompt", … } }` 的记录**时，依赖 [S-4](#s-4-保留区只归系统提供的命令型)、[S-28](#s-28-表示层拒绝值)，得到：
拒绝值 `name_reserved`，发布不成立；说明「这个前缀留给系统」是写面的呈现（[PF-002 acceptance](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md)）。
同一份记录的名字若写成 `OMNE-OFFICIAL:summarize`，得到的是 `name_invalid`——**两个名字、两个拒绝值，都不会被改写后接受**。

#### CS-6 导入一个 Claude Code 命令文件

导入器在**把一份用了 `$0`、`$1` 与 `$ARGUMENTS[0]` 的 Claude Code 命令文件导成 ① 型资产**时，依赖 [S-8](#s-8-参数声明)、[S-10](#s-10-提示词模板与占位符)，得到：
`$N` 从 0 起，与 Claude Code `2.1.280` 同；`$ARGUMENTS[0]` 不是本契约的占位符，导入器要把它改写成 `$0`；
**用了 `$N` 就必须声明位置参数**，导入器要为 `$0`、`$1` 生成两条位置参数声明——它们在 Claude Code 里「没给就留原文」，在这里是「可选的没给就展开为空串、必填的没给就明说失败」，**这一处行为差异导入时要逐项报告**，不静默改变。

#### CS-7 资产求值推一条命令的属性项

`capability.asset-evaluation` 在**第 3 步投影一条斜杠命令的属性项**时，依赖 [S-11](#s-11-属性项的推出规则)，得到：
推出规则产出空集；全部属性项是 `data.asset-model` 保留的 `disabled` 与 `usableBy` 两项。

## 九、缺席怎么收

**本契约没有操作，因此没有提交点、没有幂等边界、没有事件。**下面写的是值层面的缺席各自是什么意思：

| 缺席的是什么 | 意思 | 条款 |
|---|---|---|
| 定义的 `parameters` | **合法且有确定含义**：没有声明，命令名之后的整段文字作一个自由参数。**不是**「声明了零个参数」——那是 `[]` | [S-1](#s-1-斜杠命令定义是资产的正文) |
| 参数声明的 `positional` | **合法**：具名参数。写成 `false` 反而是 `malformed` | [S-8](#s-8-参数声明) |
| 参数声明的 `required` | **拒绝**（`malformed`），不当作 `false` | [S-8](#s-8-参数声明) |
| 定义的 `description` 或 `binding`；绑定的 `kind` | **拒绝**（`malformed`） | [S-1](#s-1-斜杠命令定义是资产的正文)、[S-6](#s-6-三种绑定目标) |
| 这次没给的可选参数 | **在 `arguments` 里缺席**，不补 `null`、空串或 `false`；① 的 `$N` 指着它时展开为空串（借 Claude Code 对声明过的参数的规则） | [S-18](#s-18-参数的绑定与取值)、[S-10](#s-10-提示词模板与占位符) |
| 必填参数没给 | **明确失败**：`missing_required` | [S-18](#s-18-参数的绑定与取值) |
| `argumentText` 为空 | 人没有附带参数：② 不产出第二块；① 的 `$ARGUMENTS` 展开为空串、不追加 `ARGUMENTS:` 一行 | [S-21](#s-21-提示词型的展开)、[S-22](#s-22-技能型的引用与两块展开物) |
| `command` 结果的 `arguments` | **合法且有确定含义**：这条命令不声明参数；自由参数在 `invocation.argumentText` | [S-23](#s-23-命令型的参数) |
| `failed` 的 `at` | 只在「必填参数没给」时缺席；别的失败缺 `at` 即 `malformed` | [S-18](#s-18-参数的绑定与取值)、[S-20](#s-20-parseresult-四支) |
| 会话斜杠命令集里没有这个名字 | **明确失败**：`unknown_command`，**不是**普通文字 | [S-16](#s-16-名字只按会话斜杠命令集认) |
| 输入不经交付面 | 不调用识别文法，`/xxx` 原样是内容 | [S-12](#s-12-只识别经交付面的输入) |
| 参数声明的 `hint` | **合法**：作者没给提示；交付面可从声明本身长出提示 | [S-8](#s-8-参数声明) |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆**：它什么外部效果也不产生。

## 十、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决；消费者读到这里应当知道**哪里在等裁决**，而不是照着一个猜测实施。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-1** | **已闭合（2026-09-24 整批对齐）**：`data.asset-model` v1 已改为禁斜杠、许冒号；`CommandName` 改为 `$ref` 那边的 `CapabilityName` 再加保留区（[S-2](#s-2-命令名的词法)） | — | — |
| **G-2** | **已闭合（2026-09-24 整批对齐）**：对 `data.skill-package` v1 的依赖已登（它的 S-8），[S-22](#s-22-技能型的引用与两块展开物) 的第一块指它的 `body` | — | — |
| **G-3** | **已闭合（2026-09-24 整批对齐）**：引号没闭合的 `reason` 是 `unterminated_quote`——主线裁定 2026-09-23，待产品负责人确认（账本 S20-b）；见 [S-17](#s-17-参数文字的切分)、[S-19](#s-19-解析失败取第一处)、[S-20](#s-20-parseresult-四支) | — | — |
| **G-4** | **已闭合（2026-09-24 整批对齐）**：留痕不是第八类块，是 `data.content-blocks` v1 S-8 的来源标记 `slash_command_record`（① 型展开物另用 `slash_command_expansion`）——主线裁定 2026-09-23，待产品负责人确认（账本 S20-c）；见 [S-25](#s-25-留痕) | — | — |
| **G-5** | **已闭合（2026-09-24 整批对齐）**：「谁可以用」是 `data.asset-model` v1 保留的 `usableBy`（项名、取值域、默认 `self`）——主线裁定 2026-09-23，待产品负责人确认（账本 S18-c、S20-b）；见 [S-11](#s-11-属性项的推出规则) | — | — |
| **G-6** | **已闭合（2026-09-24 整批对齐），产品正文待修订**：参数声明、参数提示、绑定目标是正文成员，不随持有配值；参数提示是 `ParameterDeclaration.hint`——主线裁定 2026-09-23，待产品负责人确认（账本 S20-d）。PF-002 §4 把它们列在「设置」一栏的那一处由产品修订批改 | — | **产品修订**（PF-002 的 owner） |
| **G-7** | **系统业务流程的登记处**：`ServiceName` 解到哪个服务的哪个动作、此刻办不办得了、结果摘要什么形状，没有契约 | [S-7](#s-7-servicename)、[S-23](#s-23-命令型的参数) 交出去之后的那一段；③ 型条目里的「结果摘要」 | **主线**（登记处落在哪份契约）；每条流程的语义归定义它的 topic |
| **G-8** | **③ 型那条「记它发生过的条目」与受理面具名拒绝条目的形状** | [S-24](#s-24-解析失败即什么都不发)、[S-25](#s-25-留痕)：条目要装 `CommandInvocation` 与 `ParseResult`，装在哪、叫什么没有定 | **受理契约**（PF-014 的规格化，未立）与 PF-000 记录条目 |
| **G-9** | **同一次提交里人还带了附件时，命令与附件怎样一起走**：① ② 型展开出的那条用户消息带不带那些附件，③ 型遇到附件怎么办 | 交付面允许在一次提交里带附件时的受理 | **受理契约**（PF-014 的规格化，未立） |
| **G-10** | **主线裁定没有设计链内的依据**：能力标识名禁 `/` 许 `:`；「谁可以用」= `usableBy`；`unterminated_quote`、`Span`、`Recognition`、留痕是来源标记、参数提示在正文、正文不带名字——主线 2026-09-23 裁定（账本 S9-c、S18-c、S20-b～S20-e），**待产品负责人确认** | 本契约接受时 [S-1](#s-1-斜杠命令定义是资产的正文)、[S-2](#s-2-命令名的词法)、[S-8](#s-8-参数声明)、[S-11](#s-11-属性项的推出规则)、[S-13](#s-13-识别的三种结果)、[S-17](#s-17-参数文字的切分)、[S-25](#s-25-留痕) 的可追溯性 | **主线**：落进决定记录（D-039 汇编，账本 S20-e）；**产品负责人**确认 |

**一件曾经像缺口、现已不是的事**：「交付面自己的动作与斜杠命令撞名听谁的」——产品正文已由保留名规则闭合，**没有优先级要定**（[S-5](#s-5-保留名在系统内唯一没有优先级)）。

## 十一、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **会话斜杠命令集的内容与更替**：装配时装哪些、没权限的怎样不装、reload 一族有哪几条与各刷哪张注册表、③ 型失败后何时自动刷新——归 `capability.asset-registry` 与 `capability.asset-evaluation`。
- **「谁可以用」的求值**：各层取哪个值、`self` 指谁、怎样求交——归 `capability.asset-evaluation`。
- **受理**：预判与再判两次结果不同时的收场、① ② 展开成消息的块标注、② 的技能权限判定、③ 交给流程、条目落账——归受理契约（未立）。
- **任何一条系统业务流程**的语义、时机（运行在跑时何时生效，[PF-014 §9.5](../../../../product/PF-014-inbound-intake-and-queueing/design.md#95-斜杠命令受理时还有一处没说)）、结果与失败——归定义它的一侧。
- **交付面**：动作表与它们的拼写、菜单、补全、失败的呈现与本地化——归交付面呈现与受理契约。`explanation` 的措辞与语言本契约只约束「说得出哪里不对」与「只由 `invocation` 与 `S` 决定」。
- **本版没有的参数写法**：短选项、结尾选项标记 `--`、选项合并、可变数量的位置参数、同一具名参数取多个值、参数默认值、参数的说明文字。
- **本版没有的占位符**：`$ARGUMENTS[N]`、具名 `$name`、`${…}` 变量、内联 shell、`@文件`。
- **一行多条命令**、**任意位置的命令手势**。
- **外部格式的导入映射**——归导入器；本契约只给出它要映射到的形状（[CS-6](#cs-6-导入一个-claude-code-命令文件)）。
- **长度上限**：`raw`、`argumentText`、模板、参数个数本版不设上限；若将来要设，它是一个具名的政策参数，由消费者的契约定。
- **不承诺任何已执行的验证。**证据义务与状态在[验证入口](../verification.md)；Schema、实例与判定用例集文件存在不表示已被校验或跑通。

## 十二、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。

**本版的规范工件**：本文件、[`slash-command.schema.json`](slash-command.schema.json)、[`examples.md`](examples.md)——
**判定用例集是规范工件，不是说明材料**：识别与解析是函数，它们的边界有一半靠「这一行字得出什么」说清楚。

**不建 `formal/`**：理由在[性质一节](#性质)末尾——没有状态转移；识别与解析是全函数，证据形式是判定用例集在每一个实现上跑通。
**这不是把义务省掉**：本契约触发的义务是 Schema 正反实例校验、接收边界校验、判定用例集、跨实现一致与静态检查，逐条登记在[验证入口](../verification.md)。

**发布后**：本目录下的规范正文、Schema 与实例不可原地覆盖；修改发布新版本。
G-1～G-6 已于 2026-09-24 整批对齐原地闭合（影响记在[验证入口](../verification.md#变化的影响)）；[已知缺口](#十已知缺口)里 G-7、G-8、G-9 任一项被裁决若改变本契约的表示，接受之前闭合则原地改，接受之后闭合则**出 v2**。**推荐版本不自动升级消费者。**
