# D-053 · 属主竞争与bounded迁移原子幂等

2026-09-25，主线沿用户治理闭环实施授权，依据[限定候选与反例](../../proposals/governance-production-mechanisms/single-host-delivery.md)、[独立复审](../../proposals/governance-production-mechanisms/review.md)及[双平台竞争观察](../../../../research/governance-recovery-providers/reports/2026-09-25-owner-contention/README.md)，采用已有提供者两处修复，不增加领域能力或改冻结契约。

1. storage-sql私有空锁库改BEGIN IMMEDIATE，保留timeout0/MEMORY、文件名、强引用和显式释放/进程死亡释放；所需是唯一写事务属主资格，不是排斥所有读者。原EXCLUSIVE0实际存在两竞争者都被拒绝，未出现双属主。EXCLUSIVE加100ms也是有效替代，但增加不必要的同步等待；有限40次结果不构成任意调度进展保证。生产数据库、升级快照和确认次序不改。
2. AI bounded新增迁移的观察、三个DDL与legacy撤销归一真实事务；已有事务复用，否则片段自建，避免SQLite Migrator不包DDL留下全列半数据。完成后重跑不撤销后来登录，不新增另一份完成表；全局DDL方言标记与旧片段不改。正常旧升级遗留先由宿主guard恢复，人工无guard的历史半截库不自动猜修。

本次提供者来源：[storage-sql末节](../../../realization/packages/infra/storage-sql/design.md) SHA256 `ceab683a8c24e798edd10e90196150831ecd99715474509aaf5a148603427bac`，[AI末节](../../../realization/packages/tenancy/account-identity/design.md) SHA256 `8d16e83b47aee683f97c7da500d6969cefa523bea47adb7641723ff99597ebcd`。限定取代上述节点早期EXCLUSIVE机制和bounded片段未显式原子化的实现；D028/D040既有排他、M1幂等与AI3 S52后置条件保留。

原AI初修仅查列存在的方案被独立review反例否决；局部事务修订后复核无阻断。已有83项AI/39项升级/10项host进程定向通过，失败注入从真实Migrator无外层事务进入，旧实现负控失败。全量回归、不同平台新制品、最终code review仍需完成，不能以本决定代替实际交付。
