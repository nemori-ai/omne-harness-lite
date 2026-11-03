# W1 波包：契约地基

格式沿 `.meta_harness/human/map-reduce-delivery/templates/line-pack.md`，按[范式 r1](../operating-model.md) 变通：两条线合一份，没有线父卡、binding、轨道与 gate。

## 1. 线与当前波

| 项目 | 本次值 |
| --- | --- |
| 仓库、里程碑、reduce | `nemori-ai/omne-harness-lite`；边界是 M2 完结（[#784](https://github.com/nemori-ai/omne-harness-lite/issues/784)）；reduce 是本会话 |
| 线 | Skill 线、MCP 线，线负责人都是本会话 |
| 当前波 | W1，两条线都 active |
| 父分支与冻结输入 F | `PanQiWei/skill-mcp`，F = `21175c9f9f05a29d1db509420b75d2b016ed2fbe`（含 w1-prep 的依赖声明与锁文件） |
| 开波同步 | `origin/integration/mainline` = `24e5ba838`，已是父分支祖先，无需合并（2026-11-03 读回） |
| 上下文地图 | [Skill](../line-skill/context-map.md)、[MCP](../line-mcp/context-map.md)；共用约束 [constraints.md](../constraints.md) |

## 2. 两条线在 M2 完结前的目标、边界与验收

- 目标：两个领域的契约、通用实现与本地宿主在替身端口上完整可用，M2 之后只需接真实提供者。见[波段计划](../rolling-plan.html)。
- 边界：只写 `packages/skills/*` 与 `packages/mcp/*`；不接真实提供者；不进应用插件树。
- 验收：每波出口判据有证据；组页的「归 SPEC」项全部落到成员 SPEC 或具名剩余义务。

## 3. 本波交付边界

### 3.1 成果与判据

| 成果 | 验收判据与证据 |
| --- | --- |
| `@omne-harness/skill-contract` 的 W1 公开形状 | 见 [skill/spec.md](skill/spec.md) 判据 SC1–SC8 |
| `@omne-harness/mcp-contract` 的 W1 公开形状 | 见 [mcp/spec.md](mcp/spec.md) 判据 MC1–MC8 |
| 两份源码技术文档首版 | reduce 在两个闭包合入后重生成并发布 |

### 3.2 明确不做

- 应用服务的实现（`createSkillAccess`、`createMcp` 等），W2 做。
- `SkillAccess` 的符合性套件（需要 W2 的实现来验证套件本身），W2 做。
- `McpTransport` 的契约测试套件与真实服务端夹具，W3 做。
- 任何官方 MCP SDK 依赖。
- 修改组页、领域页、统一语言：只由 reduce 在波末做。

### 3.3 冻结输入与写集

- F：`21175c9f9f05a29d1db509420b75d2b016ed2fbe`。
- 依赖的外部契约：`@omne-harness/assets`（`BodyContract`、`CapabilityId`、`JudgeContext`、`Declarations`、`readBodyText`、`readSnapshot`）、`@omne-harness/operation-result`、`@omne-harness/legal-identity`、`@omne-harness/json-text`、`@omne-harness/content-block`（仅 MCP），均以 F 上的版本为准。
- 本线对外承诺的契约：两个契约成员。本波首次建立公开形状；合入后只做可加改动。
- 写集：`w1-skill-contract` 只写 `packages/skills/skill-contract/`；`w1-mcp-contract` 只写 `packages/mcp/mcp-contract/`。两者不相交。
- 禁写：`package.json` 的 `dependencies` 段、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、组页、领域页、`.meta_harness/`。需要新依赖时停下交回。

### 3.4 需负责人批复

无。

### 3.5 停止条件

- 两个闭包都合入父分支、波末门槛跑完时，本波结束。
- 需要做 3.2 中的事或越过写集时，停止依赖部分，交回时写明。

## 4. 方法与验证

| 项目 | 本次值 |
| --- | --- |
| 主工作类型 | feature（开发为主），poteto-mode |
| 风险级别 | L2：实现评审。成员 SPEC 另派 design-reviewer 做表达评审 |
| 闭包门槛 | 见[范式 r1 §6](../operating-model.md#6-质量门槛) |
| 进度记录 | 各线 `plan.md` 的进度总览；侧边栏进展页 |

## 附录：闭包

| 闭包 | 写范围 | 依赖 | 规格 |
| --- | --- | --- | --- |
| `w1-skill-contract` | `packages/skills/skill-contract/` | F | [delegate/closures/w1-skill-contract.md](../../delegate/closures/w1-skill-contract.md) |
| `w1-mcp-contract` | `packages/mcp/mcp-contract/` | F | [delegate/closures/w1-mcp-contract.md](../../delegate/closures/w1-mcp-contract.md) |

两个闭包并行。
