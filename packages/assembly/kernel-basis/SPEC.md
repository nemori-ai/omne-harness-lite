# kernel-basis 行为规格

本文件是 `@omne-harness/kernel-basis` 的候选契约，供 #248 请求技术接受。PanQiWei 接受之前，它不是现行实现承诺。`src` 仍是空导出。实现和探针文件搬迁归 #270。

包组织页已经接受三份入口。根入口导出操作结果，并且不导入 `@deepseek-ai/cordis`。插件辅助从 `./cordis` 导出。测试装配从 `./testing` 导出。本包不声明服务键，不收回其他能力的 Service 定义。

## 操作结果

根入口提供两种结果。失败字面量 `F` 由调用方契约规定。本包不规定共同的失败词汇。

```ts
type Outcome<T, F> = { ok: T } | { failure: F }
type Ack<F> = { ok: true } | { failure: F }
```

`succeed(value)` 返回 `{ ok: value }`。`ack()` 返回 `{ ok: true }`。`fail(failure)` 返回 `{ failure }`。不存在字符串 `'ok'`。

`isSuccess` 对 `Outcome` 和 `Ack` 都成立的条件是结果对象带有 `ok`。带值成功里 `ok` 是载荷 `T`。无值成功里 `ok` 只是 `true`，不携带业务载荷。两种类型不合并成一个信封。

根入口的源码、声明和运行不导入 Cordis。#270 在实现时核对安装闭包是否引入 Cordis。入口分开不等于安装闭包已经隔离。

## 插件辅助

`definePlugin` 的输入和返回值是同一组字段。

```ts
type DefinePluginInput<C, Config> = {
  name: string
  Config: C
  inject?: readonly string[]
  apply: (ctx: Context, config: Config) => void | Promise<void>
}

function definePlugin<C, Config>(input: DefinePluginInput<C, Config>): DefinePluginInput<C, Config>
```

`Config` 是 Standard Schema。返回值不带 `provide` 或 `intercept`，也不声明服务键。Cordis 4.0.4 在调用 `apply` 之前校验 `Config`。校验失败时 fiber 进入失败状态，`apply` 不运行。不能静默跳过缺失的引用。

必需依赖写在 `inject`。可选依赖不写进 `inject`。

`resolveOptional<T>(ctx: Context, name: string): T | undefined` 在调用时执行 `ctx.get(name)`。缺席结果是 `undefined`，插件保持装载。`T` 是调用方断言，不是本包证明的服务形状。

直接 `ctx.get` 已经能读可选服务。`resolveOptional` 不增加查找能力。它保留，是因为 [IC-9](../../../docs/architecture/cordis-integration-conventions.md) 把这次读取点名为项目辅助，并固定缺席为 `undefined`。

Cordis 已经接受一个插件对象。`definePlugin` 多做的是强制 `Config`，并丢掉 `provide` 和 `intercept`。[IC-14](../../../docs/architecture/cordis-integration-conventions.md) 要求函数插件走这个辅助。直接写插件对象可以省略 `Config`。

`FIBER_STATE` 和 `fiberIsActive` 不是公开辅助。Fiber 状态留在 Cordis。`ACTIVE` 不等于存储可写、远端可达或工作已恢复。

## 测试装配

`./testing` 导出一个函数。#270 选定它的标识符。标识符变化不得改变下面的形状。

```ts
type TestPlugin = {
  name: string
  inject?: readonly string[]
  apply: (ctx: Context) => void | Promise<void>
}

type TestAssembly = {
  context: Context
  dispose: () => Promise<void>
}

type TestAssemblyStartFailed = {
  startError: unknown
  disposeError?: unknown
}
```

函数接受 `readonly TestPlugin[]`，按数组顺序装载，并返回 `Promise<TestAssembly>`。`context` 是这次测试新建的 Context。`dispose` 只撤除这次调用已经启动的 Fiber，按启动的相反顺序。某个 `dispose` 拒绝时，`TestAssembly.dispose` 以该拒绝失败，不返回成功。

某个 `apply` 抛错时，函数先撤除已经启动的 Fiber，包括失败的那一个。撤除成功时，函数抛出原来的 `startError`。撤除也失败时，函数抛出 `TestAssemblyStartFailed`，同时带上 `startError` 和 `disposeError`。不得吞掉 `disposeError`。

函数不关闭调用方传入的资源，不选择后端，不规定业务关闭顺序。产品源码不得导入 `./testing`。产品关闭仍用 assembly 的关闭协议。

Cordis 负责运行中的依赖换代和 `fiber.restart`。测试装配不做这件事。关闭协议负责计划退出时的一组租约。关闭协议不打开代际，也不把租约迁到另一个提供者。

## 消费者

