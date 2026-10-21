---
id: late-plugin-load-unload-does-not-rerun-others
upstream: cordis
version: 4.0.4
kind: negative
symbols:
  - "fiber.ts: Fiber 构造时向父 fiber 登记 ctx.plugin() effect，撤除函数即这条 effect 的 disposer"
  - "fiber.ts: _updateState 只对本 fiber 提供的服务键调用 reflect.notify"
  - "fiber.ts: _refresh 的 epoch 只由本 fiber inject 的各提供者 fiber uid 拼成"
  - "fiber.ts: Fiber.effect 的 disposer 在本 fiber 卸载时运行"
  - "reflect.ts: notify 只刷新 inject 了被通知键的 fiber"
lines:
  - "fiber.ts:265-297"
  - "fiber.ts:418"
  - "fiber.ts:581-595"
  - "fiber.ts:611-622"
  - "reflect.ts:314-330"
probe: packages/assembly/kernel-basis/tests/late-plugin-load-unload-does-not-rerun-others.spec.ts
checked: 2026-10-21
---

# 根已 ACTIVE 后装载并撤除一个带登记的插件，不重跑其他插件体

## 读数

根已经 ACTIVE。注册表 `Service` 与一个 inject 了它的消费者都已 ACTIVE。
这时再对根调用 `ctx.plugin`，装载一个插件。这个插件 inject 注册表，不提供任何服务键。
它在插件体里用 `ctx.effect` 向注册表的 Map 写入一条登记，并返回删除这条登记的 disposer。

装载后，Map 里有这条登记。对这个插件的 fiber 调用 `dispose` 后，Map 里没有这条登记，
fiber 的状态是 `DISPOSED`。整个过程中，注册表提供者与已有消费者的插件体都不再运行，
它们的 fiber uid 不变，根与它们的状态一直是 `ACTIVE`。

想当然的理解：根已经运行后再装载或撤除插件，会使整棵树重新求值，
或至少使 inject 了同一服务的其他消费者重跑。撤除插件后，注册表要自己清理这个插件的登记。

实际（4.0.4 取证）：fiber 状态变化只通知本 fiber 提供的服务键。
不提供服务键的插件，装载和撤除都不通知任何其他 fiber。
消费者的 epoch 只由它 inject 的提供者 fiber uid 组成。新插件只是读取注册表，
所以注册表的提供者 fiber 不变，其他消费者的 epoch 也不变。
登记由插件自己 fiber 上的 effect 持有。fiber 卸载时运行 effect 的 disposer，登记随之删除。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `fiber.ts` 构造函数 | `this.dispose = parent.fiber.effect(...)`；disposer 把 uid 置空并卸载本 fiber | 读源码 265–297 行 |
| `fiber.ts` `_updateState` | 只在 ACTIVE 与非 ACTIVE 之间变化时，对 `impl.fiber === this` 的键调用 `notify` | 读源码 581–595 行 |
| `fiber.ts` `_refresh` | epoch 由 inject 的各键对应的提供者 fiber uid 拼成 | 读源码 611–622 行 |
| `reflect.ts` `notify` | 只刷新 inject 里含被通知键的 fiber | 读源码 314–330 行 |
| `fiber.ts` `effect` | disposer 在显式撤除或 fiber 卸载时运行 | 读源码 418 行起，或跑 probe |

## probe 断言什么

probe 在 `packages/assembly/kernel-basis/tests/`，随该成员的测试运行，对 4.0.4 通过（2026-10-21）。

1. 根、注册表提供者和已有消费者都是 `ACTIVE`，两者的插件体各运行一次。
2. 装载后插件 fiber 是 `ACTIVE`，插件体运行一次，Map 里有它的登记。注册表提供者与消费者的运行次数仍是一次。
3. `dispose` 后插件 fiber 是 `DISPOSED`，Map 里没有它的登记。
4. 让出事件循环后，注册表提供者与消费者的运行次数仍是一次，fiber uid 不变，根与两者仍是 `ACTIVE`。

上游若在装载或撤除时重跑其他插件体，第 2 或第 4 条失败。
若 fiber 撤除时不再运行它的 effect disposer，第 3 条失败。本条目随之失效。

## 适用前提

- 被装载的插件不提供服务键。它若提供服务键，inject 了该键的 fiber 会按
  [plugin-body-reruns-on-provider-change](plugin-body-reruns-on-provider-change.md) 重跑。
- 插件只 inject 已经 ACTIVE 的服务，且这些服务的提供者在过程中不换代。
- 登记由插件自己 fiber 上的 `ctx.effect` 持有。经 `Service` 方法里 `this.ctx.effect` 登记时，
  归属规则见 [service-method-ctx-is-caller](service-method-ctx-is-caller.md)。
- 插件挂在根上装载。经另一个插件的 ctx 装载时，撤除函数登记在那个插件的 fiber 上，
  那个 fiber 卸载会连带撤除它。probe 没有覆盖这种挂法。
- disposer 是同步函数。异步 disposer 的释放次序见
  [effect-disposal-concurrent-not-ordered](effect-disposal-concurrent-not-ordered.md)。
- probe 不覆盖在途调用、排空与交接。`dispose` 返回只说明 fiber 已卸载、effect 已运行，
  不说明插件发出的外部效果已经收场。

## 已知的误用

- 为了装一个新插件而重启宿主或已有消费者：不提供服务键的插件可以在根运行后直接装载和撤除，其他插件体不受影响。
- 让注册表自己记录谁登记了什么，再等插件来注销：插件被撤除时没有人来注销，登记就留下了。把登记放进插件自己 fiber 上的 effect，撤除时自动删除。
- 把 `dispose` 返回当作外部效果已经收场：它只说明 Cordis 侧的卸载完成。
