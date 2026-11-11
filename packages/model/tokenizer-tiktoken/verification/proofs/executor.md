# 执行器与私有缓存的安全证明

本文是人工归纳证明。尚无 TLAPS 或其他机器演绎检查。独立审阅状态由交付记录给出，本文不授予实现接受。TLC 只检查实际配置的有限状态。行为对象是 [Executor](../models/executor/Executor.tla) 和 [PrivateCache](../models/cache/PrivateCache.tla)，契约来自 [SPEC](../../SPEC.md)。

## 定义域与命题

执行器参数 `LeaseCount`、`JobCount`、`MaxLeases`、`MaxGeneration` 为正整数，队列三个限额为非负整数。一次取得分配一个尚未使用的 lease 身份，一次计数分配一个尚未使用的 job 身份。身份资源可以耗尽，耗尽时没有准入动作。模型只含一个物理槽。`Owner(j)` 是 job 的固定 lease，证明只依赖它是从 Jobs 到 Leases 的全函数，不依赖公式中的取模。

`st.physical` 表示仍然占用物理线程的 job。`st.answer` 表示已给调用者的结果。`st.cancelled` 是只供证明使用的历史集合。`st.cache` 保守表示可能残留文本的 lease。计数一开始就把 lease 放入其中，因此实际未缓存也不会使释放证明变弱。`st.queue` 不表示排队顺序，只表示等待集合。模型的job权重由TestWeight取1或2，任意真实字节权重的界另由下文相同加减式的组合论证承接。`st.gen` 是当前线程代际。`initialized`表示当前物理worker是否已经完成初始化。GenerationFence要求可派发的idle、counting、clearing槽必须有这个物理事实。

令 `I` 为 `TypeOK ∧ Structure ∧ PhysicalCapacity ∧ NoLateSuccess ∧ ReleaseComplete ∧ Bounded ∧ GenerationFence ∧ ClosedEmpty`。关闭三项 `Bad*` 后，命题是 `Spec ⇒ []I`。这覆盖任意满足参数前提的有限身份集合、限额和有限代际数。对任意有限执行前缀，可选择足够大的这些集合。该结论仍是模型命题，不是 TypeScript 精化证明。

缓存的 Leases、Pieces 是非空有限集合。`Weight(p)` 是非负整数。四项容量是非负整数。令 `C` 为 `TypeOK ∧ Bounded ∧ Room ∧ PrivateHit`。关闭 `BadShare` 后，命题是 `Spec ⇒ []C`。`Weight` 在实际映射中取 `2 * piece.length + 256`。有限配置用 2 和 3 代表不同权重，并检查零缓存。缓存证明不依赖具体权重值。

## 执行器初始态

`Init` 使全部 lease 未使用，全部 job 未使用，queue、physical、cache、cancelled 都为空。worker 在 starting，host 在 open，gen 为 1。所有有限集大小和字节和均为零，答复为 none。因而类型、上下文结构和所有界成立。没有 released lease、成功答复或 closed host，三个蕴含性质成立。initialized为FALSE，但starting尚不可派发，所以GenerationFence成立。故 `Init ⇒ I`。

## 执行器归纳步

假定某一步前 `I` 成立。下面覆盖 `Next` 的全部动作。表中没有列出的字段由记录 `EXCEPT` 保持。

