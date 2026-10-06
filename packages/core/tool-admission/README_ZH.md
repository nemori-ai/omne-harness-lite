# tool-admission

[English](README.md)

工具准入、runner 经过来源与核验动作历史契约。准入 token 定位结论，持久核验与当前权限决定能否执行。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

类型之外的已迁行为归 [SPEC.md](SPEC.md)。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/tool-admission run build
pnpm --filter @omne-harness-lite/tool-admission run typecheck
pnpm --filter @omne-harness-lite/tool-admission run test
```
