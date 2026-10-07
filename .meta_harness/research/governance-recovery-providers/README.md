# 治理中心恢复机制的事实与范围

本包调查上游保存、复制和执行原语的边界；当前产品承诺、实现采用与验证义务由对应包/应用拥有。上游接口、合成机制输入和产品验收是不同范围，不能相互替代。

## 官方事实与限制

- Litestream v0.5.17（`ccd326c175b583b5e82893a6078f06dcef5fba3f`）的阻塞同步、位置读取、文件后端同步及 VFS 适用范围见[研究正文](research.md)和[精确源码导航](evidence.md#e1-精确源码与官方接口)。复制保存不识别产品升级确认、登录或接管；同机文件后端不等于独立故障域。网络后端、断电、完整产品事务及 PostgreSQL 对照未由这些材料验证。
- [Node v24.21.0 sqlite 文档](https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/sqlite.md)与[SQLite Backup API](https://www.sqlite.org/backup.html)定义备份接口的复制与覆盖行为。目标已有库可能被覆盖，其他连接写入可能触发重新复制；API 自身不给任意写压或 IO 下的完成时限。固定只读观察必须按提供者当前机制维持，不能从一般接口描述推断所有场景均固定或无写入成本。
- [Node v24.21.0 BackupJob 源码](https://raw.githubusercontent.com/nodejs/node/v24.21.0/src/node_sqlite.cc)在 progress 回调异常后先 Finalize 再拒绝 Promise，结束备份、关闭目标及撤销备份登记；调用方读事务仍由调用方释放。这个顺序不证明任意阻塞 IO 有取消机会、失败无残留、关闭有时限或产品恢复可开放。
- [SQLite 事务](https://www.sqlite.org/lang_transaction.html)与[rollback 锁层次](https://www.sqlite.org/lockingv3.html)区分唯一写事务、RESERVED 和 EXCLUSIVE。私有锁库的有限竞争观察不证明任意调度有进展，不替代产品属主生命周期和跨进程故障验收。
- [Node v24.21.0 worker 文档](https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/worker_threads.md#event-exit)规定 exit 在 worker 停止后发出，消息先于 exit。消息不能替代实际退出。合成完整性检查的线程计时不构成产品业务、时钟续约、任意文件/设备/OS 或性能 SLA 保证。
- systemd 的停止和 timer 行为必须按实际部署模板、采用版本和真实 host 验收。合成 shell 服务的长停止和 timer 触发不证明产品备份、资源排空、每日周期、离线恢复、断电或存储耐久。

## 当前拥有者与可复跑资源

| 当前责任 | 拥有者 |
|---|---|
| SQLite 属主、事务、快照与维护资源 | [storage-sql SPEC](../../../packages/infra/storage-sql/SPEC.md)、[维护机制](../../design/realization/packages/infra/storage-sql/maintenance.md)及该包 tests |
| 固定读、取消后的真实结算与释放、物理检查 worker | storage-sql 的维护实现与测试；独立原语输入归该包 `tests/probes/`，每次输出归执行工作树 `tmp/` |
| host 启停、CLI 路径、真实 TLS/Unix、治理旅程 | [tenancy-host SPEC](../../../apps/tenancy-host/SPEC.md)及[真实 e2e](../../../apps/tenancy-host/tests/e2e/README.md) |
| systemd/容器部署、备份触发与运维恢复边界 | [部署入口](../../../apps/tenancy-host/deploy/README.md)、[容器入口](../../../apps/tenancy-host/deploy/docker/README.md)；独立 systemd 原语输入归该 app 的 `tests/probes/` |

这里只导航职责和有限范围，不声明任何新验收通过。实际脚本执行须使用自有合成数据和私有临时目录；大副本/容器机制探针是显式 opt-in，不能自动进入普通检查。版本、后端、写者协调或应用确认协议变化后，重新核对受影响的事实与前提。

## 未覆盖范围

真实源并发、所有写者实际停止、关闭/取消竞争、磁盘满/损坏/慢 IO、文件与目录落盘、崩溃残余隔离、真实业务与 clock 续约、生产恢复及安全开放仍需对应 owner 的组合验收。同机备份不覆盖整机/磁盘毁损；PostgreSQL 维护和复制对照保留为未验证范围。有限模型、合成库或上游文档不能关闭这些责任。
