# 执行环境契约与 Cordis

本成员是 `module` 变体。它没有 `src/cordis.ts`，没有 `./cordis` 入口，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定，也不引入 Cordis 依赖。

## 适用性

本成员不需要 Cordis 集成。根入口按 [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 与 Cordis 无关，只提供类型、设施声明、schema、块声明与纯函数。理由是变化原因不同：

- 环境要求、设施协议、获取与租约、端口与块声明随执行环境的语义变。
- 服务键、调用方类、登记的效应与撤除随装配约定变。

工具包写环境声明、设施拥有者发布设施声明、独立调用者核对环境要求时，都不应因此加载 Cordis。测试 `tests/public-entry.spec.ts` 逐个模块核对根入口不导入 Cordis。

Cordis 相关的责任在组内其他成员：

- 唯一的服务定义 `executionEnvironment`、intercept 配置与调用方类：[execution-environment-cordis-contract 的 Cordis 说明](../../execution-environment-cordis-contract/docs/cordis.md)。
- 不含 Cordis 的登记表机制：[execution-environment](../../execution-environment/README.md)。
- Service 实现、宿主提供者与撤除保留：[execution-environment-host-local](../../execution-environment-host-local/README.md)。

提供者撤除与 Cordis 撤除的关系归 [INV-EE18](../SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)：撤除注册不丢弃旧工作，disposer 不自动兑现实际停止或耐久。以后若需要本成员直接提供 Cordis 绑定，先按组的[成员与依赖](../../docs/architecture.md#成员与依赖)重新判断归属，不在本成员里加 `./cordis` 入口。`documentation.json` 把本文件记为 `not-applicable`。
