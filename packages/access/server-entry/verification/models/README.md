# 接入登记表与可用性的有限行为模型

本页维护三个 TLA+ 模型的范围、性质、负控、前提与运行命令。前两个是接入层的。第三个是会话观察的：会话观察的成员还没有建，它的刷新策略现在写在本成员的规格里，所以模型先放在这里，成员建成时随刷新策略一起搬过去。设计依据是 [RFC-0015](../../../../../docs/rfcs/RFC-0015-access-dynamic-registration.md)。模型先于实现：下面「模型与设计步骤的对应」的右栏写的是设计里的步骤，成员实现这些步骤之后，右栏改成文件与函数。登记表模型的各行已经改成文件与函数，与提交 `f721e51b1` 的实现核对一致（卡 #1223）；另两个模型的行仍是设计里的步骤。

模型通过只说明下面的有界实例和前提之内没有这一类缺陷。它不证明实现符合，也不证明更大的规模下成立。实现符合由[契约测试](#证明转契约测试)在真实的登记表、管道与观察中枢上验证。

## 登记表与在途工作模型

[AccessRegistry.tla](AccessRegistry.tla) 检查一个协议撤下、重新挂上时，它的在途调用与在途观察的结局。[MCRegistry.tla](MCRegistry.tla) 只给出每个调用是读取类还是提交类。

有界范围：2 个协议名，2 个调用（一个读取类，一个提交类），1 个观察，一份贡献最多挂上 3 次。

| 模型里的东西 | 含义 |
| --- | --- |
| `entries` | 登记表：一组「协议名、第几次挂上」。「第几次挂上」是一份贡献的身份 |
| `genState`：`live`、`draining`、`gone` | 一份贡献的寿命：挂着、撤下中、撤下完成 |
| `call[c].state`：`idle`、`registered`、`running`、`answered` | 一次调用：没到、已登记成在途、处理函数在跑、已答复 |
| `call[c].aborted` | 中止信号已经发给它 |
| `call[c].started` | 处理函数开始过。它决定失败时答「依据不可用」还是「未知」 |
| `obs[o].mustEnd` | 观察中枢已经决定结束这个观察，结束帧还没写出 |

| 性质 | 说的是什么 | 对应的不变式 |
| --- | --- | --- |
| `Unique` | 同名协议至多挂着一份 | I-3 |
| `AbortReachesInFlight` | 在途的调用如果属于一份已经不在表里的贡献，它一定已经收到中止 | I-4 |
| `HonestAnswer` | 处理函数已经开始的提交类调用，不会被答成「依据不可用」 | I-8 |
| `GoneMeansSettled` | 撤下完成时，这份贡献的在途调用都答复了，观察都结束了 | I-4 |
| `EveryCallSettles` | 到达的调用最终都有答复 | I-4 |
| `EveryObsEnds`、`DrainCompletes` | 要结束的观察最终结束；撤下最终完成 | I-4 |

安全配置是 [reg-correct.cfg](reg-correct.cfg)。七个负控各改坏一处，必须在指定的性质上失败：

| 负控 | 改坏了什么 | 必须失败的性质 |
| --- | --- | --- |
| [reg-noUniqueness.cfg](reg-noUniqueness.cfg) | 挂上时不查同名 | `Unique` |
| [reg-noAbort.cfg](reg-noAbort.cfg) | 撤下时不给在途调用发中止 | `AbortReachesInFlight` |
| [reg-nonAtomicLookup.cfg](reg-nonAtomicLookup.cfg) | 查登记表和登记成在途分成两步 | `AbortReachesInFlight` |
| [reg-wrongAnswer.cfg](reg-wrongAnswer.cfg) | 提交类调用在中止后失败，答成「依据不可用」 | `HonestAnswer` |
| [reg-earlyGone.cfg](reg-earlyGone.cfg) | 不等在途的都结束就宣布撤下完成 | `GoneMeansSettled` |
| [reg-noObsEnd.cfg](reg-noObsEnd.cfg) | 撤下时不让观察结束 | 进展性质 |
| [reg-stuckAborted.cfg](reg-stuckAborted.cfg) | 收到中止的调用没有人处理 | 进展性质 |

`EveryObsEnds` 没有单独的负控。它在模型里由公平性直接保证。

## 可用性两端收敛模型

[Availability.tla](Availability.tla) 检查登记表变化、订阅、断线、重连与丢积压交错时，订阅者手里的协议集合。

有界范围：2 个协议，2 个订阅者，登记表最多改 3 次，每个订阅者的积压上限是 2，每个订阅者最多断线 1 次。

| 模型里的东西 | 含义 |
| --- | --- |
| `rev`、`hist` | 修订号，以及每个修订号上登记表的样子。`hist` 只在模型里有 |
| `queue[s]` | 服务端给一个订阅者排着的帧，有上限 |
| `view[s]` | 订阅者手里的修订号和集合 |

| 性质 | 说的是什么 | 对应的不变式 |
| --- | --- | --- |
| `ViewIsTruePast` | 订阅者的视图总是登记表在某个修订号上真实有过的样子 | I-6 |
| `DeltaBaseMatches` | 队头是变化帧时，它的基础正好是订阅者手里的那个修订号 | I-6 |
| `Converges` | 订阅着的订阅者最终看到的集合等于登记表，除非它又断开了 | I-6 |

安全配置是 [avail-correct.cfg](avail-correct.cfg)。三种改坏的做法共七份负控配置。一份配置只留一条要命中的性质，所以同一种改法有几份：

| 改坏了什么 | 负控与它必须失败的性质 |
| --- | --- |
| 读登记表和登记订阅者分成两步 | [avail-nonAtomicSubscribe.cfg](avail-nonAtomicSubscribe.cfg)：`DeltaBaseMatches`。[avail-nonAtomicSubscribe-nodelta.cfg](avail-nonAtomicSubscribe-nodelta.cfg)：`ViewIsTruePast`。[avail-nonAtomicSubscribe-liveonly.cfg](avail-nonAtomicSubscribe-liveonly.cfg)：`Converges` |
| 积压满了丢最旧的一帧，不改发快照 | [avail-dropOldest.cfg](avail-dropOldest.cfg)：`DeltaBaseMatches`。[avail-dropOldest-nodelta.cfg](avail-dropOldest-nodelta.cfg)：`ViewIsTruePast` |
| 重连时不发快照 | [avail-staleOnReconnect.cfg](avail-staleOnReconnect.cfg)：`DeltaBaseMatches`。[avail-staleOnReconnect-nodelta.cfg](avail-staleOnReconnect-nodelta.cfg)：`ViewIsTruePast` |

## 会话观察的定位与流模型

[SessionObservation.tla](SessionObservation.tla) 检查会话观察的两条轴：定位（看哪一次主调用）和流（那次调用的流现在怎样）。它问的是：提交、通知送达、按间隔刷新、一次定位、模型发布或撤回流、帧送达、流结束或中断以任何顺序交错时，观察者会不会漏掉一次提交、会不会把旧目标的帧发出去、会不会停在旧的调用上。

有界范围：最多 3 次提交，每次提交可以带来一次新的主调用；最多订阅 3 次。

| 模型里的东西 | 含义 |
| --- | --- |
| `logRev`、`logMain` | 会话日志的修订号；日志里最近一次主调用 |
| `notices` | 已经发出、还没送达的通知数。通知在提交的同一步发出 |
| `loc`：`idle`、`busy`；`flag` | 定位这条轴；「有新提交待看」的标记 |
| `readRev`、`readMain` | 进行中的这次定位读到的日志。它是定位开始时的日志 |
| `knownRev` | 观察者已经看到的修订号，也就是状态帧里的修订号 |
| `str`：`none`、`observing`、`rewait`；`target`；`sub` | 流这条轴；现在观察的主调用；现在这份订阅的编号 |
| `published` | 模型现在给出流的调用。发布和撤回是模型自己的事，随时可以发生 |
| `inFlight`、`stale` | 已产出还没送达的帧属于哪份订阅；发出过不属于现在这份订阅的帧 |

| 性质 | 说的是什么 |
| --- | --- |
| `QuiescentIsCurrent` | 不丢唤醒。定位空闲、没有在途的通知、标记没立着时，观察者看到的修订号就是日志的修订号 |
| `TargetIsLatest` | 不停在旧的调用上。同样安静下来时，目标要么没有，要么是日志里最近的主调用 |
| `NoStaleFrame` | 旧目标或旧订阅的帧不发出去 |
| `AxesAgree` | 两条轴对得上：没有目标当且仅当流那条轴在 `none` |
| `EventuallyCurrent` | 提交停下之后，观察者最终看到最新的修订号，并一直保持 |

安全配置 [obs-correct.cfg](obs-correct.cfg)：53,162 个不同的状态，没有发现错误。

| 改坏了什么 | 负控与它必须失败的性质 |
| --- | --- |
| 定位进行中来的通知不记下 | [obs-dropWhileBusy.cfg](obs-dropWhileBusy.cfg)：`QuiescentIsCurrent` |
| 迟到的旧帧不丢掉 | [obs-noDiscard.cfg](obs-noDiscard.cfg)：`NoStaleFrame` |
| 主调用换了、模型没给新的流时，留着旧目标 | [obs-keepOldTarget.cfg](obs-keepOldTarget.cfg)：`TargetIsLatest` |

这个模型的前提与没有建模的：

- 通知不丢。通知丢了由按间隔的刷新补上；流还在的时候不按间隔刷新，所以丢了的那次提交要等到流结束后的那次定位才看到。这是设计接受的：通知只是叫醒，已提交的内容由读历史给。
- 一次定位用的是它开始时的日志。实现里读日志发生在定位当中，只会读到更新的，不会更旧。
- 没有建模：次数与累计时长的上界、时钟、取消与撤权。取消与撤权对会话观察只是中止。

## 模型给实现的两条硬要求

前两个模型里各有一处必须是一步。分成两步，对应的负控就命中：

1. 查登记表和把调用登记成在途，中间不能让出执行权。分成两步，撤下的中止可能漏掉一个刚查完表的调用。
2. 读登记表得到快照和把订阅者登记上，中间不能让出执行权。分成两步，中间那次变化的帧就丢了。

在 JavaScript 里，这两处各是一段没有 `await` 的同步代码。

## 前提与没有建模的

- 处理函数要么正常完成，要么在收到中止之后失败。设计里这一条由管道守：中止之后过了宽限还没返回的处理函数，管道当它失败。处理函数因为别的原因失败不在模型里，它按操作契约里「只读或提交」的规则答，不涉及交错。
- 连接断开时，服务端一定丢掉这个订阅者和它的积压。
- 进展性质以公平调度为前提。
- 没有建模：时钟、心跳、请求预算、同一个调用被重发、帧的字节上限。

## 模型与设计步骤的对应

| 模型动作 | 设计里的步骤 |
| --- | --- |
| 登记表模型：查表并登记成在途 | `src/registry/registry.ts` 的 `enter`：同步方法，查表项、登记在途令牌、返回 `Entered` 在同一段里完成。签名由 `RegistryForPipeline` 钉住（`tests/registry.spec-d.ts`） |
| 登记表模型：处理函数开始、完成、失败 | `src/settle/settle.ts` 的 `settleCall`：第 10 步已中止则不调用处理函数（`started` 为假）；否则 `handled` 调用处理函数，`written` 核对结果集并用编解码写出，失败由 `failureOf` 按 `effect` 答；`graceExpiry` 在中止之后计宽限 |
| 登记表模型：撤下 | `AccessRegistryService.mount`（access-cordis-contract `src/cordis.ts`）把挂上包进调用者作用域的效应；卸载时调用 `src/registry/registry.ts` 的 `takeDown`：同步移除表项、`controller.abort()`、修订号加一并回调订阅者；返回的排空 Promise 在最后一个 `leave` 时由 `settleIfDrained` 完成。观察的结束帧归观察中枢，本程只验证排空等观察的 `leave` |
| 登记表模型：重新挂上 | `src/registry/registry.ts` 的 `mount`：同名同主版本已有表项时抛 `AccessAssemblyError`；旧的那一代排空中、表项已移除时可以再挂 |
| 可用性模型：登记表改一次 | `mount` 或撤下，修订号加一 |
| 可用性模型：订阅 | 登记表的 `subscribe` 同步返回快照并登记订阅者 |
| 可用性模型：写一帧、应用一帧 | 观察中枢给一个订阅者写可用性的帧；客户端的连接核对基础修订号之后应用 |
| 可用性模型：断线、重连 | 连接断开；客户端重新建立可用性观察，第一帧是快照 |
| 可用性模型：丢积压 | 观察中枢里这个订阅者的帧队列满了，清空队列，改发一帧快照 |
| 会话观察模型：通知送达 | 会话观察收到「这个会话有新的提交」。定位空闲就开始定位，进行中就立起标记 |
| 会话观察模型：一次定位结束 | 读日志得到修订号与最近的主调用；没有目标或主调用换了才向模型取流；标记立着就立刻再定位一次 |
| 会话观察模型：帧送达 | 流的订阅收到一帧。不属于现在这份订阅的丢掉 |
| 会话观察模型：流结束、中断、重新订阅 | 刷新策略的第 3 种与第 4 种触发 |

## 证明转契约测试

每条性质对应一条契约测试。右栏是去掉哪个检查或打乱哪个顺序，这条测试会变红。

| 性质 | 契约测试 | 变红的缺陷 |
| --- | --- | --- |
| I-3 同名至多一份 | 挂上同名同版本的协议第二次，报装配错误，第一份照常答复。`tests/registry.spec.ts`「挂上同名协议第二次报错，第一份照常答复」；真实 Cordis 上 `tests/registry-cordis.spec.ts` 第二条 | 去掉挂上时的同名检查 |
| I-4 中止送达每个在途的 | 调用登记成在途之后撤下协议，这个调用的中止信号被触发。`tests/registry.spec.ts`「调用登记成在途之后撤下协议，中止信号被触发」 | 撤下时不遍历在途集合；或查表与登记之间插入等待 |
| I-4 撤下完成时都已结束 | 撤下协议并等它完成，此时它的每个在途调用都已答复，每个观察都收到了结束帧。`tests/registry.spec.ts`「撤下并等它完成，此时每个在途调用都已答复」与「waits for an observation to leave as it waits for a call」；真实 Cordis 上 `tests/registry-cordis.spec.ts` 第一条。本程只验证排空等观察的 `leave`，写结束帧的那一半留给观察中枢那一程 | 撤下不等在途的结束 |
| I-4 进展 | 调用收到中止之后，在有界的步数内得到答复。`tests/settle.spec.ts`「处理函数不理会中止，过了宽限调用仍得到答复，撤下完成」 | 收到中止的调用不被处理 |
| I-8 提交类答「未知」 | 提交类操作的处理函数开始之后撤下协议并让处理函数失败，答复是 `unknown`。`tests/settle.spec.ts`「提交类操作的处理函数开始之后撤下并失败，答 unknown」 | 把这种情形答成 `basis-unavailable` |
| I-8 读取类与未开始的 | 读取类操作在中止后失败，答复是 `basis-unavailable`。处理函数还没开始就收到中止，答复是 `basis-unavailable`。`tests/settle.spec.ts`「answers basis-unavailable for a read operation that fails after the take-down」与「处理函数还没开始就收到中止，答 basis-unavailable」 | 交换这两种答复 |
| I-6 订阅不漏帧 | 订阅的同时挂上一个协议，订阅者最终的集合里有它。`tests/registry.spec.ts`「订阅的同时挂上一个协议，订阅者最终的集合里有它」（登记表这一侧） | 读表与登记订阅者之间插入等待 |
| I-6 积压满了改发快照 | 订阅者不读，登记表连续变化超过积压上限，订阅者恢复读取后得到一帧快照，集合等于登记表 | 积压满了丢最旧的一帧 |
| I-6 重连得到快照 | 断线期间登记表变化，重连后第一帧是快照，集合等于登记表 | 重连后只发后续的变化帧 |
| I-6 帧不错位 | 客户端收到基础对不上的变化帧时不应用，改为重新订阅 | 客户端不核对修订号就应用 |
| 会话观察不丢唤醒 | 一次定位读完日志、还没结束时，提交一次并送达通知。不等间隔，观察者发出带新修订号的状态帧 | 定位进行中来的通知不记下 |
| 会话观察不发旧帧 | 换目标之后让旧订阅再交来一帧，这一帧不出现在帧序列里 | 换目标时不收掉旧订阅，或不核对帧属于哪份订阅 |
| 会话观察不停在旧的调用上 | 观察中出现新的主调用登记而模型还没给它的流，观察者收掉旧目标，发状态帧与 `refreshing` | 主调用换了仍留着旧目标 |

最后一行是模型之外加的一道防线：模型说明服务端不会发出错位的帧，客户端仍然核对一次。

## 运行命令

在仓库根目录运行。`TLA2TOOLS_JAR` 指向项目钉住的 tla2tools.jar，环境见[开发指南的形式工具链](../../../../../docs/development.md#形式工具链)。

```bash
M=packages/access/server-entry/verification/models
for c in reg-correct reg-noUniqueness reg-noAbort reg-nonAtomicLookup reg-wrongAnswer reg-earlyGone reg-noObsEnd reg-stuckAborted; do
  java -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 4 -metadir "tmp/tlc-$c" -config "$M/$c.cfg" "$M/MCRegistry.tla"
done
for c in avail-correct avail-nonAtomicSubscribe avail-nonAtomicSubscribe-nodelta avail-nonAtomicSubscribe-liveonly avail-dropOldest avail-dropOldest-nodelta avail-staleOnReconnect avail-staleOnReconnect-nodelta; do
  java -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 4 -metadir "tmp/tlc-$c" -config "$M/$c.cfg" "$M/Availability.tla"
done
for c in obs-correct obs-dropWhileBusy obs-noDiscard obs-keepOldTarget; do
  java -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 4 -metadir "tmp/tlc-$c" -config "$M/$c.cfg" "$M/SessionObservation.tla"
done
```

三份安全配置（`reg-correct`、`avail-correct`、`obs-correct`）必须无错误退出。负控必须命中上表写的那条性质：命中不变量时退出码是 12，命中进展性质时退出码是 13。配置里关闭了死锁检查，因为全部调用答复之后没有后续动作，这是预期的终态。
