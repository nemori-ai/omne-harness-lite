# 公开接口导航

## 导出入口

根入口导出 [governanceSqlMigrations](../src/materials.ts)，供受信装配者组合固定 SQL 材料。它不接受客户端参数，不执行治理业务。`./cordis` 暂无运行导出。

## 定义索引

迁移描述遵循 sql-contract 的 SqlMaterialCatalog。业务命令和查询类型归 [governance-contract](../../governance-contract/docs/public-api.md)。关系约束与未完成范围见 [SPEC](../SPEC.md)，不在这里复制签名。
