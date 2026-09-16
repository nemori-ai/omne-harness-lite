# Admission 形式工件

legacy CC v1 的 Admission 模型只检查三个不变量：准入具备授权见证
`AdmissionAuthorized`、效果开始前已经耐久 `DurabilityBeforeEffect`，以及取消/安全停止后
迟到启动不越界 `NoLateStartAfterSafeStop`。这只为 CC-02～CC-04 的相应片段提供候选证据。

模型没有 outbox、崩溃恢复、新 epoch 或工程观测状态，因此不覆盖 CC-05、CC-06、CC-07，
也不覆盖任何 recovery interleaving。它同样不覆盖新 v1 的 CC-01 声明规则或真实业务组合行。
旧通过日志不复用；本基线的 Admission 登记任务已有实际 [TLC 执行证据](../../../../../evidence/formal-2026-09-16/README.md)，但结果仍只覆盖上述片段。

## RuntimeRevisionRecovery：revision、publication 与恢复（provisional）

`RuntimeRevisionRecovery.tla` 独立检查协调域中两个 owner stream、两个 operation 的有限交错。
一次 commit 对每条 stream 恰有一个 append，内含有序的两条/一条 owner facts，stream revision
各加一。每个 operation 的 `frozenInputs` 在初态独立选择 `<<S1, S2>>` 或 `<<S2, S1>>`，
后续保持不变；两种排列都是合法输入，没有全局 StreamRef 排序或非排序输入拒绝。
按调用者冻结的 append 数组、再按各 stream 的 facts 数组 flatten，eventId 的 batch sequence
和 flattened index 在 commit 时赋值。这对应 [DR-01](../../../../capabilities/durable-records/v1/contract.md)
的顺序承诺；特定业务可以规定自己的批次顺序，但该模型不把它提升为存储的通用规则。
Run 创建的多条事实同属一条 append 的类比只检验计数关系，不编码 Session/Run 的实际业务 payload。

`ReadHistory` 显式保存在线读取到的 envelope 前缀，`VerifyRecovery` 显式保存恢复重放的前缀。
`FactOrderStable` 对照独立的冻结输入检查 commit；`ReadOrderStable`、`ReplayOrderStable`
再将观测与已提交前缀逐项对比，覆盖 stream 顺序、stream 内事实顺序以及 fact/eventId 的对应。
这不是字节级 decoder/refinement 证明，前缀读取是整批快照抽象。

`history` 和 operation 的 receipt/result 是已提交事实；`publishedOwners`、`ready` 是独立的
owner publication/协调者消费状态。commit 与发布之间可崩溃。恢复先检查前缀有效并一次重建
两位 owner 的 roots，暂存 domain、watermark、owner/host generation；`InstallRecovery` 在单个
状态跃迁原子发布，之后才可 ready。损坏前缀、缺 owner 或旧代 acknowledgement 均不能令
新代 ready。原 operation lookup 返回相同 receipt/result 而不追加；ready 本身不产生 effect，
执行还须本代资格和宿主重新关联，并用 operation 的 effect 去重位限制再执行。

正配置 `RuntimeRevisionRecovery.cfg` 检查 `StreamRevisionPerAppend`、`FactOrderStable`、
`ReadOrderStable`、`ReplayOrderStable`、
`NoPartialOwnerPublication`、`StaleGenerationCannotReady`、`CommittedNeverBecomesNotSeen`、
`LookupReturnsOriginal`、`LookupNoDuplicateAppend`、`RecoveryNoDuplicateEffect`、
`ReadyImpliesVerifiedCompleteInstall`、`RecoveryReadyRequiresValidPrefix` 及类型约束。
另以动作性质 `EffectStartAuthorized` 检查每次效果增量的前态已有本代资格和重新关联，
`ReadyDoesNotStartEffect` 检查变为 ready 的跃迁不产生效果；效果发生后的崩溃不会
把已经发生的合法效果误判为新代无资格执行。
十二份 `RuntimeRevision*Mutation.cfg` 的预期反例如下；反例表示故障被性质检出，不能计作
正模型通过。writer 的两种改序分开注入，不以同时改两种顺序掩盖遗漏。

| 配置中的 mutation | 预期被破坏的性质 |
|---|---|
| `perFactRevision` | `StreamRevisionPerAppend` |
| `writerStreamReorder`（`WriterReorderMutation.cfg`） | `FactOrderStable` |
| `writerFactReorder` | `FactOrderStable` |
| `readStreamReorder` | `ReadOrderStable` |
| `replayFactReorder` | `ReplayOrderStable` |
| `readEventIdReassign` | `ReadOrderStable` |
| `partialInstallReady`、`missingOwnerRecovery` | `NoPartialOwnerPublication` |
| `staleAckReady` | `StaleGenerationCannotReady` |
| `lookupReappend` | `LookupNoDuplicateAppend` |
| `readyAutoEffect` | `RecoveryNoDuplicateEffect` |
| `forgetCommitted` | `CommittedNeverBecomesNotSeen` |

