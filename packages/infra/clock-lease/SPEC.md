# 租约时钟的公开面与生命周期

clock-lease 是 Clock 的租约提供者。根入口保留 LeaseClock、TimeSources、ClockConfig、租约迁移/常量、预检及快照检查。
`./cordis` 提供 clockPlugin，插件名为 clock-lease。ClockService 和 clock 键由 core/offer-expiry 的绑定入口拥有。

LeaseClock以写在前的持久租约保护单实例跨进程重启不后退；运行中每次现读墙钟，不以单调钟推算隐藏回拨。
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

## 装配声明

managedClockPlugin 同步登记同一时钟的启动和真实关闭，使用公共服务键直接注入。
纯 describeAssembly 声明提供 clock、必需 storage，投影已校验的完整空配置为 tenancy-host/clock v1。
声明和代际责任沿[插件树协议](../../core/cordis-plugin-tree/SPEC.md)，不更改租约算法及原参数。

## 租约、时标与失败

租约宽度L=10_000ms，续约周期floor(L/3)。ClockConfig为严格空对象，额外键使启动失败；本版无可调租约参数。单行clock_lease包含id=1、lease_until和written_at，毫秒列须为合法安全整数；非法表示为缺陷。迁移由本包导出、宿主合成，时钟不自行在业务读里迁移。

每次写先锁id=1，使用同一真实写事务。初始化无行时插入(1,w+L,w)，仅主键UniqueViolation允许同事务重读；其他错误原样失败。续约仅在lease_until<w+L时写(lease_until=w+L,written_at=w)，不缩小持久界。回收只比较本实例最后写成功的界，匹配才写两列=max(hw,w)；另一写者已推进则不回收。它不与业务行要求跨owner同提交。

start现读墙钟w：w<written_at为确定回拨，闩住并抛ClockRollbackDetected；否则fresh的hw=w，既存的hw=旧lease_until，随后等待首次renew成功再启动定时器。任何初始化/首次续约失败使启动失败，不提供永久不可用的半开时钟。正常快速重启在[written_at,lease_until)内暂答unavailable，追上旧界才服务；干净回收两列相等，不需等旧窗口。

now判定顺序：已停止或故障闩住→unavailable；现读w<hw→unavailable；w>本实例已确认leaseUntil→unavailable；否则hw=w并返回w。等号可返回。单实例成功值非递减，不声称每次严格增加；要求串行提交时刻不同的未来增量尚未兑现。每段回拨只记进入warn与追上info，含墙钟/高水位及持续时间，不按调用刷日志。

定时续约已在途则跳过该轮、不排队。成功推进本实例可用界，但不能冒领另一写者推进的更远界。StorageUnavailable只记warn、界保持，后续续约再试；墙钟越界后now不可用，存储恢复并续约成功可自行恢复。StorageDefect记error、闩住、停止重试；不把表缺失当首次或把失败当写成功。手动renew由独立调用者等待，插件的定时排空不授予额外并发生命周期保证。

clockPreflight与start共用wall<written_at判据。表不存在或表有而无行才作无历史；表存在性由同一只读事务给出，读失败不能作无表。核对只读，不建行、不续约；旧窗口交start后等待。两次读墙钟之间再次回拨可导致preflight通过而start失败，此时宿主按其确认/恢复边界收场。入口开闸等待预算须严格大于L，等待超界原因仍须区分续约写失败、等待期回拨和故障闩锁。

## 成立前提与验证义务

存储须保证锁/条件写真实串行、提交可确认且先于使用、失败可识别；迁移在存储公开之前完成。进程崩溃后持久租约保护已返回值。OS断电保证取决于实际耐久档位和底层同步；tenancy-host的SQLite FULL前提不自动适用于其他NORMAL装配，也不解决磁盘损毁、备份回滚或人为删租约行。两个进程各持本地hw时不保证跨进程先后；属主排他由真实宿主/存储保证。

墙钟前跳再回校可能长时间不可用，重启不能绕过，当前没有产品运维出口。休眠后定时器至多一个周期触发、校时步进阈值只是待核平台代价前提，不扩大为保证。monotonic字段保留原注入形状，不参与now运算。SQLite INTEGER PRIMARY KEY名称反查的例外仍以真实BEGIN IMMEDIATE串行建行为前提，不扩为任意并发可靠。

clockSnapshotCheck只读核表形状、列声明/主键/约束及恰一行id=1，合法时间且written_at≤lease_until；缺行、多行或损坏拒绝invalid-data，IO失败不可用。不比较当前墙钟，不改值/续约，不证明旧授权仍有效。

验证须覆盖首次/快速重启、确定回拨与追上、续约瞬时失败和缺陷闩锁、真实写锁/关闭顺序、借用Storage先关闭、preflight零写和快照损坏。有限测试不是物理断电证明；单次结果归工作树tmp。
