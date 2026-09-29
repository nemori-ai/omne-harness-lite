# RT11 新增模型与继承范围

本版行为权威新增以下三个有限模型，全部只检查安全性质，未配置公平性，不声称无条件进展。每个正配置的常量均在对应cfg显式给出；模型不包含真实端口/权限/JSON/HTTP/物理停止或I/O成本。

| 正任务/条款 | 有限域与前提 | 可失败断言/负控 |
|---|---|---|
| ReferenceLifecycle / RT S84/S86/S89/S91，CA3 S40 | 一个CallKey、一个ResponseId、两个消费者、两个登记代际；ready按已确认发布抽象；release/settle/close交错 | NoConsumerCancellation↔ReleaseCancels；OneAccount/ReadyAccounted↔DoubleCount；TerminalAbsorbs↔TrustStaleProjection |
| Publication / RT S85/S86，MS7 S52/S54，MR10 S46 | created/ready两种发布；内容、保留、在途写者、marker及receipt分开；final两个竞争者，同日志Commit原子 | MarkerHasContent↔RequireMarkerGate/ProtectPublished；PendingWriterPinned↔RequireStoppedForAbsence |
| OpenedOrder / RT S88/S90 | 一个原dispatch、两个attempt、同日志序列；ReadPrefix与tail条件提交分开；停止与lost分开 | CancelCannotPrecedeOpened↔CheckCancel/CheckTail；NoSendAfterOpenedLoss↔RetryAfterContent；OldAttemptMayOpen↔RequireCurrentAttempt（R2） |

负控均放validity-check；预期TLC退出12，不登记为成功formal task。原9个负控各翻转对应开关；R2另增旧attempt错误fence负控，见下节。正配置本次实际结果与日志位置归版本外verification。

**被建模方式吸收而不声称覆盖**：Publication.OriginalKeyPayload的key/payload恒1且无变更边，未列入正cfg，不证明创建幂等、真实字节不变或冲突判定；marker set及finalWinner的原子赋值不证明真实日志原子性。ReferenceLifecycle.OneExecution的Send只在sends=0，故只支持模型中acquire/release没有发送/取消作用，不是实际HTTP恰一次证据；generation exact清理与final唯一等正断言没有本批专用变异，必须由真实组合故障场景承接。OpenedOrder的OriginalDispatch按初始dispatch构造成立，不能证明真实执行授权。调用取消资格、否决副作用幂等、消息+final原子性、lost端口真实性、无损十进制与内容回收物理实现必须另验。

**继承模型限制**：下文前驱模型/配置保持未变范围，未在本批重跑、未重新登记。Invocation/PendingReply等只支持其原锚点/完整事实/不伪造处分子性质，不描述RT11新增ready终态、可撤资源或持久pending；与本版改变的阶段重叠处以本页新模型为准，不把旧状态转换当本版全生命周期承诺。旧模型被归档在候选包内不等于新覆盖。

## 前驱有限模型说明（保留原范围）

# RT10 形式化范围

本目录继承 RT9 的原规范模型及配置（它们各自的有限范围和证据不因复制而扩大）。新增行为权威是 UsageCalibration.tla，表达 S-77～S-82 的校准状态与既有 RT9/SL3 协议的组合边界；不重建全部十三操作与存储交叉乘积。

## 抽象映射与责任

| 模型量/动作 | 契约对应 | 前提与省略 |
|---|---|---|
| body/env 与 Count | 实际有序最终输入及 envelope、真实输入 oracle | 有限 token 片段 1/2，basis 1/2；Count=sum×basis+env+长度奇偶。故意保留非加性边界。不是现实 tokenizer 证明 |
| received.kind/input/output/partial | MR9 observedInput/outputGroup | accurate 是上游已验证对应事实这一环境观察；missing/cache 不提供 I。输出 1 个抽象组或 partial 空组，无逐块虚假精确拆分 |
| basis / installed / leased | 固定计量依据与绑定租约 | model/provider/tokenizer/φ/material transform 的实质变更合为 basis 变化；不在此检查真实供应商证据 |
| ancestors/branch 与 LateResponse | 同分支实际祖先选择 | 固定一个已授权 tenant/log 域，2 branches；Fork 保留共同祖先。跨租户/跨日志拒绝是原授权协议前提，未称本模型覆盖；LateResponse 是另一真实分支的已结算并发请求 |
| plan/sent | 固定获准计划与实际发送 | 输入、envelope、basis 分开比较，安装版本更换不能改已持有值；发送行为只在 Dispatch |
| pending/original/log/replyLog/receipts/published | 原完整 response/reply 批、实际耐久与确定回执 | response 与 reply 分开序列表达并受 SameBatch 约束；LoseReceipt 可实际提交也可未提交；recover 只能确认或重送原批。不是把目标同批原子性假定成立 |
| beforeLog/beforeReplyLog | 上次追加前的完整日志 | AppendOnly 检查原记录仍是前缀，RewriteHistory 负控可打破 |
| PlanFull/PlanMarginal | S-79 纯规划关系 | 不建计时/IO 变量，所以不能声称证明无 IO 或性能。纯函数无隐藏 IO 须实现验证 |

