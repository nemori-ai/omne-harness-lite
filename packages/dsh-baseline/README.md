# DSH 定向源码基线

本包保存本项目维护的 DSH 源机制，作为后续二次开发起点。它不是 D-008 的
产品实现。全部导出在 `@omne-harness-lite/dsh-baseline/baseline/*`；目标身份、
授权、耐久记录和工作协议继续以 [spec](../../spec/catalog.json) 为准。

共享 scope 只消费 `@omne-harness-lite/agent/scope-baseline`，避免两套作用域
符号／父链互不相识。来源类型只在 baseline 模块间使用，不冒充 core-work v1。

[施工计划](../../docs/proposals/core-capabilities/fork/plan.md)说明范围；
[UPSTREAM](UPSTREAM.md)与[清单](provenance.json)追踪原件和改动。
构建与检查：`pnpm --filter @omne-harness-lite/dsh-baseline check`。
