# 持续测试

`registrar.spec.ts` 通过真实 Identity 和生产 SQL 材料调用贡献/退出应用方法。它验证并发认回、兄弟租约、当前状态与原回执分离、源离线、Worker 重开、保存 submit 后换当前配置、丢失业务回包及观察、停止入口和撤权交错。`registrar-world.ts` 的发布 source 是具名 fixture，测试不证明具体功能或资产发行权威已装配。数据库重开复用同一主体发行权威和相同 SQL 材料，不声明进程间身份认证或任意升级保证。

`admission.spec.ts` 区分发行真实性、装配委托、当前成员及资格、来源真实性的责任。测试逐字段修改 EnforcementBinding，检查 owner 交叉组合及异步改参不能扩权，并使用生产 Identity SQL 撤权。当前测试没有把私有准入对象宣称为已导出的业务服务。

`schema.spec.ts` 使用真实 SQLite 检查表键、状态约束、精确支持关系、磁盘重开与查询索引。`materials.spec.ts` 将生产迁移交给真实 Worker；其 schema-writer 是具名测试参与者，不是生产业务服务。`public-entry.spec.ts` 核对实际材料文件摘要。

先运行本成员 build，再运行 test:fast。测试只创建隔离数据库，不消费生产数据。业务服务、授权和 Cordis 生命周期尚未实现，不宣称独立接受。

`operations.spec.ts` 使用生产私有事务函数及具名协调夹具，测试原操作恢复、登记和精确撤除。`definitions.spec.ts` 检查设置、权限与完整投影。这些操作测试中的准入仍是具名夹具。真实 Identity 组合由 standing.spec.ts 单独验证，发行者仍待接线。

`standing.spec.ts` 装配真实 Identity、密码服务及 SQLite，验证资格保留、结算、成员撤权、目的不可用后的恢复及提交竞争。业务运输使用 operation-writer 测试参与者，内部调用生产私有事务函数。`standing-custody.spec.ts` 用具名回执夹具检查磁盘重开、完整身份隔离和资格集合规范化，不把计算出的 ID 当作真实授权。

`recovery-read.spec.ts` 检查业务与保管状态的16种组合、旧Schema增量迁移、跨页和错scope游标、真实Worker磁盘重开及终态保留的退出。一万条已结算历史操作下，实际候选SQL必须使用恢复索引且不建立临时排序。该查询计划检查不报告端到端速度。

`activation.spec.ts` 使用生产计划模块、唯一写者和材料描述符，验证互斥组合、必需fact、请求摘要、命令族隔离及当前证据规范性。Identity回执、准入和当前事实来源在该组中使用具名夹具；真实Identity组合由standing.spec.ts单独验证。测试运输不等于生产公开协调器的阶段保管。跨域下游故障回滚仍须在完整Settings组合中验收。

`sql-stage.spec.ts` 使用生产阶段保管和只读材料，验证完整请求不可替换、错绑定与过大请求拒绝、并发首次保存、磁盘重开和原回执认回。回包丢失通过忽略一次提交结果再查询原身份模拟，不宣称已经注入进程崩溃或断电。完整公共协调器仍须独立验收。

`sql-coordinator.spec.ts` 将内部 SQL 协调器接到真实 Worker。它覆盖受理重传、首次读取与并发提交之间的交错、固定阶段、输入快照、重开和旧组合恢复。故障包装器在真实提交后丢弃回包或修改返回回执，检查原身份认回及拒绝错回执。包装器不是实际网络或断电故障；完整跨进程注入归最终组合验收。


`standing-coordinator.spec.ts` 将真实Identity与生产Governance材料装在同一SqlStorage实例的独立事务域，验证受信恢复适配器和私有服务协调。`standing-world.ts`允许选择实际后端和目的适配器，已有私有事务测试仍用原夹具。数据库重开复用相同源码材料，测试不会把重装配等同于任意版本升级保证。
