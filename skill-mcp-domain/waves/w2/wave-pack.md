# W2 波包：通用实现与本地来源

格式沿 `.meta_harness/human/map-reduce-delivery/templates/line-pack.md`，按[范式 r1](../operating-model.md) 变通：两条线合一份，没有线父卡、binding、轨道与 gate。

## 1. 线与当前波

| 项目 | 本次值 |
| --- | --- |
| 仓库、里程碑、reduce | `nemori-ai/omne-harness-lite`；边界是 M2 完结；reduce 是本会话 |
| 线 | Skill 线、MCP 线，线负责人都是本会话 |
| 当前波 | W2，两条线都 active |
| 父分支与冻结输入 F | `PanQiWei/skill-mcp`，F = `b0f2ec7fb15a3f8572a36ef71af2fd30bf90ca01`（含 w2-prep：三个草稿成员的依赖与锁文件、两处 SPEC 张力裁定、MCP 组页四处写回；prep2：`PeerIdentity.serverInfo` 可选） |
| 开波同步 | `origin/integration/mainline`（3e22e2f1c）已于 e54c974fd 合入父分支，无冲突 |
| 开波前检查项 | [wave-queue.md](../wave-queue.md)「W2 开波前检查项」八项全部处置：主线合入；[2026-07-28 核对](schema-check.md)（W2 只受一项影响，已 prep2；13 项落 W3）；Skill `known-unavailable` 与 MCP S1/S2 两处张力已裁进 SPEC；MCP 组页 S7 四态、D4、`action`、Q-MC06 已写回；两线规格形态一致（本波两份 spec 同骨架）；夹具缺口与类型环下沉写进本波闭包规格 |
| 上下文地图 | [Skill](../line-skill/context-map.md)、[MCP](../line-mcp/context-map.md)；共用约束 [constraints.md](../constraints.md) |

## 2. 两条线在 M2 完结前的目标、边界与验收

同 [W1 波包 §2](../w1/wave-pack.md#2-两条线在-m2-完结前的目标边界与验收)。

## 3. 本波交付边界

### 3.1 成果与判据

| 成果 | 验收判据与证据 |
| --- | --- |
| `@omne-harness/skill`：`createPackageInspection`、`createSkillAccess`（describe、read、list、export） | [skill/spec.md](skill/spec.md) 判据 SK2-1–SK2-7 |
| `@omne-harness/skill-contract/testing` 可加：`skillAccessConformance`、`manifest.ts` 边界夹具 | SK2-5、SK2-8 |
| `@omne-harness/skill-host-local`：`createDirectorySource` | SK2-9–SK2-12 |
| `@omne-harness/mcp`：`createMcpCore`（inspection、discovery、status、connections）、`createInMemoryCatalogStore`、聚合 `Connection` 与 `InFlightCalls`、关口 `admit` | [mcp/spec.md](mcp/spec.md) 判据 MC2-1–MC2-10 |
| `w2-spike`（reduce，tmp）：官方 SDK 2.3.1 最小往返，结论进 W3 规格 | `waves/w2/spike/README.md` |
| 实现架构页与进展页随每个闭包合入更新 | reduce |

### 3.2 明确不做

- `SkillCatalog`（`summaries`、`search`）：W3。
- `ActionInvoker`（`invoke`、`continueWithInput`、`cancel`、四个任务操作）与任务表：W3。`createMcp` 在 W3 由 `createMcpCore` 加 invoker 组成。
- stdio 与 Streamable HTTP 的真实传输、官方 SDK 依赖、真实服务端夹具：W3。
- Cordis 契约成员与插件：W4。
- 内容存储来源（`content-store` 定位）：W3 之后。
- 组页、领域页、key-flows、统一语言：只由 reduce 在波末写回。

### 3.3 冻结输入与写集

- F：`b0f2ec7fb15a3f8572a36ef71af2fd30bf90ca01`。
- 依赖的契约：`@omne-harness/skill-contract`（`.`、`./provider`、`./testing`）、`@omne-harness/mcp-contract`（同三入口）在 F 的形状。两个契约成员的 SPEC 是现行源。
- 写集：

| 闭包 | 写范围 | 禁写 |
| --- | --- | --- |
| `w2-skill` | `packages/skills/skill/`；`packages/skills/skill-contract/src/` 只做可加改动（新文件或新导出，不改已有签名与行为） | `skill-host-local`、`mcp/*`、依赖段、锁文件、组页 |
| `w2-skill-host` | `packages/skills/skill-host-local/` | `skill`、`skill-contract`、依赖段、锁文件、组页 |
| `w2-mcp-core` | `packages/mcp/mcp/` | `mcp-contract`、`mcp-host-local`、依赖段、锁文件、组页。需要契约可加改动时停下交回 |

三个写集互不相交。`w2-skill` 与 `w2-skill-host` 都读 `skill-contract`，只有 `w2-skill` 能加它。

- 禁写（全部闭包）：各成员 `package.json` 的 `dependencies`/`devDependencies`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、组页、领域页、`.meta_harness/`。需要新依赖时停下交回。

### 3.4 需负责人批复

无。W2 范围内的两处偏离（`export` 从 W3 提前到 W2；`createMcp` 推后到 W3，W2 交 `createMcpCore`）由 reduce 裁定，记进 [wave-queue.md](../wave-queue.md) 修订表。

### 3.5 停止条件

- 三个闭包都合入父分支、波末门槛跑完时，本波结束。
- 写者需要 3.2 中的事、越过写集，或发现契约与 SPEC 不足以实现时，停止依赖部分，交回时写明。

## 4. 方法与验证

| 项目 | 本次值 |
| --- | --- |
| 主工作类型 | feature（开发为主），poteto-mode Feature 步骤；`how`/`architect` 两步由 DDD 建模（`model/`）与 W1 SPEC 承担，不再并行探索 |
| 风险级别 | `w2-skill` L3（读取关口：无披露、依据、竞争）；`w2-mcp-core` L3（连接键隔离、凭据句柄生命周期、并发发布）；`w2-skill-host` L2 |
| 闭包门槛 | 见[范式 r1 §6](../operating-model.md#6-质量门槛)；L3 热点由 reduce 逐行读 |
| 评审 | 每闭包：review-delivery（按本波 spec 验收清单）、review-code 四面（正确性、结构读数、设计与实践、差分变异）；L3 另派 implementation-reviewer 逐行读热点 |
| 进度记录 | 各线 `plan.md` 的进度总览；侧边栏进展页 |

## 附录：闭包

| 闭包 | 写范围 | 依赖 | 规格 | 模型@档位 |
| --- | --- | --- | --- | --- |
| `w2-skill` | `packages/skills/skill/`、`skill-contract/src/`（可加） | F | [delegate/closures/w2-skill.md](../../delegate/closures/w2-skill.md) | claude-fable-5-1@high（security-sensitive） |
| `w2-skill-host` | `packages/skills/skill-host-local/` | F | [delegate/closures/w2-skill-host.md](../../delegate/closures/w2-skill-host.md) | claude-opus-5-5@high |
| `w2-mcp-core` | `packages/mcp/mcp/` | F | [delegate/closures/w2-mcp-core.md](../../delegate/closures/w2-mcp-core.md) | claude-fable-5-1@high（security-sensitive、并发） |

三个闭包并行。`w2-spike` 由 reduce 在等待期间做。
