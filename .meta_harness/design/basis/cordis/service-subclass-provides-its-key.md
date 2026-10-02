---
id: service-subclass-provides-its-key
upstream: cordis
version: 4.0.4
kind: positive
symbols:
  - "service.ts: Service 构造函数取 super(ctx, name) 给的服务名，以 ctx.reflect.provide(name, self, check) 登记自己"
  - "reflect.ts: provide 把实现记在当前 fiber 名下，撤除由该 fiber 的 effect 负责"
  - "service.ts: Service[Symbol.hasInstance] 沿构造函数链判定，子类实例也是抽象父类的实例"
lines:
  - "service.ts:42-58"
  - "service.ts:104-113"
  - "reflect.ts:277-305"
probe: packages/core/kernel-basis/tests/basis/service-subclass-provides-its-key.test.ts
checked: 2026-10-02
---

# 抽象 `Service` 子类作为插件加载，就在抽象类给的键上提供服务

## 读数

一个抽象 `Service` 类在自己的构造函数里写死服务名（`super(ctx, '键')`），不含实现；
具体实现 `extends` 它、只补方法。把这个子类当插件装上（`ctx.plugin(子类)`），Cordis 实例化它，
构造函数随即以那个键登记自己——**登记的键来自抽象类，子类不写键**。
消费者按键取到的是子类实例，它同时是抽象类的实例；装着它的 fiber 撤除，键上就没有服务了。
消费者若把这个键写进 `inject`，要等这个子类装上才启动。

这件事决定了「服务键只写一次」做得到：键写在服务定义（抽象类）里，提供者 `extends` 它而不重复写键，
消费者按同一个键取用。

**想当然的理解**：抽象类只是 TypeScript 的类型，实现类还得自己 `ctx.provide(键, this)` 一次。

**实际（4.0.4 取证）**：`Service` 的构造函数本身就调 `ctx.reflect.provide(name, self, check)`，
抽象父类给出 `name`，子类什么都不用做；登记归装载它的那条 fiber，随它撤除。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `service.ts` 构造函数 | `name ??= this.constructor['provide']`；设 `tracker`（`property: 'ctx'`）；末尾 `self.ctx.reflect.provide(name, self, this[symbols.check])` | 读源码 42–58 行 |
| `reflect.ts` `provide` | 在当前 fiber 的 effect 里登记，撤除时删掉并通知依赖者 | 读源码，或跑 probe 第 1 条的撤除断言 |
| `service.ts` `Symbol.hasInstance` | 沿构造函数链判定 | 子类实例对抽象类做 `instanceof` |

## probe 断言什么

probe 在 `packages/core/kernel-basis`，对 4.0.4 通过（2026-10-02）：

1. 抽象类 `super(ctx, 'probeGreeter')`、子类只实现 `greet`；`ctx.plugin(子类)` 之后 `ctx.get('probeGreeter')` 是抽象类的实例、方法可调；
   撤除那条 fiber 后 `ctx.get('probeGreeter')` 为 `undefined`。
2. 先装一个 `inject: ['probeGreeter']` 的消费者，插件体不跑；装上子类后插件体跑一次。

上游若让 `Service` 的构造函数不再自行登记、或登记的键不再取自 `super` 的参数，第 1 条失败——本条目随之失效。

## 已知的误用

- **在提供者里另定义一个同值的键常量**：抽象类已经占定了键，提供者再写一份就多了一处要同步的地方；
  本仓库的三份 `STORAGE_SERVICE = 'storage'` 就是这样来的。
- **把只有类型的 `interface` 当服务定义**：它不占键，也不登记，消费者无从按键取用。
