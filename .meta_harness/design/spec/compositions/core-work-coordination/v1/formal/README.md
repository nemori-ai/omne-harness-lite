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
各加一；跨 stream append 顺序固定为 canonical StreamRef 顺序，eventId 的 batch sequence 和
flattened index 在 commit 时赋值。非 canonical 请求由 `RejectNonCanonical` 表示为不修改 history
的拒绝；它不为 writer 提供隐式排序动作。Run 创建的多条事实同属一条 append 的类比只检验
计数关系，不编码 Session/Run 的实际业务 payload。

`history` 和 operation 的 receipt/result 是已提交事实；`publishedOwners`、`ready` 是独立的
owner publication/协调者消费状态。commit 与发布之间可崩溃。恢复先检查前缀有效并一次重建
两位 owner 的 roots，暂存 domain、watermark、owner/host generation；`InstallRecovery` 在单个
状态跃迁原子发布，之后才可 ready。损坏前缀、缺 owner 或旧代 acknowledgement 均不能令
新代 ready。原 operation lookup 返回相同 receipt/result 而不追加；ready 本身不产生 effect，
执行还须本代资格和宿主重新关联，并用 operation 的 effect 去重位限制再执行。

正配置 `RuntimeRevisionRecovery.cfg` 检查 `StreamRevisionPerAppend`、`FactOrderStable`、
`NoPartialOwnerPublication`、`StaleGenerationCannotReady`、`CommittedNeverBecomesNotSeen`、
`LookupReturnsOriginal`、`LookupNoDuplicateAppend`、`RecoveryNoDuplicateEffect`、
`ReadyImpliesVerifiedCompleteInstall`、`RecoveryReadyRequiresValidPrefix` 及类型约束。
八份 `RuntimeRevision*Mutation.cfg` 分别引入按 fact 递增、writer 改序、部分安装、旧代 ready、
lookup 重提、ready 自动效果、忘记 commit、缺 owner 强行安装；每一份应触发相应安全性质。

这是一份针对协议假设的**候选模型**，不是已接受规格或实现符合性证明：两条 stream 总在
每个 batch 出现；最多两笔提交、一次崩溃；prefix 校验、完整 fold 和 owner root 内容以
`prefixValid`、`stagedOwners` 抽象；receipt/result 用 operation 与 batchSeq 的确定关系抽象；
外部效果只以计数与去重位抽象。它没有验证 JSONL 字节恢复、租户授权、任意 stream 子集、
多代连续崩溃、故障中的 durable outbox 效果交接或进展/公平性。实际运行结果和精确输入
哈希在被忽略的 `tmp/docs-spec-v1/runtime-revision-formal/`；迁移正文定稿后必须对照其准确
commit 重审假设、重跑受影响模型，不能将 WIP 检查直接登记为 final 证据。
