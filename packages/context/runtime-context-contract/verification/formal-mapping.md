# 提交顺序与读取隔离：性质、模型与实现的对应

本页说明 [RcCommit.tla](models/RcCommit.tla) 与 [RcRead.tla](models/RcRead.tla) 守住哪些性质，模型的变量和动作对应哪些源码，以及每条性质的机读守卫。运行记录见 [formal-runs.md](formal-runs.md)，无界推广见 [proofs](proofs/README.md)。

模型检查只说明有限范围内的设计性质。它不证明源码精化。实现是 [runtime-context](../../runtime-context/SPEC.md) 成员。

## 性质表

| 编号 | 性质 | 出处 | 违背后果 | 原来靠什么守 | 现在怎么守 |
| --- | --- | --- | --- | --- | --- |
| P1 | 先提交、后应用：投影是持有者耐久日志的前缀，注册修订等于已应用的决定数 | [RC-02](../SPEC.md) 注册修订与提交顺序 | 已应用、未提交的注册；顺序错乱的投影；恢复后与持有者不一致 | conformance 的单点用例 | `P1_CommittedPrefix`、`P1_RevIsLength`；守卫 `commit-order.spec.ts`；[证明](proofs/README.md#p1-已应用是日志前缀) |
| P2 | 认回只认完整输入：同一提交身份配不同输入是冲突，成功表只记成功 | RC-02 | 改写过的重试被当成已应用；失败被记住后无法补齐 | conformance 的单点用例 | `P2_AckMeansCommitted`、`P2_SeenIsApplied`；守卫 `commit-order.spec.ts` |
| P3 | 已应用提交表有界并会释放 | 共同简报的性能要求；RC-02 只说「只在进程内保存」 | 长寿进程内存随提交数线性增长 | 无 | 探针 `P3_SeenBounded` 命中，记为缺陷 D1 |
| P4 | 读取隔离：只读到本租户的值；父级逐跳核租户；撤销的资格读不到；已结束的作用域读不到；围栏关闭的作用域不披露 | RC-01、RC-03、RC-09 | 跨租户泄漏；撤权后仍可读；恢复期间披露旧值 | `cross-tenant.spec.ts`、`read-cache.spec.ts` 的单点用例 | `P4_TenantIsolation`、`P4_RevokedNotServed`、`P4_EndedNotServed`、`P4_NoDisclosureWhileReplaying`；守卫 `read-differential.spec.ts`（租户隔离部分）。父级围栏见缺陷 D2 |
| P5 | 读取缓存不改变读取结果；条目数不超过上限 | RC-08；runtime-context SPEC「读取缓存」 | 读到旧值；内存无界 | `read-cache.spec.ts` 的单点用例 | `P5_CacheCoherent`、`P5_CacheBounded`；守卫 `read-differential.spec.ts`（差分部分）；[证明](proofs/README.md#p5-缓存不改变读取结果) |
| P6 | 作用域归属读一次后记住；`ended` 不记住 | session-adapters SPEC AD-03 | 已归档的作用域在崩溃后被当作开放恢复 | session-adapters 的 `context-holder.spec.ts` | `P6_OwnerMemoSound`；`bad-memo-ended` 命中 `P4_EndedNotServed`。已有守卫的源码负控没有执行 |
| P7 | 受信名只经受信作用域读取，签发只在白名单内 | application-assembly「受信子树」；`check:aa-rows` | 根上代码按名取得受信服务 | `check:aa-rows` 与 `aa-source.spec.ts` | 只做了源码审读，找到覆盖缺口，记为缺陷 D3。没有模型和新守卫 |

## RcCommit 与源码

模型有一个作用域。决定是 `[id, basis, p]`：提交身份、依据修订和载荷。

| 模型 | 源码（`packages/context/runtime-context/src/`） |
| --- | --- |
| `log`、`CommitOk`、`CommitFail` | 持有者的耐久日志。不在本成员；机制只收到 `applyCommit` |
| `calls`、`Send`、`SendConflict` | 持有者对 `applyCommit` 的调用与重送。`SendConflict` 是同一身份配改写的输入 |
| `Deliver(c)` | `holder.ts` 的 `applyCommit`：先查成功表，再 `prepareRegistrationCommit` 比较 `basedOn` 与当前修订，最后 `remember` |
| `rev`、`applied` | 作用域状态的注册修订与已应用的注册 |
| `seen` | `world.ts` 的 `commits` 映射（`remember` 写入完整输入） |
| `Crash`、`Replay` | 进程重启后，持有者用 `beginReplay`、`finishReplay` 交回完整日志 |

假设 A1：同一身份第一次送达的输入就是已提交的那份。改写的输入只作为已应用身份的重试出现。机制分辨不出伪造的输入，这归持有者权威。

## RcRead 与源码

固定拓扑：租户 A、B；作用域 a1、a2 属于 A，b1 属于 B；a2、b1 以 a1 为父（b1 是跨租户父链）。

| 模型 | 源码 |
| --- | --- |
| `owner`、`DoRebind` | 可信绑定来源 `world.bound` |
| `rc`、`BeginReplay`、`FinishReplay` | 作用域状态的 `fence` 与 `ended` |
| `val`、`Publish`、`Replace` | 生产者发布；`producer.ts` 的 `replaceInScopes` 换代清值 |
| `proj` | 投影版本，`world.touch` 推进 |
| `elig`、`Issue`、`Revoke` | 资格签发与撤销 |
| `cache`、`KeyOf`、`Insert` | `read-cache.ts` 的读取缓存；键含作用域、资格与投影版本 |
| `Read(r)`、`Checks(r)` | `reader.ts` 的读取：核资格、绑定、围栏与租户，再 `readBlock` 与 `inheritedValue` 沿父链取值 |
| `memo`、`Remember`、`Recover` | session-adapters 的 `context-holder.ts` 记住的作用域归属 |
| `Archive` | 持有者的作用域结束 |

## 机读守卫

两份守卫都在 runtime-context 成员的 `tests/`，因为它们驱动真实机制。

| 文件 | 守的性质 | 驱动与判读 | 负控（源码变异） |
| --- | --- | --- | --- |
| `commit-order.spec.ts` | P1、P2 | 200 个种子，每个 40 步。随机送达、重复、乱序、改写的重试和崩溃。每个答复对照模型的 `Deliver`。另断言五个分支各命中 20 次以上 | M1 不比依据修订；M2 成功表只比身份；M3 记住乱序的失败。三个都变红 |
| `read-differential.spec.ts` | P4（租户隔离）、P5（缓存一致） | 60 个种子，每个 40 步。两个机制实例，一个缓存两条、一个不缓存，执行同一序列：两租户发布、生产者换代、读取。比较两实例的每次读取，并核每个读者只见本租户的值 | M4 换代不推进投影版本（P5 变红）；M5 父链一跳不核租户与绑定（P4 变红） |

M5 只删租户核对时守卫不变红：同一跳的绑定核对也会挡住另一租户的父级。所以变异同时删掉两处。

## 未覆盖

- P4 的撤权、结束与围栏部分只在模型里检查，守卫没有覆盖。
- P6 的源码负控要改 session-adapters 的 `src/`，本次没有执行。
- P7 没有模型和守卫。
- 可信时钟没有建模。
