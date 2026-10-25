# Request Context 公开接口导航

本页只导航公开名字。精确签名归 [src/index.ts](../src/index.ts)，行为归 [SPEC](../SPEC.md)，对象身份与生命周期归 [对象模型](object-model.md)。

## 导出入口

| 入口                                             | 源码                                            | 用途                                     |
| ------------------------------------------------ | ----------------------------------------------- | ---------------------------------------- |
| `@omne-harness/request-context-contract`         | [src/index.ts](../src/index.ts)                 | 纯操作、输入输出、端口、块声明及边界解码 |
| `@omne-harness/request-context-contract/testing` | [src/testing/index.ts](../src/testing/index.ts) | 非耐久替身与进程内契约套件               |

两入口都不依赖 Cordis。服务定义归 [request-context-cordis-contract](../../request-context-cordis-contract/README.md)。

## 定义索引

### 现有根导出

| 名称 | 定义与签名 |
| --- | --- |
| `ScopeRef`, `ContextBlockKey` | [@omne-harness/runtime-context-contract](../src/index.ts) |
| `Path`, `Decoded`, `Decoder` | [schema-primitives.ts](../src/schema-primitives.ts) |
| `standardSchema` | [schema-primitives.ts](../src/schema-primitives.ts) |
| `compactionPolicySchema`, `representationPolicyConfigSchema`, `planProgressSchema`, `compactionPlanSchema`, `coverageSchema` | [schema.ts](../src/schema.ts) |
| `ToolRoute`, `ToolDeclarationSet` | [values.ts](../src/values.ts) |
| `declareTools` | [declare-tools.ts](../src/declare-tools.ts) |
| `ConversionIndex` | [values.ts](../src/values.ts) |
| `RepresentationResult` | [representation.ts](../src/representation.ts) |
| `chooseRepresentations` | [representation.ts](../src/representation.ts) |
| `ProjectedMessage`, `ProjectedHistory` | [values.ts](../src/values.ts) |
| `HumanProjection` | [projection.ts](../src/projection.ts) |
| `project`, `projectForHuman` | [projection.ts](../src/projection.ts) |
| `CompactionSettingsValue`, `WindowUsageValue` | [blocks.ts](../src/blocks.ts) |
| `windowRatio`, `compactionSettingsSchema`, `windowUsageSchema`, `compactionSettingsBlock`, `windowUsageBlock` | [blocks.ts](../src/blocks.ts) |
| `SystemPromptResult` | [prompt.ts](../src/prompt.ts) |
| `assembleSystemPrompt` | [prompt.ts](../src/prompt.ts) |
| `Placement`, `PlacementInput` | [placement.ts](../src/placement.ts) |
| `SNAPSHOT_ANCHOR_RULE`, `placeContext` | [placement.ts](../src/placement.ts) |
| `Access`, `Adoption`, `DurableEvidence`, `RequestContextRef`, `CandidateRef`, `PositionRef`, `PlanId`, `EpochId`, `BatchRef`, `PassageRef`, `RegistrationRef`, `SourceGeneration`, `GroupToken`, `CommitOrder`, `AccountingGeneration`, `RecoveryGrantRef`, `PrincipalKey`, `HistorySequence`, `ContextTarget`, `RefKind`, `RefRejection` | [refs.ts](../src/refs.ts) |
| `REQUEST_CONTEXT_REF_MAX_LENGTH`, `decodeCandidateRef`, `decodePositionRef`, `decodePlanId`, `decodeEpochId`, `decodeBatchRef`, `decodePassageRef`, `decodeRegistrationRef`, `decodeSourceGeneration`, `decodeGroupToken`, `decodeCommitOrder`, `decodeAccountingGeneration`, `decodeRecoveryGrantRef`, `decodePrincipalKey`, `decodeHistorySequence`, `compareHistorySequence` | [refs.ts](../src/refs.ts) |
| `AssemblyPolicies`, `AssemblyOperations` | [ports.ts](../src/ports.ts) |
| `PreparedInputKey` | [values.ts](../src/values.ts) |
| `AssemblyOperationsInput` | [operations.ts](../src/operations.ts) |
| `createAssemblyOperations` | [operations.ts](../src/operations.ts) |
| `SourceRead`, `SourceGroupValue`, `GroupSource`, `ContextGroupSources`, `AdoptedRead`, `AdoptedRequestSource`, `SourceDecision`, `ContextReadEligibility`, `PrincipalBinding`, `ContextSources`, `SourceRegistrationAuthority`, `SourceSettlement`, `ContextRegistration`, `RegistrationResult`, `ContextSourceRegistry`, `ContextRegistryOptions` | [sources.ts](../src/sources.ts) |
| `AccountingOrigin`, `ReceivedAccountFact`, `ContextAccountingInput`, `AccountReceipt`, `ContextAccountingInbox`, `SystemRecoveryAccess`, `AccountReplay`, `RecoveryResult`, `ContextRecovery`, `AccountingSourceAuthority`, `RecoveryAuthority`, `AccountingLimits`, `AccountingOptions` | [accounting.ts](../src/accounting.ts) |
| `HistoryRow` | [values.ts](../src/values.ts) |
| `HistoryPage`, `HistoryReadResult`, `CompactionContextResult`, `HistorySource`, `ConversionIndexResult`, `ConversionResultSource`, `RetainBudget`, `CompactionPolicy`, `CompactionPlanDraft`, `CompactionPolicyPort`, `RepresentationPolicyConfig`, `RepresentationPolicyPort`, `RetentionMeasurement` | [ports.ts](../src/ports.ts) |
| `BudgetInput` | [budget.ts](../src/budget.ts) |
| `judgeBudget` | [budget.ts](../src/budget.ts) |
| `ContributionRejection`, `ContributionResult`, `ContributionsResult`, `PromptContributionRegistry` | [registry.ts](../src/registry.ts) |
| `RequestPurpose`, `AssemblyCall`, `InputGroups`, `GroupName`, `HistoryUpper`, `HistoryCursor`, `TenantModelCall`, `SourcedMessage`, `ContinuationBasis`, `AdoptedRequestFact`, `CompactionBasis`, `HistoryEvidence`, `NewInputBatch`, `BlockMaterial`, `SnapshotMaterial`, `ContextReadGroup`, `AssemblyContext`, `PromptContributionBase`, `PromptSection`, `PromptVariable`, `PromptContribution`, `PromptContributionSet`, `SelectedModel`, `ToolAdoption`, `ConditionsEvidence`, `AlterationEvidence`, `PreviousPreparation`, `TransitionEvidence`, `Layer`, `PrefixBreakReason`, `LayerAnchor`, `SnapshotAnchor`, `Coverage`, `BudgetBreach`, `FitVerdict`, `RepresentationChoice`, `SnapshotReminder`, `TailFacts`, `RequestLayers`, `RequestCandidate`, `CompactionPlan`, `PlanProgress`, `SummaryMaterial`, `StepRequest`, `StepInput`, `ContextTransition`, `AssemblyFailure`, `InvalidReason`, `UnavailableOwner`, `AssemblyUnknown`, `AssemblyOutcome`, `AssemblyResult`, `PlanResult`, `StepResult` | [values.ts](../src/values.ts) |
| `LAYER_ORDER`, `PREFIX_BREAK_REASONS` | [values.ts](../src/values.ts) |
| `DeriveInput` | [values.ts](../src/values.ts) |

