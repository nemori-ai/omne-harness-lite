# 正文保管的有界模型与论证

本目录维护 Tool 可靠交接、固定期限、读页与删除竞争、作者输出屏障、最终结果提交及事实重放的候选验证资源。行为依据归 [Tool SPEC](../../../SPEC.md#有限期正文保管)，证据层级归[验证说明](../../../../../../docs/verification.md)。局部模型、人工归纳和实际提供者符合性分别判断。模型未机械组合或精化到产品代码。

## 运行与判读

使用 OpenJDK 21 与 TLC 1.7.4。工具不下载依赖；通过 `--jar` 或 `TLA2TOOLS_JAR` 指定 JAR。固定摘要为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`，不匹配时拒绝运行。

```sh
python3 packages/tool/tool-contract/verification/models/body-custody/check.py --out tmp/w3-body-custody-check
```

可用 `--case Custody-positive` 选一个配置。未知名称失败，不产生通过结论。脚本顺序运行，单个配置上限 60 秒，Java 堆 768 MiB，一个 TLC worker。原始日志、状态目录和带模型/config 摘要的汇总写入指定 `--out`，不写进正式资源目录。

正控要求退出 0 且 TLC 明确完成全状态空间检查。负控要求退出 12，唯一违反的不变量必须等于配置指定名称。解析错误、超时、内存不足和其他非零退出均失败。本目录不保存某次执行结果；一次运行只能支持它实际记录的工具、输入和有限范围。

## 3. 模型状态和动作

### 3.1 Handoff

模型有两个结果、两个租户、两个处理者。处理者可以交错请求同一结果，也可以处理不同结果。每个请求显式携带 result、tenant、version；版本 1 合法，版本 2 为不匹配候选。两个租户都可以出现在请求中。没有启用对称性约简。

- `tool` 表示生产者仍保管该结果。
- `claim` 表示受信消费者已经提交可靠承接。
- `processed` 表示消费者已经可靠记录处理完成。它不代表 guest 内存或 Promise resolve。
- `appended` 和 `binding` 表示消费位置的耐久记录次数及结果、租户、版本绑定。
- `known` 是生产者已收到或查询到的承接证据；它与实际承接事实分离。
- `request` 是两个处理者尚未完成的请求。

`Start` 只发出请求。`Commit` 核对身份并在消费者自己的提交边界写入 claim、绑定和逻辑记录，未同时释放 Tool。它可以发生后丢失全部回执。`Query` 按原结果认回耐久 claim；`LoseAck` 和 `Crash` 丢失回执知识，但保留已经提交的事实。`Release` 单独解除生产者保管。两次提交只认回同一消费位置，正常模式始终保持 appended=1。

`Process` 表达另一条合法路径：Tool 仍持有时，消费者已可靠完成处理。普通 Session 若既未提交 claim、又未提交处理完成，Release 的守卫为假。

Handoff 检查安全性，不承诺消费者会 ACK、会完成处理或会恢复。消费者无限故障时，生产者保留责任正是正确行为。取消、容量背压和失败终结须另由候选设计给出，不能由此模型推导。

### 3.2 Custody

模型有两个 Tool 自有材料、一个外域原生资源目标及两个租户。每个材料固定一个已提交且激活的版本。时间为 0..3，材料期限分别为 1、2，单页租约剩余步数为 0..2。初态已经完成最终结果 commit/activate；准备及激活过程由 Materialization 检查，不再把 writer seal 当成该初态的充分条件。

`phase` 取 live、expired、fenced、done。`bytes` 表示实际物理对象存在，故 phase=fenced 且 bytes 已消失是可达状态。这正是删除成功但确认未写回的间隙。`operation` 持久保存待删除的材料版本。

`ExternalNative={3}` 表示外域原生资源目标，永远不进入 Tool 的可删除集合 M。`native` 只表示 Tool 自有共享字节受到独立原生用途保护，`program` 是耐久程序消费者持有，`producer` 是尚未完成程序交接的生产侧持有。初态材料 1 有原生持有，材料 2 有生产侧持有。`Acquire(...,"program")` 可以先建立消费者 claim，`ReleaseProducer` 仅在 program claim 已存在时释放生产侧持有。两步之间允许到期、失败、其他用途变化和 GC 扫描，未把 Transfer 合成跨域原子操作。

`BeginRead`、`Acquire`、`DeleteIntent` 是同材料 gate 内的线性化动作。它们在模型中原子化的是本保管者的检查及元数据提交，不包含外部读取和物理删除。不同材料的动作仍能交错。

`BeginRead` 先核租户和版本，再核当前时间、删除围栏及材料存在。开始的一页可以在到期后通过 `EndPage` 完成；`LeaseTick` 表达有界租约耗尽。到期后不能开始后续页。每个材料最多一个在途页是本次有界范围，不据此宣称任意并发页数量已检查。

`Expire` 仅更新逻辑状态；即使扫描尚未执行，BeginRead 也直接比较 now 与 expires。`DeleteIntent` 检查全部独立持有与读取租约为空，持久写入 fence 和操作版本。`PhysicalDelete` 在元数据事务外按该身份删除，重复执行不改变结果。`Confirm` 另行提交回收完成。`RetryOrCrash` 保持持久状态，允许任意多次失败或停顿；模型没有把失败隐去为一次成功删除。

每个材料的每类用途只建模一个 claim。重复 Acquire 认回这个 claim。不同原生使用者的多个同类 token、不透明 token 的伪造及引用计数实现错误未被这组有限状态覆盖。

### 3.3 Writer

追加模型采用 [作者 writer 契约](../../../SPEC.md#模型正文-writer)及其 begin/append/seal 和输出屏障。一个 BodyWriteScope 下有两个有序片段，分别以固定 sequence 1、2 表示。它检查片段 IO、seal IO、return/cancel 与持久恢复移交的交错；处理者身份被隐藏，所有入口仍遵守 scope 状态门。本模型不做主体对称性推广。

`begun` 表示 begin 已受理。`accepted` 是 append 已受理的片段，`durable` 是已经写入正文存储的片段，`failed` 是明确失败并记录收场依据的片段。`Pending=accepted \ (durable ∪ failed)`，不能因为返回错误或取消而从 accepted 中抹去历史。

Accept 的抽象前提是该片段及足以认回它的受控源已经由原 scope 的持久账目保管。它不是 guest 内存中的一次函数调用。normalized body 字节尚未写完时，仍可依赖这个受控源恢复。若具体 provider 仅把未 await 的片段留在易失内存，就不满足 Accept，必须先补保管机制；本模型不会替它假设断电后字节自然存在。

`scope` 为 active/closing/closed。RequestClose(return/cancel) 只关闭新入口；cancel 可以立即产生 terminal=failed，但未清空 Pending。HandoffFragment 和 HandoffSeal 分步建立独立恢复待办。Close 只有在每项未完成工作均有恢复待办时才退休原 scope。Flush、FailFragment、CommitSeal、FailSeal 在 Close 后仍能按原待办结清，不依赖原作者继续运行。

`sealState` 为 none/requested/sealed/failed。RequestSeal 固定本 scope 唯一 seal 操作，重复请求只能查询或重试，不能另建操作。它允许所有片段已经 accepted 而实际正文写入尚未完成的情况；requested 是待办，不是成功答复。CommitSeal 要求两个片段都 durable。若公共 seal 入口选择在此之前返回 not-ready，它可在外层提前拒绝；模型没有把 requested 投影为成功的 SealedToolBody。

CommitSeal 与 InspectSeal 分离。前者提交 sealed 事实但不设置 sealReceipt，后者从同操作查询到该事实。LoseConfirmation 可以任意丢失回执知识，不撤销 sealed。RetryUnknown 不改变状态，未知不自动升级成功。Link 仅在取得可信封存证据后建立 writer 候选的内部关联；关联一旦耐久成立，之后再次丢失回执不会抹去关联。该关联尚不是最终 ResultRecord 提交。

Writer 保留原模型标识 Publish/published/terminal 以维持已检查轨迹，但在修订后的组合中它们只表示 writer 候选交给 settle 准备阶段及该局部阶段的结果，不表示最终 ToolResult 已提交或对消费者公开。Publish 要求 scope 已 closed、退出原因为 return、正文已 linked 和 sealed、所有片段 durable。未 await 的写入可以继续完成或移交，但不能让该候选提前交出。取消失败阶段可以先出现；成功交出候选仍受完整屏障约束。最终提交必须另行经过 Materialization.Commit。原业务效果 effects 固定为 1，没有重新 execute 的动作。

### 3.4 Materialization

该模型直接对应 [准备、提交与交付](../../../SPEC.md#准备提交与交付) 的准备与提交顺序。一份 raw 通过已知 codec 构造四个独立最终材料槽：body、data、preview、native-meta。native-meta 只是原生引用的元数据，原生目标不在此模型的字节集合中。此模型检查单个结果的材料化，不用它替代 Handoff/Custody 的双租户与双身份检查。

Validate 表达原返回校验成功，FinishBarrier 表达从 Writer 取得完成的输出屏障依据。WriteSlot 与 InspectSlot 分开，前者写入字节，后者认回持久证据，写入成功但回复未知可以停在两步之间。Prepare 必须等所有最终材料均已确认耐久、校验和屏障完成，才设置 prepared。

RequestCommit 记录固定结果提交操作，但不代表提交发生。Commit 是 Tool 权威元数据内的单个线性化点：它记录 committed、activatedAt/expiresAt、全部最终通道用途，同时解除 rawUse 并产生 rawTask。真实字节的 WriteSlot 在它之前，Session 接收在它之后，没有跨库原子假设。

Commit 与 InspectCommit 分离。提交已经成功但 commitKnown=false 的状态可达，LoseCommitReply 还可以反复丢失知识。不得把 unknown 当 not-committed。DeleteRaw 依据权威的已提交 rawTask 工作，不依赖提交方是否收到 ACK。raw 删除和 ConfirmRaw 也分为两步，删除未知保持待办。

Expire 只允许 committed 且达到固定期限，它只解除 body 用途。DeleteBody 随后删除 body；data、preview、native-meta 的独立字节及用途保留。本模型检查它们在尚未完成消费者接管时的保护，不建模其最终消费后释放。Deliver 可发生在到期之后，只交付最终可恢复的通道及正文已过期事实，不能重新依赖 raw 归一化；它要求先 InspectCommit 取得同一次提交事实。

expires=0 表示未激活。提交时 TTL 固定为一个离散时间单位；提交前 now 最多前进到 2，提交后可前进到 4，以保证每个允许的激活时刻之后都存在越过期限的状态。这个有界时钟配置用于检查交错，不是生产时长。Commit 一次后不会重入，重复认回只改变 commitKnown，不重新计算期限。

## 4. 归纳安全性论证

下列推导针对 Bug="none"。Init 提供基例，逐动作保持提供归纳步；目标性质没有作为 Init 或 Next 的未受约束假设。TLC 机器检查的是上述具体有限配置。这里的推导是人工数学论证，没有运行 TLAPS 或其他无限域定理检查器。

### 4.1 可靠交接无责任空档

取加强不变量 `known ⊆ claim`、`R \ tool ⊆ claim ∪ processed`，以及 claim、processed 只增不减。

Init 中 known、claim、processed 都为空，tool=R，两式成立。只有 Query 增加 known，它要求结果已经在 claim；LoseAck、Crash 只能减小 known。Commit 增加 claim，Process 增加 processed，它们均不删 tool。唯一减少 tool 的 Release 要求结果属于 known 或 processed。前者由加强不变量推出属于 claim，因此 Release 删除后仍有 claim 或 processed。其他动作不减少这些耐久事实，归纳成立。

Commit 的正常赋值把对应 appended 设为 1，并保留其他结果计数。只有 Commit 能写 appended，因此每个计数由 0 变为 1 后保持 1。ClaimHasDurableRecord 同时成立。Commit 的 Valid 守卫要求 request 中的结果、租户、版本一致，并把同一 request 写入该结果的 binding。其他动作不写 binding，因此 ClaimBinding 成立。

这个推导要求消费者提交把“耐久材料或足够恢复依据”和 claim 置于同一可靠提交边界。一个裸引用或非耐久 ACK 不满足 Commit 的含义，不能借模型把它视为承接。

### 4.2 固定期限和读取资格

expires 在 Init 等于 ActivationExpiry。正常 Next 的所有动作均保持 expires，因此 FixedDeadline 归纳成立。lastGrant 在 Init 取 0，严格小于两个期限。唯一改写 lastGrant 的 BeginRead 要求 now<expires，并记录相同的 now。结合 FixedDeadline，NoLateRead 成立。它同样把守卫已经核对的 tenant、version 写入记录，所以 AuthorizedRead 成立。

Expire、ACK、请求重试和重启没有写期限的动作。该结论依赖受信时钟单调及激活期限耐久保存，不证明机器时钟或数据库实际满足这些前提。授权撤销、不可观测的拒绝顺序、错误信息及时间侧信道也未由 AuthorizedRead 证明。

### 4.3 独立持有和读取不被 GC 误删

取加强不变量：fenced 或 done 的材料没有 native、program、producer 持有，且 lease=0。Init 无 fenced/done。DeleteIntent 是唯一进入 fenced 的动作，它检查该条件。Acquire 与 BeginRead 仅允许 live/expired，不能在 fence 后新增持有或页。其他动作只能撤除持有、减少租约或推进 phase，因而保持加强不变量。

外域原生资源 ExternalNative 与 M 不相交。所有 PhysicalDelete 的参数均来自 M，因此 ExternalNativeProtected 由 Init 和每个删除动作的定义域归纳成立。即使外域原生用途已结束，Tool 也没有删除外域资源目标的动作。

初态全部持有对应的 bytes 存在。Acquire 只在 bytes 已存在时增加持有。ReleaseUse、ReleaseProducer 仅减小自己的持有集合。唯一删除 bytes 的 PhysicalDelete 要求 fenced，所以由加强不变量，删除时没有任何合法持有和页。由此 IndependentUseProtected、NoDeletionDuringRead 保持成立。

ReleaseProducer 的守卫检查消费者 program claim，因此它不会制造交接空档。若消费者在两步间自行退出，ReleaseProducer 失去资格，producer 持有仍阻止 GC；稍后须重新认回接管或走处理完成的协议。此模型只检查接管分支。

### 4.4 围栏、重试和效果

正常动作从不向 bytes 添加对象。Confirm 要求目标 bytes 已消失；以后也没有动作重建它，故 NoRevival 成立。fence 后 Acquire/BeginRead 均被拒绝，operation 保存同一材料的固定版本，Confirm 和 PhysicalDelete 都按这个版本检查。重试只能继续旧操作，不能解除 fence。

所有正常动作保持 effects，因此 EffectStable 归纳成立。这是清理接口不具有 execute 能力的候选要求，真实调用图与权限隔离仍需实施证据。模型初态已经发生一次效果，不证明原业务操作本身恰好执行一次。

### 4.5 Writer 的屏障与未知提交

Init 无 accepted 工作，未封存、未关联、未发布，因此 NoPendingLost、SealSound 和 PublishSound 成立。Accept、Begin、RequestSeal 均要求 active；RequestClose 单向改为 closing，Close 单向改为 closed，没有重开动作，因此关闭后无新接纳。NoLateAdmission 用 ghost 观察量记录实际 Accept 时的 scope，检验该结论。

关闭前的 Pending 由原 scope ledger 拥有。唯一退休该拥有者的 Close 要求 Pending⊆recovery，而且 pending seal 必须有 sealRecovery。Flush/FailFragment 原子地把片段从 Pending 移至 durable/failed，并移除对应恢复待办，因此不会留下待办先删、实际工作还未结清的间隙。CommitSeal/FailSeal 同样先结清 seal 事实并同提交解除其恢复责任。其他动作不减少尚未结清的恢复责任，NoPendingLost 归纳成立。

RequestClose(cancel) 只记录 closing 和失败终局，不改变 accepted、durable、failed、recovery、sealState。上述责任不变量继续成立。Publish 要求 closingReason=return，而 closingReason 一旦关闭便不再改变，因此取消不会随后冒充成功发布。CancellationPreservesResponsibility 由这两个事实导出。

CommitSeal 是唯一进入 sealed 的动作，要求 durable=Fragments。durable 只增不减且不与 failed 重叠，因此 SealSound 保持成立。InspectSeal 仅在 sealed 时设置 sealReceipt；任何动作均不能使 sealed 倒退，所以 ConfirmationSound 成立。Link 要求 sealReceipt 和 sealed，故 LinkSound 成立。Publish 自身检查 closed、return、linked、sealed、durable，后续动作均不撤销这些事实，故 PublishSound 归纳成立。

模型只有一个固定 seal 操作。none→requested 之后无法返回 none，确认丢失也不改该操作状态。因此未知查询及重试不会建立新 seal，不能以重试刷新封存语义。多 writer key、相同 operation 异内容及跨 scope 代次匹配未被这一单 scope 模型证明。

### 4.6 材料准备、激活与 raw 替代

Init 中 raw/rawUse 为真，committed 为假、expires=0。正常动作中只有 Commit 解除 rawUse 并创建 rawTask，而它要求全部最终字节、确认、校验和屏障已经成立。只有 DeleteRaw 删除 raw，并且要求 rawTask=pending、rawUse=false。因此 raw 消失必然晚于 Commit，RawUntilCommit 由此归纳成立；不把“已经开始准备”当作替代依据。

Commit 把所有最终槽写入 finalUses；它的守卫保证这些槽的字节已存在。正常后续动作只可能删除 body，且必须先 expired。data、preview、native-meta 的字节和用途不被任何正常动作删除。因此 FinalDataRecoverable 成立。结合 raw 只能在 Commit 后消失、body 只能在 expired 后消失，得到 ReplacementBeforeRawRelease。

只有 Commit 能正常写入非零 expires，它同一步设置 committed 和 activatedAt，取 expires=activatedAt+1。其他正常动作不改这三项事实。因此 ActivationOnlyAtCommit 与 FixedActivatedDeadline 成立。Expire 要求 committed 且 now>=expires，故 ExpiryOnlyActivated 成立。writer 封存、WriteSlot、Prepare、RequestCommit 都不启动 TTL。

InspectCommit 和 LoseCommitReply 只改变调用者的知识，不改权威 commit、用途、期限或字节。所有物理清理都检查权威任务或 expired，不能以 commitKnown=false 作为孤儿清理依据。于是提交成功但确认未知时 Permanent 仍可恢复，UnknownIsNotFailure 成立。Deliver 要求 commitKnown，而只有已 committed 的 InspectCommit 能设置它，故 DeliveryAfterCommit 成立。

这些归纳依赖真实 provider 对 WriteSlot 耐久证据和 Tool 元数据同提交的兑现。模型中的 Commit 不能把尚未完成的物理写入变成耐久，也不证明 schema 或 codec 语义；后者是 Validate 抽象输入的独立验收义务。

## 5. 共享撤除的保留推导

对一个材料的合法持有集合 H，每个真实持有采用唯一 token h。定义建立为 `H := H ∪ {h}`，撤除为 `H := H \ {h}`。对 h≠k，若 k∈H，则 k∈H\{h}。因此撤除 h 保留其他持有 k，不需要恢复旧集合快照。

对两个不同 token，集合等式 `(H ∪ {h}) \ {k} = (H \ {k}) ∪ {h}` 成立。但建立和撤除带有 fence、权限及存在性守卫，故本说明不声称所有操作都可交换。DeleteIntent 必须与 Acquire、BeginRead 在同材料 gate 下排序，不能因集合等式省略该控制。物理删除只有在 fence 已提交后执行，避免“检查无持有后，其他方又取得持有”的窗口。

有限模型用 native/program 两个不同持有类别及 producer 检查这一保留关系。任意 token 集合的上述数学事实是人工推导；实际表示从一个类别扩展为多个 token 后，仍须验证唯一 token、撤除资格、代次及持久 gate 的实现。这里没有以未机器检查的任意规模交换性放宽隔离或围栏。

## 6. 回收进展及其前提

`EventuallyReclaimed` 对每个材料表达：若所有独立用途及生产侧持有最终持续为空，则最终进入 done。

1. Tick 的弱公平性使有界时间最终到达 3，超过所有固定期限。Expire 的弱公平性使未到期状态最终转为 expired。
2. 到期后无新页，LeaseTick 的弱公平性使有限自然数 lease 严格下降至 0。EndPage 可让它更早归零。
3. 若独立用途从某时起持续为空，则 DeleteIntent 最终持续可用。其弱公平性使 fence 提交。
4. fence 后不会新增持有，PhysicalDelete 持续可用，其弱公平性使 bytes 消失。Confirm 的弱公平性使 done 成立。

公平性由实际后台扫描、重启扫描、租约驱动和存储恢复共同兑现。允许有限次数的失败、回执丢失和崩溃；没有宣称永久存储不可用时仍能删除。独立文件永远保留，或程序尚未交接，均可能使物理对象长期存在，但旧卸载入口仍在期限处失效。这个条件性质不是“整个磁盘永不增长”。

Writer 另检查 EventuallySettled：一旦 scope 不再 active，所有 Pending 及 pending seal 最终结清。关闭后不再增加片段或请求 seal，未结片段有限。ResolveFragment 的弱公平性让每个片段写入完成，或在 cancel 下记录明确失败；责任不变量保证 closed 后仍有对应恢复执行资格。全部片段成功时 CommitSeal 持续可用；取消时 FailSeal 持续可用。ResolveSeal 的弱公平性使 pending seal 结束。该性质允许存储暂时失败，但假定恢复驱动与其依赖最终提供持续进展机会，不保证永久故障下仍会收场。它不要求正常 return 后自动发布；发布前的业务及校验资格不由公平性补造。

Materialization 另检查 CleanupWithoutAck：committed 最终导致 raw 删除并确认，且 body 字节消失。Commit 已创建 rawTask 并解除 rawUse，因此 DeleteRaw/ConfirmRaw 的弱公平性保证它们完成。Tick 最终越过固定 expires，Expire/DeleteBody 的弱公平性保证 body 清理。Acknowledge 没有任何公平性要求，清理动作也不读取 ack，因此永远没有 ACK 的执行仍被该性质覆盖。永久字节存储故障会破坏成功清理动作的公平性前提，不能据此保证回收。

弱公平性没有给出墙钟删除上限。生产验收必须测扫描周期、租约最大时长、删除告警与重试策略，区分逻辑回收、数据库页复用及操作系统空间归还。

## 7. 负控的指定性质

| 配置 | 故意引入的错误 | 必须命中的名称 |
| --- | --- | --- |
| Handoff-early | 无 claim/处理完成也允许释放生产者 | NoResponsibilityGap |
| Handoff-duplicate | 同一结果每次重传都追加一条 | AtMostOneAppend |
| Custody-late-read | 到期后仍可开始新页 | NoLateRead |
| Custody-native-delete | 建删除意图时忽略独立持有 | IndependentUseProtected |
| Custody-revive | done 后旧写入重建 bytes | NoRevival |
| Custody-renew | 更新已经激活的期限 | FixedDeadline |
| Custody-reexecute | 到期时重新执行业务效果 | EffectStable |
| Writer-early-publish | seal 仍为 requested 时交出成功 writer 候选 | PublishSound |
| Writer-drop-pending | 原 scope 关闭时未完成工作没有恢复承接 | NoPendingLost |
| Writer-late-accept | scope 关闭新入口后仍受理新片段 | NoLateAdmission |
| Materialization-early-raw | 最终替代材料尚未提交便删除 raw | RawUntilCommit |
| Materialization-delete-data | 正文到期清理同时删除独立 data | FinalDataRecoverable |
| Materialization-early-activate | 暂存 body 已写但最终结果未提交就起算期限 | ActivationOnlyAtCommit |
| Materialization-unknown-cleanup | 把提交未知当作未提交，删除最终材料 | UnknownIsNotFailure |
| FinalReceipt-untrusted | 首次采用未经封存字节核验的 final 指纹 | TrustedAdoption |
| FinalReceipt-missed-alias | 最终提交只转换一个 final 事件，留下 pending 别名 | AllAliasesSettled |
| FinalReceipt-changed-replay | 同一事件收到异值时仍认回成功 | ReplaySameValue |
| FinalReceipt-read-first | 认回原提交或批次前先读已释放的 envelope | RecoveryIndependent |
| FinalReceipt-embedded | 把完整 final payload 留在账本事件中 | NoLedgerPayload |
| MaterialTime-rollback | 以较低时间覆盖持久水位 | HighWatermarkSound |
| MaterialTime-missing-watermark | 页准入没有同提交时间水位 | HighWatermarkSound |
| MaterialTime-revive | 清除已经持久成立的到期事实 | ExpiredStable |
| MaterialTime-late-page | 租约截止后仍返回页成功 | NoLatePage |

负控不同时检查会更早触发的其他不变量，以保证它确实走到指定性质的反例。每份原始日志包含 TLC 反例轨迹。负控命中说明测量可以识别该代表性错误，不证明所有近似错误都能被同一配置检出。

## 8. 模型衔接与未来实现映射

| 抽象动作或状态 | 必须由真实实现兑现的边界 | 仍需证据 |
| --- | --- | --- |
| Handoff.Commit | 消费者按原 call/resultVersion/消费位置，耐久提交全文或可靠接管依据；逻辑追加去重 | Session 提交未知、两处理者竞争、同身份异值冲突 |
| Handoff.Query / Release | 按原身份查询受信 claim，再单独释放 Tool 持有 | ACK 丢失、重启、伪造回执及跨租户拒绝 |
| Handoff.Process | 在 Tool 仍保管时耐久保存处理完成 | Code 父失败、guest 内存丢失、未知处理状态 |
| Custody.Acquire / ReleaseProducer | 在同材料 gate 内先建立受信消费者持有，再解除生产侧持有 | 跨存储接管、consumer claim 对象耐久性、操作身份匹配 |
| Custody.BeginRead | 同材料 gate 内核 tenant/version/expiry/fence，并建立有界页租约 | SQL 锁或 CAS、读事务外 IO、超时和崩溃 |
| Custody.DeleteIntent | 锁内核所有独立 claim、租约和代次，同提交持久待办与 fence | 与接管/读取竞争、重启扫描 |
| Custody.PhysicalDelete / Confirm | 事务外按不可复用身份幂等删除，同身份查询或重试，再确认 | 删除成功但 ACK 丢失、删除失败、旧代迟到 |
| expires / effects | 期限持久且不续期，GC 没有业务 execute 权限 | 时钟回拨、提供者替换、实际调用图 |

Handoff 的 claim 在复制全文路径上指消费者已持有自己的耐久材料。在共享物理对象路径上，必须由 Custody 的 program 或对应独立持有支持；取得裸引用不足以建立 Handoff.Commit。Custody 的 producer 表示尚未安全解除的程序材料责任，不能随卸载 TTL 自动撤销。

这些模型未执行机械化组合或 refinement 检查。Writer.Publish 只表示 writer 候选准备好交给 settle，Materialization.FinishBarrier 消费相应屏障事实；它不能替代 Validate 或最终 Commit。Materialization.Commit 成立后，才允许 Handoff 接收最终版本，才对应 Custody 的已激活初态。三处身份必须对应同一正文、结果与材料代次。衔接要求是明确的未来实现义务，不从局部正控推出完整跨域实现已验证。卸载描述的可靠交接不赋予正文永久持有；Handoff 的无期限 claim 不得误用于续期卸载正文。

### 与正式行为正文的对应

下表对应[对象关系](../../../docs/object-model.md#正文保管的关系与职责)及[有限期正文保管](../../../SPEC.md#有限期正文保管)。模型命名是抽象投影，不构成新的产品状态轴。

| 正文对象或操作 | 模型名称 | 抽象或未覆盖 |
| --- | --- | --- |
| ResultRecord 身份与 DeliveryCustody | Handoff.R、binding、claim、known、tool | 一个结果只取一个消费位置；完整 tenant/call/result/delivery 复合键由结果索引抽象 |
| MaterialUse 交付与程序承接 | Custody.producer、program | 先 Acquire program，再 ReleaseProducer；同类多个 useId 未展开 |
| NativeReference 的外域目标 | Custody.ExternalNative | 与 M 不相交；绝不允许 Tool 删除 |
| 合法复用字节的独立原生用途 | Custody.native | 只保护 M 中共享字节；与 ExternalNative 严格区分 |
| OffloadedBody.live/expired 与 Material.live/deleting/deleted | Custody.phase | phase 是两条轴的可达状态投影：live=(live,live)，expired=(expired,live)，fenced=(expired,deleting)，done=(expired,deleted)；未引入额外允许转换 |
| PageLease、admitPage、finishPage | lease、BeginRead、EndPage | lease>0 才可完成；有界页的数据校验和返回值未建模 |
| expire、beginDelete、deleteBytes、confirmDelete | Expire、DeleteIntent、PhysicalDelete、Confirm | 三段持久状态/物理动作间均可失败、停顿或恢复 |
| 不可复用 objectId/generation 与 operation | m、Version(m)、operation[m] | 一个材料仅一个删除生命周期，operation 用固定材料/版本元组抽象；不覆盖异内容同 operation 的 conflict |
| BodyWriteScope、append、seal、linkResult | Writer.Begin/Accept/RequestSeal/CommitSeal/InspectSeal/Link | 一个 scope、两个片段、一个 seal；只得到暂存候选，最终激活由 Materialization.Commit 检查 |
| return/cancel 输出屏障 | Writer.RequestClose/HandoffFragment/HandoffSeal/Close/Publish | 可先失败终局，但未完成责任必须结清或耐久交接；正常成功交出 writer 候选要求全部 durable 且 sealed/linked，不等于最终结果提交 |

正常 BeginRead 总是核期限，Acquire 的独立用途不会更新 expires，因此 program/native 持有只保护物理字节，不能让旧 offload 引用续期。正文规定的全部 revision/CAS、权限及代次门槛仍保留。模型将 gate 的检查与元数据提交视为一个局部线性化点，未证明某个 SQL 实现已经实现它。

Materialization.Prepare/Commit 对应新增 prepared/committed 边界。WriteSlot/InspectSlot 对应独立 byte provider 写入与认回；Commit 对应 activateResult 的 Tool 元数据同提交；DeleteRaw/ConfirmRaw 对应被替代 raw 的持久清理任务。Custody 的 ActivationExpiry 明确来自这个 Commit，Writer 的 seal 不设置它。

这些映射须在契约或模型改变时重新核对。未覆盖项须按本说明补充实现证据，不能把抽象省略解释为正文已删除相应要求。

## 9. 未覆盖及结论边界

本次没有检查任意数量的结果、材料、处理者、同类持有者或在途页。Custody 的处理者身份被抽象掉，所有调用者通过同一 gate；没有使用对称性定理证明该抽象可推广。Handoff 明确检查两个处理者。两个模型都包含两个租户及两个不同身份，但不覆盖同一文本身份在不同租户下的复用。

Materialization 检查可恢复的准备/提交路径，不包含明确中止准备后的孤儿清理或所有在途写入排空。RawUntilCommit 的作用域是模型中未中止的路径，不能推导失败终结后仍须永远保留 raw。最终通道只建模存在与用途，不校验它们和原返回的语义等值。

每个材料在模型中是一个不可分物理对象。分块、manifest、raw 副本和缓存的逐项残留，以及删除其中一部分后崩溃，须有清单级模型或真实存储故障证据。Writer 覆盖单 scope 的未封存写入、return/cancel 与输出屏障交错。仍未覆盖输入序列化、schema 校验、summary 与原文一致性、36 类业务组合、12 类非法组合、错误码侧信道、计费、背压、取消后的物理残留清理和 Session 日志保留。

版本固定为 1，版本 2 只作为不匹配请求。模型证明的是固定身份被围栏后不能复活；未覆盖存储地址复用、同地址新一代对象或旧删除误删新对象。实现必须使用不可复用材料身份，或补上能覆盖新旧代并存的模型及条件删除证据。旧代写入被正常 Next 排除是 provider 必须兑现的 fence 承诺，不是现实存储天然具备的性质。

TLC 的配置只支持其给定有限范围。原四模型含四份正控、十四份负控，新增 FinalReceipt 含一份正控、五份负控，MaterialTime 含一份正控、四份负控。具体运行通过数以每次 summary 的实际 case 列表为准，新增配置存在不代表已经通过。人工归纳说明给出保护机制及其前提，不冒充无限域机器证明。实际产品、数据库、跨进程崩溃、权限隔离和主线装配均未验证。候选设计是否接受，由主任务及独立评审决定。

## 10. FinalReceipt 的事实重放检查

这是 W3-A 内部材料协议的候选验证增量。它检查精确 final envelope 被释放后，事实身份、提交回执与去重是否仍可使用。它不接受候选接口，也不证明生产指纹算法。

范围为一个调用、两个事件身份、一个固定原 final 和一个不同值。Seal 表示原 final 字节已经耐久，Receive 首次采用必须匹配这些字节。已提交后到达的同值 final 事件直接取得 settled 表示，不重新读取 envelope。这里只允许原已核验材料身份，未建模任意外来指针伪造。

Commit 原子转换全部已经接收的 final 别名，并固定结果版本 1。ReleaseEnvelope 在提交后可以独立发生，不等待 receiptKnown。LoseReply 可丢失全部本地回执知识，Recover 仍从持久提交认回。Replay 用已保存的事件身份与原值判断，不依赖 bytes。正常模式没有业务重执行动作。

| 不变量 | 保护的事实 | 生产对应 |
| --- | --- | --- |
| TrustedAdoption | 首次采用的值等于封存原值 | 受信 envelope 封存与输入指纹核验 |
| AllAliasesSettled | 提交后所有已接收 final 都为 settled | 结果 CAS 同步转换全部别名；后来同值事件直接建 settled |
| ReplaySameValue | 成功重放只能对应同一事件原值 | event/call/batch 指纹各自覆盖完整身份和有序输入 |
| RecoveryIndependent | 原材料释放不导致认回先读取它 | operation 和批次认回先于 payload 解引用 |
| NoLedgerPayload | 账本不保存完整 final 字节 | pending 引用、settled 凭据，不把暂存全文放入单条 SQL 记录 |
| ReceiptStable | committed 与固定版本保持一致 | 重试不重新结算或改版本 |
| PendingHasPayload | 未结算的已接收事实仍有原材料 | normalization 用途在最终通道提交前不得解除 |

归纳依据是局部动作的保护点。Receive 不修改已存在事件的身份，Replay 只比较该身份，因而可以与材料删除独立。Commit 同时转换全部 received 元素，随后 Receive 只建立 settled 元素，保持 AllAliasesSettled。ReleaseEnvelope 仅在 committed 后执行，保持 PendingHasPayload。Recover 只读取提交事实，回执知识丢失不改变结果身份。

模型以两个不同值代表受信 canonical 指纹的等值与不等值，假定无碰撞且编码稳定。它不覆盖具体哈希实现、批次顺序编码、租户权限、多结果版本、初始字节写入失败、部分清单删除、SQL 大字段上限或任意数量别名。NoLedgerPayload 是表示约束，不是空间或性能测量。实际容量须通过真实 SQL 大正文回归，编码正确性须通过篡改与重放测试。此模型只检查安全性，不对源恢复、首次最终提交或后台回收添加公平性保证。

## 11. MaterialTime 的持久时间门

本模型对应 W3-A 候选的材料时间门。它只检查 call 域的持久水位、到期锁存及有限页租约，不证明宿主时钟准确。样本取 0..3，可以按任意顺序到达，代表重启、多个宿主和回拨后的较低样本。正文固定截止点为 2，一页期限为准入值加 2，因此允许正文到期后、页租约到期前完成。

Observe、Admit、Finish 和 CloseLease 都在接纳样本前检查它不低于持久 watermark。成功的动作与 watermark 同提交。observed 是证明用的历史观察集合，不要求产品保存一个无限时间序列。HighWatermarkSound 要求已经接纳的每个样本均不超过持久水位。发生重启时所有模型持久变量保持，下一个样本仍须经过原门。

Observe 在到期时持久锁存 expired。everExpired 是证明用的历史事实，ExpiredStable 禁止把到期改回 live。Admit 先核正文未到期及样本小于正文截止点；Finish 不要求正文仍有效，但要求页租约仍有效。CloseLease 可以先结束租约，之后 Finish 不再可用。完成的页在 completed 中留下样本和当次期限，NoLatePage 对两者比较，不受后续状态覆盖影响。

正常动作只接受不低于水位的样本，并同提交新水位，因此归纳保持 HighWatermarkSound。expired 只由 false 变为 true，保持 ExpiredStable。Finish 的守卫直接保护每个加入 completed 的元组；没有重写旧元组的动作。负控分别去掉这几个保护点，要求命中指定不变量。

模型未展开身份资格、具体 SQL CAS、提交回包未知、时间工厂的墙钟/单调源算法、真实停机时长或多个同时在途页。观察到到期的提交回包丢失不改变持久状态，实际认回仍需 SQL 故障验证。时间源连续不可用时不承诺进展；任意向前伪造时间也不在时钟可信前提内。与 Custody 的组合义务是将同一次经持久时间门接纳的样本用于页/删除守卫，不能先过时间门再使用另一份较低读数。
