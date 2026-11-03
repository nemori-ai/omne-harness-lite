# 闭包 w2-writeback-skill：把 W2 裁定写回 Skill 组页、领域页、key-flows 与 README

## 身份与位置

- 工作树：`/home/user/omne-harness-lite/.worktrees/w2-writeback-skill`，分支 `PanQiWei/skill-mcp-w2-writeback-skill`，基线 ff17f7701（父分支头，含已合入的 skill、skill-host-local）。
- 角色：developer，implementation_kind = 文档写回。不改源码、不改成员 SPEC。作者署名已设好（PanQiWei），不要改。

## 目标边界

W2 把 `@omne-harness/skill` 与 `@omne-harness/skill-host-local` 做成了实现。它们的成员 SPEC/README 与两轮评审裁定与组页、领域页、key-flows 现行正文不一致。本闭包把裁定写回，使正文与成员文档一致。正文仍标候选决定——写回不授予技术接受。

### 写范围（只这六个文件）

- `packages/skills/docs/architecture.md`
- `packages/skills/docs/key-flows.md`
- `docs/domains/skills/architecture.md`
- `docs/domains/skills/key-flows.md`
- `packages/skills/README.md`
- `packages/skills/README_ZH.md`（存在时）

其它文件一律不写（成员 SPEC、源码、统一语言、MCP 组）。

## 输入（按序读）

1. 写回清单：`/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/writeback.md` 的 Skill 各节。
2. 依据：`packages/skills/skill/SPEC.md`（三段、映射、正文与范围、无披露）、`packages/skills/skill/README.md`、`packages/skills/skill-host-local/README.md`「Behavior/行为」与 `SPEC.md`、`packages/skills/skill-contract/SPEC.md`（「读取的形状规则」「符合性套件」）；裁定在 `/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/reviews/skill-r1.md` 与 `skill-host-r1.md` 的「reduce 裁定」节。
3. 写法：先读 `.claude/skills/asd-ste100/SKILL.md` 与 `references/documentation.md`（投影没生成时读 `.meta_harness/agents/skills/asd-ste100/canonical/`）。中文按清晰规则；保持页的结构（决定表、守则列）。

## 实施规格

1. 逐行按 writeback.md 改；每处必须能在成员 SPEC/README 或裁定里找到依据，找不到的不写，列进报告「未写回」。
2. 「归成员」类句子改为指向成员 SPEC/README 具体节的相对链接（用显式锚点），不复制类型定义或映射表全文。
3. 不写工作日志（「第二轮」「评审后」不进正文；「第二波」只用于状态句）；不加新概念。Skill 领域不依赖任何工具、不管脚本设施。
4. key-flows 的 mermaid 图改动要最小：改标签或加分支，不重画。
5. 承接表状态列（「未承接」）不改：取得技术接受后才改。

## 验收清单

- [ ] writeback.md 的 Skill 每一行要么写回、要么在报告「未写回」有理由。
- [ ] 在工作树根跑 `pnpm run check:docs`、`pnpm run check:design`、`pnpm run format:check`，输出原样记入报告；基线（ff17f7701）既有失败分开列。
- [ ] 提交 1–2 个，中文信息，trailer `Harness: claude-code`、`Agent-Role: developer`；不推送、不开 PR。

## 自主范围

按成员 SPEC/README 为准；与裁定冲突时按裁定并在报告列出。不能问派发者，自定后写理由。

## 交回报告（写到工作树 `tmp/writeback-report.md`，最终消息复述要点）

1. 改动的文件与节。2. 未写回项及理由。3. 三条检查的输出摘要。4. 自定裁定。5. 提交 hash。
