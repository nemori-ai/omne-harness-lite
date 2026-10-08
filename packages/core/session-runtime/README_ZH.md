# @omne-harness-lite/session-runtime

[English](README.md)

会话操作、回执、协调端口和尝试事实。本包定义服务契约；会话调度器与状态数据库由提供者实现。

根入口导出操作校验与尝试事实 codec。`./cordis` 入口导出用于应用装配的服务定义。

公开类型与函数由本包维护。[薄规格](SPEC.md)约束类型表达不出的行为。[公共入口测试](tests/facts.spec.ts)提供可运行示例。实现完成、交付评审与接受分别核定。

按[开发指南](../../../docs/development.md)准备环境，先构建依赖。

```sh
pnpm --filter @omne-harness-lite/session-runtime run build
pnpm --filter @omne-harness-lite/session-runtime run typecheck
pnpm --filter @omne-harness-lite/session-runtime run test
```
