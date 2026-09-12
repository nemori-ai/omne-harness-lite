# Agent 核心第一版提案追踪

[提案入口](README.md)，状态 in-review。

本文件只追踪本提案的来源、候选名称和验收场景；正式规格的追踪职责由
[`docs/maintenance/verification.md`](../../../maintenance/verification.md) 定义。本提案未被接受前，
不得把本表登记进正式 catalog 或当作实现/形式化验证证据。

| 用户要求 | 来源证据 | 模型与场景 |
|---|---|---|
| 系统提示词综合 DSH/Pi/LangChain | sources.md 三方事实与子任务结果 | system-prompt.md；Profile/Section/Contribution/RequestSnapshot；P1–P4 |
| 工具沿用 OMNE | sources.md 组件 Schema、ADR-120/127、tier-aware requirement | tools.md；ComponentRef/Profile/ToolVariant、执行事实与结果保管；T1–T4 |
| Session/Turn/Run/Step 对照 DSH/Pi/OMNE | sources.md 术语矩阵、ADR-130/131、DSH/Pi loop | execution.md；Turn 输入、Run、Step、Action、Attempt；E1–E6 |
| 分层索引与精确引用 | 历史 `spec/archive/ddd-models/domain/registry.json` | 模型文件、目录与注册项已撤回；只保留提案内名称与讨论 |
| 来源与本地提案区分 | sources.md 的 revision/工作树说明 | 仅提案为 proposed，review.md 明确待裁决点 |

本表的 sources/system-prompt/tools/execution/review 文件均位于本目录。
TLA+ / Alloy / 运行实现证据：尚未覆盖，本次产物是 review 提案。
