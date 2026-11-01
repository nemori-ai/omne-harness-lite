# Runtime Context Cordis 定义的公开接口导航

精确签名以源码为准。行为归 [SPEC](../SPEC.md)，集成方式归 [Cordis 说明](cordis.md)。

## 导出入口

- [根入口](../src/index.ts)：显式重导出纯契约类型，没有运行值，不加载 Cordis。
- [cordis 入口](../src/cordis.ts)：抽象 Service、键常量、intercept 配置、事件类型与 Context 增补。

## 定义索引

全部导出均已实现，机读清单见 [exports.json](../tests/fixtures/exports.json)。根操作形状归纯契约的[定义索引](../../runtime-context-contract/docs/public-api.md#定义索引)。

## 契约词汇

[根入口](../src/index.ts) 的类型重导出由 [runtime-context-contract](../../runtime-context-contract/docs/public-api.md#定义索引) 唯一声明。清单逐名以 sameAs 核对符号身份，不复制签名。

`ScopeRef`, `ScopeText`, `ContextBlockKey`, `ConsumerClass`, `ContextBlocks`, `ContextBlockDescriptor`, `SuppliedBlockDescriptor`, `StatefulBlockDescriptor`, `ViewRevision`, `RegistrationRevision`, `EligibilityId`, `ProducerRegistration`, `RegisterProducerResult`, `ProducerHandle`, `RegistrationChange`, `PrepareRegistrationResult`, `EligibilityMaterial`, `Eligibility`, `IssueEligibilityResult`, `RevokeEligibilityResult`, `CommitInput`, `ApplyCommitResult`, `BindResult`, `ContextReader`, `RuntimeContextOperations`。

## 服务定义

定义见 [cordis.ts](../src/cordis.ts)。

- `RuntimeContextService`：抽象类，实现三面八操作。方法参数与结果从根契约推导；登记方法保留块键泛型。
- `runtimeContextKey`：只取自类的 provide。
- `RuntimeContextTrustService`：抽象类，逐属性投影根契约的 `RuntimeContextTrust`（`authority`、`bindings`）。键 `runtimeContextTrust` 只写在它的 `static readonly provide`。它是构造输入，不是 Runtime Context 能力。
- `runtimeContextTrustKey`：只取自该类的 provide。
- `runtimeContextScopeKey`：监听上下文的作用域标记键。
- `RuntimeContextIntercept`：调用方声明的消费者类。它不是读取资格。
- `RuntimeContextChangedPayload`：作用域与修订的解释类型。事件实际使用两个位置参数。

`Context` 增补 runtimeContext、runtimeContextTrust 与可选的作用域标记；`Events` 增补 runtime-context-cordis-contract/changed。事件按 emit 同步派发，不含块值。只监听事件的插件可用 type-only import 取得增补。
