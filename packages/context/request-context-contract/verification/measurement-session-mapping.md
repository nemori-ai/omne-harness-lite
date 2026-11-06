# 一次规划的计量会话模型

本页只对应 [SPEC RQ-05](../SPEC.md#rq-05-完整预算与候选完成) 的准备租约复用、输入快照、容量和关闭。[MeasurementSession](models/measurement-session/MeasurementSession.tla)是该范围的行为模型，[手写证明](proofs/measurement-session.md)给出参数化安全归纳。既有replay、compaction模型保持原范围。

| 模型事实或动作 | [measurement-session.ts](../src/measurement-session.ts) 的对应 | 保护责任 |
| --- | --- | --- |
| Begin、snapKey、snapBody | measure同步检查closed和pending，然后克隆profile、lineage、assembled | RQ在key之前固定一次probe实际使用值 |
| Pending与Bounded | pending Set，maxPending=8，task登记和finally清除 | 等待acquire与一次性lease也占并发限额 |
| key、Existing、SharedAcquire | entry的canonical完整profile/lineage键及entries Map | 同key共享取得中的Promise；不序列化主体 |
| Retained、Create | capacity=4，retained、idle和reusable | 可复用项包含正在使用和正在取得的项；只淘汰users=0 |
| blockedBy、Acquire、ExactKey | acquire闭包先await旧entry release，再调用preparation.acquire | 等待期间继续用同一次probe快照，不能重读调用方引用 |
| Users、Measure | use的users增减，[measurement.ts](../src/measurement.ts) 的measureWithLease | 每份候选独立plan和measure，不缓存权限或预算 |
| Finish、ReleaseDone、CleanupDone | retire与release、entry.released Promise、use的finally | 非复用项最后一名使用者离开后才release，release失败被记录 |
| Close、CloseRelease、CloseDone | close先置closed，再allSettled(pending)，最后等待全部entries release | 拒绝新probe，等待已开始调用与全部清理结算 |
| FailureVisible | failure和withMeasurementSession返回选择 | 清理失败不能把原成功作为最终成功返回；原失败优先级另由行为测试核对 |

源码的retained过滤只遍历当前Map。模型显式把被淘汰项标为不registered和不reusable；被移出Map的旧对象不会再次成为候选。这是表示映射，不要求源码给已移出的对象追加一个状态字段。

Model拥有preparation profile及lineage验证、供应商绑定和facts快照。RQ只消费该公开租约承诺。tokenizer拥有物理worker与缓存清理。应用拥有实际配置和父级资源生命周期。任何一层的close等待结算都不能独立证明另一层已经成功清理；模型中的released包括明确失败的release结算。

## 执行与判读

设置 `TLA2TOOLS_JAR` 后，在仓库根运行。输出目录必须尚不存在。

```sh
python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py packages/context/request-context-contract/verification/models/measurement-session tmp/tokenizer-formal-session
```

[共用runner](../../../model/tokenizer-tiktoken/verification/formal-mapping.md#可复跑入口)只执行本成员的模型和cfg。每配置一个TLC worker、768 MiB堆、120秒上限，保存精确输入与JAR摘要、命令和日志。它不自动加入总检查；交付者须显式执行。普通退出0不够，必须出现TLC完整检查结论。负控还须退出12并命中指定性质。

| 配置 | 范围或预期反例 |
| --- | --- |
| positive | 2 probe、2 entry、2 key、容量1、在途2；覆盖复用、共享取得、溢出、淘汰等待、失败与关闭 |
| production-limits | 同样只有2 probe，使用4/8参数；并未探索生产最大并发状态空间 |
| bad-key-acquire | key固定后又读取外部key取得lease，必须命中ExactKey |
| bad-live-measure | await后读取外部assembled，必须命中ProbeSnapshot |
| bad-busy-eviction | 允许淘汰users非零项，必须命中BusyNotReleased |

精确清单归 [expect.txt](models/measurement-session/expect.txt)。有限身份预算耗尽时可以停在choosing，因而TLC不以死锁检查或无条件活性代替安全检查。参数化证明给出任意正容量和有限身份集合的安全结论，并另列关闭终止的外部Promise与调度前提。

实现符合性由 [measurement-session-lifecycle.spec.ts](../tests/measurement-session-lifecycle.spec.ts) 和 [measurement-session.spec.ts](../tests/measurement-session.spec.ts) 承担。它们的实际运行结果和源码负对照记录归单次任务tmp。本模型不证明整个压缩算法、来源持久化、权限服务、Model计量正确性或TypeScript精化。
