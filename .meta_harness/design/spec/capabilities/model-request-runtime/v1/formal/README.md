# formal：一次调用 × 多次发出 × 停机 × 中断

属于 `capability.model-request-runtime` v1 的规范工件。**这里只写模型表达了什么、每条断言对应哪条条款、成立的前提、模型吸收了什么**；
执行记录与结果在[验证入口](../../verification.md)，不写在版本目录里。

## 模型

[`Invocation.tla`](Invocation.tla)：**一次调用**，在进程停机、新的执行尝试、用户中断、宿主停止的交错下，经历 0 到 `MaxDispatch` 次发出。

| 模型里 | 契约里 | 停机之后 |
|---|---|---|
| `out[d]` | 「已出门」锚点（[S-8](../contract.md#s-8-调用在会话日志里留下的六种记录)、[S-15](../contract.md#s-15-两个锚点先写后行)） | 保留 |
| `spokeA[d]` | 「已开口」锚点 | 保留 |
| `nbody[d]`、`outcome[d]`、`bft[d]` | 这次发出的响应体：条数、收场、有没有首 token | 保留 |
| `intent` | 中断意图（[S-31](../contract.md#s-31-interrupt)） | 保留 |
| `callEnd` | 调用终结记录：`undispatched`／`handed_up`／`interrupted` | 保留 |
| `sent[d]`、`seen[d]` | **外部事实**：请求到了线上；内容交给了观察者。不可撤回 | 保留（发生了就是发生了） |
| `phase`、`aborting`、`td`、`stopped` | 本能力手里的在途状态：调用状态、已发中止信号、宿主撤除待结算的那次发出、宿主在停止中 | **丢失** |
| `nd` | 发出次数；停机后按耐久事实重新推出（最后一个有锚点或有响应体的序号） | 重算 |
| `attempt`、`att[d]` | 当前执行尝试；每次发出落在哪次尝试 | 对账时加一 |

**动作**：`OpenPass`／`OpenFail`（出门前检查，[S-28](../contract.md#s-28-opencall)）· `Dispatch`（首次或续接，[S-29](../contract.md#s-29-dispatch)）· `DispatchAgain(p)`（[S-30](../contract.md#s-30-dispatchagain)，`p` 是计划里的那一家，由非确定选择给出）·
`Send` · `FirstToken`／`Deliver` · `Complete`／`FailBefore(策略类|事实类)`／`FailAfter` · `Release`（[S-32](../contract.md#s-32-releasecall)）· `Interrupt(i)`／`Abort`（[S-31](../contract.md#s-31-interrupt)）·
`HostStop`／`TeardownWrite`（[S-36](../contract.md#s-36-宿主停止与撤除)）· `Crash` · `Reconcile`（[S-33](../contract.md#s-33-reconcile)，逐行照对账表）。

**五个开关**，正向配置全开，每份否定配置恰拧反一个：

| 开关 | 契约条款 | 关掉之后的样子 |
|---|---|---|
| `OutFirst` | [S-15](../contract.md#s-15-两个锚点先写后行) 第一行 | 请求先出网，锚点后写；其间可以停机 |
| `SpokeFirst` | [S-15](../contract.md#s-15-两个锚点先写后行) 第二行 | 内容先交给观察者，锚点后写；其间可以停机 |
| `IntentFirst` | [S-31](../contract.md#s-31-interrupt) ④⑧ | 先发中止信号、不写意图就回答调用方 |
| `GuardOn` | [S-29](../contract.md#s-29-dispatch) ③、[S-30](../contract.md#s-30-dispatchagain) 守卫 2、3 | 开过口、事实类失败之后仍可再发 |
| `IdempotentSettle` | [S-17](../contract.md#s-17-结算一处按序幂等先到者赢) | 结算不先看这次发出是否已有响应体 |

## 配置与它检查什么

**登记为 formal task 的两份**（预期退出 0、无反例）：

| 配置 | 常量 | 检查 |
|---|---|---|
| [`Invocation.cfg`](Invocation.cfg) | 2 家、允许回退、至多 3 次发出、至多 2 次停机；五个开关全开 | 下表全部不变量 ＋ 进展性质 `SentEventuallySettled`；另有死锁检查（TLC 缺省开） |
| [`Invocation_NoFallback.cfg`](Invocation_NoFallback.cfg) | 同上，但**不允许回退** | 同上；`ProviderAllowed` 在这里约束「每一次都是第一家」 |

| 不变量 | 条款与性质 | 会在什么时候失败 |
|---|---|---|
| `AtMostOneBodyPerDispatch` | [S-17](../contract.md#s-17-结算一处按序幂等先到者赢)：先到者赢，同一次发出至多一条响应体 | 两个结算方各写一条 |
| `BodyOnlyForAnchored` | [S-8](../contract.md#s-8-调用在会话日志里留下的六种记录)：只有出了门的发出才有响应体 | 给没有「已出门」的发出写了响应体 |
| `EverySentIsAnchored` | [S-15](../contract.md#s-15-两个锚点先写后行) 第一行 | 出了网的请求在进程丢失之后没有锚点 |
| `EverySeenIsAnchored` | [S-15](../contract.md#s-15-两个锚点先写后行) 第二行 | 被看见的内容在进程丢失之后没有锚点 |
| `NoDispatchAfterSpoke` | [S-22](../contract.md#s-22-同一次调用的发出序列) 第 4 条、[S-30](../contract.md#s-30-dispatchagain) 守卫 2：**开口之后同一次调用不再发出，跨尝试** | 开过口的调用又有一次发出 |
| `NoDispatchAfterSeen` | 同上的可观察形式：**一个逻辑回复只发一次** | 用户看过内容之后，同一次调用又有请求上了线 |
| `ContinuationOnlyAfterStrategyOrSilentLoss` | [S-22](../contract.md#s-22-同一次调用的发出序列) 第 3 条：只在策略类故障或首 token 之前失联之后再发（含终态之后、事实类之后不发） | 在别的收场之后又发了一次 |
| `BodyFirstTokenMatchesAnchor`、`CauseMatchesFirstToken` | [S-16](../contract.md#s-16-首-token-判据)、[S-18](../contract.md#s-18-成因按来源分类三类事实由守卫兑现)：`interrupted_mid_reply` ⇔ 有首 token 的故障 | 响应体上首 token 的有无与锚点不符 |
| `ProviderAllowed`、`FirstDispatchFirstProvider`、`ResumeSameProvider` | [S-22](../contract.md#s-22-同一次调用的发出序列) 第 2、3、5 条 | 发给了不允许的家；首次不是第一家；续接换了家 |
| `ContiguousDispatches`、`AttemptMonotone` | [S-5](../contract.md#s-5-一次调用一次发出)：发出序号跨尝试连续；尝试号属于每一次发出、不倒退 | 停机之后序号跳了或重了 |
| `UndispatchedHasNoDispatch` | [S-28](../contract.md#s-28-opencall) | 出门前检查不过的调用有了发出 |
| `AtMostOneTerminal` | [S-6](../contract.md#s-6-调用的状态) | 调用终结记录与一条终态响应体并存 |
| `NoDispatchAfterInterrupt`、`InterruptNotMisregistered` | [S-31](../contract.md#s-31-interrupt)：**用户叫停之后不再发出；被叫停的那次发出不被记成失联** | 停机之后对账把叫停的调用当成失联续接 |
| `QuiescentSettled` | [S-33](../contract.md#s-33-reconcile)、[S-39](../contract.md#s-39-依赖不可用撤除与重启)：**失联的发出被追补，不被遗忘** | 调用结束了，线上有过的一次发出却没有响应体 |

| 进展性质 | 条款 | 前提 |
|---|---|---|
| `SentEventuallySettled`：每一次上了线的发出终将有一条响应体 | [第八节进展性质](../contract.md#进展性质全部有界) 第一行 | 对 `Progress`（出网、首 token、四种收场、中止、撤除结算、对账）弱公平——**即「上游终将收场或被时限判定」「停机之后终有下一次尝试」**；停机次数有界 |

**不登记、另作有效性检查的配置**（每份预期**出反例**，退出 12；它们证明上面的断言在对应开关拧反时确实会失败）：

| 配置 | 拧反的开关 | 预期被违反的不变量 | 预期的反例形状 |
|---|---|---|---|
| [`Invocation_Validity_NoGuard_Spoke.cfg`](Invocation_Validity_NoGuard_Spoke.cfg) | `GuardOn = FALSE` | `NoDispatchAfterSpoke` | 开口 → 断流 → 再发 |
| [`Invocation_Validity_NoGuard_Fact.cfg`](Invocation_Validity_NoGuard_Fact.cfg) | `GuardOn = FALSE` | `ContinuationOnlyAfterStrategyOrSilentLoss` | 事实类失败 → 再发 |
| [`Invocation_Validity_SpokeAfterObserve.cfg`](Invocation_Validity_SpokeAfterObserve.cfg) | `SpokeFirst = FALSE` | `NoDispatchAfterSeen` | 内容被看见 → 停机 → 对账当成没开口 → 续接再发 |
| [`Invocation_Validity_SendBeforeAnchor.cfg`](Invocation_Validity_SendBeforeAnchor.cfg) | `OutFirst = FALSE` | `QuiescentSettled` | 出网 → 停机 → 对账找不到这次发出 → 那笔账消失 |
| [`Invocation_Validity_AbortBeforeIntent.cfg`](Invocation_Validity_AbortBeforeIntent.cfg) | `IntentFirst = FALSE` | `NoDispatchAfterInterrupt` | 用户叫停 → 停机 → 对账当成失联 → 续接再发 |
| [`Invocation_Validity_NonIdempotentSettle.cfg`](Invocation_Validity_NonIdempotentSettle.cfg) | `IdempotentSettle = FALSE` | `AtMostOneBodyPerDispatch` | 宿主停止 → 正常收场先写 → 撤除结算又写一条 |
| [`Invocation_Reach_ResumeThenComplete.cfg`](Invocation_Reach_ResumeThenComplete.cfg) | 无（全开） | `NotResumeThenComplete`（可达性见证） | 失联 → 对账 → 新尝试里续接 → 完成：**续接这条路走得通** |
| [`Invocation_Reach_FallbackThenComplete.cfg`](Invocation_Reach_FallbackThenComplete.cfg) | 无（全开） | `NotFallbackThenComplete`（可达性见证） | 第一家策略类失败 → 第二家完成：**换家这条路走得通** |

## 模型吸收了什么——不写成「已由模型覆盖」

- **写下一条响应体是一个原子动作**：追加口的原子性、按 `ResponseId` 的幂等、回复消息与响应体同一提交，模型里都是「一步」。它们的证据在集成测试（[验证入口](../../verification.md)），**不在这里**。
- **上游只以四种方式收场**：完成、首 token 之前的策略类故障、首 token 之前的事实类故障、首 token 之后的故障。**成因分类表的内容、状态码映射、空回复归哪类都不在模型里**。
- **不含拓展件与 loop**：`DispatchAgain` 的调用与它的计划是非确定选择，守卫是唯一约束；`Release` 随时可做。「默认件在有限步内试尽」不在模型里（它是一个纯函数，见 [S-35](../contract.md#s-35-默认重试件可替换) 的场景）。
- **不含凭据、脱敏、投影、合法目标**：这些没有交错。
- **一次调用**：两次调用之间的交互（同一会话里的切换、并发的两次调用）不在模型里；切换不作用于在途调用由 [S-7](../contract.md#s-7-一次调用绑定了什么) 的绑定兑现，证据是场景 [S-43](../contract.md#s-43-切换先落事实后生效)。
- **常量很小**：至多 3 次发出、2 家、2 次停机。结论只对这个范围成立，**不是无条件证明**。
