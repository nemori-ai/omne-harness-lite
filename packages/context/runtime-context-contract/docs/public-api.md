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

`SupplyAnswer`, `SupplyCallback`, `ProducerRegistration`, `PublishResult`, `InvalidateResult`, `ProducerHandle`。

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

定义见 [testing/memory.ts](../src/testing/memory.ts)。

`MemoryRuntimeContextOptions`, `MemoryRuntimeContext`, `createMemoryRuntimeContext`。

## 用例形制

定义见 [testing/case.ts](../src/testing/case.ts)。

`ConformanceCase`, `NotApplicable`, `CaseVerdict`, `runConformanceCase`。

## 契约套件

定义见 [testing/conformance.ts](../src/testing/conformance.ts)。

`RuntimeContextFixture`, `RUNTIME_CONTEXT_OBLIGATIONS`, `RuntimeContextObligation`, `runtimeContextConformance`。
