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
撤除先停止定时续约和新 now/renew 准入，旧时钟立即回答 unavailable。
它等待已经开始的定时续约完成原提交及租约状态更新，再按原条件尝试回收自身租约。
在途存储缺陷仍闩住并报告，随后跳过回收，不新增写入。
Clock 不拥有传入的 Storage，不能关闭它。

存储先关闭时，租约回收沿原失败诊断收场，留下的持久租约按原重启窗口处理。
内核不提供跨 effect 的异步顺序；正常有序停止仍由宿主安排。
提供者换代不能继承旧实例的闭包状态或假称租约已经回收，需通过真实存储/时钟组合取证。

独立和插件用法均须保留原回拨、快速重启、干净关闭、续约失败与缺陷闩锁行为。
公共分面、制品外部消费和实际治理/模型装配须分别验证。

## 内部职责

lease-policy 拥有高水位、租约界、最后写值、准入、定时在途、失败诊断及时间选择。
它只消费私有 LeasePersistence，不接收 Storage、SQL、事务对象或 Cordis。
lease-persistence 唯一拥有 LeaseRecord 和 initialize/advance/retract 的内部形状，不发布新子入口。
clock 的公开构造门为每个实例连接一个 SQL 后端和一个策略实例，不复制状态。

lease-sql 只借用原 Storage。initialize 在一次写内锁 id=1、读行或普通插入；
仅 UniqueViolation 才在同一事务重读。既有行仍经原安全整数解码，其他异常原样传播。
advance 保留 lease_until < target 的条件写与原更新计数判据。
retract 只比较调用方提供的最后写界，并写入调用方算好的回收时刻；不能回收其他写者的界。
是否调用、lastWritten 及 max(hw,wall) 均由策略选择。
每次数据操作仍只有原一次写事务，完成不替代策略整体启动或关闭。端口不选时间、不重试、不关闭存储。

停止准入与故障闩锁分别保存。停止位不丢弃已开始续约的完成更新；
故障位仍决定排空后是否跳过回收。成功 start 在原开启位置重新开放准入。
原手动续约等待及未承诺的并发生命周期边界不变。

内部分离理由见 [ADR](adr/policy-persistence.md)。

## 依据及未迁责任

managedClockPlugin 同步登记同一时钟的启动和真实关闭，使用公共服务键直接注入。
纯 describeAssembly 声明提供 clock、必需 storage，投影已校验的完整空配置为 tenancy-host/clock v1。
声明和代际责任沿[插件树协议](../../core/cordis-plugin-tree/SPEC.md)，不更改租约算法及原参数。

未迁行为及验证义务继续归[旧节点设计](../../../.meta_harness/design/realization/packages/infra/clock/design.md)与[验证义务](../../../.meta_harness/design/realization/packages/infra/clock/verification.md)。
本页只接续本批公开集成承诺；不据本页退役其余旧正文。
集成边界依据 D-114，承诺归属依据 D-115。