| 动作 | 对 `I` 的保持证明 |
| --- | --- |
| `Ready` | 当前worker完成初始化并交付Ready时，把initialized设TRUE，再把 starting 改为 idle。`PhysicalCapacity` 在 starting 时已要求 physical 为空。动作要求 host=open，因此不破坏关闭结构。 |
| `Acquire(l)` | 前提是未用身份、open、非停止/死亡槽和 `Live` 大小严格小于上限。只增加一个 active lease，所以租约界保持。未改变任何已释放 lease、任务、缓存或答复。 |
| `Submit(j)` 立即执行分支 | idle 经 `PhysicalCapacity` 推出 physical 为空。只增加一个未用 job，故大小为 1；将 worker 改成 counting。Owner 必须 active。答复 pending，cancelled 中不存在该未用 job。queue 不变，故所有队列界保持。增加的 cache owner 是 active，保留 `Structure`。 |
| `Submit(j)` 排队分支 | 三个准入比较分别给出加入后的全局数量、字节和、该 lease 数量上界。`Weight` 非负。只增加未用 job，物理集合不变；Owner active。没有改变成功或取消结果。 |
| `Dispatch(j)` | 从 queue 删除一个 job，只减小队列界。idle 保证 physical 为空，随后加入恰好一个 job 并进入 counting。Owner active，所以加入 cache 不引入 released owner。 |
| `Cancel(j)` | 从 queue 删除该 job并记 failed、加入 cancelled。关闭 BadEarlyReturn 时 worker 和 physical 不变。因此取消答复不会释放槽；`NoLateSuccess` 对新增成员成立，对其他成员不变。 |
| `Release(l)` | active 改成 releasing，Live 大小不变。只删除该 lease 的排队 job，把仍在队列或物理集合中的本 lease job记 failed并加入 cancelled。物理集合不变。dead 分支直接 released；`Structure` 已保证 dead 的 cache、physical 为空，queue 中该 lease 的 job 又被本动作删除，所以 `ReleaseComplete` 成立。 |
| `Counted(j)` | 从 physical 删除唯一 job并转 idle。正常动作仅在旧答复 pending 且 lease active时给 ok。`NoLateSuccess` 把全部 cancelled 的旧答复固定为 failed，所以任何 cancelled job都不满足成功条件。其他答复不变。尚未清除的 cache仍属于 active或releasing lease。 |
| `ClearStart(l)` | idle 时 physical为空，目标 lease为releasing。动作只记录 clearing和clear=l，故 `Structure` 的清理前提成立。 |
| `ClearAck` | `Structure` 给出clear是releasing lease。`PhysicalCapacity` 在clearing时排除物理任务；queue的owner必须active，因此没有该lease的排队任务。动作删除该lease的cache，然后标released，满足 `ReleaseComplete`。其他lease的cache不变。 |
| `Stop` | 把物理集合中全部job答复改failed并加入cancelled，worker进入stopping。physical与cache保留，故物理占用和释放保证保持。 |
| `Exit` | 只有实际退出事件移除全部physical和cache，同时清除当前worker的initialized。被移除的物理job记failed；所有releasing lease变released。若替换，queue仅含active lease，因此不会留下属于新released lease的任务；gen只在小于上限时加1。若不替换，queue全部失败并清空。替换只在host=open发生，关闭结构保持。 |
| `OldReady(messageGen)` | 只考察messageGen小于当前gen且新槽仍starting的旧Ready。消息环境允许故障注入产生旧代际消息，不声称Node必然会这样投递。正常动作保持全部字段。故它不能使尚未完成初始化的新worker变成可派发槽。BadStale会只把worker设idle，initialized仍FALSE，GenerationFence随即给出真实状态矛盾。这一动作仅覆盖stale-ready，不声称验证了每种reply的job/lease匹配。 |
| `Close` | 同步把host改closing，删除所有排队任务，物理任务保留且答复失败。所有active lease改releasing；如果槽已dead，则直接released，此时physical与cache已经为空。没有新任务或新缓存，因此关闭结构和资源界保持。 |
| `CloseDone` | 前提明确要求dead且Live为空。`Structure` 给出physical、cache为空，非open给出queue为空。因此将host改closed后 `ClosedEmpty` 成立。 |
| stuttering | 所有状态不变，`I`保持。重复release或close在本抽象中是这个动作。 |

上表用到未用 job不在cancelled。其归纳理由如下。Init两者都为空。只有Submit增加used。Cancel、Release、Stop、Exit、Close只将queue或physical中的job加入cancelled；这两个集合始终属于used。没有动作移除used。因此 `cancelled ⊆ used`。把这个辅助式加入 `Structure` 后，表给出 `I ∧ Next ⇒ I'`。按状态序列长度归纳得到命题。

## 缓存初始态与归纳步

Init使每份cache为空、phase为idle、lastHit为空。空和为零，`Bounded`成立，`Room`和`PrivateHit`的条件不触发，类型成立。

