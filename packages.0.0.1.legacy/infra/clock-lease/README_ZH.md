# @omne-harness-lite/clock-lease

[English](README.md)

本包提供异步 Clock。`await clock.now()` 返回当前系统时间或 `unavailable`。墙钟回拨会明确暴露，不用虚构时间掩盖。
公开行为归 [SPEC.md](SPEC.md)，工作区操作见[开发指南](../../../docs/development.md)。

## 独立资源

`openLeaseClock({ file, initialize: {} })` 明确创建一个独立资源，并完成启动。
后续用 `openLeaseClock({ file })` 打开同一资源。普通打开不会重建缺失文件。
保存数据库及同路径 `.clock.json` manifest。初始化失败但尚未开放时间的 prepared 状态可以继续完成。

`initialize.floor` 可导入明确迁移时读取的旧底线或备份 checkpoint。已有资源通过 `minimum` 接纳备份底线，不能降低已有更高值。
接纳和格式确认都先于时间发布。业务库升级回滚不能回退独立 Clock。

本包复用 storage-sql 的 worker 与排他机制，需要 Node24、Linux 和 PATH 中的 util-linux flock。
Clock 使用独立 SQLite 文件及 FULL 提交配置。物理耐久仍依赖存储栈正确执行同步，本包测试不证明物理断电行为。

## Cordis 装配

`./cordis` 导出 clockPlugin 和 managedClockPlugin。配置为 `{ file, initialize? }`。
只有明确首次创建或旧源迁移时才设置 initialize，之后省略。插件注入 storage，用于初始化时读取旧 clock_lease 底线。
运行期使用独立数据库。业务写事务可以等待 Clock，不会等待自身写锁。

服务键与 ClockService 归 core/offer-expiry。managed 插件还注入 assemblyLifetime，保有启动与实际关闭责任。
运行期 unavailable 不自动撤除插件。关闭开始后，旧引用不再获得新时刻。

## 时间算法

每次请求现读墙钟。样本在已确认持久范围内时直接返回，无需访问数据库。
超出范围时，多个请求共用一次申请。提交成功后重新取时，再检查回拨、停止和范围。
单次请求最多申请两次，持续缓慢或故障时明确返回 unavailable。没有定时续约器。

LEASE_WIDTH_MS 为10秒。崩溃重启后，实例可能等待墙钟追上旧上界；墙钟早于旧 written_at 则启动失败。
临时存储失败保留已确认上界，存储缺陷闩住该实例。关闭先停止取时、排空申请，再回收租约并关闭资源。

低层 LeaseClock 仍可接受调用者提供的专用 Storage。调用者负责排他、耐久及关闭顺序，不能传入正在等待 Clock 的业务数据库。
TimeSources 用于测试控制时间；monotonic 字段不用于推算墙钟。

## 备份与验证

当前备份必须保留 Clock checkpoint。clockPreflight、clockSnapshotCheck 只核对业务库中保留的旧表，不能替代独立底线。
读取 checkpoint 的消费者须处理能力缺失和 unavailable。恢复先持久接纳底线，之后才允许发布时刻。

运行本成员的 build、typecheck 和 test。算法、真实进程资源、Cordis 服务、备份和应用装配的验证范围分别记录。
