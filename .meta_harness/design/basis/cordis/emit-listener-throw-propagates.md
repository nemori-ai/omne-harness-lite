---
id: emit-listener-throw-propagates
upstream: cordis
version: 4.0.4
kind: negative
symbols:
  - "events.ts: Lifecycle.emit 是 this.dispatch('emit', args).map(cb => cb(...args))——同步逐个调用，没有 try/catch"
  - "events.ts: 监听者抛出即中断本轮派发，异常同步传给 emit 的调用方；后面的监听者不再被调用"
lines:
  - "events.ts:194-196"
probe: packages/core/kernel-basis/tests/basis/emit-listener-throw-propagates.test.ts
checked: 2026-09-23
---

# `emit` 不隔离监听者：处理者抛出会同步传回发事件的一方，并截断本轮派发

## 读数

`ctx.emit(name, ...args)` 在 4.0.4 里就是把匹配的监听者按注册序同步逐个调用，**没有任何捕获**。
第一个抛出的监听者把异常原样抛回 `emit` 的调用方，**排在它后面的监听者这一轮不再被调用**。
返回的 Promise 不被等待（那是 `async-control-not-bail` 讲的另一半），但同步抛出会穿透。

**想当然的理解**：通知类事件「发出就完了」，处理者坏了是处理者自己的事。

**实际（4.0.4 取证）**：发通知的一方若不自己 `try/catch`，一个坏掉的订阅者会让它的操作在**事实已提交之后**抛出——
调用方看到失败、存储里却已经变了。所以持事实的节点发通知一律包住 `emit`：处理者抛出只记一条诊断，不改变操作结果，
也不影响其他监听者（要让其他监听者仍被调用，得自己逐个调或换派发模式）。account-identity 节点的三个事件按此实现（W1-B，2026-09-23）。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `events.ts` `emit` | `dispatch(...).map(cb => cb(...args))`，无捕获 | 两个监听者，第一个抛出：`emit` 抛出同一个错误，第二个没被调用 |
