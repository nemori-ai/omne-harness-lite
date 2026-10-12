# loop-extension-runner

[English](README.md)

runner 链、准入、动作及历史契约，以及纯 codec 和输入辅助函数。定义包不运行 Agent Loop。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

类型之外的已迁行为归 [SPEC.md](SPEC.md)。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/loop-extension-runner run build
pnpm --filter @omne-harness-lite/loop-extension-runner run typecheck
pnpm --filter @omne-harness-lite/loop-extension-runner run test
```
