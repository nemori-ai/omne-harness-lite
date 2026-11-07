# 持续测试

`schema.spec.ts` 使用真实 SQLite 检查表键、状态约束、精确支持关系、磁盘重开与查询索引。`materials.spec.ts` 将生产迁移交给真实 Worker；其 schema-writer 是具名测试参与者，不是生产业务服务。`public-entry.spec.ts` 核对实际材料文件摘要。

先运行本成员 build，再运行 test:fast。测试只创建隔离数据库，不消费生产数据。业务服务、授权和 Cordis 生命周期尚未实现，不宣称独立接受。

`operations.spec.ts` 使用生产私有事务函数及具名协调夹具，测试原操作恢复、登记和精确撤除。`definitions.spec.ts` 检查设置、权限与完整投影。这些操作测试中的准入仍是具名夹具。真实 Identity 组合由 standing.spec.ts 单独验证，发行者仍待接线。

`standing.spec.ts` 装配真实 Identity、密码服务及 SQLite，验证资格保留、结算、成员撤权、目的不可用后的恢复及提交竞争。业务运输使用 operation-writer 测试参与者，内部调用生产私有事务函数。`standing-custody.spec.ts` 用具名回执夹具检查磁盘重开、完整身份隔离和资格集合规范化，不把计算出的 ID 当作真实授权。
