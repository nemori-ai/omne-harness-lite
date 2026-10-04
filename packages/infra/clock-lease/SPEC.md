# 租约时钟的公开面与生命周期

clock-lease 是 Clock 的租约提供者。根入口保留 LeaseClock、TimeSources、ClockConfig、租约迁移/常量、预检及快照检查。
`./cordis` 提供 clockPlugin，插件名为 clock-lease。ClockService 和 clock 键由 core/offer-expiry 的绑定入口拥有。

LeaseClock 的墙钟读取、已使用高水位、持久租约、回拨与不可用判据继续按原精确节点设计执行。
本批不改变租约宽度/续约周期、表名/迁移、时间表示、诊断及业务失败优先次序。
直接调用者继续负责 start/close；手动 renew 的调用者须按原规则在关闭前等待它，不从插件定时续约的收尾推导新的保证。

插件注入公共 StorageService，完成 LeaseClock.start 后登记关闭 effect，再构造 ClockService 子类。
启动失败不提供时钟。启动期间已撤除时，启动路径负责关闭已创建的时钟；后续构造失败由已登记 effect 收场。
now 直接调用原 LeaseClock.now，不另取时间源，不以服务存在代替可用性。

运行期不可用仍以 unavailable 表示，插件不据此自行撤除。
撤除停止定时续约、等待原定时续约在途任务并尝试回收自身租约；旧时钟引用随后返回 unavailable。
Clock 不拥有传入的 Storage，不能关闭它。

存储先关闭时，租约回收沿原失败诊断收场，留下的持久租约按原重启窗口处理。
内核不提供跨 effect 的异步顺序；正常有序停止仍由宿主安排。
提供者换代不能继承旧实例的闭包状态或假称租约已经回收，需通过真实存储/时钟组合取证。

独立和插件用法均须保留原回拨、快速重启、干净关闭、续约失败与缺陷闩锁行为。
公共分面、制品外部消费和实际治理/模型装配须分别验证。

## 依据及未迁责任

未迁行为及验证义务继续归[旧节点设计](../../../.meta_harness/design/realization/packages/infra/clock/design.md)与[验证义务](../../../.meta_harness/design/realization/packages/infra/clock/verification.md)。
本页只接续本批公开集成承诺；不据本页退役其余旧正文。
集成边界依据 [D-114](../../../.meta_harness/design/record/decisions/cordis-integration-conventions/decision.md)，承诺归属依据 [D-115](../../../.meta_harness/design/record/decisions/actual-architecture-and-thin-spec/decision.md)。
