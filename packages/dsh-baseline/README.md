# DSH 定向源码基线

本包保存本项目维护的 DSH 源机制，作为后续二次开发起点。它不是 D-008 的
产品实现。全部导出在 `@omne-harness-lite/dsh-baseline/baseline/*`；目标身份、
授权、耐久记录和工作协议继续以 [spec](../../spec/catalog.json) 为准。

共享 scope 只消费 `@omne-harness-lite/agent/scope-baseline`，避免两套作用域
符号／父链互不相识。来源类型只在 baseline 模块间使用，不冒充 core-work v1。

| 子路径（`baseline/` 后） | 可消费的源机制 |
|---|---|
| `brand`、`values`、`timeout` | 品牌辅助、JSON 快照/冻结、可释放的取消/计时辅助 |
| `llm`、`media` | 消息与流装配、请求配置、错误、归因及有限媒体类型/纯函数 |
| `session`、`projection` | 内存 Session/历史/surface、受管投影及 fold |
| `persistence`、`jsonl` | 存储接口与校验、普通文件读写/同步/截回；没有完整后端 |
| `prompt`、`tools` | 动态贡献/装配、Schema DSL、scope 可见性与 native 调用 |
| `loop` | Session 上下文和 assistant 流投影；没有完整 Run driver |

这些源接口不提供目标租户授权、耐久审批或独立执行保证。`persistence` 的
服务/句柄是源抽象与校验入口，`jsonl` 的调用者必须先拥有受信路径及独占写入权。
模型入口没有网络 adapter；所有真实模型请求仍须按目标契约经 OpenRouter 实现。

[施工计划](../../docs/proposals/core-capabilities/fork/plan.md)说明范围；
[UPSTREAM](UPSTREAM.md)与[清单](provenance.json)追踪原件和改动。
构建与检查：`pnpm --filter @omne-harness-lite/dsh-baseline check`。
该检查同时消费当前 agent 产物，首次验证请从根运行 `pnpm check`，按依赖顺序构建两包。
