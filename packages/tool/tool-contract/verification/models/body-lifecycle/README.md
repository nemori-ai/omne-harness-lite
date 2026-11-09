# BodyLifecycle：两个独立存储、五个独立时钟下的正文生命周期

本目录的模型检查有限期限、先耐久再发布和有界聚合三条性质在下列部署条件下是否成立：账本与正文存储是两个独立参与者，没有共同事务，没有读快照隔离，步骤之间可以崩溃，每个参与者读自己的时钟，两两偏差不超过 ε。性质的含义归领域文档的[性质与守护点](../../../../../../docs/domains/tool-execution/architecture.md#性质与守护点)，参与者的行为规则归能力组的[部署无关原则](../../../../docs/architecture.md#部署无关原则)。实现尚未开始，第 7 节的代码名称是计划名。

模型只证明列出的有限状态和假设，不证明实现。

## 1. 参与者与时钟

五个参与者各有一个固定偏移 `off[p] ∈ 0..Eps`，在初态非确定地选定。参与者 p 的时钟读数是 `Now(p) = t + off[p]`，`t` 是真实时间。任意两个参与者的读数之差不超过 `Eps`。

| 参与者 | 用自己的时钟做什么 |
| --- | --- |
| `issuer` | 账本签发写入许可：截止时间 = `Now("issuer") + W` |
| `settler` | 账本结算：`expiresAt = Now("settler") + D`，孤儿 `due = Now("settler") + G` |
| `store` | 校验许可：`Now("store") <= deadline` 才接受 `put` 和 `seal` |
| `sweeper` | 判断到期：`due <= Now("sweeper")` 才删除字节 |
| `reader` | 账本检查 `Now("reader") < expiresAt`；读完存储后再核一次同一条件；读不到时比较 `expiresAt <= Now("reader") + Eps` |

签发者与结算者分开，是因为 `G > W + 2ε` 的两倍 ε 来自两对时钟差：签发者对结算者，清扫者对存储。只有一个账本时钟的模型会错误地接受 `G = W + ε`。

偏移在一次行为里固定。时钟回拨不超过 ε 的情形没有展开，见第 8 节。

## 2. 变量

| 变量 | 含义 |
| --- | --- |
| `t` | 真实时间，`0..Tmax`，`Tmax = TAct + Eps + max(G, D)`。到 `Tmax` 时每个 due 在每个时钟上都已到达 |
| `off` | 每个参与者的时钟偏移 |
| `status[b]` | 账本权威状态：`none → opened → sealed → linked → reclaimed`，或 `opened/sealed → orphaned → reclaimed` |
| `deadline[b]` | 最新许可的截止时间；0 表示没有许可 |
| `issued[b]` | 已签发的许可数，上限 `MaxPermits` |
| `bytes[b]`、`storeSealed[b]` | 存储里的分块是否存在、封存清单是否已写 |
| `everSealed[b]` | 历史变量：存储曾经封存过该正文 |
| `expiresAt[b]` | ResultRecord 正文描述符里的期限；0 表示未关联 |
| `due[b]` | 到期索引条目；0 表示未排期 |
| `settled`、`published` | 调用已结算；已发布给模型的引用集合 |
| `swDeleted[b]` | 清扫者的本地记忆：已删字节、尚未提交 `reclaimed` |
| `crashes`、`faults` | 清扫者崩溃次数、存储丢失已封存正文的次数 |
| `pending` | 已通过账本检查、尚未完成存储读取的读请求，`{}` 或 `{b}`。它可以跨任意多个 `Tick` 挂起 |
| `lastAnswer`、`lastDelete` | 历史变量：读者最近一次答复、清扫者最近一次删除。只在产生它们的状态里非空，下一步清空 |

每个正文只有一个分块。摘要、条件写（同序号异摘要冲突）和多分块齐全性没有建模。

## 3. 动作

| 动作 | 参与者 | 含义 |
| --- | --- | --- |
| `Tick` | 时间 | `t` 加一。读请求挂起时时间照样前进：读取可以在账本检查与存储读取之间停顿任意长，读取时长不计入 ε。已低于新时间的许可截止时间统一记为 `t`，因为校验截止时间的存储再也不会接受它（这是状态空间归一化，不改变任何动作的可用性） |
| `Begin(b)` | 写者与 issuer | 提交 `opened` 并签发许可。三个分支：提交并签发；提交成功但答复丢失，不签发；`Bug = "permit-on-unknown"` 时未提交也签发 |
| `Renew(b)` | 写者与 issuer | 执行仍活跃、调用未结算时重新签发许可（账本续期许可） |
| `Put(b)` | 存储 | 许可有效且正文未封存时写入分块 |
| `StoreSeal(b)` | 存储 | 许可有效、分块齐全时写入封存清单。成功即耐久 |
| `LedgerSeal(b)` | 账本 | 存储已封存、调用未结算、状态 `opened` 时提交 `sealed`。`Bug = "seal-after-settle"` 时忽略结算，并接受 `orphaned → sealed` |
| `Settle` | settler | 选一个 `sealed` 子集关联，固定 `expiresAt` 并排期；其余 `opened/sealed` 置为 `orphaned`，排期 `now + G`；发布引用。`Bug = "link-unsealed"` 时允许关联 `opened` |
| `DeleteBytes(b)` | sweeper | 对到期条目删除字节与清单（幂等），记住 `swDeleted`。`Bug = "sweep-before-due"` 时不看 due |
| `Reclaim(b)` | sweeper 与账本 | 凭 `swDeleted` 提交 `reclaimed` 并 `unschedule`，不再复查存储 |
| `SweeperCrash` | sweeper | 在删除与提交之间崩溃：忘记 `swDeleted`，due 条目保留，重跑时重新删除 |
| `StoreFault(b)` | 存储 | 已关联且已封存的正文丢失。它在契约之外，只用来让真实的 `integrity` 答复可达，使 `NoFalseIntegrity` 不是空真 |
| `ReadBegin(b)` | reader 与账本 | 账本检查通过：已发布、`linked`、`Now("reader") < expiresAt`。授权与结果版本抽象为已通过 |
| `ReadRefuse(b)` | reader 与账本 | 账本检查拒绝：`Now("reader") >= expiresAt`，答 `expired`（模型记为 `refused`） |
| `ReadFinish` | reader 与存储、账本 | 读存储。有字节且已封存时，读者用自己的时钟再核一次 `Now("reader") < expiresAt`：成立答成功并返回字节；不成立答 `expired`（模型记为 `refused`），不返回字节。读不到时复查账本：`reclaimed`、`orphaned` 或 `expiresAt <= Now("reader") + Eps` 答 `expired`，其余答 `integrity`。`Bug = "recheck-only-reclaimed"` 时只认 `reclaimed`；`Bug = "no-recheck-after-read"` 时读到字节就返回，不再核期限 |

`Begin`、`Renew`、`Settle` 只在 `t <= TAct` 发生，`LedgerSeal` 随结算关闭。这是有限边界，使每个 due 都能在 `Tmax` 前到达。

## 4. 假设与有限边界

- 参数（正控）：`Eps = 1`，`W = 2`，`G = 5 = W + 2ε + 1`，`D = 5`，`TAct = 2`，`Tmax = 8`，`Bodies = {b1, b2}`，`MaxPermits = 2`，`MaxCrashes = 1`，`MaxFaults = 1`。
- 模型要求 `G > W + 2ε` 与 `D > W + 2ε`。两条都是装配启动时校验的参数约束；`grace-too-small` 与 `ttl-too-small` 分别给出违反时的反例，见第 6 节。
- 读取时长没有上界。挂起的读请求与 `Tick` 自由交错；双向窗口只靠读完后的期限复核保持。
- 时钟偏移固定；对称约简 `SYMMETRY Perm` 作用于 `Bodies`。
- 安全性质不依赖公平性。`progress` 配置使用 `LiveSpec = Spec ∧ Fairness`：`Tick` 强公平，`ReadFinish`、`DeleteBytes`、`Reclaim` 弱公平，崩溃次数由 `MaxCrashes` 封顶。
- 静止态性质用终态谓词表达，不是活性：`Quiescent = settled ∧ t = Tmax ∧ ∀b: due[b] = 0`。活性由 `EventuallyReclaimed` 单独检查。
- 所有配置 `CHECK_DEADLOCK FALSE`：模型到 `Tmax` 后自然停止。

## 5. 性质

| 名称 | 守住的性质 | 含义 |
| --- | --- | --- |
| `PublishedDurable` | 先耐久再发布 | 已发布的引用都指向存储曾封存、账本已关联（或此后已回收）的正文 |
| `IntentBeforeBytes` | 意图先记账 | 存储里有字节的正文，账本都已 `opened` |
| `ReadWithinWindow` | 有限期限，双向窗口上沿 | 成功读取只发生在已发布且已关联的正文上，且 `at + off["settler"] < expiresAt + Eps`。读取停顿多久都不改变这个上界。它也排除读到孤儿字节，因为孤儿没有 `expiresAt` |
| `RefusalWithinWindow` | 有限期限，双向窗口下沿 | 因到期被拒绝时 `at + off["settler"] + Eps >= expiresAt`。账本检查处的拒绝与读完后复核处的拒绝都受此约束 |
| `NoEarlyDelete` | 有限期限、有界聚合 | 清扫者删除已关联正文时，`at + off["sweeper"] >= expiresAt` 且真实时间 `at >= expiresAt − Eps` |
| `ReclaimedLeavesNoBytes` | 有界聚合 | `reclaimed` 的正文在存储里没有字节和清单 |
| `NoFalseIntegrity` | 有限期限 | `integrity` 只在正文 `linked` 且 `expiresAt > Now("reader") + Eps` 时答出 |
| `NoWriteAfterSettle` | 结算关闭写入 | 结算后没有正文处于 `opened` 或 `sealed` |
| `QuiescentStoreEmpty` | 有界聚合，静止态 | 结算后、时间越过全部 due、无排期条目时，存储里没有本调用的任何字节 |
| `EventuallyReclaimed` | 每个孤儿最终回收 | `settled ~> ∀b: status ∈ {none, reclaimed}`，只在 `progress` 配置下检查 |

正控配置里 `integrity` 只能经 `StoreFault` 到达。没有存储故障时，复查规则的三个分支里只有 `expired` 可达。

## 6. 负控

| 配置 | 去掉的规则 | 必须命中 |
| --- | --- | --- |
| `sweep-before-due` | 清扫者不看 due | `NoEarlyDelete` |
| `link-unsealed` | 结算关联未封存的正文 | `PublishedDurable` |
| `seal-after-settle` | 账本在结算后仍接受 seal | `NoWriteAfterSettle` |
| `store-ignores-deadline` | 存储不校验许可截止时间 | `ReclaimedLeavesNoBytes` |
| `grace-too-small` | `G = 3 = W + ε` | `QuiescentStoreEmpty` |
| `recheck-only-reclaimed` | 读不到时只认 `reclaimed` | `NoFalseIntegrity` |
| `permit-on-unknown` | `opened` 未提交也签发许可 | `IntentBeforeBytes` |
| `ttl-too-small` | `D = 4 = W + 2ε` | `ReclaimedLeavesNoBytes` |
| `no-recheck-after-read` | 读完存储后不再用读者时钟核期限 | `ReadWithinWindow` |

`grace-too-small` 的反例：清扫者比存储快 ε。t=2 签发许可（截止 4）并结算，孤儿 due = 5；t=4 清扫者读数 5，删除字节；同一时刻存储读数 4 ≤ 4，接受迟到的 `put`；之后提交 `reclaimed`，字节留在存储里，静止态非空。

`ttl-too-small` 的反例：签发者与清扫者比结算者与存储快 ε。t=0 签发（截止 3）、写入、封存、结算，`expiresAt = 4`；t=3 清扫者读数 4，删除字节；存储读数 3 ≤ 3，接受迟到的重复 `put`；`reclaimed` 的正文带着字节。已关联正文的期限与孤儿宽限期受同一个迟到写入威胁，所以装配必须同时校验 `D > W + 2ε`。

`no-recheck-after-read` 的反例：所有时钟一致。t=0 写入、封存并结算，`expiresAt = 5`；t=4 账本检查通过；读请求停顿到 t=8，清扫者尚未动作，字节仍在；读者直接返回字节，成功读取发生在 `expiresAt + Eps` 之后 2 个单位。契约下读者在 t=8 复核 `8 < 5` 不成立，答 `expired`。

负控配置只列目标性质，保证反例确实走到它。

## 7. 代码对应

切片 04 按里程碑填写。M1、M2 交付两个端口及其提供者，M3、M4 交付写入与读回；`Reclaim`、`DeleteBytes` 的调用方（清扫）随 M5。

| 模型 | 代码位置 | 状态 |
| --- | --- | --- |
| `status`、`Begin`、`LedgerSeal`、`Settle` | `tool/src/ledger-body-entries.ts`：`BodyEntryRecord.state`（opened → sealed → linked → reclaimed，或 → orphaned → reclaimed）；`beginBodyEntry`（Begin：提交 `opened`，同操作同输入认回，结算后与非当前执行拒绝）；`sealBodyEntry`（LedgerSeal：存储封存后提交 `sealed`，结算后拒绝）；`settleBodyEntries`（Settle 的正文部分：关联并按 `expiresAt` 排期，其余 opened/sealed 标孤儿并按 now + G 排期；引用未封存正文答 `body-not-sealed`），由 `ledger-result-uses.ts` 的 `adoptResultMaterials` 在结果提交里调用。判据 `tests/body-lifecycle.spec.ts` C3 | 已实现（M3）；`Reclaim` 随 M5 |
| `deadline`、`Renew` | `tool/src/ledger-body-writer.ts` 的 `permitFor`：只在 `opened` 提交答 `committed` 之后、从正文仍可写的快照签发，截止 = 签发者时钟 + W；`renew`/`freshPermit` 在剩余不足 ε 或存储答 `permit-expired` 时重读快照续签，结算后不再续签。提交结果未知时不签发（判据 C3 begin） | 已实现（M3） |
| `PermitValid`（存储侧用自己的时钟校验截止） | `tool-contract/src/body-store.ts` 的 `verifyBodyPermit(key, permit, now)`；内存替身与 `tool-storage-sql/src/body-store.ts` 都以自己的 `clock.now()` 调用它，`permit-expired` / `permit-invalid` 不写入。判据 `body.permit-deadline-by-store-clock`、`body.permit-signature-binds-claims` | 已实现（M1、M2） |
| `Put` | 存储侧 `ToolBodyStore.put`（内存替身、SQL 参加者，M1、M2）；写者侧 `ledger-body-writer.ts` 的 `putChunk`：作者 `append` 的每一帧与系统正文的每个分块直接进存储，不经账本 | 已实现 |
| `StoreSeal`（成功即耐久） | 存储侧 `ToolBodyStore.seal`（M1、M2）；写者侧 `ledger-body-writer.ts` 的 `sealBody`：格式校验（`checkDocument`）在前，存储封存在中，`sealBodyEntry` 提交在后 | 已实现 |
| `DeleteBytes`（幂等，无墓碑） | `ToolBodyStore.delete`：删除分块与清单。判据 `body.delete-idempotent-no-tombstone`、`body.delete-then-crash-redelete` | 已实现（M1、M2） |
| `StoreFault` | 契约之外，无代码对应；读回复查规则在 M4 | 不实现 |
| `due`、`Settle` 的排期、`Reclaim` 的 `unschedule` | `tool/src/ledger-store.ts` 的 `LedgerWrite` `schedule`/`unschedule` 与 `ToolLedgerStore.due`；内存仓 `tool/src/testing-store.ts`；SQL 参加者把 `tl_due` 写进同一事务，`tool.due.read` 读取。判据 `due.*`。提交排期与撤销排期的调用方在 M3、M5 | 索引已实现（M1、M2）；调用方待实现 |
| `expiresAt`、`ReadBegin`、`ReadRefuse` | `ledger-result-material.ts` 的 `activateResultChannels` 以结算者时钟固定 `retention.expiresAt`；`ledger-body-reads.ts` 的 `readPage` 先核授权、结果版本、条目 `linked`、`now < expiresAt`（读者时钟），不满足答 `expired` | 已实现（M4） |
| `ReadFinish`、`StillValid`、`RecheckExpired` | `ledger-body-reads.ts` 的 `readPage`：`readRange` 读存储；`absent` 时重读账本，`reclaimed`/`orphaned` 或 `expiresAt ≤ now + ε` 答 `expired`，否则答 `unavailable`（diagnostic 以 `integrity` 开头）；有字节时再以读者时钟核 `now < expiresAt`，不成立答 `expired` 不返回字节。判据 `tests/body-lifecycle.spec.ts` C4、C5 | 已实现（M4） |
| `Eps`、`W`、`G`、`D` 的约束 | `tool/src/construction.ts` 的 `ToolOffloadingConfiguration.permitMs`（W）、`clockSkewMs`（ε）、`orphanGraceMs`（G）与 `maxRetentionMs`（D 的系统上限）；`tool/src/configuration.ts` 的 `checkResultConfiguration` 在启动时拒绝 `G ≤ W + 2ε` 与 `maxRetentionMs ≤ W + 2ε`；`tool/src/result-offloading.ts` 的 `offloadingRefusal` 在声明受理时拒绝 `D ≤ W + 2ε`（`retention-within-late-write-window`）。判据 `tests/body-parameters.spec.ts` | 已实现（M3） |
| `off`、`Now(p)` | 每个参与者读自己的 `ToolInstantClock`：存储在 `verifyBodyPermit`；签发者在 `permitFor`，结算者在 `activateResultDecision`，读者在 `readPage`，都经 `ToolLedgerPorts.bodies.clock`。本地装配给四者同一进程时钟（`harness-server` holder 的 `bodyClock`） | 已实现 |
| `SweeperCrash` 与重跑 | `sweep(tenant, now, limit)` 的幂等重跑 | 待实现 |

## 8. 未覆盖

- 时钟偏移在一次行为里固定。「非递减或回拨不超过 ε」中的回拨没有展开。
- 一个分块、无摘要、无条件写冲突、无多页游标。一次只有一个在途读请求。
- 授权、租户隔离和结果版本匹配抽象为已通过。
- 一个调用、两个正文、一次崩溃、一次存储故障、两个许可。
- 永不结算的调用不在 `Quiescent` 的前提里，与契约声明的已知限制一致。
- `integrity` 的可达性依赖模型外的 `StoreFault`；契约内没有产生 `integrity` 的路径。

## 9. 运行与判读

使用 OpenJDK 21 与 TLC 1.7.4。通过 `--jar` 或 `TLA2TOOLS_JAR` 指定 JAR，摘要固定为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`，不匹配时拒绝运行。

```sh
export TLA2TOOLS_JAR=/path/to/tla2tools-1.7.4.jar
python3 packages/tool/tool-contract/verification/models/body-lifecycle/check.py --out tmp/<task>/body-lifecycle
```

可用 `--case positive` 选一个配置，`--workers`（默认 4）和 `--timeout`（默认每配置 900 秒）调节资源。日志、状态目录和带模型/配置摘要的汇总写到 `--out`，不写进本目录。本目录不保存执行结果；一次运行只能支持它实际记录的工具、输入和有限范围。

正控与 `progress` 要求退出 0 且 TLC 明确完成检查。负控要求退出 12，唯一违反的不变量等于配置指定名称。超时、解析错误和其他非零退出均失败。
