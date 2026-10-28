# Session 公开入口与源码导航

精确定义归源码。本页只导航 `@omne-harness/session-contract` 的两个入口导出了什么、定义在哪个源文件，不保留第二套手写签名。行为、调用资格、结果与认回归 [SPEC 的运行契约候选](../SPEC.md#运行契约候选)；源码支持范围见 [SPEC 的状态行](../SPEC.md)。消费路径见 [context](context.md)，对象关系见 [object-model](object-model/README.md)。

入口：

| 入口                                     | 源文件                              | 内容                                                                              |
| ---------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| `@omne-harness/session-contract`         | [src/index.ts](../src/index.ts)     | 值与身份、四个面、端口、领域服务、`decide`、`reduce`、`projectSessionLog`、块声明 |
| `@omne-harness/session-contract/testing` | [src/testing.ts](../src/testing.ts) | 有效提供者端口的一致性套件与非耐久替身、合法测试值。只给测试                      |

## 值、当前工作与原位置

[行为与约束](../SPEC.md#值与结果项的约束)。

| 导出                                                                                                                                                                                                                                                                                                                     | 源文件                               | 说明                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `SessionIdentity`、`SessionId`、`RunId`、`AttemptId`、`InputId`、`BatchId`、`SessionOperationId`、`SessionRevision`、`ConsumptionId`、`EntryId`、`ResidentKey`                                                                                                                                                           | [identity.ts](../src/identity.ts)    | 品牌身份。`AttemptId` 是 (Run, 序号) 的确定编码                                                                                   |
| `Adoption`、`DurableEvidence`、`ConsumerRef`                                                                                                                                                                                                                                                                             | 重导出 `@omne-harness/exchange-refs` | 三个交换值只有一份定义                                                                                                            |
| `SessionAccess`、`Mutation`、`AgentInstanceRef`、`AdvanceRef`、`SessionCallerClass`                                                                                                                                                                                                                                      | [identity.ts](../src/identity.ts)    | `SessionAccess<P>` 是 legal-identity 的 `Access<P>` 加 `session`（J51）                                                           |
| `ExecutionRef`、`Participation`、`ProducerRef`、`CallBinding`、`ProducedResult`、`ResultConsumption`、`Consumption`、`InputBatch`、`RunTerminal`、`RunState`、`Waiting`、`ControlTarget`、`ControlProgress`、`ControlIntent`、`ScopeReleaseDisposition`、`RecoveryTask`、`ResidentTool`、`SessionFrozen`、`WorkSnapshot` | [values.ts](../src/values.ts)        | 快照与工作事实。`ControlProgress` 没有围栏字段，`RecoveryTask` 没有 `start-fence` 变体，见[被替代的协议](../SPEC.md#被替代的协议) |

初始化守卫中的 inputSnapshot/capabilities 复用 ContextMaterial，residentBindings/newResidents 复用 ResidentAdoption 的 keys/residents。decision.commit 为字符串，具体边界见 [初始化材料的嵌套字段](../SPEC.md#初始化材料的嵌套字段)。这些材料由 Session 的初始化守卫解析器校验，不新增外域 API。

## 操作身份的派生

[OP-00](../SPEC.md#op-00)。

| 导出                                                                                                   | 源文件                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `SessionOperationElements`、`DriveOperationElements`、`deriveSessionOperation`、`deriveDriveOperation` | [operations.ts](../src/operations.ts) |

## 输入、推进、结果及终态操作

[行为与约束](../SPEC.md#sessionwork)。命令与事件见[命令表](../SPEC.md#命令表)。

| 导出                                                                                                                                                                | 源文件                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `RoutedInput`、`Control`、`BoundedClose`、`DerivedMessage`                                                                                                          | [values.ts](../src/values.ts) |
| `SessionFailure`、`Reply`、`CommitReceipt`、`OperationResolution`、`EntryClass`、`StartedRun`、`Completion`、`ExternalCompletion`、`AdmittedMessage`、`SessionWork` | [faces.ts](../src/faces.ts)   |

## 同提交守卫与跨成员使用

[共同提交与共享事务域](../SPEC.md#共同提交与共享事务域)、[与 Agent 的参加与核对](../SPEC.md#与-agent-的参加与核对)。条件终结的只读参加没有公开命令：Session 参加者在 Agent 的终结提交里运行 `judgeCompletion`。

## 控制、恢复与保管边界

[推进映射、claim 与 reload](../SPEC.md#推进映射claim-与-reload)、[事件消费与交付责任解除](../SPEC.md#事件消费与交付责任解除)、[Run 两层状态机与不变量](../SPEC.md#run-两层状态机与不变量)。交付责任解除与 Tool 启动围栏的出站端口已被替代，见[被替代的协议](../SPEC.md#被替代的协议)。

## 创建、声明与历史

[行为与约束](../SPEC.md#sessionmanagement)、[SessionReconciliation](../SPEC.md#sessionreconciliation)、[SessionHistory](../SPEC.md#sessionhistory)。

| 导出                                                                                                                                                                                                                                    | 源文件                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `Modes`、`SessionCreation`、`WorkspaceAttachment`、`InitializationResult`、`ContextMaterial`、`DeclarationChange`、`Relation`、`ClockSample`、`IdleCoverage`、`IdleObservation`、`AutoArchivePolicy`、`FreezeVerdict`                   | [values.ts](../src/values.ts) |
| `SessionManagement`、`ProducerFact`、`PendingReason`、`ResidentReference`、`ReleasedScope`、`SessionReconciliation`、`HistoryEntry`、`HistoryPage`、`ModelViewBasis`、`ModelViewRow`、`ModelViewRead`、`SessionHistory`、`SessionFaces` | [faces.ts](../src/faces.ts)   |

SessionCreation.initialization 是可选来源包，包含 sources 和 results。sources 的共同头为 item、owner、protocol，种类封闭为 context-registration、workspace-load、execution-adoption；注册分支的 input 复用原 need、binding、parameters 材料。类型的具体名称与导出以源码为准，行为形状由 SPEC 约束。requiredIdentities、InitializationResult、原方法签名与 SessionContextInput.prepare 的命令联合保持。省略语义、完整性、真实初始采用准入与重放范围见 [初始化来源与提交](../SPEC.md#初始化来源与提交)。

`ProducerFact` 没有 `agent-event` 与 `start-fence` 变体，`AgentEventFact` 不导出，见[被替代的协议](../SPEC.md#被替代的协议)。

## 领域服务与归约

[行为与约束](../SPEC.md#领域服务与归约)。

| 导出                                                                                                                                                                                                                                                          | 源文件                              | 本成员的支持                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| `AdvanceJudgment`、`AdvanceClaim`、`RouteJudgment`、`RunStartJudgment`、`OpenWork`、`CompletionJudgment`、`ControlScope`、`IdleJudgment`、`OperationJudgment`、`OperationRecord`、`CommittedBatch`、`ReduceResult`、`EncodedEntry`、`Decision`、`DecideReads` | [judgments.ts](../src/judgments.ts) | 结局集合                                                                         |
| `judgeAdvance`、`routeInput`、`judgeRunStart`、`openWork`、`judgeCompletion`、`resolveOperation`                                                                                                                                                              | [judgments.ts](../src/judgments.ts) | 按 SPEC 实现                                                                     |
| `resolveControlScope`、`judgeIdle`、`resolveCascade`                                                                                                                                                                                                          | [judgments.ts](../src/judgments.ts) | 纯判定，读取材料由调用方传入                                                     |
| `decide`                                                                                                                                                                                                                                                      | [decide.ts](../src/decide.ts)       | 覆盖全部命令族，保留 SPEC 中具名偏离和外域停止点。`previous` 对 `create` 为 null |
| `reduce`                                                                                                                                                                                                                                                      | [reduce.ts](../src/reduce.ts)       | 纯批次归约；条目编码只在 [entries.ts](../src/entries.ts) 一份                    |

## 出站端口与块声明

[构造依赖端口与出站端口](../SPEC.md#构造依赖端口与出站端口)、[会话块声明与设置值的固定时点](../SPEC.md#会话块声明与设置值的固定时点)。出站端口的参数只含本成员的值与不透明证据。服务键归 [session-cordis-contract](../../session-cordis-contract/docs/cordis.md#端口服务键)。

| 导出                                                                                                                                         | 源文件                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `DriveFailure`、`DriveReply`、`DriveTarget`、`DriveReceipt`、`ExecutionStatus`、`AgentDrivePort`、`ScopeReleaseReadback`、`ScopeReleasePort` | [ports.ts](../src/ports.ts)                              |
| `SessionBlockDeclaration`、`sessionModesBlock`                                                                                               | [ports.ts](../src/ports.ts)、[block.ts](../src/block.ts) |

`ToolStartFencePort`（已被替代）与 `DeliveryReleasePort`（已被替代）不声明，见[被替代的协议](../SPEC.md#被替代的协议)。

## 构造依赖端口、出站端口与纯函数

[构造依赖端口与出站端口](../SPEC.md#构造依赖端口与出站端口)。

| 导出                                                                                                                                                                                                                                    | 源文件                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `MutationName`、`SessionCommand`、`GuardCommand`、`SessionIdentityBridge`、`SessionEvidenceBridge`、`SessionClock`、`SessionIdleInput`、`SessionContextInput`、`SessionTransactionPort`、`SessionInternalPrincipals`、`SessionNotifier` | [ports.ts](../src/ports.ts) |

## 实现工厂

配置、依赖聚合及构造函数由 [通用实现](../../session/docs/public-api.md) 拥有。调度策略是 `session` 工厂配置的一部分，不在本成员定义。有界恢复者重试的上限是该策略的配置字段，默认值只是初值。这里的提供者端口仍是可替换边界，不指定实现。

## 同日志解释接缝

[projection.ts](../src/projection.ts) 导出 `SessionLogObservation`、`SessionLogConsequence` 与 `projectSessionLog`。适配器按 Agent 的公开读取形状，把原 execution、所属 Run、公开事件序号、读取依据与 Session 后果交给纯函数。本成员不导入 Agent 类型，不接收 Agent 事件副本。

`commandDigest(command)` 导出自 [decide.ts](../src/decide.ts)，提供 `OperationRecord.digest` 的规范摘要。S3 直接使用该函数，避免复制命令归一规则。

调用方在同一个 per-session 发布根内保存 Session 批次、归约快照、解释进度与操作答复。Agent 首次提交和 Session 后续解释是两次提交。两者共享发布根，仍允许取消在两次提交之间先成立。快照读取的 sequence 为 null，不推进公开事件序号。事件序号只接受连续前缀，重复序号不再生成事实。

`createMemorySessionTransactions` 具有自己的内存根，不能注入或共享外部根。`MemorySessionLogTransactions.controls.project` 只供本包测试。组合提供者应直接调用 `decide`、`projectSessionLog`、`reduce`，并在自己的单根里原子发布，不能再包一层独立事务替身。

## 可选投影与省略

[values.ts](../src/values.ts) 中新增 `ResidentAdoption`、`RunExecution`、`ContextScopeBinding`。`SessionCreation`、`startRun` 与 `reload` 的 `residentAdoption` 省略表示没有新声明，并保留已有采用键。提供材料时，keys 覆盖完整常驻能力集合。

`WorkSnapshot` 的可选 `executions`、`residentKeys`、`children`、`taken`、`backgroundPlaceholders`、`releasedScopes`、`contextScopes`、`contextRecords`、`changes` 省略表示没有该类已提交投影。`relation` 省略表示尚未声明关系，`autoArchive` 省略按未启用处理。新提供者须从日志重建这些字段，不能删除已有事实来模拟省略。

`DecideReads` 的可选孩子列表、空闲观察/覆盖与冻结回执是当前事务读取材料。省略时使用快照中同类事实。已冻结却缺原回执时返回具名 unavailable。原 `SessionCommand` 使用映射 `Omit`，丢失了 `commitDerived` 分支字段。新增可选 participation、judgment、expected 保持原调用形状可构造，实际 compaction 和 context-reminder 分支仍核验各自必需材料。`SessionWork.commitDerived` 的原必填形状不变。

八类提供者套件从 [testing-provider-conformance.ts](../src/testing-provider-conformance.ts) 导出：identity、evidence、Context、clock、idle、notifier、scope release 与 Agent drive。测试通过只证明替身及其指定判据，不证明生产提供者。


## 结果与执行引用

结果提交按原消费绑定核对 Run、执行和位置。取消或归档后，原执行仍可保管迟到结果，但不能继续原业务处理。custody 与 processed 的参加提交同时更新对应 `ExecutionRef.revision` 和 `evidence`，不推进事件 `readThrough`。历史执行的参加不会更新后继 Run。

同版本的 custody 与 completion 同值保留，异值返回 conflict。归约也拒绝替换既有依据。重复结果不会将 release 从 confirmed 改回 pending。已完成版本的同值重复提交不再次追加所附消息。`release` 投影仅保存 pending/confirmed，原确认来源在日志中；本接口不单独提供原 release.source 的判等投影。

身份桥套件比较不同租户、会话、operation、命令种类及命令内容准备出的不透明材料，并用复用首次材料的违例提供者自证。套件不规定 `GuardCommand.facts` 格式，也不证明生产事务参与者会拒绝重放材料。实际装配仍须验证提交边界的材料绑定。

## 初始化公开值与纯读取

`InitializationSource`、`InitializationSources` 在 [values.ts](../src/values.ts)；`InitialAdoption`、`InitializationAdoption`、`InitializationGuardFacts`、`InitializationGuardResult`、`InitializationConsequence`、`InitializationState` 与 `InitializationFactReference` 的保存类型在 [values.ts](../src/values.ts)，守卫解析与 `INITIALIZATION_PROTOCOL` 常量在 [initialization-schema.ts](../src/initialization-schema.ts)。`InitializationPlanItem`、`InitializationRequirement` 与 `InitializationRegistration` 也归 values.ts；`initializationRegistrationCommit` 在 [initialization-plan.ts](../src/initialization-plan.ts)。

`DecideReads.initializationReceipts` 可选，仅认回已有同值初始化结果时需要原回执。省略语义、可信来源和当前支持范围见[初始化实现](initialization.md)。`./testing` 导出显式登记的内存来源与采用 fixture；未配置来源的初始化不默认通过。

## 同日志历史材料的候选增加

以下值和可选参数尚未在源码实现，不计入上表的现有导出。完整字段、来源、失败与省略规则归 [FR-01](../SPEC.md#fr-01)、[FR-05](../SPEC.md#fr-05)、[FR-06](../SPEC.md#fr-06)。实施后由源码拥有精确定义，本页同步为导航，不维护另一套类型签名。

| 拟增加位置 | 候选内容 | 保持与省略 |
| --- | --- | --- |
| Session-owned 值 | SessionLogRoot、SessionHistoryIndex、InputAdmissionBoundary、InputAdmissionMember、ExecutionHistoryBoundary、SessionFactBoundary、SessionBatchRecord、SessionAttemptRecord、SessionTakenRecord、SessionHistoryReads、SessionInputScope、InputAdmissionPage、SessionInputAdmission、SessionExecutionPrefix、SessionPrefixFact | 只表达本域关系、根和消费投影，不含 Agent 类型或 runtime 对象。字段形状逐项见 FR-01。 |
| WorkSnapshot | 可选 historyIndex | 未提供表示没有本次完整性材料，不自动表示空原关系。旧有效输入能由其完整已有事实证明的分支仍可调用；缺必要证明返回 unavailable。 |
| DecideReads | 可选 history | 原 compaction 必填形状保持。只有本次实际消费的历史必须齐备。 |
| projectSessionLog | 第三个可选 reads | 既有 snapshot、observation 及其顺序保持。当前二参数调用仍可构造；省略按 FR-01 核可证明范围。 |
| reduce | 第三个可选 reads | 原 previous、batch、结果联合保持。真实读源不可用先由提供者返回 unavailable，不调用 reduce；新版本完整批违背必要证明义务按 SL18 quarantined。旧合法历史按其原 Adoption 判断。 |
| SessionLogObservation | 可选 executionEvidence | source 是原事实来源；revision/executionEvidence 是同根真实 head。旧有效 source 同时为该 head 回执且可证明时可省略，不能从事件序号推导 revision。 |
| SessionCallRegistration、SessionCallRecord、SessionCallWait | associated 与 tool-intent 分开，完整 purpose 及同消费后续关联 | CallBinding 的 producer.call 保持必填且非空。没有 reference 的 Tool intent 使用新值，不放宽旧绑定含义。 |
| SessionLogConsequence | 新 call-registration、call-association、registered-waiting 分支 | 旧 call/producer/waiting 分支保留。新路径按原完整 purpose 和来源建立、关联、等待，旧有效映射的适用条件见 FR-06。 |
| WorkSnapshot | 可选 callRegistrations、callWaits | 同一 SE18/SE22 的投影，已关联部分与既有 consumptions/waiting 一致。省略不能抹去 intent 和未结责任。 |
| OpenWork、ControlScope.scope | 可选 unassociatedWaiting: readonly SessionCallWait[] | 原 consumption/position 定位未关联等待及控制范围。AD-04、压缩核对与 judgeIdle 消费同一结果，关联后与既有 producer waiting 合并去重。 |
| OpenWork | 可选 unsettledControls: readonly SessionOperationId[] | 原 SE24/SE25 的未交清控制入口。取消解除等待后再关联时仍保留原登记、等待、控制与关联条目作为下界，不借用 unresolved；只有原责任依证据解除后退出。 |
| ControlProgress | 可选 pendingUnassociatedWaiting: readonly SessionCallWait[] | 同一 SE24/SE25 的原待交接或核对责任。只有原具名控制或合法交接证据才能解除，未知或空 producer 集合不能推出 reconciled。字段与省略规则归 FR-06，不新增控制端口或状态。 |

解释版本沿既有 HistoryEntry.schema 与 WorkSnapshot.interpreter，不加第二个 historyProtocol 标志，不给 CommittedBatch 增加必填参数。具体精确 Adoption、版本不兼容和原批完整性分别按 [初始化解释版本与重建](../SPEC.md#初始化解释版本与重建) 与 FR-01 判断。归一和提交的完整流程归 [session-adapters AD-02](../../session-adapters/SPEC.md#ad-02)，不能把纯函数已有 completed 分支当作该同日志提供者已经实现。
