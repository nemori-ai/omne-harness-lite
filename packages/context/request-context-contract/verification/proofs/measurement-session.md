# 计量会话的安全证明

本文是待独立审阅的人工归纳证明，没有机器演绎检查。行为对象是 [MeasurementSession](../models/measurement-session/MeasurementSession.tla)，依据是 [SPEC RQ-05](../../SPEC.md#rq-05-完整预算与候选完成)。若契约锚点变化，以SPEC内RQ-05正文为准。既有replay与compaction模型不被这份模型替换。

## 定义域与命题

Requests和Entries是非空有限身份集合，Keys是完整profile与规范lineage组成的值集合。每份请求、每份entry在模型中只创建一次，集合大小可取任意正整数。这个有限身份边界限制一次TLC搜索可发起的总请求数，不是产品会话的总请求限制。Capacity和PendingCap为正整数，实际值分别为4和8。

externalKey与externalBody表示调用者可任意更改的值。Begin在进入异步工作前同时取得snapKey与snapBody。key固定在新entry上。acquiredKey记录实际传给preparation.acquire的值，measuredBody记录传给rules.plan/meter的候选输入来源。具体profile、lineage、assembled都是普通数据记录，分别被这些值抽象。access身份由会话闭包持有；Keys不包含principal序列化或由principal推断的共享资格。

`Pending`包含choosing、waiting、measuring、cleanup四种请求。`Users(e)`仅包含仍等待取得或正在计量的使用者。cleanup请求仍占Pending限额，但不再读租约。`Retained`是registered且reusable的entry。正在取得的Promise也占Retained；一次性entry可以registered，但不占Retained。

令 `I = TypeOK ∧ Structure ∧ Bounded ∧ ExactKey ∧ ProbeSnapshot ∧ BusyNotReleased ∧ SharedAcquire ∧ ClosedDrained ∧ FailureVisible`。关闭三个Bad开关后，命题是 `Spec ⇒ []I`。证明覆盖参数化的有限集合和任意正Capacity、PendingCap，不从两个请求的TLC结果推断4/8边界被穷尽。

## 初始态

Init使所有请求和entry都unused，chosen为0，registered、reusable和failure均为FALSE，result为none，host为open。Pending、Users、Retained为空，所有界成立。没有已取得的租约、measuring请求、已释放的忙租约或重复注册key。ClosedDrained、FailureVisible都不触发。所有值在声明的类型中，所以Init蕴含I。

## 每个动作保持I

| 动作 | 推导 |
| --- | --- |
| `Mutate(k,b)` | 只更改externalKey和externalBody，仍在类型内。snap、entry key、acquiredKey和measuredBody都不变，所以快照及资源性质保持。 |
| `Begin(r)` | 仅open且Pending数量严格小于上限时接纳unused请求。它只增加一个Pending，固定snapKey和snapBody，进入choosing且chosen仍为0。没有创建或使用租约，不改变Retained。 |
| `Existing(r,e)` | 只选择registered且key等于snapKey的entry。Structure保证该entry处于acquiring或acquired，因此增加一个Users不会使用已释放对象。请求从choosing变waiting，Pending大小不变。没有创建第二个相同key，也不改变预算。 |
| `Create(r,e,0)` 有复用空间 | e必须unused且没有同key注册项。Retained大小小于Capacity时，新entry的reusable为TRUE，增加恰好一个Retained。请求成为waiting，Pending不变，key从snapKey复制。尚未acquire，ExactKey不触发。 |
| `Create(r,e,0)` 全忙溢出 | 没有闲置可淘汰项且Retained已经满时，新entry的reusable为FALSE，所以不增加Retained。它仍受同一个已接纳请求的Pending计数约束。registered允许后来的同key请求共享该Promise，SharedAcquire由无同key前提保持。 |
| `Create(r,e,victim)` 淘汰 | 要求Retained已满、victim已取得且Users为空。动作同时取消旧项registered/reusable、将旧项releasing，并创建一份reusable新项。因此Retained净变化为零，BusyNotReleased对victim成立。新entry记录blockedBy=victim，暂不调用acquire。其他忙entry不变。 |
| `Acquire(e)` | 只在acquiring且没有victim或victim已released时执行。正常动作将acquiredKey设为entry固定key，所以新触发的ExactKey成立。此前registered项仍合法。动作不增加请求、Users或Retained。 |
| `AcquireFail(e)` | 同样等待victim释放，然后进入failed、取消registered/reusable并记录failure。没有取得实际租约，failed不是待release的资源。已有等待请求仍在Pending中，故关闭不能越过它们。 |
| `Measure(r)` | 只有waiting请求及acquired entry才能进入measuring。正常动作把snapBody赋给measuredBody，因此ProbeSnapshot成立。waiting与measuring都属于Users和Pending，计数不变。 |
| `Finish(r,bad)` 保留项 | 如果entry仍可复用且本次未失败，请求转done。Users和Pending各减一，租约继续registered/acquired。类型、容量、key和快照性质不变。 |
| `Finish(r,bad)` 退休但尚有使用者 | 失败将reusable与registered清除，并记录failure。其他已开始的使用者仍持有原entry，phase保持acquired，所以不会提前释放。当前请求转done并减Users。一次性entry在非最后使用者完成时同理，registered可继续共享到最后一个使用者离开。 |
| `Finish(r,bad)` 最后一次使用 | 非复用entry且旧Users恰为1时，当前请求转cleanup，phase改releasing并移除registered。新Users为空，所以BusyNotReleased成立。cleanup仍属于Pending，因此close须继续等待。对acquire失败的entry不需要release，请求直接done。 |
| `ReleaseDone(e,bad)` | 前态phase为releasing，由BusyNotReleased得Users为空。registered已为FALSE且不再允许Existing加入。动作记录release结算为released；失败时failure为TRUE。它不将cleanup请求提前done。released表示release Promise已结算，可含失败，不代表底层物理资源必然成功清理。 |
| `CleanupDone(r)` | 只在关联release已结算后，把cleanup变done，减少Pending。没有新增使用者或取得资源。 |
| `Close` | 只把host改closing。Begin从此不再启用。已经接纳的请求仍能选择、取得、计量和清理，Pending保持真实在途集合。 |
| `CloseRelease(e)` | 只有closing且Pending为空时进入。由Users定义推出Users为空，然后将一个acquired entry改releasing并删除注册。不会淘汰正在使用的租约。 |
| `CloseDone` | 明确要求Pending为空，全部entry都unused、failed或released，随后host变closed，所以ClosedDrained成立。若failure为TRUE，只能返回failure，因此FailureVisible成立。 |
| stuttering | 状态不变，I保持。重复关闭请求在抽象中不再新增资源。 |

类型保持来自集合内取值和记录局部更新。`Structure`的各项也由表保持。registered只能由Create引入，此时phase为acquiring；所有进入failed、releasing、released的动作同步删除registered。reusable只有Create可设TRUE，同时设registered。waiting/measuring只能由Existing、Create、Measure产生，其chosen有效且entry尚未释放；进入releasing只可能发生在Users空时。cleanup只由最后使用者开始release产生。请求一旦离开unused，不再改snap。result只由CloseDone写入，hostclosed后没有产生failure的新动作。这些事实给出 `I ∧ Next ⇒ I'`。按状态序列长度归纳得到命题。

## Key的意义与源码对应义务

模型里的key是完整值，比较是精确相等。源码使用完整profile与lineage的canonical字符串作为Map键，不使用摘要哈希，也不把assembled放进复用键。不同assembled在同一租约上仍重新plan和measure。证明要求canonical在公开数据定义域内无歧义，并与采用的lineage规范化一致。若未支持值、getter或非普通数据进入此路径，不能直接套用这个值模型。

Begin同时快照profile、lineage和assembled。创建entry后即使等待旧lease释放，也只把该快照中的profile和lineage交给acquire。为此，快照必须在canonical之前完成，并且use、entry、measureWithLease都消费同一份自有值。不能在key处快照一次、acquire处另读调用方对象。

同key共享仅复用准备租约和该租约取得时的facts。模型不把权限、资格判断或预算缓存为key的结果。每个请求都有独立Measure动作。Model必须兑现每份lease的取得、快照与release承诺；RQ不能凭自己的Map证明Model或tokenizer已清理物理资源。

## 关闭、失败和有条件进展

安全结论是“close完成前全部已接纳probe和release已结算”。底层release返回失败时，模型将failure置TRUE，最终结果不为ok。它不把失败的release当成成功清理。原操作已有失败时保留其原失败类型的优先级，由withMeasurementSession的实现与行为测试承接，本模型只证明不会覆盖成成功。

无公平性时允许永远等待acquire、measure或release。若全部这些外部Promise最终结算、宿主继续调度，并且模型身份预算足够表示本次已接纳请求的分配，则close可终止。理由如下。

1. Close后不再接纳，Pending是有限集合。
2. 新entry只能等待一个先已存在、Users为0且正在释放的victim。等待边从新项指向旧项。以创建时刻作严格顺序，边不可能形成环。victim不依赖新项的计量。
3. 由release最终结算，各Acquire等待可结束。由acquire和measure最终结算，各请求可进入done或cleanup。
4. cleanup只等待已开始的release。它结算后请求进入done。故Pending最终为空。
5. 剩余有限acquired项各由CloseRelease启动释放。全部结算后CloseDone可执行。

TLC配置关闭死锁报告并未声明活性公式。身份集合耗尽可能让有限模型中的choosing无法继续，这是搜索边界，不是产品的无条件终止证明。上述条件论证明确排除此人工边界。

## 范围外

没有证明完整planCompaction算法、实际权限服务、后到facts的新鲜度、Model校准、BPE准确性、跨操作复用、来源持久化或进程故障恢复。没有证明TypeScript控制流是该状态机的精化，也没有验证8个probe加4个可复用lease的生产最大状态空间。有限模型和参数化人工归纳分别提供不同证据。
