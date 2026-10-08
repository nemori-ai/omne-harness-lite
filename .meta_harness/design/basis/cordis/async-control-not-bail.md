---
id: async-control-not-bail
upstream: cordis
version: 4.0.4
kind: negative
symbols:
  - "events.ts: isBailed 只排除 null/false/undefined，Promise 本身算 bail 值"
  - "events.ts: bail 同步派发，遇首个 bail 值即返回，不 await 返回的 Promise"
  - "events.ts: emit 同步派发且丢弃返回值"
  - "events.ts: serial 顺序逐个 await 后再判定"
lines:
  - "events.ts:13-15"
  - "events.ts:217-222"
  - "events.ts:194-196"
  - "events.ts:204-209"
probe: packages/core/kernel-basis/tests/basis/async-control-not-bail.test.ts
checked: 2026-09-22
---

# `bail` 不能承载异步控制判定

## 读数

五种派发中，`bail` 同步派发到**首个 bail 值**为止。它**不 await** 监听者返回的 Promise。
`isBailed` 只排除 `null`、`false`、`undefined`——**一个 Promise 对象本身就算 bail 值**。

**想当然的理解**：用 `bail` 做拦截，监听者返回「拒绝」就短路。

**实际（4.0.4 取证）**：监听者若是异步函数，返回的是一个 Promise。`bail` 在它那里停下，
把**这个 Promise 本身**当作结果交回调用方——不管它将来解析成「否决」还是「无异议」；
后面的监听者一个都不跑。调用方拿到的是一个 truthy 的 Promise，同步判定它「有人 bail 了」，
于是异步「无异议」变成「否决」，异步「否决」的具体内容也丢了——**判定被静默扭曲，不抛错、不告警**。

两者分叉的条件很窄但很常见：**判定需要 I/O**。查数据库、查成员资格、调外部授权服务，
一旦异步，`bail` 就失效。同步判定用 `bail` 完全正确，这也是它容易被误推广的原因。

异步控制必须走 `serial`——它顺序逐个 await。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `events.ts` isBailed | 只排除 `null`/`false`/`undefined`，Promise 算 bail 值 | 读源码 13–15 行 |
| `events.ts` bail | 同步派发到首个 bail 值；遇 Promise 即停、原样交回 | 注册一个 `async () => undefined` 的监听者再接一个同步否决者，观察 bail 在前者停下且返回 Promise |
| `events.ts` emit | 同步派发；返回值直接丢弃 | 同上，emit 连同步返回值也不看 |
| `events.ts` serial | 顺序逐个 await 后判定 | 注册异步监听者，观察其解析值被等待并参与判定 |

派发模式因此是**事件契约的一部分**，不是实现细节：换一种派发会改变「谁决定结果」。

## probe 断言什么

probe 在 `packages/core/kernel-basis` 里，针对采用的 Cordis 4.0.4 核对：

1. 一个 `async` 监听者返回 `undefined`（无异议），后面接一个同步返回 `false` 的否决者；
   `ctx.bail` 的返回值是 `Promise` 实例、只有第一个监听者跑过、该 Promise 解析为 `undefined`。
2. 三个监听者（async `undefined`、async `false`、sync `true`）经 `ctx.serial` 全部按序跑完，
   结果是第三个的 `true`；`ctx.emit` 返回 `undefined` 且三个都跑。

上游若改为 await Promise 再判定，第 1 条「返回值是 Promise」与「只跑了一个」都会失败——本条目失效，
那正是需要的信号。

## 已知的误用

**用 `bail` 做异步授权检查。**Promise 本身会使同步派发停止并原样返回，后续监听者不执行。同步调用方没有取得最终授权值，判定后果取决于其读法，不能声称一律放行。需要异步授权的控制链必须逐个 await，采用 `serial`。

配套的静态检查：绑定表声明了 `control-async` 的条款，若其实现中出现 `ctx.bail(`，
直接判失败。这类错误静态可查，不应等到运行期。

**用 `emit` 做任何控制。**返回值被直接丢弃，比 `bail` 错得更彻底，但也更容易在评审中看出来。
