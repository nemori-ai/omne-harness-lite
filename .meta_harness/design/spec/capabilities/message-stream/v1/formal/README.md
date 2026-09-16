# Message Stream 有限模型

本目录分别建模耐久事实交付、active transient 交接、durable disposition 恢复与授权投影安装；四个
legacy Cursor 工件保留其原有窄抽象。拆分保持 DR commit position、Session projection
`completeTo`、publisher `pub.n`、attempt chunk index、subscriber generation 与客户端 installed
cursor 为不同状态，不允许跨域比较。

| 模型 | 保留的竞争 | 主要有限抽象 |
|---|---|---|
| `MessageDelivery.tla` | 两个 commit batch 的 commit → projection → sent → receipt → atomic install；重复 receipt、丢 ack、客户端重启、正文读取失败/恢复、ended 前后交错 | 每批两个 frame、每 key 最多两次 receipt、一次 client crash 和一次可恢复正文读取失败 |
| `ActiveHandoff.tla` | 两个独立 source clock、两个 subscriber generation、register/effective → compact snapshot/cut → atomic prefix install → ordered drain → live；callback pending、overflow、source/generation/transform/visibility/floor invalidation与完整 resubscribe | 每 source 三个 chunk，safety 的 buffer cap 为 1，progress 为 3；compact state 只表达 fold prefix，不是历史 frame 数组 |
| `DispositionRecovery.tla` | active source loss、M disposition commit/revision、Session projection、client install、ended hint、client crash、visibility revoke 与 retention expiry；unknown 后续单调细化 | 一个 attempt、最多两个 durable revisions；正文与明确无正文共用完整批安装，abandoned 必须有 execution fence |
| `AuthorizationNoninterference.tla` | 隐藏、缺席与过期三个世界的猜测身份观察等价；授权定义换代和集合水位独立 | 一个猜测身份、三个世界、每个世界最多两个提交；集合水位允许不同 |
| `ChangesDelivery.tla` | 事实帧仅提示、周期 `changes(to=latest)`、具体 `to` 的 `resolvedTo`/`coveredThrough` 上界、无事实的 closing state update、hidden-only 区间和正文失败后从最后完整位置重新请求 | 三个提交位置：state-only、hidden-only、可见正文；一次重连、一次可恢复正文读取失败、一次 visibility 换代；进展分别停止在位置 1/2/3 |
| `SnapshotReducer.tla` | full snapshot-first、完整授权集合替换、独立 token/visibility/asOf CAS、增量批原子安装、缺席本地草稿、正文失败/重开/重取和实际 close 副作用次数 | A closing、B closing、A terminal-with-body 的固定提交序列；B 在 visibility 0/2 隐藏、1 获权；进展分别停止在位置 0/1/2/3 |
| `Cursor.tla` / `CursorMC.tla` | legacy 单域 cursor safety/progress | 不表达上述新协议；只保留为迁入工件的实际重跑基线 |

各 `*Progress.cfg` 只在所列有限集合、可恢复故障和显式弱公平下检查进展。active progress 的
buffer 容量足以容纳有限 publication，且最多发生一次边界失效；disposition progress 排除永久
投影不可用、撤权和 retention 删除。允许完成态无业务后继，因此关闭 TLC deadlock 检查；列出的
invariant 与 temporal property 仍全部执行。

## 受控 mutation

以下配置预期 TLC 非零退出，并保留目标 invariant 的 counterexample；它们不登记为成功任务。

- `InstalledOnReceiptMutation.cfg`：receipt 到达即推进 installed，破坏整批顺序。
- `MissingClientDedupMutation.cfg`：重复 receipt 重复呈现同一 dedup key。
- `SnapshotBeforeSubscribeMutation.cfg`：先 snapshot、后 listener，中间 publication 永久漏失。
- `LiveBeforeEnqueueMutation.cfg`：callback 尚未 enqueue 就切 live，暴露 empty-to-live 竞争。
- `CrossGenerationInstallMutation.cfg`：新 subscriber generation 安装旧 source/generation 的缓冲项。
- `SourceLostTerminalMutation.cfg`：observer source loss 直接关闭草稿并伪造 terminal authority。

前四类新模型的旧 E 一次性运行记录尚未作为本谱系的发布证据收录；其已登记的任务以
[当前执行证据](../../../../../evidence/formal-2026-09-16/README.md)为准。结论只覆盖记录的有限
状态空间，不是 provider 实现符合性、无限域机器证明或生产环境不丢消息的保证。

## Changes 与 snapshot 的性质和检查范围

两份模型消费 E 候选文本 `480c7057c2a13ed5ce67f082775f06f6b914b84e` 的
MS-07/08/10/11/12 与本工作树 Session SE-10；文本和模型的精确哈希随运行证据保存。
它们是候选工件；有限检查通过不表示独立评审或语义接受已经完成。