### 现有测试导出

| 名称 | 定义与签名 |
| --- | --- |
| `createMemoryHistorySource` | [history-source.ts](../src/testing/history-source.ts) |
| `MemoryHistorySource`, `HistoryFixture`, `HistoryFixtureRow` | [history-source.ts](../src/testing/history-source.ts) |
| `createScriptedInputMeter`, `createScriptedPreparationResources`, `createMemoryConversionResults`, `createScriptedCompactionPolicy`, `createScriptedRepresentationPolicy`, `FIXTURE_COMPACTION_POLICY`, `FIXTURE_REPRESENTATION_CONFIG` | [doubles.ts](../src/testing/doubles.ts) |
| `MeterScript`, `ScriptedInputMeter`, `MemoryConversionResults`, `PreparationCall`, `PreparationScript`, `ScriptedPreparationResources` | [doubles.ts](../src/testing/doubles.ts) |
| `createMemoryContextSources`, `createMemoryAdoptedSource`, `createMemoryReadEligibility`, `createTestingPrincipalBinding` | [sources.ts](../src/testing/sources.ts) |
| `AssemblyGroupValues`, `MemoryContextSources`, `MemoryContextSourcesInput`, `MemoryAdoptedSource`, `MemoryReadEligibility` | [sources.ts](../src/testing/sources.ts) |
| `AssemblyFixture`, `AssemblyFixtureOptions` | [fixtures.ts](../src/testing/fixtures.ts) |
| `createAssemblyFixture`, `createAssemblyGroups`, `testingAccess`, `countingBasis`, `fixtureBudget` | [fixtures.ts](../src/testing/fixtures.ts) |
| `requestContextConformance`, `historySourceConformance`, `compactionPolicyConformance`, `representationPolicyConformance` | [conformance.ts](../src/testing/conformance.ts) |
| `ConformanceSubject` | [conformance.ts](../src/testing/conformance.ts) |
| `runConformanceCase` | [case.ts](../src/testing/case.ts) |
| `ConformanceCase`, `CaseVerdict` | [case.ts](../src/testing/case.ts) |
| `REQUEST_CONTEXT_OBLIGATIONS`, `HISTORY_SOURCE_OBLIGATIONS`, `COMPACTION_POLICY_OBLIGATIONS`, `REPRESENTATION_POLICY_OBLIGATIONS` | [conformance.ts](../src/testing/conformance.ts) |
| `RequestContextObligation`, `HistorySourceObligation`, `CompactionPolicyObligation`, `RepresentationPolicyObligation`, `HistorySourceFixture`, `CompactionPolicyFixture`, `RepresentationPolicyFixture` | [conformance.ts](../src/testing/conformance.ts) |
| `NotApplicable` | [case.ts](../src/testing/case.ts) |

