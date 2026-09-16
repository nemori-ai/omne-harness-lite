# Admission 形式工件

legacy CC v1 的 Admission 模型只检查三个不变量：准入具备授权见证
`AdmissionAuthorized`、效果开始前已经耐久 `DurabilityBeforeEffect`，以及取消/安全停止后
迟到启动不越界 `NoLateStartAfterSafeStop`。这只为 CC-02～CC-04 的相应片段提供候选证据。

模型没有 outbox、崩溃恢复、新 epoch 或工程观测状态，因此不覆盖 CC-05、CC-06、CC-07，
也不覆盖任何 recovery interleaving。它同样不覆盖新 v1 的 CC-01 声明规则或真实业务组合行。
旧通过日志不复用；本轮仅登记，Java/TLC 不可用时不声称执行成功。

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

`RuntimeRevisionPermutationsProbe.cfg` 无 mutation，另加故意否定可达情形的
`NoBothPermutationsReadAndReplayed`。其预期反例必须在同一执行中提交两个不同排列的批次，
在线读到二者，再崩溃并重放二者；这是非空覆盖见证，不是安全性质或进展保证。

2026-09-16 对照 DR 候选修订 `ed607ad` 完成 caller-order 最终重跑：TLC 1.7.4
正配置穷尽 4 个初态、22,764 个生成状态、
5,540 个不同状态，搜索深度 17，未发现错误；12 个 mutants 和 1 个覆盖探针均产生指定反例。
精确工具/输入哈希、运行命令、退出码和完整日志归工作区的忽略路径
`tmp/docs-spec-v1/runtime-revision-formal/caller-order-final-ed607ad/`。
本次对照的 DR `contract.md` SHA-256 是
`550995cc96f98b39a467d95c27ed3d00d27d1cdbb53a9c5cd61fe55399507081`；
只覆盖其中的 revision、批内顺序、fact/eventId 与 CC 发布恢复片段。

这是一份针对协议假设的**候选模型**，不是已接受规格或实现符合性证明：两条 stream 总在
每个 batch 出现；最多两笔提交、一次崩溃；prefix 校验、完整 fold 和 owner root 内容以
`prefixValid`、`stagedOwners` 抽象；receipt/result 用 operation 与 batchSeq 的确定关系抽象；
外部效果只以计数与去重位抽象。它没有验证 JSONL 字节恢复、租户授权、任意 stream 子集、
任意大小批次、重复 StreamRef 拒绝、CAS 冲突、writer epoch、个人创建特殊批次、
多代连续崩溃、故障中的 durable outbox 效果交接或进展/公平性。独立评审尚未完成，
该结果未加入注册任务，也不属于 J 的 31 项通过；迁移正文变化后须核对其准确修订，
重跑受影响模型，不能将该有限候选模型称为完整 DR/CC 证明或提供者符合性证据。
