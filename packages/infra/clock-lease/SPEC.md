# Clock 的持久时间底线与异步生命周期

本包实现 core/offer-expiry 的 Clock。`now()` 返回 Promise，结果为当前墙钟对应的 Instant 或 `unavailable`。
墙钟回拨仍可见，不用虚构的递增时刻替代系统时间。业务期限的规则与错误优先次序不变。

## 时间与持久边界

策略记录已经使用的高水位 H，以及本实例确知已持久化的上界 U。成功返回 w 必须满足 H ≤ w ≤ U，并把 H 更新为 w。
墙钟低于 H 时返回 unavailable，并在进入及离开这段状态时记录日志。
墙钟超过 U 时，请求等待一次持久申请。并发请求共用同一个在途申请。只有成功提交回执才扩张本地 U。
每次 await 后重新读取墙钟，并复核停止、故障、H 与 U。单次 now 最多发起两轮申请；回执到达时窗口仍已用尽则返回 unavailable。
默认预留范围为 10 秒。它是崩溃后最坏等待范围的参数，不是任务超时，也不要求心跳按时执行。

启动读取旧 written_at 与 lease_until。墙钟小于 written_at 是确定回拨，启动失败。
接手旧行时 H 从旧 lease_until 开始，直到墙钟追上才提供时间。首次创建的资源先持久初始化，之后才启动策略。
普通存储失败保留已确认的 U；范围内仍可取时，超界申请失败则 unavailable。存储缺陷闩住该实例并记录 error。
失败或未知回执不得当作成功。底层仍可能运行的操作由存储拥有者排空，不自动重放事务。

## 独立资源与装配

`openLeaseClock` 打开独立 SQLite 文件。它使用 storage-sql 的异步连接与 main 持有的排他文件锁，且显式使用 FULL 同步提交。
Clock 不与业务写事务共用数据库。业务事务内等待 Clock 不会等待自身的写锁。
Clock 的独立升级 guard 必须在时间发布前确认。业务启动失败、升级回滚或存储关闭不能回退独立时间底线。

资源包含 SQLite 文件及同路径 `.clock.json` manifest。manifest 的 ID 必须与数据库身份行一致。
普通打开不自动创建缺失 manifest。ready manifest 对应的数据库缺失、身份不符或底线损坏都拒绝启动。
只有明确的 initialize 操作可以创建新资源或导入旧 clock_lease 的底线。prepared 状态可继续尚未完成的初始化，因为此时从未开放时间准入。
配置负责选择正确的完整资源；本包不声称识别两套完整有效资源之间的错误配置。

clockPlugin 与 managedClockPlugin 注入 Storage 以读取显式迁移时的旧底线；运行期取时使用独立资源。
配置包含 file 和可选 initialize。只有首次创建或明确迁移才设置 initialize，后续启动省略。
ClockService 仍由 core/offer-expiry 拥有。本包在资源启动成功后提供服务，运行期 unavailable 不自行撤除插件。
managed 插件通过 assembly-lifecycle 保有启动及真实关闭责任。

低层 LeaseClock 仍可消费调用者提供的专用 Storage。调用者须保证其排他、持久和关闭顺序，且不得将其与会等待 Clock 的业务事务共用。
该构造门不取得借入 Storage 的关闭权。产品装配使用 openLeaseClock 或其 Cordis 插件。

`clockResourcePreflight` 在业务迁移前只读核对独立资源底线。显式初始化还核对将导入的旧业务底线。
prepared 资源若已有耐久行，使用该行与 manifest 底线的较大值。只有尚未建库、建表或建行的初始化中间态可仅核 manifest。
预检不创建缺失数据库、不续约、不改变 journal mode；资源启动取得排他后仍须重新核对。预检不是运行期的所有权证明。

## 停止与备份

关闭先停止新 now/renew，等待启动及所有在途申请终结，再尝试把本实例的租约收回至 max(H, wall)。
存储缺陷已使实例闩住时，只排空原任务，跳过回收，不发起新的持久写入。
等待申请的 now 在关闭后返回 unavailable。重复 close 共用一次收尾。回收失败保留原耐久上界并报告。
拥有独立资源的实例最后才关闭 Storage 和排他锁。错误事件或关闭请求已发送不构成真实资源退出。

checkpoint 在取得可用时间并排空当时申请后，返回确认的 writtenAt 与 upperBound。
在线备份在固定业务快照并取得 finishedAt 后采集 checkpoint；备份必须保留两者，不能继续只依赖业务库中的旧 clock_lease。
minimum 用于打开独立资源时持久接纳恢复底线，不能降低现有更高值，且在任何时间发布前完成。
旧业务表的 snapshot 检查仅验证仍存在的历史记录；当前完整时间底线由备份 checkpoint 承载。

## 内部职责与依据

lease-policy 拥有时间选择、高水位、上界、single-flight 申请和准入。lease-persistence 定义私有的初始化、推进与回收操作。
lease-sql 只完成原事务内条件写。条件更新未写入时，必须读取并确认该行确实已经覆盖目标，不能把缺行当作已覆盖。
resource 拥有独立持久资源、初始化、格式确认与关闭。resource-manifest 只处理资源身份及耐久初始化记录。

本次异步接口、按需申请和独立持久资源依据用户 2026-10-08 的明确要求，替代旧节点中的同步 now、周期续约和借用业务数据库条款。
未改变的 UTC 时间、回拨、重启非递减与失败语义由本页及[验证入口](verification/README.md)继续约束。
模型与真实进程测试各自说明范围；不把 SQLite 的耐久前提表述为本包证明了物理断电安全。

## 成立前提与验证义务

存储必须使锁和条件写真实串行，提交确认先于成功发布时间。两进程各自的高水位不提供跨进程先后保证；独立资源的属主排他必须实际成立。换代不能继承旧闭包或假称租约已经回收。服务不可见不等于旧任务结束，内核不代替宿主的异步停止顺序。

时间前跳再回校可以长时间不可用，重启不能绕过；本包没有隐藏运维重置出口。单实例成功值非递减，不承诺每次严格增加。monotonic注入不参与now取值。断电保证取决于SQLite FULL、OS、文件系统及介质同步，有限模型与进程测试不证明物理断电或磁盘灾难恢复。

每段回拨只记录进入warn和恢复info，保持墙钟、高水位及持续时间，不按调用刷日志。条件回收只认本实例最后确认的上界，另一写者已推进则不回收。独立资源预检只读；不得把缺失、损坏或IO失败当作合法首次创建。明确初始化的prepared前缀与普通ready打开分别验证。

验证必须覆盖首次/快速重启、回拨与追上、申请失败/未知及缺陷闩锁、真实写锁/关闭顺序、业务写事务内取时、独立预检与快照损坏，以及公共分面、制品消费和实际消费者装配。

## 绑定入口与生命周期坐标

`@omne-harness-lite/clock-lease/cordis`导出`clockPlugin`和`managedClockPlugin`，限定name分别为`clock-lease`和`clock-lease-managed`。两者使用同一纯实现和配置Schema；管理版声明`assemblyLifecycle: 1`并必需注入`assemblyLifetime`，先登记后开始资源效果，缺端口不回退独立模式。独立版由调用方先排空消费者再撤依赖，管理版由[装配生命周期](../../core/assembly-lifecycle/SPEC.md)安排真实逆序收场。
