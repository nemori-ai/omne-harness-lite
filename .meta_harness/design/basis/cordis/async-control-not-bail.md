---
id: async-control-not-bail
upstream: cordis
version: 4.0.2
kind: negative
symbols:
  - "events.ts: bail 同步派发到首个 bail 值，不 await 返回的 Promise"
  - "events.ts: emit 同步派发且不等待返回的 Promise"
  - "events.ts: serial 顺序逐个 await"
lines:
  - "events.ts:183-243"
  - "events.ts:194-196"
probe: null
checked: 2026-09-17
---

# `bail` 不能承载异步控制判定

## 读数

五种派发中，`bail` 同步派发到**首个 bail 值**为止。它**不 await** 监听者返回的 Promise。

**想当然的理解**：用 `bail` 做拦截，监听者返回「拒绝」就短路。

**实际**：监听者若是异步函数，返回的是一个 Promise。Promise 不是 bail 值，
于是 `bail` 认为「没有人否决」，继续往下走——**判定被静默跳过，不抛错、不告警**。

两者分叉的条件很窄但很常见：**判定需要 I/O**。查数据库、查成员资格、调外部授权服务，
一旦异步，`bail` 就失效。同步判定用 `bail` 完全正确，这也是它容易被误推广的原因。

异步控制必须走 `serial`——它顺序逐个 await。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `events.ts` bail | 派发到首个 bail 值；返回值判定不穿透 Promise | 注册一个 `async () => false` 的监听者，观察 bail 不短路 |
| `events.ts` emit | 同步派发且不等待返回的 Promise；返回值直接丢弃 | 同上，且 emit 连同步返回值也不看 |
| `events.ts` serial | 顺序逐个 await | 注册异步监听者，观察其结果被等待并参与判定 |

派发模式因此是**事件契约的一部分**，不是实现细节：换一种派发会改变「谁决定结果」。

## probe 断言什么

**当前为 null，本条目是待核对主张，不得单独作为设计依据。**

可写的 probe：注册一个 `async` 监听者返回 bail 值，用 `ctx.bail(...)` 派发，
断言**未被短路**（即该语义当前成立）；再以 `ctx.serial(...)` 派发同一监听者，
断言被短路。上游若修改为 await，第一个断言失败，本条目失效——这正是需要的信号。

尚未落地的原因同 [[isolate-hides-instances-not-data]]：尚无 Cordis 集成测试位置。

## 已知的误用

**用 `bail` 做异步授权检查。**这是本条目最危险的一种误用，因为它的失败是**静默放行**：

- 不抛错，不记日志，不产生任何异常信号；
- 测试若只覆盖「有权限」路径，会全部通过；
- 只有真正的越权访问发生时才暴露，而那时已经越权成功了。

配套的静态检查：绑定表声明了 `control-async` 的条款，若其实现中出现 `ctx.bail(`，
直接判失败。这类错误静态可查，不应等到运行期。

**用 `emit` 做任何控制。**返回值被直接丢弃，比 `bail` 错得更彻底，但也更容易在评审中看出来。
