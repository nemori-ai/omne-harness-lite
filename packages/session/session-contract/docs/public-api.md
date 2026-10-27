# Session 公开入口与源码导航

精确定义归源码。本页只导航 `@omne-harness/session-contract` 的两个入口导出了什么、定义在哪个源文件，不保留第二套手写签名。行为、调用资格、结果与认回归 [SPEC 的运行契约候选](../SPEC.md#运行契约候选)；源码支持范围见 [SPEC 的状态行](../SPEC.md)。消费路径见 [context](context.md)，对象关系见 [object-model](object-model/README.md)。

入口：

| 入口 | 源文件 | 内容 |
| --- | --- | --- |
| `@omne-harness/session-contract` | [src/index.ts](../src/index.ts) | 值与身份、四个面、端口、领域服务、`decide`、`reduce`、块声明 |
| `@omne-harness/session-contract/testing` | [src/testing.ts](../src/testing.ts) | 事务端口的一致性套件与非耐久替身、路径端口替身、合法测试值。只给测试 |

## 值、当前工作与原位置

[行为与约束](../SPEC.md#值与结果项的约束)。

| 导出 | 源文件 | 说明 |
| --- | --- | --- |
| `SessionIdentity`、`SessionId`、`RunId`、`AttemptId`、`InputId`、`BatchId`、`SessionOperationId`、`SessionRevision`、`ConsumptionId`、`EntryId`、`ResidentKey` | [identity.ts](../src/identity.ts) | 品牌身份。`AttemptId` 是 (Run, 序号) 的确定编码 |
| `Adoption`、`DurableEvidence`、`ConsumerRef` | 重导出 `@omne-harness/exchange-refs` | 三个交换值只有一份定义 |
| `SessionAccess`、`Mutation`、`AgentInstanceRef`、`AdvanceRef`、`SessionCallerClass` | [identity.ts](../src/identity.ts) | `SessionAccess<P>` 是 legal-identity 的 `Access<P>` 加 `session`（J51） |
| `ExecutionRef`、`Participation`、`ProducerRef`、`CallBinding`、`ProducedResult`、`ResultConsumption`、`Consumption`、`InputBatch`、`RunTerminal`、`RunState`、`Waiting`、`ControlTarget`、`ControlProgress`、`ControlIntent`、`ScopeReleaseDisposition`、`RecoveryTask`、`ResidentTool`、`SessionFrozen`、`WorkSnapshot` | [values.ts](../src/values.ts) | 快照与工作事实。`ControlProgress` 没有围栏字段，`RecoveryTask` 没有 `start-fence` 变体，见[被替代的协议](../SPEC.md#被替代的协议) |

## 操作身份的派生

[OP-00](../SPEC.md#op-00)。

| 导出 | 源文件 |
| --- | --- |
| `SessionOperationElements`、`DriveOperationElements`、`deriveSessionOperation`、`deriveDriveOperation` | [operations.ts](../src/operations.ts) |

## 输入、推进、结果及终态操作

[行为与约束](../SPEC.md#sessionwork)。命令与事件见[命令表](../SPEC.md#命令表)。

| 导出 | 源文件 |
| --- | --- |
| `RoutedInput`、`Control`、`BoundedClose`、`DerivedMessage` | [values.ts](../src/values.ts) |
| `SessionFailure`、`Reply`、`CommitReceipt`、`OperationResolution`、`EntryClass`、`StartedRun`、`Completion`、`ExternalCompletion`、`AdmittedMessage`、`SessionWork` | [faces.ts](../src/faces.ts) |

## 同提交守卫与跨成员使用

[共同提交与共享事务域](../SPEC.md#共同提交与共享事务域)、[与 Agent 的参加与核对](../SPEC.md#与-agent-的参加与核对)。条件终结的只读参加没有公开命令：Session 参加者在 Agent 的终结提交里运行 `judgeCompletion`。

## 控制、恢复与保管边界

[推进映射、claim 与 reload](../SPEC.md#推进映射claim-与-reload)、[事件消费与交付责任解除](../SPEC.md#事件消费与交付责任解除)、[Run 两层状态机与不变量](../SPEC.md#run-两层状态机与不变量)。交付责任解除与 Tool 启动围栏的出站端口已被替代，见[被替代的协议](../SPEC.md#被替代的协议)。

## 创建、声明与历史

[行为与约束](../SPEC.md#sessionmanagement)、[SessionReconciliation](../SPEC.md#sessionreconciliation)、[SessionHistory](../SPEC.md#sessionhistory)。

| 导出 | 源文件 |
| --- | --- |
| `Modes`、`SessionCreation`、`WorkspaceAttachment`、`InitializationResult`、`ContextMaterial`、`DeclarationChange`、`Relation`、`ClockSample`、`IdleCoverage`、`IdleObservation`、`AutoArchivePolicy`、`FreezeVerdict` | [values.ts](../src/values.ts) |
| `SessionManagement`、`ProducerFact`、`PendingReason`、`ResidentReference`、`ReleasedScope`、`SessionReconciliation`、`HistoryEntry`、`HistoryPage`、`ModelViewBasis`、`ModelViewRow`、`ModelViewRead`、`SessionHistory`、`SessionFaces` | [faces.ts](../src/faces.ts) |

`ProducerFact` 没有 `agent-event` 与 `start-fence` 变体，`AgentEventFact` 不导出，见[被替代的协议](../SPEC.md#被替代的协议)。

## 领域服务与归约

[行为与约束](../SPEC.md#领域服务与归约)。

| 导出 | 源文件 | 本成员的支持 |
| --- | --- | --- |
| `AdvanceJudgment`、`AdvanceClaim`、`RouteJudgment`、`RunStartJudgment`、`OpenWork`、`CompletionJudgment`、`ControlScope`、`IdleJudgment`、`OperationJudgment`、`OperationRecord`、`CommittedBatch`、`ReduceResult`、`EncodedEntry`、`Decision`、`DecideReads` | [judgments.ts](../src/judgments.ts) | 结局集合 |
| `judgeAdvance`、`routeInput`、`judgeRunStart`、`openWork`、`judgeCompletion`、`resolveOperation` | [judgments.ts](../src/judgments.ts) | 按 SPEC 实现 |
| `resolveControlScope`、`judgeIdle`、`resolveCascade` | [judgments.ts](../src/judgments.ts) | 指向 #756：前两者返回 `invalid`/`unavailable`，`resolveCascade` 抛错 |
| `decide` | [decide.ts](../src/decide.ts) | 路径种类按 SPEC 判定，其余返回 `rejected`/`unavailable` 指向 #756。`change` 的 workspace 维度先核验，非法返回 `invalid`；合法后仍返回 `unavailable`，归 #756。`previous` 对 `create` 为 null |
| `reduce` | [reduce.ts](../src/reduce.ts) | 纯批次归约；条目编码只在 [entries.ts](../src/entries.ts) 一份 |

## 出站端口与块声明

[构造依赖端口与出站端口](../SPEC.md#构造依赖端口与出站端口)、[会话块声明与设置值的固定时点](../SPEC.md#会话块声明与设置值的固定时点)。出站端口的参数只含本成员的值与不透明证据。服务键归 [session-cordis-contract](../../session-cordis-contract/docs/cordis.md#端口服务键)。

| 导出 | 源文件 |
| --- | --- |
| `DriveFailure`、`DriveReply`、`DriveTarget`、`DriveReceipt`、`ExecutionStatus`、`AgentDrivePort`、`ScopeReleaseReadback`、`ScopeReleasePort` | [ports.ts](../src/ports.ts) |
| `SessionBlockDeclaration`、`sessionModesBlock` | [ports.ts](../src/ports.ts)、[block.ts](../src/block.ts) |

`ToolStartFencePort`（已被替代）与 `DeliveryReleasePort`（已被替代）不声明，见[被替代的协议](../SPEC.md#被替代的协议)。

## 构造依赖端口、出站端口与纯函数

[构造依赖端口与出站端口](../SPEC.md#构造依赖端口与出站端口)。

| 导出 | 源文件 |
| --- | --- |
| `MutationName`、`SessionCommand`、`GuardCommand`、`SessionIdentityBridge`、`SessionEvidenceBridge`、`SessionClock`、`SessionIdleInput`、`SessionContextInput`、`SessionTransactionPort`、`SessionInternalPrincipals`、`SessionNotifier` | [ports.ts](../src/ports.ts) |

## 实现工厂

配置、依赖聚合及构造函数由 [通用实现](../../session/docs/public-api.md) 拥有。调度策略是 `session` 工厂配置的一部分，不在本成员定义。有界恢复者重试的上限是该策略的配置字段，默认值只是初值。这里的提供者端口仍是可替换边界，不指定实现。