LateResponse 的额外 id=MaxCalls+1 是被抽象掉执行过程的并发 request，仍有真实原输入/输出/receipt；不与主序列 call/dispatch 身份混同。NextAttempt 对当前链追加实际输出、取得前一已提交祖先，再开新的 dispatch；RetryAsNewAttempt 是缺 usage 分支的具名子关系，Next 中的 NextAttempt 已含该关系。它不放宽 RT9 首 token/自动重试政策，只表达调用方合法发起后续请求。

ChangeOldPrefix 同时探索删除旧序列首单元和改变 envelope；可表示 compaction/可读性变化及工具/system 变化，不实现选择压缩哪些消息。单轮只允许一次变更与一次新增，单个模型状态没有无限碎片增长。StableSuccessor=TRUE 的专用重锚配置禁止非新增前缀/basis 变化，以表达 S-82 的稳定前提；新增输入、分支产生、其他分支晚到与回执丢失仍可交错。该常量不约束 planner 选择，故永远全量或总选最旧锚仍能形成反例。

## 条款与可失败断言

| 条款 | 断言 | 使它失败的配置 |
|---|---|---|
| S-77、MR9 S-42 | AnchorSource | MissingZero、CacheZero、LatestBranch |
| S-77 | PrefixGuard / BasisGuard | IgnorePrefix / IgnoreBasis |
| S-78 | NoDoubleOutput / ErrorReset | DoubleOutput；正常准确与估算配置都检查 ErrorReset |
| S-78 | PrecisionHonest | EstimateExact |
| S-81、MR9 S-45 | AppendOnly / SameBatch / OriginalBatch / NoEarlyPublish | RewriteHistory / PartialBatch / RecomputeRecovery / PublishEarly |
| S-79/S-80 | PlanSendSame | StalePlan |
| S-77/S-82 | LeaseHeld | ReleaseLease |
| S-74/S-78 | WindowSafe（条件保证） | EstimatedWindow 说明不对 estimated 成立 |
| S-77/S-79/S-82 | ReanchorProgress / EventuallyReanchored | NeverUseAnchor / KeepOldAnchor；终止仍不能替代新锚实际使用 |

所有负控只改一处守卫或传播，检查其具名 invariant；在 validity-check，不登记 formal task。观察 missing/cache 在模型中 input=0 是存储占位，kind 必须参与判定；这个 0 永远不是 known observation。负控去掉 kind 守卫确实能错误复用。

## 配置与范围

- UsageCalibration_ExactOrBound：2 次主序列 dispatch，accurate/missing/cache，全部安全断言及 WindowSafe。
- UsageCalibration_UpperBound：同域，贡献取真实值+1，组合为上界；检查 WindowSafe，不把“上界超限”解释为精确实际超限。
- UsageCalibration_Estimated：同域，每个被计量贡献比真实值少 1，显式 Margin=0；检查精度诚实、准入关系与 ErrorReset，不检查 WindowSafe。
- UsageCalibration_ThreeCalls：3 次主序列 dispatch、accurate/missing，覆盖连续缺 usage 后仍回到更早祖先及再校准；其余域同准确配置。
- UsageCalibration_Progress：2 次主序列 dispatch，仅 accurate；使用 ProgressSpec 的显式弱公平性，检查 EventuallyDone。它只保证有限检查里的规划/拒绝/结算终止，不证明真实外部请求必停。
- UsageCalibration_ReanchorProgress：3 次主序列 dispatch、仅 accurate，StableSuccessor=TRUE，Window=100、Reserved=2、Margin=0。检查 `AccurateCommitted(i) ~> UsesAnchor(i)`（每个有后继的 i）及 `EventuallyReanchored`：后继 planned 必须实际引用刚确定的最新可用祖先 i，不能只终止。后者确保至少第一条重锚路径实际发生，不能由提前拒绝让前件永不成立。Window=100 只确保此有限域内请求可发，从而暴露进展义务，不参与 EstimatedWindow 的边界配置。

