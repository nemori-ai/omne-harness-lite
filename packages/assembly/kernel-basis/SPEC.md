# kernel-basis 行为规格

本文件是 `@omne-harness/kernel-basis` 的目标契约，已由 PanQiWei 在 [#248 技术采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/248#issuecomment-6176737639)中接受。根入口为空导出。`./cordis` 导出 `definePlugin` 与 `resolveOptional`。`./testing` 导出 `startTestAssembly`。操作结果归 `@omne-harness/operation-result`，依据是 [#371 技术采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/371#issuecomment-6229850851)，契约见该成员的 [SPEC.md](../../common/operation-result/SPEC.md)。

本成员只服务 Cordis 集成与测试。根入口为空，并且不导入 `@deepseek-ai/cordis`。插件辅助从 `./cordis` 导出。测试装配从 `./testing` 导出。本包不声明服务键，不收回其他能力的 Service 定义。

## 插件辅助

`definePlugin` 的输入和返回值是同一组字段。

```ts
type SchemaSuccess<Output> = { readonly value: Output }
type SchemaFailure = { readonly issues: readonly { readonly message: string }[] }
type StandardSchema<Output> = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => SchemaSuccess<Output> | SchemaFailure | Promise<SchemaSuccess<Output> | SchemaFailure>
  }
}

type DefinedPlugin<Output> = {
  name: string
  Config: StandardSchema<Output>
  inject?: readonly string[]
  apply: (ctx: Context, config: Output) => void | Promise<void>
}

function definePlugin<Output>(input: DefinedPlugin<Output>): DefinedPlugin<Output>
```

`Config` 必须是上面的 Standard Schema。`apply` 的第二个参数就是该 schema 的 `Output`。数值 schema 不能配上接收字符串的 `apply`。返回值不带 `provide` 或 `intercept`，也不声明服务键。

可以独立消费的例子：

```ts
type ClockConfig = { timeoutMs: number }

const clockPlugin = definePlugin<ClockConfig>({
  name: 'example',
  Config: {
    '~standard': {
      version: 1,
      vendor: 'example',
      validate: value => ({ value: value as ClockConfig }),
    },
  },
  inject: ['clock'],
  apply(_ctx, config) {
    void config.timeoutMs
  },
})
```

例子里的 `validate` 只用来表明输出类型。它不是本包提供的校验器。Cordis 4.0.4 在调用 `apply` 之前执行 `Config` 的校验。校验失败时 fiber 进入失败状态，`apply` 不运行。不能静默跳过缺失的引用。

必需依赖写在 `inject`。可选依赖不写进 `inject`。

`resolveOptional<T>(ctx: Context, name: string): T | undefined` 在调用时执行 `ctx.get(name)`。缺席结果是 `undefined`，插件保持装载。`T` 是调用方断言，不是本包证明的服务形状。

直接 `ctx.get` 已经能读可选服务。`resolveOptional` 不增加查找能力。它保留，是因为 [IC-9](../../../docs/architecture/cordis-integration-conventions.md) 把这次读取点名为项目辅助，并固定缺席为 `undefined`。

Cordis 已经接受一个插件对象。`definePlugin` 多做的是强制 `Config`，并丢掉 `provide` 和 `intercept`。[IC-14](../../../docs/architecture/cordis-integration-conventions.md) 要求函数插件走这个辅助。直接写插件对象可以省略 `Config`。

`FIBER_STATE` 和 `fiberIsActive` 不是公开辅助。Fiber 状态留在 Cordis。`ACTIVE` 不等于存储可写、远端可达或工作已恢复。

## 测试装配

`./testing` 导出 `startTestAssembly`。标识符变化不得改变下面的形状。

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
  disposeErrors: readonly unknown[]
}

