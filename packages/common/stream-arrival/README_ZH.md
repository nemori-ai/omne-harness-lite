# @omne-harness/stream-arrival

[English](README.md)

一次流式交付上的一个步骤。步骤是开块、填充、封块、削减和结束。

## 职责与状态

一个步骤属于一次流式交付。它不是入站受理，也不是 Cordis 派发。模型与工具保留自己的发出和执行，并消费这套词汇。

本包不分配序号，不保存日志，也不携带用量和费用的正文。这次初始化停在五个步骤名和序号是否在场。流式合成与终态规则仍留给后续拥有者。

## 使用

```ts
import { judgeStreamArrival } from '@omne-harness/stream-arrival'

judgeStreamArrival({ step: 'open', index: '0' })
```

没有 Cordis 入口。

## 契约

`STREAM_ARRIVAL_STEPS` 是 `open`、`fill`、`close`、`trim`、`finish`。其他步骤名，包括 `event`，得到 `{ rejected: 'step' }`。缺少序号得到 `{ rejected: 'index' }`。

## 设计

`src/index.ts` 拥有步骤表和 `judgeStreamArrival`。

## 配置与运行

包不读环境。发出该目标的 runtime 分配序号。

## 验证

`pnpm --filter @omne-harness/stream-arrival test` 运行 `tests/public-entry.spec.ts`。这份测试同时承担单元和契约。它从公开入口核对步骤名和序号拒绝。本包是纯值，没有存储集成测试，也没有用户旅程的端到端测试。

## 维护

执行事实留在模型和工具。
