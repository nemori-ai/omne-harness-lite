# EC3 维护生命周期有限模型实际运行 · 2026-09-25

本次对candidate Maintenance模型执行TLC。正向安全配置与进展配置各生成485状态、184 distinct，退出0无反例；不是实现或磁盘耐久证明。输入与逐配置原始output.log/exit-code均保留，工具摘要见tool.json。

| 配置 | 退出码 | 实际结果 |
|---|---|---|
| governance-center-entry-v3-maintenance-valid | 0 | 六个不变量无反例 |
| governance-center-entry-v3-maintenance-progress | 0 | WF_vars(Advance)前提下EventuallySettled无反例 |
| MaintenanceValidity_plaintextEarly | 12 | IsolatedPlaintext被违反，3 distinct |
| MaintenanceValidity_releaseEarly | 12 | OwnerUntilRealEnd被违反，15 distinct |
| MaintenanceValidity_removeProtection | 12 | IsolatedPlaintext被违反，79 distinct |
| MaintenanceValidity_unknownSuccess | 12 | ConfirmedSuccess被违反，40 distinct |

抽象只有一个已受理工作，phase/published/durable/protected是模型变量。取消/连接关闭/停止/崩溃可交错，进展只在Advance弱公平前提下成立。未建模任务准入排他、目录候选、每日时间、重取确认、跨中心、真实文件同步、摘要、SQLite一致性或所有生产打开路径；这些归实际提供者验证。故障模型不能证明操作系统或存储设备兑现fsync。

failed-initial-run保留首次结果：releaseEarly/plaintextEarly/unknownSuccess已出现预期反例，两个正向与removeProtection因表达式赋值括号导致TLC退出75，不能计通过。修为`plaintext' = (plaintext \/ deleted)`后，r2六配置全部重跑。没有覆盖旧失败证据。

复现：在input目录，以登记的各cfg执行`java -XX:+UseParallelGC -cp <tla2tools.jar> tlc2.TLC -workers 1 -config <cfg> Maintenance.tla`，为每次执行给独立metadir。正式任务id见表；四个变异不是正向任务。通过不提升契约或提供者状态。
