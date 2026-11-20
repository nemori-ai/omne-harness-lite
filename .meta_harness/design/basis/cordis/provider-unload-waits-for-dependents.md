---
id: provider-unload-waits-for-dependents
upstream: cordis
version: 4.1.0
kind: positive
symbols:
  - "fiber.ts: _unload 先等本 fiber 的 provisions 里每一份实现的 dependents 清空，再释放自己的 effect"
  - "fiber.ts: _reload 把本 fiber 记进它 committed 里每一份实现的 dependents；卸完自己的 effect 之后才移出，并叫醒在等的提供者"
  - "reflect.ts: provide 的 disposer 先删服务表里的键并通知依赖方，再等 dependents 清空，最后从 provisions 里删"
lines:
  - "fiber.ts:712-746"
  - "fiber.ts:682-686"
  - "reflect.ts:311-325"
probe: packages/assembly/kernel-basis/tests/provider-unload-waits-for-dependents.spec.ts
checked: 2026-11-20
---

# 提供者卸载时等它的依赖方先卸完

## 读数

一个 fiber 提供的服务被别的 fiber `inject` 着时，这个 fiber 的卸载分两段：先把服务从服务表里撤下并通知依赖方，
然后**等每一个依赖方卸完自己的 effect**，最后才释放它自己的 effect。所以依赖方在自己的 disposer 里仍能用这份服务。

依赖方只指 `inject` 了这份服务的 fiber。只用 `ctx.get` 按调用现取的使用方不算，提供者不等它。

**想当然的理解**：`await provider.dispose()` 只取决于提供者自己的 disposer。

**实际（4.1.0 取证）**：它还取决于每一个依赖方的 disposer。有一个依赖方的 disposer 不返回，提供者的 `dispose()` 就一直不返回，
提供者自己的 effect 也一直没有释放。这时服务表里已经读不到这份服务，依赖方停在 `UNLOADING`。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `fiber.ts` `_unload`（712–746 行） | 先循环等 `provisions` 里各份实现的 `dependents` 清空，再 `Promise.all` 驱动自己的 disposer，最后把自己从 `committed` 各份实现的 `dependents` 里移出并叫醒提供者 | 依赖方的 disposer 挂住时，观察提供者的 `dispose()` 不返回 |
| `fiber.ts` `_reload`（682–686 行） | 装载时把自己登记为每一份必需实现的依赖方 | 没有 `inject` 的使用方不让提供者等 |
| `reflect.ts` `provide` 的 disposer（311–325 行） | 删键、通知、等依赖方、删 provision | 提供者开始卸载之后 `ctx.get` 立即读不到这份服务 |

## 探针断言什么

探针在 `packages/assembly/kernel-basis/tests/`，随该成员的测试运行，针对 Cordis 4.1.0 核对：

1. 依赖方的 disposer 等着一个没放行的 Promise 时撤提供者：30 毫秒后提供者的 `dispose()` 没有返回，`ctx.get` 读不到这份服务，
   依赖方是 `UNLOADING`，两边的 disposer 都还没跑完。放行之后：依赖方的 disposer 先完成，提供者的后完成，`dispose()` 返回，依赖方回到 `PENDING`。
2. 没有依赖方的提供者，`dispose()` 直接卸完。
3. 使用方没有 `inject`、只按调用现取：提供者的 `dispose()` 不等它，它仍是 `ACTIVE`。

上游若不再让提供者等依赖方，第 1 条失败；若把按调用现取的使用方也算作依赖方，第 3 条失败。本条目随之失效。

## 已知的误用

- **给提供者的撤除设时限，却不给它的依赖方设。**提供者的 `dispose()` 包含每个依赖方的卸载。等提供者卸完的地方要有自己的时限或放弃的出口，
  并把「哪个依赖方没卸完」报出来；不能假定撤提供者总会返回。
- **依赖方的 disposer 等一件要靠提供者卸完才发生的事。**两边互相等，谁也卸不完。
