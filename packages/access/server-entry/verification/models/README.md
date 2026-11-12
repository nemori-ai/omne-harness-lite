# 接入登记表与可用性的有限行为模型

本页维护两个 TLA+ 模型的范围、性质、负控、前提与运行命令。设计依据是 [RFC-0015](../../../../../docs/rfcs/RFC-0015-access-dynamic-registration.md)。模型先于实现：下面「模型与设计步骤的对应」的右栏写的是设计里的步骤，成员实现这些步骤之后，右栏改成文件与函数。

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

## 模型给实现的两条硬要求

两个模型里各有一处必须是一步。分成两步，对应的负控就命中：

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
| 登记表模型：查表并登记成在途 | 管道的判断次序里「进入协议」那一步。登记表的 `enter` 同步完成查表和登记 |
| 登记表模型：处理函数开始、完成、失败 | 管道把调用交给贡献里的处理函数，写回答复 |
| 登记表模型：撤下 | 接入插件的 Cordis 作用域卸载：移除表项，给每个在途调用发中止，让每个在途观察结束，等它们都结束 |
| 登记表模型：重新挂上 | 接入插件再次加载，登记表的 `mount` |
| 可用性模型：登记表改一次 | `mount` 或撤下，修订号加一 |
| 可用性模型：订阅 | 登记表的 `subscribe` 同步返回快照并登记订阅者 |
| 可用性模型：写一帧、应用一帧 | 观察中枢给一个订阅者写可用性的帧；客户端的连接核对基础修订号之后应用 |
| 可用性模型：断线、重连 | 连接断开；客户端重新建立可用性观察，第一帧是快照 |
| 可用性模型：丢积压 | 观察中枢里这个订阅者的帧队列满了，清空队列，改发一帧快照 |

## 证明转契约测试

每条性质对应一条契约测试。右栏是去掉哪个检查或打乱哪个顺序，这条测试会变红。

| 性质 | 契约测试 | 变红的缺陷 |
| --- | --- | --- |
| I-3 同名至多一份 | 挂上同名同版本的协议第二次，报装配错误，第一份照常答复 | 去掉挂上时的同名检查 |
| I-4 中止送达每个在途的 | 调用登记成在途之后撤下协议，这个调用的中止信号被触发 | 撤下时不遍历在途集合；或查表与登记之间插入等待 |
| I-4 撤下完成时都已结束 | 撤下协议并等它完成，此时它的每个在途调用都已答复，每个观察都收到了结束帧 | 撤下不等在途的结束 |
| I-4 进展 | 调用收到中止之后，在有界的步数内得到答复 | 收到中止的调用不被处理 |
| I-8 提交类答「未知」 | 提交类操作的处理函数开始之后撤下协议并让处理函数失败，答复是 `unknown` | 把这种情形答成 `basis-unavailable` |
| I-8 读取类与未开始的 | 读取类操作在中止后失败，答复是 `basis-unavailable`。处理函数还没开始就收到中止，答复是 `basis-unavailable` | 交换这两种答复 |
| I-6 订阅不漏帧 | 订阅的同时挂上一个协议，订阅者最终的集合里有它 | 读表与登记订阅者之间插入等待 |
| I-6 积压满了改发快照 | 订阅者不读，登记表连续变化超过积压上限，订阅者恢复读取后得到一帧快照，集合等于登记表 | 积压满了丢最旧的一帧 |
| I-6 重连得到快照 | 断线期间登记表变化，重连后第一帧是快照，集合等于登记表 | 重连后只发后续的变化帧 |
| I-6 帧不错位 | 客户端收到基础对不上的变化帧时不应用，改为重新订阅 | 客户端不核对修订号就应用 |

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
```

两份安全配置必须无错误退出。负控必须命中上表写的那条性质：命中不变量时退出码是 12，命中进展性质时退出码是 13。配置里关闭了死锁检查，因为全部调用答复之后没有后续动作，这是预期的终态。