1. `Hit(l,p,owner)` 在正常模型只允许owner=l。它只记录这两个身份，所以 `PrivateHit` 成立。实际命中更新LRU顺序但不改变成员、权重或所属lease，抽象为同一步。
2. `BeginStore(l,p)` 要求本lease没有p、单片权重不超过两级字节界、两级条数界大于零。它只固定pending和phase，所以Bounded不变，Room的第一项成立。
3. `EvictLocal(p)` 删除当前lease中的一个真实成员。非负权重使全局和局部大小及字节和均不增加。pending片本来不在目标cache，因此删除操作不会破坏Room。
4. `LocalDone` 只有在LocalFull为假时进入global，所以建立Room的第二项。没有插入或增加字节。
5. `EvictGlobal(l,p)` 删除一个真实成员。全局界和每个局部界均不增加；当前pending lease的局部可用空间也不会变小，所以Room保持。
6. `Commit` 由Room得局部条数严格小于上限且加pending权重不超局部字节界。由非GlobalFull得相同的全局比较。Room还给出pending不在本lease，所以插入精确增加一条及其权重。由这四项算术得Bounded，随后phase=idle使Room不再限制pending。
7. `Clear(l)` 只把 `cache[l]` 置空。非负权重保持界。对任意k≠l，记录更新的函数语义给出 `cache'[k]=cache[k]`，因此清本lease不会删除其他lease贡献。它不改变lastHit。
8. `Exit` 使全部cache为空且phase=idle，重新满足零资源状态。物理线程整体退出本来就销毁此线程的全部lease缓存，不能把该动作说成只清一份lease。
9. stuttering保持全部性质。

以上覆盖Next全部分支，得到 `C ∧ Next ⇒ C'`。数学求和的删除与插入等式来自有限集合求和定义，和CHOOSE的遍历顺序无关。归纳得到 `Spec ⇒ []C`。本证明使用实际删除循环和提交前比较，没有假定“淘汰结果已经有界”。

## 有条件的进展

安全证明不需要公平性或OS退出保证，也不保证线程最终结束。

缓存淘汰在成功BeginStore后可终止。若LocalFull成立而目标cache为空，单片字节和正条数前提会使LocalFull为假，矛盾，所以必有可删成员。每次EvictLocal将有限条数减1。进入global后同理，GlobalFull时必有全局成员可删。每次EvictGlobal减1。假定这些启用的本地动作被调度，最终Commit可执行。LRU只决定删除哪个成员，不影响这个终止或安全论证。零容量使BeginStore不启用，对应直接返回未缓存的计数。

executor.close的条件性终止依赖所有存活worker的实际Exit最终到达、宿主回调继续被调度。Close之后不再替换，所以对有限槽集合，最后一个Exit之后CloseDone可执行。普通release还依赖counted或Exit最终到达，以及clear ACK或Exit最终到达。`cancellationGraceMs`到期和clear超时只发起stop，不能代替Exit。模型把时间抽象为事件，不证明25ms、截止精准度或Node定时器公平性。

## 多槽组合与界限

每份lease固定一个槽，worker不跨槽迁移缓存。给各槽状态添加不相交槽标识后，各槽的physical不变量可逐槽应用，因此物理job总数≤worker数。替换前等待该槽Exit，不能增加同时存活的槽实例。

全局队列与live-lease计数由主线程唯一Executor同步更新。全局准入比较与增量之间没有await。本模型的加1/减1或加减Weight就是这些线性化步骤。令真实输入权重为任意非负整数w，令Q为全部槽等待job的不相交并集。初态sum(Q)=0。只有count排队增加一项j，且先检查sum(Q)+w(j)≤字节界、|Q|+1≤数量界。dispatch、removeQueued和failQueued只删除真实成员，各减去其原始权重且最多一次。其余动作不增加Q。因此对更新次数归纳，任意槽数量和真实权重均保持全局界；立即dispatch的分支不形成可观察的排队状态。不同槽不能各自使用一份未经扣减的全局预算。这个对应仍需源码核对，不是JavaScript事件循环或编译器证明。

每worker缓存预算为 `floor(total/workers)`。由 `workers * floor(total/workers) ≤ total` 得全池界。每lease只在一槽，其局部界不乘以worker数。普通任务调度顺序在模型中被放宽为任意符合条件的job；这覆盖安全交错，未证明轮转公平或饥饿上界。滚动一分钟替换频率、真实RSS、词表算法、regex分区正确性、缓存tokens值与BPE等价、跨租户授权及完整应用性能都未由本模型证明。
