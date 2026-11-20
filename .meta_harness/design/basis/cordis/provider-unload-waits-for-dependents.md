---
id: provider-unload-waits-for-dependents
upstream: cordis
version: 4.1.0
kind: positive
symbols:
  - "fiber.ts: _unload 先等本 fiber 的 provisions 里每一份实现的 dependents 清空，再释放自己的 effect"
  - "fiber.ts: _reload 把本 fiber 记进它 committed 里每一份实现的 dependents；卸完自己的 effect 之后才移出，并叫醒在等的提供者"
  - "fiber.ts: 提供者 fiber 离开 ACTIVE 时通知依赖方；这时严格读法读不到它的服务，服务表里的键还在"
  - "reflect.ts: provide 的 disposer 删服务表里的键并再通知一次，等 dependents 清空，最后从 provisions 里删；整棵提供者 fiber 卸载时，这个 disposer 排在等依赖方之后才运行"
lines:
  - "fiber.ts:712-746"
  - "fiber.ts:682-686"
  - "fiber.ts:587-601"
  - "reflect.ts:311-325"
probe: packages/assembly/kernel-basis/tests/provider-unload-waits-for-dependents.spec.ts
checked: 2026-11-20
---

# 提供者卸载时等它的依赖方先卸完

## 读数

一个 fiber 提供的服务被别的 fiber `inject` 着时，这个 fiber 的卸载分两段：先离开 `ACTIVE` 并通知依赖方，
然后**等每一个依赖方卸完自己的 effect**，最后才释放它自己的 effect，其中包括把服务从服务表里删掉。所以依赖方在自己的 disposer 里仍能用这份服务。

等的这一段里，同一份服务有两种读数：`ctx.get(名)`（严格读法）已经读不到，因为提供者不是 `ACTIVE`；`ctx.get(名, false)` 仍读到旧值，
`internal/service` 事件带的也仍是旧值，带 `undefined` 的那一次要等依赖方卸完才发。服务表里的键这时还占着，**同名的新提供者登记不上**，抛 `has been registered`。

依赖方只指 `inject` 了这份服务的 fiber。只用 `ctx.get` 按调用现取的使用方不算，提供者不等它。

**想当然的理解**：`await provider.dispose()` 只取决于提供者自己的 disposer。

**实际（4.1.0 取证）**：它还取决于每一个依赖方的 disposer。有一个依赖方的 disposer 不返回，提供者的 `dispose()` 就一直不返回，
提供者自己的 effect 也一直没有释放，依赖方停在 `UNLOADING`，替换它的新提供者也一直登记不上。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `fiber.ts` `_unload`（712–746 行） | 先循环等 `provisions` 里各份实现的 `dependents` 清空，再 `Promise.all` 驱动自己的 disposer，最后把自己从 `committed` 各份实现的 `dependents` 里移出并叫醒提供者 | 依赖方的 disposer 挂住时，观察提供者的 `dispose()` 不返回 |
| `fiber.ts` `_reload`（682–686 行） | 装载时把自己登记为每一份必需实现的依赖方 | 没有 `inject` 的使用方不让提供者等 |
| `fiber.ts` `_updateState`（587–601 行） | 离开 `ACTIVE` 时对自己提供的键发通知，键不删 | 提供者开始卸载之后 `ctx.get(名)` 读不到，`ctx.get(名, false)` 仍读到旧值 |
| `reflect.ts` `provide` 的 disposer（311–325 行） | 删键、通知、等依赖方、删 provision；随提供者 fiber 卸载时排在等依赖方之后 | 依赖方卸完之前装同名的新提供者，抛 `has been registered` |

## 探针断言什么

探针在 `packages/assembly/kernel-basis/tests/`，随该成员的测试运行，针对 Cordis 4.1.0 核对：

1. 依赖方的 disposer 等着一个没放行的 Promise 时撤提供者：30 毫秒后提供者的 `dispose()` 没有返回，`ctx.get(名)` 读不到这份服务，
   `ctx.get(名, false)` 仍读到旧值，`internal/service` 只发过带旧值的一次，依赖方是 `UNLOADING`，两边的 disposer 都还没跑完。
   放行之后：依赖方的 disposer 先完成，提供者的后完成，`dispose()` 返回，带 `undefined` 的事件这时才发，依赖方回到 `PENDING`。
2. 同样的撤除途中装一个同名的新提供者：抛 `service "…" has been registered at <旧提供者>`。放行、等旧提供者卸完之后再装，登记得上，依赖方重新 `ACTIVE` 并读到新值。
3. 没有依赖方的提供者，`dispose()` 直接卸完。
4. 使用方没有 `inject`、只按调用现取：提供者的 `dispose()` 不等它，它仍是 `ACTIVE`。

上游若不再让提供者等依赖方，第 1、2 条失败；若把按调用现取的使用方也算作依赖方，第 4 条失败。本条目随之失效。

## 已知的误用

- **给提供者的撤除设时限，却不给它的依赖方设。**提供者的 `dispose()` 包含每个依赖方的卸载。等提供者卸完的地方要有自己的时限或放弃的出口，
  并把「哪个依赖方没卸完」报出来；不能假定撤提供者总会返回。
- **依赖方的 disposer 等一件要靠提供者卸完才发生的事。**两边互相等，谁也卸不完。
- **换提供者时不等旧的卸完就装新的。**旧提供者的 `dispose()` 返回之前键还占着，新的登记不上。先等旧的 `dispose()`，再装新的。
- **拿「`internal/service` 带 `undefined`」当「服务开始撤了」的信号。**它在依赖方卸完之后才发。要知道服务已经不可用，用严格读法 `ctx.get(名)`。