另有三份定向负配置：`readyAutoEffectOnce` 仅在首次 ready 时制造一次效果，
应命中 `ReadyDoesNotStartEffect`；`skipQualification` 和 `skipReassociation`
分别只移除一项执行门，应各自命中 `EffectStartAuthorized`。它们防止
“首次越权效果未重复，所以旧计数不变量仍通过”的盲点。

`RuntimeRevisionPermutationsProbe.cfg` 无 mutation，另加故意否定可达情形的
`NoBothPermutationsReadAndReplayed`。其预期反例必须在同一执行中提交两个不同排列的批次，
在线读到二者，再崩溃并重放二者；这是非空覆盖见证，不是安全性质或进展保证。

2026-09-16 增加两项动作性质后，TLC 正配置仍穷尽 4 个初态、22,764 个生成状态、
5,540 个不同状态，搜索深度 17，未发现错误；原 12 个 mutants、1 个排列探针及
新增 3 个定向负配置均命中各自指定性质。精确工具/输入哈希、退出码和完整日志在
[执行证据](../../../../../evidence/formal-2026-09-16/cc-runtime-revision/results.json)。
DR-01 的 caller-order、revision、fact/eventId 只是有限片段，不能外推到完整协议。

这是一份针对协议假设的**候选模型**，不是已接受规格或实现符合性证明：两条 stream 总在
每个 batch 出现；最多两笔提交、一次崩溃；prefix 校验、完整 fold 和 owner root 内容以
`prefixValid`、`stagedOwners` 抽象；receipt/result 用 operation 与 batchSeq 的确定关系抽象；
外部效果只以计数与去重位抽象。它没有验证 JSONL 字节恢复、租户授权、任意 stream 子集、
任意大小批次、重复 StreamRef 拒绝、CAS 冲突、writer epoch、个人创建特殊批次、
多代连续崩溃、故障中的 durable outbox 效果交接或进展/公平性。尤其旧 ExactUse/
资源责任收口、新 writer epoch、历史 completion 保持 blocked、lookup 的恢复基线引用
均未入模；不完整或混代候选的拒绝也仅有抽象检查。独立评审曾发现旧模型未检查首次
ready 越权效果；上述动作性质与负配置修补这一有限缺口，定向独立复核已通过。
该结果未加入注册任务，也不属于 J 的原 31 项通过；不能称为完整 DR/CC 证明或
提供者符合性证据。

## RecoveryEligibility：恢复开放的必要条件（provisional）

`RecoveryEligibility.tla` 是独立的有限候选模型，针对
[CC-03/CC-06](../contract.md) 与 [DR-01/DR-02](../../../../capabilities/durable-records/v1/contract.md)
中旧责任、新 writer epoch、历史 completion 与恢复 lookup 的门条件。
它补充上节模型的覆盖范围，不改变上节模型或正文，也未进入 catalog/formal-tasks 登记。

初态固定在一笔原 operation 已提交、owner publication 尚未完成后的恢复入口：原 position
为 `(core, seq=2, writerEpoch=1)`，原 receipt/result/batch 与 `publication=blocked` 已保留。
两位 owner、一份旧 ExactUse claim 和一份资源 claim 属于同一协调域。新 host 与 owner
generation 固定为 2。模型不重新执行原 commit，也没有第二笔业务 append；成功取得 writer
抽象为已独占取得并同步 epoch=2 的 acquire batch，watermark 从 2 到 3。
writer 的 unknown/unavailable 不交出写入资格；unknown 不表示 acquire 未曾提交。

### 安全性质与输入边界

| 条款片段 | 检查性质 | 明确抽象 |
|---|---|---|
| DR-01 新 writer 先耐久取得严格新 epoch | `FreshWriter` | 独占权与 acquire batch 的同步由成功动作共同代表；不验证锁/字节实现 |
| CC-06 完整、同域、同代基线原子安装 | `CompleteCurrentBaseline` | 两位 owner 的 fold/跨 owner 校验以 `valid/missing-owner/bad-relations` 输入表示 |
| CC-06 按原 claim 核实并收口旧责任 | `ClaimsUseOriginalIdentity`、`SettledClaimsHaveEvidence`、`OpenRequiresEligibility` | 两项 claim 独立核实；可收口的依据由权威提供者输入，模型不发明释放或补偿协议 |
| CC-06 原 completion 永久 blocked | `HistoricalCompletionUnchanged` | 原 operation、receipt、result、batch、position 与 completion 整体不可改写 |
| CC-06 新代 lookup 返回覆盖原 position 的基线 | `LookupCoversOriginal` | 引用包含 domain/watermark、owner generations、host generation、writer epoch，与完整安装对象相同 |
| CC-06 关闭期间禁止 committed broadcast/新效果 | `BroadcastRequiresOpen`、`EffectRequiresCurrentEvidence` | broadcast 为一个布尔观测，效果为一次计数增量 |
| CC-06 可消费结果不自动授权/重发，墓碑不复活 | `OpeningDoesNotExecute`、`UnknownAttemptNeverResent`、`TombstonesNeverResurrect` | 当前资格与原 attempt 查询结果分开；仅 `not-started`、当前允许且无墓碑时可执行 |

