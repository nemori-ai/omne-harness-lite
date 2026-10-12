# tool-execution-runtime

[English](README.md)

工具执行、结果、提供者构造与日志契约，以及日志 codec 和投影。运行时 owner 在外部作用前确认耐久意图，裸调用不提供持久唯一性或恢复。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

类型之外的已迁行为归 [SPEC.md](SPEC.md)。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/tool-execution-runtime run build
pnpm --filter @omne-harness-lite/tool-execution-runtime run typecheck
pnpm --filter @omne-harness-lite/tool-execution-runtime run test
```
