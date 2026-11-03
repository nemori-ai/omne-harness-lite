# 线级上下文地图：MCP（无卡，负责人会话内要求）

格式沿 `claim` 技能 `references/context-map.md`。路径相对父工作树根 `/home/user/omne-harness-lite/.worktrees/skill-mcp`（闭包工作树同布局）。

## 不变量

- 不同租户、不同对端账号永不共用一条 MCP 连接。来源：`packages/mcp/docs/architecture.md`「MCP 连接」不变式 1。
- 迟到响应按代际识别，旧代际不改变新状态、不发布新清单。来源：同节不变式 2。
- MCP 已知动作不静默消失；只有合法取得的完整清单能加入新动作；清单整份发布。来源：「MCP 动作清单与 MCP 已知动作」不变式 1–4。
- 不自动重发；已发出无应答报 `unknown`，不压成失败。来源：「调用结果」「应用服务」调用口。
- 未采用、无权、不存在对任一主体不可区分。来源：「资格与换代」。
- 秘密值不进入 MCP 的内存表示、清单、日志、错误文本。来源：「MCP 声明的端口」`CredentialUse`、`ProcessLanding` 两行。

## 系统地图

- `docs/orientation.md`：仓库定向页。本项固定，不删。
- `docs/domains/mcp/README.md`、`architecture.md`：领域责任与端口实现方。

## 先读什么，读到哪停

1. `docs/orientation.md`：读到能找到 MCP 领域的拥有者为止。
2. `packages/mcp/README.md`：全文。
3. `packages/mcp/docs/architecture.md:1-536`：边界、设计守则、协议基线、模型、端口、应用服务、调用结果、内容交付、失败种类、SOLID。停在「同提交与可靠交接」之前；Q-MC02–Q-MC06 只在规格引用时读。
4. `tmp/skill-mcp-domain/model/README.md` 的「MCP 上下文」「建模发现」两节，以及 `model/mcp/*.ts`。
5. `packages/assets/assets/src/identity.ts`：`BodyContract` 的真实形状。
6. `packages/common/json-text/src/types.ts`：`JsonValue` 的无损形状（数字保留字面量）。
7. 协议：MCP 2026-07-28 修订的 schema（只在写 `classifyOutcome`、`toContentBlocks` 时读，按需取对应类型）。

不要读：`packages.0.0.1.legacy/`；官方 SDK 源码（W3 才用，且只在 mcp-host-local）。

## 本线最容易踩的耦合

- 让官方 SDK 的类型进入 mcp-contract 或 mcp。
- 把授权流程、令牌续期、凭据保管、进程落点选择建进 MCP。
- 让协议版本进入清单键（会让已知动作在换版本时离开清单）。
- 在契约里点名工具执行、会话或 Agent；把动作在调用方体系里的名字当成本组责任。

## 相邻线的接口

| 相邻线 | 它提供什么 | 它需要本线提供什么 |
| --- | --- | --- |
| Skill 线 | 无 | 无。两线互不依赖 |
| assets（不在本会话） | `BodyContract` 等公开类型（已存在） | 接入点正文的类别端口 |

## 本线加载

- 执行角色：`developer`，`implementation_kind: product`。
- 三层技能：同 Skill 线。写 `.ts` 时 `pstack:typescript-best-practices`。
- 共用约束：[constraints.md](../constraints.md)。
