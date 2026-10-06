# runtime-context-local

[English](README.md)

独立 createRuntimeContext 与 createContextSessionInitializer 工厂、历史检查及上下文投影。owner 重放耐久前缀，不提供后续持久当前投影或 O(1) 要求。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

类型之外的已迁行为归 [SPEC.md](SPEC.md)。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/runtime-context-local run build
pnpm --filter @omne-harness-lite/runtime-context-local run typecheck
pnpm --filter @omne-harness-lite/runtime-context-local run test
```