## 操作组与来源集合

`createAssemblyOperations({ target, sources, principalBinding, policies })` 绑定一个目标的来源集合，返回 `assemble`、`planCompaction`、`deriveStep`、`resume`。它不需要 Cordis、全局登记表或生产存储。来源登记表 `ContextSourceRegistry` 与账目协议 `ContextAccountingInbox`、`ContextRecovery` 在本成员只有类型，实现归 [request-context](../../request-context/docs/public-api.md)（[RQ-12](../SPEC.md#rq-12-来源集合与登记面)、[RQ-14](../SPEC.md#rq-14-窗口占用与账目收到)、[RQ-15](../SPEC.md#rq-15-普通访问与系统恢复)）。

每个操作以 `AssemblyCall` 为组一，其余六组由来源集合的组读口按读计数、读来源、再读计数读取（[RQ-13](../SPEC.md#rq-13-七组的稳定读取)）。

## 历史源与依赖端口

`project` 显式接收历史行及其 epoch；行中没有 epoch，因此不伪造历史身份。

`HistorySource.read({ access, evidence, cursor, budgetBytes })` 读一页；序号是十进制文本 `HistorySequence`，游标 `HistoryCursor` 带它所属的依据。`compactionContext({ access, evidence, coverTo })` 用同一依据与身份读取 CM-02 的增量判断窗口。

计量结果类型归 Model。每份候选经 Model 准备资源的租约按供应商计划与计量，请求字节取自 `rules.plan` 的物化表示，本成员没有序列化端口。`ConversionResultSource` 读口归本成员，读取的结果类型使用 Model 的 `ConversionResult`。两个策略经端口替换，本契约不内置生产策略。

## 认回与恢复

`PreviousPreparation.carried` 回传已有候选内容。`PreparedInputKey` 记录来源代际、主体键、调用身份、六组令牌与派生规则的采用。命中时复用稳定层，仍重算尾部提醒、表示、预算与本次结局。不回传内容时从输入重新派生，函数不保存缓存。

`PlanProgress` 保存每一步的消费依据。`CompactionPlan.basis` 保存增量判断窗口与摘要，`deriveStep` 核对它与当前输入。计划、进度与覆盖证据从持久边界回流时先经相应 schema 解码。

## 验证

[导出清单](../tests/fixtures/exports.json) 与共享清单工具比较构建产物。行为证据见 [验证说明](../verification/README.md)。

## 历史来源公开套件的夹具

historySourceConformance() 返回六项义务：read-requires-access、tenant-isolation、page-size-retains-order、missing-scope-is-invalid、page-respects-byte-budget、prefix-digest-is-chained。每个 case 通过 run(fixture) 调用；缺失 scope 的 case 故意构造不合形状的边界输入。

HistorySourceFixture 的 createSource(fixture) 必须构造与 source 相同实现、相同配置的独立来源，供摘要链关系验证；它替代未使用的 commit 接缝，不是生产历史写口。夹具首个 epoch 至少有两个正字节行，各行与总字节数可由安全整数预算读取；entries 与 rows 应对应同一消息。套件会读取完整分页，再构造前行消息不同、后续行不变的独立夹具，要求全部后缀摘要随之前进，并核对分页边界的摘要一致。它不规定摘要算法、盐或编码，也不编辑活跃 epoch，不用 memory 的 SHA 算法作判定器。

[conformance.spec.ts](../tests/conformance.spec.ts) 对六项义务分别注入只破坏对应行为的来源；摘要另有仅逐行计算、没有前缀依赖的反例。公开名字和入口不变，机读库存无需添加导出。