type TestAssemblyDisposeFailed = {
  disposeErrors: readonly unknown[]
}
```

函数接受 `readonly TestPlugin[]`。它先把每个插件交给新建 Context 的 `plugin`。`await plugin()` 返回时，必需依赖仍可能缺席。探针在 `@deepseek-ai/cordis@4.0.4` 上看到，缺席时该调用返回的 fiber `state` 为 0，`apply` 没有运行。因此函数不以单次 `await` 返回作为启动完成。

列表前面的插件可以依赖列表后面的插件提供的服务。函数提交完全部列表之后，再看每个插件的 `apply` 是否已经运行。后面的 `provide` 若满足前面的 `inject`，前面的 `apply` 必须在函数返回前已经运行。

若全部提交后仍有插件没有运行 `apply`，函数视为启动失败，不返回 `TestAssembly`。没有人提供的必需服务属于这种情况。

`context` 是这次测试新建的 Context。`dispose` 只撤除这次调用已经启动的 Fiber，按启动的相反顺序。某一个 `dispose` 拒绝后，函数继续撤除其余已启动的 Fiber。全部尝试结束后，若有拒绝，`TestAssembly.dispose` 抛出 `TestAssemblyDisposeFailed`。`disposeErrors` 保留每一次拒绝。不得在第一次拒绝时停下。

某个 `apply` 抛错，或提交完全部列表后仍有插件没有运行 `apply` 时，函数先撤除已经启动的 Fiber。撤除全部成功时，函数抛出原来的 `startError`。撤除有拒绝时，函数抛出 `TestAssemblyStartFailed`。`disposeErrors` 非空。不得吞掉其中的拒绝。

函数不关闭调用方传入的资源，不选择后端，不规定业务关闭顺序。产品源码不得导入 `./testing`。产品关闭仍用 assembly 的关闭协议。

Cordis 负责运行中的依赖换代和 `fiber.restart`。测试装配不做这件事。关闭协议负责计划退出时的一组租约。关闭协议不打开代际，也不把租约迁到另一个提供者。

## 消费者

| 能力 | 入口 | 已接受依据 | 具名计划消费 | 新源码调用点 | 为什么不直接用 Cordis |
| --- | --- | --- | --- | --- | --- |
| `definePlugin` | `./cordis` | [IC-14](../../../docs/architecture/cordis-integration-conventions.md) | IC-14 的函数插件 | 无 | Cordis 接受的插件对象可以省略 `Config` |
| `resolveOptional` | `./cordis` | [IC-9](../../../docs/architecture/cordis-integration-conventions.md) | IC-9 的可选依赖读取 | 无 | `ctx.get` 已经够用。辅助只固定缺席和类型断言 |
| 测试装配 | `./testing` | 包组织页登记了入口。PanQiWei 在 #270 把本次范围扩到这个入口。导出名是 `startTestAssembly` | 本包 `./testing` 测试 | 无业务成员调用点 | Cordis 的 `await plugin()` 返回不等于 `apply` 已运行，也不收集多次撤除失败 |

测试装配已由 PanQiWei 纳入 #270 本次范围。公开入口由本包测试消费。没有业务成员里的生产调用点。旧包 import 次数只是线索。服务键留在各能力的定义拥有者。

## 入口闭包

安装本包就会安装 Cordis。`package.json` 把 `@deepseek-ai/cordis` 放在 `dependencies` 里。本包只服务 Cordis 集成与测试。根入口为空导出，源码和生成的声明都不引用 Cordis。需要操作结果的调用方安装 `@omne-harness/operation-result`，那个成员的 `dependencies` 为空。

`./cordis` 和 `./testing` 的源码与声明可以引用 Cordis。

## Cordis 证据

npm 上的 `@deepseek-ai/cordis@4.0.4` 没有 `gitHead`。对应的上游发布提交是 [d0dca04e22f09fe04967090b2ee70587ecdad6cc](https://github.com/deepseek-ai/deepseek-harness/commit/d0dca04e22f09fe04967090b2ee70587ecdad6cc)，说明为 `release(vendor): cordis 4.0.4`。DeepSeek Harness 文档的 master 快照不是这个钉的保证。

本卡探针在 `verification/cordis-4.0.4-probes.mjs`。它只导入 `@deepseek-ai/cordis@4.0.4`，不导入旧树。2026-10-15 在 Node.js v26.0.0 上运行，进程打印五组结果后退出码为 0。

| 行为 | 档 | 这次探针看到的结果 |
| --- | --- | --- |
| 服务方法里的 `this.ctx` 跟随调用方 | 探针结果 | 调用方 `dispose` 后，方法里登记的 effect 被撤掉。注册表 fiber 的 `state` 仍是 2 |
| `isolate` 隐藏父级服务实例 | 探针结果 | 子插件读属性抛出 `cannot get property "scoped" without inject`。`get` 得到 `undefined` |
| 同一提供者上 `set` 新值 | 探针结果 | 插件体不重跑，`seenAfterSet` 仍是 `["a"]`。随后根上的 `get` 得到 `b` |
| 必需依赖缺席时 `await plugin()` | 探针结果 | 返回的 fiber `state` 为 0，`apply` 没有运行 |
| 撤掉提供者再装另一个提供者 | 探针结果 | 消费者插件体再跑一次。提供者出现前，插件体运行次数是 0 |
| `apply` 返回后 effect 里的 Promise 拒绝 | 探针结果 | fiber 的 `state` 仍是 2。拒绝进入 `unhandledRejection`，消息是 `after-active` |
| 配置在插件体之前按 Standard Schema 校验 | 探针结果 | 非法配置时 `apply` 不运行，失败稳定后的 fiber 状态是 `FAILED`。`validate` 返回 Promise 时抛出 `TypeError`，消息是 `Async config validation is not supported`。合法配置把 schema 的 `value` 交给 `apply`。类型里的 Promise 分支保留。 |
| effect 释放次序 | 探针结果 | 同一条 fiber 上，后登记的 effect 可以在先登记的 effect 仍在释放时结束。同一个 effect 内部，disposer 按登记逆序运行，并等待前一个 Promise。该完成顺序不是产品关闭顺序。 |
| 根已 `ACTIVE` 后装载并撤除一个带登记的插件 | 探针结果 | 插件不提供服务键，在插件体里用 `ctx.effect` 向注册表 `Service` 的 Map 写入一条登记。装载后 Map 有这条登记，`dispose` 后没有，fiber `state` 是 4（`DISPOSED`）。注册表提供者与已有消费者的插件体都只运行一次，fiber uid 不变，根仍是 2。探针是 `tests/late-plugin-load-unload-does-not-rerun-others.spec.ts`，对应 basis 条目 `late-plugin-load-unload-does-not-rerun-others`，2026-10-21 在 Node.js v26.12.0 上通过 |
| 异步监听者的返回值与 `bail` | 探针结果 | `ctx.bail` 同步派发，异步监听者返回的 Promise 本身被当作 bail 值，派发停在那里。`ctx.serial` 逐个 await 后按解析值判定。`ctx.emit` 丢弃返回值。探针是 `tests/async-control-not-bail.spec.ts`，对应 basis 条目 `async-control-not-bail`，2026-10-22 迁入本包后在 Node.js v26.12.0 上通过 |
| `ctx.<键>` 与 `ctx.get` | 探针结果 | 插件里读未声明的 `ctx.<键>` 抛错。`ctx.get(键)` 不看声明，直接读服务表。探针是 `tests/ctx-property-is-not-ctx-get.spec.ts`，对应 basis 条目 `ctx-property-is-not-ctx-get`，2026-10-22 迁入本包后在 Node.js v26.12.0 上通过 |
| effect 并发释放 | 探针结果 | 卸载 fiber 时各 effect 的 disposer 重叠运行。disposer 抛错只进 `ctx.logger.error`，卸载照常完成。同一 effect 内逆序释放。`UNLOADING` 后再建 effect 抛 `INACTIVE_EFFECT`。探针是 `tests/effect-disposal-concurrent-not-ordered.spec.ts`，对应 basis 条目 `effect-disposal-concurrent-not-ordered`，2026-10-22 迁入本包后在 Node.js v26.12.0 上通过 |
| `emit` 监听者抛错 | 探针结果 | `ctx.emit` 同步逐个调用监听者。监听者抛出的异常同步传回发事件的一方，后面的监听者不再运行。探针是 `tests/emit-listener-throw-propagates.spec.ts`，对应 basis 条目 `emit-listener-throw-propagates`，2026-10-22 迁入本包后在 Node.js v26.12.0 上通过 |
| `inject` 没有可选形式 | 探针结果 | 写进 `inject` 的服务缺席时 fiber `state` 为 0。`ctx.get` 不要求 inject，提供者不在或未 `ACTIVE` 时返回 `undefined`，提供者换代不重跑调用方。探针是 `tests/inject-has-no-optional-form.spec.ts`，对应 basis 条目 `inject-has-no-optional-form`，2026-10-22 迁入本包后在 Node.js v26.12.0 上通过 |
| `isolate` 隐藏实例不隔离数据 | 探针结果 | 两个标签下的服务实例共享同一数据句柄时，从标签 A 读得到属于 B 的数据。同标签重复 `provide` 抛错。同 label 两次 isolate 合流。探针是 `tests/isolate-hides-instances-not-data.spec.ts`，对应 basis 条目 `isolate-hides-instances-not-data`，2026-10-22 迁入本包后在 Node.js v26.12.0 上通过 |
| logger 级别序 | 探针结果 | 级别数值是 ERROR 0、INFO 1、WARN 2、DEBUG 3。exporter 不给阈值时只导出到 INFO。探针是 `tests/logger-level-order-error-lowest.spec.ts`，对应 basis 条目 `logger-level-order-error-lowest`，2026-10-22 迁入本包后在 Node.js v26.12.0 上通过 |
| 提供者换代重跑插件体 | 探针结果 | 必需服务换提供者时消费者插件体重跑。同一提供者实例内部状态变化不重跑。探针是 `tests/plugin-body-reruns-on-provider-change.spec.ts`，对应 basis 条目 `plugin-body-reruns-on-provider-change`，2026-10-22 迁入本包后在 Node.js v26.12.0 上通过 |
| 插件体抛错或 config 不过校验 | 探针结果 | 插件体抛错时 `await` 拒绝，fiber `state` 是 3。config 不过 Standard Schema 时错误含 `invalid config`，插件体不运行，服务不出现。合法 config 把校验后的值交给插件体。探针是 `tests/plugin-throw-fails-fiber.spec.ts`，对应 basis 条目 `plugin-throw-fails-fiber`，2026-10-22 迁入本包后在 Node.js v26.12.0 上通过 |
| 服务方法里的 `this.ctx` 是调用方 | 探针结果 | 方法里 `this.ctx.effect` 登记的东西归调用方 fiber。调用方撤除时登记被撤掉，注册表 fiber 的 `state` 仍是 2。探针是 `tests/service-method-ctx-is-caller.spec.ts`，对应 basis 条目 `service-method-ctx-is-caller`，2026-10-22 迁入本包后在 Node.js v26.12.0 上通过 |
| `Service` 子类在自己的键上提供 | 探针结果 | 抽象 `Service` 子类作为插件装载后，在 `super(ctx, key)` 给的键上提供服务。消费者按键取到子类实例。所属 fiber 撤除后键上没有服务。探针是 `tests/service-subclass-provides-its-key.spec.ts`，对应 basis 条目 `service-subclass-provides-its-key`，2026-10-22 迁入本包后在 Node.js v26.12.0 上通过 |
| `ACTIVE` 不是业务就绪 | 项目陈述 | 生命周期页 |

已发布源码里 `_getState` 在 fiber 仍有 uid、没有 `_error`、epoch 不是 inactive 时返回 2。上表的 2 是这个返回值。

配置校验和 effect 释放的新观察在本包测试里。basis 条目的探针也在本包 `tests/` 里，随本包测试运行。归档目录 `packages.0.0.1.legacy/core/kernel-basis` 只留两条不对应 basis 条目的旧探针。本规格不把旧包当成新的辅助层，也不从旧路径导入。

## 验收对照

C1。`definePlugin` 和 `resolveOptional` 的计划消费是 IC-14 和 IC-9。`startTestAssembly` 已由 PanQiWei 纳入 #270 本次范围，公开入口由本包测试消费。没有业务成员里的生产调用点。旧 import 只是线索。Fiber 状态辅助不进入公开入口。

C2。`definePlugin`、`resolveOptional` 和测试装配的类型、失败与撤除写在本文件。根入口为空导出，不导入 Cordis。安装这个包仍会安装 Cordis。本包不侵占 assembly 的关闭协议。

C3。版本钉到 npm 4.0.4 和发布提交 `d0dca04e22f09fe04967090b2ee70587ecdad6cc`。影响契约的四项未知已有探针结果。配置校验和 effect 次序已有本包测试中的探针结果。`ACTIVE` 不是业务就绪仍是项目陈述。

C4。本次交付实现了 `definePlugin`、`resolveOptional` 和 `startTestAssembly`。D-04 才接受技术选择。D-05 才接受整卡结果。
