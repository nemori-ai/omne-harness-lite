# BodyLifecycle：两个独立存储、五个独立时钟下的正文生命周期

本目录是 W3 r6 重建的目标模型。它检查 I-5（有限期限）、I-7（先耐久再发布）和 I-10（有界聚合）在下列部署条件下是否成立：账本与正文存储是两个独立参与者，没有共同事务，没有读快照隔离，步骤之间可以崩溃，每个参与者读自己的时钟，两两偏差不超过 ε。行为依据是 r6 设计包 4.1、4.2 和 4.4 的契约部分；实现尚未开始，第 7 节的代码名称是计划名。

模型只证明列出的有限状态和假设，不证明实现。

## 1. 参与者与时钟

五个参与者各有一个固定偏移 `off[p] ∈ 0..Eps`，在初态非确定地选定。参与者 p 的时钟读数是 `Now(p) = t + off[p]`，`t` 是真实时间。任意两个参与者的读数之差不超过 `Eps`。

| 参与者 | 用自己的时钟做什么 |
| --- | --- |
| `issuer` | 账本签发写入许可：截止时间 = `Now("issuer") + W` |
| `settler` | 账本结算：`expiresAt = Now("settler") + D`，孤儿 `due = Now("settler") + G` |
| `store` | 校验许可：`Now("store") <= deadline` 才接受 `put` 和 `seal` |
| `sweeper` | 判断到期：`due <= Now("sweeper")` 才删除字节 |
| `reader` | 账本检查 `Now("reader") < expiresAt`，复查时比较 `expiresAt <= Now("reader") + Eps` |

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
| `pending` | 已通过账本检查、尚未读取存储的读请求，`{}` 或 `{b}` |
| `lastAnswer`、`lastDelete` | 历史变量：读者最近一次答复、清扫者最近一次删除。只在产生它们的状态里非空，下一步清空 |

每个正文只有一个分块。摘要、条件写（同序号异摘要冲突）和多分块齐全性没有建模。

## 3. 动作

| 动作 | 参与者 | 含义 |
| --- | --- | --- |
| `Tick` | 时间 | `t` 加一。`pending` 非空时不前进：一页读取在一个时间单位内完成，它的耗时计入 ε。已低于新时间的许可截止时间统一记为 `t`，因为校验截止时间的存储再也不会接受它（这是状态空间归一化，不改变任何动作的可用性） |
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
| `ReadRefuse(b)` | reader 与账本 | 账本检查拒绝：`Now("reader") >= expiresAt`，答 `expired` |
| `ReadFinish` | reader 与存储、账本 | 读存储：有字节且已封存则成功；否则复查账本。`reclaimed`、`orphaned` 或 `expiresAt <= Now("reader") + Eps` 答 `expired`，其余答 `integrity`。`Bug = "recheck-only-reclaimed"` 时只认 `reclaimed` |

`Begin`、`Renew`、`Settle` 只在 `t <= TAct` 发生，`LedgerSeal` 随结算关闭。这是有限边界，使每个 due 都能在 `Tmax` 前到达。

## 4. 假设与有限边界

- 参数（正控）：`Eps = 1`，`W = 2`，`G = 5 = W + 2ε + 1`，`D = 5`，`TAct = 2`，`Tmax = 8`，`Bodies = {b1, b2}`，`MaxPermits = 2`，`MaxCrashes = 1`，`MaxFaults = 1`。
- 模型要求 `D > W + 2ε`，与 `G` 同样的约束。设计只写了 `G > W + 2ε`；`ttl-too-small` 负控说明 `D` 也需要它，见第 6 节。
- 时钟偏移固定；对称约简 `SYMMETRY Perm` 作用于 `Bodies`。
- 安全性质不依赖公平性。`progress` 配置使用 `LiveSpec = Spec ∧ Fairness`：`Tick` 强公平（读取反复交错时时间仍前进），`ReadFinish`、`DeleteBytes`、`Reclaim` 弱公平，崩溃次数由 `MaxCrashes` 封顶。
- 静止态性质用终态谓词表达，不是活性：`Quiescent = settled ∧ t = Tmax ∧ ∀b: due[b] = 0`。活性由 `EventuallyReclaimed` 单独检查。
- 所有配置 `CHECK_DEADLOCK FALSE`：模型到 `Tmax` 后自然停止。

## 5. 性质

| 名称 | 守住的不变式 | 含义 |
| --- | --- | --- |
| `PublishedDurable` | I-7 | 已发布的引用都指向存储曾封存、账本已关联（或此后已回收）的正文 |
| `IntentBeforeBytes` | 意图先记账 | 存储里有字节的正文，账本都已 `opened` |
| `ReadWithinWindow` | I-5 双向窗口上沿 | 成功读取只发生在已发布且已关联的正文上，且 `at + off["settler"] < expiresAt + Eps`。它也排除读到孤儿字节，因为孤儿没有 `expiresAt` |
| `RefusalWithinWindow` | I-5 双向窗口下沿 | 因到期被拒绝时 `at + off["settler"] + Eps >= expiresAt` |
| `NoEarlyDelete` | I-5、I-10 | 清扫者删除已关联正文时，`at + off["sweeper"] >= expiresAt` 且真实时间 `at >= expiresAt − Eps` |
| `ReclaimedLeavesNoBytes` | I-10 | `reclaimed` 的正文在存储里没有字节和清单 |
| `NoFalseIntegrity` | I-5 | `integrity` 只在正文 `linked` 且 `expiresAt > Now("reader") + Eps` 时答出 |
| `NoWriteAfterSettle` | 结算关闭写入 | 结算后没有正文处于 `opened` 或 `sealed` |
| `QuiescentStoreEmpty` | I-10 静止态 | 结算后、时间越过全部 due、无排期条目时，存储里没有本调用的任何字节 |
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
| `ttl-too-small` | `D = 4 = W + 2ε`（设计未约束） | `ReclaimedLeavesNoBytes` |

