# PF-013 模型档案、调用与切换 · 设计投影 v1

- 对应需求：[PF-013](../../README.md) 全部条款——档案记哪些事实、身份与同名按层覆盖、凭据挂在租户上、官方与自建同一份列表、撤回与恢复在册、切换与生效点、合法目标与展示列表、模态投影与转换件、三类事实与策略、首 token、重试与试尽、单独中断与停机对账、成因与状态码、脱敏、账。**不含**：上下文组装（PF-010）、计量口径与成本明细的读面、工具定义与工具执行（见 [PF-006 投影](../../../PF-006-tools-and-skills/projection/README.md)）、loop 的状态方程（PF-012，本程未设计）、交付面的呈现（PF-016）。
- 本版依据的需求修订：**PF-013 rev 12**（`README.md` front-matter `revision: 12`）；另引 PF-009 rev 8（回复与流断在半路）、PF-016 rev 6（§6.11 秘密不呈现、§6.20 每台机器只有自己那一把、§6.21 被转换过的消息的呈现）、PF-012 rev 14（拓展点、否决三路）、PF-001 rev 17、PF-004 rev 12、PF-015 rev 11。
- 状态：**`post-review`，候选，未接受，不是实施入口。**全部契约 `candidate`、未冻结（接受待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）；全部节点 `candidate`、没有源码（接受待 [D-042](../../../../record/decisions/assets-runtimes-node-acceptance/README.md)）。realization 节点已过五批 architecture-reviewer 独立评审并按 [D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M49～M75 处置（HUB `6babe6e1`）。[provenance.json](provenance.json) 里每个 `sha256` 都是 `null`：**本版每一节都可能漂移，据它实施之前逐项核来源坐标**。
- 未决 gap：契约缺口 22 项、节点缺口 24 项、待产品负责人裁或确认 8 项、来源问题 7 项（[第 7 节](#7-未决项与已回询项)）。**G-19 闭合之前，选中、合法目标、展示列表、有效模型与打开调用一律 `unavailable`**——不只挡规范场景，也挡验收装配里的模型链。

**读法**：第 1～4 节回答「必须为真的是什么」，来源是契约；第 5～6 节回答「用哪些原语兑现、有什么证据」，来源是节点；第 7～8 节回答「还在等什么、先做什么」。
条款坐标缩写（**全部 v1、candidate**）：
`mpf` = [`data.model-profile/v1`](../../../../spec/data/model-profile/v1/contract.md)，
`resp` = [`data.model-response/v1`](../../../../spec/data/model-response/v1/contract.md)，
`mpd` = [`capability.model-profile-directory/v1`](../../../../spec/capabilities/model-profile-directory/v1/contract.md)，
`mrr` = [`capability.model-request-runtime/v1`](../../../../spec/capabilities/model-request-runtime/v1/contract.md)，
`mp` = [`capability.modality-projection/v1`](../../../../spec/capabilities/modality-projection/v1/contract.md)，
`sa` = [`capability.stream-assembly/v1`](../../../../spec/capabilities/stream-assembly/v1/contract.md)（只取回复侧），
`ca` = [`data.call-accounts/v1`](../../../../spec/data/call-accounts/v1/contract.md)，
`msg` = [`data.messages/v1`](../../../../spec/data/messages/v1/contract.md)（只取回复消息与五种调用记录）。
只指路、不投影的：`le` = [`data.loop-extension/v1`](../../../../spec/data/loop-extension/v1/contract.md)（成因八值、`select_model`／`retry`、拓展点），`run` = [`capability.loop-extension-runner/v1`](../../../../spec/capabilities/loop-extension-runner/v1/contract.md)，`aev` = [`capability.asset-evaluation/v1`](../../../../spec/capabilities/asset-evaluation/v1/contract.md)，`ae` = [`data.arrival-events/v1`](../../../../spec/data/arrival-events/v1/contract.md)。
主线裁定一律引 [D-040](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md)（逐条追认留产品负责人）；拆分与领域名引 [D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md)。

## 1. 本版覆盖的需求条款及确认状态

**确认状态**：rev 4 由产品负责人 2026-09-23 接受（[decisions](../../decisions.md#2026-09-23--接受为正式)）；rev 5–12 已随产品批次合入 main，**全文待产品负责人通读确认**（[README 状态](../../README.md#状态)）。其中每一项产品取舍都有产品负责人的拍板原话（裁决 21–40），**落盘措辞与 PM／主线推导（P19–P47、rev 9 的主线裁定）待确认**；rev 9 带 ⚑ 的三条会改变用户看到的东西。下表「状态」一列据此写三种：**已确认**（rev 4 接受）、**裁决已确认**（有拍板原话、正文待通读）、**推导待确认**（主线或 PM 推导）。
覆盖关系登记在 [`covers.json`](../../../../registry/README.md#covers)：PF-013 一共 129 条，**全部 `reviewed: false`**（起草时按设计依据表登记，未经独立复核）。

| 需求 | 契约落点 | 状态 |
|---|---|---|
| [§4 模型档案](../../design.md#模型档案)、[§6.1](../../design.md#61-档案是一个对象那项设置的取值是对它的引用)（档案是对象、路由名不可改） | `mpf#S-1`～`#S-12`（身份、属性、何时定能不能改）、`#S-27` 快照、`#S-28` 建档内容 | 已确认；请求参数一项裁决已确认（裁决 32，rev 8） |
| [§4 档案的身份](../../design.md#档案的身份所在范围加路由名)（所在范围加路由名；同名运行时从下往上覆盖；设置记路由名） | `mpf#S-1`、`#S-3`、`#S-13`、`#S-14`；`mpd#S-6` 范围链、`#S-17` 末段「落点(T, r, A)」；`mrr#S-9`、`#S-10` 第 2′ 步 | 裁决已确认（35、38、39、40，rev 10／12）；先滤已撤回与范围不允许、缺凭据与模态不滤、锁锁的是名字：推导待确认（P41–P47；[D-040 §二 S-U24-5a～c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#二2026-09-24-用户在场期间主线随用户裁决所作的自定账本-二-原文标主线自定的行)） |
| [§4 在册／已撤回](../../design.md#在册--已撤回)、[§6.4](../../design.md#64-撤回不删行会话指向被撤回的档案时说已下架)（撤回不删行、可恢复在册、已下架说的是名字） | `mpf#S-10`；`mpd#S-15`、`#S-33`、`#S-18` 处置表；`mrr#S-12` 注记 `withdrawn` | 裁决已确认（37，rev 10）；「已下架只在同名都撤回时」推导待确认（P43） |
| [§4 官方档案／自建档案](../../design.md#官方档案--自建档案)、[§6.3](../../design.md#63-官方与自建在同一份列表里) | `mpf#S-4`；`mpd#S-8`、`#S-14`、`#S-18`（清单是官方档案唯一来源）；`mrr#S-12`（每个名字一条、主标来源、被盖住的列在下面） | 已确认；同名被盖住的照列并标注：推导待确认（P46）；「展示列表 = 合法目标 ∪ 选中」：推导待确认（rev 9 ⚑） |
| [§5.6](../../design.md#56-凭据挂在范围上不挂在档案上)、[§6.2](../../design.md#62-凭据挂在范围上档案自己不存)（凭据是租户属性，一个租户一把；组织层不持有；出厂格一把只供官方） | `mpd#S-7`、`#S-12`、`#S-19`、`#S-20`、`#S-32`；`mrr#S-19`；`mpf#S-22` | 裁决已确认（33，rev 10）；出厂格可有一把：推导待确认（rev 9 ⚑ R-MR-2）；自建不落出厂格：推导待确认（P33、P34） |
| [§4 选中模型与有效模型](../../design.md#选中模型-与-有效模型)、[§5.9](../../design.md#59-换模型一条事实一个生效点零个新分支)、[§6.5](../../design.md#65-切换是用户的直接命令合法目标不得拒绝)～[§6.8](../../design.md#68-不为切换新增分支) | `mrr#S-9`、`#S-10`、`#S-26`、`#S-27`；`msg#S-49` 的 `model_selection_changed` | 已确认；锁压过选中照常发出、初值取设置求值：推导待确认（rev 9 C-10、C-11） |
| [§5.10](../../design.md#510-合法目标集合与展示列表是两件事)、[§6.9](../../design.md#69-合法目标算不出来时不替用户改选)（合法目标三项、不替用户改选） | `mrr#S-11`、`#S-12`、`#S-24`、`#S-25`、`#S-28` 出门前检查 | 已确认；允许集合 `A` 的来源无契约：**`mrr` G-19** |
| [§4 模态](../../design.md#模态)、[§4 模态投影](../../design.md#模态投影)、[§5.11](../../design.md#511-有-transcript-的块不再把任何模型挡在外面)、[§6.10](../../design.md#610-模态兼容挡在算合法目标那一刻不挡在出门那一刻)、[§6.18](../../design.md#618-模态投影要答得快而且是增量维护出来的) | `mp#S-5`～`#S-7`、`#S-15`、`#S-16`；`mrr#S-13`（读到的追到日志尾） | 已确认；只算给模型看的块：推导待确认（rev 9 R-M1） |
| [§4 转换件](../../design.md#转换件)（按键登记、同键可替换、挂在原块上、转失败整条不落盘、本版不是资产、不调模型） | `mp#S-8`～`#S-11`、`#S-17`～`#S-24`；呈现责任落 [PF-016 §6.21](../../../PF-016-cli-tui-delivery-surface/design.md#621-被转换过的消息呈现上说得出模型读的是哪一份) | 裁决已确认（18、21–30，rev 5／6）；媒体类型键优先、转换件不调模型：推导待确认（rev 9 R-M1、⚑ C-14）；呈现落点：推导待确认（P40） |
| [§5.2](../../design.md#52-这一层的四要素填-pf-011-那一格)～[§5.4](../../design.md#54-三类事实归本层定死其余照状态码)、[§6.11](../../design.md#611-成因在这个边界上分类不丢进外层按异常形态分)、[§6.12](../../design.md#612-事实判断归本-topic策略归拓展件)（三类事实归本层、其余照状态码归策略） | `mrr#S-18`、`#S-30` 守卫、`#S-50`；`resp#S-15`；成因名字归 `le#S-17` | 已确认；`unrecognized` 归策略类：推导待确认（rev 9 R-MR-1） |
| [已经开口说话了](../../design.md#已经开口说话了优先于其余各类)（首 token 不论模态） | `mrr#S-15`、`#S-16`；`sa#S-16`；`resp#S-17`、`#S-18` | 裁决已确认（31，rev 7） |
| [§5.5](../../design.md#55-上交交给谁看模型说没说出话)、[§6.14](../../design.md#614-上交带的成因是封闭枚举外加一个诚实的兜底状态码另外原样带着)、[§6.15](../../design.md#615-上交条目的形状不在这里定)（上交、留痕一家一条、成因封闭加兜底、状态码原样） | `resp#S-4`、`#S-15`、`#S-23`、`#S-24`；`mrr#S-8` 调用终结、`#S-32`；`msg#S-50`；上交条目的形状归 PF-011（loop 写） | 已确认；成功那一次的留痕是否同一条记录：来源问题（[第 7.4 节](#74-来源问题)） |
| [§5.12](../../design.md#512-重试站在一个已经存在的位置上)、[§6.13](../../design.md#613-试尽由拓展件判定档案的两项声明是它的输入)（重试是可替换拓展件；默认件开箱就有） | `mrr#S-30`、`#S-35`、`#S-50`；`mpf#S-5`、`#S-6` | 已确认；默认件逐家一遍、不许回退时同家至多再试一次：推导待确认（rev 9 R-MR-1）；退避值：**`mrr` G-8** |
| [§5.13](../../design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)（单独中断、停机看首 token、只有一个宿主） | `mrr#S-31`、`#S-33`、`#S-36`；`resp#S-12`、`#S-13` | 已确认；首 token 之后停机记 `runtime_lost`：推导待确认（rev 9 R-MR-1）；回复在落盘前被否决时另起新调用：推导待确认（rev 9 C-6） |
| [§6.16](../../design.md#616-错误信息外泄之前要脱敏) | `mrr#S-20`；`resp#S-21` | 已确认；规则取值：**`mrr` G-6** |
| [§6.17](../../design.md#617-本-topic-不出现任何时限数值)（两个超时是 Agent 定义上的运行时设置项，退避是重试件配置） | `mrr#S-21`、`#S-35` | 已确认；两个超时的归属：推导待确认（rev 9 R-C3）；**`mrr` G-8、G-9** |
| [§5.13 停机之后](../../design.md#停机之后能不能重来只看首-token)（两次发出两笔钱、拿不到记未知不记零） | `ca#S-19`、`#S-20`、`#S-37`～`#S-39`；`resp#S-19` | 已确认；「费用拿不到记未知」归本 topic：推导待确认（rev 9 C-4） |
| 回复与流断在半路（PF-009 rev 8 定义，本 topic 的调用把它落到响应体） | `sa#S-13`、`#S-16`、`#S-28`；`msg#S-9`、`#S-10`；`mrr#S-51` | 回复消息与 `ending` 归 PF-009（rev 8 全文待确认） |

**不在本版**：[§6.10 末段](../../design.md#610-模态兼容挡在算合法目标那一刻不挡在出门那一刻)的大小上限怎样用（PF-010 组装）；[§8](../../design.md#八边界与依赖) 列给别处的全部事项；[§9.1](../../design.md#91-一处需要上游回补工具能产出哪些块) 工具能产出哪些块（PF-006／PF-009）。[acceptance 第四节](../../acceptance.md#四本版不验收的)照此。

## 2. 涉及的领域对象

取自 [`domain_objects/objects.md`](../../../../domain_objects/objects.md)，带它标明的未裁。

| 对象 | 领域含义 | 生命周期 | 落点 |
|---|---|---|---|
| [模型档案](../../../../domain_objects/objects.md#ul-model-profile--模型档案) | 一个可被调用的模型的全部事实；身份（所在范围, 路由名）；不是资产 | 建档 → 在册 ⇄ 已撤回（没有终态、行不删、恢复同一行）；自建可修订（路由名、来源除外）；官方只经清单变化 | `mpf` 形状；`mpd` 的 `model_profile` 表（中心 P-1）；据点只读副本经 P-1r（受阻） |
| [一次模型调用](../../../../domain_objects/objects.md#ul-model-call--一次模型调用) | 宿主恒为 agent runtime；**身份正文未述**，规格定为（会话, `callId`），`callId` 会话内唯一（`mrr#S-5`、`ca#S-37`） | `open` → `in_flight` → `speaking` → `reply_pending`／`awaiting_decision`／`resumable` → 三个终态 `complete`／`handed_up`／`interrupted`（`mrr#S-6`） | 状态不另存为权威：终态与「已开口」由会话日志里的六种记录判出；在途表只在 P-2 进程里 |
| [模型响应体](../../../../domain_objects/objects.md#ul-model-response--模型响应体) | 一次发出一条，写下即不变 | 一次发出收场时写下 → 随会话日志留存 | `resp` 形状；`persisted` 那条由调用方与回复消息同一提交写，其余由 P-2 写。**未裁**：成功那一次的留痕与「可追溯组成」是不是同一条记录，规格按「每次发出恰一条」合一（[第 7.4 节](#74-来源问题)） |
| [消息](../../../../domain_objects/objects.md#ul-message--消息)（回复消息 `AssistantMessage`） | 一次回复成为消息的那一份；`response` 指回响应体 | 流式期间是在途状态 → 收尾落成一条消息，或不成消息 | `msg#S-9`、`#S-10`；由 loop 与响应体同一提交写（受阻于会话日志） |
| [内容块](../../../../domain_objects/objects.md#ul-content-block--内容块) | 模态按块判；派生表示与 transcript 挂在原块上 | 落盘后整块不变 | 模态投影与转换件的输入（`mp#S-5`、`#S-10`、`#S-11`） |
| [会话日志](../../../../domain_objects/objects.md#ul-session-log--会话日志) | 唯一真相来源；承载五种调用记录、响应体、切换事实 | 只增不改 | **没有契约、没有提供者**（节点缺口 MRR-N1、cli C-1） |
| [会话](../../../../domain_objects/objects.md#ul-session--会话)、[租户](../../../../domain_objects/objects.md#ul-tenant--租户)、[agent runtime](../../../../domain_objects/objects.md#ul-agent-runtime--agent-runtime) | 会话持有创建那一刻的租户身份（发起租户）；agent runtime 是调用的宿主 | 各自归 PF-015／PF-001／PF-012 | 发起租户经 `sessionTenancy` 现读（无契约，MRR-N10）；宿主句柄无人接（MRR-N11） |

**不是对象、但本投影要用的**（属性、视图或计算结果，不另立身份）：[模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)（租户身上的一项属性，`mpd#S-7` 存它的引用）；[选中模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model)、[有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model)（`mrr#S-9`、`#S-10`）；[合法目标集合](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-legal-target-set--合法目标集合--legal-target-set)与展示列表（`mrr#S-11`、`#S-12`，每次现算）；[模态投影](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality-projection--模态投影--modality-projection)（对会话日志的折叠，`mp#S-5`）；[模态转换件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)（系统装配层按键登记，本版不是资产）；一次发出（过程，留下的是响应体）。

## 3. 不变量、安全与进展

「检查」一列：`formal` 指登记任务 `model-request-runtime-v1-invocation`（run `2026-09-25-formal-assets-runtimes`）里有否定配置证明能失败的不变量；「正向」指只在正向配置里检查过、未证明能失败（不作证据）；「吸收」指被建模方式吸收、按构造成立（不作证据）。**规范场景与测试全部未开始。**

### 3.1 不变量

| 编号 | 内容 | 谁维护 | 检查 |
|---|---|---|---|
| INV-1 | （所在范围, 路由名）同一格里不重复，含已撤回行；行不删；在册状态只经撤回与恢复在册两条边，恢复的是同一行（`mpf#S-3`、`#S-10`；`mpd#S-5`） | P-1：`model_profile` 上（范围键, 路由名）唯一、范围键非空（MPD 节点 R-2）；没有删行的写路径 | 场景 `mpd#S-25`、`#S-26`（真并发，sqlite 与 pg 各一次） |
| INV-2 | 一个租户至多一把凭据；没有以组织为键的凭据（`mpd#S-7`） | P-1：`model_credential_binding` 以租户为主键（R-5）；写面只收 `TenantId` | 场景 `mpd#S-28` |
| INV-3 | 官方档案只来自清单、只经清单变化；已装入序号只增，记下的处置就是那一次装入交回的（`mpd#S-8`、`#S-18`） | P-1：清单只在插件体里装入、不上服务面；清单状态行与档案行同一提交（R-4） | 场景 `mpd#S-27`（含重启一支） |
| INV-4 | 每一次发出至多一条响应体；只有出了门的发出才有响应体（`mrr#S-17`、`#S-8`；`resp#S-4`、`#S-16`） | P-2 按 `ResponseId` 判重、先到者赢；会话日志（会话, `ResponseId`）唯一（L-2） | formal `AtMostOneBodyPerDispatch`（否定配置 `NonIdempotentSettle`）；`BodyOnlyForAnchored` 正向 |
| INV-5 | 每一次出网的发出都有「已出门」，每一次被看见的内容都有「已开口」（`mrr#S-15`） | P-2：`await` 追加确认再出网／再推给观察者 | formal `QuiescentSettled`（`SendBeforeAnchor`）、`NoDispatchAfterSeen`（`SpokeAfterObserve`）；`EverySentIsAnchored`、`EverySeenIsAnchored` 正向 |
| INV-6 | 发出序号跨尝试连续、不重不跳；首次发给快照第一家；续接发给同一家；每一家都在快照允许的供应商里，不许回退时每次都是第一家（`mrr#S-5`、`#S-22`） | P-2 同一次调用单写者；跨实例由 L-4、L-6 挡 | `ContiguousDispatches` 正向；`FirstDispatchFirstProvider`、`ResumeSameProvider`、`ProviderAllowed` 吸收；场景 `mrr#S-41`、`#S-42` |
| INV-7 | 一次调用至多一个终态，终态恰三个（`mrr#S-6`） | P-2 | `AtMostOneTerminal` 正向 |
| INV-8 | `interrupted_mid_reply` ⇔ 有首 token 的故障（`mrr#S-18`；`resp#S-13`） | P-2 | `CauseMatchesFirstToken`、`BodyFirstTokenMatchesAnchor` 正向 |
| INV-9 | 续接与对账用的绑定就是那次调用打开时的绑定，从「已出门」读，不读内存、不重读档案（`mrr#S-7`、`#S-33` ④） | P-2 | 场景 `mrr#S-42`（两个停机支与参数一支） |
| INV-10 | 读到的投影 = 对读那一刻整份会话日志重算的投影；只增不减（`mrr#S-13`；`mp#S-6`） | P-2 的投影缓存 R-1～R-3，读时追到日志尾；`mp` 的可分解律 | 性质测试 `mp#S-37`；伸缩测量（`mrr#S-13`） |
| INV-11 | 每个转换件键上至多一件生效；一个块至多一份派生表示，有派生表示则有 transcript（`mp#S-9`、`#S-11`、`#S-17`） | P-3 的不可变表与 `declareConverters` 的 `keyTaken` | 场景 `mp#S-31`、`#S-35`、`#S-36` |
| INV-12 | 响应体的收场与其余成员只取条件表里的组合（`resp#S-13`） | `core/model-response` 的 `judgeModelResponse`；写入纪律在 P-2 | `resp` 验证入口 V-1 |

### 3.2 安全性质（绝不能发生）

| 编号 | 内容 | 谁维护 | 检查 |
|---|---|---|---|
| SAF-1 | **开口之后同一次调用再发——跨尝试**（`mrr#S-29` ③、`#S-30` 守卫 1、`#S-33` 第四行） | P-2 守卫；「已开口」先于观察者 | formal `NoDispatchAfterSpoke`（`NoGuard_Spoke`）、`NoDispatchAfterSeen`（`SpokeAfterObserve`）；场景 `mrr#S-42` |
| SAF-2 | 事实类失败（`credential_unavailable`、`request_rejected`）之后再发；终态之后再发（`mrr#S-30` 守卫 2 与终态检查） | P-2 守卫，任何拓展件推翻不了 | formal `ContinuationOnlyAfterStrategyOrSilentLoss`（`NoGuard_Fact`） |
| SAF-3 | 用户叫停之后又发出；用户中断被记成故障或失联（`mrr#S-31` ④⑧、`#S-33` 前两行） | P-2：意图先落再发中止信号 | formal `NoDispatchAfterInterrupt`（`AbortBeforeIntent`）；`InterruptNotMisregistered` 正向；场景 `mrr#S-47` |
| SAF-4 | 凭据的值或引用出现在任何记录、读面、事件、失败说明里（`mpd#S-12`；`mrr#S-19`、`#S-20`；`resp#S-21`） | P-1 读面返回类型不含值与引用；P-2 值只作 `send` 的实参、写入之前脱敏 | 哨兵场景 `mpd#S-29`、`mrr#S-46`（后者受阻于 G-5、G-6）；静态检查（MPD-N4） |
| SAF-5 | 取到别的租户、组织层、本人个人组织的凭据；自建档案用上出厂格那一把；租户那一格读不到时落到出厂格（`mpd#S-20` ⑤⑧；`mrr#S-19`） | P-1：只读锚租户那一格与出厂格；P-2：来源取自绑定的有效模型引用 | 场景 `mpd#S-28`（故障注入）、`mrr#S-48` |
| SAF-6 | 无权者借建档、撤回、恢复、修订探到别处有没有某个名字或某一行（`mpd#S-13` 判定次序、`#S-14`、`#S-15`、`#S-31`、`#S-33`） | P-1：授权先于解析、`unavailable` 排在一切要读存储的值之前 | 场景 `mpd#S-30` |
| SAF-7 | 替用户改选；「读不到」被当成空集、没切换过、没开口、未知模型（`mrr#S-9`、`#S-11`、`#S-12`、`#S-16`；[§6.9](../../design.md#69-合法目标算不出来时不替用户改选)） | P-2 各读面 `unavailable` 不降级 | 场景 `mrr#S-44` |
| SAF-8 | 拓展件或 agent 换掉选中模型；`retry` 带一个目标（`mrr#S-27` ②、`#S-30`） | P-2：`selectModel` 只由交付面调；`plan` 多余成员 ⇒ `invalidInput` | 场景 `mrr#S-43` |
| SAF-9 | 本地故障被报成「上游给不出」（`mrr#S-18`） | P-2 按来源分类 | 场景 `mrr#S-46` |
| SAF-10 | 一条响应体对应上游多次请求（`mrr#S-29` 末条；`resp#S-24`） | 传输适配第 1 条：单家、禁回退、不隐藏重试 | 适配层符合性测试（受阻 MRR-N4、`mrr` G-10） |
| SAF-11 | 要转的块键上有登记却以没有 transcript 落盘；一条消息部分转换之后落盘；转换改动原块（`mp#S-20`、`#S-21`、`#S-11`） | 模态转换那一件（贡献者插件登记）；它排在 `before_persist_message` 末位（runner 兑现） | 场景 `mp#S-33`、`#S-34`、`#S-35`（前两条受阻于 runner G-20 与会话日志） |
| SAF-12 | 只给人看的块把模型挤出合法目标；纯文本消息因转换这一侧不可用被否决（`mp#S-5` 的 `counted`、`#S-22`） | 纯函数 `projectEntry`；那一件只在有要转的块时才依赖登记表与租户 | 场景 `mp#S-32`、`#S-33` |
| SAF-13 | 一次发出的迟到片段拼进下一次发出；被拒的增量不说或说两次；两个会话同一个 `callId` 串到一份装配状态（`mrr#S-51` 第 1、4 条） | P-2：按（会话, 目标）为键，一次发出一份状态 | 场景 `mrr#S-52` |
| SAF-14 | 追补的响应体拿合并之后的参数冒充实际发出的（`mrr#S-33` ④） | P-2 从「已出门」读参数三项；传输适配第 10 条 | 场景 `mrr#S-42` 参数一支 |
| SAF-15 | 已有发出的调用被记成「一次也没发出」（`mrr#S-29` ⑧；`msg#S-50`） | P-2：续接或再发取不到凭据写 `released{cause: credential_unavailable}` | 场景 `mrr#S-41` 凭据一支 |
| SAF-16 | 指认一次调用时串到别的会话（`mrr#S-5`） | P-2：指认调用的操作都收 `session`，先判归属 | examples 与场景（模型只有一次调用，不覆盖） |

### 3.3 进展性质（有界，前提与责任方写明）

表 A 里「有前提地能」的逐条在这里：前提失效时这一行不成立，责任方写在最后一列。

| 编号 | 内容 | 上界 | 前提 | 前提的责任方 |
|---|---|---|---|---|
| LIV-1 | 每一次出了门的发出终将有一条响应体（`mrr` 第八节进展第一行） | 收场、宿主停止时的撤除、停机之后的对账，先到的那一个 | ① 两个时限有值（`mrr#S-21`）；② 交回之后调用方在结束这一步之前收口；③ 停机之后终有下一次尝试或会话的重新承载 | ① PF-002 owner（`mrr` G-9）；②③ loop 与会话生命周期（`mrr` G-11；cli C-8、C-13）。formal `SentEventuallySettled` 依赖弱公平、无否定配置，**不作证据** |
| LIV-2 | 首 token 之前失联的调用在下一次尝试里续接 | 下一次尝试的对账 | Run 未终结、恢复起新尝试 | loop（C-8） |
| LIV-3 | 切换之后的下一次请求用新的选中模型 | 下一次 `effectiveModel` | 之后确有下一次请求；目标仍合法且没被锁；允许集合 `A` 读得到 | loop；`A` 的来源 `mrr` G-19（PF-002／PF-004 owner ＋ `aev`） |
| LIV-4 | 默认重试件在有限步内判试尽 | 快照允许的供应商家数；不许回退时同家至多再试一次 | 默认件在位；它挂了由指定挂件顶上、一律不重试（`run` S-17） | P-5；runner。**自定义件不承诺终止**（`mrr#S-3`） |
| LIV-5 | 凭据轮换之后下一次发出用新值 | 下一次发出 | 据点取得到租户那一把的当前值 | 入口组合 v2 与保管方（`mrr` G-12、`mpd` G-7；cli C-4、C-5） |
| LIV-6 | 撤回、恢复在册之后，下一次读与下一次准入按新状态 | 下一次读 | 单机现读同一存储；产品装配（cli）是协议给，新鲜度上界与单调读未定义 | 入口组合 v2（`mpd` G-7、MPD-N2） |
| LIV-7 | 中断之后这次发出停下 | 中止信号到达传输之后 | 传输响应中止 | 传输适配（MRR-N4） |
| LIV-8 | 一条消息落盘之后，下一次合法目标判定已计入它 | 下一次判定 | 读投影的一方追到日志尾 | P-2（`mrr#S-13`） |
| LIV-9 | 一份转换件声明交进来并返回之后，下一次转换按新登记表 | 下一次转换 | 装配给 | 声明者插件（cli 装配） |

## 4. 业务规则（开发者不该自己决定的，这里都有）

### 4.1 贯穿全部操作的口径（`mpd#S-9`、`#S-13`；`mrr#S-14`；`mp#S-12`、`#S-13`）

- **缺席一律拒绝或明确失败，不放行、不空集、不回退。**三类分开：判定得出「不该这样做」⇒ 一个具名拒绝值；判定做不出来 ⇒ `unavailable`；输入不合形状 ⇒ `invalidInput{reason}`（表示层，排在一切判定之前；`mpd#S-31` 改完的整份文档过校验是唯一排在解析之后的一处）。
- **身份参数没有默认值**：`TenantId`、`ScopeLayerIdentity`、`ModelProfileRef.scope`、会话、`callId`、宿主缺席即 `invalidInput`，不由「当前租户／当前会话／当前在跑的调用」补。
- **判定次序 = ⑥ 从左到右，第一个成立的即结论**；**要读才判得出的值，在它要读的输入读不到时一个也不成立**，以 `unavailable` 收场。目录一侧另有一条：授权依赖的成员资格判定 `unavailable` ⇒ 立即 `unavailable`，`routeNameTaken`／`profileNotFound`／`manifestNotNewer`／`credentialUnavailable` 一个也不取。
- **失败值闭合**：`mpd` 恰八个（`invalidInput` · `notAuthorized` · `routeNameTaken` · `officialProfileReadOnly` · `manifestNotNewer` · `profileNotFound` · `credentialUnavailable` · `unavailable`）；`mrr` 恰九个（`invalidInput` · `unavailable` · `profileNotFound` · `notLegalTarget{because}` · `callNotFound` · `alreadyEnded` · `runtimeStopped` · `retryRefused{why}` · `wrongPhase`）；`mp` 的 `convert` 恰三个（`invalidInput` · `converterFailed` · `transcriptMissing`，`noConverter` 是成功的一支）。已下架与没凭据**不是 `mrr` 的操作失败值**，是调用的收场（`undispatched{…}`、`released{cause}`）。

### 4.2 档案目录（中心 P-1，`mpd` 第四节）

| 操作 | 前置与授权 | 提交点与原子性 | 失败集合（判定次序） | 幂等 | 缺席时 |
|---|---|---|---|---|---|
| `registerProfile`（`#S-14`） | `可写(initiator, scope)`；只收 `custom`、组织层或租户层 | 单次提交，覆盖 `scope` 那一格的档案行：判名字与写入同一提交 | `invalidInput` · `notAuthorized` · `unavailable` · `routeNameTaken` | 同格同名、内容逐成员相等且在册 ⇒ 认回；已撤回同名 ⇒ `routeNameTaken`（走恢复） | 读不到名字 ⇒ `unavailable`，不当「未被占」；`origin` 非 `custom` ⇒ `invalidInput{origin_not_custom}` |
| `withdrawProfile`（`#S-15`） | official ⇒ `officialProfileReadOnly`（不是权限）；`可写(initiator, ref.scope)` | 单次提交：只改 `registration`，`updatedAt` 不动；**真的发生了**才在提交之后 `emit profile.withdrawn` | `invalidInput` · `officialProfileReadOnly` · `notAuthorized` · `unavailable` · `profileNotFound` | 已撤回 ⇒ 同样返回、不写、不再发事件 | 读不到 ⇒ `unavailable`，不得 `profileNotFound` |
| `relistProfile`（`#S-33`） | 同上一条谓词（谁撤得了谁恢复得了） | 单次提交：只改 `registration`；不做撞名判定；**不发事件** | 同 `withdrawProfile` | 已在册 ⇒ 同样返回、不写 | 同上 |
| `updateProfile`（`#S-31`） | official ⇒ `officialProfileReadOnly`；`可写(initiator, ref.scope)`；`patch` 只含可改项、至少一项 | 单次提交：读—改—写，改完整份过 `mpf#S-24`；五项上游属性变了才推 `updatedAt`；不动 `registration`（已撤回的也改得动） | `invalidInput`（输入形状）· `officialProfileReadOnly` · `notAuthorized` · `unavailable` · `profileNotFound` · `invalidInput`（改完的整份文档） | 改完与原样相等 ⇒ 不写；并发按提交先后 | 同上 |
| `readProfile`（`#S-16`） | official 支任何链读得；custom 支 `scope` 须在链上，否则 `notAuthorized`（先于解析） | 只读、每次现读 | `invalidInput` · `notAuthorized` · `unavailable` · `profileNotFound` | 天然可重复 | 三种收场不折叠；不回退到别层同名 |
| `listProfiles`（`#S-17`） | 无；链本身就是边界 | 一次一致快照读三格 | `invalidInput` · `unavailable` | 同上 | 任一部分读不到 ⇒ `unavailable`，不给部分列表 |
| `loadManifest`（`#S-18`） | 只由发布动作调；**不上任何服务面**，P-1 插件体在 `provide` 之前调一次 | 单次提交覆盖出厂格全部行、最高序号与那一次的处置 | `invalidInput` · `unavailable` · `manifestNotNewer` | 同序号同内容 ⇒ 返回记下的处置、不写（重启后同样） | 坏清单整份不装；处置闭合五种：`added`／`updated`／`unchanged`／`relisted`／`withdrawn` |
| `bindCredential`（`#S-19`） | `可写(initiator, tenant(tenant))`，即本人且成员资格有效 | 单次提交：替换那一条，`boundAt` = 提交时刻；不校验引用解得出值 | `invalidInput` · `notAuthorized` · `unavailable` | 同引用再绑 ⇒ 不写；并发后提交者生效 | 给组织身份 ⇒ `invalidInput`；**不回显引用** |
| `unbindCredential`（`#S-32`） | 同上 | 单次提交：删掉绑定 | `invalidInput` · `notAuthorized` · `unavailable` | 本来没有 ⇒ 不写 | 下一次取用按「没配」：官方取出厂格（配了时），自建没有可用凭据——**这是没配，不是回落** |
| `resolveCredential`（`#S-20`） | `present` 无前置；`value` 只由模型请求运行时在一次发出之前调（装配给） | 只读、每次现取 | `invalidInput` · `unavailable` · `credentialUnavailable` | 天然可重复 | 见 4.4 |

**授权谓词**（`mpd#S-10`）：`organization(O)` 格 ⇒ `initiator.organization = O` 且成员资格 `effective`、角色 `superAdministrator`；`tenant(T)` 格 ⇒ `initiator = T` 且 `effective`。先比 `initiator` 与格（不读存储），对不上即 `notAuthorized`、不做成员资格判定；`ineffective` ⇒ `notAuthorized`；成员资格判定失败 ⇒ `unavailable`，绝不折成 `notAuthorized`。成员资格现读、**不在写入提交里**——判完到写入之间被撤销，这一次照样成立，这是有意接受的窗口（`mpd#S-11`）。

### 4.3 从路由名到一行：同名按层覆盖（`mpd#S-17` 末段；`mrr#S-10` 第 2′ 步）

```text
C(T, r)        ≝ 范围链(T) = ⟨租户层 T, 组织层 T.organization, 出厂默认层⟩ 上路由名为 r 的全部行（每格至多一行）
C₁(T, r)       ≝ C 里在册的
C₂(T, r, A)    ≝ C₁ 若 r ∈ A，否则 ∅          （A = 「用哪个模型」那一项在这个会话格上的允许集合，元素是路由名）
胜出行(T, r, A) ≝ C₂ 里最具体的那一行（租户 > 组织 > 出厂默认）
落点(T, r, A)   ≝ 胜出行；没有时取 C₁ 最具体；C₁ 也空时取 C 最具体；C 空 ⇒ profileNotFound
```

- **只滤已撤回与范围不允许**；模态对不上、缺凭据**不滤**，胜出行照样是胜出行，出门前检查以相应成因挡下，**不落到更一般一格的同名行**。
- **按 `(T, r, A)` 求，不按 `(T, r)` 缓存**：同一租户的两个会话格可以有不同的 `A`。
- **`A` 读不到 ⇒ 明确失败**，不当空集、不当全集、不以链上全部名字代替。**`A` 这一项今天没有任何正文契约产出**（`mrr` G-19）：闭合之前 `legalTargets`、`displayList`、`effectiveModel`、`openCall` 恒 `unavailable`。
- **锁锁的是名字**：层锁压过选中模型，`selectedBy = layer_lock`，供应商、参数、凭据取锁定名字落到的那一行。
- **写明的代价**：组织层建了与官方同名的自建档案，没配自己那一把的成员这个名字用不上（`credential_unavailable`，出厂格那一把只供官方）；组织锁得住名字、锁不住落到哪一行。

### 4.4 凭据取哪一把（`mpd#S-20`；`mrr#S-19`）

| 发起租户 | 档案来源 | 取值问法答 | 有没有问法答 |
|---|---|---|---|
| 有自己的绑定 | 任意（官方、组织层、租户层） | 租户那一把，`scope = tenant(T)` | `{ present: true, scope: tenant(T), boundAt }` |
| 没有绑定 | `official`，且部署给出厂格配了一把 | 出厂格那一把，`scope = factory` | `{ present: true, scope: factory }` |
| 没有绑定 | `official`，出厂格没配；或 `custom` | `credentialUnavailable` | `{ present: false }`（结论，不是失败） |
| 租户那一格读不到 | 任意 | `unavailable`，**绝不落到出厂格** | `unavailable`，不得答 `{ present: false }` |
| 有绑定，保管方判解不出 | 任意 | `credentialUnavailable`，**不改取出厂格** | — |

- `origin` 必给、缺席不当「官方」；取自这次调用绑定的有效模型引用，调用方交不进来。
- **每一次发出之前现取，不缓存到下一次发出**；值只交给传输适配，不进任何记录、结论、事件、失败说明、档案快照。
- **账上分记**：用量归凭据那一格（响应体 `route.credentialScope`），成本归发起租户（承载条目壳上的租户身份，`ca#S-38`）；两者只在走出厂格那一把时分叉。
- **据点离线**（D-040 §八 M47）：P-1r 先读保管方里的据点本地副本、中心可达时刷新；**保管方缺席的本版离线即 `credentialUnavailable` ⇒ 首次发出 `undispatched{credential_unavailable}`、续接或再发 `released{cause: credential_unavailable}`**，不给「照常」；保管方在场而一次读失败仍是 `unavailable`。
- **CLI 据点不放出厂格那一把**（cli [关键选择](../../../../realization/apps/cli/design.md#关键选择) 4，依 [PF-016 §6.20](../../../PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据)）：本版唯一的交付形态下，没配自己那一把的租户调官方档案同样 `undispatched{credential_unavailable}`（见 [第 7.4 节](#74-来源问题) 第 6 条）。

### 4.5 选中、有效、合法、展示与切换（`mrr` 第二节、`#S-24`～`#S-27`）

- **选中模型**是一个路由名：会话日志里最后一条 `model_selection_changed` 记的名字；一条都没有时 = 「用哪个模型」这项设置在会话格上的求值结果。**读不到日志 ⇒ `unavailable`，不回退到设置初值。**只因模型切换而变；`select_model` 只改那一次的有效模型、不写切换记录。
- **有效模型**四步：① 选中；② 层锁（有锁即 `layer_lock`，取锁定的名字）；2′ 名字 → 落点（4.3）；③「调模型之前」拓展件的 `select_model` 只改这一次（`{ extension: name }`），它给的名字同样经 2′；④ 出门前检查（4.6）。任一步读不到 ⇒ `unavailable`，不猜、不用上一次的。
- **合法目标** = `{ r | 胜出行(T, r, A) 存在 ∧ compatible(胜出行, 投影) }`，元素是路由名、次序无含义；**任一输入读不到 ⇒ `unavailable`，不返回空集或部分集合**；凭据有无不在这里。**投影 ⊆ 本据点传输能承载的模态**是可发出的另一条前置，不进合法目标、不改变切换，在出门前检查第 3 行挡。
- **展示列表** = 合法目标 ∪ 选中模型，每个名字一条 `{ routeName, ref, 注记集合, covered, selected }`：主标是落点那一行的来源；名字上的注记至多一条 `withdrawn`／`scope_disallowed`／`modality_mismatch`（三者互斥），外加可并存的 `credential_missing`（**按胜出行的来源问「有没有」**）；被盖住的同名行列在 `covered` 里、各带 `overridden_by{scope}` 与自己的 `withdrawn`／`scope_disallowed`，选不了。选中名字在链上没有任何一行 ⇒ 整个 `displayList` 以 `profileNotFound` 失败，不自造「已下架」。
- **`selectModel`**：只由交付面的切换命令调；**先判合法再判重复**（重选一个已下架的当前选中 ⇒ `notLegalTarget{because: [withdrawn]}`）；提交点是写下 `model_selection_changed`；判定与写入**不在同一提交**，其间变得不合法由 §6.9 兜住（有意接受的窗口）；写不进 ⇒ `unavailable`、选中不变。**生效点是下一次 `effectiveModel`，在途调用不受影响。**合法目标里的名字只可能因 `unavailable` 失败；`notLegalTarget` 是接口层的值，不是给用户看的「切换被拒」。

### 4.6 打开一次调用与出门前检查（`mrr#S-28`）

- **新调用用交来的 `target`，不重算选中模型**；没有 `targetChangedBy` 时 `target` 必须等于 `basis.routeName`，否则 `invalidInput`。`run` 与 `attempt` 同时出现或同时缺席（后者是「不属于任何 Run」的显式陈述）。`tools` 是模型面名字，原样进出、不逆转写。
- **出门前检查**（核有效模型落到的那一行，依次核、第一个不过的即成因）：

| 次序 | 检查 | 不过即 |
|---|---|---|
| 1 | 在册 | `withdrawn` |
| 2 | 这个范围允许 | `scope_disallowed` |
| 3 | `compatible(档案, 投影)`，且投影 ⊆ 本据点传输能承载的模态 | `modality_mismatch` |
| 4 | 以发起租户与有效模型的来源问「有没有」凭据 | `credential_unavailable` |
| 5 | 合并后的参数过 `mpf#S-24`（含输出上限） | `invalidInput{reason}`（不是成因、不上交） |

- 检查不过 ⇒ 写调用终结 `undispatched{cause}`、调用即 `handed_up`、**没有响应体**；检查通过 ⇒ **不写任何记录**。任一输入读不到 ⇒ `unavailable`，**不写任何记录、不打开调用**——「判不出来」不记成 `undispatched`。续接：绑定从最近一条「已出门」读，不重读档案、不重做检查。
- **合并参数**：档案 `parameters` 逐项被本次覆盖替换，合并之后再按档案的输出上限校验；缺席即不带，没有人补值；覆盖能否去掉一项是 `mpf` G-8。

### 4.7 发出、再发与守卫（`mrr#S-29`、`#S-30`、`#S-50`）

- **`dispatch` 提交点是「已出门」**：取凭据 → 传输适配定下改值与丢项 → 写「已出门」（带 `ResponseId`、那一家、绑定与那两项）→ 请求出网，发出的就是「已出门」还原得出的那一组。**等到这次发出收场才返回**：`complete`／`truncated`／带回复的 `interrupted` ⇒ 交回、未写，调用进 `reply_pending`；`failed`／没有内容的 `interrupted` ⇒ 本能力写下后返回，`failed` 时调用进 `awaiting_decision` 并带「调模型之后」失败那一维的主体（`le#S-14`）。取不到凭据：首次 ⇒ `undispatched{credential_unavailable}`；续接或再发 ⇒ `released{cause: credential_unavailable}`；保管方或追加口够不着 ⇒ `unavailable`、不出门、停在原状态；取不到时限设置 ⇒ `unavailable`。**传输层不得在一次发出之内隐藏重试。**
- **`dispatchAgain`／`canDispatchAgain`（同一张表，两处判定逐条相同）**：终态 ⇒ `alreadyEnded` 先判；然后守卫，闭合、按次序：

| 次序 | `why` | 条件 |
|---|---|---|
| 1 | `already_spoke` | 这次调用任何一次发出开过口——跨尝试；排在 `wrongPhase` 之前 |
| 2 | `fact_class` | 最近一次发出的成因是 `credential_unavailable` 或 `request_rejected`（只在 `awaiting_decision` 时求值） |
| 3 | `provider_not_allowed` | `plan.provider` 不在快照允许的供应商里；或不许回退而它不是第一家（只在 `awaiting_decision` 时求值） |

- `plan` 只有 `provider`、`after`；多出成员（比如一个目标）⇒ `invalidInput`——**换模型不是 `retry` 能做的**。`after` 给出时由 loop 退避到期再调，本能力不计时。`canDispatchAgain` 答 `{ allowed }` 只对那一刻成立；读不到 ⇒ `unavailable`，不答 `{ allowed }`。

### 4.8 成因按来源分类（`mrr#S-18`；八值定义归 `le#S-17`）

| 来源 | 成因 | 响应体 |
|---|---|---|
| 出门前检查 | `withdrawn` · `scope_disallowed` · `modality_mismatch` · `credential_unavailable`（没配或解不出） | 不进；记调用终结 `undispatched{cause}` |
| 传输本地（适配层错、序列化失败、本地资源耗尽） | `unrecognized`，带本地错误留痕 | 进 |
| 连不上、超时、首 token 之前断流；上游正常收尾却一样内容都没有 | `upstream_unavailable` | 进 |
| 上游状态码 | 查具名参数 `status_cause_table`，只映射到 `credential_unavailable`（配了而被拒）／`request_rejected`／`upstream_unavailable`；表外 ⇒ `unrecognized`；状态码原样带着 | 进 |
| 首 token 之后的任何故障 | `interrupted_mid_reply`，优先于以上各行；状态码仍原样带着 | 进 |

- `unrecognized` 必带状态码、上游错误原文、本地错误、原始响应至少其一；**表的内容是 `mrr` G-5，不填默认**。
- **三类事实**（发不出去、重试没用、已经开口）由发出守卫兑现，任何 `retry` 结论都不生效；**用户中断不是故障**，不带成因、不经失败那一维、不是上交。

### 4.9 首 token 与两个锚点（`mrr#S-15`、`#S-16`；`sa#S-16`）

- **首 token = 这次回复交出的第一样内容，不论模态**：能长的块第一片到了；整交的块整块交出来了；零次填充就封口、封口内容非空也算；响应头不算、整交块开了口没交出来也不算。装配器侧的位置是 `firstContentAt`。
- **「已出门」先于离开本进程；「已开口」先于交给任何观察者（含快照）**，「写下」指追加口确认落盘。**这次发出算不算开口，以「已开口」写下为准。**
- 写不进：「已出门」⇒ 这一次不发、`unavailable`、停在原状态；「已开口」⇒ 内容不交出、中止这次发出、交 `finish { reason: lost, error: { cause: unrecognized } }`，收场是首 token 之前的故障、成因 `unrecognized` 并留痕，**响应体不带 `firstTokenAt`、没有 `delivered`**。**不「先交出去再补写」。**

### 4.10 结算、收口与对账（`mrr#S-17`、`#S-33`、`#S-49`）

- **一次发出的收场由写下它的那条响应体定下**；可能写它的四方——正常收尾、中断、宿主停止时的撤除、停机之后的对账——**按 `ResponseId` 判重、先写下的赢，其余是空操作**。撤除时的结算在一处按「中止 → 定收场 → 写下 → 释放」做完，不分散到几处清理。
- **带回复的那一次交回、不写**（`reply_pending`，收场已定）。收口只有两条路：落盘成了消息 ⇒ **调用方**把响应体（`replyDisposition = persisted`）与回复消息**同一提交**写下；被否决或本来就被系统使用 ⇒ 调用方调 `settleReply({ vetoed: { by, reason? } } | { consumed: { by } })`，本能力以那个处置写下。`settleReply` 给 `persisted` 或缺席 ⇒ `invalidInput`；写不进 ⇒ `unavailable`、停在 `reply_pending`。**被否决不是调用失败**，要再试是 loop 另起一次新调用（新 `callId`）。调用方没收口就结束了：本能力不替它写 `persisted`；兜底是宿主停止的撤除或下一次对账。
- **结算写入不受尝试栅栏拒收**：被关掉的尝试里那次发出的响应体与账照写、带 `late: true`（只在属于某个运行的调用上）。
- **对账**（`reconcile`，从不发出；每一行各自一次提交、按 `ResponseId` 幂等；日志读不到或追补写不进 ⇒ `unavailable`、不给部分结果，loop 不得推进），第一行命中即是：

| 日志里这次调用 | 追补 | 调用随之 |
|---|---|---|
| 有中断意图，最后一次发出已出门、无响应体 | 响应体 `interrupted`（`initiator` 取意图）、首 token 有无取「已开口」、账全未知、没有回复 | `interrupted` |
| 有中断意图，没有在途发出（含一次没发过） | 调用终结 `interrupted` | `interrupted` |
| 已出门、无已开口、无响应体 | 响应体 `interrupted{runtime_lost}`、无首 token、账全未知 | **`resumable`**：同一 `callId` 续接、发给同一家 |
| 已开口、无响应体 | 响应体 `interrupted{runtime_lost}`、首 token 取自「已开口」、账全未知、`delivered` 可缺席 | `interrupted`，**不重发**；中断提醒由 loop 补 |
| 最后一次有响应体 `failed`、无调用终结 | 无 | `awaiting_decision` |
| 最后一次是没有首 token 的 `interrupted{runtime_lost}`、无调用终结 | 无 | `resumable` |
| 其余 | 无 | 原终态 |

- **追补体的路由留痕与参数三项从「已出门」读**：`route.parameters` 取还原得出的实际发出的那一组，`parameterAdjustments`、`droppedParameters` 原样（缺席即断言没改、没丢）。
- **两个调用时机都由调用方保证**：新尝试开始之后、loop 推进之前（带 `attempt`）；会话在据点上重新承载之后、会话级调用打开之前（不带 `attempt`，收口不属于任何 Run 的调用）。

### 4.11 中断与宿主停止（`mrr#S-31`、`#S-36`）

- **`interrupt` 只作用于这一个 `callId`**；`initiator ∈ { user, run_cancelled }`，经本操作的 `run_cancelled` 只出自用户取消运行；**提交点是「中断意图」**：先写意图、再发中止信号，意图写下即返回；写不进 ⇒ `unavailable`、**不发中止信号**。已有意图 ⇒ 不写第二条；这次发出在信号到达之前已收场 ⇒ 那个收场成立。落在哪个阶段：`before_dispatch`（写调用终结）／`in_flight`（本能力写无回复的 `interrupted`）／`speaking`（带已交付内容作回复交回、进 `reply_pending`）。中断提醒由 loop 补。
- **宿主停止**（系统发起的运行取消：会话归档、宿主停止）不经 `interrupt`：此后 `openCall`／`dispatch`／`dispatchAgain` ⇒ `runtimeStopped`；每次在途发出按一处结算：中止 → 对装配状态 `abandon`、不带缘由（流结局 `lost`）→ 收场 `interrupted{run_cancelled}`、**不是故障、没有回复**、已交付的块进 `delivered` → 写下 → 释放。**不交 `finish{ interrupted }`、不产出回复消息。**用户取消运行时宿主先调 `interrupt(run_cancelled)` 让调用方收口，再停——这条次序是宿主的义务（`mrr` G-11 ①）。进程崩溃时撤除一个都不跑，**权威收口是下一次对账**。本能力自身被撤除或替换同样处置。

### 4.12 回复侧的到达装配（`mrr#S-51`；`sa#S-13`、`#S-16`、`#S-28`；`msg#S-10`）

- **一次发出恰一份装配状态**，目标 `{ kind: model_call, callId, dispatch }`，**按（会话, 目标）路由**；这次发出收场之后到达的事件丢弃、**不交给下一次发出**；同一份状态串行 `accept`、不分叉。
- **砍了要说**：传输适配每次合并、截短、限额都以 `trim` 交给同一份状态，截短的那个紧挨在被截短的增量之前；`accept` 拒掉的每个增量，本能力紧接着交一个 `reason: rejected` 的 `trim`，只说一次，并记一条结构化日志事件（**进 JSONL 运行日志、不进会话日志**，必带会话、`callId`、目标、被拒的值；收场之后到达的记 `event_after_finish`）。
- **结束一条流**：上游正常收尾 ⇒ `finish{end}`；写到上限 ⇒ `finish{max_tokens}`；用户叫停 ⇒ `finish{interrupted}`；上游出错、断流、超时 ⇒ `finish{lost, error}`；传输失去连续性没给 `finish` ⇒ `abandon`；宿主停止或本能力被撤 ⇒ `abandon`、不带缘由。**不让一份状态永远不收尾。**
- **回复流结局 → 回复消息**（`msg#S-10`，唯一的一张对应表）：`end` ⇒ `ending: complete`；`max_tokens` ⇒ `truncated_at_limit`；用户叫停且有内容 ⇒ `interrupted_by_user`；出错断的、系统取消的、没内容的**不成为消息**，已交付的块进响应体 `delivered`。
- **账进这次发出的那一条响应体，恰一次**：`usage`、`cost` 原样；没收到 `account` 事件 ⇒ 全 `"unknown"`、`source: none`；`trims` 一次也没砍时响应体那边**缺席**（全零的汇总在响应体上不合形状），否则原样；同一增量先截短后拒收只按拒收计一次。
- **快照与增量衔接**：给观察者的快照带位置，此后只推被接受的事件、数同一串；被拒的不推；**只推给这次调用所在会话的观察者**；「已开口」写下之前交出的快照不含内容。

### 4.13 模态投影与转换件（`mp` 第二至五节）

- **投影** `project(L) = { modality(b) | b 在落进日志的消息里（含工具结果块任意层，不含派生表示里的块），路径上每一位 toModel 为真，modality(b) 有定义，b 不带 transcript }`；模态由媒体类型判定（`data.content-blocks/v1#S-6`），四种都算、文本也算（从不挡档案），没有模态的文件块不算。**单调、可分解（`project(L·e) = project(L) ∪ project(⟨e⟩)`）、重算同一答案**；拿不到日志 ⇒ 没有投影，**不得以 `∅` 顶上**，也不得拿 `∅` 调 `compatible`。
- **兼容** `compatible(P, S)`：`S ⊆ P.inputModalities` ⇒ `{ ok }`，否则 `{ blocked: S \ P.inputModalities }`（非空、从不含 `text`）。只读 `inputModalities`，不看输出模态、大小上限、在册与范围。
- **键**：`{ modality: image | audio | video }`（不收 `text`）或 `{ media_type: type/subtype }`（不带参数，逐码点比）。一个块的候选键：语音 ⇒ 模态 `audio`；图 ⇒ 模态 `image`；文件 ⇒ 先媒体类型键、再它的模态键（模态为 `text` 或无模态时只有前者）；文本、思考、工具调用、工具结果不是转换件的输入。**落到第一个此刻有登记的候选键，只调那一件、只出一份派生表示。**
- **登记表**：部署范围、同键一件；系统装配层交一整份声明、**整份原子替换**；「没登记」只指现行声明里没有这个键；**还没有任何一份声明生效时答不出**，答不出 ≠ 没登记；同一份声明里同键两次 ⇒ `keyTaken`、整份被拒、旧的照旧；声明缺席 ⇒ `invalidInput`（不当空的一份），空的一组是合法声明。
- **一次合法的转换产出**：恰一份派生表示（`producedBy = system`），块非空、只能是文本／图／语音块且模态不同于原块，自己不带派生属性；transcript 非空纯文本。违反 transcript 那条 ⇒ `transcriptMissing`，其余 ⇒ `converterFailed`；**只交 transcript 不交派生块非法**。原块一步不动。
- **`convert` 判定次序**：`invalidInput` → 登记表答不出 `converterFailed` → 每个候选键都没登记 `noConverter`（成功） → 那一件不可用、挂了、没交回、读不到字节 `converterFailed` → `transcriptMissing` → 其余违约 `converterFailed`。**从不把「答不出」「不可用」收成 `noConverter`**；`tenant` 必填。
- **落盘之前那一件**（站在 `before_persist_message`、排在末位；由零状态贡献者插件向 runner 登记）：挑出给模型看、还没带派生属性的语音、图、文件块 → **挑出了才**经执行环境句柄取 `tenant`（取不到 ⇒ 这一件报错、按 `treat_as_veto` 否决）→ 逐块 `convert` → 全部「转成了或 `noConverter`」⇒ 交回 `rewrite`（只添两个成员；一块都没转成交 `observed`）；**任何一块失败 ⇒ 整条 `veto`**，`reason` 点到至少一个块与失败值（有键带键），不转述内容。**全有或全无**；没有要转的块的消息不依赖登记表与转换件；**转换件本版不发起模型调用**。否决之后按产生者分三路归 `run`。
- **产品后果**（D-040 §八 N-26，告知项）：执行环境与 agent loop 两程闭合之前，本程 CLI 收不了图、语音、文件——含要转的块的消息被否决。

### 4.14 默认重试件（`mrr#S-35`）

只对 `upstream_unavailable`、`unrecognized` 出手；允许回退 ⇒ 下一家是快照次序里最近一家之后的那一家、每家至多一次；不许回退 ⇒ 给一次 `retry { provider: 第一家 }`、此后不再给；`after` 取它的配置 `default_retry_backoff`；没有下一家 ⇒ 不再试（试尽）。它是一件普通拓展件，结论照样过 4.7 的守卫；续接不经过它、不占名额；它不在时调用不会被自动再发。**退避取值是 `mrr` G-8**：节点给 P-5 的 `Config` 带候选默认 `[1000, 2000, 4000]` ms（D-040 §八 M67，待产品负责人确认数值，账本 ⑨）。

### 4.15 脱敏与时限（`mrr#S-20`、`#S-21`）

- **写入之前脱敏**，覆盖上游错误原文、响应头、原始响应留存与本地错误：已知值替换（含不短于 `credential_fragment_min_length` 的子串）、`credential_header_names` 头整条剥除、`credential_patterns` 形态替换；会话标识不送往上游。脱敏之后仍叫「原样」。**三个参数的取值是 `mrr` G-6**；节点不放默认，缺即 P-2 不启动。
- **两个时限**：`first_token_wait_limit`（超了 ⇒ `upstream_unavailable`）、`post_first_token_stall_limit`（超了 ⇒ `interrupted_mid_reply`），是 Agent 定义上的运行时设置项、每次发出之前现取；**取不到 ⇒ 这一次不发、`unavailable`，不以「不设上限」代替**。项名的声明与默认值是 `mrr` G-9。

## 5. Cordis 建模

来源：[model-profile-directory](../../../../realization/packages/model/model-profile-directory/design.md)、[model-request-runtime](../../../../realization/packages/model/model-request-runtime/design.md)、[modality-projection](../../../../realization/packages/model/modality-projection/design.md)、[core/model-profile](../../../../realization/packages/core/model-profile/design.md)、[core/model-response](../../../../realization/packages/core/model-response/design.md)、[core/stream-assembly](../../../../realization/packages/core/stream-assembly/design.md)、[apps/cli](../../../../realization/apps/cli/design.md)、[apps/tenancy-host](../../../../realization/apps/tenancy-host/design.md#本程追加资产治理与模型档案目录的中心侧候选尚未实现)。插件名、服务名、方法名、表名、日志事件名**一律候选**。Cordis 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）。上游语义只引 basis 条目。

### 5.1 插件与服务面

| 单元（包） | provide | 必需 inject | 调用时取用 | 在哪装 | 独立成插件的理由 |
|---|---|---|---|---|---|
| **P-1** `model-profile-directory`（`packages/model/model-profile-directory`） | `modelCatalog`（十个操作里除 `loadManifest` 的九个面，`credentialPresent` ≡ `resolveCredential(present)`）；`serveBaseFaces: true` 时另 provide 下两个键——**只供尚无节点的开发装配** | `storage`、`clock`、`memberships`（OG v1 S-26） | `credentialCustodian`（保管方，无契约无提供者） | 中心：[tenancy-host](../../../../realization/apps/tenancy-host/design.md#本程追加资产治理与模型档案目录的中心侧候选尚未实现)，`serveBaseFaces: false` | 住在中心、写面带管理授权、变化原因与消费者与运行时不同（D-039 拆分 A/A/A） |
| **P-1r** `model-catalog-read`（同包） | `modelCatalogRead`（`readProfile`、`listProfiles`、`credentialPresent`）、`credentialLookup`（**只有** `value(tenant, origin)`） | `storage`（只读副本）、`centerConnection`（无契约无节点） | `credentialCustodian`（据点凭据副本经它落地与读取，M47） | 据点：cli | 同两个服务键在据点的另一个提供者；一个 Context 里这两个键只有一个提供者 |
| **P-2** `model-request-runtime`（`packages/model/model-request-runtime`） | `modelRuntime`（十三个操作） | `modelCatalogRead`、`credentialLookup`、`sessionLog`（块 D，无契约）、`storage`、`clock` | `assemblyManifest`（求值结果、两个时限；无契约）、`sessionTenancy`（发起租户，无契约，M66） | 据点：cli | 调用、选择与切换同在据点；**一次调用是宿主上的一个 effect，不是 fiber**；传输适配是构造参数级的内部依赖 |
| **P-5** `model-default-retry`（同 P-2 的包） | —（向 runner 登记默认重试件） | `loopExtensionImplementations` | — | 据点：cli | 零依赖的系统自带件；它换代只让 runner 那一格由指定挂件顶上 |
| **P-3** `modality-projection`（`packages/model/modality-projection`） | `converterRegistry`（`convert`、`lookupConverter`）、`converterAssembly`（受限：`declareConverters`、`attachImplementation`） | **无** | — | 据点：cli | 持有部署级登记表，不挂在任何会话级依赖上（M68） |
| 贡献者 `modality-conversion-builtin`（同包，零状态） | —（向 runner 登记模态转换那一件） | `loopExtensionImplementations`、`converterRegistry` | runner 的执行环境句柄读面（经已 inject 的登记面） | 据点：cli | loop 侧换代只让它重跑，登记表、声明、挂上的实现不动（M68） |
| 声明者 `converter-declarer`（同包） | —（交整份声明） | `converterAssembly` | — | 据点：cli，`declaration` 由装配交入 | 运行中换声明只让它重跑，P-3 的表原地整份替换、不经过「答不出」 |
| P-4\* × k（每件一个插件，由装配加载，**不是 P-3 的子**） | —（按 `converterRef` 挂上实现） | `converterAssembly` | — | 据点：cli | 各自独立资源，一件挂了不连带别的键 |
| 纯模块 `core/model-profile`、`core/model-response`、`core/stream-assembly`；`model/modality-projection` 的纯函数 | 无（`import`） | 无 | — | 包依赖 | 契约没有操作或只是纯计算：不是插件 |

- **配置错误一个政策**：config 缺项或不合形状 ⇒ 内核让 fiber `FAILED`、什么都不 provide ⇒ 装配启动失败（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）。P-2 的 `statusCauseTable` 与脱敏三参数没有值 ⇒ **P-2 不启动**；P-5 的 `defaultRetryBackoff` 缺席用候选默认、不合形状仍启动失败；P-1 的 `factoryCredentialRef` 缺席**不是**配置错误（出厂格「没配」）；声明者 `declaration` 缺席 ⇒ 启动失败，空的一组合法。
- **官方清单只经插件体装入**：`loadManifest` 不在任何服务面上；`invalidInput`／`unavailable` ⇒ 抛出 ⇒ 启动失败、整份不装；**`manifestNotNewer` ⇒ 不抛，记 error 级日志事件 `model_profile.manifest_not_newer`、照常 provide**。插件体重跑时同一份清单再装一次是幂等的。
- **静态检查（义务，规则未写）**：`credentialLookup` 只许 `packages/model/model-request-runtime` 的「发出」模块解析；读面返回类型与 P-1r 副本表不含凭据值与引用；锚点写只经调用方交来的追加口；`converterAssembly` 只给声明者与转换件包；`convert` 只许模态转换那一件调；转换件包不得够到 `modelRuntime`（MPD-N4、MP-N4）。

### 5.2 inject 边与换代时收掉什么

`inject` = 提供者换代或不可用我就卸载重跑，没有可选形式（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)）。**本装配运行期不换代**：换任何提供者走排空重启，下表只在排空重启与缺席时发生。

| 边 | 换代或撤除时收掉什么 |
|---|---|
| P-2 → `modelCatalogRead`／`credentialLookup`／`sessionLog`／`storage`／`clock` | P-2 重跑：每次在途调用按 `mrr#S-36` 末条结算（在途的流 `abandon`、`interrupted{run_cancelled}`、账如实、释放）；inject `modelRuntime` 的 agent runtime 随之重跑；日志已撤而写不进的结算**不补写**，由下一次对账追补。**凭据值轮换不触发**（值是每次现取的数据） |
| P-2 ⇢ `assemblyManifest`、`sessionTenancy` | 不重跑；缺席或读不到 ⇒ 依赖它的操作 `unavailable`，不以「没有租户」或别的租户取凭据、记账 |
| P-1 → `storage`／`clock`／`memberships` | P-1 重跑；**没有在途事实要收**（每个写操作单次提交）；清单重装幂等 |
| P-1r → `storage`、`centerConnection` | P-1r 重跑，连带 P-2 与全部 agent runtime——**所以 P-1r 恰一个实例，断线在实例内部重连、不以换代表达**；`centerConnection` 的提供者同样不得以换代表达断线（C-4 的要求） |
| P-5 → `loopExtensionImplementations` | P-5 重跑、重新登记；其间 runner 由指定挂件顶上（一律不重试） |
| 贡献者 → `loopExtensionImplementations`／`converterRegistry` | 贡献者重跑、重新登记；P-3、登记表、声明、实现不动 |
| 声明者、P-4\* → `converterAssembly` | 声明者再交当前那一份；P-4\* 重新挂上，其间那个引用 ⇒ `converterFailed`（不是 `noConverter`）；P-3 自己被重载时表随实例没了、其间答不出 |

**有意不设的边**：P-2 不 inject runner（成环）、模态投影（纯函数）、传输、保管方；P-5 不 inject P-2；P-3 不 inject 声明者与 runner；P-4\* 与 `modelRuntime` 之间没有边。

### 5.3 effect 装卸配对

| 装载 | 撤除 |
|---|---|
| P-2 一个 effect：传输适配与连接池、在途表（**合成一个**：同一 fiber 的 effect 撤除并发驱动，basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)） | 次序写死：置「停止中」→ 逐个结算在途调用（中止 → `abandon` → `interrupted{run_cancelled}` 或调用终结 → 释放）→ 关连接池；每一步自己记 error 级日志，写不进的留给对账 |
| 每次调用在**宿主**上一个 effect（出门前检查通过、进 `open` 时登记；含两个时限计时器、装配状态、中止句柄） | 宿主撤除 ⇒ `mrr#S-36` 的结算；正常收场 ⇒ 提前撤除（**依赖假设 H-1**：`ctx.effect` 的撤除函数可提前单独调用，无 probe，MRR-N5）；已在 `reply_pending` 的只写无回复的 `interrupted{run_cancelled}` |
| `ctx.provide('modelRuntime')` | 服务消失；已开始的方法调用跑完，靠「停止中」标记在下一个提交步骤前停（入口与写「已出门」、调 `send` 之前各查一次）——内核不取消在途调用 |
| P-1：清单装入（**持久写，不是 effect**，`provide` 之前）；provide `modelCatalog` | 撤除什么都不做：行、序号、处置、绑定留在存储里 |
| P-1r：副本表、两个键；经保管方写下的凭据副本 | 只停止副本刷新；凭据副本随登录状态清除、不随 P-1r 撤除清除 |
| P-5、贡献者：向 runner 登记（注销函数包进 `ctx.effect`） | 注销；正在求值的那一次跑完，runner 按「实现在求值中途被撤下」记报错 |
| 声明者：交一份声明（**不是 effect**） | 什么都不做——撤回声明会让表回到「无」，那是有意的装配动作 |
| P-4\*：挂上实现（撤下函数包进 `ctx.effect`） | 撤下；它已开始的那一次转换跑完、照常校验；写进存储的派生字节不回收 |

**没有定时器承担正确性**：退避计时归 loop；两个时限计时器随调用 effect 清。

### 5.4 事件：派发模式与过滤

| 事件 | 发出者与派发 | 载荷 | 监听者与约束 |
|---|---|---|---|
| `profile.withdrawn`（`mpd#S-21`） | P-1，`emit`、**不带 `thisArg`**；只在 `listed → withdrawn` 的提交**之后**；恢复在册不发 | 被撤回那条的 `ModelProfileRef` | **本版没有监听者**。必发不必达；发送方包住监听者异常（basis [`emit-listener-throw-propagates`](../../../../basis/cordis/emit-listener-throw-propagates.md)）；正确性不靠它（每道准入现读）。不带 `thisArg` 的可见范围是**假设 H-7**（按保守读法：中心进程里任何监听者都看得到全部租户的撤回；MPD-N6，第一个监听者接上之前必须补 probe）；**跨进程转发到据点时必须按目标据点会话的范围链过滤**（`mpd` G-7 闭合条件），本版不转发 |
| P-2、P-3、P-5、贡献者、声明者、P-4\* | **不发、也不监听任何 Cordis 事件**（`mrr#S-37`、`mp#S-25`）；中断、再发、放手、否决全是直接调用；P-2 本版不消费会话日志的追加通知 | — | **没有控制类事件，不用 `bail`**（basis [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md)） |
| 观察者推送（回复的快照与增量） | P-2 经宿主随 `openCall` 交来的观察者端口推，**不是 Cordis 事件** | 会话、目标 | 按（会话, 目标）路由、只推本会话的观察者；门面登记观察者时核连接身份对会话的归属。端口形状无契约（MRR-N6） |
| 结构化日志事件 `model_call.increment_rejected`（error 级）、`model_call.event_after_finish`（info 级）、`model_profile.manifest_not_newer`（error 级） | 进 JSONL 运行日志，**不是 Cordis 事件、不进会话日志** | 标识与被拒的值，不带内容与凭据 | 不用 warn：缺省只导出到 info（basis [`logger-level-order-error-lowest`](../../../../basis/cordis/logger-level-order-error-lowest.md)） |

**不用 `isolate`、不用 `intercept`**：租户、会话、范围之间差的是数据，不是实现（basis [`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md)）；登记表是部署范围的，这是契约的有意设计。

### 5.5 存储要求与跨 owner 的共同存储对象

- **中心（P-1）**，由 [tenancy-host](../../../../realization/apps/tenancy-host/design.md#本程追加资产治理与模型档案目录的中心侧候选尚未实现) 合成迁移片段 `modelProfileDirectoryMigrations`：R-1 单次提交原子；R-2 `model_profile` 上（范围键, 路由名）唯一、已撤回也占名、**范围键不得含空值**（出厂格要有非空键值）；R-3 撤回、恢复、修订 `lockRow` 那一行；R-4 `model_manifest_state` 单行，装入时 `lockRow`；R-5 `model_credential_binding` 以租户为主键、引用列不出任何读面；R-6 列表一次只读事务同一快照；R-7 跨重启仍在；R-8 `StorageUnavailable` ⇒ `unavailable`。`registerProfile` 撞名后同一事务重读依 `core/storage` P-2，**pg 上由 storage-sql 承接**（保存点）。**没有跨 owner 的同一提交**：成员资格现读不在写入提交里。P-1 与资产提供者、OG 解析到同一个 `storage`。
- **据点（P-2）对会话日志提供者的要求**（**无契约、无节点**，MRR-N1／cli C-1）：L-1 追加以确认落盘为返回；L-2 响应体按（会话, `ResponseId`）唯一、冲突可识别；L-3 多条目原子追加且可带「这个 `ResponseId` 还没有响应体」的前置；L-4 尝试栅栏在写入边界判（同一事务锁定读尝试行），结算类记录不设栅栏、照写带 `late`；L-5 读到的尾是已确认的最新位置、读不到可识别不返回空；L-6 锚点与终结记录的唯一键：「已出门」「已开口」按（会话, `callId`, 发出序号），「中断意图」「调用终结」按（会话, `callId`）；L-7 会话内日志位置可比单调；L-8 五种记录作为不是消息的记录条目存下，条目壳带会话、运行、尝试与租户。
- **据点（P-2）对存储的要求**：R-1 投影缓存表 `model_projection_cache`（主键会话；无 transcript 的模态集合、水位、所追日志的标识），唯一写入者 P-2，只在新水位更大时更新；R-2 日志标识对不上即整行作废、从日志头重算；R-3 缓存读不到就从日志头重算，不说成「投影为空」。**缓存不是权威。**P-1r 的副本表 `model_catalog_replica` 单写者、按中心提交序单调更新（R-9，序号来源在入口 v2，本版落不了）；**凭据副本不进这张表**。
- **三条跨 owner 的交错与共同存储对象**（P-2 与 loop 对同一次发出的并发写；进程内锁、时间谓词、没落盘的标记都挡不住）：X-1 宿主停止的撤除写 ‖ loop 把回复与响应体一次写下 ⇒ 共同对象 L-2（后到者被拒；loop 那一支整批不落，回复不成为消息）；X-2 旧尝试写「已出门」‖ 新尝试推进并对账 ⇒ L-4（锁定读尝试行）；X-3 不属于运行的调用、旧实例 ‖ 新实例续接 ⇒ L-6。**三条在形式模型里被吸收，证据只能是真并发演练 C-1～C-3，受阻于会话日志提供者。**
- **`selectModel` 的判定与写入不在同一提交**是契约有意接受的窗口，不需要共同对象。

### 5.6 装配草图

```text
中心（apps/tenancy-host，候选追加）
  storage-sql → clock → … → OG（v1 服务名供 P-1）→ AR → asset-governance
  → P-1 model-profile-directory   inject storage, clock, memberships
       config { officialManifest: 随本应用发布的数据（序号＋条目）,
                factoryCredentialRef: OMNE_TENANCY_MODEL_FACTORY_CREDENTIAL_REF（可缺；只是引用）,
                serveBaseFaces: false（常量） }
       插件体：loadManifest(officialManifest) → provide modelCatalog
  → 运维面 → 入口层（v1 路由表封闭：本版进程外没有路到 modelCatalog，U-6）
  撤除：入口层 → 运维面 → P-1 → 资产提供者 → AR → OG → … → clock → storage

据点（apps/cli，产品清单——今天装不起来）
  storage-sql → clock → [sessionLog] → [assemblyManifest] → [evaluationInputs] → [credentialCustodian]
  → [附件字节存储] → [centerConnection] → [sessionTenancy] → [executionEnvironments] → [runAttemptFacts] → [dependencyPresence]
  → …工具侧（见 PF-006 投影）… → loop-extension-runner
  → P-3 modality-projection → modality-conversion-builtin → converter-declarer { declaration } → P-4* × k
  → P-5 model-default-retry { defaultRetryBackoff = [1000, 2000, 4000] ms（候选默认） } → hooks-compat → asset-registry
  → P-1r model-catalog-read → P-2 model-request-runtime { transport, statusCauseTable, 脱敏三参数 }
  → [agent loop 与 agent runtime] → 门面 → 本机 socket 开闸（声明者 ACTIVE 之后才开闸）
  同步读 fiber.state：PENDING ⇒ 清单错误 ⇒ 逆序撤已装的 ⇒ 启动失败；任一 FAILED 同样
  撤除：应用显式按 P-2 → 执行宿主 → 桥本体 → 派发器依次 await，storage、clock 随根最后走
       （依赖假设「await 一条 fiber 的撤除会等到 async disposer 结算完」，cli C-11）
  方括号 = 承接者不存在 ⇒ P-2、P-1r、runner 停在 PENDING，连带 P-3 以外的登记者
```

**验收装配**（只在 `apps/cli` 测试代码里，同一个 `boot`、同一个顺序，方括号换成替身；**不是产品装配、不是第三个应用**；替身只回放所顶契约允许的序列、行为不进任何 `bindings`、真承接者一立即删）。与模型一侧有关的替身：

| 替身 | 顶的是谁 | 真承接者（闭合条件） |
|---|---|---|
| 会话日志（落在真实 JSONL 文件上） | `sessionLog`：L-1～L-8 的回放 | 会话日志契约与提供者（C-1） |
| 装配清单 | `assemblyManifest`：固定一份清单 | PF-004 契约（C-2）；**「用哪个模型」允许集合 `A` 仍受 `mrr` G-19 阻断，替身不能自造这一项** |
| 中心事实副本与到中心的连接 | `evaluationInputs`、`centerConnection`（按脚本模拟断线重连、不以换代表达） | 入口组合 v2（C-3、C-4） |
| 会话持有租户读面 | `sessionTenancy`（只答测试种子） | PF-015 那一程（C-13） |
| 凭据保管方 | 模型凭据的解引用（给测试凭据，值不进任何输出） | `infra/secrets`（C-5） |
| agent loop 驱动 | 调 `openCall`、交回复收口、调 `reconcile` 的那一方 | PF-012 那一程（C-8） |
| 脚本化传输 | P-2 的传输适配（构造参数级接口） | 不需要：产品装配用 pi-ai 定向 fork（MRR-N4） |

## 6. 绑定与证据状态

| 契约条款 | 证据 | 前提 | 状态 |
|---|---|---|---|
| `mrr#S-15`、`#S-17`、`#S-22`、`#S-30`、`#S-31`、`#S-33` | `formal:model-request-runtime-v1-invocation`（[节点 bindings](../../../../realization/packages/model/model-request-runtime/bindings.yaml) 六条）；六份否定配置各出预期反例 | 常量 2 家、允许回退、至多 3 次发出、至多 2 次停机；模型只有一次调用、不含 loop 与拓展件；「写下」是原子动作——追加口原子、按 `ResponseId` 幂等、确认即落盘由会话日志提供者承担，模型不检查 | run [`2026-09-25-formal-assets-runtimes`](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md)：退出 0、无反例，15,802 个不同状态。**契约层证据，不证实现** |
| 同上，不允许回退的常量 | `model-request-runtime-v1-invocation-no-fallback` | 否定配置只在允许回退的常量下演示过 | 同一 run，退出 0；**不绑** |
| 被吸收的四条（`mrr#S-22` 第 2、5 条、续接同一家、`#S-28` ④）、正向十条、进展 `SentEventuallySettled` | — | 按构造成立或未证明能失败 | **不作证据**；证据形式是规范场景 |
| `sa#S-6`、`#S-27`（到达装配块次序、一次到达装配等于一次性到达；回复侧同样依赖） | `formal:stream-assembly-v1-assembly`（[core/stream-assembly bindings](../../../../realization/packages/core/stream-assembly/bindings.yaml) 两条） | 有效性前提：三份变异配置给得出反例 | 主 run 同上（退出 0，826,411 个不同状态）；有效性 run [`2026-09-25-validity-stream-assembly`](../../../../record/evidence/2026-09-25-validity-stream-assembly/README.md)（三份全部退出 12） |
| 响应体用量与费用金额无损（`core/model-response` 经 content-blocks 的无损读写，D-040 §八 M36） | 运行时前提取证：Node ≥ 24.18.0 的 `context.source` 与 `JSON.rawJSON` | 只证运行时 API 可用，不证实现 | run [`2026-09-25-node24-json-probe`](../../../../record/evidence/2026-09-25-node24-json-probe/README.md)（M49）；**不是绑定** |
| `mpd` 全部、`mp` 全部、`mpf`、`resp`、`ca`、`msg`（模型侧部分） | — | 契约不选用形式工件或没有登记的 formal task | [MPD](../../../../realization/packages/model/model-profile-directory/bindings.yaml)、[MP](../../../../realization/packages/model/modality-projection/bindings.yaml)、[core/model-profile](../../../../realization/packages/core/model-profile/bindings.yaml)、[core/model-response](../../../../realization/packages/core/model-response/bindings.yaml) 的 bindings **都是空表** |
| `mrr#S-41`～`#S-48`、`#S-52`；`mpd#S-25`～`#S-30`；`mp#S-30`～`#S-37`；三条真并发 C-1～C-3；传输适配十一条符合性；静态检查；cli 与 tenancy-host 的装配义务 | 各节点 verification | — | **全部未开始**：没有任何源码。cli 与 tenancy-host 本程追加部分 **0 条绑定** |

## 7. 未决项与已回询项

**缺口不填默认值。**下列各项在裁决前，实施者按最后一列办；不据一个看起来合理的猜测推进。

### 7.1 契约缺口（仍开着的）

| 编号 | 什么没定 | 谁能定 | 在裁决前实施者该怎么办 |
|---|---|---|---|
| **`mrr` G-19** | 「用哪个模型」允许集合 `A` 由哪份契约产出、是设置还是权限、锁与 `A` 的关系 | PF-002／PF-004 owner ＋ `aev`；已列入待产品负责人裁（账本 ④） | `A` 读不到 ⇒ `legalTargets`／`displayList`／`effectiveModel`／`openCall` 恒 `unavailable`；**不当空集、不当全集、不以链上全部名字代替**；替身不得自造这一项 |
| `mrr` G-5 | `status_cause_table` 的内容（含 402、403 归哪个成因） | 提供者设计（据 OpenRouter 取证）；有产品含义的报主线 | 不放默认；表缺即 P-2 不启动 |
| `mrr` G-6（＝ `resp` G-5） | 脱敏三参数的取值 | 提供者设计 ＋ 安全评审 | 不放默认；缺即 P-2 不启动；`mrr#S-46` 受阻 |
| `mrr` G-8 | 默认重试件的退避值 | 产品负责人；拓展件那一类的正文契约 | 按节点候选默认 `[1000, 2000, 4000]` ms 装 P-5，**数值未确认**（账本 ⑨） |
| `mrr` G-9 | 两个时限设置项的声明与默认值 | PF-002 owner | 取不到 ⇒ 这一次 `unavailable`；不以「不设上限」代替 |
| `mrr` G-10 | 传输适配十一条里依赖研究假设的第 1、2、4、5、7 条 | 提供者设计 | 升 basis（带 probe）之前不据研究推导上游行为 |
| `mrr` G-11 | loop 与会话生命周期的三项义务：用户取消时先 `interrupt(run_cancelled)` 再停；交回的回复在结束这一步之前收口；会话重新承载后先 `reconcile` | loop 那一程与会话生命周期（主线） | 本能力的兜底照 4.10、4.11 写；验收装配的 loop 驱动替身按这三项走 |
| `mrr` G-12（＝ `mpd` G-7） | 中心 ↔ 据点的线上形状、新鲜度上界与单调读、秘密送到据点与轮换传播、`profile.withdrawn` 转发按范围链过滤 | 架构（入口组合 v2） | 产品装配里这几行是「协议给」且**受阻**；`serveBaseFaces: true` 只供开发装配 |
| `mrr` G-17 | 从 `resumable` 放手时上交条目带什么 | loop（上交条目形状归 PF-011）；产品语义疑问报 PF-013 owner | `released` 不带 `cause` |
| `mpd` G-9 | 发布序号由谁、怎样给出；发布动作的鉴别 | 架构／运维（发布流程） | 单一来源「随本应用发布、启动时交入」；序号不更新 ⇒ 照常服务、一条 error 事件（tenancy-host U-8） |
| `mp` G-6 | 附件存储未定义：以 `tenant` 读写引用所指字节由谁判；被否决消息的派生字节留多久 | PF-006 owner（同 `data.content-blocks` G-1） | 引用形状的块一律 `converterFailed`；不存在「不经判定就读」的路径 |
| `mp` G-8 | 「从日志算一个投影」的通用协议 | PF-015 owner 与架构 | 本投影的折叠式与可分解律照用 |
| `mpf` G-2 | `ProviderName` 的词法 | 传输适配层 | 只做非空与逐码点相等 |
| `mpf` G-8 | 一次请求的覆盖能否去掉档案上的某一项 | `mrr` 与 `le` 协同 | 覆盖只逐项替换，不提供「去掉」 |
| `mpf` G-9 | `extra` 里出现与统一项同义的上游拼法时的收场 | `mrr` | 不猜收场，遇到即报缺陷 |
| `mpf` G-10 | 会话的「默认主模型 ＋ 可选路由模型组」 | 产品负责人（先立词条） | 本版不为「一组」立形状 |
| `resp` G-3 | 条目壳（会话、Run、尝试、租户、效力）尚无契约；`reply` 与消息落一条还是两条条目 | loop 那一程 | 归属一律读条目壳；两处内容是同一个 JSON 值、不得各自改 |
| `resp` G-4 | 原始响应留存的保留期 | 产品负责人（PF-002 设置）＋ 主线 | 不设保留期、不清理 |
| `resp` G-8 | 实际执行方与指定的那一家不一致时无成员可记 | 提供者设计 ＋ `mrr` | 先查清上游是否仍可能换家 |
| `resp` G-9 | 可追溯组成的其余部分（系统提示词、上下文视图）的家 | PF-010 组装 ＋ `mrr` | 响应体只兑现档案与参数那一半 |
| `resp` G-10、`ca` G-6 | OpenRouter 真实费用字段、`is_byok`、首 token 前后中断是否计费 | 提供者设计（钉 SDK 时取证） | 拿不到一律 `unknown`，不记零、不估算 |
| `ca` G-12 | 一次发出的账上没有另记发起者，本版取条目壳租户 | 主线 | 照此 |

### 7.2 节点缺口（本程不补、留给下一程的标 M43）

| 编号 | 缺口 | 受阻的 | owner |
|---|---|---|---|
| MRR-N1 ＝ cli C-1（M43） | 会话日志的契约与提供者；L-1～L-8 与三条交错的共同对象没有家 | P-2 全部十三个操作；C-1～C-3 真并发演练 | 主线 → loop 那一程 |
| MRR-N2 ＝ MPD-N1 ＝ cli C-5（M43） | 凭据保管方 `credentialCustodian` 没有契约与提供者 | 中心取值恒 `unavailable`；据点离线如实 `credentialUnavailable`（PF-016「离线用手上那份副本」本版没有兑现） | 主线 → `infra/secrets` |
| MRR-N3 ＝ cli C-2（M43） | 装配清单读面 `assemblyManifest` | 选中初值、层锁、两个时限 | PF-004 契约 owner |
| MRR-N4（M43） | 传输 fork 包没有节点（版本、托管、许可、补丁、状态码取法） | 全部发出；适配层符合性测试 | 主线 → 提供者设计（D-019 实施义务） |
| MRR-N5 ＝ cli C-11 | 假设 H-1（effect 撤除函数可提前调用）无 probe | 一次调用的 effect 写法 | `core/kernel-basis` |
| MRR-N6 | 会话出站流（观察者端口）没有契约 | `mrr#S-51` 第 8、9 条的兑现 | 主线 → 块 D |
| MRR-N7 | 「已开口」在首 token 热路径上多一次耐久写，延迟未测 | 无 | 本节点 |
| MRR-N8 ＝ cli C-6（M43） | 原始响应留存受阻于附件存储未定义 | 原始响应留存（不挡响应体） | 那份契约 owner |
| MRR-N9 | 据点装配要装 `storage` 与 `clock`；条目壳自带时间点时 `clock` 边可去 | P-2 启动 | cli；块 D |
| MRR-N10 ＝ cli C-13（M43） | 发起租户读面 `sessionTenancy` | 取凭据、记账的全部操作 | 主线 → 会话那一程 |
| MRR-N11 ⊂ cli C-8（M43） | `openCall` 的宿主句柄形状（effect 登记、中止信号、「停止中」读面） | 每次调用的撤除与结算 | 主线 → agent loop 那一程 |
| MPD-N2 ＝ cli C-3、C-4（M43） | P-1r 整体受阻：入口 v2、据点副本新鲜度与单调读、秘密送达 | 据点装配的模型请求运行时 | 主线 → 入口组合 v2 |
| MPD-N3 | 迁移片段进中心装配 | P-1 启动 | tenancy-host（本程候选追加已列） |
| MPD-N4、MP-N4 | 静态检查规则未写 | `mpd#S-12`、`mp#S-24`、`#S-26` 的装配给 | 各节点 ＋ `tools/ts-checks` |
| MPD-N5 ＝ tenancy-host U-8 | 发布清单的来源与序号 | `loadManifest` | 装配与发布流程 |
| MPD-N6 ＝ cli C-11 | 假设 H-7（不带 `thisArg` 的派发对谁可见） | 任何将来的 `profile.withdrawn` 监听者 | `core/kernel-basis` |
| MP-N2 | 转换件的能力标识未定型（runner G-3 的一项） | runner 钉不了末位、认不出它 | 本契约 owner |
| MP-N3 | 本版装哪几件转换件、声明写哪几个键 | 空声明合法，但每个语音、图、文件块都原样落盘、永久进投影 | 系统装配（cli）＋ 产品（PF-013 §4 转换件） |
| MP-N5 | 资产注册表对 `lookupConverter` 取用方式 | 资产注册表 | `packages/tools/asset-registry` |
| MP-N6 ⊂ cli C-8（M43） | 「转换产出与原消息同一次落盘」的兑现者（loop、入站受理方）没有契约 | `mp#S-20` ④ | 主线 → loop 与入站受理 |
| runner G-20（经 MP 节点） | 执行环境句柄解析出的租户没有来路 | 闭合前含要转的块的消息全被否决 | runner 契约 owner（会话持有租户读面） |
| cli C-9 | 具名参数的部署取值 | 产品据点清单缺值即启动失败 | 各契约 G 的 owner |
| cli C-11（其余） | `await` 一条 fiber 的撤除会等到 async disposer 结算完；`provide-is-effect-managed` 未升格 | 显式撤除次序的排空演练 | `core/kernel-basis` |
| tenancy-host U-6、U-9 | 中心目录各面本版对外不可达（入口 v1 路由表封闭）；保管方缺席出厂格与租户绑定都换不成值 | 治理中心与 CLI 的全部档案与凭据流程 | 主线：入口 v2；`infra/secrets` |

### 7.3 待产品负责人裁或确认（账本 `tmp/assets-runtimes/pending-user-rulings.md` 编号，只列不裁）

| 账本编号 | 事项 | 在裁决前 |
|---|---|---|
| ④ | 「用哪个模型」允许集合的来源（`mrr` G-19，D-040 §七 M17） | 见 7.1 第一行 |
| ⑨ | 默认重试件退避值（D-040 §八 M67，`mrr` G-8） | 候选默认装上，数值未确认 |
| ⑥ | 回复流收尾的有意不对称：模型侧被系统取消的回复记 `lost`、工具侧记 `interrupted`（D-040 §七 M12） | 按 4.11、4.12 落 |
| 批 4b「PF-013」行 | 档案要不要一把「锁住替换」的锁 | 本版没有；组织锁得住名字、锁不住落到哪一行（4.3 代价） |
| ⑩（告知，不是裁决项） | CLI 本程收不了图、语音、文件（D-040 §八 N-26） | 含要转的块的消息被否决 |
| PF-013 rev 5–12 | 全文待产品负责人通读确认（第 1 节「推导待确认」各行） | 按当前正文实施，改判走新 rev 与新版投影 |
| D-040 §三～§八 | 主线裁定逐条追认 | 按裁定落；改判走契约新版本 |
| G4 ／ G5 | [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md) 契约接受、[D-042](../../../../record/decisions/assets-runtimes-node-acceptance/README.md) 节点接受 | **本投影不是实施入口**；签后出 v2 |

### 7.4 来源问题

1. **成功那一次发出留什么痕，正文两处说法**（[PF-013 decisions §四](../../decisions.md#四已知的来源问题) 第一行；[对象 UL-model-response](../../../../domain_objects/objects.md#ul-model-response--模型响应体) 未裁）：规格按「每次发出恰一条响应体」合一，读法在 PF-013 owner 确认前有效。
2. **§4「压缩只翻『给模型看』那一位」与 PF-009 rev 8 字面相反**：以 PF-009 与规格（`msg#S-27` 不翻位、另带名单）为准；投影因此看块上的位、不看压缩名单（`mp#S-5`）。
3. **转换件既是拓展件的变体，又「本版不是资产」**：按 PF-013 读法——系统自带、按键登记、随系统装配；组织与租户换不了。
4. **词条与对象条目要跟上裁决 33–40**：[UL-model-credential](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential) 索引仍写「组织或租户身上的一项属性」；按 PF-013 正文与 `mpd#S-7`（只有租户）实施。
5. **档案没有「锁住替换」**：见 7.3。
6. **（推导）PF-013 验收 S5b 在本版唯一交付形态下观察不到**：S5b 要求没配凭据的租户调官方档案走出厂格那一把；CLI 据点按 [PF-016 §6.20](../../../PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据)不放那一把（cli 关键选择 4），结果是 `undispatched{credential_unavailable}`。两份产品正文之间的关系没有任何一处写明——**归 PF-013／PF-016 owner**，本投影照契约与装配现状写，不替它们定。
7. **（推导）S10c「列表上看得出选的是 B、这次用的是 A」**：`displayList` 条目只带 `selected`，「这次用的」要由呈现一侧另取 `effectiveModel`（`selectedBy = layer_lock`）；没有一条契约条款把两者合成一处呈现——归 PF-016 的呈现与受理契约（未起草）。

## 8. 实施顺序及每步完成判据

**前提**：G4、G5 签字之前本投影不是实施入口。下列顺序是签字之后的建议；**验收替身与真承接者分开写**——替身让步骤可以验收，不让任何一行「装配给」算承接。判据一律取自性质表或节点 verification；「受阻」写明挡在哪。

| 步骤 | 做什么 | 依赖 | 完成判据 |
|---|---|---|---|
| M-0 | D-041、D-042 签字；出本投影 v2，登 frozen 哈希 | — | catalog 这八份翻 `accepted`；`frozen.json` 有登记；v2 的 `provenance.json` 不再有 `null` 契约哈希 |
| M-1 | 纯模块 `core/model-profile`、`core/model-response`（依赖 `core/content-blocks`、`messages`、`call-accounts`、`loop-extension`、`stream-assembly`——那几份的顺序见 [PF-006 投影](../../../PF-006-tools-and-skills/projection/README.md)） | M-0；上游纯模块 | `mpf` examples 逐条过 `judgeModelProfileDocument`、拒绝值次序回归、Schema 与 spec 逐字节相同；`refMatches` 不跨层；`resp` V-1 全过；`ResponseId`／`SelectedBy`／`CredentialScope`／`ParameterAdjustment` 副本 `$defs` 逐字相同（MR-1）；超出 2^53 的金额读入写出逐字相同（Node ≥ 24.18.0） |
| M-2 | `modality-projection` 的纯函数一半 | M-1 | 性质测试 `mp#S-37` 过（INV-10 的定义半）；`mp#S-31`、`#S-32`、`#S-35` 单元测试过 |
| M-3 | P-3、贡献者、声明者、P-4\* 的接入形状 | M-2；runner 节点（PF-006 投影） | `declareConverters` 整份替换与 `keyTaken` 单元级并发演练过（`mp#S-36` 退而求其次那一支）；三条静态检查写成且有「故意违反即失败」自测（MP-N4）。**受阻**：`mp#S-30`、`#S-33`、`#S-34` 与真并发 `#S-36` 挡在 runner G-20 与会话日志（C-1） |
| M-4 | P-1 中心插件与 tenancy-host 追加段（迁移片段、清单装入、config 三项、`serveBaseFaces: false`、撤除次序） | M-1；OG v1 `memberships`；storage-sql | `mpd#S-25`、`#S-27`（含重启）、`#S-30`（含 `unavailable` 故障注入）场景过；`#S-26` 在 sqlite 与 pg 上各真并发跑一次；`#S-21` 挂会抛出的监听者、撤回照样成立；`#S-28`「有没有」各支过；tenancy-host `assembly.manifest-shape`（同一 `storage`、P-1 在清单里）与 config 政策各支过。**受阻**：`#S-28` 取值支与 `#S-29` 挡在保管方（C-5） |
| M-5 | P-2 与 P-5 | M-1、M-2；传输以脚本化实现注入；`statusCauseTable` 与脱敏三参数由装配交入 | 可立即跑：`sessionTenancy` 单元测试（读不到 ⇒ `unavailable` 且取值问法一次都没调）、离线凭据收场（`undispatched`／`released{cause}`）、P-5 默认退避与覆盖、H-1 probe。**受阻**：`mrr#S-41`～`#S-48`、`#S-52` 与投影追尾性质测试挡在会话日志（C-1）、装配清单（C-2）与 **`mrr` G-19**（每一次 `openCall` 都要读 `A`）；`#S-46` 另挡在 G-5、G-6 的真实取值 |
| M-6 | P-1r | M-4 的读面；保管方与中心连接以替身注入 | 单元测试：保管方缺席且离线 ⇒ `credentialUnavailable`、有副本 ⇒ 照常取值、副本表与读面找不到哨兵串。**受阻**：真实读中心与凭据送达挡在入口 v2（C-4）与保管方（C-5） |
| M-7 | cli 验收装配（七个与模型有关的替身，见 5.6） | M-3～M-6 | 模型链「脚本化传输 → P-2 → 真实 JSONL 日志」不起客户端、不连中心跑通；结构检查：产品清单里没有任何替身、只有 P-2 inject `credentialLookup`、P-4\* 够不着 `modelRuntime`；切断连接替身时 P-2 与 agent runtime 不重跑、在途调用不被放弃。**受阻**：模型链的 `openCall` 同样挡在 `mrr` G-19（替身不能自造 `A`） |
| M-8 | 传输适配（pi-ai 定向 fork）与十一条符合性 | fork 包节点（MRR-N4）；`mrr` G-10 的五条升 basis | 脚本化 HTTP 下十一条逐条断言过（单家、禁回退、无隐藏重试、状态码取自实际响应、不回落环境凭据、不送会话标识、不静默换占位、交回实际执行方与费用、固定 base URL 拒重定向、改值与丢项出网前定下、不逆转写） |
| M-9 | 真承接者到位后收尾：会话日志、装配清单、保管方、入口 v2、`sessionTenancy`、agent loop 逐个替换替身 | C-1～C-5、C-8、C-13 闭合；`mrr` G-19、G-5、G-6、G-9 闭合 | 对应替身删除；真并发 C-1～C-3（X-1～X-3）在真实日志提供者上跑过；`mrr#S-41`～`#S-48`、`#S-52`、`mpd#S-28`、`#S-29`、`mp#S-30`、`#S-33`、`#S-34` 全过；各节点 `bindings` 回填 `test:` 证据并把运行登进 `record/evidence/`，README「实际验证」不再是「无」 |
