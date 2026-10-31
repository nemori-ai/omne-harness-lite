# @omne-harness/kernel-basis

[English](README.md)

Cordis 插件辅助，以及只给测试用的 Context 装配。行为契约在 [SPEC.md](SPEC.md)。[#248 技术采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/248#issuecomment-6176737639)已经接受该契约。根入口为空导出。`./cordis` 导出 `definePlugin`、`resolveOptional`，以及调用方 fiber 登记辅助 `registerInCallerFiber` 与它的 `Admission` 类型（[#626 helper 采用](https://github.com/nemori-ai/omne-harness-lite/issues/626#issuecomment-6369465540)）。SPEC 中该辅助的一节是 #626 revision 4 的写回，它的接受在该卡交付时记录。`./testing` 导出 `startTestAssembly`。操作结果在 [`@omne-harness/operation-result`](../../common/operation-result/README_ZH.md)。

## 职责与状态

本成员服务 Cordis 集成和测试。根入口为空，并且不导入 `@deepseek-ai/cordis`。公开面在 `./cordis` 与 `./testing`。`./cordis` 导出 `definePlugin`、`resolveOptional`、`registerInCallerFiber` 和 `Admission`。`./testing` 导出 `startTestAssembly`，只给测试使用。产品源码不得导入 `./testing`。

本包不声明服务键，不收回其他能力的 Service 定义。Cordis 拥有 Fiber 状态。assembly 的关闭协议拥有产品关闭顺序。

## 使用

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

`registerInCallerFiber(ctx, admit, withdrawal)` 在调用方 fiber 的 effect 里登记目录型 Service 的一份贡献：`admit` 同步执行一次，回答 `entered`、`recognised` 或 `refused`；只有 entered 的条目保留 effect，其 disposer 调用一次 `withdrawal(entry)`。返回值是 `@omne-harness/operation-result` 的 `Outcome`。生命周期与失败边界在 [SPEC.md](SPEC.md#调用方-fiber-登记辅助)。

`startTestAssembly` 把测试插件装进新建的 Context，并按启动的相反顺序撤除它启动的 Fiber。产品源码不得导入 `./testing`。

根入口没有导出。使用 `./cordis` 的调用方用 Cordis 4.0.4 做校验、注入和 fiber 生命周期。

## 契约

[SPEC.md](SPEC.md) 拥有 `definePlugin`、`resolveOptional`、`registerInCallerFiber`、测试装配、消费者对照和 Cordis 证据表。结果形状和构造函数归 `@omne-harness/operation-result`。

## 设计

根入口为空。`./cordis` 放 `definePlugin`、`resolveOptional` 和 `registerInCallerFiber`。必需依赖放进 `inject`。可选依赖在调用时用 `resolveOptional`。`./testing` 放 `startTestAssembly`。产品源码不能导入这个入口。

Cordis 仍负责组合、依赖注入和生命周期。assembly 仍负责求值、采用、交接和租约关闭协议。

## 配置与运行

本包依赖 `@deepseek-ai/cordis` 4.0.4，发布提交是 `d0dca04e22f09fe04967090b2ee70587ecdad6cc`。安装本包就会安装 Cordis 与 `@omne-harness/operation-result`，因为 `./cordis` 返回 `Outcome`。本包只服务 Cordis 集成与测试。只需要操作结果的调用方安装 `@omne-harness/operation-result`。本包不增加运行时配置。探针按任务使用 Node.js `>=24.0.0`。本包 `engines` 是 `>=24.18.0 <25`。这次不改那个字段。engines 的修改归工程工具链。

## 验证

单元测试和契约测试归本成员。`./cordis` 和 `./testing` 的测试从公开入口导入，并使用 Cordis 4.0.4，不用假容器。根入口测试断言根入口没有运行时导出，并确认生成的根文件不提及 Cordis。`verification/cordis-4.0.4-probes.mjs` 的较早观察写在 SPEC.md。集成测试和端到端测试不适用。本包没有存储、应用服务或用户旅程。

## 维护

公开契约的接受变更先改 SPEC.md，再同步两份 README。跨成员架构页仍归其拥有者。
