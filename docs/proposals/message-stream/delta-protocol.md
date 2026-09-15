# 增量协议：attempt 的 started / chunk / ended

[提案索引](README.md) · [消息模型](message-model.md) · [信封与游标](envelope-and-cursor.md) · [不变式](invariants.md)

一次模型请求 attempt（[MC-06](../../../spec/capabilities/model-execution/v1/contract.md)）在客户端
的实时形态是三种瞬态帧；它们不是事实，事实是 attempt 的结算记录。形状沿 DSH 的
`agent/assistant-stream`（[研究 dsh 笔记 §5](../../research/client-message-stream/notes/dsh.md#5-进程内助手帧-agentassistant-stream)），
本项目 fork 的 `AssistantStreamAttempt`（[loop 包](../../../packages/agent/loop/README.md)）已实现
`start / chunk / end` 的发帧与紧凑折叠；差别只在身份与耐久确认（§2、§3）。

## 1. 帧

```text
model.attempt.started { attempt: AttemptRef, epoch, request: RequestId, provider, model, startedAfter: Cursor }
model.attempt.chunk   { attempt, epoch, index: Counter, at: Timestamp, chunk: StreamChunk }
model.attempt.ended   { attempt, epoch, index: Counter,          // 已发 chunk 数
                        outcome: { kind: committed, position: {domain, seq}, settled: success | partial | failed | cancelled | unknown }
                               | { kind: abandoned, reason: writer_unavailable | owner_lost } }
```

- `AttemptRef = {work: RunRef | WorkRef, step: StepRef, attemptId}`：MC-06 的独立 attempt 身份，
  不是 DSH 的"Session 名 + 本地计数"（[fork 说明](../core-capabilities/fork/loop-source.md)的已知差异）。
- `epoch`：Run 的执行 epoch（[RN-02](../../../spec/capabilities/run/v1/contract.md)）。它承担 DSH
  `revision` 的角色：客户端看到 `epoch` 变化即整体重基线，不做局部修补；不另设计数器。
- `index` 在 attempt 内稠密零起；`ended.index` 等于 chunk 总数，客户端据此发现丢帧。
- `startedAfter`：attempt 开始时的客户端游标值，让客户端把草稿排在正确的事实之后
  （DSH 线上 `start` 帧的 `startedAfterSeq`）。

`StreamChunk` 词表沿 fork 的 `@omne-harness-lite/llm/baseline`：`block-start{index, blockType}`、
`text-delta`、`reasoning-delta`、`tool-call-delta{index, id, name?, argumentsDelta}`、
`block-end{index, block}`、`usage{usage}`、`finish{reason, replayState?}`。OpenRouter adapter 的义务
（[研究 openrouter 笔记 §5](../../research/client-message-stream/notes/openrouter.md#5-与-dsh-streamchunk-的对应推断)）：
按首次见到的 `index` 合成 `block-start`，按 `finish_reason` 到达合成 `block-end`；
`reasoning_details` 三型映射：明文与摘要映射到 `reasoning-delta`（有明文只发明文，只有摘要
时发摘要），加密形态只进 replay 元数据与结算记录、不映射为任何 chunk（用户裁决
[U-49](README.md#裁决记录2026-09-15用户)：加密推理耐久但不流出）；流中途 `error` 映射为
`finish{error, failure{code, message, status?}}`；`content_filter` 映射为 `finish{error}` 并保留
`native_finish_reason` 于 failure 诊断（DSH 词表无此项，进 MC 下一版的措辞）。

## 2. 耐久形式（决定 C）

| 内容 | 等级 | 落点 |
|---|---|---|
| attempt 结算：装配后的 `ContentBlock[]`、`actualModel`、usage、finish、replay 元数据、**紧凑流记录** `AssistantStreamRecord[]` | 耐久（事实） | MC 提供者的 attempt 结算记录（[cordis.md](cordis.md#能力侧)）；MC-06 的计费与 partial 记录同一条 |
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
| 流中途供应方错误、超时 | `partial` 或 `failed`，已流出前缀明确可见 | `ended{committed, partial \| failed}` | `partial` 派生只含文本 / 推理前缀的助手消息，不含工具调用（fork `interruptedBlocks()` 规则）；`failed` 无内容不派生，usage 保留 |
| 用户 stop / cancel | `cancelled` | `ended{committed, cancelled}` | 同 partial |
| 可能已发出、结果不明 | `unknown` | `ended{committed, unknown}` | 不派生；客户端显示"结果未知"，费用按 MC-06 入原账 |
| 结算记录无法提交 | 无 | `ended{abandoned}` | 无；缺口 `unconfirmed` |

run-driver 已接受"模型流式前缀不可恢复"（[出站流边界稿 §4.4](../outbound-stream/README.md#4-实现阶段要回答的问题)）：
partial 的前缀是结算事实的一部分，不是可续写的草稿。

## 5. 重连基线

订阅打开时（[envelope-and-cursor.md §5](envelope-and-cursor.md#5-重连补齐)）的基线包含当前
进程内仍活跃的 attempt：`{attempt, epoch, nextIndex, stream: AssistantStreamRecord[]}`，由 MC 提供者
维护的进程内累加器给出（DSH `SessionAssistantStreamAccumulator` 同型）。客户端把基线展开为
草稿，再接收 `index ≥ nextIndex` 的 chunk；`epoch` 不匹配或 `index` 不连续 → 丢弃草稿并重开
订阅。进程重启后累加器为空：客户端只能靠事实（结算记录或 `run.*` 失败记录）收尾，草稿
标 `crash_gap`（[缺口词表](../tool-execution/frames.md#缺口词表)）。

## 6. 工具调用参数增量

`tool-call-delta` 只是供应方输出的文本片段。真正的调用只在 [TL-01](../../../spec/capabilities/tools/v1/contract.md)
完整校验后作为 `tools.call.proposed` 事实出现（[工具提案转移表](../tool-execution/lifecycle.md#转移表)，候选）；
客户端在 `block-end` 之前可以显示"正在生成调用"，但不得渲染为已提议的调用、不得据片段
预取执行状态。`max-tokens` 截断的调用被装配器丢弃（fork `BlockAssembler` 规则），不会出现
在结算记录里。

## 7. 权威落点

| 内容 | 落点 |
|---|---|
| `model.attempt.*` 帧形状、`epoch` 作重基线依据、`ended` 在耐久回执之后 | 新能力 `message-stream` v1（若波 2 后确认只涉及 MC 字段则改进 model-execution 下一版；[README](README.md#决定点用户裁决-2026-09-15) 作者决定） |
| 结算记录携带紧凑流记录与 partial 前缀 | model-execution 下一版（MC-04/06 的措辞）与 MC 提供者设计 |
| OpenRouter chunk 映射、`content_filter` | MC 提供者设计（adapter） |
