# W3 MCP 线交付计划：契约回写、连接表收口、调用口、本地传输

格式沿 `claim` 技能 `references/plan-template.md`，方法 Matt `to-tickets`。与同目录 [spec.md](spec.md) 配套。

## 进度总览

进度：[□□□□□□□□□□] 0/5 闭包已合入 · 更新 2026-11-04T05:30:00Z · head 05f281394
当前：A 段闭包规格

| 段 | 闭包 | 交付的行为 | 对应判据 | 状态 |
| --- | --- | --- | --- | --- |
| A | w3-mcp-contract | 契约可加调整（已定事项 1–16）、`mcpTransportConformance`、`createScriptedTransportFactory` | MC3-1、MC3-2 | 待派 |
| A | w3-mcp-table | 连接表收口：遗忘谓词、拆除、临界区时限、关停例外、模块拆分（已定事项 20–26） | MC3-3 | 待派 |
| B | w3-mcp-call | `ActionInvoker`、任务表、`createMcp`，删除成员内绕道（已定事项 27–34） | MC3-4–MC3-8 | 等 A |
| B | w3-mcp-host | `createLocalTransportFactory`、真实服务端夹具、两种传输跑契约套件（已定事项 35–40） | MC3-9–MC3-11 | 等 A |
| C | w3-mcp-e2e | 端到端旅程（已定事项 41） | MC3-12 | 等 B |

| 闭包 | 写者模型@档位 | 清晰度 | 工作树 | 分支 | 状态 | 轮次 | 追加 | 验收报告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| w3-mcp-contract | claude-fable-5-1@high | 定 | `.worktrees/w3-mcp-contract` | `PanQiWei/skill-mcp-w3-mcp-contract` | 待派 | 0 | 0 | — |
| w3-mcp-table | claude-fable-5-1@xhigh | 定 | `.worktrees/w3-mcp-table` | `PanQiWei/skill-mcp-w3-mcp-table` | 待派 | 0 | 0 | — |
| w3-mcp-call | claude-fable-5-1@high | 定 | 待备 | `PanQiWei/skill-mcp-w3-mcp-call` | 等 A | 0 | 0 | — |
| w3-mcp-host | claude-fable-5-1@xhigh | 定 | 待备 | `PanQiWei/skill-mcp-w3-mcp-host` | 等 A | 0 | 0 | — |
| w3-mcp-e2e | claude-opus-5-5@high | 定 | 待备 | `PanQiWei/skill-mcp-w3-mcp-e2e` | 等 B | 0 | 0 | — |

## 角色与模型分配

模型按 `render_pair.py --resolve claude_code --work-kind product --risk <risk> --policy-version 947.1` 选，理由写进闭包规格：

- `w3-mcp-contract`：契约把失败、次序与诊断留给判断（传输套件的用例设计），`security-sensitive`（授权失败与句柄）→ 顶档 high。
- `w3-mcp-table`：跨模块的资源生命周期与并发拆除（策略 `cross-module-lifecycle`，hardest），W2 三轮未收敛的同类问题 → 顶档 xhigh。
- `w3-mcp-call`：`security-sensitive`（在途表与任务表的主体隔离）→ 顶档 high。
- `w3-mcp-host`：跨进程故障（策略 `cross-process-faults`，hardest）、授权头与凭据句柄 → 顶档 xhigh。
- `w3-mcp-e2e`：单目录测试切片，规格完整 → 默认档 opus high。

## 切片

### A1：`w3-mcp-contract`

- **交付：** 已定事项 1–19。
- **被谁阻塞：** 无（F0）。
- **文件：** `packages/mcp/mcp-contract/` 的 `src/`、`tests/`、`SPEC.md`、`README*.md`、`documentation.json`。
- **验收：** MC3-1、MC3-2。

### A2：`w3-mcp-table`

- **交付：** 已定事项 20–26。
- **被谁阻塞：** 无（F0）。不用契约新形状。
- **文件：** `packages/mcp/mcp/src/internal/`、`tests/`、`SPEC.md`（所有权与已知限制两节）。
- **验收：** MC3-3；W2 的全部用例原样通过。

### B1：`w3-mcp-call`

- **交付：** 已定事项 27–34。
- **被谁阻塞：** A1、A2 合入（F1）。
- **文件：** `packages/mcp/mcp/`。
- **验收：** MC3-4–MC3-8。

### B2：`w3-mcp-host`

- **交付：** 已定事项 35–40。
- **被谁阻塞：** A1 合入（F1）。
- **文件：** `packages/mcp/mcp-host-local/`。
- **验收：** MC3-9–MC3-11。

### C1：`w3-mcp-e2e`

- **交付：** 已定事项 41。
- **被谁阻塞：** B1、B2 合入（F2）。
- **文件：** `packages/mcp/mcp-host-local/tests/e2e/`、成员 SPEC 验证节。
- **验收：** MC3-12。

## 集中检查

每个闭包合入前：reduce 复跑涉及成员的 build/typecheck/test、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`preflight`（`acceptance:lock` 的基线失败单列）；`metrics --coverage --base <段基线>`；差分变异只在最终 head 跑一次，范围取热点。评审按 [wave-pack §4](../wave-pack.md#4-方法与验证)。

## 交回清单

每个闭包交回：提交号、门禁日志时间、红灯证据（重建 dist 后）、自定裁定与理由、未做项、写者声称的结构性改动清单（reduce 逐条 `grep` 核实）。

## 顺序与并行

```
F0 ─┬─ A1 w3-mcp-contract ─┐
    ├─ A2 w3-mcp-table ────┴─ F1 ─┬─ B1 w3-mcp-call ─┐
    │                             └─ B2 w3-mcp-host ─┴─ F2 ── C1 w3-mcp-e2e
    └─ Skill：w3-skill-catalog（与 A、B 并行，写集不相交）
```

A1 与 A2 写集不相交（`mcp-contract/` 与 `mcp/`）。A2 合入后若 A1 改了 `mcp` 用到的形状，F1 上由 B1 迁移。B1 与 B2 写集不相交（`mcp/` 与 `mcp-host-local/`）。
