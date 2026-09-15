# 独立评审与处置

[提案索引](README.md)

评审：Codex `architecture-reviewer`（只读，gpt-6-astra / xhigh），2026-09-15，对象为 HUB 分支
`design/dsh-core-adoption` 提交 `471e9ae` 的本提案全部文件、相关决定与规格、工具执行候选、
六份研究笔记、模型与五个配置、结果登记和日志；评审员未修改文件、未运行 TLC。评审保留
U-48～U-58，不重开政策选项。原始报告在主检出 `tmp/next-design-prep/review-codex-message-stream.md`。

处置按用户 2026-09-15 的工作风格：每项先过"是否过度设计"筛，再由作者从顶层建模视角决定
（[README 作者裁决](README.md#作者裁决评审后2026-09-15)），正文与模型在同一分支的后续提交
改完；评审引出的两个决定点（L、M）也由作者裁决，理由在同一表。复核待派发。

## 阻断项

| 编号 | 发现 | 初判 | 处置 |
|---|---|---|---|
| B1 | 同一提交可产生多条共享域序号的事实（MS-01 的 taken + created + step.opened 同批），但游标与 `sent` 水位被定义为"已见最大序号"；事实队列只剩一个位置时推第一帧就把水位推到 `n`，同批余下两帧被永久跳过；客户端在同批第一帧后断线同样丢帧；MS-12 把"序号缺口"判为服务端错误也不成立 | 成立。模型每提交一条事实、`BufferOrdered` 严格递增，正好排除了正文允许的同批多帧 | 已修（R1）：信封加 `batch{index, count}`，水位与游标只在整批之后推进、可停在批内（[envelope-and-cursor.md §1/§4/§5](envelope-and-cursor.md#1-信封)）；乱序判据改为 `(seq, index)` 字典序、同批连续、`seq` 可跳号（§6）；模型每次提交 1～2 条事实共享序号，`CursorComplete` 按批陈述，新增 `AtMostOnePartial`，`DeliverOnce` 允许重连后重发半批（[evidence](evidence/README.md)） |
| B2 | 补齐依赖的完整前缀未闭合：`changes(to: now)` 没有"投影已完整处理到哪"的水位就可能虚推 `sent`；`stream.opened{cursor: now}` 在补齐前发出、客户端据此保存游标会跳过未补齐事实；`resync: full` 的同步切不约束随后多页历史与其他读面；投影不可用期间"只发实时"会重现 `SpecNoFill` 的反例；活跃订阅停住时 `floor` 越过其 `sent` 无处置 | 成立。第 4 点最重：cordis.md 的降级政策与本提案自己的否定变体矛盾 | 已修（R2）：`changes → {batches, completeTo}`，水位永不越过 `completeTo`（模型 `SentWithinProjection`）；`stream.opened{target, resumable}`，全量重取定义安装完成点；投影不可用停发事实帧、发 `stream.gap{owner: session, reason: unavailable}`、水位不动（§5.2、[cordis.md 依赖变化](cordis.md#依赖变化政策)）；`sent.seq < floor` → `stream.closed{resync_required}`（模型 `ForceResync`，`Reconcile` 不再读下界以下）；投影滞后进模型（`pv`、`Project`） |
| B3 | 对象级授权过滤与游标完整性没有共同定义：无权时跳过的帧在事后获权后拿不回来；`baseline` 的各组成项也要经各自权威核对读权 | 成立。HD 提供者设计已有"权限变化使旧游标失效"的先例，本线没有对齐 | 已修（R3，决定点 L 作者裁决）：游标带主体的可见范围版本，版本变化即失效、全量重取；订阅期间变化 → `stream.closed{resync_required}`；基线各项各经权威核对（[scope-and-delivery.md §1–2](scope-and-delivery.md#1-两处核对)、envelope-and-cursor §4）；session 下一版加 `visibilityVersion` 读面 |
| B4 | 派生表不能唯一重建：一事实派生多消息时身份与批内顺序未定义；未取批即撤回的输入没有历史派生路径；辅助 attempt（标题、压缩）会被当普通回复；已验证 `tool_call` 块没有从 `tools.call.proposed` 派生的规则；`AttemptRef` 强制 `StepRef` 对无 Run 的工作不适用 | 成立，四点都是正文缺口 | 已修（R4）：`messageId = (eventId, ordinal)`、`position.ordinal`；`queue.item.*` 从受理起派生历史消息；attempt 记录带 `purpose`，只有 `reply` 派生助手消息；`tools.call.proposed` 派生 `tool_call{validation, raw}`；`AttemptRef.step` 可空（[message-model.md §1–4](message-model.md#1-message-记录)、[delta-protocol.md §1](delta-protocol.md#1-帧)） |
| B5 | 已占位调用在 Session 归档后结算：SE-14 D2 关闭 arrival、不开新 Step，按现派生表永远没有最终结果消息（MS-11 的"恰一次"变零次）；占位形状与工具提案冲突 | 成立。把"结果如何进模型"的规则误用为"结果如何进客户端历史" | 已修（R5）：`tools.call.settled` 一律派生结果消息（位置 = 结算提交）；reminder 只引用；`deferred_receipt` 按工具提案取形（`reason / notice`，不进 `tool_result.value`）（message-model §2/§4，MS-11 改写）；归档后不开新 Run 不变 |
| B6 | `partial / cancelled` 只保留文本与推理：fork 的 `interruptedBlocks()` 过滤掉全部非 text / reasoning 块，已耐久的图片块在结算替换草稿后消失；Message 没有 attempt 结算状态与缺失块描述 | 成立，违反 RD-08 与 CT-04 | 已修（R6）：保留全部完整且已耐久的块，`Message.settlement{status, missing[]}`（message-model §1、[delta-protocol.md §4](delta-protocol.md#4-失败中断与部分内容)）；cordis.md fork 表登记 `interruptedBlocks()` 改写，不再称"原样复用" |
| B7 | 公开增量与私有 replay 共用载荷：`finish.replayState` 携带加密推理原件，fork 的 `push()` 同一 chunk 送累加器、装配器和实时发布，基线又直接带紧凑记录；`argumentsDelta` 是未解析原始参数 | 成立，是映射缺口（无披露证据） | 已修（R7，决定点 M 作者裁决）：MC 提供者的 `toPublic` 纯函数是唯一出口，实时帧、紧凑记录、基线共用；`replayState` 与加密推理只在私有记录与读面；`tool-call-delta{argumentsDelta}` 不流出，公开词表只有 `tool-call-start / end`（delta-protocol §1/§2/§6，新不变式 MS-13，[scope-and-delivery.md §5](scope-and-delivery.md#5-不进客户端流的东西)） |
| B8 | MC 活跃基线与瞬态来源消失没有责任链：插件在 attempt 开始后装载拿不到累加器读操作；MC 来源撤除后订阅还活着、草稿无人收尾；Run epoch 与 fork `revision` 的缺帧检测语义不同 | 成立 | 已修（R8）：MC 读面 `attempts(session) → {items, version}`，插件先读基线再订阅、按版本与 `(attempt, index)` 去重；来源消失由插件发现并对每个活跃 attempt 发 `ended{abandoned, reason: source_lost}`；登记"epoch 只作重基线依据，缺帧检测靠 index 连续 + ended 必达"（[delta-protocol.md §5](delta-protocol.md#5-重连基线)、cordis.md 能力侧与依赖变化表） |

## 非阻断建议

| 编号 | 发现 | 处置 |
|---|---|---|
| N1 | 模型覆盖结论过宽：未建模同批多事件、投影滞后 / 重建、跨页读取、授权变化、按位置拉取；`EndedAfterCommit` 无真实 attempt 身份与"提交后、终止帧前"窗口；`GapMarked` 用永久布尔；`BuffersDrain` 允许订阅关闭；`CursorProgress.cfg` 产生不了"超过容量的待推事实"；两个否定变体各证明一种失败；首稿反例无存档 | 已修：同批多事实与投影滞后进模型；其余按实际检查的子性质改写[证据义务](invariants.md#证据义务)与 [evidence/README](evidence/README.md)，明确未建模项与否定变体的证明范围 |
| N2 | 登记表写 4 worker、安全 8 秒、进展 16 秒；存档日志是 2 worker、安全 22 秒、进展 38 秒、两订阅 3 分 7 秒 | 已修：[session 验证范围](../../../spec/capabilities/session/verification.md) 按存档 `results.json` 改写；模型重做后再按新存档更新 |
| N3 | Cordis required 依赖撤回（插件退出活动）与操作返回 `unavailable`（局部降级）是两种触发，cordis.md 混用；"出站流没有外部效果"应改为"已披露内容不可撤回" | 已修（R9）：[cordis.md 依赖变化政策](cordis.md#依赖变化政策)分两种触发；撤除段改写 |
| N4 | 投影输入不完整；`delivery` 不证明"模型实际接收"；`ended{failed}` 与 `ended{committed, settled: failed}` 不一致；`stream.gap{unavailable}` 未对齐缺口词表；`render.language` 未进形状；MS-12 例外边界；README 仍把 `system_reminder` 呈现列为待定；跨域游标的责任未登记 | 已修（R9）：message-model §5 列完整输入并把"实际送达模态"归 MC 记录；MP-2 措辞；`stream.gap` 词表加 `unavailable`；信封 `render.language`；MS-12 预览例外定边界；README 未决项同步、跨域责任登记 |

## 评审引出的决定点（作者裁决）

| # | 问题（人话） | 裁决 | 排除的形状 |
|---|---|---|---|
| L | 用户中途获得某个对象（比如一个已关闭的请求）的读权，之前被跳过的帧怎么补 | 沿 HD 的先例：权限一变，这个人的游标作废，下次连上做一次全量重取；不做逐帧回填（R3） | 服务端为每个订阅记"跳过了哪些"，获权后补发；多一本账，跨实例要同步 |
| M | 工具调用参数的流式增量（模型还在写参数的半截 JSON）要不要流给客户端 | 不流；只流"开始写调用 / 写完了"两个标记，完整参数随事实帧到（R7） | 按参数键的披露声明裁剪后流：客户端能看到参数逐字出现，代价是裁剪规则要在半截 JSON 上做 |

## 第二轮复核（2026-09-15）

复核：Codex `architecture-reviewer`（只读，gpt-6-astra / xhigh），对象为 `eda8e3b`（比较基线
`471e9ae`）的 R1～R9 处置与模型第二稿。B1～B8 的闭合判定：B1、B3、B6 已闭合，B2、B4、B5、
B7、B8 部分闭合，余项即下表；处置按[第二轮作者裁决](README.md#第二轮复核后2026-09-15)。

| 编号 | 发现 | 初判 | 处置 |
|---|---|---|---|
| B-新1 | §5.1 `from = cursor + 1` 再取开区间，紧接游标的那批被跳过；客户端在批末帧就存游标，正文按位置另拉，中间崩溃则正文永远拉不到 | 成立 | 已修（R10）：区间 `(cursor, completeTo]`；游标在整批安装完成（含正文）后才推进；[envelope-and-cursor.md §4 / §5.1](envelope-and-cursor.md#4-客户端游标决定-g) |
| B-新2 | 全量重取的"各读面重取"没有共同 as-of；多页历史的可变派生字段时刻不一 | 成立 | 已修（R11）：projection 单一读面 `snapshot → {asOf, …}`，全部视图同一 fold 水位；客户端终止失败的安装；§5 第 3 条、cordis.md |
| B-新3 | 同批两事实各派生消息位置相同；无效提议没有耐久来源（tools 返回 `invalid_proposal` 不登记 proposed）；`purpose` 只在结算时过滤，实时帧会先冒充回复 | 成立 | 已修（R12）：`position.index`；被拒调用由 attempt 结算记录 + `run.step.settled{invalid_proposal}` 派生；`started{purpose}`；[message-model.md §1/§2/§4](message-model.md#1-message-记录)、[delta-protocol.md §1](delta-protocol.md#1-帧) |
| B-新4 | `deferred_receipt.reason` 与工具提案两份词表；reminder 引用规则误及 `hook_context` / `system_notice` | 成立 | 已修（R13）：词表只保留工具提案一份（含新增 `foreground_pending`）；reminder 分引用类与正文类；message-model §2/§4、MS-11 |
| B-新5 | `block-end{block}` 可带完整参数；过滤后公开计数未定；推理明文 / 摘要在单帧上不可辨 | 成立（映射缺口） | 已修（R14）：`toPublic` 为整段转换：公开计数、tool-call 终止帧无参数、`reasoning-delta{form}` 与按块形态规则；delta-protocol §1、MS-13 |
| B-新6 | `version` 与事件无可比字段、同步切未落实到提供者；代发 abandoned 后来源恢复的帧未处理；代发帧的序号与身份 | 成立 | 已修（R15）：帧带 `pub`、`version = pub`、读面与发布同一互斥；代发后关闭账目、后续帧丢弃；`observer` 与 `source_lost` 进词表；delta-protocol §1/§5、cordis.md、MS-16 |
| 建议 | 截断文本只剩 missing 标记；证据"模型发现"尾部旧结论；MS-03/04/14 把受理与裁决写成同批；requirements.md 未含 PF-013 增量 | 成立 | 已修（R16、R17）：截断块保留前缀；MS-17；evidence 同步；场景按 SE-18 拆分；requirements.md 补增量 |

复核未要求重选 `superseded`、单一登记簿或单一公开出口；跨协调域仍是未决项；两份模型仍是
有限局部证据；MC 提供者、adapter、装配、背压、动态装卸、客户端持久化未验证。

## 第三轮复核（2026-09-15）

复核：Claude `architecture-reviewer`（只读，无 shell），对象为 `7793953`（比较基线 `eda8e3b`）
的 R10～R17 处置。B-新1、B-新4、B-新5、R16 / R17 已闭合，B-新2、B-新3、B-新6 部分闭合；
原始报告在主检出 `tmp/next-design-prep/review3-claude-architecture.md`。处置按
[第三轮作者裁决](README.md#第三轮复核后2026-09-15)。

| 编号 | 发现 | 初判 | 处置 |
|---|---|---|---|
| B-阻1 | R11 的单一快照把 `requests` / `calls` 的可见范围裁剪放进了 projection：要么复制 HD-09 的授权语义，要么调用 HD 读面而脱离 `asOf` 水位；`history(session, range)` 也缺 `asOf` | 成立 | 已修（R18）：HD / tools 按 SE-10 把两项注册为 projection 贡献并自带裁剪，projection 只在同一水位调用；`history` 加 `asOf`；cordis.md 能力侧义务与 scope-and-delivery 同步 |
| 非阻断 1 | `position.index` 引 DR-01 作依据，DR-01 没有批内记录顺序的条款 | 成立 | 已修（R19）：改为"DR 下一版登记"，§6 落点表加 DR 行 |
| 非阻断 2 | `run.step.settled{outcome: invalid_proposal}` 在 RD-08 无来源 | 成立 | 已修（工具提案裁决 18）：RD-08 缺口行登记，§6 表加行 |
| 非阻断 3 | `pub` 跨提供者换代无作用域，新提供者的帧会被"丢弃 `pub ≤ version`"吞掉 | 成立 | 已修（R20）：`pub = {gen, n}`，只在同一 `gen` 内比较，`gen` 变化即重读基线 |
| 非阻断 4 | U-49 混合顺序下客户端同时看到摘要块与明文块，正文未说 | 成立 | 已修（R21）：写明两块都保留、`toPublic` 前缀单调所以历史与实时一致、折叠归 UI |
| 非阻断 5～7 | 代发帧去重键可能与 owner 同键；客户端去重不免安装；MS-13 缺 `inbound.arrival.accepted{system_notice}`；事实命名 | 成立 | 已修（R22）：去重键第一段为 issuer；推进规则补一句；MS-13 与词表同步；证据说明声明正文安装不建模 |

## 未覆盖

评审未运行实现、测量背压、重跑形式工具，未验证真实 SSE / HTTP 装配、MC 提供者与 OpenRouter
adapter；传输参数、子 Session 流合并、跨域部署继续属于延后范围。评审不构成接受；处置的
复核由用户派发。
