# 帧信封、客户端游标与断线补齐

[提案索引](README.md) · [消息模型](message-model.md) · [增量协议](delta-protocol.md) · [作用域与投递](scope-and-delivery.md) · [不变式](invariants.md)

出站流是四层职责里的最后一层（[出站流边界稿 §1](../outbound-stream/README.md#1-四层职责)）：
它把"事实变了"与"正在发生"送到获准客户端，不改变事实、不持久化、不做准入。本文件定
帧信封、一个 Session 一条流的复用、客户端游标与断线补齐。

## 1. 信封

```text
Frame = {
  kind: string,                       // 三段式（U-33）；见 §2 的词表
  dedupKey: string,                   // 事实帧 = 事实的 eventId；瞬态帧 = "<owner>:<epoch>:<seq>"；控制帧 = 服务端生成
  subject: { tenant, session, run?, step?, call?, attempt?, request?, input? },
  at: Timestamp,
  position: {domain, seq} | null,     // 事实帧：产生它的提交位置；瞬态/控制帧为 null
  ephemeral: {owner, epoch, seq} | null, // 瞬态帧：owner 内单调序号；事实/控制帧为 null
  render: {kind, version} | null,     // 呈现标识（决定 J）；语义不依赖它
  payload: JsonValue | null,          // 小事实带内容（决定 D）；消息正文不带
  payloadRef: MediaRef | null         // 媒体只发引用（MS-12）
}
```

规则：`position` 与 `ephemeral` 恰一个非空，或都为空（控制帧）；`subject` 至少含 `tenant`
与 `session`；信封不含存储偏移、进程句柄、内部 id（MS-10；omne-next 的"公开面不带内部
坐标"契约测试同型）。JSON Schema 在实现前按 [U-35](../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)
具体设计。

## 2. 帧词表

三类，命名空间统一，封闭性由 `message-stream` v1 契约给出：

| 类 | kind | 来源 | `payload` |
|---|---|---|---|
| 事实提示 | 各耐久流的事件名原样：`session.lifecycle.changed`、`session.hold.set / released`、`queue.item.enqueued / edited / withdrawn / closed`、`queue.order.changed`、`queue.items.taken`、`inbound.arrival.accepted / classified / consumed / converted / closed`、`inbound.context.advanced`、`run.lifecycle.created`、`run.state.changed`、`run.step.opened`、`run.attempt.recorded`、`run.calls.proposed`、`run.call.admitted`、`run.waiting_position.added`、`run.control.requested`、`run.gate.awaited`（[Session 设计 §2.4](../../../packages/session/session/design.md#24-事件命名去重键与词汇)、[Run 设计](../../../packages/session/run/design.md#提交面)）；工具与人类决定：`tools.call.proposed / admitted / waiting / settled / resolved`、`tools.control.requested / progressed`、`tools.relation.detach_requested / detached`、`hd.request.created / closed`、`hd.decision.recorded`（[工具提案转移表](../tool-execution/lifecycle.md#转移表)，候选；tools / HD 提供者设计现用的 `tools.call_proposed` 等两段名按 U-33 改为三段） | `records.envelope.committed` 广播（[LC-06](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)）经作用域过滤 | 小事实带事件 `data`；产生消息的事实（`queue.items.taken`、attempt 结算、`tools.call.settled`、`run.step.opened`）只带 `position` 与 `subject`，客户端按位置拉派生消息 |
| 耐久帧 | `tools.frame.<kind>`（[frames.md](../tool-execution/frames.md#帧身份与顺序)，候选） | `frames(S)` 流的提交广播 | 帧 payload 或 `payloadRef`；`position = {domain, seq}` 加 `subject.call / attempt`；`render` 来自命令声明 |
| 瞬态 | `model.attempt.started / chunk / ended`（[delta-protocol.md](delta-protocol.md)）、`tools.frame.<kind>`（`recordLevel: transient` 的帧） | MC 提供者累加器、tools 读面 `subscribeFrames` | 帧内容；`ephemeral = {owner: attempt \| call, epoch, seq}` |
| 控制 | `stream.opened{cursor, baseline, resync: none \| full}`、`stream.gap{owner, epoch, reason}`、`stream.closed{reason: unauthorized \| unavailable \| session_deleted \| resync_required}` | 出站流服务 | 见 §5 |

人类请求卡片不是新帧种类：`hd.request.created` 的事实提示加 HD 读面（`pool.get`，
[HD-09](../../../spec/capabilities/human-decisions/v1/contract.md)）给出卡片内容与可答性；答复经
`hd.decision.recorded` 提示，问答型答复的内容以 `tools.call.settled` 的 `tool_result` 进入历史
（[U-44](../tool-execution/README.md#裁决记录2026-09-14用户)）。hooks 观察事件不进流（决定 F）。

## 3. 一个 Session 一条流

一个订阅 = 一个 Session（决定 E）。Run、Step、调用、attempt、请求的帧都在这条流里以
`subject` 区分，客户端按身份分流，不按对象开多条连接。租户级列表变化（Session 目录、
待办池计数）走另一条轻量流，词表只有 `session.lifecycle.*`、`session.meta.*` 与
`hd.request.created / closed` 的提示，不带正文。

顺序：事实提示按 `position.seq` 单调；瞬态帧按各自 `ephemeral.seq` 单调；两类之间只保证
`model.attempt.started.startedAfter` 与 `ended.position` 给出的相对位置，不保证其它交错。

## 4. 客户端游标（决定 G）

```text
Cursor = { domains: { <coordinationDomain>: seq } }   // 各协调域已看到的最大提交序号
```

- 首版只有一个协调域（[CC-01](../../../spec/compositions/core-work-coordination/v2/contract.md)），
  游标就是一个数；跨域部署时按域各一个。DR-01 的 envelope 单调序号是逻辑序号，不是存储
  物理偏移；一个 batch 触及几条流只有一个序号，所以不需要每条流一个水位——每条流的
  水位（`session(S)` / `queue(S)` / `inbound(S)` / `frames(S)` / `run(R)` …）都能从域序号
  派生，且同域提交序号与各流序号同向单调。这是对 [出站流边界稿 §2](../outbound-stream/README.md#2-方向建议待实现阶段确认)
  "`(stream, seq)` 水位集合"的收敛：集合按域而不是按流，理由是 [研究结论 4](../../research/client-message-stream/README.md#0-结论先行)——
  按流的集合会随每个调用、每个请求各自一条流而无限增长。
- 游标**不包含**瞬态位置：瞬态帧不可续，重连以基线取代（[delta-protocol.md §5](delta-protocol.md#5-重连基线)）。
- 编码：不透明字符串，服务端解释；内容含版本号，旧版本游标视为"需全量重取"。游标不
  携带授权，跨租户或跨 Session 使用视为无效（MS-5）。
- 比较："落后多少"= 当前域序号 − 游标序号；补齐集合由此确定。

## 5. 重连补齐

订阅请求 `subscribe(session, cursor | null, principal)`：

1. 两处核对的第一处（[scope-and-delivery.md](scope-and-delivery.md#1-两处核对)）。
2. 服务端取当前域序号 `now` 与 projection 的可服务下界 `floor`（保留期 / 投影重建状态）。
3. 发 `stream.opened{cursor: now, baseline, resync}`：
   - `cursor == null` 或 `cursor.seq < floor` → `resync: full`：客户端清空本地状态，从
     `history(session, range)`（[SE-03](../../../spec/capabilities/session/v1/contract.md) 读面）与各读面重取，
     之后只接收 `seq > now` 的帧（决定 H 的"超过保留期返回需全量重取"）。
   - 否则 → `resync: none`，随后按 §5.1 补齐 `(cursor.seq, now]`。
   - `baseline` 含进程内仍活跃的瞬态 owner：活跃 attempt 的紧凑流与 `nextIndex`、活跃调用
     的帧水位与 `recordLevel`、当前待答请求列表。基线与 `now` 在同一同步切取出（DSH
     `follow` 打开时的同步切）。
4. 补齐（§5.1）与实时帧合流：补齐期间到达的实时事实帧按 `dedupKey` 去重后排在补齐之后；
   瞬态帧在基线之后直接投递。
5. 订阅存续期间，服务端为它记一个已推送水位 `sent`。每次听到铃都从 `sent` 而不是从铃
   自带的序号推送（`(sent, now]` 区间内该作用域的事实），所以丢一次铃不留洞；周期对账
   （`sent < now` 时再推一次）覆盖没有后继铃的那次丢失；队列满时水位停住，有空位再续
   （[scope-and-delivery.md §4](scope-and-delivery.md#4-背压ms-6)）。这两条是 [MS-3](invariants.md#安全性质)
   在 LC-06"广播可丢"前提下成立的机制，游标模型的否定变体 `SpecNoFill` 证明去掉它就有
   反例。

### 5.1 补齐集合

补齐 = `projection.changes(session, from: cursor.seq + 1, to: now)`（[projection 包](../../../packages/session/projection/design.md)
新增读面，cordis.md）：该 Session 作用域内、序号在区间内的全部已提交事实，投影为事实
提示帧，顺序按序号。它来自投影对同一批耐久流的 fold，不来自出站流自己的缓冲（MS-3）；
投影重建中返回 `unavailable`，服务端改发 `resync: full`。

产生消息的事实只给位置；客户端按位置从 `history` 读面拉派生消息。小事实带 `data`。

### 5.2 缺口

- 事实没有缺口，只有落后；`floor` 之下才是"需全量重取"。
- 瞬态缺口按 [缺口词表](../tool-execution/frames.md#缺口词表)：慢客户端丢弃 → `stream.gap{owner, reason: trimmed}`；
  进程重启 → 基线为空，客户端草稿标 `crash_gap`；`ended{abandoned}` → `unconfirmed`；
  格式版本无解释器 → `decode_unavailable`。缺口帧只说"这里少了瞬态内容"，不改变事实。

## 6. 与 DSH 的对照

| DSH（[研究 dsh 笔记 §7–8](../../research/client-message-stream/notes/dsh.md#7-host--webfollow--page--control)） | 本提案 | 差别的原因 |
|---|---|---|
| `follow` 首帧 `snapshot{cursor, records, projections, assistantStream}` | `stream.opened{cursor, baseline}` + 客户端按位置拉历史 | 我们不把历史页放进流里（消息正文按读权拉取，决定 D） |
| 单 `seq` 游标 | 按协调域的序号 | 多流、多对象 |
| `revision` 断裂 → 重开 follow | `epoch` 变化 → 重基线 | 复用 Run epoch |
| journal 拒绝缺口、倒序、部分重叠 | 事实帧按序号单调、按 `dedupKey` 去重；乱序视为服务端错误关流 `resync_required`（这是 `stream.closed{resync_required}` 唯一的用途；缓冲满不关流，§5 第 5 条） | 同型 |
| `page()` 缺口修复 | `projection.changes` 区间补齐 | 事实在投影，不在流缓冲 |
| 通知不重放 | 同 | D-014 事实/提示分家 |

## 7. 权威落点

| 内容 | 落点 |
|---|---|
| 信封、词表封闭性、游标语义、补齐算法、缺口帧 | 新能力 `message-stream` v1 |
| `projection.changes(session, from, to)` 读面 | session 下一版（读面清单）与 projection 提供者设计 |
| `frames(S)` 作为 Session 第四条流 | session 下一版（决定 K；[工具提案缺口表](../tool-execution/lifecycle.md#契约措辞缺口表)已登记） |
| 传输（SSE 端点、订阅请求、游标解释） | `apps/local-harness` 装配设计 |
