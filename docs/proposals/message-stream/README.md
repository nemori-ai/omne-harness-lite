---
kind: proposal
id: P-message-stream
status: draft
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
| review.md | 独立评审（由用户派发） | 待派发 |

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

## 决定点（待用户）

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
- `system_reminder` 的客户端呈现：它是"系统对模型说的话"，用户看不看、怎么看，波 2
  在 message-model.md 决定并列决定点。
- 子 Session（PF-004）的帧归属与合并：首版不做，信封预留 `subject` 的父引用位置。
- 传输参数：心跳、批处理、压缩、背压阈值按实现阶段测量定。

## 接受记录

尚未接受。波 3 完成后派发独立评审，处置后由用户裁决决定点 A～K，再决定接受范围、
D-015 与发版批次。
