# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、夹具边界、运行方式与缺口
- [public-entry.spec.ts](public-entry.spec.ts)：导出集合、无 `./cordis`、依赖规则、材料与 LIMIT 检查
- [tenant-isolation.spec.ts](tenant-isolation.spec.ts)：租户隔离与事务域目录
- [delegated.spec.ts](delegated.spec.ts)：委派视图的符合性与跨租户用例
- [operation-evidence.spec.ts](operation-evidence.spec.ts)：操作记录的访问证据与它的迁移
- [principal-bindings.spec.ts](principal-bindings.spec.ts)：会话归属读口的符合性与跨租户用例
- [real-provider.spec.ts](real-provider.spec.ts)：真实 sqlite-provider 上的组合用例
- [fixtures/](fixtures/index.md)：`node:sqlite` 与真实提供者的测试夹具
