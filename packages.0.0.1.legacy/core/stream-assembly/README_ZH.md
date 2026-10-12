# @omne-harness-lite/stream-assembly

[English](README.md)

不可变的纯流装配器。把到达事件交给调用方持有的状态，得到模型响应或工具帧的快照与最终内容／账结算。本包不调用模型、执行工具或进行 I/O。

## Workspace 使用

这是实验阶段的私有 workspace 包，目前未发布到 npm。在仓库检出中按[开发指南](../../../docs/development.md)准备环境并构建 workspace，消费成员声明 `"@omne-harness-lite/stream-assembly": "workspace:*"`，示例直接导入的其他包也应声明为直接依赖。通过公开包入口导入，不穿透兄弟包的 `src/`。

## 公开 API

| 函数                               | 返回                                                   |
| ---------------------------------- | ------------------------------------------------------ |
| `start(target: unknown)`           | `{ ok: AssemblyState }` 或 `{ rejected: 'malformed' }` |
| `accept(state, event: unknown)`    | 新状态或表示／序列拒绝                                 |
| `snapshot(state)`                  | 含块视图及已接受事件位置的 `AssemblySnapshot`          |
| `closeOut(state)`                  | `AssemblySettlement` 或 `stream_not_finished`          |
| `abandon(state, reason?: unknown)` | lost 结算，或 `malformed`／`event_after_finish`        |

`AssemblyState` 只导出为不透明类型，通过 `start` 获得。结果、快照、结算及拒绝类型也公开。本包没有独立 Schema 资源。

## 使用示例

每个 TypeScript 示例独立完整，使用构建后的公开导出。

### 装配文本并结算已结束的流

```ts
import {
  start,
  accept,
  snapshot,
  closeOut,
  type AssemblyState,
} from '@omne-harness-lite/stream-assembly'

import { jsonNumberSource } from '@omne-harness-lite/content-blocks'

const initial = start({ kind: 'model_call', callId: 'model_call_1', dispatch: 1 })
if ('rejected' in initial) throw new Error(initial.rejected)
let state: AssemblyState = initial.ok
const events = [
  {
    t: 'open',
    index: 0,
    id: 'block_1',
    kind: 'text',
    fill: 'append',
    visibility: { toHuman: true, toModel: true },
  },
  { t: 'fill', index: 0, payload: 'Hello' },
  {
    t: 'close',
    index: 0,
    block: {
      kind: 'text',
      id: 'block_1',
      visibility: { toHuman: true, toModel: true },
      text: 'Hello',
    },
  },
  { t: 'finish', reason: 'end' },
]
for (const event of events) {
  const next = accept(state, event)
  if ('rejected' in next) throw new Error(next.rejected)
  state = next.ok
}
console.log(jsonNumberSource(snapshot(state).position)) // 4
console.log(snapshot(initial.ok).position) // 0: previous states remain usable
const settled = closeOut(state)
if ('rejected' in settled) throw new Error(settled.rejected)
console.log(settled.ok.blocks[0]?.kind, settled.ok.ending.reason) // text end
if ('usage' in settled.ok.account) console.log(settled.ok.account.usage.source) // none: no reported account
```

### 只在封口时解析一次工具参数原文

```ts
import { start, accept, closeOut, type AssemblyState } from '@omne-harness-lite/stream-assembly'

const initial = start({ kind: 'model_call', callId: 'model_call_1', dispatch: 1 })
if ('rejected' in initial) throw new Error(initial.rejected)
let state: AssemblyState = initial.ok
for (const event of [
  {
    t: 'open',
    index: 0,
    id: 'block_1',
    kind: 'tool_call',
    fill: 'append',
    visibility: { toHuman: true, toModel: true },
    head: { callId: 'call_1', tool: 'lookup' },
  },
  { t: 'fill', index: 0, payload: '{"x":1,"x":2}' },
  { t: 'close', index: 0 },
  { t: 'finish', reason: 'end' },
]) {
  const next = accept(state, event)
  if ('rejected' in next) throw new Error(next.rejected)
  state = next.ok
}
const result = closeOut(state)
if ('rejected' in result) throw new Error(result.rejected)
const call = result.ok.blocks[0]
if (call?.kind !== 'tool_call' || !call.complete || !('unparseable' in call))
  throw new Error('expected unparseable call')
console.log(call.unparseable, call.rawArguments) // true {"x":1,"x":2}
```

封口被接受。参数重复成员落成完整 `unparseable` 调用，而不是封口被拒。此例不执行 `lookup`。

### 处理拒绝并放弃失去连续性的流

```ts
import { start, accept, snapshot, closeOut, abandon } from '@omne-harness-lite/stream-assembly'

const initial = start({ kind: 'tool_execution', callId: 'call_1' })
if ('rejected' in initial) throw new Error(initial.rejected)
console.log(closeOut(initial.ok)) // { rejected: 'stream_not_finished' }
console.log(accept(initial.ok, { t: 'fill', index: 0, payload: 'Hello' }))
// { rejected: 'block_not_open' }
console.log(snapshot(initial.ok).position) // 0: refused input has no effect
const lost = abandon(initial.ok)
if ('rejected' in lost) throw new Error(lost.rejected)
console.log(lost.ok.ending.reason) // lost
const finished = accept(initial.ok, { t: 'finish', reason: 'end' })
if ('rejected' in finished) throw new Error(finished.rejected)
console.log(accept(finished.ok, { t: 'unknown' })) // { rejected: 'event_unknown' }
console.log(accept(finished.ok, { t: 'fill', index: 0, payload: 'late' }))
// { rejected: 'event_after_finish' }
```

## 边界与失败处理

每次 `accept` 先检查到达表示，再检查 `event_after_finish`，最后检查序列。因此，即使已 finish，表示错误仍有优先级。序列失败包括索引重用／不单调、块未开／已封口、载荷不符与重复记账。拒绝不改传入状态。伪造状态对象违反不透明状态前提，可能抛异常；状态只能从本模块获得。

填充期间工具参数始终是原文。合法、被接受、未被砍且模型工具名有效的工具调用封口，使用严格无损 JSON 只解析一次；空原文表示 `{}`。语法错误、重复成员或非法工具名落成完整 `unparseable` 调用，保留原名与参数。改变内容的砍和未封口调用结算为两边不可见的半截调用。快照、结算与放弃都不重解析参数，也不发起执行。非调用封口须带匹配的最终块；与填充归约相等由生产者保证。

位置与 `firstContentAt` 都是事件位置，不是时刻。缺失模型账结算为显式未知用量／费用，不记零；工具流返回帧账。`abandon` 表示连续性丢失；只有模型流可带原因，结算不会修改或消耗原状态。调用方须保证每个会话／目标一份当前状态、有序且不重不漏的投递、被拒增量的砍上报、快照／增量衔接、时刻捕获、恰一次持久记录，以及宿主撤除时放弃在途流。跨进程可靠投递、授权与恢复不在本包。保留旧不可变状态也保留内存；数组查找与更新的代价随块数增长。

## 开发

```sh
pnpm --filter @omne-harness-lite/stream-assembly run build
pnpm --filter @omne-harness-lite/stream-assembly run typecheck
pnpm --filter @omne-harness-lite/stream-assembly run test
```

先构建 workspace 依赖。这些检查覆盖本包；组合行为需针对实际消费者与提供者验证。
