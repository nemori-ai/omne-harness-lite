# PF017 projection v4 · 正常启动修复

本版补充v3分发快照，依据PF017 rev4、AI3 S52、既有host M1与D053；不更改产品条款和任何冻结规范。对象为既有治理中心、账号与登录，未新增领域身份。

不变量：一个中心库只由一个属主开启；释放/进程死亡后可重取，GC不能提前放锁。实现用原私有空锁库的唯一写事务资格，其他锁库只读观察不取得属主身份；timeout0、强引用与原升级守卫次序保持。有限竞态验证有明确调度/文件系统前提，不承诺恶意外部锁或任意调度有界进展。

迁移后置：legacy登录撤销与三个新增列同一真实事务提交。缺外层事务时由bounded片段创建；已在事务中复用，不增加嵌套。失败回滚本片段列及数据，不把三列存在但数据尚未处理的中间态当完成；成功重跑无副作用，不撤销后来登录。部分模式具名失败，旧守卫快照恢复先行；人工无guard历史半截库无自动修复承诺。

Cordis边界不变：storage-sql拥有原锁句柄与升级；AI拥有自己迁移片段；宿主只合成并保留旧九条前缀、追加第十条，不能改片段业务。没有新service/fiber/inject/event。共享存储及全部跨owner业务保证仍沿既有v2投影/registry，分发仍沿v3。

依据：[D053](../../../../record/decisions/governance-startup-repair-adoption/decision.md)、[提供者](../../../../realization/packages/infra/storage-sql/design.md)、[AI节点](../../../../realization/packages/tenancy/account-identity/design.md)。节点非冻结规范，provenance为null，实施前核接受范围；本版快照不原地覆盖。

完成判据：保留原host两进程恰一成功断言；旧EXCLUSIVE与新IMMEDIATE两个方向互拒；GC/正常释放/SIGKILL/升级快照回归；真实SQLite Migrator无外层事务在第三DDL后UPDATE前故障，列与原行回滚；旧实现负控失败，成功后重复不动新登录；完成类型、全量相应回归与新制品跨平台验证再引用。备份/恢复/服务管理与MacGUI/IME等未决仍不由本版解决。
