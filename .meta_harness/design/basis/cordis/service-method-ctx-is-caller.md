---
id: service-method-ctx-is-caller
upstream: cordis
version: 4.1.0
kind: positive
symbols:
  - "service.ts: Service 构造时设 tracker，property 为 'ctx'"
  - "reflect.ts: ctx.get(name) 返回 getTraceable(this.ctx, 实现)，this.ctx 是发起读取的那个上下文"
  - "utils.ts: getTraceable 只包装带 tracker 的值；createTraceable 的代理在读 tracker.property 时返回使用处的 ctx（服务被消费的那个上下文，即调用方；effect 归它），读 symbols.caller 时返回定义处的 ctx"
  - "fiber.ts: ctx.effect 返回撤除函数"
lines:
  - "service.ts:42-58"
  - "reflect.ts:247-249"
  - "utils.ts:118-125"
  - "utils.ts:167-177"
  - "fiber.ts:421-424"
probe: packages/assembly/kernel-basis/tests/service-method-ctx-is-caller.spec.ts
checked: 2026-11-20
---

# 经调用方取到的 `Service`，方法里的 `this.ctx` 是调用方的上下文

## 读数

消费者经自己的 ctx 取到一个 `Service`（`ctx.get(键)` 或 inject 后的 `ctx.<键>`），拿到的不是实例本身，
而是一层代理：方法里读 `this.ctx`，得到的是**调用方**的上下文，不是服务自己的。
所以服务方法里写 `this.ctx.effect(() => { 登记; return 撤除 })`，这条效应记在**调用方的 fiber** 上：
调用方撤除，它登记的东西跟着撤掉；服务本身照旧活着。`effect` 还把撤除函数返回给调用方，可以提前单独撤。

这是「登记即效应」能成立的机制：注册表服务的 `register()` 不用自己记谁登记了什么、也不用等谁来注销，
登记的寿命自动跟着登记者走。

**只对带 tracker 的值成立。**`getTraceable` 遇到没有 tracker 的值原样返回：用 `ctx.provide(键, 普通对象)` 登记的服务，
方法里没有「调用方的 ctx」可取，同样的写法会把效应记到别处（或根本拿不到 `this.ctx`）。要靠这条机制的服务，定义成 `Service`。

**想当然的理解**：服务方法里的 `this.ctx` 就是服务自己装载时的那个上下文，登记会挂在服务的 fiber 上、随服务一起撤。

**实际（4.1.0 取证）**：`Service` 构造时设了 `tracker`（`property: 'ctx'`），`ctx.get` 用 `getTraceable(this.ctx, …)` 包装，
代理在读 `ctx` 这个属性时返回发起读取的上下文。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `service.ts` 构造函数 | `tracker = { associate: name, property: 'ctx' }`，挂到实例上 | 读源码 42–58 行 |
| `reflect.ts` `get` | `return getTraceable(this.ctx, this._getImpl(name, strict)?.value)` | 读源码 247–249 行 |
| `utils.ts` `getTraceable`／`createTraceable` | 无 tracker 原样返回；代理的 `get` 在 `prop === tracker.property` 时返回使用处的 ctx（`useSite`），也就是调用方 | 读源码 118–125、167–177 行 |
| `fiber.ts` `effect` | 返回 `Disposable`／`AsyncDisposable` | 读源码 421–424 行，或跑探针第 2 条 |

## 探针断言什么

探针在 `packages/assembly/kernel-basis/tests/`，随该成员的测试运行，针对 Cordis 4.1.0 核对：

1. 注册表 `Service` 的 `register(entry)` 写成 `this.ctx.effect(() => { 加入; return 移除 })`；
   一个 inject 了它的贡献者插件登记一条，撤除贡献者后这条不在了，注册表的 fiber 仍是 `ACTIVE`。
2. 同样登记后，单独调用 `register` 返回的撤除函数，这条也不在了。

上游若让服务代理不再把 `this.ctx` 换成调用方（效应落到注册表自己的 fiber 上），第 1 条失败；
若 `effect` 不再返回撤除函数，第 2 条失败——本条目随之失效。

## 已知的误用

- **注册表自己维护「谁登记了什么」再等人来注销**：调用方崩溃或被撤时没人来注销，登记就漏了。用本条的机制，撤除自动发生。
- **用普通对象当注册表服务**：没有 tracker，`this.ctx` 不是调用方的，登记不会随调用方撤除。
