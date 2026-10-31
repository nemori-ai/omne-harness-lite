# 执行环境登记表与 Cordis

本成员是 `module` 变体。它没有 `src/cordis.ts`，没有 `./cordis` 入口，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定，也不引入 Cordis 依赖。

## 适用性

本成员不需要 Cordis 集成。根入口按 [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 与 Cordis 无关，只导出一个不依赖 Cordis 的工厂与一个错误类。理由是变化原因不同：表、匹配顺序、获取状态转移、逐操作门与恢复编排随机制算法变，服务键、登记的效应、调用方类与撤除顺序随装配约定变。独立调用方使用登记表时，不应因此加载 Cordis。[public-entry.spec.ts](../tests/public-entry.spec.ts) 核对本成员的任何模块都不导入 `@deepseek-ai/cordis`。

本成员不从 fiber 取登记的寿命。它只返回撤除函数，由调用方决定何时调用。把撤除函数挂到调用方 fiber 上，是 Cordis 成员替它完成的：

- 服务键、抽象类、intercept 配置与登记协议：[execution-environment-cordis-contract 的 Cordis 说明](../../execution-environment-cordis-contract/docs/cordis.md)。
- Service 实现、登记即效应、服务撤除时的关闭与撤除失败的报告：[execution-environment-host-local 的 Cordis 说明](../../execution-environment-host-local/docs/cordis.md)。

以后若需要本成员直接提供 Cordis 绑定，先按组的[主题与唯一拥有者](../../docs/architecture.md#主题与唯一拥有者)重新判断归属，不在本成员里加 `./cordis` 入口。`documentation.json` 把本文件记为 `not-applicable`。
