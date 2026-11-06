# w3-docs-skill-fix1 交回

1. 结论：做完。五条阻断全部改完，十二条非阻断改十条、不改两条（SK-N8、SK-N9，理由见第 6 节）。
2. 提交：`7a426a670` docs(skills): 写回后的同源旧句对齐契约，并改掉计划口吻与过程标签（#1119）。作者与提交者读回 `PanQiWei <594557445@qq.com>`。分支 PanQiWei/skill-mcp-w3-docs-skill，基线 1eab83b81。未推送。
3. 改动文件（均在写范围内）：
   - `docs/domains/skills/architecture.md`：SK-B1、SK-B2、SK-N2（状态句）、SK-N11
   - `docs/domains/skills/key-flows.md`：SK-B4
   - `packages/skills/docs/architecture.md`：SK-B3、SK-B5（两处）、SK-N1、SK-N2、SK-N4、SK-N5、SK-N6、SK-N7（两处）
   - `packages/skills/docs/key-flows.md`：SK-N10、SK-N12
   - `packages/skills/README.md`：SK-N2
   - `packages/skills/skill-contract/SPEC.md`：SK-N3（两处）

## 4. 验收
### 1. 阻断（均已改）
| 编号 | 位置 | 改成 | grep 证据 |
| --- | --- | --- | --- |
| SK-B1 | `docs/domains/skills/architecture.md` `SkillReadCheck` 行 | 摘要与检索先按请求过滤或按查询匹配，只对留下的身份问它 | 「摘要与检索对每个身份也先问它」在 `docs/domains/skills`、`packages/skills` 全部 `*.md` 中 0 处 |
| SK-B2 | 同页 KL-9「未兑现时的结果」 | 不带依据的描述不带材料依据，不带依据的读取与列出返回不支持，带依据的操作照常 | 旧句「Skill 的描述不带Skill 材料依据，读取、列出与导出返回不支持」0 处 |
| SK-B3 | `packages/skills/docs/architecture.md` 检查与发现决定表第 2 行 | 读控制文件时字节不符为 `version-changed`，快照阶段的 `bytes-mismatch` 为 `source-unavailable` | 「检查途中字节不符」两个目录 0 处（含 SK-B4 的页） |
| SK-B4 | `docs/domains/skills/key-flows.md` F-SK01 | 读控制文件时字节不符报版本已变 | 同上 |
| SK-B5 | 组页 `SkillManifest` 行与 `SKILL.md` 文本行 | metadata 是映射但有非文本值时只保留文本值，不是映射时不保留，两种都带兼容提示 | 「不是文本映射时只保留文本值」0 处 |

### 2. 非阻断
| 编号 | 处置 |
| --- | --- |
| SK-N1 | 已改：组页状态段加一句指向性质账本 |
| SK-N2 | 已改：README、领域页、组页 `:3` 去掉「第二波」；组页 `:581` 的「在第一波之后有了实现」改为「已有实现」。`grep 第二波` 0 处。组页定义的三种波次仍在计划类条目里使用，未动 |
| SK-N3 | 已改：`skill-contract/SPEC.md` 两处过程叙述改为现状句 |
| SK-N4 | 已改：依据改指成员规格[兼容提示](../skill-contract/SPEC.md#compatibility-hints)，去掉裁定日期 |
| SK-N5 | 已改：共同前提写成「每次端口调用都会结束」；无披露（S1）另要求判定端口对无权主体的答复不随身份是否存在而变。去掉 P0、PC3、PR5 编号 |
| SK-N6 | 已改：验证段改现状句，`unknown` 补「留下的身份中任一个」 |
| SK-N7 | 已改：两处（`:66`、SK-D07）改为「`./testing` 另有 `SkillAccess` 与 `SkillCatalog` 的符合性套件」 |
| SK-N8 | 不改：见第 6 节 |
| SK-N9 | 不改：见第 6 节 |
| SK-N10 | 已改：读取图下段补正文起点不明答 `source-unavailable`，注「图中省略」并链到读取第 11 步 |
| SK-N11 | 已改：领域页 `SkillCatalog` 行补「留下的身份中任一个」 |
| SK-N12 | 已改：导出图来源箭头改为「Skill 包快照，或 package-not-found 等来源失败」；映射仍写在组内读取图下的文字，导出节第 2 点已指向它 |

### 3. 门禁（工作树根，HEAD 为 7a426a670，均退出 0）
日志目录 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/logs/`，文件名 `w3-docs-skill-fix1-<命令>.log`。
| 命令 | 时间（UTC） | sha256 前 16 位 | 输出尾部 |
| --- | --- | --- | --- |
| `pnpm run check:docs` | 2026-11-06T10:35:27Z | 0845dfbbaddb48d7 | PASS: 2751 Markdown files; local links and skill mirrors. |
| `pnpm run check:design` | 2026-11-06T10:36:19Z | ce280b84d2e4ae29 | PASS: 354 个词条、69 条对象条目、10 项待裁、17 个当前 PD，对账一致。 |
| `pnpm run format:check` | 2026-11-06T10:36:25Z | 7974835ba77e2ee5 | All matched files use the correct format. |
| `pnpm run lint:rules` | 2026-11-06T10:37:08Z | 2664c888e88c0f8b | PASS: … 6200 个提交的署名，无违反。 |

### 4. 改动范围
`git diff --name-only 1eab83b81..HEAD` 只有上面六个文件，都在写范围内。`git ls-files --eol` 没有 CRLF。

## 6. 不改的非阻断及理由
- SK-N8（三份成员 SPEC 钉在 `773d9f04c`）：规格「已定的事」第 4 条钉不动，三份 SPEC 在排除范围内。
- SK-N9（`skill-contract/SPEC.md:41–53` 的组页行号）：规格「已定的事」第 3 条裁定保留「组页位置行号指 `21175c9f9` 的版本」。改用章节锚点会推翻这条裁定。

## 说明
- 没有停止条件触发。没有改 `src/`、`tests/`、`packages/mcp/`、`docs/domains/mcp/`、三份成员 SPEC 的钉。
- 提交时全局 git 用户名是 `panqiwei`，已用 `-c user.name=PanQiWei` 重写作者与提交者。
- 没有运行测试，没有变异义务。
