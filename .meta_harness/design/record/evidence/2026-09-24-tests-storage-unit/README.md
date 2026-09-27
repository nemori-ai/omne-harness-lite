# 显式存储单元与主键映射 · 2026-09-24

对应已评审的P-13绑定：core/storage只增加AtomicStorage扩展/StorageUnit与独立符合性套件；storage-sql实现它，普通read/write保持独立提交。领域服务/入口尚未迁移。源码未提交，由source-manifest定位。

| 运行 | 实际结果 |
|---|---|
| Node24.21.0 macOS，storage-sql全包 | 110通过、4个未配置PG测试跳过；新增14项共同事务符合性，含抛undefined/null/false、操作异常被祖先catch仍回滚、P2内部恢复与逃出run不可恢复、错域/关闭/重叠/排空/通知/普通嵌套不加入 |
| core/storage自身测试 | 9通过；两个storage成员构建/typecheck及全workspace typecheck通过 |
| 补充通知边界测试 | 2通过；提交后注入“确认丢失”边界错误，数据库行确实存在而不发通知；通知抛出/返回拒绝Promise不改写成功、不泄露异常秘密。此补充只有工具输出转录，无原始JSON |
| tenancy-host lifecycle/upgrade | 38通过，普通装配与guard回归；本次没有重复完整黑盒旅程，前一FULL增量的46项仍有其原范围 |
| Linux arm64实际构建产物 | 八组冒烟通过，网络关闭、仓库只读，Node24.21.0固定镜像同FULL补充；不是全部Linux符合性或物理故障 |
| 源码规则/文档设计/格式 | 20条源码规则与docs/design检查通过；注册形式任务不是本次重新执行。修改TS格式及diff空白检查通过 |

原型先有两次P2失败，原始输入/输出保留：INTEGER PRIMARY KEY复用rowid，不出现在index_list里，旧驱动误映StorageDefect，给主键命名也不解决。按现有P-11增加table_info的单列INTEGER主键映射；39项相关测试通过，包含真实事务冲突后继续写。随后原型8组通过，再由产品符合性套件验证。不是为让原型过而吞掉数据库错误。

复现：Node24构建core/storage、storage-sql；运行两个成员test，补充通知测试已包含在后续全套默认发现范围。Linux在只读挂载/workspace的容器中执行probe/run-provider.mjs（脚本原相对深度为tmp/production-cli-onboarding/unit-probe，复制回该深度使用），数据库只在容器临时目录。原型unit.mjs不是产品代码。

边界：ALS只检测活跃帧、重叠子调用、结束时在途和关闭后调用；不证明每个Promise被await，可信owner仍不得偷存裸SQL句柄或内部吞不可恢复错误。单元query不冒充硬只读。通知不是outbox，提交未知不自动补偿。没有完整AI/OG共同事务、生产身份权限、CLI/TUI、PG新组合、断电或灾备验证。
