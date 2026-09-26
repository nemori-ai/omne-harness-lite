# D-039 · 单机治理中心的 SQLite FULL 档位

- 状态：已接受，2026-09-24。主线实施负责人在用户治理 CLI/TUI 实施授权及 [INT-009](../../../product/PF-017-governance-center-as-deployable-application/interviews/2026-09-24-production-cli-intake.md) 的单机交付范围内作技术采用。
- 来源：[持久性候选](../../proposals/governance-production-mechanisms/sqlite-durability.md) B；[定向独立评审](../../proposals/governance-production-mechanisms/review.md#sqlite-档位与登录-r2-定向评审)。受评候选 SHA-256：`9f94719bc73442f1d5135b81eddcf04adbd0d112e284cd1de6912de448dd303e`。

## 选择及取代范围

StorageSqlConfig 的 SQLite 分支增加可选 `synchronous: 'normal' | 'full'`，默认仍为 NORMAL；tenancy-host 明确选择 FULL，不提供降档环境开关。参数沿 openStorage → openSqlite → Driver 的每次句柄打开传递，包含读句柄与迁移写句柄。枚举只映射固定 PRAGMA。

本项部分取代 [D-027](../infrastructure-names-and-sqlite-durability/decision.md) 的“不暴露 config、全部固定 NORMAL”，沿该决定预定的新决定路径演化。两个名字与共享默认保持；PostgreSQL 不受影响。没有新增数据结构或领域语义，不发布新领域规格，不改变升级守卫的确认、快照恢复及文件同步协议。

## 理由、前提与验证边界

PF-017 rev4 仍要求正常 OS 故障及断电不丢已确认事实；延期整机灾备不撤销此项。全仓库强制 FULL 超出本期消费者需要，改用 PostgreSQL 则增加部署与升级恢复负担。有限团队先采用已有 SQLite 提供者的显式档位。

WAL + FULL 的耐久性以操作系统、文件系统和设备正确兑现同步请求为前提（[SQLite 官方说明](https://www.sqlite.org/pragma.html#pragma_synchronous)）。不承诺磁盘毁损、谎报同步的设备或旧备份直接开放后仍保有最新安全状态。FULL 不能替代升级快照和目录 fsync。

实现必须检验实际读写句柄、后开读句柄、重开、迁移及 host 装配，跑 FULL 符合性和中心回归。SIGKILL 是进程故障证据，不能称物理断电实验；本决定不等于这些验证已经通过。
