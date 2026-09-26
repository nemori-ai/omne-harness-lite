# PF-006 工具与技能 · 设计投影 v1

- 对应需求：[PF-006](../../README.md) 全部条款——三层（动作空间、呈现方式、当下可用性）、常驻、依赖与可用性、替换件、工具定义的形状与返回值、一次工具执行的全过程与六种收场、等待态与发帧、卸载、执行环境要求、两端模态、停机不重来、MCP 接入点带来的动作。
  **不含**：资产本身的定义、持有、层级求值与治理写面（见 [PF-002 投影](../../../PF-002-assets-settings-and-permissions/projection/README.md)）；`Skills()`／`Tools()` 等常驻门的具体形状（PF-007，无契约）；模型回复一侧的调用与收场（PF-013）；PF-008 与 PF-012 只在第 1 节登记被消费的点、**不投影**。
- 本版依据的需求修订：**PF-006 rev 19**（`README.md` front-matter `revision: 19`）；相邻：PF-002 rev 20、PF-004 rev 12、PF-005 rev 5、PF-007 rev 18、PF-008 rev 7、PF-009 rev 8、PF-012 rev 14、PF-013 rev 12、PF-014 rev 7、PF-015 rev 11、PF-016 rev 6。
- 版本说明：**`post-review`**。实现映射节点已过五批 architecture-reviewer 独立评审，处置为 [D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M49～M75、N-26～N-28。评审意见不改变任何节点或契约的接受状态（N-28）。
- 状态：**未接受**。16 份契约全部 `candidate`、未冻结，接受待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)（草案，未签）；节点接受决定尚未立；本投影依据的主线裁定 [D-040](../../../../record/decisions/mainline-self-rulings-2026-09/README.md) 尚未由产品负责人逐条追认。[`provenance.json`](provenance.json) 的哈希一律为 `null`，**全部来源都可能漂移**，据它实施前逐项核坐标。
- 未决：契约缺口 **115** 条、节点与装配缺口 **56** 条、产品负责人待裁或待确认 **12** 项（见[第 7 节](#7-未决项与已回询项)）。其中挡住**产品装配**的是 cli 缺口 C-1～C-8、C-13、C-16 与放行判断没有提供者；**验收装配**不被它们挡住。

**读法**：第 1～4 节回答「必须为真的是什么」，来源是产品正文与契约；第 5～6 节回答「用哪些原语兑现、有什么证据」，来源是节点。
条款坐标缩写（全部 v1、全部 `candidate`）：

| 缩写 | 契约 | 缩写 | 契约 |
| --- | --- | --- | --- |
| `td` | [`data.tool-definition`](../../../../spec/data/tool-definition/v1/contract.md) | `le` | [`data.loop-extension`](../../../../spec/data/loop-extension/v1/contract.md) |
| `ta` | [`capability.tool-admission`](../../../../spec/capabilities/tool-admission/v1/contract.md) | `run` | [`capability.loop-extension-runner`](../../../../spec/capabilities/loop-extension-runner/v1/contract.md) |
| `ter` | [`capability.tool-execution-runtime`](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md) | `hi` | [`capability.hooks-import`](../../../../spec/capabilities/hooks-import/v1/contract.md) |
| `reg` | [`capability.asset-registry`](../../../../spec/capabilities/asset-registry/v1/contract.md) | `sa` | [`capability.stream-assembly`](../../../../spec/capabilities/stream-assembly/v1/contract.md) |
| `br` | [`capability.mcp-bridge`](../../../../spec/capabilities/mcp-bridge/v1/contract.md) | `cb` | [`data.content-blocks`](../../../../spec/data/content-blocks/v1/contract.md) |
| `me` | [`data.mcp-endpoint`](../../../../spec/data/mcp-endpoint/v1/contract.md) | `msg` | [`data.messages`](../../../../spec/data/messages/v1/contract.md) |
| `sp` | [`data.skill-package`](../../../../spec/data/skill-package/v1/contract.md) | `ca` | [`data.call-accounts`](../../../../spec/data/call-accounts/v1/contract.md) |
| `sc` | [`data.slash-command`](../../../../spec/data/slash-command/v1/contract.md) | `ae` | [`data.arrival-events`](../../../../spec/data/arrival-events/v1/contract.md) |

节点缩写：`cli` = [`apps/cli`](../../../../realization/apps/cli/design.md)；各 provider 节点在第 5 节首表。裁定只引 D-039、D-040；D-040 的条目写 `D-040 Mn`／`Kn`／`Ln`／`N-n`。

## 1. 本版覆盖的需求条款

**确认状态**分三种：**已确认**（rev 17 定稿内容、产品负责人拍板的裁决）；**候选**（rev 18 主线裁定，[decisions 第二节](../../decisions.md#rev-18-的主线裁定与推导2026-09-23待产品负责人确认)，待产品负责人确认）；**PM 推导待确认**（rev 18–19 的推导行）。候选与待确认的条款已写进契约，**确认前按契约实施，改判时走契约新版本**。覆盖关系的权威在 [`covers.json`](../../../../registry/README.md#covers)，本节 108 行 PF-006 登记**全部 `reviewed: false`**。

| 需求 | 契约落点 | 确认状态 |
| --- | --- | --- |
| [§4 三层](../../design.md#三层能做什么--怎么够得着--现在做不做得了)、[§5.1](../../design.md#51-三层正交) | `reg#S-8`（可用性只由依赖解析算出）、`#S-10`（替换件同形）、`#S-7`（常驻只来自求值） | 已确认；§5.1 在 covers 里**没有登记** |
| [§4 常驻](../../design.md#常驻)、[槽位](../../design.md#槽位)、[§6.1](../../design.md#61-常驻标记挂在引用条目上agent-definition-压-plugin) | `reg#S-7`；`sp#S-18`（常驻不在包里）；标记的求值归 PF-002 投影 | 已确认 |
| [§4 技能的说明](../../design.md#技能的说明) | `sp#S-7`、`#S-8`（正文逐字、两条路同文） | 已确认 |
| [§4 依赖](../../design.md#依赖)、[只有且只有必需](../../design.md#只有且只有必需)、[§6.4](../../design.md#64-依赖声明与解析) | `td#S-9`、`#S-18`、`#S-19`；`sp#S-13`、`#S-14`、`#S-16`、`#S-32`；`reg#S-8` | 已确认 |
| [§4 可用性](../../design.md#可用性)、[§6.2](../../design.md#62-可用性在每次-run-开始前重算) | `reg#S-8`、`#S-11`（每次执行尝试开头 `refreshAvailability`） | 已确认；「每一次尝试都算一次开始」归 PF-012 |
| [§4 替换件](../../design.md#替换件)、[§6.3](../../design.md#63-不可用时装的是同名替换件不是不装) | `reg#S-10`；`td#S-6`、`#S-27`；`br#S-10`、`#S-17`；`ter#S-23`、`#S-37` | 已确认 |
| [§4 Tool Execution](../../design.md#tool-execution)、[§5.2](../../design.md#52-工具这个词指三样东西寿命各不相同)、[§6.5](../../design.md#65-工具执行有自己的运行时绑定在-session-上) | `ter#S-1`、`#S-5`、`#S-6`、`#S-8`、`#S-24`、`#S-29`；`td#S-1`、`#S-30` | 已确认 |
| [§5.3 一份工具定义长什么样](../../design.md#53-一份工具定义长什么样)、[说明必填](../../design.md#工具说明与每个参数的说明必填)、[多命令工具带多少](../../design.md#多命令工具的定义里带多少是工具作者的权衡) | `td#S-3`～`#S-8`；`br#S-17`（MCP 缺说明补占位） | 说明必填与「模型面前只有命令清单」**已确认**（U-24-1、U-24-2，[decisions 第一节](../../decisions.md#2026-09-24--说明必填多命令工具在模型面前只有紧凑的命令清单一种样子)）；「每个命令一行说明也必填」「只带命令清单仍成立」**PM 推导待确认**；MCP 缺说明补占位是 **候选**（D-040 §二 ⑥） |
| [§5.3 六项可选声明](../../design.md#六项可选声明)、[其中两项是设置项](../../design.md#其中两项声明的是设置项)、[不在定义里的三样](../../design.md#不在定义里的三样) | `td#S-9`～`#S-12`、`#S-29`；`sp#S-32` | 已确认 |
| [§5.4 返回值](../../design.md#54-返回值两种写法一种模型)、[两种写法只剩一种](../../design.md#两种写法到-agent-loop-那里只剩一种) | `td#S-20`、`#S-21`、`#S-23`；`ter#S-41` | 已确认 |
| [§5.4 每一次执行都留一份账](../../design.md#每一次执行都留一份账) | `ter#S-13`；`ca#S-10`、`#S-11`、`#S-21` | 已确认 |
| [§5.5 六种收场](../../design.md#55-一次工具执行的收场有六种)、[转后台是前台那一次的收场](../../design.md#转后台是前台那一次调用的收场后台执行另有自己的收场)、[非常态边界](../../design.md#这张表同时划出了这一层的非常态边界) | `ter#S-9`、`#S-19`、`#S-27`、`#S-47`；`cb#S-15`、`#S-17`；`msg#S-11`、`#S-19` | 已确认 |
| [§5.5 参数说完却解析不了](../../design.md#参数说完了却解析不了的调用不执行以失败回给-agent) | `sa#S-10`、`#S-11`；`cb#S-12`；`ter#S-11`、`#S-23`；`msg#S-31`（covers 未登 S-31） | **候选**（S1-e） |
| [§4 等待态](../../design.md#等待态)、[§6.6](../../design.md#66-前台后台-与-等待态是两个维度) | `ter#S-8`、`#S-12`、`#S-27`、`#S-44`；`td#S-10`、`#S-12` | 已确认；「本版只在前台等」是产品负责人原话（D-038 Q15） |
| [§6.6 前台上限与并发上限](../../design.md#前台上限与并发上限) | `ter#S-43`、`#S-44`；`td#S-13`；`cb#S-18` | **候选**（B-M08）；「不数等待态时间」PM 推导待确认；「并发上限按会话计」PM 推导待确认（账本 ⚑3） |
| [§6.7 中断不是失败](../../design.md#67-用户可以中断而中断不是失败)、[占位消息说清原因](../../design.md#占位消息一律要说清原因) | `ter#S-10`、`#S-18`、`#S-20`、`#S-25`；`cb#S-18`；`msg#S-11`、`#S-19` | 原因「运行被取消」「发起时就在后台」「被 agent 停掉」是**候选**（B-M01/M07、S1-c、S1-d）；其余已确认 |
| [§4 发帧](../../design.md#发帧)、[帧由协议约定](../../design.md#帧长什么样由一份协议约定不由工具定义声明)、[工具的产出](../../design.md#工具的产出) | `ae#S-2`、`#S-8`、`#S-23`；`ter#S-39`、`#S-41`；`td#S-29`；`cb#S-11`、`#S-15`、`#S-21` | 已确认 |
| [§4 卸载](../../design.md#卸载)、[§6.10](../../design.md#610-结果太大时卸载而卸载是第三个维度)、[两条来路](../../design.md#两条来路产物不同) | `td#S-21`、`#S-23`；`ter#S-8`、`#S-36`、`#S-42`；`le#S-23`（卸载判定站在 `after_action{each}`） | 已确认；判断与执行卸载归 PF-012 |
| [§6.8 执行环境要求](../../design.md#68-工具怎么提执行环境的要求) | `td#S-11`、`#S-28`；`ter#S-11`、`#S-38` | 已确认；匹配语义是 `td` G-5 |
| [§6.9 agent 创建与修改工具、技能](../../design.md#69-agent-创建与修改工具技能本版只定三条) | **没有契约落点**，covers 没有登记 | 已确认；归属与授权归 PF-002 投影，「当场能用、不重建」归 PF-004／PF-012 |
| [§6.11 两端模态](../../design.md#611-工具两端各要什么模态)、[两端的差别](../../design.md#两端的差别在候选提供者不在规则) | `td#S-9`、`#S-19`；模态投影 S-19（PF-013 投影） | 已确认；依赖提供者读面是 `reg` G-6 |
| [§6.12 单独控制、停了不重来](../../design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)、[停机之后](../../design.md#停机之后它不重来)、[宿主是谁](../../design.md#它的宿主是谁决定了什么会带走它) | `ter#S-17`、`#S-20`、`#S-25`、`#S-27`、`#S-28`、`#S-29`、`#S-48`；`sa#S-22`、`#S-29`；`msg#S-14`、`#S-19`；`br#S-19` | 已确认（2026-09-17、2026-09-23 三次拍板） |
| [§6.13 MCP 接入点带来的动作](../../design.md#613-mcp-接入点带来的动作)、[连不上即不可用](../../design.md#接入点连不上它的动作就是不可用) | `reg#S-7`、`#S-11`、`#S-12`；`br#S-7`、`#S-10`、`#S-12`、`#S-14`、`#S-16`、`#S-17`；`me#S-9`、`#S-11`、`#S-15`、`#S-16`；`td#S-2`、`#S-17`；`sp#S-13`、`#S-14` | 每个动作一个条目、连不上即不可用**已确认**；「每一次执行尝试前重取」是**候选**（B-M03/M06） |
| [flows §1.5～§1.7](../../flows.md#15-一次工具执行的生命周期)、[§二](../../flows.md#二异常分支)、[§3.2](../../flows.md#32-一次工具执行)、[§四](../../flows.md#四谁决定什么) | `ter#S-8`、`#S-13`、`#S-19`、`#S-20`、`#S-25`、`#S-27`、`#S-28`、`#S-29`、`#S-38`、`#S-39` | 已确认；flows §1.2「可用性变化不另发提醒」是**候选**（S22-d），落 `reg#S-30` |
| [flows §1.1～§1.4](../../flows.md#11-装配一个-agent从清单到三层) | `reg#S-22`（`fill`）、`#S-24`、`#S-25`；门的形状归 PF-007 | 已确认；covers **没有登记** |

**消费、不投影**（它们的契约尚未起草；本投影只列出被消费的点，缺口在第 7 节）：

| 相邻需求 | 本需求消费它的什么 | 在哪个缺口等它 |
| --- | --- | --- |
| [PF-012 agent loop 与运行](../../../PF-012-agent-loop-and-run/README.md)（rev 14） | 调 `submit`／`awaitForeground`／`reconcile`／`cancelForRun`（`ter#S-23`、`#S-24`、`#S-32`、`#S-28`）；留着一次尝试的可用性报告并原样交给派发器与执行宿主（`ter#S-46` 第 7 行、`run#S-32` 第 6 行）；给 `dispatch` 的叫停（`run#S-21` ⑥）；`after_action` 那一关由谁驱动（`ter` G-6）；整批被拒之后那些调用落什么（`ter` G-16）；`late` 的读面（`ter` G-18）；尝试栅栏与锚（`run` G-1、G-8）；拓展件时限（`run` G-7）；卸载的判断与执行（PF-006 §6.10） | cli C-8、C-16；`ter` G-6、G-16、G-18；`run` G-1、G-7、G-8、G-16 |
| [PF-008 人在环](../../../PF-008-human-in-the-loop/README.md)（rev 7） | 等待态出卡与答复（`ter#S-12`、`#S-30`）；放行判断出卡（`ta#S-15`）；卡片标识、关卡面、谁能答、答复形状（`ter` G-5、G-10；`ta` G-2～G-4；`run` G-17；`le` G-6）；恢复时把孤卡关成 `superseded`（`ter#S-20`，D-039 U-6） | cli「`ask` 记录 × 卡片」一行受阻；`ter` G-5、G-10 |

## 2. 涉及的领域对象

取自 [`domain_objects/objects.md`](../../../../domain_objects/objects.md) 与 [`pending.md`](../../../../domain_objects/pending.md)；带「未裁」的照原样列出。

| 对象 | 领域含义 | 生命周期 | 落点 |
| --- | --- | --- | --- |
| [工具执行](../../../../domain_objects/objects.md#ul-tool-execution--工具执行) | 一次执行，计算资源；宿主恒为会话 | 发起（超并发排队）→ 前台／后台 × 执行中／等待 → 完成 · 失败 · 被中断 · 等不到应答；前台那次调用另有「转后台」「不可用」两种收场 | 身份 `(租户, 会话, CallId)`（`ter#S-5`）；执行记录 `ExecutionRecord` 只由执行宿主写（`ter#S-6`）；活体不持久（`ter#S-7`） |
| [附件](../../../../domain_objects/objects.md#ul-attachment--附件) | 工具产出里不进对话、按地址取的那部分 | 执行跑完时存进声明的存储；留存与清理正文未述 | `cb#S-21` `AttachmentRef`；**未裁**：它存进的[存储](../../../../domain_objects/pending.md#存储)全系统没有定义，谁来裁：PF-006 owner（`cb` G-1、`td` G-13、cli C-6） |
| [被卸载的原始结果](../../../../domain_objects/objects.md#ul-offloaded-result--被卸载的原始结果) | 太大的结果存起来，消息里换占位 | 落成消息之前存起、之后分页取回；留多久正文未述 | `ter#S-36` `storeRaw`、`#S-42`；**未裁**：宿主、存储与保留期（`ter` G-7；PF-015 §9） |
| [资产](../../../../domain_objects/objects.md#ul-asset--资产)（工具、技能、MCP、斜杠命令） | 能力标识下的生效资产 | 见 PF-002 投影 | 定义形状 `td`、`sp`、`sc`、`me`；持有与求值**不在本投影** |
| [meta 能力](../../../../domain_objects/objects.md#ul-meta-capability--meta-能力) | 恒定占槽位的十三扇门 | 装配 → 在位 | 注册表对 meta 门恒给执行权限「自动」（`reg#S-24` 第 5 步，D-040 M21）；**未裁**：它与「工具」是什么关系，归 PF-007 与 PF-006；meta 门清单没有契约（`reg` G-7） |
| [会话](../../../../domain_objects/objects.md#ul-session--会话) | 工具执行的宿主与收件人 | 见 PF-015 | 归档使未收场执行落 `interrupted{session_archived}`（`ter#S-29`） |
| [运行](../../../../domain_objects/objects.md#ul-run--运行)、[agent runtime](../../../../domain_objects/objects.md#ul-agent-runtime--agent-runtime) | 发起执行的那一次运行与那副协程 | 见 PF-012 | 执行记录记下 `run`、`attempt`，生命周期**不绑**（`ter#S-6`、`#S-8`）；前台 = 协程阻塞在它上面 |
| [装配清单](../../../../domain_objects/objects.md#ul-assembly-manifest--装配清单) | 为一个会话求值出的构成 | 只可追加 | 注册表换表的提交点是清单里的一条追加（`reg#S-18`、`#S-22`）；**没有契约**（`reg` G-1、cli C-2） |
| [决策卡片](../../../../domain_objects/objects.md#ul-decision-card--决策卡片) | 等待态或放行判断要人点头时出的卡 | 见 PF-008 | 消费、不投影 |
| [会话日志](../../../../domain_objects/objects.md#ul-session-log--会话日志)、[消息](../../../../domain_objects/objects.md#ul-message--消息)、[内容块](../../../../domain_objects/objects.md#ul-content-block--内容块) | 结果、占位、提醒、帧落在哪 | 只追加 | 形状 `msg`、`cb`；日志提供者**不存在**（`ter` G-1、cli C-1） |
| 工具定义（[词条](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)，不另立对象） | 一个工具在数据与治理层面的表示 | 随资产版本 | `td` 全文；模型面前的条目是它的纯函数（`td#S-6`、`#S-7`） |
| 替换件（[词条](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-stand-in--替换件--stand-in)，呈现，不另立对象） | 不可用时占在原位的同形呈现 | 每次尝试开头随可用性算出 | `reg#S-8`、`#S-10`；可用性三值 `available`／`stand_in{for}`／`unavailable{reason}` |
| 可用性报告（技术名，无词条） | 一次执行尝试开头算出、整次尝试不变的那份值 | 随尝试；不落盘 | `reg#S-11`（带会话、`runId`、`attempt`，D-040 M46）；派发器与执行宿主收同一份（M33） |
| 出站项 `tool_execution_outbox`（技术名） | 执行记录与日志追加之间的发件箱 | 与执行记录同一写事务写入，追加后标已送达 | [执行宿主节点](../../../../realization/packages/tools/tool-execution-runtime/design.md) R-T1、L-1；D-040 M44、M70 |

## 3. 不变量与性质

编号是本投影的；「检查」一列只写已存在或已登记的证据，**标「场景」的全部未开始**。

### 3.1 不变量

| 编号 | 内容 | 谁维护 | 检查 |
| --- | --- | --- | --- |
| INV-1 | 三层正交：可用性变化不改动作空间的条目集合与次序；替换件同形，只换说明（`reg#S-8`、`#S-10`；`td#S-6`） | 注册表 | 场景 `reg#S-36`～`#S-47` |
| INV-2 | 可用性只由依赖解析算出：没有第三态、没有写入口（`reg#S-8`） | 注册表 | 同上 |
| INV-3 | 一次执行尝试之内条目集合、可用性、MCP 动作集、接入点持有、全部工具执行权限不变（`reg#S-11`，D-040 M35、L13）。**前提**：调用方只用尝试开头那一份报告，读一律带 `within = run{report}` | 注册表 ＋ 调用方（PF-012） | 场景；受阻于 cli C-8（验收装配由 loop 驱动替身） |
| INV-4 | 模型面前恒为一个条目；多命令工具在模型面前只有 `{command, args}`，`command` 是命令名枚举，不展开任何命令的参数（`td#S-6`、`#S-7`） | `core/tool-definition` | 包内测试 V-1（未开始） |
| INV-5 | 一次执行的收场写下后不变；前台那次调用的收场同样（`ter#S-16`、`#S-9`） | 执行宿主 | TLC `OutcomeStable`（绑定）；`CallOutcomeStable` 未绑 |
| INV-6 | 姿态单向 前台→后台；阶段 `queued → running ⇄ waiting → ended`，`ended` 之后不变（`ter#S-8`） | 执行宿主 | 按构造（不作证据） |
| INV-7 | 一次执行恰一份账、只在收场时落（`ter#S-13`；`ca#S-19`） | 执行宿主 | TLC `OneAccountPerEnded`（绑定） |
| INV-8 | 在服务中每条未收场的执行记录都有活体；「找不到」只在恢复扫描完成之后可信（`ter#S-7`、`#S-20`） | 执行宿主 | TLC `ServingConsistent`（绑定） |
| INV-9 | 到达装配的块次序 = 开块次序；分次到达与一次性到达结果相等（`sa#S-6`、`#S-27`） | `core/stream-assembly` | TLC `BlockOrderIsOpenOrder`、`SplitInvariance`、`OneShotAccepted`（绑定） |
| INV-10 | 每件拓展件每次经过恰一条最终结论；效果只是已落结论的函数（`run` P-1、P-2）。**前提**：锚能从日志推出（`run` G-1）、尝试栅栏兑现 | 派发器 ＋ 会话日志（缺） | 场景（未开始） |
| INV-11 | MCP 连接不跨（租户、接入点、持有格、连接目标、凭据引用）五元组复用；副本整份替换、`fetchedAt` 单调（`br#S-6`、`#S-7`） | 桥 | 场景 `br#S-32`～`#S-38` |

### 3.2 安全性质（绝不能发生）

| 编号 | 内容 | 谁维护 | 检查 |
| --- | --- | --- | --- |
| SAF-1 | 依赖不满足就不装、条目消失；MCP 接入点连不上时它的动作从动作空间消失（`reg#S-10`、`#S-12`） | 注册表 | 场景 |
| SAF-2 | 读不到被当作可用、有权、「没有」或空表（`reg#S-19`、`#S-25`、`#S-26`） | 注册表 | 场景 |
| SAF-3 | 同一次执行起两次执行者，或停机后重来（`ter#S-17`、`#S-20`） | 执行宿主 | TLC `AtMostOneStart`（绑定） |
| SAF-4 | 两条工具消息、两条收场提醒；收场了而消息既不在日志也没有耐久地等着追加（`ter#S-19`） | 执行宿主 ＋ 会话日志（缺） | TLC `AtMostOneToolMessage`、`EndedIsLanded`（绑定）；`AtMostOneReminder` 未绑 |
| SAF-5 | 被中断的执行落成别的收场；停止先于收场落定（`ter#S-18`） | 执行宿主 | TLC `InterruptHonored`（绑定） |
| SAF-6 | 迟到的答复解除了另一次等待（`ter#S-30` 的 `waitIndex`） | 执行宿主 | TLC `NoStaleAnswer`（绑定） |
| SAF-7 | 归档之后还有新的送达；归档后仍有未收场执行（`ter#S-29`） | 执行宿主 | TLC `NoNewDeliveryAfterArchive`（绑定）；`ArchiveSettlesAll` 按构造，证据是场景 `ter#S-56` |
| SAF-8 | 没放行的调用被执行；执行的参数不是被判的那一份（`ter#S-23` 第 5 步；`ta#S-26`、`#S-30`）。**前提**：执行宿主提交前必核对凭据 | 执行宿主 ＋ 放行判断 | 场景 `ter#S-60`、`#S-61`；「凭据不符」一支要一个会答 `invalid` 的核对面，本批做不了 |
| SAF-9 | 放行判断不在、报错或没给结论时有调用被执行（`ta#S-29`；`run#S-17`） | 派发器（全拒件） | 场景 |
| SAF-10 | 不允许后台的工具被自动、手动或因插队转到后台；任何一层把它配成能后台（`td#S-12`；`ter#S-27`、`#S-31`、`#S-44`） | `core/tool-definition` ＋ 执行宿主 | 守卫 ＋ 场景 `ter#S-58` |
| SAF-11 | 执行环境要求满足不了时降级给一个不满足的环境、或退回宿主机（`ter#S-38` 第 2 步；`hi#S-18`） | 执行宿主、兼容层 | 场景；执行环境无契约（cli C-7） |
| SAF-12 | 参数判不了却退成全放行（`td#S-4`、`#S-5`；`ter#S-23`：`failed{schema_unsupported}`） | 判定对象 ＋ 执行宿主 | 包内测试 ＋ 场景 `ter#S-64` |
| SAF-13 | 系统替工具作者写摘要；原始结果进日志（`td#S-23`；`ter#S-36`） | 执行宿主 | 场景 |
| SAF-14 | 帧发不出去使执行失败；系统先查定义再决定解析不解析帧（`td#S-29`；`ter#S-39`） | 执行宿主 | 场景 `ter#S-66` |
| SAF-15 | 账进 agent 的上下文（`ca#S-21`） | 执行宿主 ＋ 消息组装 | 场景 `ca#S-34` |
| SAF-16 | 凭据、令牌、引用进任何呈现；stdio 服务端拿到白名单外的环境变量（`br#S-13`、`#S-6`） | 桥 | 场景；cli 哨兵义务 |
| SAF-17 | 已发出的 MCP 调用被重放或迁移；重启后复用孤儿进程（`br#S-19`、`#S-27`、`#S-28`） | 桥 | 场景；cli SIGKILL 演练 |
| SAF-18 | 解析不了的调用没有任何东西回给 agent；半截调用被给模型看（`cb#S-12`、`#S-13`；`msg#S-31`；`ter#S-23`） | 到达装配 ＋ 执行宿主 | 场景 `sa#S-32`、`ter#S-64` |
| SAF-19 | 用控制类 Cordis 事件做放行、否决或中断；异步控制用 `bail`（`run#S-10`、`#S-31`；`ter#S-45`） | 派发器、执行宿主、装配 | 结构检查（未开始） |
| SAF-20 | 来源产品的「允许」成为放行；兼容件卡上的「允许」产生授权（`hi` P-3、P-4） | 兼容层 | 场景 |

### 3.3 进展性质（全部有界、前提写明——表 A 的「有前提地能」逐条）

| 编号 | 内容 | 前提 | 前提失效时的责任方 | 检查 |
| --- | --- | --- | --- | --- |
| LIV-1 | 停机后找不到活体的未收场执行终会落 `failed{abnormal_interruption}`（`ter#S-20`） | 执行宿主终会重新起来并扫完 | 装配（cli） | TLC 进展任务 `LostSettles`（**不绑**：公平前提与结论一一对应） |
| LIV-2 | 交付了的消息终会进日志（`ter#S-19`） | 日志追加终会成功 | 会话日志提供者（**不存在**，`ter` G-1、cli C-1） | 同上 `HandoffLands` |
| LIV-3 | 发出停止的执行者终会实际停下（`ter#S-18`） | 宽限 `execution_stop_grace` 之后的强制停止在那个执行环境里确实生效 | 执行环境（PF-005，无契约；X-5 未核） | 同上 `StopsTakeEffect` |
| LIV-4 | 前台那一次调用终会落定（`ter#S-24`） | 执行者终会交回，或到点、被中断、停机之一发生——**本能力不保证执行者终止**，没有前台上限的工具可以一直跑 | 工具作者、持有它的各层（前台上限设置） | 不在模型里 |
| LIV-5 | 在等的执行终会被解除（`ter#S-12`） | 有到点或有人答复；「人终将作答」不是系统保证（PF-008 §6.1） | PF-008 | 不在模型里 |
| LIV-6 | 依赖恢复、MCP 增删动作、凭据或执行权限改值，都在**下一次执行尝试开始**时被反映（`reg` 第六节；`br` P-9、P-11） | 有新的尝试；接入点连得上；据点读到新配值 | agent loop（C-8）；据点副本（C-3） | 场景 |
| LIV-7 | 技能收回在下一次运行开始时生效；斜杠命令收回在据点读到新值后的下一次读（`reg` 第六节，R2-13） | 离线时推迟（PF-016 §6.17 已接受的代价） | 入口组合 v2（C-4） | 场景 |
| LIV-8 | 经过走完或停在第一条终止结论，上界 链长 × 1 次求值（`run` P-15） | 每件都交回——**本版拓展件没有时限**（`run` G-7） | PF-012 | 场景 |
| LIV-9 | 卡片答完后，下一次尝试交回最终结论（`run` P-18；`ta` 进展第 2 条；`hi` P-12） | 那一件交回、日志可读、调用方交回 `answer` | PF-008、PF-012 | 场景 |
| LIV-10 | MCP 凭据续期不要人（`br` P-10） | 授权服务器可达；明确拒绝即失效 | 外部 | 场景 |
| LIV-11 | 中断必补一条提醒（`msg` P-7） | 写提醒的一方中断后仍有连续性；它也没了时由下一次尝试的对账接手 | 到达装配 ＋ loop | 场景 `msg#S-48` |

**不承诺进展的**：`td`、`me`、`sp`、`sc`、`le`、`cb`、`ca`、`ae`、`sa` 都声明不拥有任何进展性质；「一条流终有结局」要求生产者存活，或宿主按 `sa#S-28` 第 6 条替它放弃；补账可能永远不来，这是合法终态（`ca` 第八节）。

## 4. 业务规则（开发者不该自己决定的，这里都有）

**全局口径**：缺席一律是拒绝或明确失败，「判不出来」与「判为拒绝」是两个值（`ter#S-15`；`ta#S-17`；`run#S-16`）；表示层校验先于一切判定、不算一次判定；**身份参数没有默认值**——`ter` 的 `tenant`／`session`、`run` 的 `manifest`／`run`／`attempt`／`admission`、`ta#S-25` 的 `session`、`ter#S-30` 的 `waitIndex`、`ter#S-28` 的 `level` 缺席一律 `invalidInput`，**不取「当前的」**。

### 4.1 工具定义：形状与表示层判定（`td`）

- 定义是数据：没有操作、没有提交点、没有插件（`td` 第一节）。模型面前的条目是纯函数：`modelName` 把每个 `:` 换成 `__`（`td#S-6`，D-040 TD-2）；多命令工具的 `input` 恰为 `type`、`properties{command, args}`、`required=["command"]`、`additionalProperties=false`，`command` 的 `enum` 按码点升序，命令表每行「`n` — 说明」、U+000A 分隔、末行不带换行；`args` 只有 `type` 与 `description`（`td#S-7`）。
- **缺席怎么读**（`td` 第九节）：`name`、`description`、`paradigm`、`permissions`、`origin`、`input`、`commands` 缺席 ⇒ 拒；`needs` 缺席 ⇒ 不需要；`allowBackground` 缺席 ⇒ **不许后台**；某项 `settings` 缺席 ⇒ 没有这一项限制；执行权限默认值缺席 ⇒ 拒，**不补任何一档**（`td#S-15`）。
- **定义的判定次序**（`td#S-26`，报表中最靠前的一行胜）：`malformed`(M1/M2) → `paradigm_unknown` → `commands_forbidden` → `commands_missing` → `input_not_schema` → `parameter_description_missing` → `binding_layer_unknown` → `setting_category_unknown` → `permission_unknown` → `tool_origin_unknown` → `name_reserved_sequence` → `malformed`(其余) → `schema_unsupported`（**永远最后**，依赖实现登记的上限）。第 2、3 条同时违反报 `parameter_description_missing`（`td#S-4`）。
- **返回值的判定次序**（`td#S-26`）：`malformed`(M16) → content-blocks 自己的拒绝值 → `result_call_in_content` → `malformed`(M17～M23)。普通函数返回在接收处转成 `ToolResult`，只转一次（`td#S-20`；`ter#S-41`）。
- **参数判定**（`td#S-4`、`#S-5`；D-040 M37、M56）：顶层没写 `additionalProperties` 按 `false` 读；`format` 只作注解；`pattern` 先不带 `u`、再带 `u` 试编；schema 编不出、超上限或判定超时 ⇒ `failed{schema_unsupported}`，**不退成全放行**；判得了而不合 ⇒ `failed{arguments_invalid}`（带用法）。判定本身在执行宿主里做（`ter#S-23` ④）。
- **MCP 来源的定义**恒单函数、不组合、不是资产（`td#S-17`）；它是 `schema_unsupported` 唯一可以以同形替换件出现、而不是被拒的口子（`td#S-27`）。

### 4.2 可用性、替换件与注册表（`reg`）

- 七个操作都不发事件（`reg#S-29`）；可用性变化**不另发提醒**（`reg#S-30`，S22-d）。失败值全集：`invalidInput`（含 `{evaluationSuperseded}`）、`sessionNotFound`、`categoryNotRegistered`、`dependencyUnresolved{missing}`、`toolNameConflict`、`compositionCycle{cycle}`、`categoryUnsupported{category}`、`unavailable`（`reg#S-21`）。
- **`refreshAvailability(run, attempt)`**（`reg#S-24`，agent loop 在每次尝试开头、读常驻条目之前调）：`run` 取 `start{runId}` 或 `continue{runId, report}`，与 `attempt` 都必填。六步：① 第一次求值（持有与配值取**此刻**，D-040 L8）；② 技能门控——`start` 现判、`continue` 原样带上（R2-13）；③ 可用性：先工具后技能；④ 每个 MCP 接入点取生效持有、写进 `endpointHoldings`、调桥；⑤ 第二次求值取每条工具条目的执行权限，以 `ModelToolName` 为键，meta 门恒 `{auto}`；⑥ 斜杠命令可用性与名字冲突。判定次序 `invalidInput` → `sessionNotFound` → `compositionCycle` → `categoryUnsupported` → `toolNameConflict`；**第一次求值拿不到 ⇒ 整个 `unavailable`、桥不被调到**；第二次拿不到 ⇒ 报告照常交出、除 meta 门外执行权限项都是 `unavailable`。无副作用、不写清单。
- **依赖项怎么判**（`reg#S-8`）：每项有在场且自报可用的提供者 ⇒ 可用，缺一项 ⇒ `stand_in{for}`；**读不到按不满足判**；存储项与模态项在 `reg` G-6 闭合前**一律不满足**。
- **MCP 条目**（`reg#S-12`）：

  | 桥的结局 | 动作条目 | 接入点那一行 |
  | --- | --- | --- |
  | 成功 | 投影出的条目 `available`；桥标了只能替换件的是 `stand_in` | `available` |
  | 判定类失败，带旧副本 | 全部 `stand_in`（「接入点连不上」） | `unavailable` |
  | 判定类失败，`not_fetched` | 无 | `unavailable`，「从未取得」 |
  | 没有结论（`dependencyUnavailable`、`bridgeWithdrawn`、`invalidInput`） | 无 | `unavailable`，「读不到」 |
  | 没有生效持有 | 无（桥不被调） | `unavailable`；`endpointHoldings` 写「没有」 |

- **`lookup`／`list`**（`reg#S-25`、`#S-26`）：`within` 必填；`run{report}` 只在报告所依那份快照里找，reload 之后的新条目对仍在跑的尝试答「没有」（D-040 M35）；`tool` 表按 `ModelToolName` 原样查；查不到答「没有」（是结论），**现读不到 ⇒ `unavailable`**；`list` 里任一条读不到 ⇒ 整个 `unavailable`，不返回少了几条的列表。
- **`fill`**（`reg#S-22`）：六份快照与装配清单里的一条记录同一次提交，**追加成功即提交点**；判定次序 `invalidInput` → `sessionNotFound` → `dependencyUnresolved` → `toolNameConflict`；同一 `EvaluationRef` 再 `fill`：记录没落 ⇒ 照做；已落且六张正是它填的 ⇒ 原样返回；已被取代 ⇒ `invalidInput{evaluationSuperseded}`（M34）。
- **`reload`**（`reg#S-23`）：恰六条命令 `omne-official:reload-<类别>`；用此刻的求值；`plugin` 连带旧、新成员所属各类；一条 reload 记录追加成功即提交点；每调一次重填一次、不去重；它不是完整的重新装配。
- **快照不持久**，装配清单是唯一权威（`reg#S-18`）；重启后按每类最后一条记录重建，正文取不回 ⇒ 那一类 `unavailable`（`reg#S-33`）。同一会话换表串行、多表一次成败（`reg#S-17`）。
- 运行中途被禁用或移除的工具，下一次尝试起对它的调用单独判 `deny{not_held}`、不牵连同批（D-040 L15；`ta#S-22` ⓪）。

### 4.3 放行判断的接口（`ta`，**本批无提供者**）

- **本批**：`ta` 没有 realization 节点、不进产品装配（D-040 PB-1）；派发器在 `before_action` 链末认一件放行判断，它不在即由全拒件顶上（`run#S-17`、`ta#S-29`、`#S-34`）——**产品据点里每一批动作都被全拒、运行继续，这是已知后果，不是缺陷**（cli 失败映射）。验收装配另装一件标明「非产品行为」的全放件（cli 验收装配）。
- `admit(batch)`（`ta#S-21`）：纯判定、不提交、不发事件；**原子的是结论集合**：每项恰一个结论，或整批一个失败。失败四个、首个命中（`ta#S-24`）：`invalidInput` → `modeUnknown` → `parentNarrower` → `unavailable`（只在第 ③ 步求值失败时）；四个都不是 `deny`。
- **每一项的判定次序**（`ta#S-22`，第一个给出结论的一步胜）：⓪ `not_in_composition` ⇒ `deny{not_held}`（终局、不出卡、答复翻不了）；① `forbid` ⇒ `deny{permission_forbidden}`（终局）；带 `answer` 时过了 ⓪① 就由答复定；② `auto` ⇒ `allow`；③ 求值：`allow`／`deny{authorization_denied}`／`undecidable` 进 ④；④ 看运行模式：`never` ⇒ `deny{run_mode_never}`、`auto_permission` ⇒ `ask{card}`、`bypass-permissions` ⇒ `allow`。
- `verifyToken(token, call, session)`（`ta#S-25`、`#S-26`）：只读、可重复；`valid` 的五个条件依次核：`callId` → 参数相等 → 日志里本件的最终结论是放行 → 结论前后生效参数一致 → 运行未落终态；日志读不到 ⇒ `unavailable`，不给 `valid` 也不给 `invalid`。

### 4.4 拓展点派发（`le`、`run`）

- **位置 11 个、结论 8 种**；`after_model_call{ending}` 与 `after_action{scope}` 的维度必带，缺席即 `dimension_missing`（`le#S-1`、`#S-2`、`#S-20`、`#S-21`）。卸载判定站在 `after_action{each}`，只用 `observed` 或 `rewrite`（`le#S-23`）。
- **缺席默认**：`onError` 缺席按求得的干预力取 `observe→ignore`、`rewrite→record`、`veto→treat_as_veto`（`le#S-5`）；`unavailability` 缺席即 `skip`（`le#S-6`）；`stop` 缺 `terminal` 即 `cancelled`（`le#S-26`）。
- **派发不用任何 Cordis 事件**：按装配清单次序逐件 `await` 直接调用，前一件结论落盘后才开始下一件；件与件不并行（`run#S-10`、`#S-31`）。**首胜**：第一条终止结论（`veto`、`stop`、`ask`、`retry`、按否决处置的不可用）胜，之后的件不求值、不留记录；`rewrite`／`select_model` 依次叠加、后写盖前写；`inject` 在交出效果之前按链序追加（`run#S-15`）。放行判断钉在 `before_action` 链末、模态转换钉在 `before_persist_message` 链末，由派发器强制（`run#S-6`）。
- **不可用处置**（`run#S-12`、`#S-17`）：租户件声明 `skip` 或未声明 ⇒ 跳过；声明 `veto` 且档为 `veto`、位置是「之前」⇒ `vetoed`；系统自带件一律由指定挂件顶上、记 `fallback`——放行判断顶上即**全拒、不出卡**，卸载判定顶上即**只记一笔**。
- **报错处置**（`run#S-13`）：

  | 有效策略 | 五个「之前」 | `attempt_started` 与四个 `after_*` | `after_terminal` |
  | --- | --- | --- | --- |
  | `ignore` | `observed` | `observed` | `observed` |
  | `record` | `inject`（「没跑成」提醒） | `inject` | `observed` |
  | `treat_as_veto` | `veto` | `stop{failed}` | `observed` |

- **结论判定次序**（`run#S-14`）：先表示层十个拒绝值（`le#S-37`），再五条能力判定；任一不过按报错处置；判定来源缺席 ⇒ `dispatch` 失败 `unavailable`、那一件不留记录。
- **`dispatch`**（`run#S-21`）：`admission{report, grants, runMode, parent?}` 恰在 `before_action` 上必带，报告核会话、`runId`、`attempt` 三者（M46）；`batch` 列全部 `CallId`，含解析不了的调用。**不是原子提交，每条结论单独提交**；对同一次经过幂等、再调即回放。失败：`invalidInput`、`positionUnknown`、`manifestMissing`、`replayInconsistent`、`unavailable`、`attemptSuperseded`、`cancelled`。运行被取消 ⇒ 在途那件收到停止信号、不留记录、以 `cancelled` 收场（`run#S-21` ⑥，M39；场景 `run#S-51`）；派发器实例被撤除 ⇒ 在途 `dispatch` 在下一检查点 `unavailable`、不落任何结论（D-040 M63）。
- **放行在一批里**（`run#S-29`）：一轮只调一次 `admit`；报告里查不到条目的调用记 `observed{no_such_entry}`、不进 `admit`；报告项 `unavailable` 或缺 `tenantAutoWritable` ⇒ 这一轮放行判断不可用、全拒件顶上；`admit` 整批失败 ⇒ 每项 `errored`、落 `veto`；**这一批还有动作在等人时，已放行的凭据全部扣住**。

### 4.5 一次工具执行（`ter`）

**提交一批 `submit(tenant, session, run, attempt, report, batch)`**（`ter#S-23`）。批项三种：`AdmittedCall{call, admission, environment, definition, startInBackground?}`、`UnparseableCall{call}`、`UnlistedCall{call}`。判定次序（首个不成立的决定**整批**结果）：

0. 表示层；`report` 缺席，或它的会话、运行、尝试任一不是本次 ⇒ `invalidInput`，排在一切之前（M33、M46）。
1. 在服务（扫描已完成、没在撤除），否则 `runtimeNotReady`／`runtimeStopped`。
2. 租户就是会话持有的那一个，否则 `crossTenant`；读不到持有租户 ⇒ `dependencyUnavailable{storage}`。
3. 判重：已有记录而调用块不同 ⇒ 整批 `callIdConflict`；相同的按幂等返回首次结果。
4. 只对新项：会话没归档、运行没取消，否则 `alreadyEnded`。
5. `AdmittedCall` 逐项 `verifyToken`；取最左的失败值 `invalidInput` > `notAdmitted` > `admissionUnavailable`，`why` 取批内最前的不符项。
6. 以 `call.tool` 原样在 `within = run{report}` 下查注册表：读不到 ⇒ 整批 `dependencyUnavailable{registry}`；`UnlistedCall` 却查得到 ⇒ 整批 `notAdmitted`。

**提交点**：整批一次提交，提交之前任何执行者都没起（`ter#S-23` ④）。**即刻收场**（首个成立的即是它的收场）：`UnparseableCall` ⇒ `failed{unparseable}`（不查注册表）；`UnlistedCall` 答「没有」⇒ `unavailable{no_such_entry}`；`AdmittedCall`：「没有」或判为不可用 ⇒ `unavailable` → 参数判不了 ⇒ `failed{schema_unsupported}`（带说明、不附用法），判得了而不合 ⇒ `failed{arguments_invalid}`（带用法）→ `startInBackground` 而不许后台 ⇒ `failed{background_start_refused}`。发起即后台且允许 ⇒ 前台那次调用落 `backgrounded{backgrounded_at_start}`。返回每项一行 `{callId, disposition}`；幂等边界 `(租户, 会话, CallId)`。**整批被拒之后本能力不替这些调用落结果**（`ter` G-16）。

**起执行者**（`ter#S-38`，按次序）：轮到它 → 执行环境到位，否则 `failed{environment_unavailable}`、**不降级** → 找得到执行者并起得来（MCP 调桥的 `invoke`），否则 `failed{start_failed}` → `running`。**意图先于外部效果**：先落记录、再起执行者、至多起一次（`ter#S-17`）。

**次序与并发**（`ter#S-43`）：批内依次——下一项等前一项前台那次落定（含转后台）；同会话、同工具在 `running`＋`waiting` 的执行数不超过 `concurrency`，超出的按提交先后排队、**不拒绝**。
**时限**（`ter#S-44`）：阈值与前台上限只计前台 `running` 的时间，等待期间不走；阈值到点 ⇒ `backgrounded_auto`；前台上限到点：允许后台 ⇒ `backgrounded_auto`，否则 ⇒ `interrupted{foreground_timeout}`；两者同时到点，阈值那一路先。设置缺席 ⇒ 没有这一项限制（`td#S-13`）。

**收场与首胜**：以「记录还没有收场」为条件的同一行条件写，看记录不看活体；收场之后到达的交回一律丢弃，外部效果记「不可确定」并留一条记录条目（`ter#S-16`）。**收口次序是义务**：收场落定 → 发停止 → 宽限 → 强制 → 回收 → 释放并发位置；收口任一步出错只记下、不改收场（`ter#S-18`）。逻辑停止、实际停止（`stopping`／`stopped`／`unconfirmed`）、外部效果确定性三件事分开记（`ter#S-14`）。

**单独控制它的操作**（全部单次提交、首胜；共同失败 `invalidInput`、`runtimeNotReady`、`runtimeStopped`、`dependencyUnavailable{storage}`；跨租户按 `executionNotFound` 处理，`ter#S-21`）：

| 操作 | 规则 | 收场与原因 | 另有的失败 |
| --- | --- | --- | --- |
| `interrupt(…, initiator)`（`ter#S-25`） | 先落收场＋账＋消息＋条目，再发停止 | `interrupted{user_interrupted}`；agent 只能停自己发起、已在后台的：`terminated_by_agent`（写在收场提醒里） | `executionNotFound`、`alreadyEnded`、`notInBackground`（agent 对前台）；重复中断得 `alreadyEnded` |
| `interruptBatch`（`ter#S-26`） | 一次提交，已收场的跳过；找不到任一条或 agent 碰到前台 ⇒ 整组不动 | 同上 | 同上 |
| `background`（`ter#S-27`） | 前台那次还没落定、允许后台、阶段 `queued`／`running`；单向 | `backgrounded{backgrounded_by_user}` ＋ 占位 | `alreadyEnded`、`backgroundNotAllowed`（不许或正在等待） |
| `cancelForRun(level)`（`ter#S-28`） | 只动前台未收场的；后台一条不动；`forced` 不等宽限；可从 graceful 升到 forced | `interrupted{run_cancelled}` | —— |
| `archiveSession`（`ter#S-29`） | 全部未收场执行，前台后台都算；不可逆 | `interrupted{session_archived}` | —— |
| `answerWait(…, waitIndex, answer)`（`ter#S-30`） | 必须恰在第 `waitIndex` 次等待上；与到点、中断竞争同一行，首胜；形状校验判得出不合 ⇒ `invalidInput`；**判不了 ⇒ 这次执行落 `failed{schema_unsupported}`**（M75） | 解除等待 | `executionNotFound`、`notWaiting`、`alreadyEnded` |
| `preempt`（`ter#S-31`，插队） | 允许后台且不在等 ⇒ 转后台；在等卡片 ⇒ 人拒绝回复；其余 ⇒ 中断；排队中的同样处置 | `backgrounded_by_preemption`／`human_declined`／`interrupted_by_preemption` | —— |

**恢复扫描**（`ter#S-20`）：扫完才对外服务（此前一律 `runtimeNotReady`）；范围是**全部**未收场记录，不论会话、姿态、有没有协程要恢复；先回收执行者资源，再首胜写 `failed{abnormal_interruption}`（外部效果「不可确定」、实际停止 `unconfirmed`、`frames = "unknown"`）；`queued` 的记录外部效果「已确定未发生」；同一次提交里交付追补消息（前台：占位原因「工具执行异常中断」；后台：`background_execution_interrupted` 提醒）；同一次处置请求把卡片关成 `superseded`；**没有任何例外，不重起**。`reconcile`（`ter#S-32`）只在扫描后可调，只追补找不到活体的记录。

**送达**（`ter#S-19`；`msg#S-12`）：执行宿主是唯一送达方，「送达」＝ 追加进会话日志成功；**落哪种消息只看有没有占位**——没有占位落 `ToolMessage`，有占位落 `background_execution_finished` 提醒；帧流交出的块非空时另有一条 `ToolInternalMessage`，排在结果消息之前；工具执行被中断不另补提醒；消息与记录不得只成一半，账随收场同成同败；归档后不再送达。记录条目：九类关键转换各一条，收场那条与收场同一次提交（`ter#S-22`）。

**执行者一侧原语**：等待（`ter#S-12`）写不进就不进入等待，本版只在前台（`notInForeground`）；发帧（`ter#S-39`）不阻塞、没有失败值，交回 `accepted` 或 `dropped{…}`；报账（`ter#S-40`）逐笔；交回（`ter#S-41`）缺席按 `result_rejected`，写不下去就上交（PF-011）、本任撤下。**落盘前那一关**（`ter#S-42`）：只有 `completed` 与执行者交回的 `failed` 经过 `after_action{each}`；那一关不可用时只记可见——`raw` 位置只落引用、摘要缺席；**本批这一关由谁驱动未定，一律按「不可用」落，是降级**（`ter` G-6）。

**失败种类闭合九个**（`ter#S-11`）：`unparseable`、`arguments_invalid`、`schema_unsupported`、`environment_unavailable`、`background_start_refused`、`start_failed`、`implementation_error`、`result_rejected`、`abnormal_interruption`。**占位与收场原因**闭合十二个，各落对应格（`cb#S-18`）。**操作失败值**闭合十四个（`ter#S-15`）。

**撤除**：存储写不下去就上交、本任撤下，此后一切返回 `runtimeStopped`、不补写（`ter#S-47`）；有序撤下：先 `abandon` 在途帧流（结局 `lost`）→ 首胜写 `failed{abnormal_interruption}`（`frames` 取 `abandon` 交出的计数）→ 发停止；**换代等于一次停机**（`ter#S-48`）。

### 4.6 MCP 接入点与桥（`me`、`br`）

- 按 `endpointHolding` 寻址，持有取自注册表的报告、**不是装配那一次的**（`br#S-5`，D-040 L8）；连接惰性建立；stdio 在据点机拉起，环境 = 白名单 ∪ 正文 env ∪ 凭据 env，不经 shell（`br#S-6`）。副本键为（租户、接入点、持有格），初值 `not_fetched`，只由一次完整列举条件写入，`fetchedAt` 取列举**开始**的时刻（`br#S-7`，K34）。失败值闭合十一个（`br#S-15`）。
- `refreshActions`（`br#S-16`）：外部效果先于提交；完整列举成功后一次条件写即提交点；`connectTimeout`、`maxListPages` 封顶；中间四种失败随值交出现存副本；每次真列举、不去重。
- `projectActions`（`br#S-17`，纯函数）：条目名 `接入点名:动作名`，`paradigm: single`，不带 help、needs、settings、`allowBackground`；**对端缺说明 ⇒ 补占位「对端未提供说明」并标 `normalized`、不当它不可用**；最小规范化只三样；「只能以替换件出现」恰两种原因 `taskSupport = required`、`schema_unsupported`，同时成立报 `schema_unsupported`（N-24）；`excluded` 恰两种 `name_unformable`、`input_rejected`。
- `invoke`（`br#S-19`）：前置已放行；**没有提交点、不幂等、不重放**；失败九种各写明请求是否已发出；超时发取消通知；被中断什么都不交回；进度通知转成帧。结果映射：成功 ⇒ `completed`，`isError` ⇒ `failed`，`bridgeWithdrawn` ⇒ `failed{abnormal_interruption}`；**桥不产出 `unavailable`**（`br#S-20`、`#S-21`）。
- 凭据：不进任何呈现（`br#S-13`）；解引用失败**不改成不带凭据去连**（`br#S-11`）；OAuth 只由配值入口发起，非 `streamable_http` 或非租户格 ⇒ `oauthNotApplicable`，同一持有至多一个 `pending`，跟机器（`br#S-8`、`#S-22`～`#S-24`）。
- 收口次序：关传输 → 终止进程组 → 排空 stderr（`br#S-26`）；桥换代：先对在途调用交 `bridgeWithdrawn` 再收口，不迁移（`br#S-27`）；重启不重发、孤儿进程不复用（`br#S-28`）。
- 接入点定义的判定次序（`me#S-20` 所在的表示层表）：`malformed`(M1/M2) → `transport_unknown` → `command_empty` → `url_invalid` → `snapshot_missing_time` → `name_not_projectable` → `name_reserved_sequence` → `malformed`(其余)；逐动作执行权限以对端名为键（`me#S-14`、`#S-16`）。

### 4.7 技能与斜杠命令（只取动作空间一侧）

- 技能正文逐字，`Skills().read` 与常驻呈现两条路是同一段文字；读不等于执行；只有 `scripts/` 下的可运行（`sp#S-8`～`#S-11`）。技能依赖只由三处组成，用能力标识指工具（`sp#S-13`、`#S-14`、`#S-16`）；带脚本的技能声明执行环境要求，是定义记录的固定声明成员、不是设置项（`sp#S-32`，D-040 L3′）。
- 斜杠命令只按会话斜杠命令集认名字，无权与不存在的回答逐成员相同（`sc#S-16`）；解析失败什么都不发（`sc#S-24`）；③ 型不进队列（`sc#S-23`）；交付面预判与受理面再判各 import 一次、拿到同一命令集必得同一结果，以受理那一次为准（`sc#S-12`～`#S-16`；cli）。

### 4.8 hooks 兼容（`hi`）

- `importHostHooks(host, config)` 是纯函数，唯一失败 `invalidInput`；任一 matcher 不合法 ⇒ 整份导入失败；报告每项 `imported`／`degraded{note}`／`skipped{reason}`（`hi#S-11`）。方言钉 Claude Code `2.1.280`、Codex `5c5308fc`。
- 每条 `command` 类 handler 一件，`power` 等于事件的干预力上限，声明显式 `unavailability: skip`；工作区来源在租户层 `disabled=true`（`hi` 第二节）。输出按优先级译回：`continue:false` ⇒ `stop{cancelled}` → 阻断或退出码 2 ⇒ `veto` → `ask` → `defer` ⇒ 报错 → 改写 ⇒ `rewrite` → 上下文 ⇒ `inject` → `allow` 或空 ⇒ `observed`；`ask` 同时带改写时改写进卡片草稿 `proposedRewrite`（`hi` 第四节）。
- 起不来与报错的分界（`hi#S-19`）：程序不存在、执行环境落不了位、句柄解析不出 ⇒ 不可用（租户件缺省跳过）；非 0 非 2 退出、超时、坏输出 ⇒ 报错。归 PF-006 的非 loop 事件（`TaskCreated`、`Elicitation` 等）给 `skipped` 并写明理由。子进程请停未确认 ⇒ 按报错交回、不挂起（D-040 M64）。

### 4.9 工具调用怎样到达、结果长什么样（`ae`、`sa`、`cb`、`msg`、`ca`）

- **到达**：工具调用块开块时块头带 `callId` 与 `tool`（`ae#S-9`）；`append` 的填是参数原文的非空片段、原样不解析（`ae#S-11`）；工具调用块**封口不带块**（`ae#S-13`）；被截断、叫停、断了的块生产者不得替它封口。帧流是同一条 `ToolInternalMessage` 的到达增量，帧里媒体只许引用（`ae#S-23`）。
- **唯一的解析点是接受工具调用块 `close` 的那一下**（`sa#S-10`）：参数原文 = 全部填的归约；块开着时被改过内容 ⇒ 落半截；否则按 RFC 8259 严格解析一次，重复键算失败、数值无损（D-040 M36）；失败 ⇒ `complete:true`、`rawArguments`、`unparseable:true`——**只标记，不是失败值**（`sa#S-11`），「不执行、回一条 `failed`」归执行宿主（`ter#S-23`）。块开着期间接受过 `frame_too_long`、`quota_exhausted`、`rejected` 的砍 ⇒ 落半截（`sa#S-12`）。收尾时仍开着的调用块一律半截、**给人看与给模型看两位都是 false**（`cb#S-13`）。
- `accept` 全有或全无，被拒不改状态、不修补（`sa#S-19`、`#S-26`）；判定次序先表示层（按 `ae#S-28` 的次序）、再 `event_after_finish`、再按事件种类（`sa#S-25`）；同一事件接两次不幂等，去重归宿主与传输。`abandon` 等于接受一个 `finish{lost}` 再结算，也交出账；宿主有序撤下时在途流一律走它（`sa#S-22`，M12）。
- **结果形状**：`{callId, outcome, reason?, blocks, offloaded?}`，`outcome` 缺席是 `malformed`、从不当完成（`cb#S-15`）；结果里任何一层不得有工具调用块（`cb#S-16`）；`ToolMessage` 恰一块 `tool_result`（`msg#S-11`）；`ToolInternalMessage` 当且仅当交出的块非空、顶层块不给模型看（`msg#S-13`）；解析不了的调用块留在 `AssistantMessage` 里，日志里另有**恰一条**同 `callId` 的 `ToolMessage{outcome: failed}`（`msg#S-31`）。
- **账**：工具侧 `frames = {emitted, trims}`，缺账记全 `"unknown"`、不记零（`sa#S-13`、`#S-14`）；`ToolCallAccount` 由执行记录携带，`externalEffect` 判据只在 `ter#S-14`，`model_call` 那一笔是镜像，报账被拒的一笔不进 `items`，晚到的账标 `late`（`ca#S-10`、`#S-11`、`#S-20`、`#S-39`）；**`late` 本批算不出**（`ter` G-18，cli C-16）。

## 5. Cordis 建模

来源：cli 节点的[插件与 inject 边](../../../../realization/apps/cli/design.md#插件服务与-inject-边)与各 provider 节点；服务名、方法名、表名**一律候选**；Cordis 4.0.4（D-025）。**本需求的全部运行时都在据点**（D-039：工具运行时是 CLI 这个应用里的东西）；中心一侧的资产治理见 PF-002 投影。

### 5.1 插件与服务面

| 插件（节点） | provide | 必需 inject | 调用时取用（不 inject） | 独立成插件的理由／形态 |
| --- | --- | --- | --- | --- |
| `tool-execution-runtime`（[节点](../../../../realization/packages/tools/tool-execution-runtime/design.md)） | `toolExecution`：14 个契约方法 ＋ `registerExecutor(key, executor) → unregister`（不经服务状态闸，M71） | `storage`、`clock` | `assetRegistry.lookup`、`toolAdmission.verifyToken`、会话日志追加、`sessionTenancy`、`executionEnvironments`、`runAttemptFacts` | 生命周期独立（挂根上、与 agent runtime 是兄弟）；**一条 fiber、没有子 fiber**（M44）；config `executionStopGrace`、`deliveryRetryInterval` 缺一或非正即启动失败 |
| `mcp-bridge`（[节点](../../../../realization/packages/tools/mcp-bridge/design.md)） | `mcpBridge`：六个方法 | `storage`、`clock` | 凭据保管方 `credentialCustodian`（M69） | 有独立资源（连接、stdio 进程组、续期调度）；config 八项必填 |
| `mcp-bridge-executor`（同包） | —— | `mcpBridge`、`toolExecution` | —— | 零状态；把「MCP 来源」执行者登记给执行宿主；交出的包装**不依赖本插件存活**（M73） |
| `asset-registry`（[节点](../../../../realization/packages/tools/asset-registry/design.md)） | `assetRegistry`：七个方法 | `assemblyManifest`、`clock`（**不 inject `storage`**） | `evaluationInputs`、`mcpBridge`、`converterRegistry.lookupConverter` | 快照不持久、按（会话，类别）键控；求值与正文端口纯 import（`defaultBodyContracts`，M51） |
| `loop-extension-runner`（[节点](../../../../realization/packages/agent-loop/loop-extension-runner/design.md)） | `loopExtensionRunner`（`dispatch`、`replay`）、`loopExtensionImplementations`（登记面、句柄解析） | `sessionLog` | `assemblyManifest`、`modelRuntime`、`toolAdmission`（本批无提供者）、`dependencyPresence`、`sessionTenancy`、`executionEnvironments` | 派发跑在调用方（agent runtime）的协程上；它拥有的事实全在日志里（`run#S-8`） |
| `hooks-compat`（[节点](../../../../realization/packages/agent-loop/hooks-import/design.md)） | —— | `loopExtensionImplementations` | `executionEnvironments` | 向派发器登记外部命令执行器；导入是纯函数 `importHostHooks`；DSH `hook-protocol` 定向 fork（D-033） |
| 纯模块 `core/{tool-definition, loop-extension, skill-package, slash-command, mcp-endpoint, stream-assembly, content-blocks, messages, call-accounts, arrival-events}` | —— | —— | —— | 不是插件、不进装配清单、没有 effect 与事件；一契约一包（M41）。候选入口见各节点（如 `createParameterJudge()`、`judgeToolDefinition`、`start/accept/snapshot/closeOut/abandon`） |
| 放行判断 `ta` | —— | —— | —— | **本批无提供者、不立节点**（D-040 PB-1） |

### 5.2 依赖与重载

- **目标服务从不 inject 贡献者**：执行宿主不 inject 注册表、桥、会话日志、放行；贡献者（`mcp-bridge-executor`、`hooks-compat`、系统自带件的贡献插件）inject 目标服务并把登记包进自己的 `ctx.effect`（cli；basis `inject-has-no-optional-form`）。
- 换代时谁被重跑（cli [换代表](../../../../realization/apps/cli/design.md#提供者换代或缺席时谁被重跑)）：`toolExecution` 换代 ⇒ 只有执行者贡献插件重跑、桥本体不重跑；`mcpBridge` 换代 ⇒ 执行者贡献重跑，桥的在途按 `br#S-27`；`loopExtensionImplementations` 换代 ⇒ `hooks-compat` 等贡献者重跑，正在求值的那一件按报错记（`run#S-34`）；`storage`／`clock` 换代 ⇒ 几乎全部重跑，执行宿主按 `ter#S-48` 有序撤下。**本装配运行期不换代**，换任何提供者都走排空重启（cli 关键选择 2），所以这些只在排空重启时发生。
- `sessionLog` 缺席 ⇒ 派发器停在 `PENDING`；`assemblyManifest` 缺席 ⇒ 注册表 `PENDING`——**产品据点清单今天装不起来**，这是如实缺口，不用替身补（cli）。

### 5.3 effect 装卸配对

| 装载 | 撤除 |
| --- | --- |
| 执行宿主核心 effect：活体表、执行者表、调度、排空器；先 provide，恢复扫描完成前一律 `runtimeNotReady`；每个写事务开头取会话哨兵 `lockSentinel('tool-execution-runtime/session/<会话>')` | 关准入 → `abandon` 在途帧流并首胜写收场 → 发停止 → 清空执行者表；写不下的留给下一任恢复扫描。判定工作线程超时即终止并换新，换不起来 ⇒ `stopped` 并上交 |
| 桥本体宿主 effect：连接表、在途登记、续期调度器、孤儿回收；stdio 进程组 | 先给在途 `invoke` 交 `bridgeWithdrawn` → 关传输 → 终止进程组 → 排空 stderr（`br#S-26`、`#S-27`）；不迁移、不重发 |
| 执行者登记（贡献者自己的 `ctx.effect`） | 注销；在途执行照常跑完，只影响之后起执行者（`ter#S-37`） |
| 注册表 effect：会话缓存、换表队列、撤除标记 | 清缓存，在途操作跑完；按装配清单重建（`reg#S-33`） |
| 派发器：provide 由 effect 纳管；句柄表包进 `ctx.effect` | 先触发停止信号再清空；在途 `dispatch` 在下一检查点 `unavailable`、不落结论（M63） |
| `hooks-compat`：登记外部命令执行器 | 同一个撤除函数里先注销、再按进程组停子进程；停止未确认按报错交回（M64） |

**撤除次序由装配显式驱动，不依赖内核**：cli 在根撤除之前按 P-2 → 执行宿主 → 桥本体 → 派发器依次 `await` 各自撤除，最后才撤 `storage`、`clock`（cli 据点装载清单，D-040 M48、M71）。前提「`await` 一条 fiber 的撤除等到它的 async disposer 结算完」**是待补 probe 的假设**（cli C-11）。

### 5.4 事件（据点上没有一条控制类事件）

| 事件 | 发出者与派发 | 载荷 | 过滤 |
| --- | --- | --- | --- |
| `execution.delivered` | 执行宿主，`emit`、**不带 `thisArg`**，通知（`ter#S-45`） | `tenant`、`session`、`callId`、段、收场——只有标识与收场 | **不靠过滤器**，按「全进程可见」处理，监听者按载荷自筛；只在本进程内、不得跨进程广播（`ter#S-46` 第 11 行，M42）；监听者抛错由发送方包住（basis `emit-listener-throw-propagates`） |

放行、否决、重试、中断、叫停全走直接调用或日志里的结论（`run#S-31`；`ter#S-45`；`reg#S-29`；`hi#S-25`）；**不用 `bail`**（basis `async-control-not-bail`）。帧不走 Cordis 事件；MCP 对端的 `tools/list_changed` 只记一笔（`br#S-25`）。

### 5.5 装配草图（据点，`apps/cli`）

```text
boot()（据点根 Context；不用 isolate、不用 intercept）
├─ storage-sql → clock
├─ [sessionLog] [assemblyManifest] [evaluationInputs] [credentialCustodian] [附件字节存储]
│  [centerConnection] [sessionTenancy] [executionEnvironments] [runAttemptFacts] [dependencyPresence]
│        ── 方括号：承接者不存在；产品清单停在 PENDING，验收装配换成替身
├─ tool-execution-runtime        inject storage, clock           （挂根上，不在任何 agent runtime 之下）
├─ mcp-bridge                    inject storage, clock
├─ mcp-bridge-executor           inject mcpBridge, toolExecution
├─ loop-extension-runner         inject sessionLog
├─ （模态投影三件、P-5 重试件 —— PF-013 投影）
├─ hooks-compat                  inject loopExtensionImplementations
├─ asset-registry                inject assemblyManifest, clock
├─ （P-1r、P-2 —— PF-013 投影）
├─ [agent loop 与 agent runtime] → frontend 门面 → 本机 socket 开闸（最后）
├─ ctx.plugin() 返回后同步读 fiber.state：PENDING ⇒ 清单错误 ⇒ 逆序撤已装的 ⇒ 启动失败；FAILED 同样
└─ 运行期不换代：不配 loader／HMR，不调 fiber.update
dispose()：显式按 P-2 → 执行宿主 → 桥本体 → 派发器 await，再撤根（storage、clock 最后）
```

**据点存储**：一份 SQL（sqlite，D-026／D-027 持久性 `NORMAL`）＋ JSONL 会话日志（提供者不存在）。跨 owner「同一提交」的共同存储对象（cli [存储一节](../../../../realization/apps/cli/design.md#存储要求清单与跨-owner-的同一提交)）：执行记录 × 结果消息 ⇒ **出站项那一行**（与执行记录同一写事务）＋ 日志一侧 `(会话, CallId, 段)` 的唯一约束（L-b 持久判重，**进程内集合挡不住**）；OAuth 绑定 × 保管方凭据行 ⇒ 绑定行上 `state`、`credential_ref` 两列 ＋ 保管方凭据行对它的引用约束（**必须同一 `storage` 实例**）；换表 × 装配清单 ⇒ 清单会话头与（会话，序号）唯一约束。**`late` 那条没有共同存储对象**，有漏标窗口（N-29）。

## 6. 绑定与证据

证据 run：[`2026-09-25-formal-assets-runtimes`](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md)（HUB `1667ea4c`，8 个 formal task 全部退出 0、无反例）；[`2026-09-25-validity-stream-assembly`](../../../../record/evidence/2026-09-25-validity-stream-assembly/README.md)（三份变异配置按预期出反例，退出 12）；[`2026-09-25-node24-json-probe`](../../../../record/evidence/2026-09-25-node24-json-probe/README.md)（Node 24.18.0 上 `context.source` 与 `JSON.rawJSON` 可用，M49）。

| 契约条款 | 证据 | 前提 | 状态 |
| --- | --- | --- | --- |
| `ter#S-16`、`#S-19`、`#S-18`、`#S-7`、`#S-17`、`#S-20`、`#S-30`、`#S-29`、`#S-13`（九条） | `formal:tool-execution-runtime-v1-execution`：`OutcomeStable`、`EndedIsLanded`＋`AtMostOneToolMessage`、`InterruptHonored`、`ServingConsistent`、`AtMostOneStart`、`ServingConsistent`＋`AtMostOneStart`、`NoStaleAnswer`、`NoNewDeliveryAfterArchive`、`OneAccountPerEnded` | 固定规模（一个会话、两批四次调用、至多一次停机、`MaxWaits = 2`）；每个动作原子，即假设存储兑现 R-T1、R-T3；证模型不证代码 | 已绑（[节点 bindings](../../../../realization/packages/tools/tool-execution-runtime/bindings.yaml)）；741,344 个不同状态、深度 22。**共同弱点**：六个去保护配置与三份补充否定配置的原始输出**未入 `record/evidence/`**（只在主检出 `tmp/`），待下一次证据 run 入库（M54） |
| `ter` 进展（LIV-1～LIV-3） | `formal:tool-execution-runtime-v1-execution-progress` 退出 0 | 三条公平前提与三条结论一一对应、没有否定配置 | **不绑** |
| `sa#S-6`（P-1）、`#S-27`（P-7） | `formal:stream-assembly-v1-assembly`；有效性前提由 `2026-09-25-validity-stream-assembly` 给出 | `Indices={0,1}`、`Frags={a,b}`、`MaxEvents=6`；模型不含参数解析、被砍过的调用、表示层判定 | 已绑（[节点 bindings](../../../../realization/packages/core/stream-assembly/bindings.yaml)） |
| `cb#S-12`、`sa#S-10`、`msg` 无损 JSON（M36） | `2026-09-25-node24-json-probe` | 只证运行时能力可用；不证重复键、深嵌套、超长输入 | 前提已取证；**不是绑定** |
| 其余全部：`td`、`ta`、`reg`、`br`、`me`、`sp`、`sc`、`le`、`run`、`hi`、`cb`、`msg`、`ca`、`ae` 与 cli | —— | —— | **`bindings: []`**；各契约的规范场景、各节点 verification 义务**全部未开始**；cli 33 条义务全部未开始，八个 formal task 在装配给被违反时不会失败，**不引作装配证据** |

`msg` 的 `Readable.als` 是 Alloy 模型、不是 formal task，不作绑定。

## 7. 未决项与已回询项

**实施者在裁决前的一条通则**：缺口不填默认值；照契约写的「裁决前怎么办」办，没写的就让依赖它的那一支**明确失败或不可用**，不造过渡值。

### 7.1 契约缺口（按契约）

| 契约 | 开着的缺口 | 对实施的影响（裁决前怎么办） |
| --- | --- | --- |
| `td` | G-1 命令名等字符集长度；G-2 设施名集合（PF-005）；**G-5 目标环境匹配语义**（恰等还是至少）；**G-9 工具作者怎样以正常返回表达失败**；G-10 块 `id` 唯一范围；**G-11 卸载的组合方式**（产品面问 PF-006 owner）；G-12 strict 投影；**G-13 附件存储名 ↔ `AttachmentRef.storage`**（PF-006 owner）；G-14 自定义设置项；G-16 `schema_unsupported` 的上限（节点候选 U-1～U-8，判定时限 500 ms） | G-5 前消费者 CS-7 停住；G-9 前**不得把内容的样子读成失败** |
| `ta` | G-1 授权表达怎样求值；G-2 答复落成授权由谁写；G-3 按看卡人的资格隐藏第四档；G-4 答复记录形状；G-5 `runMode` 的家（PF-015）；G-6 `exec_script` 的执行权；G-8 生效参数的记录与读面；G-9 跨进程；G-12 父会话摘要；G-15 meta 门「不可收窄」怎样声明 | G-2 前三个「允许」对这一次照样成立；G-15 前由注册表对 meta 门恒给「自动」 |
| `ter` | **G-1 会话日志追加口**；G-4 执行环境（PF-005）；G-5 卡片（PF-008）；**G-6 `after_action` 由谁驱动**；G-7 `storeRaw` 的存储与保留期（PF-006 owner）；G-8 晚报费用的 `obtainedVia`；G-9 失败写法；G-10 答复形状；G-11 `startInBackground` 从哪来；G-12 会话标识与持有租户读面；G-15 `credentialScope`；**G-16 整批被拒之后落什么**；G-17 观察者订阅面；**G-18 `late` 的读面**；G-19 模型调用的响应与费用来路 | G-6 前落盘前那一关一律按不可用落（降级）；G-17 前不推给任何观察者；G-18、G-19 兑现不了、不给过渡值 |
| `reg` | G-1 装配清单追加面；G-3 通知丢失后再授予；**G-6 依赖提供者读面与尝试开始时的有效模型**；G-7 meta 门清单；G-9 会话事实读面；G-11 跨进程；G-12 MCP 命名撞名；**G-13 被排除的动作要不要告诉 agent**（PF-006）；G-14 ① 谁发起构成变小后的重装；G-15 技能门控跨崩溃保不住（PF-012）；**G-17 PF-004 rev 12 与 PF-002 §4 冲突**（产品负责人） | G-6 前存储项与模态项一律不满足；G-7 前不把任何条目当 meta 门 |
| `br` | G-4 附件存储；G-5 elicitation；G-6 SDK 与协议未取证；G-7 保管方的面；G-10 撞名；**G-11 从没连上过的接入点**（PF-006／PF-002）；G-12 具名参数值；G-15 被排除的动作是否告诉 agent；G-17 OAuth 跟机器的后果 | G-12 前产品清单缺值即启动失败 |
| `me`、`sp`、`sc` | `me` G-2 撞名、G-4 设置页看哪份动作集、G-7 rug pull、G-8 明文 http；`sp` G-6 资源摘要、G-7 未收的扩展、G-9 `Skills()` 两份执行环境怎样合并；`sc` G-7 业务流程登记处、G-8 ③ 型条目形状、G-9 附件 | —— |
| `le`、`run`、`hi` | `le` G-1、G-4、G-5、G-6、G-15、G-16、G-18；`run` G-1 锚、G-2 清单四样值、G-3 三个能力标识、G-5 提醒 id、G-6、**G-7 拓展件时限**、**G-8 loop 契约**、G-9、G-10、**G-14 `Runner.tla` 已触发未建**、G-16、G-17、G-19、G-20 句柄两样来路；`hi` G-1、G-2、G-5～G-10 | `run` G-17 前答复那一项收 `unavailable`；G-19 前只记 `observed`；G-20 前句柄一律解析失败 |
| `cb`、`msg`、`ca`、`ae` | `cb` **G-1 存储**（PF-006 owner）、G-4、**G-10 模型交回不合 `ModelToolName` 字符集的调用名怎样落**；`msg` G-1、G-2、G-5～G-7、G-11；`ca` G-3、G-4、**G-5「没记下」与「没花钱」分不开**（PF-006 owner、TER）、G-6～G-10、G-12；`ae` G-3、**G-4 节流参数与执行者**（TER 与 PF-006 owner）、G-5 | `cb` G-10 前不合法的块不得进日志，也不得悄悄改名或丢掉 |

### 7.2 节点与装配缺口

| 编号 | 什么没有 | 挡住什么 | owner 与闭合条件 |
| --- | --- | --- | --- |
| cli C-1 | 会话日志契约与提供者 | 派发器 `PENDING`；送达、`awaitForeground` 不返回（TER T-7）；出站项没有追加方 | 主线，下一程（M43） |
| cli C-2 | 装配清单契约（PF-004） | 注册表 `PENDING`；换表提交点无处落 | 同上 |
| cli C-3 | 据点上的中心事实副本读面 `evaluationInputs` | 注册表的求值输入 | 随入口组合 v2 起草 |
| cli C-4 | 入口组合 v2 与 `centerConnection` | 副本来源、凭据送达、hooks 导入落成资产的那次写 | 主线，下一程 |
| cli C-5 | 凭据保管方 `infra/secrets`（服务键 `credentialCustodian`） | MCP 凭据解引用与 OAuth | 节点写出要求 A-4 |
| cli C-6 | 附件字节存储 | `storeRaw`、帧里的媒体引用、MCP 内嵌二进制 | PF-006 与存储那一程 |
| cli C-7 | 执行环境（PF-005） | 起执行者第 2 步、兼容件子进程 | PF-005 那一程 |
| cli C-8 | agent loop 与 agent runtime | 调用方全不在；同一份报告交派发器与执行宿主（A-19）、叫停通道（A-20） | loop 那一程 |
| cli C-9 | 具名参数部署取值（`execution_stop_grace`、BR G-12 七项等） | 产品清单缺值即启动失败 | 各契约 G 的 owner |
| cli C-11 | 内核假设待补 probe：`await` fiber 撤除等 async disposer 结算完；不带 `thisArg` 的派发不过滤（H-7）等 | 显式撤除次序与排空演练的预期 | `packages/core/kernel-basis` |
| cli C-12 | 执行宿主落盘前那一关的驱动方、按（租户，会话）订阅的推送面、`late` 读面 | 门面拿不到工具帧推送，只能读日志 | 主线，下一程 |
| cli C-13 | 会话持有租户读面 `sessionTenancy` | 产品装配里 `submit` 恒为整批 `dependencyUnavailable{storage}`（TER T-8）；句柄解析不出租户 | 会话那一程（PF-015） |
| cli C-14 | 依赖在场判定面 `dependencyPresence` | 声明了 `needs` 的拓展件那一次 `unavailable` | 派发器契约 owner |
| cli C-16 | 尝试与运行的事实读面 `runAttemptFacts` | `late` 算不出 | 会话日志与 loop 那一程 |
| 放行判断 | `ta` 没有提供者 | 产品据点每一批全拒 | 子选择二（它的提供者设计） |
| TER T-4、T-11～T-16 | `late` 现读窗口；卸载判定这一件不建实现；上交条目落处；内核 probe（A-1、下游重跑、X-5）；执行者接口无契约；帧入口不节流；判定时限与 `pattern` 上限的值 | —— | [执行宿主节点](../../../../realization/packages/tools/tool-execution-runtime/design.md) |
| REG A-1～A-4、A-8 | 清单提供者、转发者、`filledAt`、未测量 | —— | [注册表节点](../../../../realization/packages/tools/asset-registry/design.md) |
| BR B-1～B-5、B-7、B-8 | SDK 取证（钉版开工前出决定，M73）、保管方、配值副本、A-1 等 | —— | [桥节点](../../../../realization/packages/tools/mcp-bridge/design.md) |
| RUN-N1、N2、N5、N6 | 会话日志、清单读面、依赖在场判定、静态检查规则 | —— | [派发器节点](../../../../realization/packages/agent-loop/loop-extension-runner/design.md) |
| HI-N1、N3、N4、N5 | 执行环境、DSH 许可、A/C 区分实验、谁调导入 | —— | [兼容层节点](../../../../realization/packages/agent-loop/hooks-import/design.md) |
| TD-1～TD-3；SA-2、SA-3；CB-1～CB-3；MSG-1、MSG-2；CA-1；AEV-1；SP-1；SLC-1 | 纯模块的对齐、铸号方、判定细节与候选依赖 | —— | 各 `core/*` 节点 |

C-10 已闭合（M40）；C-15 属于 `infra/clock`，不在本投影。

### 7.3 待产品负责人裁或确认（按账本编号只列，不裁）

| 项 | 内容 | 本投影照什么写 |
| --- | --- | --- |
| rev 18 主线裁定 | 占位原因三种、MCP 动作集每次尝试重取、前台上限与并发上限语义、解析不了的调用、不另发提醒（[decisions 第二节](../../decisions.md#rev-18-的主线裁定与推导2026-09-23待产品负责人确认)） | 照契约 |
| rev 19 推导 | 每个命令一行说明必填、只带命令清单仍成立 | 照契约 |
| 账本 ⚑3 | 并发上限按会话计 | `ter#S-43` |
| D-040 §二 ⑥ | MCP 缺说明补占位、标 `normalized`；参数缺说明同向 | `br#S-17` |
| 账本 ①（S25 第一轮） | 导入的 hook 不可用时取「跳过」 | `hi` 第二节 |
| 账本 ⑤、L15 | 被禁用或移除的斜杠命令是下一次运行就消失还是等 reload（`reg` G-17）；运行中途被禁用的工具下一次尝试起单独判拒 | `reg` 按 PF-002 写 |
| 账本 ⑦（M21） | meta 门执行权限恒为「自动」、不经各层收窄 | `reg#S-24` |
| 账本 ⑧（M5） | MCP 逐动作的第四档在写面落地前不摆出来 | `reg` 报告 `tenantAutoWritable` 恒为假 |
| 账本 ⑩（N-26） | 告知项：C-7／C-8 闭合前 CLI 收不了图与文件、导入的 hooks 一件都不生效 | 告知，不是裁决项 |
| pending「存储」 | 附件与被卸载结果存进的那个存储是什么 | 谁来裁：PF-006 owner |
| decisions §四 | 从没连上过的 MCP 接入点没有「上一次的清单」（`br` G-11） | 不造占位条目 |
| D-040 追认 | 本投影依据的 D-040 各条逐条追认；D-041 契约接受 | —— |

## 8. 实施顺序

**验收替身与真承接者分开写。**下表每一步的完成判据都是在**验收装配**上能跑的检查；真承接者（C-1～C-8、C-13、C-14、C-16、放行判断提供者）属于下一程，列在表后。各证据义务的编号以各节点 `verification.md` 为准。

| 步骤 | 做什么 | 依赖 | 完成判据 |
| --- | --- | --- | --- |
| I-0 | 前置：D-041 签、节点接受；按 source-check 补 C-11／TER T-13 的内核 probe；MCP SDK 钉版出决定（M73） | —— | catalog 翻 `accepted`、`frozen.json` 登记后出本投影 v2；probe 登 basis |
| I-1 | 纯模块：`core/{content-blocks, messages, call-accounts, arrival-events}`，再 `core/{tool-definition, loop-extension, skill-package, slash-command, mcp-endpoint}`，再 `core/stream-assembly` | I-0 | 各节点 V／SC 义务过；`td#S-26` 十三行判定次序逐行正反例、U-1～U-6 上限正反例；`sa` 一致性用例 V-2 与性质测试 V-3（随机切分合并）过；`sc#S-16` 同一用例集两侧逐条同一结果 |
| I-2 | 执行宿主 `tool-execution-runtime`（一条 fiber、出站项、会话哨兵、恢复扫描） | I-1；验收装配的 `sessionTenancy`、`executionEnvironments`、`runAttemptFacts`、会话日志、放行件替身 | 场景 `ter#S-52`～`#S-69` 与节点 K-1～K-10、N-1～N-17 在验收装配上过；九条绑定照旧成立；否定配置与探针的原始输出入 `record/evidence/`（M54） |
| I-3 | 桥 `mcp-bridge` 与 `mcp-bridge-executor` | I-2；保管方替身 | 场景 `br#S-32`～`#S-38`、节点 N-1～N-16；stdio 白名单哨兵、SIGKILL 孤儿回收两条 cli 演练 |
| I-4 | 注册表 `asset-registry` | I-1、I-3；装配清单与求值输入替身 | 场景 `reg#S-36`～`#S-47`、节点 N-1～N-9；「断依赖 → 下一次尝试替换件 → 恢复 → 真身，条目数与次序始终不变」（PF-006 验收判据「形状恒定」） |
| I-5 | 派发器与兼容层 `loop-extension-runner`、`hooks-compat` | I-1；会话日志替身 | 派发器场景 `run#S-36`～`#S-49`、`#S-51`、`#S-52`，三张处置表纯函数测试，M63 最小场景；兼容层 `hi#S-29`～`#S-36`、两张映射表逐行、超时停进程组 |
| I-6 | `apps/cli` 据点清单与验收装配（十个替身：放行件、会话日志、装配清单、中心事实副本与连接、会话持有租户、执行环境、尝试与运行的事实、凭据保管方、agent loop 驱动、脚本化传输） | I-2～I-5 | 结构检查：产品清单里没有任何替身、它们不在任何 `packages/*`；执行宿主父链上没有 agent runtime；只有一份 `storage`；没有 loader／HMR 与 `fiber.update`。演练：回收 agent runtime 执行照跑；排空重启三种在途收场；「结果已追加、出站项未标送达时杀进程，重启后恰一条」；工具链从放行件到真实 JSONL 日志跑通（D-035） |
| I-7 | 证据回填 | I-2～I-6 | 各节点 `bindings.yaml` 从 `[]` 回填 `test:` 绑定；cli「实际执行」表不再为空 |

**真承接者（下一程，本投影不排期）**：会话日志（C-1）→ 装配清单（C-2）→ 会话持有租户读面（C-13）→ agent loop（C-8，含 A-19 报告传递、A-20 叫停、`after_action` 驱动、`late` 读面 C-16）→ 执行环境（C-7）→ 凭据保管方（C-5）→ 附件存储（C-6）→ 入口组合 v2 与中心事实副本（C-4、C-3）→ 依赖在场判定（C-14）→ 放行判断提供者。**每一个立起来，对应替身即删**；替身行为不进任何 `bindings` 作证据（cli 验收装配）。完成判据：产品据点清单全部 fiber `ACTIVE`、本机 socket 开闸；cli 33 条义务中受阻的那几条转为可执行。
