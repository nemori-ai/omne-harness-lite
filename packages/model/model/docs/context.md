# Model 实现的消费与构造

本包面向选择默认领域算法的独立程序及运行宿主，已有凭据判定，托管运行工厂尚未实现。普通调用者消费 [model-contract](../../model-contract/docs/context.md) 并取得注入的操作能力，不必安装本实现。

独立程序以固定请求、显式传输和 signal 调用 executeModel。宿主将 Commands、发送围栏、重试策略、实例宿主和时钟注入 createModelRuntime，并显式传入配置。精确构造形状归 [public-api](public-api.md)，独立执行及配置行为归 [SPEC](../SPEC.md)。

model 的生产安装不得带入 Cordis 或固定单机存储，也不自动安装全部厂商或 tokenizer。凭据切片的类型、服务定义、本地存储与插件已按[组架构](../../docs/architecture.md#凭据切片的现有装配边界)迁到对应成员，本包源码不再使用它们；包清单里的旧依赖随收口删除。应用选择适配器并拥有资源；单机框架装配设计暂见 [cordis](cordis.md)。

## 独立消费入口

根入口导出存在性与解析的判定函数和它们读取的状态快照类型。保管实现构造快照并调用判定：

```ts
import { judgeResolution, type CustodianState } from '@omne-harness/model'

declare const state: CustodianState
const decision = judgeResolution(state, reference, { authorized: true, official: false })
```

本地文件保管库和 Cordis 插件由 [model-host-local](../../model-host-local/docs/context.md) 提供，用法、新建与重开的区别、刷新与写入语义见该成员。
