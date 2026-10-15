# @omne-harness/stream-arrival

[English](README.md)

一次流式交付上的一个步骤。步骤是开块、填充、封块、削减和结束。

## 职责与状态

一个步骤属于一次流式交付。它不是入站受理，也不是 Cordis 派发。模型与工具保留自己的发出和执行，并消费这套词汇。

本包不分配序号，不保存日志，也不携带用量和费用的正文。`judgeStreamArrival` 只核对一个步骤名和一个序号是否在场。它不给步骤排序。`assembleStream` 把一个目标的步骤折成进行中的装配，或折成已经收场的终态。

## 使用

```ts
import { assembleStream, judgeStreamArrival } from '@omne-harness/stream-arrival'

judgeStreamArrival({ step: 'finish', index: '9' })

assembleStream({
  target: { id: 'msg_abcdefghijklmnopqrstuv', role: 'assistant' },
  steps: [
    {
      step: 'open',
      index: '0',
      mode: 'append',
      head: { kind: 'text', id: 'b1', visibility: { toHuman: true, toModel: true } },
    },
    { step: 'fill', index: '0', seq: '0', chunk: 'hello' },
    { step: 'fill', index: '0', seq: '1', chunk: 'hello' },
    { step: 'close', index: '0' },
    { step: 'finish', index: '0' },
  ],
})
```

调用方取消是 `end: { kind: 'cancelled' }`。它不是步骤。观察者断开不增加步骤，也不增加 `end`。

没有 Cordis 入口。

## 契约

`STREAM_ARRIVAL_STEPS` 是 `open`、`fill`、`close`、`trim`、`finish`。其他步骤名，包括 `event`，得到 `{ rejected: 'step' }`。缺少序号得到 `{ rejected: 'index' }`。该判断只读 `{ step, index }`。

`assembleStream` 返回 `{ ok }` 或 `{ rejected, at, assembly }`。`ok.phase` 是 `live` 或 `ended`。已经收场的装配带 `terminal`。`terminal.kind` 是 `complete`、`truncated`、`failed` 或 `cancelled`。只有 `complete` 带 `message`。终态之后的新步骤是 `late`，先前的装配保持不变。开块 `head` 不是 JSON 时，拒绝码是 `json`。`assembleStream` 在准入时复制 `id`、`role` 和 JSON `head`。之后修改调用方对象不改变已返回的装配。`from` 必须是先前的返回值。手写的 `{ phase: 'live' }` 被拒绝。`stopped` 即使还没有封块也是终态。之后的 `close` 或 `finish` 是 `late`。`close` 可以带 `block`。缺省时封住已累积的片段。给出时，该 JSON 值就是封住的部件。它的 `text` 或 `inline` 与累积正文不一致时，拒绝码是 `conflict`，先前的装配保持不变。

## 设计

`src/index.ts` 拥有步骤表、`judgeStreamArrival` 和 `assembleStream`。

## 配置与运行

包不读环境。发出该目标的 runtime 分配序号。

## 验证

`pnpm --filter @omne-harness/stream-arrival test` 运行 `tests/public-entry.spec.ts` 和 `tests/assembly.spec.ts`。这些测试同时承担单元和契约。它们核对步骤名、序号拒绝，以及装配终态，包括重复送达、截断、迟到步骤和调用方取消。本包是纯值，没有存储集成测试，也没有用户旅程的端到端测试。

## 维护

执行事实留在模型和工具。
