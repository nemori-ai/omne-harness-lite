# Request Context Cordis 定义的公开接口导航

精确签名归源码，行为归 [SPEC](../SPEC.md)，机制归 [Cordis 说明](cordis.md)。

## 导出入口

根入口只发布类型；`./cordis` 发布 Cordis 服务定义。两者的定义索引如下。

## 定义索引

下列两节分别索引根入口与 Cordis 入口的公开定义。实际导出名字由源码及测试清单核对。

### 根类型导出

根入口 [src/index.ts](../src/index.ts) 显式重导出 request-context-contract 的全部类型名字。没有运行值，也不导入 Cordis。纯操作、Schema 和测试工厂仍从原契约入口导入。

### Cordis 定义

[src/cordis.ts](../src/cordis.ts) 导出抽象类 RequestContextService、派生键 requestContextKey、RequestContextIntercept、AssemblyAccess、RequestContextPolicySelection 和 RequestContextChangedPayload。它增补 Cordis Context 的 requestContext 属性及 Events 的 request-context-cordis-contract/changed 位置参数事件。

服务实现登记面的三个操作，参数与结果直接复用原契约；assembly(scope, ports) 返回绑定策略和本次端口的操作组，关闭后不可用。每次托管操作现取贡献，拒绝非 null 的调用方 promptContributions，拒绝作用域不一致。类型不提供运行时登记表、缓存或默认策略。

策略配置分开指定压缩和表示实现及其可序列化参数。提供者负责选择实现、用原契约的 Standard Schema 校验参数和管理生命周期。

[导出清单](../tests/fixtures/exports.json) 由共享工具核对声明、产物、导航与模块增补。[Cordis 探针](../tests/cordis-entry.spec.ts) 使用测试提供者验证真实 Cordis 4.0.4 的配置和生命周期；它不代替生产提供者验收。
