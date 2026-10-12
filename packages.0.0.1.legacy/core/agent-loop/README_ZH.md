# @omne-harness-lite/agent-loop

[English](README.md)

基于固定会话观测作出确定性决定，并提供显式的尝试执行与释放端口。

用 `nextStep` 作纯判断。向 `createAttemptOwner`、`driveStep` 与 `releaseAttempt` 提供真实拥有者的能力。缺失能力返回 blocked，不把操作记为完成。

公开类型与函数由本包维护。[薄规格](SPEC.md)约束类型表达不出的行为。[公共入口测试](tests/loop.spec.ts)提供可运行示例。实现完成、交付评审与接受分别核定。

按[开发指南](../../../docs/development.md)准备环境，先构建依赖。

```sh
pnpm --filter @omne-harness-lite/agent-loop run build
pnpm --filter @omne-harness-lite/agent-loop run typecheck
pnpm --filter @omne-harness-lite/agent-loop run test
```
