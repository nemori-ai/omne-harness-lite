# 验证入口

[registrar.spec.ts](../tests/registrar.spec.ts) 把 GL-13/14/15 的私有机制接到 contribute/withdraw 应用入口，并使用真实 SqlStorage/Identity 验证恢复。原操作终态和 SQL 单赋值继续由既有模型守护。[GovernanceRegistrar](models/GovernanceRegistrar.tla) 补充首次来源证明、原回执不变、来源离线认回和当前租约投影。该增量没有完成公开导出、adopt/current、目录和 Cordis 生命周期；完整 C3b 独立验收仍开放。

[admission.spec.ts](../tests/admission.spec.ts) 检查发行主体、完整租户及可见性、显式 action 委托、逐 owner 的完整执行关口、当前资格和异步输入隔离。它包含真实 Identity SQL 撤回成员后的拒绝，其他条件使用具名受控来源逐项构造反例。有限证明与六个负控归 [治理准入交集](README.md#治理准入交集)。准入对象尚未接到完整公开服务，不能据此声称 C3b 已通过验收。

关系检查见 [schema.spec.ts](../tests/schema.spec.ts)，真实迁移装配见 [materials.spec.ts](../tests/materials.spec.ts)。数据库实例由用例隔离创建并清理。

[GovernanceTargetSupport](models/GovernanceTargetSupport.tla) 及其 [说明](README.md#按租约保留目标支持) 维护目标支持的有限模型。模型不在本包复制。关系测试证明表能表达且约束指定绑定；完整单事务 adopt/withdraw 对投影的维护仍待业务实现。

10000 条历史原操作用来核对 pending 查询计划选择部分索引。它不是一万个用户并发，也不是延迟基准。目录完整性、资格保留、重装围栏和真实公开接口仍待提供者独立验收。

[operations.spec.ts](../tests/operations.spec.ts) 通过真实 Worker 调用生产私有事务函数，检查原操作认回、执行内容不可替换、封口后迟到执行、回滚、重开、epoch 隔离、精确目标支持、原 registrar 和容量竞争。[definitions.spec.ts](../tests/definitions.spec.ts) 检查复用的设置/权限语义及完整投影。它们不验证真实来源发行或 Identity 保留。

原操作模型归 [GovernanceOperation](models/GovernanceOperation.tla)。完整公开服务与生命周期的验收仍开放。

[sql-stage.spec.ts](../tests/sql-stage.spec.ts) 通过生产 planner、writer 和只读材料检查阶段单赋值、完整身份隔离、命令错绑、并发首次保存、预算、重启读回及丢失回包认回。缺少保管时业务不能发生。该组装配的身份回执仍为具名夹具，不能替代真实 Identity 或完整公共协调器验收。

同组测试还以真实 Worker 重开、不同元数据组合摘要和缺失的原业务参与者，检查公开 SqlOperationCoordinator 的恢复行为。原材料缺失时发送不可用，操作仍为 submitted，原封套不变。替换封套冲突；原材料重新可用后，只提交原封套并按同一身份认回。该场景采用 mutation 命令验证公共阶段机制，不声称覆盖所有权限来源故障或自动恢复缺失的代码材料。

[GovernanceSqlCustody](models/GovernanceSqlCustody.tla) 检查两个原操作阶段键、两种完整请求和任意保存、发送、封口、提交交错。说明及源码映射见 [SQL 请求保管守护](README.md#sql-请求保管守护)。

`SqlOperationCoordinator.send` 和 executeControl 只发送已确认保管的请求，落实 GovernanceSqlCustody 的 ExactSend 前提。accept 成功后重新读取当前 Operation，不使用历史受理回执继续业务。SqlSubmission 的完整回执校验与真实并发观察场景补充 GovernanceOperation 的原操作守护。模型仍假设底层存储满足自身契约，不证明任意故障下的恢复活性。


[standing-coordinator.spec.ts](../tests/standing-coordinator.spec.ts) 使用真实Identity源服务与生产Governance planner/writer，验证完整请求先保存、真实held、业务终态、目的封口、源结算和本地settled。用例包含两种竞争顺序及并发竞争、源回执丢失、目的SQL回包丢失、迟到held、错绑定与Worker重开。资格与路由协议使用生产实现；公开准入和来源/current仍是具名夹具。

该组合把 GovernanceSqlCustody 的 ExactSend、SettingsReservationCustody 的 SettledCannotBecomeHeld 和 [StandingRequestSettlement](../../../assets/settings/verification/models/StandingRequestSettlement.tla) 的 NoLateHold 映射到实际协调链。有限模型各有自己的前提；组合测试不构成全系统归纳证明，不覆盖远程认证、任意代码升级、物理断电或无限故障下的进展。

[GovernanceRecoveryPhase](models/GovernanceRecoveryPhase.tla)补充固定SQL阶段的失败回执模型。错资格的seal先返回unavailable，随后正确原请求仍须结算；真实红绿反例同时检查阶段行缺失及正确恢复成功，不能只观察没有写入业务行。

## 权限读取的组织来源保管

[来源保管论证](proofs/permission-capture-custody.md)对应 GL-25。它说明原操作和来源责任的关系、有界恢复归并及假设，不构成新增机器证明。

[保管测试](../tests/permission-capture-custody.spec.ts)运行真实 SQLite Worker；[迁移测试](../tests/permission-capture-migration.spec.ts)覆盖原行字节和实际旧域升级；[SQL 协调测试](../tests/sql-coordinator.spec.ts)检查生产读取声明及阶段认回。权限材料生产、来源服务协调及业务消费者仍是后续验收范围。

[外域写协调入口](../tests/external-write-provider.spec.ts) 与 [真实来源组合](../tests/external-write-source.spec.ts) 覆盖 GL-29：原意图复制、真实主体核验、原资格保管、提交后不重算计划、关闭竞争，以及结算失败后的 Worker 重启与工厂恢复。来源组合采用真实 Identity、Settings 和 Governance，业务资格与业务计划为具名夹具。Session 成功写入及其治理终态同提交不在这些测试的证明范围内。

[原操作保管](../tests/external-write-custody.spec.ts) 还验证内部引用认回和 required 不得降级。恢复查询从原操作 schema 取得类型集合，防止新增原操作被恢复解析器遗漏。结构性论证见 [受信写入口与恢复闭合](proofs/permission-capture-custody.md#受信写入口与恢复闭合)。它不替代机器证明或完整 C3b 独立验收。


[真实 Session 同提交组合](../../../../apps/harness-server/tests/rows/governance/external-session-commit.spec.ts) 覆盖 GL-30。它装配真实 Session 写者、Governance 写者及 SqlStorage，检查成功、写后回滚、结果错绑、提前封口、完整 facts 替换及丢回执。业务资格与定义为具名测试适配器，生产原登录及当前定义接线不在该测试的证明范围内。对应论证见 [外域原子性](proofs/permission-capture-custody.md#外域效果与治理终态的原子性)。

[definition-projection.spec.ts](../tests/definition-projection.spec.ts) 使用真实注册服务与 SQLite 读取 settings=null 的声明，不构造 Settings target；覆盖撤下、旧 epoch、错误 scope、错误完整定义与关闭。原发布来源是具名测试来源，该测试不证明真实 Tool/Assets 发布或权限准入。[schema.spec.ts](../tests/schema.spec.ts) 对共享查询保留一万条旧代记录下的索引计划守护，拒绝贡献表或声明表全扫描。GL-31 的谓词与前提见[当前声明论证](proofs/permission-capture-custody.md#当前注册声明的独立读取)。

## 有限模型的运行

治理的 TLA+ 模型在 [models](models/README.md)，登记在 [models.json](models.json)。运行：

```
TLA2TOOLS_JAR=<tla2tools.jar> python3 packages/governance/governance-local/verification/check.py [--models <模型名> ...]
```

每个模型有正例与负控。负控去掉一个前提，检查必须以登记的不变式或时序性质失败；工具出错不算负控通过。结果写到 `tmp/formal/governance/`。`check-contributions.py` 是按作用域释放的有限契约预言机，直接运行。模型通过只说明模型在登记的界内成立，不代替实现的符合性测试。

## 目录捕获的资格与终态

[GovernanceCatalogCapture](models/GovernanceCatalogCapture.tla) 补充一个内部捕获、一次 epoch 更换、成员撤权、资格保留和原操作封口的有限交错。请求身份、来源真实性、SQL同域原子提交及真实Identity保留协议仍是外部前提。本模型不产生这些证明，也不保证任意外部故障下恢复必然结束。

Observe 表示查询或拒绝响应不改变持久状态。它允许受理前撤权及已终结操作保持静止，不作为恢复进展证据；本模型只检查下述安全性质。

QualifiedCapture检查捕获时真实成员与held同时成立；CurrentCapture检查捕获时仍是原epoch。两项使用保存的提交时事实，之后合法结算、撤权或重装不改写原结果。NoRevival禁止已经封口的原操作变为成功。SettledDisclosure要求返回页面前已经结算。只有Capture建立成功记录，守卫及同动作取值建立前两项；Seal使正常Capture失去前置状态；Deliver必须经过Settle。其他动作保留上述关系，可以逐动作归纳。

一个正例检查四项性质。四个负控分别移除held、epoch、sealed及结算门槛，每个只检查对应具名不变量。运行 `python3 packages/governance/governance-local/verification/check.py --models GovernanceCatalogCapture`。实现映射为 governance-local 的 catalog-capture.ts、catalog-snapshot.ts、capture-operation.ts 及原有 Standing/SQL coordinator。错回执、完整绑定、重开、分页和未知结果必须另由真实组合验证。

## 事务内权限解释

[GovernanceEnforcementExecution](models/GovernanceEnforcementExecution.tla) 区分两个租户、三个动作、精确实现替换、贡献退出、解释器可执行性及历史回执重放。Judge 是一次原子的当前观察和判断。loaded 只抽象本次解释代码可执行，不表示在线 Tool 实例，也不引入 SQL active 表。固定发行映射、身份资格、完整来源及真实事务原子性是外部前提。

ExactImplementation 要求成功判断仍对应请求的精确实现。ActualInterpreter 要求本次实际执行解释器。CurrentContribution 要求排序点贡献有效。ReceiptIsNotCurrent 禁止将历史回执用于新动作。TenantIsolation 要求观察域等于原动作租户。初态 history 为空。正确 Judge 的守卫及同动作保存建立这五项性质；Read、Replace、Withdraw 和 Unload 不改已有成功记录。正确协议没有 Replay 转移，因此可按转移归纳。模型不声称任意故障下的恢复活性。

一个正例同时检查五项性质。五个负控分别取消精确实现检查、用清单代替实际执行、使用事务前快照、复用旧回执和改读另一租户。每个配置只检查对应具名不变量。运行 `python3 packages/governance/governance-local/verification/check.py --models GovernanceEnforcementExecution`。

应用协议归[事务内权限解释](../../../../apps/harness-server/docs/rows/permission-interpretation.md)。当前源码已实现解释映射验证、纯权限求值的应用解释及 SQL 支持/判断参与者。原发行和 current 的生产者、ActionAdmission 接线、撤除与实际消费的两种顺序仍需真实组合验收。模型及替身来源测试不能替代这些证据。

## 当前发布与执行装载

[GovernanceTargetPublication](models/GovernanceTargetPublication.tla) 保留两个具有相同Settings正文、不同原发布身份的版本。目标可切版，执行实现可卸载。Read是事务前普通观察，Apply必须重新读取当前发布与装载状态，并在同一动作保存提交时观察。原发行材料固定、当前SQL事务串行是模型前提，不由此模型证明。

ExactPublication要求成功动作对应请求指定的原发布；CurrentAtCommit比较本次消费的修订与提交时修订；ImplementationPresent要求实际提交时实现仍装载。三项都比较保存的提交时事实，后续合法切版或卸载不改写历史成功。逐动作归纳中，只有Apply创建成功记录，其守卫与同动作读取建立三项性质；其他动作不改已有成功记录。

一个正例检查三项性质。三个负控分别以同形正文替代发布身份、使用事务前快照、只核不可变关口声明，各检查其具名不变量。运行 `python3 packages/governance/governance-local/verification/check.py --models GovernanceTargetPublication`。真实发行命名空间、目标字段、数据库排序、预算和卸载围栏仍需生产组合验证；此模型不等于这些实现已通过。

## 贡献命令的结果与当前状态

[GovernanceRegistrar](models/GovernanceRegistrar.tla) 抽象一个贡献原操作、一份不可变发布证明、一条租约及原提交结果。Prepare 仅在来源可验证时保存 proven；后续来源离线不撤销该历史证明。Apply 仅从 prepared 前进，Seal 使该操作不能再次 Apply。声明的版本不变性及真实来源核验是外部前提，模型不发行来源权限。

OriginalStable 要求原成功只保留 active，不随 Release 改写。RecognizeOffline 要求已经提交的操作不会仅因来源离线而报告 unavailable。NoStaleReply 比较一次 Retry 返回值与同次观察的租约状态，不要求已经返回给调用者的旧值随未来退出而自动改变。PreparedProof 要求每份 prepared 都有其首次形成时的来源证明。初始化满足这些性质；Prepare、Apply、Seal、Release 和 Retry 的赋值分别保留对应关系，可以逐动作归纳。

一个正例同时检查四项性质；四个负控分别取消首次来源检查、随退出改写原成功、在认回原成功前要求来源在线、用原成功状态代替当前租约状态。每个负控只检查具名不变量。运行 `python3 packages/governance/governance-local/verification/check.py --models GovernanceRegistrar`，Java/JAR 采用本页运行约定。

实现映射为 governance-local 的 registrar-execution.ts 首次来源消费及保管恢复，registrar.ts 原结果优先与 seal/settle 组合，registrar-results.ts 原结果解码，以及 contribution-read.ts 当前状态投影。跨 Identity 的持续资格依赖 Standing 既有模型，精确信封依赖 GovernanceSqlCustody。这个有限模型不证明完整生产发行路径、目录、Cordis 卸载或任意失败下的进展。

## 治理准入交集

[GovernanceAdmission](models/GovernanceAdmission.tla) 将一个请求抽象为主体、scope、action、owner 和完整执行关口五元组。每一维有两个值；固定政策只允许同一主体、scope、action 下的两组 owner 与关口配对。issued、member 和 qualified 各有两种取值。调用方可在捕获后任意修改原请求及原政策对象。

安全性质为 admitted 蕴含原捕获请求属于受信政策关系，且已发行、当前成员和资格都成立。初始化没有 admitted。Capture 固定原输入；ClientMutation 不改捕获值和内部政策；Decide 只有全部条件满足才设置 admitted。因此每个动作保持该安全性质。TLC 枚举上述有限状态，不是对任意主体发行机制的证明。

六个负控分别取消发行、成员和资格检查，改读可变请求、改读可变政策，或将 owner 与关口拆开组合。它们必须分别破坏 AuthorizedOriginal。运行 `python3 packages/governance/governance-local/verification/check.py --models GovernanceAdmission`，需要本页约定的 Java/JAR 环境。

源码映射为 governance-local 的 admission.ts 中的 verify、current、grantsByKey、permits 和 check。输入结构及 action 变体由 admission-schema.ts 限定。模型中的关口是完整五字段绑定的抽象值；实现测试逐字段修改，另用真实 Identity SQL 检查撤权后的再次准入。模型不表示准入后资格仍保持；后续写入必须使用 Standing 保留及目的 SQL 围栏，也不证明公共服务、发行来源或 Cordis 已集成。

## 动态贡献与持久治理

GovernanceLifecycle 增加两个贡献槽、两代提供者的有界交错。正例检查目录当前性、独立租约、旧代围栏、持久保管、scope、当前提交、来源及定义相容、不可变声明与单次消费。16 个负控分别破坏这些承诺或在 Ready 后停止消费，必须命中具名不变量或具名恢复进展性质。

恢复活性只承诺当前贡献/资格/许可持续合法且消费弱公平时前进。登记恢复本身没有无条件公平承诺。原子提交、声明校验与可靠存储是抽象前提，C3/C6/C8 必须补源码映射和真实卸载重装配验证。模型中的作用域代表 own、foreign-tenant、other-service 三个等价分区，会话/单次/租户业务范围继续由 PermissionScope 检查。

GovernancePublication 另含一个正例及四个具名负控，检查整份发布、冲突拒绝、删声明不删禁止、缺项不绕禁止。check-contributions.py 检查 8768 个租约释放分区与三个负控，命令为 `python3 packages/governance/governance-local/verification/check-contributions.py`。有限谓词与 TLC 状态模型共同守护合同，不能替代生产注册表/SQL/多租户验证。

唯一协议来源是[动态治理贡献](../../../assets/docs/governance-contributions.md)。模型位于本波 HITL 验证目录只是组合测试的组织方式，不改变 Assets、Settings、Authorization 或装配的所有权。

这些资源验证HJ0候选协议和抽象行为，不提供生产HITL服务。模型是行为权威表达，含义与前提见人工介入组的数学说明（`docs/formal-model.md`，随人工介入线进入联调轨道），接口见人工介入组的公共协议（`docs/protocol.md`，随人工介入线进入联调轨道）及人工介入组的权限组合（`docs/permission-composition.md`，随人工介入线进入联调轨道）。后续实现必须填写抽象动作到真实源码/事务的映射，不能拿模型绿灯替代实现接受。

## 按租约保留目标支持

`GovernanceTargetSupport` 补充同一声明下两个租约、两个目标的采用和撤除。采用准备可以与任一撤除交错。当前修订不相等时不能发布旧候选；撤除只删除该租约的支持边，再从剩余支持计算可见目标。

令支持关系为 `S ⊆ Lease × Target`，可见目标为 `range(S)`。撤除租约 `l` 后令 `S' = { (r,t) ∈ S | r ≠ l }`，再取 `range(S')`。于是每个仍有支持的目标保留，无支持的目标消失，其他租约的支持不变。这是集合定义的推论，对任意有限关系成立。SQL 实现仍须在一个事务中兑现该关系更新，数据库外键本身不能证明投影与支持集合相等。

| 不变量 | 负控 |
| --- | --- |
| NoUnsupportedTarget | 只要还有同声明的兄弟租约，就错误保留所有旧目标 |
| AllSupportedTargetsVisible | 撤一个租约时错误删除所有可见目标 |
| MembersCurrent | 支持只能来自仍有效的租约，由正模型检查 |
| PublicationCurrent | 忽略修订，发布撤除前准备的旧候选 |

该模型不新增资格、来源权威或 epoch 保证。它把一个声明内的目标支持单独建模，原有 GovernanceLifecycle / GovernancePublication 继续承担各自性质。有限检查不证明真实事务、查询索引或多租户隔离。提供者的 `gc_member_target` 与选中目标关系必须用真实 SQL 反例建立符合性。

## 治理原操作保管

`GovernanceOperation` 枚举一个原操作、两种请求内容、两种执行信封和提交/封口交错。accepted 表示输入已保管；submitted 表示固定执行内容已保管；committed 与业务效果、原结果共同成立；aborted 阻止迟到效果。

| 不变量 | 实现映射 | 负控 |
| --- | --- | --- |
| RequestImmutable | governance-local 的 acceptOperation 比较原身份和完整请求摘要 | 重试替换原请求 |
| EnvelopeImmutable | submitOperation 不允许替换已经保存的执行内容 | 重传替换原信封 |
| NoRevival | sealOperation / applyOperation 先认回精确终态 | 被封口后仍执行效果 |
| EffectHasReceipt | applyOperation 的业务效果和 finishOperation 在同一物理事务 | 只保存效果不保存结果 |

模型将存储事务视作原子动作，不证明 SQLite 实现，也不认证 principal、发布来源或 execution 中的 authority。它不检查活性、公平性、物理断电和多个原操作之间的作用域隔离。真实 Worker 的回滚、重开、封口和重试反例见 governance-local 的 [操作测试](../../../governance/governance-local/tests/operations.spec.ts)。该测试的资格及来源仍是具名夹具，生产来源适配不能由模型或此测试代替。

## 完整采用与竞争

`GovernanceAdoption` 枚举两个租约、两个采用者、任意候选子集，以及准备、发布和撤除的交错。采用必须覆盖当时全部有效租约，使用当前修订和合法绑定事实，并同时发布整份Settings/Permissions。

| 不变量 | 具名负控 | 实现映射 |
| --- | --- | --- |
| CompletePublication | 允许不完整候选 | adoption-plan.ts 的精确租约集合比较 |
| CurrentPublication | 忽略采用准备的修订 | adoption.ts 的双修订与epoch检查 |
| BoundEvidence | 接受无效事实 | adoption.ts 的操作绑定及 adoption-plan.ts 的目标/关口核对 |
| AtomicBundle | 只发布Settings | 完整bundle选入与同事务关系替换 |

模型将声明内容及目标/关口真实性抽象为具名条件，不证明这些事实的实际生产。它没有建模SQL索引、租户身份或分布式进程。真实回滚、并发赢家、重开、目标支持和错误事实测试见 [adoption.spec.ts](../../../governance/governance-local/tests/adoption.spec.ts)。这些测试的目标/current输入仍是夹具，不能代替生产桥接和完整C3b验收。

## SQL 请求保管守护

GovernanceSqlCustody 把完整原操作及阶段抽象为两个互异的键，把完整 CommitRequestV2 抽象为两个互异的值。检查命令为 `python3 packages/governance/governance-local/verification/check.py --models GovernanceSqlCustody`。需要现有 Java 及 TLA2TOOLS_JAR 环境。

单赋值不变量要求 saved 等于首次保存的 first。发送不变量要求每个非空 sent 都等于同键的 saved。封口不变量要求 closed 后无业务效果。初始化满足三者；Store 仅写空槽，Send 仅复制同键持久值，Commit 仅作用于未终结原操作，Seal 不修改已提交结果。逐个动作保持不变量可给出归纳安全论证。TLC 在上述有限域枚举交错；五个负控分别允许替换、无保管发送、重建、串用其他键及封口后提交，必须破坏各自具名不变量。

源码映射归 governance-local。gc_sql_stage 的完整主键、外键和完整正文比较落实单赋值；sql-stage-binding 核对租户、原操作、事务域、阶段身份、命令及执行绑定；生产 activation 在业务前检查已有保管，并先认回终态。真实 Worker 测试补充持久化、重开、并发保存及原回执查询。

模型假定原子持久存储、可信协调器原样发送以及完整请求值可区分。Restart 是持久状态不变的动作，只表达丢失进程内状态，不验证文件系统断电恢复。模型不证明散列无碰撞、任意规模 SQL 性能、存储可用性或恢复活性。公共协调器的原样发送路径尚未实现，不能把该抽象前提计为已验收实现。

## 恢复阶段的失败身份占用

`GovernanceRecoveryPhase`区分 SQL 的持久阶段回执与治理阶段行。错误请求进入固定 SQL 身份后，即使回滚且没有阶段行，也会占住该身份。模型固定一个不可变原请求、两个候选输入和一个阶段身份。正确输入为1，错误输入为2。NoPoison要求错误输入不能占用该固定身份，ExactStored要求保存的阶段匹配原请求。弱公平的正确重试与封口、稳定材料及可用存储是Completion前提。

负控移除固定写阶段前的完整绑定核对，分别违反NoPoison和Completion。治理事务内的最终核对仍然必要，但它不能撤回SqlStorage对失败提交的持久记录。生产目的适配器必须先读取不可变请求并逐字段匹配，再进入固定阶段；原事务继续复核。此模型只刻画这一缺口，不证明整个SQL提供者或任意恶意调用的可用性。

## 精确退出与修订额度

GovernanceExitCapacity 检查新增登记、采用、退出及换代的计数变化。源码最多128个在线租约，模型使用2个租约、最大修订6，枚举阈值附近的交错。三项负控分别移除预留、把严格阈值改为包含端点、以及退出时不减少在线数量；每项必须破坏 ExitCapacity。

一般论证不依赖小模型的数值。令最大修订为 M，在线上限为 C，阈值为 T=M−C。新增发布要求两个修订严格低于 T，因此最后一次成功递增至多到 T。之后不能新增登记或采用，至多 C 个在线租约各退出一次，修订至多达到 M。重复退出不递增。源码的 revision-budget.ts 固定 C=128，apply-operation.ts 守住发布阈值，contribution.ts 在已退出检查之后才核对真正递增的余量。测试 exit-capacity.spec.ts 在真实 SQLite 上验证阈值、128次退出及最大值上的重复退出。旧实现已经耗尽额度的状态不属于此归纳前提。

GovernanceContributionLifetime 检查一次原调用、迟到的受理、调用方关闭和精确撤除。ClosedIsQuiescent 要求 closed 时没有原调用、迟到受理或活动租约。PreservedReceipt 要求已经 committed 的原回执不改写。SiblingPreserved 要求另一个租约不被清理。四项负控分别跳过排空、允许关闭后迟发、改写原回执和宽范围撤除。

该模型假定可信的未提交且无排队证明、不可变原操作身份和原子 SQL。它不证明存储永久失败后的清理活性、进程重启或 Cordis 运行时行为。生产 contribution-retirement.ts 落实精确 SQL 撤除；caller fiber、提供者重试驱动及其实际装配验证仍须另行完成。Identity 结算继续由原 Standing 协调及其独立守护承担，不能用本模型替代。
