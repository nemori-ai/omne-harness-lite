# 提交顺序与读取隔离：性质、模型与实现的对应

[RcCommit.tla](models/RcCommit.tla) 与 [RcRead.tla](models/RcRead.tla) 守的性质、模型与源码的对应、机读守卫与每份配置的预期。规则本身归[包组规格](../../SPEC.md#应然设计)，手写证明在 [proofs](proofs/commit-order-and-read.md)。模型检查只说明有限范围内的设计性质，不证明源码精化。

## 性质表

| 编号 | 性质                                                                                                       | 规格不变式   | 模型里的性质                                                                                      | 机读守卫                                    |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| P1   | 先提交、后应用：投影是持有者耐久日志的前缀，注册修订等于已应用的注册决定数，同一实例不重复应用一笔提交     | CX-22        | `P1_CommittedPrefix`、`P1_RevIsLength`、`P1_AppliedOnce`                                          | `commit-order.spec.ts`                      |
| P2   | 认回只认完整输入：同一提交身份配不同输入是冲突，成功表只记成功                                             | CX-22        | `P2_AckMeansCommitted`、`P2_SeenIsApplied`                                                        | `commit-order.spec.ts`                      |
| P3   | 成功去重表每个作用域至多一项；已释放提交的重试答「顺序不符」，不重复应用，也不答「已应用」                 | CX-23        | `P3_SeenBounded`、`P3_StaleRetryRefused`                                                          | `commit-order.spec.ts`                      |
| P4   | 读取隔离：只读到本租户的值；父级逐跳核租户；撤销的资格读不到；已结束的作用域读不到；围栏关闭的作用域不披露 | CX-20、CX-24 | `P4_TenantIsolation`、`P4_RevokedNotServed`、`P4_EndedNotServed`、`P4_NoDisclosureWhileReplaying` | `read-differential.spec.ts`（租户隔离部分） |
| P5   | 读取缓存不改变读取结果；条目数不超过上限                                                                   | CX-25        | `P5_CacheCoherent`、`P5_CacheBounded`                                                             | `read-differential.spec.ts`（差分部分）     |
| P6   | 持有者读一次作用域归属后记住；已结束不记住                                                                 | CX-26        | `P6_OwnerMemoSound`                                                                               | 持有者一侧的用例                            |

守卫都在 `runtime-context` 成员的 `tests/`，因为它们驱动真实机制。

## RcCommit 与源码

模型有一个作用域。决定是 `[id, kind, basis, after, p]`：提交身份、注册决定或步提交、依据修订（只对注册决定有意义）、日志里前一条记录的提交身份和载荷。

| 模型                            | 源码（`packages/context/runtime-context/src/`）                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `log`、`CommitOk`、`CommitFail` | 持有者的耐久日志。不在本组；机制只收到 `applyCommit`                                                                                |
| `calls`、`Send`、`SendConflict` | 持有者对 `applyCommit` 的调用与重送。`SendConflict` 是同一身份配改写的输入                                                          |
| `Deliver(c)`                    | `holder.ts` 的 `applyCommit`：先查成功去重表，再比较 `after` 与链头，再由 `prepareRegistrationCommit` 比较依据修订，最后 `remember` |
| `rev`、`applied`                | 作用域状态的注册修订与已应用的决定                                                                                                  |
| `head`                          | 作用域状态的 `head`。`remember` 与 `replay.ts` 的 `install` 写入                                                                    |
| `seen`                          | 作用域状态的 `successes`。`remember` 先清空再写入，`install` 删去不在新链头的条目                                                   |
| `Crash`、`Replay`               | 进程重建后，持有者用 `beginReplay`、`finishReplay` 交回完整日志；安装后链头是检查点 `through`                                       |
| `Decide` 的 `after`             | 持有者送第 i 条记录时填入同一作用域第 i−1 条的提交身份                                                                              |

假设 A1：同一身份第一次送达的输入就是已提交的那份。改写的输入只作为已应用身份的重试出现。机制分辨不出伪造的输入，这归持有者权威。

## RcRead 与源码

固定拓扑：租户 A、B；作用域 a1、a2 属于 A，b1 属于 B；a2、b1 以 a1 为父（b1 是跨租户父链）。

| 模型                                | 源码                                                       |
| ----------------------------------- | ---------------------------------------------------------- |
| `owner`、`DoRebind`                 | 可信绑定来源 `world.bound`                                 |
| `rc`、`BeginReplay`、`FinishReplay` | 作用域状态的 `fence` 与 `ended`                            |
| `val`、`Publish`、`Replace`         | 生产者发布；`producer.ts` 的 `replaceInScopes` 换代清值    |
| `proj`                              | 投影版本，`world.touch` 推进                               |
| `elig`、`Issue`、`Revoke`           | 资格签发与撤销                                             |
| `cache`、`KeyOf`、`Insert`          | `read-cache.ts` 的读取缓存；键含作用域、资格与投影版本     |
| `Read(r)`、`Checks(r)`              | `reader.ts` 的读取：核资格、绑定、围栏与租户，再沿父链取值 |
| `memo`、`Remember`、`Recover`       | 持有者记住的作用域归属                                     |
| `Archive`                           | 持有者的作用域结束                                         |

## 机读守卫

| 文件                        | 守的性质                       | 驱动与判读                                                                                                                                                                                       |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `commit-order.spec.ts`      | P1、P2、P3                     | 带种子的随机序列：注册决定与步提交混合，随机送达、重复、乱序、改写的重试、已释放提交的重试和崩溃。每个答复对照模型的 `Deliver`，并断言各分支都被命中。有界性用例经恢复动作读出成功条目，只有一项 |
| `read-differential.spec.ts` | P4（租户隔离）、P5（缓存一致） | 两个机制实例，一个缓存、一个不缓存，执行同一序列：两租户发布、生产者换代、读取。比较两实例的每次读取，并核每个读者只见本租户的值                                                                 |

## 配置的预期

配置名的前缀表示用途：`rc-` 是正控，`bad-` 是负控（只检查点名的一条性质），`probe-` 是按实现建模的探针。正控的预期是没有反例；负控与探针的预期是点名的性质被违反。

| 配置                           | 规格     | 预期                            | 反例的含义                                                   |
| ------------------------------ | -------- | ------------------------------- | ------------------------------------------------------------ |
| `rc-commit`                    | RcCommit | 无反例                          | `TypeOK`、P1、P2、P3 成立                                    |
| `rc-commit-after-only`         | RcCommit | 无反例                          | 去掉注册修订比较后同一组性质仍成立：顺序只由 `after` 决定    |
| `rc-read`                      | RcRead   | 无反例                          | `TypeOK`、P4、P5、`P6_OwnerMemoSound` 成立                   |
| `bad-apply-before-commit`      | RcCommit | `P1_CommittedPrefix`            | 失败的提交被送达并应用                                       |
| `bad-apply-before-commit-seen` | RcCommit | `P2_SeenIsApplied`              | 失败的提交进了成功表                                         |
| `bad-id-only-dedupe`           | RcCommit | `P2_AckMeansCommitted`          | 改写的输入被答已应用                                         |
| `bad-no-after`                 | RcCommit | `P1_AppliedOnce`                | 不比较 `after` 时，恢复之后一笔已安装的步提交被再次应用      |
| `bad-no-after-stale`           | RcCommit | `P3_StaleRetryRefused`          | 不比较 `after` 时，已释放的提交不再答「顺序不符」            |
| `bad-no-release`               | RcCommit | `P3_SeenBounded`                | 不释放时成功去重表超过一项                                   |
| `bad-skip-parent-tenant`       | RcRead   | `P4_TenantIsolation`            | B 的读者经父 a1 读到 A 的值                                  |
| `bad-cache-skips-checks`       | RcRead   | `P4_RevokedNotServed`           | 撤销后缓存命中仍披露                                         |
| `bad-memo-ended`               | RcRead   | `P4_EndedNotServed`             | 记住已结束后，归档的作用域在崩溃后被当作开放恢复             |
| `bad-replace-no-touch`         | RcRead   | `P5_CacheCoherent`              | 换代清值后缓存仍给出旧值                                     |
| `bad-cache-unbounded`          | RcRead   | `P5_CacheBounded`               | 缓存超过上限                                                 |
| `bad-rebind`                   | RcRead   | `P6_OwnerMemoSound`             | 记住归属的正确性依赖引用不重绑                               |
| `probe-parent-fence`           | RcRead   | `P4_NoDisclosureWhileReplaying` | 父级一跳不看恢复围栏时，父作用域恢复期间子读者仍读到父级的值 |

## 未覆盖

- P4 的撤权、结束与围栏部分只在模型里检查，守卫没有覆盖。
- 可信时钟没有建模。恢复会话与代际替换的其余路径没有模型。
