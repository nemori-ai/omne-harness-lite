---
kind: proposal
id: P-outbound-stream
status: draft
scope: 面向客户端的出站流与通知作用域的职责划分、方向与边界；协议、帧词表与游标编码在实现阶段设计
---

# 出站流与通知作用域：职责、方向与边界

[提案索引](../README.md) · [Session 视图](../../architecture/session.md) · [Run 视图](../../architecture/run.md) · [生命周期组合 v1](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)

2026-09-15 起，本页划定的语义部分（消息模型、增量协议、帧信封与游标、作用域与补齐）由
[消息流提案](../message-stream/README.md)展开（其决定点 I 请用户确认 U-36 的重新定位）；本页
保留为边界与实现阶段问题清单，消息流提案接受后吸收本页。

用户 2026-09-14 裁决（[U-36](../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)）：
通知作用域与出站流协议放到实现阶段设计，现在只划职责、方向与边界。本页就是那张
边界图：它不是规格，不定义帧格式，不批准任何传输选型；实现阶段的设计从这里的
问题清单出发，并沿用 [D-014](../../decisions/D-014-session-run-agent-lifecycles.md)
已定的事实/提示分家、三段式事件命名与去重键。

## 1. 四层职责

| 层 | 拥有者 | 它是什么 | 它不是什么 |
|---|---|---|---|
| 事实 | 各能力的耐久流（[DR v1](../../../spec/capabilities/durable-records/v1/contract.md) 记录模型；session / queue / inbound / run / tools / hd / mc） | 唯一权威；客户端"恢复到同一事实"（[PF-013.C10](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md)）最终靠它 | 不为客户端另存一份"事件历史" |
| 提示 | [admission 提供者](../../../packages/coordination/admission/design.md)的 `records.envelope.committed` 广播（[LC-06](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)） | 进程内、提交后、原样 envelope、按租户与 Session 作用域过滤的一次性铃 | 不是第二种事实，不承诺重放，不跨进程 |
| 投影 | [projection 包](../../../packages/session/projection/design.md)（列表、历史、队列、运行视图、驱动位置）与各能力读面 | 客户端拉取的东西；带水位与 availability | 不做准入，不是权威 |
| 出站流 | 应用装配层（`apps/`）的客户端传输：订阅提示、读投影与瞬态帧、按游标投递 | 把"事实变了"与"正在发生"送到获准客户端 | 不改变任何事实；不是能力语义；不持久化 |

作用域过滤在两处检查：订阅建立时（租户、Session、对象权限）与每帧投递前
（[TL-12](../../../spec/capabilities/tools/v1/contract.md)"投递前再次核对"）。Cordis scope 只做
可见性路由，不做授权；撤销读权结束订阅效用，不隐式中断工作。

## 2. 方向（建议，待实现阶段确认）

- **通知加拉取事实，不做可重放的增量事实流。** 客户端游标是各耐久流的 `(stream, seq)`
  水位集合；收到铃或重连后按水位拉投影与读面补齐。理由：事实已经有权威与水位，再
  造一条"可重放事件流"就是第二份历史（OpenCode V2 `session.next.*` 的路线），而
  DSH `session/event` 加 `agent/assistant-stream`、Claude Code `stream-json` 都是通知型
  （[六系统研究结论 4](../../research/agent-loop-events-and-hooks/README.md#0-结论先行)）。
- **瞬态帧走旁路，不承诺重放。** 模型 chunk（[MC-06](../../../spec/capabilities/model-execution/v1/contract.md)）、
  工具帧（TL-12）、媒体块进度（[CT-04](../../../spec/capabilities/media-content/v1/contract.md)）
  带 attempt / call 身份与 owner 单调序号；断线后用已提交事实（`assistant/message` 等价物、
  调用终态、已耐久内容块）补齐，缺口用 TL-12 的 gap 词表明示。DSH 的
  `start / chunk / end{committed{eventType, seq} | abandoned}`（[frame.ts](../../../packages/agent/loop/src/frame.ts)）
  是这条旁路与事实的接头方式：end 帧携带已提交事实的位置。
- **一个 Session 一条出站流，帧内带对象身份。** Run、调用、attempt 的分流由客户端按
  身份过滤，不按对象开多条连接；多客户端各自游标。
- **媒体只发引用。** 内容沿 CT-04 的读取治理取回；小块内联留给实现阶段按测量决定。

## 3. 边界（不做什么）

出站流不产生事实、不做准入、不承诺瞬态帧重放、不携带永久授权、不替代
[PF-022.C4](../../requirements/product/agent/PF-022-multimodal-response-and-output.md) 的历史取回
路径、不因客户端慢而阻塞工作（背压只作用于瞬态旁路，必需记录的背压归 TL-12）。
流位置不是整个 Session 的序号，也不是存储物理偏移。归档后的读取资格与后台调用
存续归[工具生命周期备忘](../tool-system/v1/session-run-cascade-memo.md)。

## 4. 实现阶段要回答的问题

1. 帧种类的封闭词表：模型 chunk、attempt 结算、工具帧、调用状态、队列/Run/控制变化、
   arrival 裁决结果、审批待答；哪些瞬态、哪些必须能补读。命名沿三段式
   （[U-33](../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)），每帧带去重键（U-34）。
2. 游标编码：Session 日志水位、arrival 序号、工具帧序号如何合并成一个客户端游标；
   重连时如何表达"从哪些水位起补"。
3. 断线重连：恢复到同一已确认事实（PF-013.C10）；gap 语义能否直接复用 TL-12 词表。
4. 与 MC-06 partial 的关系：流中途错误时已流出的前缀在客户端与历史里各是什么状态
   （run-driver 已接受"模型流式前缀不可恢复"）。
5. 通知命名空间（U-5）：租户 / Session / 对象三级作用域的具体键与过滤实现。
6. 传输选型（SSE、WebSocket、JSON 行）与心跳、批处理、背压；入站 SSE 的
   [P0 测量](../core-capabilities/implementation/evidence/p0-sse-probe/README.md)只覆盖 OpenRouter 方向。
7. 子会话与 PF-004：子 agent 的帧如何归属父调用（Claude Code 用 `parent_tool_use_id`）。

## 5. 已有材料

| 类别 | 材料 |
|---|---|
| 已接受契约 | [TL-12](../../../spec/capabilities/tools/v1/contract.md)、[MC-06](../../../spec/capabilities/model-execution/v1/contract.md)、[CT-04](../../../spec/capabilities/media-content/v1/contract.md)、[SE-10](../../../spec/capabilities/session/v1/contract.md)、[RN-07](../../../spec/capabilities/run/v1/contract.md)、[LC-06](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) |
| 候选 | [工具过程帧](../tool-system/v1/frames.md)（生产身份、重复冲突、记录等级、观察游标） |
| 源基线 | DSH `frame.ts` 与 `assistant-stream.ts` 的本地切片（[loop 包](../../../packages/agent/loop/README.md)）；DSH 官方仓库 `c291e79` |
| 需求 | [PF-022.C3/C4/C6](../../requirements/product/agent/PF-022-multimodal-response-and-output.md)、[PF-013.C10](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md)、[PF-003.C2](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md)、[PF-009.C4](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md) |
| 研究 | [六系统循环/事件/hooks](../../research/agent-loop-events-and-hooks/README.md)：DSH `session/event` 通知型、OpenCode `/event` SSE 与 durable `session.next.*`、Codex app-server 通知与 rollout、pi RPC 事件、Claude Code `stream-json` |

实现阶段若需要逐系统的流协议专题研究（帧词汇、游标、重连），上游仓库可按上述固定
提交重新克隆；本页不预先做那份研究。
