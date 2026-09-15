# 增量协议：attempt 的 started / chunk / ended

[提案索引](README.md) · [消息模型](message-model.md) · [信封与游标](envelope-and-cursor.md) · [不变式](invariants.md)

一次模型请求 attempt（[MC-06](../../../spec/capabilities/model-execution/v1/contract.md)）在客户端
的实时形态是三种瞬态帧；它们不是事实，事实是 attempt 的结算记录。形状沿 DSH 的
`agent/assistant-stream`（[研究 dsh 笔记 §5](../../research/client-message-stream/notes/dsh.md#5-进程内助手帧-agentassistant-stream)），
本项目 fork 的 `AssistantStreamAttempt`（[loop 包](../../../packages/agent/loop/README.md)）已实现
`start / chunk / end` 的发帧与紧凑折叠；差别只在身份与耐久确认（§2、§3）。

## 1. 帧

```text
model.attempt.started { attempt: AttemptRef, epoch, pub: {gen: ProviderGen, n: Counter}, purpose: reply | title | compression | auxiliary,
                        request: RequestId, provider, model, startedAfter: Cursor }
model.attempt.chunk   { attempt, epoch, pub, index: Counter, at: Timestamp, chunk: StreamChunk }
model.attempt.ended   { attempt, epoch, pub, index: Counter,     // 已发 chunk 数（公开计数）
                        outcome: { kind: committed, position: {domain, seq, index}, settled: success | partial | failed | cancelled | unknown }
                               | { kind: abandoned, reason: writer_unavailable | owner_lost | source_lost,
                                   observer: owner | message_stream } }
```

- `pub`：MC 提供者实例在一个 Session 内对每次发布单调递增的计数 `n`（三种帧共用），带上
  提供者实例的代号 `gen`（提供者装载时生成，换代即变）；读面 `attempts(session)` 的 `version`
  就是快照时的 `pub`；插件只在同一 `gen` 内比较，丢弃 `n ≤ version.n` 的帧，这是"先读基线再
  订阅"能成为同步切的可比较字段（复核 B-新6）。收到 `gen` 与已知 `version.gen` 不同的帧，
  插件先重读 `attempts` 取新基线、再按新 `version` 判定——换代不靠另一条通知，帧自己说明
  （第三轮复核 B-非阻断 3）。提供者义务：读面快照与发布在同一互斥下（进程内同步 emit），
  `items` 与 `version` 一致；序号由 MC 分配，插件不代分配。
- `purpose`：在 `started` 上就带（不只在结算记录里）；客户端只把 `purpose = reply` 的帧展开为
  助手草稿，其它目的的帧进各自的界面位置（压缩：进度指示；标题、辅助：无草稿），结算时
  没有助手消息可替换、草稿直接撤下（复核 B-新3：否则标题或压缩 attempt 会先冒充一条回复）。
- `abandoned.observer`：谁发的终止帧。`source_lost` 只由出站流插件代发（§5），`index` 是插件
  已见的 chunk 数；其余由 owner 发。

- `AttemptRef = {work: RunRef | WorkRef, step: StepRef | null, attemptId}`：MC-06 的独立 attempt 身份，
  不是 DSH 的"Session 名 + 本地计数"（[fork 说明](../core-capabilities/fork/loop-source.md)的已知差异）；
  没有 Run 的工作（`WorkRef`，如按需压缩、标题）`step` 为空，`epoch` 取该工作的执行代次（评审 B4）。
- `epoch`：Run 的执行 epoch（[RN-02](../../../spec/capabilities/run/v1/contract.md)）。它承担 DSH
  `revision` 的角色：客户端看到 `epoch` 变化即整体重基线，不做局部修补；不另设计数器。
- `index` 在 attempt 内稠密零起；`ended.index` 等于 chunk 总数，客户端据此发现丢帧。
- `startedAfter`：attempt 开始时的客户端游标值，让客户端把草稿排在正确的事实之后
  （DSH 线上 `start` 帧的 `startedAfterSeq`）。

公开的 `StreamChunk` 词表（客户端看到的）：`block-start{index, blockType}`、`text-delta`、
`reasoning-delta{text, form: text | summary}`、`tool-call-start{index, id, name}`、`tool-call-end{index}`、
`block-end{index, block}`、`usage{usage}`、`finish{reason}`。它是 fork `@omne-harness-lite/llm/baseline`
私有词表经**公开投影** `toPublic` 得到的：私有词表里的 `tool-call-delta{argumentsDelta}` 不流出
（参数的半截 JSON 既是未校验的原始参数，又无法在半截上做披露裁剪；评审决定点 M 的作者裁决，
客户端只看到"正在写调用 / 写完了"，完整参数随 `tools.call.proposed` 事实到），`finish.replayState`
与加密推理只留在 MC 私有记录（评审 B7）。`toPublic` 是对一个 attempt **整段私有序列**的确定性
转换（带每 attempt 的公开计数与开块状态，不是逐 chunk 的无状态映射；复核 B-新5）：

- 公开 `index` 由它稠密分配；`started` 之后的 `nextIndex`、`ended.index`、紧凑记录展开后的
  计数都是这一套公开计数，私有 chunk 被过滤不留洞。
- `block-end{block}` 对 tool-call 块只带 `{type, id, name}`，不带 `arguments`（参数只经
  `tools.call.proposed` 到）；文本与推理块带公开形态的完整块。
- 推理块的形态由其第一条公开 delta 决定并写在 `block-start`；同一私有块里后到的不同形态
  开一个新的公开块；有明文的块不再流出该块的摘要。这是 U-49"没有明文退摘要"在单帧上
  可判定的形式。摘要先到、明文后到时，客户端会先后看到一个摘要块和一个明文块，两者都
  保留（已流出的帧不撤回；是否折叠摘要块归 UI）；`toPublic` 是对私有序列前缀单调的 fold，
  所以历史投影与实时看到的块序列一致（第三轮复核 B-非阻断 4）。

实时发布、紧凑历史记录、重连基线三处入口共用它，没有第二条路径把私有载荷送出去；模型
请求所需的完整回放经 MC 的私有读面取回，不从 `Message` 字段恢复。OpenRouter adapter 的义务
（[研究 openrouter 笔记 §5](../../research/client-message-stream/notes/openrouter.md#5-与-dsh-streamchunk-的对应推断)）：
按首次见到的 `index` 合成 `block-start`，按 `finish_reason` 到达合成 `block-end`；
`reasoning_details` 三型映射：明文与摘要映射到 `reasoning-delta{form}`（有明文只发明文，只有摘要
时发摘要），加密形态只进 replay 元数据与结算记录、不映射为任何 chunk（用户裁决
[U-49](README.md#裁决记录2026-09-15用户)：加密推理耐久但不流出）；流中途 `error` 映射为
`finish{error, failure{code, message, status?}}`；`content_filter` 映射为 `finish{error}` 并保留
`native_finish_reason` 于 failure 诊断（DSH 词表无此项，进 MC 下一版的措辞）。

## 2. 耐久形式（决定 C）

| 内容 | 等级 | 落点 |
|---|---|---|
| attempt 结算：`purpose`、装配后的 `ContentBlock[]`、缺失块清单、`actualModel`、实际送达模态、usage、finish、**紧凑流记录** `AssistantStreamRecord[]`（公开投影后的） | 耐久（事实） | MC 提供者的 attempt 结算记录（[cordis.md](cordis.md#能力侧)）；MC-06 的计费与 partial 记录同一条 |
| replay 元数据（`replayState`、加密推理原件） | 耐久（私有） | MC 私有记录与读面；不进紧凑记录、不进帧、不进基线（评审 B7） |
| 原始逐 token `chunk` 帧 | transient | 出站流旁路；不落盘，不承诺重放 |

紧凑记录是 fork 的 `AssistantStreamAccumulator` 输出（同块连续 delta 合并、`time0` 加 `dt[]`），
`expandAssistantStream()` 是耐久边界的验证入口（[fork 说明](../core-capabilities/fork/llm-source.md)）。
历史翻页与重连基线都从这份记录重建打字过程与首 token 时间；这是 DSH 的做法，也是
[研究结论 2](../../research/client-message-stream/README.md#0-结论先行) 里唯一做到"同一份记录
服务实时与历史"的先例。

## 3. 瞬态与耐久的接头

- `ended{committed}` 只在 attempt 结算记录取得 DR-02 的 `committed` 回执**之后**发出；
  emit、进入写队列或文件 write 返回都不算（MS-7）。fork 的 `settle(eventType, append)` 目前在
  同步 `append()` 返回后就发帧，接入 records 后要改为等待回执，这是 [cordis.md](cordis.md#fork-的演化路径)
  记录的实施差异。
- 客户端把 `chunk` 累积视为草稿；收到 `ended{committed, position}` 后，用 `position` 处的
  派生消息（[message-model.md §4](message-model.md#4-从事实派生消息)）**原子替换**整段草稿；
  没有收到 `ended` 就断线的尝试，按重连基线处理（§5）。
- `ended{abandoned}` 只在没有任何结算记录能提交时发出（writer 不可用、执行 owner 丢失）；
  客户端把草稿标为 `unconfirmed` 缺口，等待事实：稍后要么出现该 attempt 的结算事实
  （MC-06：可能已发出的请求记录 unknown / partial），要么 Run 侧记录失败。

## 4. 失败、中断与部分内容

| 情形 | MC-06 记录 | 帧 | 派生消息 |
|---|---|---|---|
| 正常结束 | `success` | `ended{committed, success}` | 助手消息 |
| 流中途供应方错误、超时 | `partial` 或 `failed`，已流出前缀明确可见 | `ended{committed, settled: partial \| failed}` | `partial` 派生助手消息：保留全部**完整且已耐久**的块（文本、推理、引用已耐久的媒体、已校验的 `tool_call`），未完成的块逐条记入 `settlement.missing{blockId, kind, reason}`——`missing` 表示"缺失或不完整"：截断的文本 / 推理块**保留已流出的前缀作为块内容**并记 `reason: truncated`（RD-08 与 MC-06 要求前缀明确可见，复核 R6 建议；场景 MS-17），未耐久的媒体与被装配器丢弃的调用没有块、只有 missing 项（[RD-08](../../../spec/capabilities/run-driver/v2/contract.md)、[CT-04](../../../spec/capabilities/media-content/v1/contract.md)；评审 B6——fork 的 `interruptedBlocks()` 只留 text / reasoning，须改写，[cordis.md](cordis.md#fork-的演化路径)）；`failed` 无内容不派生，usage 与状态保留 |
| 用户 stop / cancel | `cancelled` | `ended{committed, settled: cancelled}` | 同 partial |
| 可能已发出、结果不明 | `unknown` | `ended{committed, unknown}` | 不派生；客户端显示"结果未知"，费用按 MC-06 入原账 |
| 结算记录无法提交 | 无 | `ended{abandoned}` | 无；缺口 `unconfirmed` |

run-driver 已接受"模型流式前缀不可恢复"（[出站流边界稿 §4.4](../outbound-stream/README.md#4-实现阶段要回答的问题)）：
partial 的前缀是结算事实的一部分，不是可续写的草稿。

## 5. 重连基线

订阅打开时（[envelope-and-cursor.md §5](envelope-and-cursor.md#5-重连补齐)）的基线包含当前
进程内仍活跃的 attempt：`{attempt, epoch, nextIndex, stream: AssistantStreamRecord[]}`（`stream`
已经过 `toPublic`），由 MC 提供者的读面 `attempts(session) → {items, version}` 给出（DSH
`SessionAssistantStreamAccumulator` 同型；评审 B8），`version` 是快照时的发布计数 `pub`（§1）。
出站流插件的同步切：先订阅 MC 的 `model.attempt.*` 事件、再读 `attempts`（顺序可以反过来，
只要两步之间的帧都能按 `pub` 判定），丢弃同一 `gen` 下 `n ≤ version.n` 的帧——基线已经包含
它们；之后的帧接在基线之后；`gen` 不同的帧触发重读基线（§1）。读面快照与发布在 MC 内同一互斥下，所以不存在"基线读完、监听
建好之间"漏掉的发布（复核 B-新6）。插件在 attempt 中途装载也拿得到完整基线，只监听未来
事件拿不到。客户端把基线展开为草稿，再接收 `index ≥ nextIndex` 的 chunk；`epoch` 不匹配或
`index` 不连续 → 丢弃草稿并重开订阅。进程重启后累加器为空：客户端只能靠事实（结算记录
或 `run.*` 失败记录）收尾，草稿标 `crash_gap`（[缺口词表](../tool-execution/frames.md#缺口词表)）。

来源消失（MC 提供者插件卸载、换代、读面失联）而进程未崩溃：出站流插件对自己账上每个
活跃 attempt 向订阅者发 `ended{abandoned, reason: source_lost, observer: message_stream, index:
已见 chunk 数}`，并把该 attempt 在自己账上记为已关闭：此后同一 attempt 的任何帧——包括来源
恢复后 owner 迟到的 chunk 与 owner 自己的 `ended`——一律丢弃，客户端只靠事实收尾
（复核 B-新6：代发不证明 owner 已停止发布，所以插件关闭的是自己的账、不是 owner）。客户端
草稿标 `unconfirmed`；该 attempt 的结算事实（MC-06 的 unknown / partial 记录，或 Run 侧失败）
稍后到达时客户端按位置读消息收尾。谁发现来源消失：插件对 MC 读面的调用失败或 Cordis
服务撤回通知，二者任一即触发；发现责任在插件，不在 MC。

`epoch` 与 fork `revision` 的差别（评审 B8）：Run epoch 只作重基线依据（变了就整体重来），
不作缺帧检测；缺帧检测靠 attempt 内 `index` 稠密与 `ended` 必达（对账兜底：一个 attempt 的
结算事实已到而 `ended` 未到，客户端按事实收尾）。fork 每帧递增的 `revision` 不进产品词汇。

## 6. 工具调用参数增量

私有词表的 `tool-call-delta{argumentsDelta}` 是供应方输出的文本片段，不流出（§1 的 `toPublic`）；
客户端只收到 `tool-call-start{index, id, name}` 与 `tool-call-end{index}`。真正的调用只在
[TL-01](../../../spec/capabilities/tools/v1/contract.md) 完整校验后作为 `tools.call.proposed` 事实出现
（[工具提案转移表](../tool-execution/lifecycle.md#转移表)，候选）；客户端在 `tool-call-end` 之前
显示"正在生成调用"，不得渲染为已提议的调用、不得据片段预取执行状态。`max-tokens` 截断的
调用被装配器丢弃（fork `BlockAssembler` 规则），进 `settlement.missing`，不会出现在结算记录
的内容里。

## 7. 权威落点

| 内容 | 落点 |
|---|---|
| `model.attempt.*` 帧形状、`epoch` 作重基线依据、`ended` 在耐久回执之后 | 新能力 `message-stream` v1（若波 2 后确认只涉及 MC 字段则改进 model-execution 下一版；[README](README.md#决定点用户裁决-2026-09-15) 作者决定） |
| 结算记录携带 `purpose`、紧凑流记录、缺失块与实际送达模态；`attempts(session)` 读面与版本；发布计数 `pub` 与读面快照的互斥 | model-execution 下一版（MC-04/06 的措辞）与 MC 提供者设计 |
| `toPublic` 公开投影（整段转换、公开计数、块裁剪、推理形态）、私有回放读面 | MC 提供者设计；OB-03 的披露裁剪在此兑现 |
| OpenRouter chunk 映射、`content_filter` | MC 提供者设计（adapter） |
