# 人工介入的模型、性质与实现的对应

`models/` 下的 TLA+ 模型检查[包组规格](../../SPEC.md)的交接、提交、隔离与恢复规则。每份配置是正控还是负控、负控应当违反哪一条性质，登记在 [models.json](models.json) 的 `expected` 里，由 `check.py` 读取；`check-contract.py` 核对答复的线上形状，`check-semantics.py` 对权限求值与结果代数做有限分区枚举，`command-algebra.json` 是它们的输入。模型只说明在登记的有界实例与前提之内没有这一类缺陷，不证明实现符合。

目录里名为 `Governance*` 的模型与 `packages/governance/governance-local/verification/models/` 下的同名模型相同，对照见[治理的形式化对照](../../../governance/governance-local/verification/formal-mapping.md)。

## 性质与规格不变式

| 模型                     | 性质                                                                                                                                     | 规格不变式                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| RegistrationProtocol     | `JointRegistration`、`OneOriginalRequest`、`SealedCannotCommit`、`NoFalseNotCommitted`、`RecoverableResult`                              | HL-1、INV-HI01、INV-HI14                                                                       |
| HumanDecision            | `UniqueDecision`、`Custody`、`NoRevival`、`QualifiedDecision`、`TenantIsolation`、`OnceConsumption`                                      | INV-HI06–08、INV-HI15、INV-HI19                                                                |
| RecoveryRouting          | `WaitingPreserved`、`ReplyCustody`、`StableDestination`、`NoStaleReceiver`、`OnceDelivery`                                               | INV-HI01、INV-HI07、INV-HI19                                                                   |
| AuthorityComposition     | `CurrentComposition`：七类资格来源各自的守卫都在目的提交里成立；七个负控各去掉一类                                                       | INV-HI08                                                                                       |
| PermissionScope          | `NoBypassDeny`、`ScopeBound`、`OriginalBinding`、`CurrentAuthority`、`OnceOnly`                                                          | INV-HI04、INV-HI05                                                                             |
| WaitIsolation            | `NoWaitSlot`、`ToolIndependence`、`SessionIndependence`                                                                                  | INV-HI10                                                                                       |
| ExecutionSlots           | `OnlyRunningHolds`、`CapacityBound`；时序性质 `ResumeProgress`                                                                           | INV-HI10                                                                                       |
| ContinuationComposition  | `SafeAdvance`、`OnceAdvance`、`RecordedJudgmentNotRepeated`；时序性质 `ReadyProgress`                                                    | INV-HI10、INV-HI13                                                                             |
| ConcurrentIntake         | `UniqueInput`、`NoLostAccepted`、`NoCrossSessionConflict`、`NoClientSourceConflict`、`NoOperationRebinding`                              | INV-HI12                                                                                       |
| IntakeControl            | `BoundedPending`、`NoAcceptAfterArchive`、`AcceptedAccounted`、`NoStaleDriver`、`NoStaleCompletion`、`NoStartAfterTerminal`、`OnceStart` | INV-HI12                                                                                       |
| RestartContinuation      | `ResumeOnce`；时序性质 `ResultReceived`、`RunEnds`                                                                                       | INV-HI13、INV-HI18                                                                             |
| InterruptCascade         | `RecordedBeforeStop`、`ClosedStaysClosed`、`EndsAfterSettle`；时序性质 `CancelEnds`、`CardCloses`                                        | INV-HI15                                                                                       |
| ShutdownHandoff          | `CleanStop`、`WaitSurvives`、`AdvanceUnderAttempt`、`StaleWriterRejected`；时序性质 `RunEnds`                                            | INV-HI18、INV-HI19                                                                             |
| GovernanceCatalogCapture | `QualifiedCapture`、`CurrentCapture`、`NoRevival`、`SettledDisclosure`                                                                   | 无：治理规格里目录读取是纯读，不预留资格、不建原操作，本模型描述的带保留的捕获不是规格里的路径 |

## 共同原子动作与实现

