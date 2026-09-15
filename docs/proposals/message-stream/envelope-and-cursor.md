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
  batch: {index, count} | null,       // 事实帧：同一提交在本订阅可见的帧里排第几、共几条（评审 B1）
  ephemeral: {owner, epoch, seq} | null, // 瞬态帧：owner 内单调序号；事实/控制帧为 null
  render: {kind, version, language?} | null, // 呈现标识（决定 J）；语义不依赖它；`language` 只配 `code`
  payload: JsonValue | null,          // 小事实带内容（决定 D）；消息正文不带
  payloadRef: MediaRef | null         // 媒体只发引用（MS-12）
}
```

规则：`position` 与 `ephemeral` 恰一个非空，或都为空（控制帧）；`subject` 至少含 `tenant`
与 `session`；信封不含存储偏移、进程句柄、内部 id（MS-10；omne-next 的"公开面不带内部
坐标"契约测试同型）。JSON Schema 在实现前按 [U-35](../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)
具体设计。

`batch` 回答评审 B1 指出的问题：一次提交可以产生多条共享 `position.seq` 的事实（MS-01 的
取批 + 建 Run + 开 Step 同批），"游标 = 已见最大序号"会在同批第一帧之后断线或背压时永久
跳过其余帧。`batch.count` 按本订阅**投递前核对后可见**的帧计（无权帧不算），所以它是订阅
局部的数字；`position.seq` 与 `dedupKey` 仍是全局身份。客户端只在收到 `batch.index = count`
的帧后才把游标推进到该 `seq`（§4）；服务端的水位同样按整批推进（§5）。

### 1.1 呈现标识词表（首版，用户裁决 U-57）

`render.kind` 首版直接复用 omne-next 的渲染意图词表，不改名不增删
（[研究笔记 omne-next §4](../../research/client-message-stream/notes/omne-next.md#4-工具进度帧)）：

| `render.kind` | 含义 | 配什么内容 |
|---|---|---|
| `plain` | 纯文本 | 文本 |
| `markdown` | Markdown | 文本 |
| `html` | 可直接渲染的 HTML 片段 | 文本 |
| `terminal` | 终端输出（ANSI 语义） | 文本 |
| `code` | 源代码，语言作参数 `render.language` | 文本 |
| `log` | 日志行 | 文本 |
| `table` | 表格数据 | 文本（结构化） |
| `widget` | 可交互小组件 | 文本且媒体类型为 `text/html` |
| `image` | 图片 | 媒体引用 |

随词表一起沿用的三条规则：渲染意图与内容的媒体类型正交、不从对方推导；非法组合具名
拒绝、不静默改；未知的 `render.kind` 降级为按媒体类型的默认渲染，且降级对消费端可见。
`render.version` 是词表版本，首版为 `1`；扩展词表发新版本，不原地改义。

## 2. 帧词表

三类，命名空间统一，封闭性由 `message-stream` v1 契约给出：

| 类 | kind | 来源 | `payload` |
|---|---|---|---|
| 事实提示 | 各耐久流的事件名原样：`session.lifecycle.changed`、`session.hold.set / released`、`queue.item.enqueued / edited / withdrawn / closed`、`queue.order.changed`、`queue.items.taken`、`inbound.arrival.accepted / classified / consumed / converted / closed`、`inbound.context.advanced`、`run.lifecycle.created`、`run.state.changed`、`run.step.opened`、`run.attempt.recorded`、`run.calls.proposed`、`run.call.admitted`、`run.waiting_position.added`、`run.control.requested`、`run.gate.awaited`（[Session 设计 §2.4](../../../packages/session/session/design.md#24-事件命名去重键与词汇)、[Run 设计](../../../packages/session/run/design.md#提交面)）；工具与人类决定：`tools.call.proposed / admitted / waiting / settled / resolved`、`tools.control.requested / progressed`、`tools.relation.detach_requested / detached`、`hd.request.created / closed`、`hd.decision.recorded`（[工具提案转移表](../tool-execution/lifecycle.md#转移表)，候选；tools / HD 提供者设计现用的 `tools.call_proposed` 等两段名按 U-33 改为三段） | `records.envelope.committed` 广播（[LC-06](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)）经作用域过滤 | 小事实带事件 `data`；产生消息的事实（`queue.items.taken`、attempt 结算、`tools.call.settled`、`run.step.opened`）只带 `position` 与 `subject`，客户端按位置拉派生消息 |
| 耐久帧 | `tools.frame.<kind>`（[frames.md](../tool-execution/frames.md#帧身份与顺序)，候选） | `frames(S)` 流的提交广播 | 帧 payload 或 `payloadRef`；`position = {domain, seq}` 加 `subject.call / attempt`；`render` 来自命令声明 |
| 瞬态 | `model.attempt.started / chunk / ended`（[delta-protocol.md](delta-protocol.md)）、`tools.frame.<kind>`（`recordLevel: transient` 的帧） | MC 提供者累加器、tools 读面 `subscribeFrames` | 帧内容；`ephemeral = {owner: attempt \| call, epoch, seq}` |
| 控制 | `stream.opened{target, resumable, baseline, resync: none \| full}`、`stream.gap{owner, epoch?, reason}`（`reason` 沿[缺口词表](../tool-execution/frames.md#缺口词表)：`trimmed \| crash_gap \| unconfirmed \| decode_unavailable`，本提案加 `unavailable`——来源或投影暂不可用；`owner` 可为 `session`）、`stream.closed{reason: unauthorized \| unavailable \| session_deleted \| resync_required}` | 出站流服务 | 见 §5 |

人类请求卡片不是新帧种类：`hd.request.created` 的事实提示加 HD 读面（`pool.get`，
[HD-09](../../../spec/capabilities/human-decisions/v1/contract.md)）给出卡片内容与可答性；答复经
`hd.decision.recorded` 提示，问答型答复的内容以 `tools.call.settled` 的 `tool_result` 进入历史
（[U-44](../tool-execution/README.md#裁决记录2026-09-14用户)）。hooks 观察事件不进流（决定 F）。

## 3. 一个 Session 一条流

一个订阅 = 一个 Session（决定 E）。Run、Step、调用、attempt、请求的帧都在这条流里以
`subject` 区分，客户端按身份分流，不按对象开多条连接。租户级列表变化（Session 目录、
待办池计数）走另一条轻量流，词表只有 `session.lifecycle.*`、`session.meta.*` 与
`hd.request.created / closed` 的提示，不带正文。

顺序：事实提示按 `(position.seq, batch.index)` 字典序单调，同批内 `index` 连续、`seq` 之间
允许跳号（别的 Session 的提交占了序号）；瞬态帧按各自 `ephemeral.seq` 单调；两类之间只保证
`model.attempt.started.startedAfter` 与 `ended.position` 给出的相对位置，不保证其它交错。

## 4. 客户端游标（决定 G）

```text
Cursor = { domains: { <coordinationDomain>: seq },   // 各协调域**已整批收齐**的最大提交序号
           visibility: VisibilityVersion }           // 主体对该 Session 的可见范围版本（评审 B3）
