# W3 波包：调用、传输与目录

格式沿 `.meta_harness/human/map-reduce-delivery/templates/line-pack.md`，按[范式 r2](../operating-model.md) 变通：两条线合一份，没有线父卡、binding、轨道与 gate；交付卡是 [#1119](https://github.com/nemori-ai/omne-harness-lite/issues/1119)。

## 1. 线与当前波

| 项目 | 本次值 |
| --- | --- |
| 仓库、里程碑、reduce | `nemori-ai/omne-harness-lite`；M2「端到端多轮闭合」完结为边界；reduce 是本会话 |
| 卡 | [#1119](https://github.com/nemori-ai/omne-harness-lite/issues/1119) 交付修订 1；W1、W2 报告在卡的评论 |
| 线 | Skill 线、MCP 线，线负责人都是本会话 |
| 当前波 | W3，两条线都 active |
| 父分支与冻结输入 | `PanQiWei/skill-mcp`。MCP 线分三段，每段一个冻结输入：F0 = `05f281394c9179ecb9427fb1d5b97cc2f808a789`（A 段与 Skill 线）；F1 = A 段两个闭包合入后的父分支头（B 段）；F2 = B 段合入后（C 段）。每段开始时写进本表 |
| 开波同步 | `origin/integration/mainline` 仍是 3e22e2f1c，已在父分支内（W2 开波时合入），无需合并 |
| reduce 共享写（prep） | 66d54c355：catalog 钉 `@modelcontextprotocol/client`、`@modelcontextprotocol/server` 2.3.1；`mcp-host-local` 依赖 client、`mcp-contract`、`json-text`、`operation-result`，测试依赖 server、`zod`。05f281394：`skill-host-local` 测试依赖 `skill`，`mcp-host-local` 测试依赖 `mcp`。`lint:deps` 无违规；`preflight` 只有基线既有的 `acceptance:lock` 失败 |
| 开波前检查项 | [wave-queue.md](../wave-queue.md)「W3 开波前检查项」六项：主线同步（无变化）；prep 依赖（已做）；契约可加调整改由 A 段闭包写（理由见 §3.4）；`w3-mcp-call` 首项拆成 A 段 `w3-mcp-table`；`w3-mcp-host` 方向照 spike；`w3-skill-catalog` 照旧；基线失败报给 main 的事不属于两域，本波只在交接报告列出 |
| 上下文地图 | [Skill](../line-skill/context-map.md)、[MCP](../line-mcp/context-map.md)；共用约束 [constraints.md](../constraints.md) |

## 2. 两条线在 M2 完结前的目标、边界与验收

同 [W1 波包 §2](../w1/wave-pack.md#2-两条线在-m2-完结前的目标边界与验收)。卡 #1119 的判据 C4 是本波出口。

## 3. 本波交付边界

### 3.1 成果与判据

| 成果 | 验收判据与证据 |
| --- | --- |
| `@omne-harness/skill`：`createSkillCatalog`；`skill-contract` 可加回写与 `skillCatalogConformance`；`skill-host-local` 真实目录示例 | [skill/spec.md](skill/spec.md) SK3-1–SK3-9 |
| `@omne-harness/mcp-contract` 可加回写、`mcpTransportConformance`、`createScriptedTransportFactory` | [mcp/spec.md](mcp/spec.md) MC3-1、MC3-2 |
| `@omne-harness/mcp`：连接表收口；`ActionInvoker`、任务表、`createMcp` | MC3-3–MC3-8 |
| `@omne-harness/mcp-host-local`：`createLocalTransportFactory`（stdio、Streamable HTTP）与真实服务端夹具 | MC3-9–MC3-11 |
| 端到端旅程：两种传输上 `createMcp` 读数一致 | MC3-12 |
| 实现架构页与进展页随每个闭包合入更新；卡 #1119 在每段合入后更新进展 | reduce |

### 3.2 明确不做

- OAuth 授权流程、`elicitation.url`、`sampling`、`roots`、`list_changed` 订阅、SSE 旧传输、后台重连。
- 在途表与任务表跨重启。
- Cordis 契约成员与插件、profiling：W4。
- 内容存储来源；`SkillCatalog` 的排序、常驻与可用性。
- 组页、领域页、key-flows、统一语言：只由写回闭包在波末写。

### 3.3 冻结输入与写集

| 段 | 闭包 | 基线 | 写范围 | 禁写 |
| --- | --- | --- | --- | --- |
| A | `w3-skill-catalog` | F0 | `packages/skills/skill-contract/`（可加）、`packages/skills/skill/`、`packages/skills/skill-host-local/{examples,tests}/` 与该成员 `SPEC.md`、`README*.md` | MCP 成员、依赖段、锁文件、组页 |
| A | `w3-mcp-contract` | F0 | `packages/mcp/mcp-contract/`（可加） | `mcp`、`mcp-host-local`、依赖段、锁文件、组页 |
| A | `w3-mcp-table` | F0 | `packages/mcp/mcp/` | `mcp-contract`、`mcp-host-local`、依赖段、锁文件、组页 |
| B | `w3-mcp-call` | F1 | `packages/mcp/mcp/` | 同上 |
| B | `w3-mcp-host` | F1 | `packages/mcp/mcp-host-local/` | `mcp-contract`、`mcp`、依赖段、锁文件、组页 |
| C | `w3-mcp-e2e` | F2 | `packages/mcp/mcp-host-local/tests/e2e/`、该成员 `SPEC.md` 验证节 | 其余全部 |

同段的写集互不相交。禁写（全部闭包）：各成员 `package.json` 的依赖段、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、组页、领域页、`.meta_harness/`。需要新依赖或契约改动越出本段授权时停下交回。

### 3.4 本波对开波前检查项的调整

开波前检查项写「W3 prep（reduce）回写两契约的可加调整」。实际调整有 19 项（MCP）与 4 项（Skill），含一个新的传输符合性套件，需要测试与 SPEC 条款，reduce 串行写比派写者慢，也绕过评审。改为：MCP 契约回写是 A 段闭包 `w3-mcp-contract`；Skill 契约回写并进 `w3-skill-catalog` 的切片 01（W2 `w2-skill` 先例）。`w3-mcp-call` 的首项（连接表收口）拆成 A 段 `w3-mcp-table`，与契约回写并行，B 段只做调用口。修订记进 [wave-queue.md](../wave-queue.md) 修订表 r4。

### 3.5 需负责人批复

无。

### 3.6 停止条件

- 六个闭包都合入父分支、波末门槛跑完时，本波结束。
- 写者需要 3.2 中的事、越过写集，或发现契约与 SPEC 不足以实现时，停止依赖部分，交回时写明。

## 4. 方法与验证

| 项目 | 本次值 |
| --- | --- |
| 主工作类型 | feature，poteto-mode Feature；`architect` 一步由本波两份 spec 的已定事项承担 |
| 风险级别 | `w3-skill-catalog` L3（无披露、整次 `unknown`）；`w3-mcp-contract` L3（授权失败处置、传输套件判据）；`w3-mcp-table` L3（并发拆除、句柄）；`w3-mcp-call` L3（在途与任务表隔离）；`w3-mcp-host` L3（跨进程、授权头、凭据句柄）；`w3-mcp-e2e` L2 |
| 闭包门槛 | 见[范式 r2 §6](../operating-model.md#6-质量门槛) |
| 评审 | 每闭包：交付边界（按本波 spec 的判据）、`review-code` 四面（正确性、结构读数、设计与实践、差分变异）；L3 另派 implementation-reviewer 逐行读热点并实跑探针；含成员 SPEC 改动的另派 design-reviewer 表达评审（opus@xhigh） |
| W2 教训 | ① 契约缺口在 A 段先补，实现闭包不绕道；② 并发生命周期先写成谓词与次序（MCP 已定事项 20–23），用例跟谓词走；③ 写者声称的结构性改动 reduce 用 `grep` 核实；④ 证明变红先还原源码并重建 dist；⑤ 同一类阻断出现两轮即按 `quality.md` 缩窄承诺，不派第三轮补洞；⑥ 用量上限：派发时错开 Opus 评审，写者用 Fable |
| 进度记录 | 各线 `plan.md` 的进度总览；侧边栏进展页；卡 #1119 |

## 附录：闭包

| 闭包 | 段 | 写范围 | 规格 | 模型@档位 |
| --- | --- | --- | --- | --- |
| `w3-skill-catalog` | A | Skill 三成员（见 3.3） | [delegate/closures/w3-skill-catalog.md](../../delegate/closures/w3-skill-catalog.md) | claude-fable-5-1@high |
| `w3-mcp-contract` | A | `mcp-contract/` | [delegate/closures/w3-mcp-contract.md](../../delegate/closures/w3-mcp-contract.md) | claude-fable-5-1@high |
| `w3-mcp-table` | A | `mcp/` | [delegate/closures/w3-mcp-table.md](../../delegate/closures/w3-mcp-table.md) | claude-fable-5-1@xhigh |
| `w3-mcp-call` | B | `mcp/` | B 段开始时写 | claude-fable-5-1@high |
| `w3-mcp-host` | B | `mcp-host-local/` | B 段开始时写 | claude-fable-5-1@xhigh |
| `w3-mcp-e2e` | C | `mcp-host-local/tests/e2e/` | C 段开始时写 | claude-opus-5-5@high |
