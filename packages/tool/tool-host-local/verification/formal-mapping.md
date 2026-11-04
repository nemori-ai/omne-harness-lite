# 启动围栏与推送退避：性质、模型与实现的对应

本页说明 [StartFence.tla](models/StartFence.tla) 与 [DeliveryBackoff.tla](models/DeliveryBackoff.tla) 守住哪些性质，模型的变量和动作对应哪些源码，以及每条性质的机读守卫。运行记录见 [formal-runs.md](formal-runs.md)，超出有限范围的推广见 [proofs](proofs/README.md)。

模型检查只说明有限范围内的设计性质。它不证明源码精化。源码与模型的对应由本页的文字和下列守卫维护。

## 性质表

| 编号 | 性质 | 出处 | 违背后果 | 原来靠什么守 | 现在怎么守 |
| --- | --- | --- | --- | --- | --- |
| P1 | 一个 start 至多一条受理记录，至多一次 launch | tool-contract SPEC「P04 实际发起围栏」；本包 [SPEC](../SPEC.md)「3 consume」 | 同一调用执行两次，外部副作用重复 | `start-coordinator.spec.ts` 的单例用例 | `OneAcceptancePerStart`；守卫 P1 |
| P2 | 失效先提交，就围住此前签发的全部 permit | P04「失效先成立则不发起」；SPEC「1 排序域」 | 撤权后仍启动 | `start-coordinator.spec.ts` 的 G5 order 用例 | `FenceHolds`；守卫 P2；[证明](proofs/README.md#p2-失效围栏的推广) |
| P3 | inspect 答 not-started 之前签发的 permit，之后不能被受理 | SPEC「4 inspect」 | 已判「未启动」的调用随后执行 | inspect 用例 | `NotStartedExcludes`；守卫 P3 |
| P4 | 已排除的调用没有受理；已受理的调用不能被排除 | SPEC「5 exclude」 | 在途执行被当成从未启动，名额被释放 | exclude 用例 | `ExclusionAndAcceptanceExclusive`；守卫 P4 |
| P5 | 重送的失效认回首次证据，守卫每个操作只前进一次 | SPEC「2 许可与守卫」 | 合法的新 permit 被错误拒绝 | resent invalidation 用例 | `GuardAdvancesPerOperation`；守卫 P5 |
| P6 | 一个 start 不能既受理又拒绝 | SPEC「3 consume」决定顺序 | 调用同时在途又终局 | 无直接用例 | `OneDecision`；守卫 P6 |
| T | 他租户主体的操作一律 denied，不写记录 | SPEC「6 身份、租户与失败」 | 跨租户泄漏或篡改 | `start-tenant-isolation.spec.ts` | 只有守卫 T，没有建模 |
| Q1 | 无热环：连续第 k 次 unavailable 推送不早于前 k−1 次等待之和 | SPEC「结果交付的推送退避」；R2-D273、R2-D282 | 对拒收的接收方空转，日志爆炸 | `delivery/unavailable-receiver.spec.ts` 的定值用例 | `PushesPaced`；守卫 Q1；[证明](proofs/README.md#q1-推送次数的上界) |
| Q2 | 等待不超过 `maxMs` | 同上 | 交付事实上停止 | 同上 | `DelayCapped`；守卫 Q2 |
| Q3 | unavailable 不结束交付责任 | 同上 | 结果静默丢失 | 同上 | `OwedUntilSaved`；守卫 Q3 |
| Q4 | 没有 unavailable 的答复清除退避 | 同上 | 偶发故障后一直慢推 | 同上第二个用例 | `ResetAfterAnswer`；守卫 Q4 |
| Q5 | 每次进入退避写一条具名 warn | 同上 | 失败静默 | 同上的 warn 计数 | `WarnPerPacedPush`；守卫 Q5 |
| L | 等待结束后的驱动一定推送 | 同上「保持待推」 | 退避把交付永久挡住 | 无 | 只有守卫 L，模型不检查进展 |

## StartFence 与源码

模型有一个租户、一个调用、一个 start、一个守卫资源。`clock` 是 host 域的修订顺序。

| 模型 | 源码（`src/start-coordinator.ts`） |
| --- | --- |
| `clock` | `transact`：租户串行区内读快照，按快照修订条件提交 |
| `Prepare` | `prepare`：permit 记录保存当前 `guardOf(snapshot).revision`；同一 start 的新 permit 替换旧 permit |
| `Invalidate(i)` | `invalidate`：守卫修订加一，与 `InvalidationRecord` 同一提交。答复丢失对应提交答 `commit-unknown` |
| `ResendInvalidation(i)` | 同一操作号重送，命中 `invalidationKey` 认回首次证据 |
| `Consume(p)` 分支 1 | `progressOf` 认回已有决定 |
| `Consume(p)` 分支 2 | `stored.digest !== permit.digest`：not-issued 或 not-started，不写记录 |
| `Consume(p)` 分支 3 | `moved !== undefined`：写永久拒绝，删 permit |
| `Consume(p)` 分支 4 | 受理提交 `puts: [accepted], deletes: [permit]`。答复丢失对应 `unknown-applied` |
| `Inspect` | `inspect`：`ExclusionRecord` 与删 permit 同一提交 |
| `Exclude` | `exclude`：调用级 `RejectionRecord`；已有受理时答 `conflict` |
| `Launch(a)` | 绑定按受理证据推进胶囊。每个证据只 launch 一次是绑定的义务，不是协调器的义务 |

模型没有展开：多个 start、多个守卫、租户、`permitRequirements` 的 required 与 unavailable 分支、`turnTimeoutMs` 到期、跨进程。

## DeliveryBackoff 与源码

| 模型 | 源码（`src/result-delivery.ts`） |
| --- | --- |
| `now`、`Tick` | 注入的 `now()` 读数。模型假设它不后退 |
| `Push` | `push`：`pacedAway` 为空才查找接收方并推送 |
| `receiver = "unavailable"` | `receiverOf` 答 unavailable，或 `push` 答 unavailable，进入 `pace` |
| `delay`、`until` | `paced` 表项：`delay = last ? min(2·last, maxMs) : initialMs`，`until = now + delay` |
| `warns` | `pace` 里的 `input.warn` |
| `receiver = "denied"` | 确定失败：`paced.delete`，交付仍待推，不写 warn |
| `receiver = "saved"` | 推送成功：`paced.delete` 后 `state.save` |

退避状态只在内存里。模型不含进程重启。重启后第一轮等待重新从 `initialMs` 开始，见证明的前提。

## 机读守卫

| 文件 | 守的性质 | 驱动与判读 | 负控 |
| --- | --- | --- | --- |
| `tests/start-fence-properties.spec.ts` | P1–P6、T | 40 个种子，每个 30 步。随机发 prepare、consume（任一签发过的 permit）、inspect、exclude、invalidate、重送和他租户操作，并注入提交答复丢失。驱动真实协调器和内存账本。判读器按模型性质检查每个可观察答复，最后读账本核对守卫修订 | 同一驱动和判读器对着六个各删一条规则的玩具排序域运行，必须分别报出 P2、P1、P3、P4、P5、T |
| `tests/delivery/backoff-bound.spec.ts` | Q1–Q5、L | 30 个种子，每个 60 次驱动。时钟随机前进（含零步，即同一时刻的突发驱动），接收方随机答 unavailable、denied 或 saved。驱动真实交付 worker。判读器按模型逐次重放 | 同一驱动和判读器对着六个各删一条规则的玩具 worker 运行，必须分别报出 Q1、Q2、Q4、Q3、Q5、L |

P2 的守卫以失效证据返回的那一步作为围栏点。这比模型的提交点弱：提交已生效但答复丢失时，守卫不判断。模型和证明覆盖提交点。

守卫是有限的种子随机检查，不是穷举。它们能发现实现偏离模型，但不能证明实现符合模型。

## 未覆盖

- 多个 start 和多个守卫资源的组合，只由证明推广，没有机检。
- 路径守卫 `withinRoot` 与 `placePath` 的属性测试没有写。
- `paced` 表项的回收没有守卫，见 [formal-runs.md](formal-runs.md#观察) 的观察 O2。