| 能力 | 入口 | 已接受依据 | 新源码调用点 | 为什么不直接用 Cordis |
| --- | --- | --- | --- | --- |
| 带值操作结果 | 根 | 包组织页的操作结果入口 | 无 | Cordis 没有这种结果类型 |
| 无值操作结果 | 根 | 同上 | 无 | 同上 |
| `definePlugin` | `./cordis` | [IC-14](../../../docs/architecture/cordis-integration-conventions.md) | 无 | Cordis 接受的插件对象可以省略 `Config` |
| `resolveOptional` | `./cordis` | [IC-9](../../../docs/architecture/cordis-integration-conventions.md) | 无 | `ctx.get` 已经够用。辅助只固定缺席和类型断言 |
| 测试装配 | `./testing` | 包组织页的 `./testing` 入口 | 无。具体测试作者待各成员落地 | Cordis 不提供「只撤除本次启动的 Fiber，并同时报告启动失败和撤除失败」 |

旧包 `@omne-harness-lite/kernel-basis` 的 import 次数只是线索。它们不成为新消费者，也不要求恢复旧运行依赖。没有上表依据的辅助退出公开包。服务键留在各能力的定义拥有者。本卡不编造业务成员里的生产调用点。

## 入口闭包

根入口的源码不导入 `@deepseek-ai/cordis`。#270 生成的根声明也不得引用 Cordis。调用根入口的 `succeed`、`ack`、`fail` 和 `isSuccess` 不得创建 Context。

`./cordis` 和 `./testing` 的源码与声明可以引用 Cordis。

当前 `package.json` 把 `@deepseek-ai/cordis` 放在整个包的 `dependencies` 里。安装这个包就会安装 Cordis，即使调用方只用根入口。一个包给不出两套安装闭包。这次不把 Cordis 改成可选依赖。根入口的源码隔离不等于安装隔离。

## Cordis 证据

npm 上的 `@deepseek-ai/cordis@4.0.4` 没有 `gitHead`。对应的上游发布提交是 [d0dca04e22f09fe04967090b2ee70587ecdad6cc](https://github.com/deepseek-ai/deepseek-harness/commit/d0dca04e22f09fe04967090b2ee70587ecdad6cc)，说明为 `release(vendor): cordis 4.0.4`。DeepSeek Harness 文档的 master 快照不是这个钉的保证。

本卡探针在 `verification/cordis-4.0.4-probes.mjs`。它只导入 `@deepseek-ai/cordis@4.0.4`，不导入旧树。2026-10-15 在 Node.js v26.0.0 上运行，进程打印了四条结果后退出码为 0。

| 行为 | 档 | 这次探针看到的结果 |
| --- | --- | --- |
| 服务方法里的 `this.ctx` 跟随调用方 | 探针结果 | 调用方 `dispose` 后，方法里登记的 effect 被撤掉。注册表 fiber 的 `state` 仍是 2 |
| `isolate` 隐藏父级服务实例 | 探针结果 | 子插件读属性抛出 `cannot get property "scoped" without inject`。`get` 得到 `undefined` |
| 同一提供者上 `set` 新值 | 探针结果 | 依赖该键的插件体不重跑。之后的 `get` 读到新值 |
| 撤掉提供者再装另一个提供者 | 探针结果 | 消费者插件体再跑一次。提供者出现前，插件体运行次数是 0 |
| `apply` 返回后 effect 里的 Promise 拒绝 | 探针结果 | fiber 的 `state` 仍是 2。拒绝进入 `unhandledRejection`，消息是 `after-active` |
| 配置在插件体之前按 Standard Schema 校验 | 项目陈述 | IC-14 引用 4.0.4 的 `registry.ts` 与 `fiber.ts`。本卡没有另写这条探针 |
| effect 释放次序 | 项目陈述 | 生命周期页。完成顺序不是业务关闭顺序。本卡没有另写这条探针 |
| `ACTIVE` 不是业务就绪 | 项目陈述 | 生命周期页 |

已发布源码里 `_getState` 在 fiber 仍有 uid、没有 `_error`、epoch 不是 inactive 时返回 2。上表的 2 是这个返回值。

旧探针文件仍在 `packages.0.0.1.legacy/core/kernel-basis`。搬迁归 #270。本规格不把旧包当成新的辅助层。

## 验收对照

C1。消费者表链接 IC-9、IC-14 和包组织页。新源码没有调用点。旧 import 只是线索。Fiber 状态辅助不进入公开入口。`resolveOptional` 写明 Cordis 的 `ctx.get` 已经够用。

C2。`definePlugin`、`resolveOptional` 和测试装配的类型、失败与撤除写在本文件。根入口不导入 Cordis。安装这个包仍会安装 Cordis。本包不侵占 assembly 的关闭协议。

C3。版本钉到 npm 4.0.4 和发布提交 `d0dca04e22f09fe04967090b2ee70587ecdad6cc`。影响契约的四项未知已有探针结果。配置校验和 effect 次序仍是项目陈述，本卡没有另写探针。

C4。#270 按本文件实现公开行为、选定测试装配的导出名，并搬迁旧探针文件。本文件不声称生产包已经实现。D-03 接受技术选择。D-04 才接受整卡结果。