NeverUseAnchor 仅允许 PlanFull、禁用 PlanMarginal；KeepOldAnchor 仍增量但总选因果最早合法祖先。两者都不破坏原公平执行或终止，重锚配置下仅检查 ReanchorProgress，预期 temporal-property 反例。它们不关闭 accurate 观察或提交，也不靠改状态域绕过目标性质。模型的整数 id 是有限因果 dispatch 次序，不把这种排序投影成真实不透明标识排序。

除上述重锚配置外，Window=12、Reserved=2、Margin=0 是有限探针的显式常量，不是产品配置初值。UpperBound 的净贡献都可带边界修正；最终总量检查非负。没有对称化或隐藏状态截断；每轮新增/变更次数与 MaxCalls 明确限定状态域。协议允许合法拒绝，因此进展终态可为拒绝或最后提交，不声称每个请求都被发送。

工具命令使用 registry/formal-tasks.json 中可注入 JAVA_BIN/TLA2TOOLS_JAR 的 argv。负控以同 argv 替换 -config 为 validity-check 下对应文件。结果应为该 invariant 或唯一配置的 temporal property 被违反，普通 parser 错误、超时或任意非零退出都不算负控成功。

## 递推的条件归纳（非机器证明）

基步：某可信响应给出 I=C(P,θ)。定义真实边际 φ=C(P∘G,θ)−C(P,θ)，δ=C(P∘G∘N,θ)−C(P∘G,θ)，允许非加性边界修正。则 I+φ+δ=C(P∘G∘N,θ)。

归纳步：预测 E=I+φ̂+δ̂，故 E−C=(φ̂−φ)+(δ̂−δ)。当下一响应 I' 确认等于新完整 C，后继重新以 I' 为基，上一轮 E−C 不进入后继式。无 observation 时不作归纳步，仍围绕最后可信 I 计算全部尚未覆盖贡献。前缀/basis 失效时退出这一命题，先全量，再等待新的可信 I。

该证明是代数恒等式及条件归纳，不证明前提：实际投影相等、上游 observation 精确、φ/δ 适用、授权来源、哈希无碰撞。这些由相应 owner 的实际证据承担。有限 TLC 检查离散协议与被实例化的代数关系，不能代替一般算法证明；estimated 有余量仍可超窗，已提供可达反例。

## 未覆盖

真实 tokenizer/provider、图像/音频等 token 贡献、未知上游模板、权限系统实际实现、摘要碰撞/编码一致性、性能、无日志 IO、存储断电原子性、真实网络、全部 RT9 取消分支、无限调用与真实 compaction 均需提供者/组合验收。本增量不宣称已实现、不自我接受。执行原始结果由版本外 evidence 拥有。

## 结算组合模型

继承 Settlement.tla 及其配置的精确有限范围见[前驱形式说明](../../v9/formal/README.md#结算组合模型)。本版保留这些原工件，不扩大或冒称重跑其结果；新增 UsageCalibration 显式表达计量证据与 response/reply 原批、unknown 及恢复，不能反过来替代原结算协议验证。

## R2 旧 attempt 的可执行许可

OpenedOrder 新增 `OldAttemptMayOpen`：currentAttempt=2、原调用未停止、无取消/final/opened、完整前缀许可及tail一致时，`ENABLED CommitOpened` 必须成立。它表达 S-88 不被新 attempt fence 挡住的许可，不承诺调度最终发生；没有公平性、不证明真实网络进展。状态域仍为两个attempt、一条原dispatch和有限日志事件。

正配置 `RequireCurrentAttempt=FALSE`；原三个负控也显式为FALSE。新增 `validity-check/OpenedOrder-old-attempt-blocked.cfg` 仅把该常量置TRUE，使 CommitOpened 错误要求 currentAttempt=1，必须由 OldAttemptMayOpen 报反例。该反例须可到达 NewAttempt→ReadPrefix 后；不能以parser错误/超时作为负控成功。原三个安全负控与新断言同跑，不靠固定 currentAttempt 吸收性质。

ReferenceLifecycle/Publication 本轮字节不变，保留首轮同hash证据及其范围；不重跑、不冒称覆盖合法派生/来源验证、live reconcile全过程或创建冲突。旧UsageCalibration的 SameBatch/OriginalBatch 只保留原批不变子性质，**不覆盖新增合法派生扩展及本次实际选取的真实性关系**；这些由R2 examples/verification的真实组合义务承接。
