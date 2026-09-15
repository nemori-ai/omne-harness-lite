---
kind: proposal
id: P-message-stream
status: accepted
scope: 客户端只认一个消息模型：core-work CD v1 内容块的补齐（reasoning、system_reminder、来源与出处）、模型 attempt 的增量协议、出站帧信封与客户端游标、作用域与投递、断线补齐，以及 Cordis 视角；接受后吸收出站流边界稿，语义分别进 CD / model-execution / session 的下一版或新能力 message-stream v1
---

# 消息流：单一消息模型、增量协议与出站帧

[提案索引](../README.md) · [出站流边界稿](../outbound-stream/README.md) · [工具执行提案](../tool-execution/README.md)（[帧](../tool-execution/frames.md)） · [hooks 兼容提案](../hooks-compat/README.md) · [session v1](../../../spec/capabilities/session/v1/contract.md) · [core-work CD v1](../../../spec/data/core-work/v1/contract.md) · [model-execution v1](../../../spec/capabilities/model-execution/v1/contract.md) · [tools v1](../../../spec/capabilities/tools/v1/contract.md) · [media-content v1](../../../spec/capabilities/media-content/v1/contract.md) · [研究：客户端消息流](../../research/client-message-stream/README.md)

本提案承接 [D-014](../../decisions/D-014-session-run-agent-lifecycles.md)（事实与提示分家、
`records.envelope.committed` 提交后广播、三段式事件名与去重键）和
[出站流边界稿](../outbound-stream/README.md)的四层职责，把用户 2026-09-14 裁决
（[U-36](../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)）留到"实现阶段"
的那部分中**属于语义的部分**现在做掉：客户端看到的消息长什么样、助手消息的流式增量怎样
与已提交事实接头、客户端凭什么游标断线重连后回到同一事实、投递前在哪核对读权。传输
参数（心跳、批处理、压缩）仍留实现阶段。工具帧的事实侧已由
[工具执行提案 frames.md](../tool-execution/frames.md) 定义（用户裁决
[U-42](../tool-execution/README.md#裁决记录2026-09-14用户)：帧耐久、与 Session 日志同域
append-only、帧体带呈现标识），本提案只消费它的读面与词汇，依赖单向。

## 范围

在范围内：

- **耐久消息与内容块模型**：在 [CD-03](../../../spec/data/core-work/v1/contract.md) 的
  `ContentBlock` 上补齐 `reasoning`、`system_reminder`（工具提案已提出）、来源与出处
  `provenance`、`tool_result` 的嵌套内容；定义 `Message` 记录与 Session 历史投影的关系。
- **增量协议**：按 attempt / Step 编号的 `started / chunk / ended` 帧，`ended` 指向已提交
  事实位置；模型 chunk 的耐久紧凑记录与瞬态原始 delta 的等级对应。
- **出站帧信封**：统一命名空间（三段式事实提示、`tools.frame.<kind>`、`model.attempt.<chunk>`、
  `hd.request.*` 卡片投影），每帧带去重键与对象身份。
- **客户端游标**：按协调域的提交序号（各流水位由它派生）的编码、比较与"从哪拉"的
  规则；瞬态帧不入游标，重连以基线取代。
- **作用域与投递**：订阅建立与每帧投递前的租户 / Session / 对象读权核对；一个 Session
  一条流；多客户端各自游标；背压只作用于瞬态旁路。
- **重连补齐**：断线后用哪些已提交事实补齐、缺口如何明示；瞬态帧不承诺重放。
- **Cordis 视角**：哪些是能力（session projection、tools 读面、model-execution 的 attempt
  流、HD 请求投影）、哪些是应用装配层的传输；装载效应与撤除；依赖变化政策。

不在范围内：传输选型的实施细节（SSE 与 WebSocket 的取舍是决定点 A，但心跳、批处理、
压缩参数按测量定）、小块媒体内联阈值、历史分页的存储布局、PF-004 子 Session 的流合并、
hooks 进程输出的转发。

## 文件

| 文件 | 内容 | 状态 |
|---|---|---|
| [requirements.md](requirements.md) | 需求快照与覆盖表 | 波 1 |
| [invariants.md](invariants.md) | 候选性质 MS-1～MS-12、进展性质 MP-1～MP-3 与证据义务 | 波 1 |
| [message-model.md](message-model.md) | `Message` 记录、`ContentBlock` 补齐（`reasoning`、`system_reminder`、`tool_result.value`）、用户消息与附件、从事实派生消息的表、三种投影 | 波 2 |
| [delta-protocol.md](delta-protocol.md) | `model.attempt.started / chunk / ended`、Run `epoch` 作重基线依据、紧凑记录耐久而原始 chunk 瞬态、失败与部分内容、重连基线、`tool_call` 参数增量与 TL-01 的关系 | 波 2 |
| [envelope-and-cursor.md](envelope-and-cursor.md) | 帧信封与词表、每 Session 一条流、按协调域序号的游标、`stream.opened` 基线与补齐算法、缺口帧、与 DSH 对照 | 波 2 |
| [scope-and-delivery.md](scope-and-delivery.md) | 两处核对、撤权、多客户端、背压、不进流的清单、归档与删除 | 波 2 |
| [cordis.md](cordis.md) | 消费方式、能力侧要求（含 MC 提供者设计缺口）、`MessageStreamPlugin` / `omneMessageStream`、装载效应与撤除、依赖变化政策、fork 演化路径 | 波 2 |
| [evidence/README.md](evidence/README.md) | 游标与断线补齐的有限模型（`Cursor.tla`：可丢的铃、订阅水位、分页补齐、瞬态缺口、崩溃）、两个否定变体、形式任务登记与模型发现 | 波 3 |
| [scenarios.md](scenarios.md) | 场景 MS-01～MS-12：正常流式、工具帧交错、后台结算、人类请求卡片、三处断线、背压、丢铃、多客户端与撤权、进程重启、掉出保留期、归档、乱序 | 波 3 |
| [review.md](review.md) | 独立评审（Codex architecture-reviewer，2026-09-15）：8 项阻断、4 项建议、处置记录 | 处置已落地（[作者裁决](#作者裁决评审后2026-09-15)），待评审复核 |

## 与并行线的关系

| 线 | 关系 | 处理 |
|---|---|---|
| [tool-execution](../tool-execution/README.md)（评审已处置、待接受） | 单向：本线消费 [frames.md](../tool-execution/frames.md) 的读面与词汇（`tools.frame.<kind>`、三等级、缺口词表、`{attempt, seq}` 游标、`frames(S)`）、`waiting_human` 视图、`deferred_receipt` 与 `system_reminder` | 引用时标"候选"；接受顺序在其后或同批 |
| [hooks-compat](../hooks-compat/README.md) | `hooks.run.*` 观察事件是否进客户端流是决定点 F；`closed_by_guard` 关闭原因要能呈现 | 同上 |
| [session projection 提供者设计](../../../packages/session/projection/design.md) | 历史与投影读面是本线的拉取侧 | 接受后修订 |
| [PF-004](../../requirements/product/agent/PF-004-subagent-delegation-and-supervision.md) 派发 | 子 Session 的流合并 | 不纳入首版，留接口 |

## 沿用的裁决

| 编号 | 裁决 | 本提案的落点 |
|---|---|---|
| [U-33 / U-34](../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户) | 事件三段式命名；所有事件带去重键 | 帧信封的 `kind` 与 `dedupKey` |
| [U-35](../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户) | envelope 与事件 JSON Schema 实现前设计 | 本提案只定字段含义与位置 |
| [U-36](../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户) | 通知作用域与出站流协议放实现阶段 | 决定点 I：语义部分现在做，传输参数仍留实现 |
| [U-42](../tool-execution/README.md#裁决记录2026-09-14用户) | 工具帧耐久、同域 append-only、帧体带呈现标识 | 客户端游标把 `(frames(S), seq)` 算进水位集合 |
| [U-46](../tool-execution/README.md#裁决记录2026-09-14用户) | 迟到结果以 `system_reminder` 内容块进入到达的 Step | `system_reminder` 进消息模型与客户端呈现 |

## 决定点（用户裁决 2026-09-15）

下表是提交给用户时的原稿；裁决结果与落点见[裁决记录](#裁决记录2026-09-15用户)。

每项先用人话说问题，再给作者建议与理由；"另一边"说明不选建议时的后果。

| # | 问题（人话） | 作者建议 | 为什么 | 另一边 |
|---|---|---|---|---|
| A | 服务器把"正在发生"和"事实变了"推给客户端，用什么管道：SSE（服务器单向推、客户端用普通 HTTP 发命令和拉历史）还是 WebSocket（一条双向长连接什么都走） | SSE 加 HTTP 拉取；控制经现有 API | 我们的方向是"通知加拉取"，推送侧本来就是单向；SSE 过代理、鉴权、断线重连都是普通 HTTP 语义。研究里 DSH 用 WebSocket 复用，是因为它把一元调用、多条逻辑流和事件转发都塞进一条 socket；OpenCode 用 SSE。WebSocket 留到确实需要双向多路复用时 | 选 WebSocket 就要自己定义逻辑流复用、代次与重开规则（DSH 那一套），首版复杂度明显更高 |
| B | 模型的"思考"内容（reasoning）要不要正式进内容块模型 | 进，带可见性策略（谁能看、进不进历史投影） | OpenRouter 的 `reasoning_details` 有明文、摘要、加密三种，加密的必须原样回传才能续推理；不建块就没地方放。DSH、pi、Codex、OpenCode 都有独立的推理块或事件 | 不进则加密推理没有落点，多轮推理只能靠 adapter 私有状态 |
| C | 模型逐 token 的增量，落盘到什么程度 | 折成紧凑记录（连续同块 delta 合并成一条，带首时间和时间差）随 attempt 结算耐久；原始逐 token 帧只在线上瞬态 | DSH 就是这样做的，历史翻页和实时展示用同一份记录重建；OpenCode 明确不落盘 delta、只存整值。紧凑记录既能回放打字效果又不制造每 token 一行 | 只存整值：断线后无法重现中途进度，也拿不到首 token 时间等观测数据；存原始帧：日志膨胀且没有额外价值 |
| D | "事实变了"的提示帧要不要带内容 | 小事实带内容（队列、Run、调用状态的变化），消息正文不带、客户端按位置拉 | 小事实带上就省一次往返；正文可能很大且有媒体引用，按位置拉才能走读权裁剪 | 全带正文：投递前裁剪要在流里做完整内容权限判断；全不带：每个小变化都多一次拉取 |
| E | 一个 Session 一条流，还是一个租户一条流 | Session 一条；租户级的列表变化走另一条轻量流 | 客户端一次只看一个 Session 的正文；DSH 也是 follow 每 Session 一条、control 全 Host 一条 | 租户一条则每帧都要按 Session 过滤且游标要覆盖所有 Session |
| F | hooks 的观察事件（某个 hook 跑了、结果如何）要不要进客户端流 | 不进；工程观测读面另取 | 它们是工程观测（OB-01），不是用户要看的会话内容；进流会让流词表跟着 hooks 变 | 进流则每个 hooks 事件都要定客户端呈现 |
| G | 客户端游标怎么编码，里面装什么 | 不透明字符串，服务端解释；内容是每个协调域一个提交序号（首版只有一个域，就是一个数），不含瞬态位置 | 同一协调域里所有流共享 DR-01 的单调提交序号，一个数就能算出"落后多少"；按流一个水位会随每个调用、每个请求各开一条流而无限增长；客户端不该理解我们有几条流，将来加流或分域不改客户端 | 透明结构则客户端会依赖流的数量与名字；按流的集合则游标大小随对象数增长 |
| H | 断线后补多少 | 按水位差从投影拉，不限条数；超过投影保留期返回"需全量重取" | 事实有权威水位，补齐就是"从你的水位到当前水位"；DSH 的缺口修复也是按区间 | 限条数就要定义"补不完"的中间状态 |
| I | U-36 把出站流整个放到实现阶段；现在要不要把其中的语义部分提前做 | 提前做：消息模型、增量协议、游标、作用域、补齐是语义；传输参数仍留实现 | 工具帧（U-42）、迟到结果（U-46）、hooks 上下文都已经在往消息模型里加东西，没有统一定义会各写一份 | 不提前则工具提案、hooks 提案各自定义的块和帧没有权威落点 |
| J | UI 用来选组件的"呈现标识"词表从哪来 | 以 omne-next 的事件框架标准与网关帧契约的词表为起点（`render_hint` 的 9 值：`plain / markdown / html / terminal / code / log / widget / image / table`，非法组合具名拒绝、未知值可见降级），逐项核对后进契约；不在提案里自造第二套。核对结果见[研究笔记 omne-next §10](../../research/client-message-stream/notes/omne-next.md#10-对本项目的处置清单作者判断非政策) | 用户要求重要特性不丢不漏；旧系统已经踩过"公开面不带内部坐标"等坑 | 自造则要重新发现那些坑 |
| K | 工具帧流 `frames(S)` 归谁登记 | session 下一版登记为 Session 的第四条流（与 session / queue / inbound 同域）；写入者只有执行 owner 经 tools 包 | U-42 已定耐久与 append-only，只剩归属；同域才能和消息提交顺序对齐 | 单独一个协调域则帧与消息的顺序对齐要另做 |

作者已按归属规则自行决定、不需要用户拍板的：消息与内容块模型的权威落点是 core-work CD
下一版（与工具闭环的 CD 改动同批）；帧信封、游标、作用域、补齐是新能力 `message-stream` v1；
attempt 增量协议归 model-execution 下一版还是并入 `message-stream` v1，看波 2 写完后是否只涉及
MC 的字段。

## 裁决记录（2026-09-15，用户）

| 编号 | 决定点 | 裁决 | 落点 |
|---|---|---|---|
| U-48 | A 管道 | SSE 推送加 HTTP 拉取；控制经现有 API | [cordis.md 消费方式](cordis.md#消费方式)、`apps/local-harness` 的 SSE 端点设计 |
| U-49 | B 推理内容 | 推理进内容块模型；加密形态必须耐久，因为下一次模型请求要原样带上才能保证上下文完整、prompt cache 真正命中；出站流不流出加密形态，只流出明文，没有明文时退回摘要 | [message-model.md §2、§5](message-model.md#2-内容块补齐)、[delta-protocol.md §1](delta-protocol.md#1-帧) |
| U-50 | C 增量落盘 | 沿用 DSH 的做法：紧凑记录随 attempt 结算耐久，原始逐 token 帧只在线上瞬态 | [delta-protocol.md §2](delta-protocol.md#2-耐久形式决定-c) |
| U-51 | D 提示帧内容 | 小事实带内容，消息正文不带、客户端按位置拉 | [envelope-and-cursor.md §2](envelope-and-cursor.md#2-帧词表) |
| U-52 | E 流的粒度 | 一个 Session 一条流；租户级列表变化走另一条轻量流 | [envelope-and-cursor.md §3](envelope-and-cursor.md#3-一个-session-一条流) |
| U-53 | F hooks 观察事件 | 不进客户端流 | [scope-and-delivery.md §5](scope-and-delivery.md#5-不进客户端流的东西) |
| U-54 | G 游标 | 按作者建议：不透明字符串，内容是每个协调域一个提交序号，不含瞬态位置；用户保留让架构评审复核的可能 | [envelope-and-cursor.md §4](envelope-and-cursor.md#4-客户端游标决定-g)；评审派发时列为重点 |
| U-55 | H 补齐范围 | 按水位差从投影拉、不限条数；超过保留期返回"需全量重取" | [envelope-and-cursor.md §5](envelope-and-cursor.md#5-重连补齐) |
| U-56 | I 提前做语义部分 | 同意；一般原则：多处通用或共用的协议与契约，设计阶段先定好一版，不留到实现阶段各写各的 | 本提案整体；原则适用于后续所有共用契约 |
| U-57 | J 呈现标识词表 | 首版直接复用 omne-next 的渲染意图词表（九个值与三条规则），不改名不增删 | [envelope-and-cursor.md §1.1](envelope-and-cursor.md#11-呈现标识词表首版用户裁决-u-57) |
| U-58 | K 工具帧流归属 | 归 session 下一版登记为 Session 的第四条流，理由是耐久与回放的职责要统一归属 | [cordis.md 能力侧](cordis.md#能力侧)、session 下一版 |

## 作者裁决（评审后，2026-09-15）

按用户 2026-09-15 确立的工作风格（[U-59](../tool-execution/README.md#裁决记录2026-09-14用户)）：
评审的每项先过"是否过度设计"筛，再从顶层建模视角由作者决定，正文按裁决改；下表是裁决
与理由，没有一项需要用户拍板。原始发现与逐项处置见 [review.md](review.md)。

| # | 问题（人话） | 裁决 | 为什么 | 排除的形状 |
|---|---|---|---|---|
| R1 | 一次提交产生多条事实、游标只有一个序号，半批断线会丢帧（B1） | 帧带"同批第几条 / 共几条"；游标与服务端水位只在整批之后推进；重连后重发可能只收了一半的那一批，客户端按去重键丢掉重复；模型改为每次提交 1～2 条事实 | 游标是"已完整覆盖的前缀"，不是"见过的最大序号"；同批多事实是既定事实（U-34 的去重键正是为此） | 每条事实各占一个序号：改 DR-01 的提交语义，代价远大于帧多两个数字 |
| R2 | 补齐不知道投影处理到哪，可能虚推水位；建立订阅时的游标被客户端存下来会跳帧；投影不可用时"只发实时帧"重现否定变体（B2） | 读面返回完整覆盖水位，水位永不越过它；`stream.opened` 分"目标位置"与"可保存的恢复位置"，全量重取到安装完成点才存游标；投影不可用期间停发事实帧、发缺口标记、水位不动；停住的订阅掉出保留期即 `resync_required` | 补齐的正确性前提是"投影已完整处理到指定提交"，确定性 fold 本身不给这个保证，必须显式返回 | 让出站流自己维护一份事实缓冲兜底：`SpecBuffered` 反例 |
| R3 | 用户中途对某个对象获权，之前被跳过的帧补不回来（B3、决定点 L） | 游标绑定主体的"可见范围版本"，版本一变游标作废，下次连上全量重取；基线各项各经自己的权威核对 | 沿人机决策池"权限变化使旧游标失效"的先例，一份规则两处用（U-56）；逐帧回填要为每个订阅记跳过账本并跨实例同步，为罕见事件付常驻代价 | 逐订阅跳过账本 + 获权后补发 |
| R4 | 派生表不能唯一重建：多消息身份、未取批输入、辅助 attempt、已校验调用（B4） | 消息身份 = 事实编号 + 序数；输入从受理起就派生历史消息，取批只补 Step；按 attempt 的目的分流，只有正式回复派生助手消息；调用提议派生 `tool_call` 块并保留被拒片段；无 Run 的工作允许步骤引用为空 | 派生必须是纯函数且身份稳定，否则重建后认不回同一条消息 | 派生时另发消息号：破坏"重建可认回" |
| R5 | 归档后回来的结果永远没有消息（B5） | 结算事实一律派生结果消息，客户端在结算时就看到；迟到结果提醒只引用它；占位形状以工具提案为准，不塞进 `tool_result` | "结果如何进模型"与"结果如何进客户端历史"是两个时机，此前错把前者当后者 | 归档后开新 Run 只为呈现结果：违反 SE-14 D2 与 U-26 |
| R6 | 中途失败的回复丢掉已经存好的图片（B6） | 保留全部完整且已耐久的块，未完成的记入消息的结算状态与缺失清单；DSH 分支的过滤函数改写并登记为分支演化 | RD-08 与 CT-04 已经要求；"原样复用"在这里不成立就不能再这么写 | 维持只留文本 / 推理 |
| R7 | 私有回放载荷可能经实时帧、紧凑记录、基线流出（B7、决定点 M） | 一个公开投影函数，三处入口共用；回放状态与加密推理只留私有读面；工具参数的半截增量不流出，只流"开始写 / 写完" | 一个出口比三处各自裁剪好验证；半截 JSON 上做披露裁剪既难又没收益 | 按参数键裁剪后流出参数增量 |
| R8 | 模型执行侧的活跃基线与来源消失没有责任链（B8） | MC 提供者给"活跃 attempt 读面"并带版本号，插件先读基线再订阅；来源消失由插件发现并代发"已放弃、来源丢失"；Run 代次只作重基线依据，缺帧靠序号连续加结束帧必达 | 跨消费者的交接责任要在提案里定，不能留给尚未写的提供者设计 | 让 MC 负责通知每个订阅者：MC 不该知道有出站流 |
| R9 | 非阻断建议（N1～N4） | 证据义务收窄到实际检查的子性质；登记数字按存档日志改；依赖撤回与操作不可用分两种触发；投影输入补全、词表对齐、`render.language` 进形状、预览例外定边界、README 状态同步 | 事实性修正 | — |

### 第二轮（复核后，2026-09-15）

复核（[review.md 第二轮](review.md#第二轮复核2026-09-15)）对 `eda8e3b` 给出六项新阻断
B-新1～6 与几条建议；同一风格处置，没有一项是产品取舍。

| # | 问题（人话） | 作者裁决 | 为什么 | 另一边 |
|---|---|---|---|---|
| R10 | 补齐区间差一位；客户端存了游标、还没拉到正文就崩溃，那条消息就丢了（B-新1） | 区间定为"游标之后、水位为止"的左开右闭；游标只在一批**安装完成**（含按位置拉到的正文）后推进，拉不到就不推进、重连后该批重发 | 游标的含义是"到这里为止我什么都有了"，正文没到手就不算有 | 帧里内联正文：大结果进每个订阅的缓冲 |
| R11 | 全量重取从好几个读面各读一次，时刻对不上（B-新2） | 只有一个读面：投影在同一 fold 水位上给出全部派生视图的快照，`asOf` 就是目标位置；安装失败或可见范围在安装中变化，客户端自己重来，服务端无安装状态 | 所有视图本来就是同一批事实的 fold，多读面是把一次切点写成了 N 次 | 给每个读面加 as-of 参数并要求它们能回到任意历史水位 |
| R12 | 同批两条事实各派生消息时位置撞车；被拒的调用没有耐久来源；标题 / 压缩的流会先冒充回复（B-新3） | 位置加事实在提交内的耐久序；被拒调用从 attempt 结算记录（保留原始 tool_call 块）加 Step 结算 `invalid_proposal` 派生，不虚造 proposed；`started` 帧带 `purpose`，客户端只把 `reply` 展开为草稿 | 三处都是"来源在哪"的事实性缺口 | 让 tools 为无效提议也登记 proposed：把非法输入写进工具流 |
| R13 | 占位形状本提案和工具提案各一份；"reminder 只引用结果"扩展到了没有结果的 hook 与系统通知（B-新4） | 占位形状与原因词表只有工具提案一份，本提案按引用；reminder 分引用类（`late_result / human_answer`）与正文类（`hook_context / system_notice`） | 同一概念一份定义 | — |
| R14 | 公开出口没管块终止帧里的完整参数、过滤后的编号、推理明文与摘要混到（B-新5） | `toPublic` 定义为对整段私有序列的确定性转换：公开计数自己分配、tool-call 块终止帧不带参数、推理块形态由第一条公开 delta 决定且有明文不再流摘要 | "纯函数"要说清输入是整段而不是单帧，否则计数与形态都没法定 | 逐帧映射加一张"客户端自行补洞"的规则 |
| R15 | 基线版本和事件没有可比字段；代发"已放弃"之后来源恢复怎么办；代发帧的序号谁的（B-新6） | MC 三种帧带 Session 内发布计数 `pub`，读面 `version` 就是它，读面快照与发布同一互斥；插件代发后把该 attempt 记为已关闭、此后同 attempt 的帧一律丢弃；代发帧标 `observer: message_stream`、`index` = 已见数 | 同步切要有一个能比大小的数；插件只能关自己的账 | 让 MC 通知每个订阅者：MC 不该知道有出站流（R8 已排除） |
| R16 | 截断的文本只剩一条"缺了"，前缀看不见（复核建议 R6） | `missing` 表示"缺失或不完整"：截断块保留前缀作为块内容并记 `truncated` | RD-08 与 MC-06 本来就要求前缀可见 | — |
| R17 | 复核的其余事实性指正（N1/N4 残留） | 证据"模型发现"尾部同步、MS-03/04/14 按 SE-18 拆成受理与裁决两次提交、requirements.md 补消费增量 | 事实性修正 | — |

### 第三轮（复核后，2026-09-15）

第三轮复核（[review.md 第三轮](review.md#第三轮复核2026-09-15)）对 `7793953` 给出一项阻断
B-阻1 与六条非阻断；同一风格处置，没有一项是产品取舍。

| # | 问题（人话） | 作者裁决 | 为什么 | 另一边 |
|---|---|---|---|---|
| R18 | 全量重取的单一快照里，"这个人能看哪些请求、哪些调用"由谁裁剪？投影自己裁就是第二份授权权威，去问 HD 读面又对不上 `asOf`（B-阻1） | HD 与 tools 各按 SE-10 把 `requests` / `calls` 注册为 projection 贡献，裁剪规则写在贡献里、由能力自己维护；projection 只在同一 fold 水位上调用它们。`history(session, range, asOf)` 加 `asOf` | 授权语义只有一份权威（HD-09、SR 读权），时刻只有一个（`asOf`）；另一形状"快照只给引用、各读面按 as-of 补正文"要每个读面都支持 as-of 读，面更大、收益没有 | HD / tools 提供者设计各注册一个贡献；session 下一版读面签名 |
| R19 | `position.index` 说依据是 DR-01，可 DR-01 没承诺批内记录顺序（非阻断 1） | 保留 `index`，改为在 DR 下一版登记"批内记录顺序是 envelope 的一部分、重放稳定"；§6 落点表加 DR 行 | append 顺序本来就是记录的物理事实，缺的只是一句承诺；改用 `(stream, streamSeq)` 排序要重定义历史顺序 | DR 下一版一句 |
| R20 | 提供者换代后 `pub` 从头计，插件按"丢弃 `pub ≤ version`"会吞掉新提供者的帧（非阻断 3） | `pub = {gen, n}`：`gen` 是提供者实例代号，只在同一 `gen` 内比较；收到不同 `gen` 的帧先重读 `attempts` 再判定 | 换代不靠另一条通知，帧自己说明；比"来源变化时重置"少一条依赖 | MC 提供者义务一行 |
| R21 | 摘要先到、明文后到，客户端会同时看到两个块，跟"只流出明文"字面有出入（非阻断 4） | 写明：两块都保留（已流出的帧不撤回），`toPublic` 对私有序列前缀单调，历史与实时一致；摘要块是否折叠归 UI | 协议不撤回帧；折叠是呈现 | — |
| R22 | 代发帧去重键可能与 owner 同键；重发批被去重后客户端还要不要装正文；MS-13 少一条事实；事实名旧（非阻断 5～7） | 去重键第一段为 issuer（owner 或 observer）；去重免呈现不免安装；MS-13 补 `inbound.arrival.accepted{system_notice}`；`run.wait.claimed / released` | 事实性修正 | 证据说明声明正文安装不建模 |

`invalid_proposal` 的来源登记（非阻断 2）在[工具提案裁决 18](../tool-execution/README.md#第三轮作者裁决2026-09-15第三轮架构复核后)。

## 未决项

- 消息 `provenance` 的最小字段集（谁产生、经哪个 Step/attempt、来自哪个工具或 hook）；
  DSH 的 `source.kind` 与 `form` 两轴是起点，[message-model.md §1](message-model.md#1-message-记录)
  的 `Origin` 只取 `kind` 轴；omne-next 的来源靠 `producer_actor`、身份不从内容来
  （[研究笔记 §6](../../research/client-message-stream/notes/omne-next.md#6-系统通知框架drr-005)），
  与 `Origin` 同向。
- `stream.gap{reason: trimmed}` 要不要带"哪一层丢的"子原因：omne-next 的 `truncated.reason`
  7 值（`frame_rejected / rate_merged / frame_too_long / progress_suppressed /
  durable_budget_exhausted / durable_write_failed / block_too_large`）说明只有层次可行动；
  本提案的缺口词表沿[工具提案](../tool-execution/frames.md#缺口词表)，子原因待该词表接受时
  一并定，不在这里另开。
- `ReflowPolicy` 里 `silent` 与 `inform` 的区分（"从未被告知"与"被告知了只是晚一点"）本
  提案没有对应物：迟到结果统一走 `inbound.arrival` 分类与 `system_reminder{late_result}`；
  若产品要求"存而不唤醒"，归 [PF-003](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md)
  的需求变更，不是本线。
- 制品（[PF-015](../../requirements/product/agent/PF-015-artifact-management-and-isolated-working-copies.md)）
  在消息模型里的位置：首版只以 `tool_result.value.content` 的媒体引用出现，客户端按 `mediaId`
  与帧去重（[工具提案制品](../tool-execution/schema.md#制品与呈现去重)，作者裁决 6）；制品对象
  进消息模型随该能力设计再定。
- 子 Session（PF-004）的帧归属与合并：首版不做，信封预留 `subject` 的父引用位置。
- 跨协调域部署前要登记的责任（每域一个序号只给域内顺序）：一致读取切点、域迁移与新增、
  跨域因果接头、历史排序，归 [LC-09](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)
  义务清单；本提案的有限模型只覆盖单域。
- 传输参数：心跳、批处理、压缩、背压阈值、媒体预览阈值按实现阶段测量定。
- 已收束：`system_reminder` 的客户端呈现是历史投影里的系统行（默认折叠与否归 UI），
  [message-model.md §5](message-model.md#5-三种投影)。

## 接受记录

2026-09-15 由 [D-015](../../decisions/D-015-tool-execution-message-stream-and-hooks.md) 接受，与
[工具执行提案](../tool-execution/README.md#接受记录)、[hooks 兼容提案](../hooks-compat/README.md#接受记录)
同一决定、同一批发版。本提案的精确对象：新契约
[message-stream v1](../../../spec/capabilities/message-stream/v1/contract.md)（帧信封与词表、一 Session
一条流、客户端游标、重连补齐与全量重取、作用域与投递、瞬态帧协议；游标模型与场景随版本
目录发布），以及它要求的 [CD v2](../../../spec/data/core-work/v2/contract.md)（`reasoning`、
`system_reminder`、`tool_result.value`、`Origin`）、[session v2](../../../spec/capabilities/session/v2/contract.md)
（历史派生表、`asOf`、`visibilityVersion`、快照贡献）、
[model-execution v2](../../../spec/capabilities/model-execution/v2/contract.md)（`purpose`、缺失块、
瞬态帧与 `pub{gen, n}`、`attempts` 读面）、[durable-records v2](../../../spec/capabilities/durable-records/v2/contract.md)
（批内记录顺序）、[run-driver v3](../../../spec/capabilities/run-driver/v3/contract.md)（`invalid_proposal`）；
[权威落点表](message-model.md#6-权威落点与消费者影响)的每一行都落进上述版本之一。
[出站流边界稿](../outbound-stream/README.md)由本提案吸收。

用户裁决 U-48～U-58 记录在本页；作者裁决 R1～R22 按用户确立的工作风格自定，随决定接受，
用户可另行否决。三轮独立复核（[review.md](review.md)）的阻断项全部闭合；[未决项](#未决项)
各条是接受时明确保留的未完成义务。接受的是目标设计与有限验证工件
（[message-stream 验证范围](../../../spec/capabilities/message-stream/verification.md)）；系统视图见
[消息流](../../architecture/message-stream.md)；message-stream、MC 与 projection 的提供者设计尚未写。
