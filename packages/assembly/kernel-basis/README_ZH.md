# @omne-harness/kernel-basis

[English](README.md)

业务包共用的操作结果、Cordis 插件辅助，以及只给测试用的 Context 装配。行为契约在 [SPEC.md](SPEC.md)。它是 #248 的候选，不是已接受的实现。`src` 目前仍不导出任何值。

## 职责与状态

本成员为业务包提供三个公开入口。根入口导出操作结果，并且不导入 `@deepseek-ai/cordis`。`./cordis` 导出 `definePlugin` 和 `resolveOptional`。`./testing` 为测试装配 Context。

本包不声明服务键，不收回其他能力的 Service 定义。Fiber 状态留在 Cordis。产品关闭顺序留在 assembly 的关闭协议。探针文件留在旧树，直到 #270。

尚未实现。下面的签名是 #270 要兑现的契约。现在导入它们会失败，因为入口仍然是空导出。

## 使用

#270 替换空导出之后，根入口这样用：

```ts
import { ack, fail, isSuccess, succeed } from '@omne-harness/kernel-basis'

const valued = succeed({ id: 'job-1' })
const empty = ack()
const broken = fail('rejected' as const)

isSuccess(valued) // true，valued.ok 是 { id: 'job-1' }
isSuccess(empty) // true，empty.ok 是 true
isSuccess(broken) // false
```

插件辅助：

```ts
import { definePlugin, resolveOptional } from '@omne-harness/kernel-basis/cordis'

const plugin = definePlugin({
  name: 'example',
  Config: exampleSchema,
  inject: ['clock'],
  apply(ctx) {
    const optional = resolveOptional<{ ping(): void }>(ctx, 'probe')
    optional?.ping()
  },
})
```

`./testing` 为一次测试把插件装进 Context，并撤除它自己启动的 Fiber。产品源码不得导入它。导出名由 #270 选定。

只使用根入口的调用方不启动 Cordis。使用 `./cordis` 的调用方把校验、注入和 fiber 生命周期留给 Cordis 4.0.4。

## 契约

[SPEC.md](SPEC.md) 拥有结果形状、`definePlugin`、`resolveOptional`、测试装配、消费者对照和 Cordis 证据分档。

`Outcome<T, F>` 是 `{ ok: T } | { failure: F }`。`Ack<F>` 是 `{ ok: true } | { failure: F }`。`F` 归调用方。对象带有 `ok` 时 `isSuccess` 为真。

## 设计

根入口不依赖 Cordis，使一个包可以返回结果而不加载内核。`./cordis` 是贴着 Cordis 的薄辅助。必需依赖放进 `inject`。可选依赖在调用时用 `resolveOptional`。`./testing` 让测试不必各自再写一套 Context 启动，也让这份辅助进不了产品源码。

Cordis 仍负责组合、依赖注入和生命周期。assembly 仍负责求值、采用、交接和租约关闭协议。

## 配置与运行

候选版本钉是锁文件里的 `@deepseek-ai/cordis` 4.0.4。本包不增加运行时配置。后续探针按任务使用 Node.js `>=24.0.0`。本包 `engines` 仍写着 `>=24.18.0 <25`。这次不改那个字段。engines 的修改归工程工具链。

## 验证

单元测试和契约测试归本成员。#270 从三个公开入口测试。根入口测试不启动 Cordis。`./cordis` 测试使用 Cordis 4.0.4，不用假容器。`./testing` 测试证明它撤除自己启动的 Fiber，并且不关闭调用方传入的资源。

现在的测试只断言草稿导出为空。它们不证明候选契约。SPEC.md 里标成假设的 Cordis 行为，本卡没有跑探针。集成测试和端到端测试不适用。本包没有存储、应用服务或用户旅程。

## 维护

公开契约的接受变更先改 SPEC.md，再同步两份 README。#270 实现导出、选定 `./testing` 的名字，并搬迁探针文件。跨成员架构页仍归其拥有者。没有已接受消费者的辅助不进入公开包。