`env` 从 3,888 种有限组合中选择一次并保持不变：前缀有效/无效、writer 成功/未知/不可用、
owner 根完整/缺失/关系错误、每项旧 claim 可收口/无法核实/仍可能承载效果、原 attempt
未开始/已关联/unknown、当前权限允许/拒绝，以及 live/cancelled/deleted/superseded。
`dischargeable` 的含义是权威核实足以支持本次处置；它**不是**仅凭旧历史即可释放的判定。
实际判定、资源结算和 external attempt 查询仍由提供者设计与实现证据闭合。

模型允许完整基线安装后 lookup 返回可消费引用，而旧 claim 尚未收口，协调域仍关闭；
这个返回不授执行许可。其当前资格核实与 attempt 查询可以继续，效果始终另过开放门。
已关联的旧 attempt 不再次发出；unknown 不重试。无论安装、开放还是 lookup，都不自动执行效果。

### 进展前提、负例与实际运行

`RecoveryEligibility.cfg` 不加公平性，检查上述安全性质与 `TypeOK`。
`RecoveryEligibility.progress.cfg` 在相同环境空间上采用 `FairSpec`，只对前缀核实、writer
取得、fold、安装、逐 claim 核实、开放及 lookup 加弱公平性；若这些本地动作持续可做，
调度最终须执行它们。`ConditionalRecoveryProgress` 只在前缀有效、writer 成功、owner
根完整且**每一项**旧责任可收口时保证最终开放并取得 lookup 引用。
它不保证外部证据最终成功，也不保证执行、关联完成或 unknown 最终消失。

`RecoveryEligibility.unconditional-progress.cfg` 故意要求所有环境最终开放。TLC 给出满足
本地公平性的反例：新 writer 与完整基线已取得，ExactUse 已收口，但资源责任无法核实，
最终在关闭状态停留。故障时保持关闭是这里的安全结果，不能用无限等待冒充进展保证。

所有下列负配置均使用同一个模型，只启用指定 mutation 或故意否定可达状态；它们的非零
退出是预期反例，不能计作正模型通过。

| `RecoveryEligibility.` 后的配置名 | 预期反例 |
|---|---|
| `reuse-epoch.cfg` | `FreshWriter` |
| `stale-baseline.cfg` | `CompleteCurrentBaseline` |
| `wrong-claim.cfg` | `ClaimsUseOriginalIdentity` |
| `skip-claims.cfg` | `OpenRequiresEligibility` |
| `rewrite-completion.cfg` | `HistoricalCompletionUnchanged` |
| `uncovered-lookup.cfg` | `LookupCoversOriginal` |
| `early-broadcast.cfg` | `BroadcastRequiresOpen` |
| `retry-unknown.cfg` | `UnknownAttemptNeverResent` |
| `ignore-tombstone.cfg` | `TombstonesNeverResurrect` |
| `open-auto-effect.cfg` | `OpeningDoesNotExecute` |
| `skip-qualification.cfg` | `EffectRequiresCurrentEvidence` |
| `execution-probe.cfg` | `NoRecoveredExecution`：合法开放、lookup、核实后确实可以执行 |
| `blocked-probe.cfg` | `NoBlockedConsumableUnknown`：可消费 lookup、未结旧责任与 unknown attempt 可以共存且无效果 |

2026-09-16 TLC 安全与条件进展配置均穷尽 3,888 个初态、46,275 个生成状态、28,538 个不同
状态，深度 13，无错误。11 个 mutation、2 个可达性探针和 1 个无条件进展负例均命中指定
性质。原始日志、精确模型/配置/来源契约与工具哈希、命令及退出码在
[执行记录](../../../../../evidence/formal-2026-09-16/cc-recovery-eligibility/results.json)。

这些结果只关闭上述**有限抽象中的门条件检查**。模型从已提交的恢复入口开始，未验证
CC-03 的逻辑排位/待耐久窗口、JSONL 前缀重建、writer.acquire 未回执后的再次接管、多 writer
竞争、跨域、任意数量 claim/owner/operation、多代连续崩溃、原责任实际释放/补偿、任意 owner
payload fold、权限或墓碑在核实与执行间变化、attempt 查询协议以及外部效果的真实去重。
其环境证据在本次恢复内不变，完整安装是一个原子动作；把真实异步提供者细化为这些动作的
符合性义务仍未证明。不能据此宣称完整 CC-06/DR 协议已证明、提供者已符合，或旧登记任务
获得新增覆盖；缺失的 claim/attempt 算法只能由对应权威补充，不能从本模型反推产品协议。