```

- 首版只有一个协调域（[CC-01](../../../spec/compositions/core-work-coordination/v2/contract.md)），
  游标就是一个数；跨域部署时按域各一个。DR-01 的 envelope 单调序号是逻辑序号，不是存储
  物理偏移；一个 batch 触及几条流只有一个序号，所以不需要每条流一个水位——每条流的
  水位（`session(S)` / `queue(S)` / `inbound(S)` / `frames(S)` / `run(R)` …）都能从域序号
  派生，且同域提交序号与各流序号同向单调。这是对 [出站流边界稿 §2](../outbound-stream/README.md#2-方向建议待实现阶段确认)
  "`(stream, seq)` 水位集合"的收敛：集合按域而不是按流，理由是 [研究结论 4](../../research/client-message-stream/README.md#0-结论先行)——
  按流的集合会随每个调用、每个请求各自一条流而无限增长。
- 推进规则：客户端只在某提交的整批**安装完成**后才把该域的序号推进到它——收到最后一帧
  （`batch.index = batch.count`）且该批引用的派生正文（§5.1"只给位置"的消息）都已按位置
  读到本地；收到同批的前几帧不推进，正文拉取失败也不推进，重连后该批按半批规则重发
  （复核 B-新1：只按帧推进会在"存了游标、还没拉到正文"的崩溃窗口里丢掉已确认的消息）。
  因此游标之下没有半批、也没有未取回的正文（MS-3 按批陈述）。
- 游标**不包含**瞬态位置：瞬态帧不可续，重连以基线取代（[delta-protocol.md §5](delta-protocol.md#5-重连基线)）。
- 可见范围版本：主体对本 Session 可见对象集合的版本号，由 session 下一版的读面
  `visibilityVersion(session, subject)` 给出，任何影响该主体对本 Session 内对象读权的授予或
  撤销（租户成员资格、Session 授予、请求可见范围）都使它变化。订阅时版本不符 → 全量重取；
  订阅期间变化 → `stream.closed{resync_required}`（丧失 Session 级读权则 `unauthorized`）。
  这是 [HD 提供者设计](../../../packages/governance/human-decisions/design.md)"权限变化使旧游标失效"
  先例的推广，不做逐帧回填账本（评审决定点 L 的作者裁决，[README](README.md#作者裁决评审后2026-09-15)）。
- 编码：不透明字符串，服务端解释；内容含版本号，旧版本游标视为"需全量重取"。游标不
  携带授权，跨租户或跨 Session 使用视为无效（MS-5）。
- 比较："落后多少"= 当前域序号 − 游标序号；补齐集合由此确定。

## 5. 重连补齐

订阅请求 `subscribe(session, cursor | null, principal)`：

1. 两处核对的第一处（[scope-and-delivery.md](scope-and-delivery.md#1-两处核对)）；同时取主体的
   可见范围版本，与游标里的版本比较。
2. 服务端取当前域序号 `now`、projection 对本 Session 的**完整覆盖水位** `completeTo`
   （投影已经把 `≤ completeTo` 的提交全部 fold 进去；[SE-10](../../../spec/capabilities/session/v1/contract.md)
   的水位，评审 B2）与可服务下界 `floor`（保留期 / 投影重建状态）。`floor ≤ completeTo ≤ now`。
3. 发 `stream.opened{target: now, resumable, baseline, resync}`——`target` 是本次要追平的位置，
   `resumable` 是客户端**现在就可以保存**的恢复位置，二者分开（评审 B2 第 2 点）：
   - `cursor == null`、`cursor.seq < floor` 或可见范围版本不符 → `resync: full`，`resumable = null`：
     客户端清空本地状态，从 projection 的**一个**读面 `snapshot(session, principal) → {asOf,
     history, queue, requests, calls, visibility}` 重取——所有派生视图都是同一 fold 在同一水位
     `asOf = completeTo` 上的结果（[SE-10](../../../spec/capabilities/session/v1/contract.md) 的
     stateKey 集合），历史分页也按 `asOf` 过滤，不存在"各读面各一个时刻"（复核 B-新2）；
     `target := asOf`，`(asOf, now]` 由随后的补齐推；期间收到的 `seq > asOf` 的帧先在本地暂存。
     快照全部读到且其 `visibility` 与订阅时一致是**安装完成点**，此刻客户端才保存游标
     `= asOf` 并应用暂存帧；任一读取失败、或可见范围版本在安装期间变化，客户端不保存游标、
     重开订阅重来（决定 H 的"超过保留期返回需全量重取"）；服务端没有安装状态，终止安装的
     只有客户端。瞬态基线另取（[delta-protocol.md §5](delta-protocol.md#5-重连基线)，自带版本）。
   - 否则 → `resync: none`，`resumable = cursor`（客户端已有的游标继续有效），随后按 §5.1
     补齐 `(cursor.seq, completeTo]`；`(completeTo, now]` 的部分等投影追上后由对账续推。
   - `baseline` 含进程内仍活跃的瞬态 owner：活跃 attempt 的公开紧凑流与 `nextIndex`
     （[delta-protocol.md §5](delta-protocol.md#5-重连基线)）、活跃调用的帧水位与 `recordLevel`、当前
     待答请求列表；每一项经各自权威的当前读权核对后才放入（[scope-and-delivery.md §1](scope-and-delivery.md#1-两处核对)）。
     基线与 `now` 在同一同步切取出（DSH `follow` 打开时的同步切；MC 读面带版本号，见 delta-protocol §5）。
4. 补齐（§5.1）与实时帧合流：补齐期间到达的实时事实帧按 `dedupKey` 去重后排在补齐之后；
   瞬态帧在基线之后直接投递。
5. 订阅存续期间，服务端为它记一个已推送水位 `sent = (seq, index)`——最后推出的帧的位置，
   整批推完时 `index = count`。每次听到铃都从 `sent` 而不是从铃自带的序号推送（`(sent, min(now, completeTo)]`
   区间内该作用域的事实），所以丢一次铃不留洞；周期对账（`sent < completeTo` 时再推一次）
   覆盖没有后继铃的那次丢失；队列满时水位停在批内最后推出的那帧，有空位再续
   （[scope-and-delivery.md §4](scope-and-delivery.md#4-背压ms-6)）。水位**永远不越过 `completeTo`**：
   投影没处理到的提交不推，这是评审 B2 第 1 点的修正。这两条是 [MS-3](invariants.md#安全性质)
   在 LC-06"广播可丢"前提下成立的机制，游标模型的否定变体 `SpecNoFill` 证明去掉它就有
   反例。
6. 停住的订阅被保留期追上（`sent.seq < floor`）：服务端发 `stream.closed{resync_required}`，
   客户端以游标重订阅，走第 3 步的全量重取（评审 B2 第 5 点）。

### 5.1 补齐集合

补齐 = `projection.changes(session, after: cursor.seq, to)`（[projection 包](../../../packages/session/projection/design.md)
新增读面，cordis.md），返回 `{batches: [{seq, facts[]}], completeTo}`：该 Session 作用域内、序号在
`(after, min(to, completeTo)]` 的全部已提交事实按提交分组，投影为事实提示帧，顺序按 `(seq, index)`。
端点是"游标之后、水位为止"的左开右闭区间，与模型一致（复核 B-新1 指出首稿 `from = cursor + 1`
再取开区间会跳过紧接游标的那一批）。
它来自投影对同一批耐久流的 fold，不来自出站流自己的缓冲（MS-3）；服务端推送以整批为
单位，队列装不下整批时推前缀并把水位停在批内。投影重建中返回 `unavailable` 时的处置见 §5.2。

产生消息的事实只给位置；客户端按位置从 `history` 读面拉派生消息。小事实带 `data`。

### 5.2 缺口与不可用

- 事实没有缺口，只有落后；`floor` 之下才是"需全量重取"。
- 瞬态缺口按 [缺口词表](../tool-execution/frames.md#缺口词表)：慢客户端丢弃 → `stream.gap{owner, reason: trimmed}`；
  进程重启 → 基线为空，客户端草稿标 `crash_gap`；`ended{abandoned}` → `unconfirmed`；
  格式版本无解释器 → `decode_unavailable`。缺口帧只说"这里少了瞬态内容"，不改变事实。
- 投影不可用（重建中、版本不符）：已开订阅**不再投递任何事实帧**（没有完整覆盖水位就不能
  证明前缀完整），发一次 `stream.gap{owner: session, reason: unavailable}`，水位与游标原地不动；
  瞬态帧照常；投影恢复后从水位对账续推。新订阅同样受理，事实帧等投影恢复。评审 B2 第 4 点
  指出的"只发实时帧"会重现 `SpecNoFill` 的反例，因此不再允许。

## 6. 与 DSH 的对照

| DSH（[研究 dsh 笔记 §7–8](../../research/client-message-stream/notes/dsh.md#7-host--webfollow--page--control)） | 本提案 | 差别的原因 |
|---|---|---|
| `follow` 首帧 `snapshot{cursor, records, projections, assistantStream}` | `stream.opened{cursor, baseline}` + 客户端按位置拉历史 | 我们不把历史页放进流里（消息正文按读权拉取，决定 D） |
| 单 `seq` 游标 | 按协调域的序号 | 多流、多对象 |
| `revision` 断裂 → 重开 follow | `epoch` 变化 → 重基线 | 复用 Run epoch |
| journal 拒绝缺口、倒序、部分重叠 | 事实帧按 `(seq, index)` 单调、同批 `index` 连续、按 `dedupKey` 去重；`seq` 跳号合法（别的 Session 的提交）。客户端发现 `(seq, index)` 倒退、同批 `index` 跳号、或同批未收齐就收到更大的 `seq`，视为服务端错误关流 `resync_required` 并以游标重订阅；服务端在停住的订阅掉出保留期或可见范围版本变化时也发同一原因（§4、§5 第 6 条）；缓冲满不关流（§5 第 5 条） | 同型；差别在同批多帧 |
| `page()` 缺口修复 | `projection.changes` 区间补齐 | 事实在投影，不在流缓冲 |
| 通知不重放 | 同 | D-014 事实/提示分家 |

## 7. 权威落点

| 内容 | 落点 |
|---|---|
| 信封、词表封闭性、游标语义、补齐算法、缺口帧 | 新能力 `message-stream` v1 |
| `projection.changes(session, after, to) → {batches, completeTo}`、`snapshot(session, principal) → {asOf, …}` 读面与 `floor` | session 下一版（读面清单）与 projection 提供者设计 |
| `visibilityVersion(session, subject)` 读面 | session 下一版（聚合租户成员资格、Session 授予与 HD 可见范围的版本） |
| 跨协调域后的一致读取切点、域迁移 / 新增、跨域因果接头与历史排序 | [LC-09](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) 义务清单；本提案只保证域内顺序（[未决项](README.md#未决项)） |
| `frames(S)` 作为 Session 第四条流 | session 下一版（决定 K；[工具提案缺口表](../tool-execution/lifecycle.md#契约措辞缺口表)已登记） |
| 传输（SSE 端点、订阅请求、游标解释） | `apps/local-harness` 装配设计 |
