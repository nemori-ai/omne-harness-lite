# W1 MCP 线交付计划：`@omne-harness/mcp-contract`

格式沿 `claim` 技能 `references/plan-template.md`，方法 Matt `to-tickets`。与同目录 [spec.md](spec.md) 配套。

## 进度总览

进度：[□□□□□□□□□□] 0/4 切片已完成 · 更新 2026-11-03T13:51:09Z · head 21175c9f9
当前：切片 01 第 3 步（写者实施）

| 切片 | 交付的行为 | 对应判据 | 状态 |
| --- | --- | --- | --- |
| 01 | 接入点正文被判定为 `EndpointDefinition` 或给出拒绝原因；类别端口产出设置声明项 | MC1、MC2 | 待做 |
| 02 | 清单采用算法与结局分类可以穷举测试 | MC3、MC4、MC5 | 待做 |
| 03 | 端口实现方能用五个符合性套件证明合规 | MC6 | 待做 |
| 04 | 后续写者从 SPEC 读到全部已封闭的未定项 | MC7、MC8 | 待做 |

| 闭包 | 写者模型@档位 | 清晰度 | 工作树 | 分支 | 状态 | 轮次 | 追加 | 验收报告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| w1-mcp-contract | claude-opus-5-5@high | 定 | `.worktrees/w1-mcp-contract` | `PanQiWei/skill-mcp-w1-mcp-contract` | 进行中 | 1 | 0 | — |

四个切片写同一成员，合成一个闭包，一个写者按 01→04 顺序做。

## 判据

| ID | 判据 | 证据 |
| --- | --- | --- |
| MC1 | 公开根、`./provider`、`./testing` 的导出键集合与 spec「Implementation Decisions」一致；公开根不导入 `./testing`；成员不依赖任何 SDK | `tests/public-entry.spec.ts`；`package.json` |
| MC2 | 正文的每个拒绝原因一个反例；`launchesLocalCommand`；`deriveDeclarations` 按已定事项 5 产出 | `tests/endpoint.spec.ts` |
| MC3 | `completeListing` 与 `mergeListing` 的性质测试全过 | `tests/catalog.spec.ts` |
| MC4 | `classifyOutcome` 穷举表覆盖六种结局与边界 | `tests/classify.spec.ts` |
| MC5 | `toContentBlocks` 每种内容类型一例，不合法一项不丢其余 | `tests/content.spec.ts` |
| MC6 | 五个符合性套件对内存替身全绿；违反无披露的替身使套件变红；`CatalogStore` 套件覆盖修订冲突 | `tests/conformance.spec.ts` |
| MC7 | 结构扫描除草稿标记外无缺项（成员是 3.0.0 骨架） | `pnpm package:template scan --member packages/mcp/mcp-contract --json` |
| MC8 | SPEC 封闭已定事项 1–19 与组页第 401、430、465、525、599–604 行的未定项；`schema/endpoint-body.schema.json` 与已定事项 3 一致 | SPEC 正文；design-reviewer 表达评审报告 |

## 角色与模型分配

本会话宿主：Claude Code（云端）。

| 切片或环节 | 工作性质与复杂度 | 清晰度 | 角色 | 模型与 effort | 理由 |
| --- | --- | --- | --- | --- | --- |
| 调度 | 规格、简报、裁定、读 diff | — | 本会话 | 当前会话模型 | 需要全局上下文 |
| 01–04 | 能力契约，单成员，规格完整 | 定 | developer，product | Opus 5.5，high | 默认档；契约被后续波段依赖 |
| 评审 | 实现评审；SPEC 表达评审 | — | implementation-reviewer；design-reviewer（expression） | Opus 5.5，high；Opus 5.5，xhigh | 角色描述的推荐配置 |
| 修复轮 | 评审阻断 | — | developer（续用原写者） | 同上 | 同一闭包的追加可续用 |

## 切片

### 01：接入点正文与类别端口

- **交付：** `parseEndpointBody`、`launchesLocalCommand`、`mcpEndpointBodyContract()`、`schema/endpoint-body.schema.json`。
- **被谁阻塞：** 无。
- **对应判据：** MC1、MC2。
- **七步待办：**
  - [ ] 1. 补上下文：已由 reduce 写进闭包规格，跳过子代理
  - [ ] 2. 写闭包规格，`brief-check` 退出 0（承担：调度）
  - [ ] 3. 写者实施（承担：developer）
  - [ ] 4. 复跑门禁，核对写范围（承担：调度）
  - [ ] 5. 跳过：常规评审集中到最后
  - [ ] 6. 阻断集中修复（承担：developer）
  - [ ] 7. PR 合入父分支，更新进度总览（承担：调度）

### 02：清单与结局

- **交付：** `catalog`、`classify`、`keys` 三组纯函数与值。
- **被谁阻塞：** 01（共用值类型）。
- **对应判据：** MC3、MC4、MC5。
- **七步待办：** 同 01，第 2、7 步与 01 合并（同一闭包）。

### 03：端口与套件

- **交付：** `./provider` 的端口；`./testing` 的套件、替身与穷举样本表；五个服务接口。
- **被谁阻塞：** 01、02。
- **对应判据：** MC6。
- **七步待办：** 同 02。

### 04：SPEC 与 Schema

- **交付：** 成员 SPEC。
- **被谁阻塞：** 01–03。
- **对应判据：** MC7、MC8。
- **七步待办：** 同 02。

## 集中检查

- 结构读数与差分变异：闭包交回后 reduce 在闭包 head 上跑一次。
- 常规评审：交回后一次实现评审（L2），一次 SPEC 表达评审。
- 波末：父分支头一次准入（质量读数）。

## 交回清单

- [ ] 进度总览改成最终状态
- [ ] 闭包 PR 合入父分支，读回父分支头
- [ ] 判据证据写进本文件「判据」表
- [ ] 波末交接报告 `w1/handoff.md` 的 MCP 一节

## 顺序与并行

- 01 → 02 → 03 → 04，同一写者顺序做。
- 与 Skill 线的 `w1-skill-contract` 并行，写集不相交，只依赖 F。
