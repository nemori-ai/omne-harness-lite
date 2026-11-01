# 存储 Worker 探针

本工具保存存储事务设计的既有 Worker 探针。它使用 Node 标准库，不是 workspace 包，不提供生产存储实现。事务行为由[存储规格](../../packages/storage/sql-contract/SPEC.md)拥有，探针的覆盖与限制见[原观察记录](../../packages/storage/sqlite-provider/docs/probe-observations.md)。

## 运行

从仓库根运行。

```sh
node tools/storage-probe/worker-probe.mjs
```

运行环境必须提供 `node:sqlite`、Worker、SQLite authorizer 和 SQLite 3.51.3 或更高版本。规格基线是 Node 24.21.0 内嵌的 SQLite 3.53.4。探针启动时核对 SQLite 版本和连接设置。缺少所需 API 或版本时不能将运行记为通过。

探针在临时目录中创建数据库，结束时清理这些文件。它检查 Worker 提交、查询、取消观察和关闭交接。它不证明物理断电耐久、生产实现符合性或慢语句期间的内存上界。

## 维护

本脚本随 #325 从规划成员目录迁出，迁移提交保持脚本内容不变。后续仅删除未使用的事务关键字集合并按工具规则格式化，故障输入和结果记录保持不变。存储契约维护者负责同步探针和覆盖说明。未来生产提供者建立后，由其验证资源承接对应的符合性检查。
