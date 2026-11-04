# W3 Skill 线交付计划：`SkillCatalog`、契约回写与真实来源示例

格式沿 `claim` 技能 `references/plan-template.md`，方法 Matt `to-tickets`。与同目录 [spec.md](spec.md) 配套。

## 进度总览

进度：[□□□□□□□□□□] 0/3 切片已完成 · 更新 2026-11-04T05:30:00Z · head 05f281394
当前：闭包规格

| 切片 | 交付的行为 | 对应判据 | 状态 |
| --- | --- | --- | --- |
| 01 | 契约回写：导出四项、统一处置条款、`entry-unreadable` 条款、`search` 规则、`skillCatalogConformance` | SK3-5、SK3-7、SK3-8 | 待做 |
| 02 | `createSkillCatalog`；删除重复定义；统一畸形答复处置 | SK3-1–SK3-4、SK3-6、SK3-7 | 待做 |
| 03 | 真实目录示例 | SK3-9 | 待做 |

| 闭包 | 写者模型@档位 | 清晰度 | 工作树 | 分支 | 状态 | 轮次 | 追加 | 验收报告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| w3-skill-catalog（切片 01–03） | claude-fable-5-1@high | 定 | `.worktrees/w3-skill-catalog` | `PanQiWei/skill-mcp-w3-skill-catalog` | 待派 | 0 | 0 | — |

三个切片跨三个 Skill 成员，但彼此依赖（02 用 01 的导出与套件，03 用 02 的工厂），合成一个闭包，一个写者按 01→03 顺序做。写集与 MCP 线不相交。

## 角色与模型分配

命中策略 `security-sensitive`（无披露、整次 `unknown`）→ 顶档 claude-fable-5-1，effort high（不是 hardest：单一服务、规则已定）。

## 切片

### 01：契约回写

- **交付：** 已定事项 6、8、9、10、11 的契约部分。
- **被谁阻塞：** 无。
- **文件：** `packages/skills/skill-contract/`。
- **验收：** 契约测试全过；套件对内存替身全过。

### 02：`createSkillCatalog`

- **交付：** 已定事项 1–5、7、8 的实现部分、10 的删除。
- **被谁阻塞：** 01。
- **文件：** `packages/skills/skill/`。
- **验收：** SK3-1–SK3-7。

### 03：真实来源示例

- **交付：** 已定事项 12。
- **被谁阻塞：** 02。
- **文件：** `packages/skills/skill-host-local/examples/`、`tests/examples.spec.ts`、`SPEC.md` 验证节、`README*.md` 示例一句。
- **验收：** SK3-9。

## 集中检查

同 [MCP 线计划](../mcp/plan.md#集中检查)，成员换成三个 Skill 成员，基线 F0。

## 交回清单

同 [MCP 线计划](../mcp/plan.md#交回清单)。
