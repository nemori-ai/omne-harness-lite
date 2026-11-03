# W2 MCP 线交付计划：`@omne-harness/mcp` 核心

格式沿 `claim` 技能 `references/plan-template.md`，方法 Matt `to-tickets`。与同目录 [spec.md](spec.md) 配套。

## 进度总览

进度：[□□□□□□□□□□] 0/5 切片已完成 · 更新 2026-11-03T17:50:00Z · head b0f2ec7fb
当前：切片 01 第 2 步（写闭包规格）

| 切片 | 交付的行为 | 对应判据 | 状态 |
| --- | --- | --- | --- |
| 01 | 两个聚合与关口：状态机穷举、在途表、`admit` 与能力令牌；`McpConfig` 校验 | MC2-1–MC2-4 | 待做 |
| 02 | 连接表与 `ensure`：复用、重建、单飞、配值与连接失败、句柄释放；内存存储过 CS 套件 | MC2-5、MC2-10 | 待做 |
| 03 | `refresh`、`current`、`peer`：整份发布、保留原因、并发发布边界 | MC2-6、MC2-7 | 待做 |
| 04 | `status` 与 `connections`：视图四态、`close()` 次序、`residual`、`closeAll` | MC2-8、MC2-9 | 待做 |
| 05 | `inspection`、`createMcpCore` 组装、README「给下一波」 | MC2-1 | 待做 |

| 闭包 | 写者模型@档位 | 清晰度 | 工作树 | 分支 | 状态 | 轮次 | 追加 | 验收报告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| w2-mcp-core（切片 01–05） | claude-fable-5-1@high | 定 | `.worktrees/w2-mcp-core` | `PanQiWei/skill-mcp-w2-mcp-core` | 待派 | 0 | 0 | — |

五个切片写同一成员，合成一个闭包，一个写者按 01→05 顺序做。

## 角色与模型分配

同 [Skill 线计划](../skill/plan.md#角色与模型分配)。本闭包命中策略 `security-sensitive`（连接键隔离、凭据句柄）与并发（发布边界），顶档 claude-fable-5-1，effort high（不是 hardest：没有内核原语）。

## 切片

### 01：聚合与关口

- **交付：** `Connection`（两种代际策略）、`InFlightCalls`、`admit` 与 `AdmittedEndpoint`、`McpConfig` 校验。
- **被谁阻塞：** 无。
- **文件：** `src/internal/{connection,in-flight,gate}.ts`、`src/config.ts`。
- **验收：** `connection.spec.ts` 穷举合法与非法转移；`in-flight.spec.ts`；`gate.spec.ts`；`types.spec-d.ts` 证明 `AdmittedEndpoint` 字面量赋不进去。

### 02：连接表、`ensure`、内存存储

- **交付：** 已定事项 6、11、12、13。
- **被谁阻塞：** 01。
- **文件：** `src/internal/table.ts`、`src/store/memory.ts`、`tests/doubles/scripted-transport.ts`。
- **验收：** `ensure.spec.ts`（MC2-5 每条）；`memory-store.spec.ts` 跑 `mcpCatalogStoreConformance()`。

### 03：读口

- **交付：** `refresh`、`current`、`peer`（已定事项 7、8）。
- **被谁阻塞：** 02。
- **验收：** `refresh.spec.ts` 含并发用例（两个 deferred 的页应答按两种次序 resolve，都满足「只一次 published、存储较新」）；MC2-7 替身计数。

### 04：状态口与连接释放

- **交付：** `status.inspect`/`list`、`release`/`closeAll`（已定事项 9、10）。
- **被谁阻塞：** 02。
- **验收：** `status.spec.ts`、`release.spec.ts`（MC2-8、MC2-9）。

### 05：组装

- **交付：** `inspection`、`createMcpCore`、公开根；README「行为」「给下一波」（`ensure`、`InFlightCalls`、`admitWithoutEligibility` 的签名）。
- **被谁阻塞：** 03、04。
- **验收：** `public-entry.spec.ts` 导出集合；全部门禁。

每个切片的七步待办同 [W1 计划](../../w1/mcp/plan.md)。

## 集中检查

- 结构读数与差分变异：最终 head，热点 `gate.ts`、`table.ts`、`discovery.ts`（发布边界）。
- 评审：交回后六面；L3 热点逐行（reduce + implementation-reviewer）。
- 准入：波末父分支头一次。

## 交回清单

同 [Skill 线计划](../skill/plan.md#交回清单)。

## 顺序与并行

- 01→02→{03 ∥ 04}→05，一个写者串行做。
- 与 Skill 线两闭包并行；只依赖 F。
