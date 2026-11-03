# 成员架构

## 模块与依赖

[storage](../src/storage/provider.ts)提供发布 repository/persistence、迁移和参加者。[supply-storage](../src/supply-storage/provider.ts)保管材料、probe、运行记录及恢复分页。[sources](../src/sources/index.ts)执行受限 probe/acquire，纯解析与政策在 calendar。根入口还导出 seeds 的发行 registry 与 metadata，以及 runner 的构造器；`./cordis` 提供查询和供应两个 provider。精确入口见[公开索引](public-api.md)。

成员关系见[组架构](../../docs/architecture.md)，公共服务 DTO 与本机工厂配置分开。

## 关键机制与理由

所有 SQL 写入经 sql-contract 具名材料和 participant，不暴露任意事务回调。解析、网络和业务校验在事务外，提交内复核 generation、原操作与适用资格。发布版本原子关联原 candidate，snapshot 来源 authority 与本机 rawReference 分离。已发布版本缺原材料关联或 hash/来源不匹配明确失败，不能降成空贡献。

## 验证与维护

持续资源见[测试](../tests/README.md)。公开形状修改时同步真实消费者，行为修改回 [SPEC](../SPEC.md)。本域验证、独立接受和 M2 后真实跨域装配分别取证。
