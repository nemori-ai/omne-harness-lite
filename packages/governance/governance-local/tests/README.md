# 持续测试

`schema.spec.ts` 使用真实 SQLite 检查表键、状态约束、精确支持关系、磁盘重开与查询索引。`materials.spec.ts` 将生产迁移交给真实 Worker；其 schema-writer 是具名测试参与者，不是生产业务服务。`public-entry.spec.ts` 核对实际材料文件摘要。

先运行本成员 build，再运行 test:fast。测试只创建隔离数据库，不消费生产数据。业务服务、授权和 Cordis 生命周期尚未实现，不宣称独立接受。
