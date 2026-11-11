# tool 协议模型索引

- [范围、性质、源码映射与运行命令](README.md)。
- [普通调用重入模型](InvokeRecovery.tla)。
- [安全与进展配置](InvokeRecovery.cfg)。
- [未知后另分身份的负控配置](InvokeRecovery-unsafe.cfg)。
- [包索引](../../index.md)。

- [事实保管责任交接模型](FactCustody.tla)。
- [事实保管安全配置](FactCustody.cfg)。
- [未保管先释放的负控配置](FactCustody-unsafe.cfg)。

- [原结果与队列释放模型](SettlementRelease.tla)。
- [三域交接安全配置](SettlementRelease.cfg)。
- [保管已应用但未确认的负控](SettlementRelease-unsafe-custody.cfg)。
- [提前关闭 queue 责任的负控](SettlementRelease-unsafe-queue.cfg)。

- [暂停与执行名额模型](SuspendedSlots.tla)。
- [名额与进展配置](SuspendedSlots.cfg)。
- [暂停提交前停泊的负控](SuspendedSlots-unsafe-early.cfg)。
- [不持名额就启动的负控](SuspendedSlots-unsafe-skiphold.cfg)。
- [停泊条目不计入容量的负控](SuspendedSlots-unsafe-parkfree.cfg)。
- [只从 held 删除条目的负控](SuspendedSlots-unsafe-norelease.cfg)。
- [停泊时删除条目的负控](SuspendedSlots-unsafe-parkdelete.cfg)。
- [停泊不核对持有者的负控](SuspendedSlots-unsafe-parkanyholder.cfg)。

- [调用域生命周期模型](call-lifecycle/README.md)。
- [调用域生命周期的 TLA+ 规格](call-lifecycle/CallLifecycle.tla)。