| 义务 | 模型中的观察位置 | 定向负例 |
|---|---|---|
| MS-07/08 完整安装前缀、提示不是覆盖证明 | `historyInstalled/stateUpdatesInstalled/clientCursor`；`InstalledRequiresAtomicAuthorizedBatch` | `HintInstallsCursorMutation`、`OmitStateOnlyChangeMutation` |
| MS-11 / SE-10 请求上界、hidden-only 覆盖 | `requestAfter/requestTo/resolvedTo/coveredThrough`；`CoveredThroughIsBounded`、`HiddenOnlyRequiresCollectionCoverage` | `CoverageOvershootMutation`、`HiddenWithoutCoverageMutation` |
| 旧 visibility 响应不能安装 hidden-only 覆盖 | safety 中 `RotateVisibility` 与隐藏间隙推进交错 | `StaleHiddenInstallMutation` |
| 无后继可见事实仍能补齐 | `ChangesStateOnlyProgress`、`ChangesHiddenOnlyProgress`、`ChangesDeliveryProgress` | 进展不依赖 hint 到达 |
| 正文读取失败保留完整位置并重取 | `LoseBodyRead` 丢弃当前响应；`RetryRequestsInstalledPrefix` 核对新请求的 after；恢复后再次读面响应 | `SkipBodyMutation` |
| MS-10/11 full 路径先 snapshot，none 路径可以增量 | `Init` 同时枚举 `resyncRequired=TRUE/FALSE`，`InstallChangesBatch` 安装门 | `ChangesBeforeSnapshotMutation` |
| MS-12 / SE-10 三个独立 CAS 条件 | `accepted` 只记录成功 CAS 的实际输入与输出；拒绝、读取失败均不更新它 | `StaleTokenInstallMutation`、`StaleVisibilityInstallMutation`、`StaleSnapshotInstallMutation` 分别检验 token、visibility、asOf |
| 完整同水位替换、缺席只作本地表示 | `SnapshotAtomicReplacement`、`SnapshotAbsenceIsOnlyLocalEvidenceUnavailable` | `SnapshotAtomicInstallMutation`、两种 `SnapshotAbsence*Mutation` |
| 空 Session 的 asOf=0 可安装 | `SnapshotEmptyProgress`（StopAt=0；初始 full 路径） | `SnapshotEmptyBlockedMutation` 是 temporal 反例 |
| 快照正文失败不得发布，须重开重取 | capture → read/fail → reopen → capture → CAS；`FailureKeepsLastCompleteCursor`、`RetryStartsAtLastCompleteCursor` | `SnapshotBodyReadMutation` |
| semantic close 不重发、不回退 | `closeEffects` 是实际次数，`closeLedger` 是去重账本；计数在每次安装时累加，重复安装不增加 | `DuplicateSemanticCloseMutation` |

`SnapshotReducer` 的响应内容由 `ViewAt(asOf, visibility, attempt)` 固定，完整授权集合含 A/B。
`accepted` 保存最近一次成功安装时的 token/currentToken、visibility/currentVisibility、asOf/原 cursor、
正文已读状态与实际安装结果；它不会用 `pending=false` 推断成功，故正确拒绝不会污染缺席性质。
授权依次从 B 隐藏到获权再到撤销，换代强制 full；已经披露的旧视图可以保留到新快照安装，
但旧响应不能再被安装。`replacementToken` 最多包含一次外部重取和一次读取失败后的新代次。

### 公平性与未覆盖范围

`ChangesDelivery` 进展排除 visibility 换代；换代后 full 恢复由 `SnapshotReducer` 单独检查。
前者将已验证响应的完整批交给后者，后者把完整增量批作为一个原子输入；两者的分解不构成
已经执行过的组合模型检查。`SnapshotReducer` 允许有限的两次 visibility 换代、一次外部重取、
一次快照读取失败。`SpecFair` 对提交至所选 StopAt、投影、取数、重开、拒绝与安装动作给出显式
弱公平，分别检查最终 cursor 追平和最终恢复当前授权版本。StopAt=1/2 不会发布后续正文或 hint；
StopAt=0 没有任何提交。TLA+ 弱公平只保证最终发生，不证明 MS-11 的有界本地轮询时间；
无限故障、无限授权变化、永久不可用、墙钟超时和实现调度均不在结论内。

固定三个批保留本次协议竞争，不枚举任意批内容、任意 attempt 数量、revision refinement、
多正文分页或全部 terminal 词表；durable disposition 的较丰富状态另由 `DispositionRecovery` 建模。
这里不模拟真实 floor 数值/retention 删除，外部重取代表已决定 full 的入口；不验证真实存储、
授权规则、正文解析、队列/请求/调用贡献、网络传输、浏览器事务或 provider 符合性。
Changes 的原子安装保留了状态和正文完整性的抽象，未枚举每种存储局部写失败；快照失败路径明确
包含正文读取失败，不据此声称覆盖所有底层故障。

28 项有限运行的原始日志、逐项工具/输入/输出哈希和检查结果已在
[设计证据包](../../../../../evidence/formal-2026-09-16/message-stream-28/run-report.json)。
模型/配置与当前文件逐字节一致；原运行绑定的 MS/Session 自然语言正文后来变动，
仅能复用其中未改变的游标、快照与授权投影前提，不能据此验证后来新增的 dedup key、
媒体来源和 `provisional_outcome` 的 Run 归属。旧 WIP 日志不作为此修订通过证据。
