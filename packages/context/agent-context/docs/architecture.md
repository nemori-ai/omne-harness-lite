# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

本包现在有一个模块 `src/account-outlet.ts`（出站工厂、目标解析器类型、缺席解析器）和一个绑定 `src/cordis.ts`（出站插件）。根入口不导入 Cordis。

| 依赖                                               | 用途                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `agent-contract`                                   | 出站端口 `AgentAccountOutlet`、交接 `AgentAccountHandoff`、结果 `AgentAccountOutcome` |
| `agent-cordis-contract/cordis`（仅绑定）           | 抽象服务 `AgentAccountOutletService`                                                  |
| `request-context-contract`                         | 收件口 `ContextAccountingInbox`、账目事实与目标类型                                   |
| `request-context-cordis-contract/cordis`（仅绑定） | 键 `requestContext`、`contextAccountingInbox`                                         |
| `model-contract`                                   | 解码并核对 `ModelInvocationRef`                                                       |
| `legal-identity`                                   | 租户相等                                                                              |

这个包是 Context 组里唯一导入 Agent 契约的成员。适配器放在任何一个现有 Context 成员里，都会让该成员依赖 Agent 契约，违反[组架构](../../docs/architecture.md)里 Context 契约不依赖 agent-contract 的方向。

## 关键机制与理由

- 先核租户再解析目标。调用的租户不是访问的租户时，不问解析器、不问收件口，别的租户得不到作用域状态的任何信息。
- 解析器作为工厂参数。账目属于哪个目标，`AgentAccountHandoff` 没有字段回答，调用身份里也没有作用域。本波没有提供者，所以插件传缺席解析器，`deliver` 答 `unavailable('scope-unresolved')`。这是显式的缺口，不伪造成功，也不从文本猜作用域（[ACCT-TARGET](../SPEC.md#已知限制)）。
- 出站无状态。重试、待办与回执的保管在接收方；出站缓存回执会让一次成功的答复遮住后来的收件口状态。
- 收件口抛出时答 `unknown`，不答 `unavailable`：写入可能已经发生，`unknown` 才表达这一点。
- 插件同时 `inject` `requestContext` 与 `contextAccountingInbox`。后者就是出站用的收件口，前者表达「同一 `request-context` 行」的装配事实，使出站与窗口占用读同一份状态。

## 验证与维护

验证资源在 `tests/`，场景见 [SPEC 的持续验证](../SPEC.md#持续验证)。依赖键或收件口形状变化时，同步插件的 `inject`、SPEC 的映射表与 `tests/`。第二步（`agentRequests`、`agentModelContext`）落字时，本文件加上登记表、暂存表与材料库的模块与依赖。
