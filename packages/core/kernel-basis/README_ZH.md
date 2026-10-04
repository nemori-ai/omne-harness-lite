# @omne-harness-lite/kernel-basis

[English](README.md)

面向官方 `@deepseek-ai/cordis` 4.0.4 内核的共用助手：类型化操作结果、插件定义、可选服务读取、Fiber 状态检查，以及独立的测试装配入口。

## Workspace 使用

这是实验阶段的私有 workspace 包，目前未发布到 npm。在仓库检出中按[开发指南](../../../docs/development.md)准备环境并构建 workspace，消费成员声明 `"@omne-harness-lite/kernel-basis": "workspace:*"`，示例直接导入的其他包也应声明为直接依赖。通过公开包入口导入，不穿透兄弟包的 `src/`。

## 公开 API

| 入口        | 公开 API                                                    |
| ----------- | ----------------------------------------------------------- |
| 包根入口    | `Outcome<T, F>`、`Ack<F>`、`succeed`、`fail`、`isSuccess`   |
| `./cordis`  | `PluginDefinition<C>`、`definePlugin`、`resolveOptional<T>` |
| `./cordis`  | `FIBER_STATE`、`FiberStateValue`、`fiberIsActive`           |
| `./testing` | `bootAssembly`、`settle`、装配类型及 `FIBER_STATE`          |

`Context`、`Fiber` 等 Cordis 原语直接从 `@deepseek-ai/cordis` 导入。本包不重新导出它们，也不注册服务。`Config` 接受 Standard Schema v1 校验器；示例使用 Zod。

根入口的源码、声明和运行导入闭包均不依赖 Cordis。插件与 Fiber 助手从 `./cordis` 导入，行为保持不变。

## 使用示例

每个 TypeScript 示例独立完整，使用构建后的公开导出。

### 定义插件并管理服务生命周期

```ts
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin, fiberIsActive, resolveOptional } from '@omne-harness-lite/kernel-basis/cordis'

const greeting = definePlugin({
  name: 'greeting',
  Config: z.object({ prefix: z.string().min(1) }),
  apply(ctx, config) {
    ctx.provide('greeting', { greet: (name: string) => `${config.prefix}, ${name}` })
  },
})
const ctx = new Context()
const fiber = ctx.plugin(greeting, { prefix: 'Hello' })
try {
  await fiber
  const service = resolveOptional<{ greet(name: string): string }>(ctx, 'greeting')
  if (service === undefined) throw new Error('greeting unavailable')
  console.log(service.greet('Ada')) // Hello, Ada
  console.log(fiberIsActive(fiber.ctx)) // true
} finally {
  await fiber.dispose()
}
console.log(resolveOptional(ctx, 'greeting')) // undefined
```

### 显式携带操作失败

```ts
import { fail, isSuccess, succeed, type Outcome } from '@omne-harness-lite/kernel-basis'

function lookup(available: boolean): Outcome<string, 'unavailable'> {
  return available ? succeed('ready') : fail('unavailable')
}
const result = lookup(false)
if (isSuccess(result)) console.log(result.ok)
else console.log(result.failure) // unavailable
```

### 装配带必需依赖的测试

```ts
import { z } from 'zod'
import { definePlugin, resolveOptional } from '@omne-harness-lite/kernel-basis/cordis'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'

const plugin = definePlugin({
  name: 'uses-settings',
  inject: ['settings'],
  Config: z.object({}),
  apply(ctx) {
    const settings = resolveOptional<{ greeting: string }>(ctx, 'settings')
    if (settings === undefined) throw new Error('settings unavailable')
    ctx.provide('message', settings.greeting)
  },
})
const assembly = await bootAssembly({
  services: [{ name: 'settings', value: { greeting: 'Hello' } }],
  plugins: [{ plugin, config: {} }],
})
try {
  console.log(resolveOptional<string>(assembly.ctx, 'message')) // Hello
} finally {
  await assembly.dispose()
}
```

## 边界与失败处理

这些助手采用 Cordis **4.0.4** 的语义。必需的 `inject` 依赖缺席时 Fiber 保持 pending；更换提供者会卸载并重跑插件体。`resolveOptional` 在调用时读取，提供者缺席或未 active 时返回 `undefined`，不会建立必需依赖。泛型类型由调用方断言，不构成服务校验。配置或插件体失败会使 `await fiber` 拒绝；配置失败发生在插件体运行之前。

`ctx.provide` 由 effect 管理。`isolate` 控制服务实例可见性，不提供数据或租户授权隔离。异步控制使用 `serial`：`bail` 把 Promise 本身当作 bail 值，不等待监听器。Fiber 撤除并发驱动不同 effect；disposer 失败可能只记日志，不使撤除拒绝。因此不能仅凭 `dispose()` 推断资源已按顺序成功释放。

`FIBER_STATE` 镜像 4.0.4 的 const-enum 数值：`PENDING=0`、`LOADING=1`、`ACTIVE=2`、`FAILED=3`、`DISPOSED=4`、`UNLOADING=5`。升级 Cordis 时重新检查本包的内核探针。测试装配遇到启动失败或缺必需依赖时拒绝，并逆序撤除已加载 Fiber；它不关闭经 `services` 传入的资源对象，资源拥有者须自行关闭。`./testing` 只供测试使用，不进入产品运行时代码。

## 开发

```sh
pnpm --filter @omne-harness-lite/kernel-basis run build
pnpm --filter @omne-harness-lite/kernel-basis run typecheck
pnpm --filter @omne-harness-lite/kernel-basis run test
```

先构建 workspace 依赖。这些检查覆盖本包；组合行为需针对实际消费者与提供者验证。
