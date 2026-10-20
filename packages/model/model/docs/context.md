# Model 实现的消费与构造

本包面向选择默认领域算法的独立程序及运行宿主，已有 executeModel 独立执行及凭据判定，createModelRuntime 已支持受理、查询、取消意图与首次分派，createModelSendBoundary 可由受信消费者直接使用；driver 尚未接入事实消费者，其他托管业务行为尚未实现。普通调用者消费 [model-contract](../../model-contract/docs/context.md) 并取得注入的操作能力，不必安装本实现。

独立程序以固定请求、显式传输和 signal 调用 executeModel。宿主将 Commands、发送围栏、重试策略、实例宿主和时钟注入 createModelRuntime，并显式传入配置。精确构造形状归 [public-api](public-api.md)，独立执行及配置行为归 [SPEC](../SPEC.md)。

model 的生产安装不得带入 Cordis 或固定单机存储，也不自动安装全部厂商或 tokenizer。凭据引用与解析的类型、服务定义、本地存储与插件按[组架构](../../docs/architecture.md#凭据的现有装配边界)归对应成员，本包源码与包清单不含它们。应用选择适配器并拥有资源；单机框架装配设计暂见 [cordis](cordis.md)。

## 独立消费入口

根入口导出存在性与解析的判定函数和它们读取的状态快照类型。保管实现构造快照并调用判定：

```ts
import { judgeResolution, type CustodianState } from '@omne-harness/model'

declare const state: CustodianState
const decision = judgeResolution(state, reference, { authorized: true, official: false })
```

本地文件保管库和 Cordis 插件由 [model-host-local](../../model-host-local/docs/context.md) 提供，用法、新建与重开的区别、刷新与写入语义见该成员。

## 受控测试装配

从 [公开测试入口](public-api.md#内存测试入口) 取得内存 Commands 或五依赖装配。测试拥有者提供可信 authority、evidence、owner 声明和有限配置。不要将控制器或测试声明发布给普通业务消费者。

真实 runtime 使用 Commands 与宿主唤醒实现受理和首次 prepared 分派。需要验证 Commands 时直接驱动深接缝，需要验证生产 runtime 时等待真实运行实现及相应后端。内存分页采用 resultPageParts 与 resultPageTargetBytes，最终页包含完整块或未封值及真实 trims。超目标大项独页，整个页受原容量 C 约束，消费者不能把目标当硬缓冲上限。测试不证明生产运行、耐久或厂商行为。
