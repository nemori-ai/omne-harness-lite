# @omne-harness/kernel-basis

[English](README.md)

业务包共用的操作结果、Cordis 插件辅助，以及只给测试用的 Context 装配。行为契约在 [SPEC.md](SPEC.md)。[#248 技术采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/248#issuecomment-6176737639)已经接受该契约。`./cordis` 导出 `definePlugin` 和 `resolveOptional`。根入口的操作结果和 `./testing` 未实现。

## 职责与状态

本成员为业务包准备三个公开入口。`./cordis` 导出 `definePlugin` 和 `resolveOptional`。根入口不导入 `@deepseek-ai/cordis`。根入口的操作结果未实现。`./testing` 只有入口登记，具名消费未定，因此未实现。

本包不声明服务键，不收回其他能力的 Service 定义。Cordis 拥有 Fiber 状态。assembly 的关闭协议拥有产品关闭顺序。

## 使用

根入口的操作结果未实现。下面是已接受的形状，本包不导出这些函数。

```ts
import { ack, fail, isSuccess, succeed } from '@omne-harness/kernel-basis'

const valued = succeed({ id: 'job-1' })
const empty = ack()
const broken = fail('rejected' as const)

isSuccess(valued) // true，valued.ok 是 { id: 'job-1' }
isSuccess(empty) // true，empty.ok 是 true
isSuccess(broken) // false
```

`./cordis` 的插件辅助：

```ts
import { definePlugin, resolveOptional } from '@omne-harness/kernel-basis/cordis'

const plugin = definePlugin({
  name: 'example',
  Config: {
    '~standard': {
      version: 1 as const,
      vendor: 'example',
      validate: (value: unknown) => ({ value: value as { timeoutMs: number } }),
    },
  },
  inject: ['clock'],
  apply(ctx, config) {
    const optional = resolveOptional<{ ping(): void }>(ctx, 'probe')
    optional?.ping()
    void config.timeoutMs
  },
})
```

`./testing` 未实现。产品源码不得导入它。

只导入根入口的调用方不启动 Cordis。使用 `./cordis` 的调用方用 Cordis 4.0.4 做校验、注入和 fiber 生命周期。

## 契约

[SPEC.md](SPEC.md) 拥有结果形状、`definePlugin`、`resolveOptional`、测试装配、消费者对照和 Cordis 证据表。

`Outcome<T, F>` 是 `{ ok: T } | { failure: F }`。`Ack<F>` 是 `{ ok: true } | { failure: F }`。`F` 归调用方。对象带有 `ok` 时 `isSuccess` 为真。

## 设计

根入口不导入 Cordis。`./cordis` 放 `definePlugin` 和 `resolveOptional`。必需依赖放进 `inject`。可选依赖在调用时用 `resolveOptional`。`./testing` 未实现。产品源码不能导入这个入口。

Cordis 仍负责组合、依赖注入和生命周期。assembly 仍负责求值、采用、交接和租约关闭协议。

## 配置与运行

本包依赖 `@deepseek-ai/cordis` 4.0.4，发布提交是 `d0dca04e22f09fe04967090b2ee70587ecdad6cc`。安装本包会带上 Cordis，即使用户只用根入口。本包不增加运行时配置。探针按任务使用 Node.js `>=24.0.0`。本包 `engines` 是 `>=24.18.0 <25`。这次不改那个字段。engines 的修改归工程工具链。

## 验证

单元测试和契约测试归本成员。`./cordis` 的测试从公开入口导入，并使用 Cordis 4.0.4，不用假容器。根入口测试断言根模块不导出 `definePlugin` 或 `resolveOptional`，生成的根文件也不提及 Cordis。`./testing` 未实现。`verification/cordis-4.0.4-probes.mjs` 的较早观察写在 SPEC.md。集成测试和端到端测试不适用。本包没有存储、应用服务或用户旅程。

## 维护

公开契约的接受变更先改 SPEC.md，再同步两份 README。根入口的操作结果和 `./testing` 在出现具名消费者之前不进入这个包。跨成员架构页仍归其拥有者。