`grace-too-small` 的反例：清扫者比存储快 ε。t=2 签发许可（截止 4）并结算，孤儿 due = 5；t=4 清扫者读数 5，删除字节；同一时刻存储读数 4 ≤ 4，接受迟到的 `put`；之后提交 `reclaimed`，字节留在存储里，静止态非空。

`ttl-too-small` 的反例：签发者与清扫者比结算者与存储快 ε。t=0 签发（截止 3）、写入、封存、结算，`expiresAt = 4`；t=3 清扫者读数 4，删除字节；存储读数 3 ≤ 3，接受迟到的重复 `put`；`reclaimed` 的正文带着字节。已关联正文的期限与孤儿宽限期受同一个迟到写入威胁，所以装配必须同时校验 `D > W + 2ε`。

负控配置只列目标性质，保证反例确实走到它。

## 7. 代码对应

实现尚未开始。下表是计划中的对应位置，全部标为待实现。

| 模型 | 计划中的代码位置 | 状态 |
| --- | --- | --- |
| `status`、`Begin`、`LedgerSeal`、`Settle`、`Reclaim` | `tool` 包账本调用域的 `BodyEntry` 状态机与 `commitResult`、`sweep` 提交 | 待实现 |
| `deadline`、`Renew`、`PermitValid` | `tool-contract` 的 `BodyWriter` 许可（`tenant, call, bodyId, exec, deadline`）与账本续期 | 待实现 |
| `Put`、`StoreSeal`、`DeleteBytes`、`StoreFault` | `tool-contract` 端口 `ToolBodyStore.put/seal/read/delete`，`tool-storage-sql` 的 `tl_body_blob` 与清单表 | 待实现 |
| `due`、`Settle` 的排期、`Reclaim` 的 `unschedule` | `tool-contract` 端口 `ToolLedgerStore.schedule/unschedule/due`，`tool-storage-sql` 的 `tl_due` | 待实现 |
| `expiresAt`、`ReadBegin`、`ReadRefuse`、`ReadFinish` | `tool` 包 `readPage` 及其读不到时的复查规则 | 待实现 |
| `off`、`Now(p)`、`Eps`、`W`、`G`、`D` | 时钟端口的 ε 契约；装配启动时校验 `G > W + 2ε`，并按本模型补充 `D > W + 2ε` | 待实现 |
| `SweeperCrash` 与重跑 | `sweep(tenant, now, limit)` 的幂等重跑 | 待实现 |

## 8. 未覆盖

- 时钟偏移在一次行为里固定。「非递减或回拨不超过 ε」中的回拨没有展开。
- 一个分块、无摘要、无条件写冲突、无多页游标。
- 授权、租户隔离（I-4、I-12）和结果版本匹配抽象为已通过。
- 一个调用、两个正文、一次崩溃、一次存储故障、两个许可。
- 永不结算的调用不在 `Quiescent` 的前提里，与设计声明的已知限制一致。
- `integrity` 的可达性依赖模型外的 `StoreFault`；契约内没有产生 `integrity` 的路径。

## 9. 运行与判读

使用 OpenJDK 21 与 TLC 1.7.4。通过 `--jar` 或 `TLA2TOOLS_JAR` 指定 JAR，摘要固定为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`，不匹配时拒绝运行。

```sh
export TLA2TOOLS_JAR=/path/to/tla2tools-1.7.4.jar
python3 packages/tool/tool-contract/verification/models/body-lifecycle/check.py --out tmp/<task>/body-lifecycle
```

可用 `--case positive` 选一个配置，`--workers`（默认 4）和 `--timeout`（默认每配置 900 秒）调节资源。日志、状态目录和带模型/配置摘要的汇总写到 `--out`，不写进本目录。

正控与 `progress` 要求退出 0 且 TLC 明确完成检查。负控要求退出 12，唯一违反的不变量等于配置指定名称。超时、解析错误和其他非零退出均失败。

## 10. 本次运行结果

2026-11-09，macOS，OpenJDK 21.0.13，TLC 2.19（tla2tools-1.7.4），4 个 worker。本目录不保存运行输出；下表只记录这一次。

| 配置 | 结果 | 命中 | 生成状态 | 不同状态 | 时间 |
| --- | --- | --- | --- | --- | --- |
| `positive` | 通过 | — | 3,966,480 | 1,117,088 | 12 s |
| `progress` | 通过 | — | 7,852,304 | 2,208,128 | 137 s |
| `sweep-before-due` | 命中 | `NoEarlyDelete` | 22,708 | 13,552 | 6 s |
| `link-unsealed` | 命中 | `PublishedDurable` | 276 | 204 | 6 s |
| `seal-after-settle` | 命中 | `NoWriteAfterSettle` | 7,454 | 4,525 | 6 s |
| `store-ignores-deadline` | 命中 | `ReclaimedLeavesNoBytes` | 141,097 | 53,042 | 7 s |
| `grace-too-small` | 命中 | `QuiescentStoreEmpty` | 682,245 | 302,804 | 7 s |
| `recheck-only-reclaimed` | 命中 | `NoFalseIntegrity` | 222,259 | 115,147 | 6 s |
| `permit-on-unknown` | 命中 | `IntentBeforeBytes` | 392 | 264 | 6 s |
| `ttl-too-small` | 命中 | `ReclaimedLeavesNoBytes` | 264,965 | 136,490 | 7 s |

负控的状态数是 TLC 找到首个反例时的计数，不是完整状态空间。
