# 私有锁库同时竞争的有限观察

Node24.21.0，macOS/Linux arm64，每种模式各40次两子进程在ready屏障后同时开始；均为新私有锁库、MEMORY日志。EXCLUSIVE timeout0在Mac有13次单属主、27次双方busy，Linux33次单属主、7次双方busy；IMMEDIATE timeout0及EXCLUSIVE timeout100在两平台均40次恰一属主。各组合没有双属主。原始脚本和输出随包，结果不证明任意调度必有进展。

[SQLite事务说明](https://www.sqlite.org/lang_transaction.html)给出唯一同时写事务与IMMEDIATE准入；[rollback锁层次](https://www.sqlite.org/lockingv3.html)区分唯一RESERVED与禁止其他读者的EXCLUSIVE。观察支持“无业务数据的锁库，排斥所有读者可能导致额外竞争失败”的推断，不证明具体每次调度的全部锁序。正式应用锁机制选择与实际回归归提供者/评审，本报告不作采用。

Linux镜像node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6；只读挂owner-race.mjs后执行node /probe.mjs。Mac用固定Node24.21执行同脚本。只读官方网页核对日期2026-09-25，不把网页视为本项目契约。
