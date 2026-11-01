# Runtime Context 公开接口导航

精确签名归源码，行为归 [SPEC](../SPEC.md)。根入口不依赖 Cordis。`./testing` 提供用例列表和非耐久替身，不能证明真实机制的持久与并发保证。

## 导出入口

- [根入口](../src/index.ts)：值、类型与纯函数。
- [testing 入口](../src/testing/index.ts)：测试辅助。

## 定义索引

以下各节按模块导航实际导出。精确定义只在链接的 `src/` 文件维护，本页不复制声明。

## 共享类型

定义见 [shared.ts](../src/shared.ts)。

`ScopeRef`, `ContextBlockKey`, `ConsumerClass`, `ContextBlocks`, `ScopeText`, `BlockValue`, `RegistrationRevision`, `ViewRevision`, `BlockRevision`, `Generation`, `CommitRef`, `ProducerRef`, `StepRef`, `UpdateOriginRef`。

## 块声明

定义见 [descriptor.ts](../src/descriptor.ts)。

`BlockDescriptorBase`, `SuppliedBlockDescriptor`, `StatefulBlockDescriptor`, `ContextBlockDescriptor`, `DescriptorCatalog`, `declarationDigest`。

## 需要与绑定

定义见 [need.ts](../src/need.ts)。

`Necessity`, `ContextNeed`, `Translation`, `NeedBinding`, `NeedBindingRef`。

## 注册与资格

定义见 [registration.ts](../src/registration.ts)。

`Registration`, `RegistrationChange`, `EligibilityId`, `EligibilityState`, `Eligibility`, `EligibilityMaterial`。

## 读者与观察

定义见 [reader.ts](../src/reader.ts)。

`Cursor`, `ReadRefusalReason`, `MissingCause`, `UnknownCause`, `MissingItem`, `RevisionPair`, `ReadOutcome`, `SourceEvidence`, `NeedValue`, `NeedRequest`, `ReadResult`, `BlockState`, `BlockEntry`, `PerRequestEntry`, `Snapshot`, `ChangeEntry`, `Changes`, `SnapshotResult`, `CursorInvalidated`, `ChangesResult`, `ContextReader`, `PreviousValue`, `ChangeMaterial`。

## 生产者面

定义见 [producer.ts](../src/producer.ts)。

`SupplyAnswer`, `SupplyInput`, `SupplyCallback`, `ProducerRegistration`, `PublishInput`, `PublishResult`, `InvalidateTarget`, `InvalidateResult`, `ProducerHandle`。

## 权威端口

定义见 [authority.ts](../src/authority.ts)。调用方提供这两个端口，本成员不签发身份，见 [SPEC 通用权威端口](../SPEC.md#通用权威端口)。

`ScopeBinding`, `ScopeBindingSource`, `AuthorityDecision`, `OrdinaryHolderAction`, `BeginReplayAction`, `FinishReplayAction`, `HolderAction`, `HolderDecision`, `ProducerAction`, `RuntimeContextAuthority`, `CheckCause`, `CheckUnavailable`, `CheckUnknown`, `RuntimeContextTrust`。

`RuntimeContextTrust` 定义见 [trust.ts](../src/trust.ts)，只是装配入口交入两个原端口的构造参数，没有新权限或生命周期。

## 恢复会话

定义见 [replay.ts](../src/replay.ts)。行为见 [SPEC RC-09](../SPEC.md#rc-09-作用域结束恢复会话与恢复后供值)。

`ReplayRef`, `BeginReplayInput`, `ReplayBlock`, `ReplayMaterial`, `FinishReplayInput`, `ReplayPrevious`, `AppliedCommit`, `BeginReplayResult`, `FinishReplayResult`。

## 状态块

定义见 [update.ts](../src/update.ts)。

`ContextUpdate`, `StepBlockMaterial`, `StepCommit`。

## 操作面

定义见 [operations.ts](../src/operations.ts)。

`RegisterProducerResult`, `ProducerOperations`, `PrepareRegistrationResult`, `IssueEligibilityResult`, `RevokeEligibilityResult`, `CommitInput`, `ApplyCommitResult`, `HolderOperations`, `BindResult`, `ReaderOperations`, `RuntimeContextOperations`。

## 定义核对

定义见 [judge.ts](../src/judge.ts)。

`NeedRejection`, `judgeNeed`, `BindingRejection`, `judgeBinding`, `RegistrationRejection`, `JudgeRegistrationContext`, `JudgedRegistration`, `judgeRegistration`。

## 解码

定义见 [decode.ts](../src/decode.ts)。

`ScopeRefRejection`, `ContextBlockKeyRejection`, `decodeScopeRef`, `decodeContextBlockKey`。

## 步合并

定义见 [reduce.ts](../src/reduce.ts)。

`UpdateRejection`, `RejectedUpdate`, `ReduceStepInput`, `ReduceStepResult`, `reduceStep`。

## 变化材料

定义见 [diff.ts](../src/diff.ts)。

`DiffInput`, `diffForReminder`。

## 替身

定义见 [testing/memory.ts](../src/testing/memory.ts)。替身必须带两个权威端口，没有免核验模式。

`MemoryRuntimeContextOptions`, `MemoryRuntimeContext`, `createMemoryRuntimeContext`。

## 权威端口替身

定义见 [testing/ports.ts](../src/testing/ports.ts)。只供测试：绑定表信任测试写入的绑定，默认授权每次调用，直到脚本或 `revokeAll` 改变答复。

`createTestAuthorityPorts`, `TestAuthorityPorts`, `AuthorityCall`, `AuthorityFace`, `AuthorityScript`。

## 用例形制

定义见 [testing/case.ts](../src/testing/case.ts)。

`ConformanceCase`, `NotApplicable`, `CaseVerdict`, `runConformanceCase`。

## 契约套件

定义见 [testing/conformance.ts](../src/testing/conformance.ts) 与 [testing/suite.ts](../src/testing/suite.ts)。夹具的 `subject(ports)` 必须让被测对象使用套件给出的两个端口。

`RuntimeContextFixture`, `RuntimeContextPorts`, `RUNTIME_CONTEXT_OBLIGATIONS`, `RuntimeContextObligation`, `runtimeContextConformance`。

## 受信构造套件

定义见 [testing/trust.ts](../src/testing/trust.ts) 与 [testing/trust-conformance.ts](../src/testing/trust-conformance.ts)。夹具的 `create` 必须让返回的 `trust` 使用套件给出的两个原端口；`controls` 的四个控制各自同步使对应来源失效。固定替身只供测试，标 `durability: 'none'`，不进根入口。

`RuntimeContextTrustControls`, `RuntimeContextTrustFixture`, `TestRuntimeContextTrust`, `createTestRuntimeContextTrust`, `RUNTIME_CONTEXT_TRUST_OBLIGATIONS`, `runtimeContextTrustConformance`。