| 共同原子动作         | 保证与跨模型投影                                                                          | 实现                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Register             | 请求与等待一一对应且结果可认回，之后才进入 HumanDecision 与 RecoveryRouting 的初态        | local 的终态（T）、等待规划（W）、组合规划（J）、等待写者（F）、请求写者（H）在一次 SQL 提交里共同成立                                                           |
| AnswerCommit         | 决定与收件箱同时增加；对应 RecoveryRouting 的已答与收件箱、ContinuationComposition 的答复 | H 写唯一决定，F 写原等待的收件箱与待接手项，同一提交；按来源冻结的守卫与 Identity 保留在同一提交里                                                               |
| Receive              | 原等待原子记下接手与消费回执；对应 RecoveryRouting 的交付，不对应已执行                   | F 同时写消费回执、增加计数、推进检查点、移出待接手；先核接收代次再认回                                                                                           |
| Park / ResumeAcquire | 继续检查点持久之后才释放名额；已答先就绪，取得名额后再运行                                | Tool 队列域的 held→parked 与 ready→held；两域分提交的细化由 Tool 的 [SuspendedSlots 模型](../../../tool/tool/verification/formal-mapping.md#suspendedslots) 检查 |
| Continue             | 屏障、原终局、当前代次与授权一起核对；继续位置与一次推进同提交                            | 恢复段启动前，Tool 的 `prepareResume` 经启动协调器核当前资格、同一未消费检查点与旧执行排除                                                                       |
| Intake / Control     | 队列与输入身份映射到受理、排队与开始                                                      | Session 的受理顺序与操作作用域                                                                                                                                   |

Tool 来源的 Ask 用 local 的 WaitOwner，经 Tool 的决策方端口 `ToolDecisionBridge` 交接，每行是拥有者自己域内的一笔提交，跨域由原操作身份与具名任务对账：

| 模型动作                                           | 实际提交                                                                                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RegistrationProtocol `Register`                    | Tool 调用域先提交挂起、检查点、等待开启与登记任务；登记任务调用本组的 prepare 与 `registerRequest`，回包未知时按原操作查询；认回后 Tool 提交 `attachRegistration` |
| HumanDecision `Commit`                             | 本组 `submitReply` 的一笔提交：决定、收件箱与批次判定、按来源冻结的守卫、Identity 保留                                                                            |
| HumanDecision `Terminal`                           | Tool 调用域提交终局并关闭等待，同一笔提交生成失效任务；失效任务调用 `invalidateWait`                                                                              |
| HumanDecision `Consume`、RecoveryRouting `Deliver` | Tool 经 `bindReceiver`、`readInbox`、`consumeDecision` 接手，再提交 `acceptDecision` 固定 ResponseRecord；取消先在调用记录成立时，决定不被当作答案                |

## local 的关系守护

`human-intervention-local/verification/relations.ts` 从业务关系独立推导期望集合，用双向 EXCEPT 核对，不调用产品的目录维护函数。每条守护配一个命中它的负控。

| 守护                 | 性质                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `JointRegistration`  | 请求、卡片与有效等待同时存在                                                                     |
| `PoolExact`          | 每个获准读者、请求与实际非空状态桶恰好一行；五个桶是待答、已失效、已决定待接手、已接手、已被取代 |
| `ScopedPoolExact`    | 过滤目录对每个来源范围有同样的精确性                                                             |
| `PendingExact`       | 待接手集合恰是没有消费回执的收件箱项                                                             |
| `ReceiptCountExact`  | 回执计数等于实际消费回执数，检查点由它与终局推出                                                 |
| `DecisionInboxExact` | 每个决定恰有一个同身份的收件箱项                                                                 |

固定修订下的分页论证：每张卡恰属一个桶，`PoolExact` 使某 actor 的每个非空请求桶恰好出现一次；每桶取当前位置之后至多 P+1 个有序卡片键，合并后取前 P 项，等于对完整有序卡片序列做同一过滤后的前 P 项；续页从最后返回卡片的后继开始，所以同一修订下不重复、不遗漏。

## 前提与没有建模的

- 存储事务是原子的，介质可靠；Identity 的资格保留按它自己的协议兑现，本组的模型不重新证明它。
- 活性只在最后一次故障之后提供者持续可用、相容恢复与交接动作弱公平时成立；人的答复不加公平假设，等待无答时可以无限保持。
- 没有建模：物理断电与操作系统崩溃、多进程写者排除、跨服务的阶段协议、生产调度的公平性、外部效果恰好一次、HTTP 错误形状与身份鉴别。
- 唯一性的归纳：初态每卡无决定；唯一增加决定的提交检查待答并在共同事务里改状态；其他动作不增加决定。实现若先检查后分开写，这个论证不适用。
- 保管的归纳：初态无决定；提交同时增加决定与收件箱；重试与重启不删除两者；接手只改变交接阶段。
- 非干扰：兄弟调用与别的会话的推进守卫只读各自的就绪、显式依赖与执行容量，不读等人的那个调用；挂起释放容量而不改它们的字段，所以保持可运行。
