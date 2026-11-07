# 持续测试

`schema.spec.ts` 使用真实 SQLite 检查表键、状态约束、精确支持关系、磁盘重开与查询索引。`materials.spec.ts` 将生产迁移交给真实 Worker；其 schema-writer 是具名测试参与者，不是生产业务服务。`public-entry.spec.ts` 核对实际材料文件摘要。

先运行本成员 build，再运行 test:fast。测试只创建隔离数据库，不消费生产数据。业务服务、授权和 Cordis 生命周期尚未实现，不宣称独立接受。

`operations.spec.ts` 使用生产私有事务函数及具名协调夹具，测试原操作恢复、登记和精确撤除。`definitions.spec.ts` 检查设置、权限与完整投影。这些操作测试中的准入仍是具名夹具。真实 Identity 组合由 standing.spec.ts 单独验证，发行者仍待接线。

`standing.spec.ts` 装配真实 Identity、密码服务及 SQLite，验证资格保留、结算、成员撤权、目的不可用后的恢复及提交竞争。业务运输使用 operation-writer 测试参与者，内部调用生产私有事务函数。`standing-custody.spec.ts` 用具名回执夹具检查磁盘重开、完整身份隔离和资格集合规范化，不把计算出的 ID 当作真实授权。

`recovery-read.spec.ts` 检查业务与保管状态的16种组合、旧Schema增量迁移、跨页和错scope游标、真实Worker磁盘重开及终态保留的退出。一万条已结算历史操作下，实际候选SQL必须使用恢复索引且不建立临时排序。该查询计划检查不报告端到端速度。

`activation.spec.ts` 使用生产计划模块、唯一写者和材料描述符，验证互斥组合、必需fact、请求摘要、命令族隔离及当前证据规范性。Identity回执、准入和当前事实来源在该组中使用具名夹具；真实Identity组合由standing.spec.ts单独验证。测试运输不等于生产公开协调器的阶段保管。跨域下游故障回滚仍须在完整Settings组合中验收。

`sql-stage.spec.ts` 使用生产阶段保管和只读材料，验证完整请求不可替换、错绑定与过大请求拒绝、并发首次保存、磁盘重开和原回执认回。回包丢失通过忽略一次提交结果再查询原身份模拟，不宣称已经注入进程崩溃或断电。完整公共协调器仍须独立验收。
