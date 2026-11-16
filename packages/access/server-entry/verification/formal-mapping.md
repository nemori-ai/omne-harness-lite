# 登记表、可用性与会话观察：性质、模型与实现的对应

三个 TLA+ 模型检查[包组规格](../../SPEC.md)的三组规则：[AccessRegistry.tla](models/AccessRegistry.tla)（由 [MCRegistry.tla](models/MCRegistry.tla) 给出每个调用是读还是写）检查「登记表与撤下」与「收场」，[Availability.tla](models/Availability.tla) 检查「可用性」，[SessionObservation.tla](models/SessionObservation.tla) 检查「会话观察」的定位与流。模型只说明有界实例与前提之内没有这一类缺陷，不证明实现符合；实现由下面的契约测试核对。

## 性质

| 模型               | 性质                                                 | 含义                                                               | 规格不变式 |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| AccessRegistry     | `Unique`                                             | 同名协议至多挂着一份                                               | I-3        |
| AccessRegistry     | `AbortReachesInFlight`                               | 属于一份已不在表里的贡献的在途调用一定已收到中止                   | I-4        |
| AccessRegistry     | `HonestAnswer`                                       | 处理函数已经开始的提交类调用不会被答成「依据不可用」               | I-8        |
| AccessRegistry     | `GoneMeansSettled`                                   | 撤下完成时这份贡献的在途调用都答复了，观察都结束了                 | I-4        |
| AccessRegistry     | `EveryCallSettles`、`EveryObsEnds`、`DrainCompletes` | 到达的调用最终有答复；要结束的观察最终结束；撤下最终完成           | I-4        |
| Availability       | `ViewIsTruePast`                                     | 订阅者的视图总是登记表在某个修订号上真实有过的样子                 | I-6        |
| Availability       | `DeltaBaseMatches`                                   | 队头是变化帧时，它的基础正好是订阅者手里的修订号                   | I-6        |
| Availability       | `Converges`                                          | 订阅着的订阅者最终看到的集合等于登记表                             | I-6        |
| SessionObservation | `QuiescentIsCurrent`                                 | 不丢唤醒：安静下来时观察者看到的修订号就是日志的修订号             | AC-8       |
| SessionObservation | `TargetIsLatest`                                     | 不停在旧的调用上：安静下来时目标要么没有，要么是日志里最近的主调用 | AC-8       |
| SessionObservation | `NoStaleFrame`                                       | 旧目标或旧订阅的帧不发出去                                         | AC-8       |
| SessionObservation | `AxesAgree`、`EventuallyCurrent`                     | 没有目标当且仅当流那条轴空着；提交停下之后最终看到最新修订号并保持 | AC-8       |

模型给实现的两条硬要求：「查登记表并登记成在途」与「读登记表快照并登记订阅者」各是一段没有 `await` 的同步代码。分成两步，对应的负控就命中。

## 配置的预期

正控以 0 退出并完成搜索。负控命中不变量时以 12 退出，命中进展性质时以 13 退出。配置关闭了死锁检查，因为全部调用答复之后没有后续动作是预期的终态。

| 配置                                | 模型               | 改坏了什么                                 | 预期                        |
| ----------------------------------- | ------------------ | ------------------------------------------ | --------------------------- |
| `reg-correct`                       | MCRegistry         | 无                                         | 无错误                      |
| `reg-noUniqueness`                  | MCRegistry         | 挂上时不查同名                             | 违反 `Unique`               |
| `reg-noAbort`                       | MCRegistry         | 撤下时不给在途调用发中止                   | 违反 `AbortReachesInFlight` |
| `reg-nonAtomicLookup`               | MCRegistry         | 查表与登记成在途分成两步                   | 违反 `AbortReachesInFlight` |
| `reg-wrongAnswer`                   | MCRegistry         | 提交类调用在中止后失败，答成「依据不可用」 | 违反 `HonestAnswer`         |
| `reg-earlyGone`                     | MCRegistry         | 不等在途的都结束就宣布撤下完成             | 违反 `GoneMeansSettled`     |
| `reg-noObsEnd`                      | MCRegistry         | 撤下时不让观察结束                         | 违反进展性质                |
| `reg-stuckAborted`                  | MCRegistry         | 收到中止的调用没有人处理                   | 违反进展性质                |
| `avail-correct`                     | Availability       | 无                                         | 无错误                      |
| `avail-nonAtomicSubscribe`          | Availability       | 读登记表与登记订阅者分成两步               | 违反 `DeltaBaseMatches`     |
| `avail-nonAtomicSubscribe-nodelta`  | Availability       | 同上                                       | 违反 `ViewIsTruePast`       |
| `avail-nonAtomicSubscribe-liveonly` | Availability       | 同上                                       | 违反 `Converges`            |
| `avail-dropOldest`                  | Availability       | 积压满了丢最旧的一帧，不改发快照           | 违反 `DeltaBaseMatches`     |
| `avail-dropOldest-nodelta`          | Availability       | 同上                                       | 违反 `ViewIsTruePast`       |
| `avail-staleOnReconnect`            | Availability       | 重连时不发快照                             | 违反 `DeltaBaseMatches`     |
| `avail-staleOnReconnect-nodelta`    | Availability       | 同上                                       | 违反 `ViewIsTruePast`       |
| `obs-correct`                       | SessionObservation | 无                                         | 无错误                      |
| `obs-dropWhileBusy`                 | SessionObservation | 定位进行中来的通知不记下                   | 违反 `QuiescentIsCurrent`   |
| `obs-noDiscard`                     | SessionObservation | 迟到的旧帧不丢掉                           | 违反 `NoStaleFrame`         |
| `obs-keepOldTarget`                 | SessionObservation | 主调用换了、模型没给新的流时留着旧目标     | 违反 `TargetIsLatest`       |

