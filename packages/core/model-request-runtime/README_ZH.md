# model-request-runtime

[English](README.md)

模型请求数据、transport 与构造类型、codec，以及纯 retryDelay 计算。SPEC.md 仅拥有已迁的纯退避行为。完整十五操作与耐久生命周期继续沿精确现行源读取。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

类型之外的已迁行为归 [SPEC.md](SPEC.md)。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

目标集成边界与责任选择见 [ADR](adr/runtime-integration.md)。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/model-request-runtime run build
pnpm --filter @omne-harness-lite/model-request-runtime run typecheck
pnpm --filter @omne-harness-lite/model-request-runtime run test
```
