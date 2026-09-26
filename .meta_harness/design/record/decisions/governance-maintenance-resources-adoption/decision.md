# D056 · 维护run的调用方资源采用

2026-09-26，主线沿用户已授权的生产治理闭环研发范围，依据[三候选比较](../../proposals/governance-production-mechanisms/maintenance-resource-lifetime.md)及[独立评审](../../proposals/governance-production-mechanisms/review.md)，接受A的core R3/storage-sql R4/entry R3。精确字节哈希见[快照](provider-snapshot.json)。

这补齐D055已有EC3 S59要求的全部资源真实收场：ownResource归在线及离线run整体，entry在open成功后立即登记close及实际closed观察，取消不能丢在途open。SQL保存生命周期责任，不取得文件格式/路径/发布治理；entry保持输出、unknown与隔离清理职责。host不承担能力生命周期补丁。B无限pending缺故障收场出口，C不能覆盖直接storage.close与级联撤除，均不采用。

限定取代D055提供者接口只能登记SQL内部资源的缺口；冻结EC3/HT3、领域对象、产品范围、八fiber拓扑、旧D055快照与其余映射不变。不增加业务权限或网络资源回调。内部close/isClosed不得依赖已撤服务或等待自身run。只有所有登记资源真实closed才能释放源/工作区；未closed沿强引用、poison、保锁及真实故障退出规则。

独立architecture-reviewer已对三节点及候选的精确修订核查无阻断，未运行实现。接下来必须证明取消期间迟到open、吞关闭失败、虚假close完成、在线/离线直接关闭、真实跨进程保锁与进程退出；不能以设计采用代替源码或制品验收。最终Claude fable审查仍等完整交付。