## 模型到实现

| 模型动作                     | 实现                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 查表并登记成在途             | `src/pipeline/pipeline.ts` 的 `admit` 同步调用 `src/registry/registry.ts` 的 `enter`；两个签名都不是 Promise                |
| 处理函数开始、完成、失败     | `src/settle/settle.ts` 的 `settleCall`：已中止则不调用；失败按读写一栏答复；中止之后计宽限                                  |
| 撤下                         | access-cordis-contract 的 `mount` 把挂上包进调用者作用域的效应；卸载时 `registry.ts` 的撤下同步移除表项、发中止、回调订阅者 |
| 重新挂上                     | `registry.ts` 的 `mount`：同名同主版本已有表项时抛装配错误                                                                  |
| 订阅、写一帧、丢积压         | 登记表的 `subscribe` 同步返回快照并登记订阅者；`src/availability/` 的帧来源排变化帧，积压超限并成快照                       |
| 应用一帧、重连               | client-assembly 的连接核对基础修订号之后应用，对不上就重新订阅                                                              |
| 会话观察的通知、定位、帧送达 | 刷新循环的设计步骤；实现没有接上定位与刷新                                                                                  |

## 性质到契约测试

| 性质                   | 契约测试                                                                        | 去掉什么会变红                   |
| ---------------------- | ------------------------------------------------------------------------------- | -------------------------------- |
| I-3 同名至多一份       | `tests/registry.spec.ts` 挂上同名协议第二次；`tests/registry-cordis.spec.ts`    | 挂上时的同名检查                 |
| I-4 中止送达在途的     | `tests/registry.spec.ts` 登记成在途之后撤下                                     | 撤下时遍历在途集合               |
| I-4 撤下完成时都已结束 | `tests/registry.spec.ts` 撤下并等它完成；`tests/registry-cordis.spec.ts`        | 撤下等在途的结束                 |
| I-4 进展               | `tests/settle.spec.ts` 不理会中止的处理函数；`tests/pipeline-abort.spec.ts`     | 收到中止的调用被处理；同时等中止 |
| I-8 写答「未知」       | `tests/settle.spec.ts` 提交类处理函数开始之后撤下并失败                         | 写答 `unknown` 而不是依据不可用  |
| I-8 读与未开始的       | `tests/settle.spec.ts` 读在中止后失败、处理函数未开始就中止                     | 两种答复的区分                   |
| I-6 订阅不漏帧         | `tests/registry.spec.ts` 与 `tests/availability.spec.ts` 订阅的同时挂上一个协议 | 读表与登记订阅者是一步           |
| I-6 积压满了改发快照   | `tests/availability.spec.ts` 订阅者不读、登记表连续变化超过积压上限             | 积压满了改发快照                 |
| I-6 重连得到快照       | `tests/availability.spec.ts` 断线期间登记表变化                                 | 重连后先发快照                   |
| I-6 帧不错位           | client-assembly 的 `tests/protocol-client.spec.ts` 基础对不上的变化帧           | 客户端核对修订号                 |

## 前提与没有建模的

- 处理函数要么正常完成，要么在收到中止之后失败；不理会中止的由管道在宽限之后当作失败。
- 连接断开时，服务端丢掉这个订阅者与它的积压。进展性质以公平调度为前提。
- 会话观察的通知可能丢失，由按间隔的刷新补上；一次定位用的是它开始时的日志。
- 没有建模：时钟、心跳、请求预算、同一调用被重发、帧的字节上限、刷新的次数与时长上界、取消与撤权。
