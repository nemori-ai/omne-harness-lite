# 闭包 w1-writeback-skill：把 W1 裁定写回 Skill 组页、领域页与 README

## 身份与位置

- 工作树：`/home/user/omne-harness-lite/.worktrees/w1-writeback-skill`，分支 `PanQiWei/skill-mcp-w1-writeback-skill`，基线 c247b873a（父分支头，含已合入的 skill-contract）。
- 角色：developer，implementation_kind = 文档写回。不改源码、不改 SPEC。
- 作者署名已在工作树 git config 设好（PanQiWei），不要改。

## 目标边界

W1 把 `@omne-harness/skill-contract` 做成了实现（SPEC 在 `packages/skills/skill-contract/SPEC.md`）。SPEC「与组页的差异」表和评审裁定与组页现行正文不一致。本闭包把这些裁定写回组页、领域页与组 README，使正文与 SPEC 一致。正文仍标「候选决定」——写回不授予技术接受。

### 写范围（只这四个文件）

- `packages/skills/docs/architecture.md`
- `docs/domains/skills/architecture.md`
- `packages/skills/README.md`
- `packages/skills/README_ZH.md`（存在时）

任何其它文件都不写。统一语言、领域对象清单、SPEC、源码、MCP 组一律不碰。

## 输入（按序读）

1. 写回清单：`/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w1/writeback.md` 的「packages/skills/docs/architecture.md」「docs/domains/skills/architecture.md」「两组 README」三节。行号以 21175c9f9 为准，组页自那以后没有改过，所以行号仍准。
2. 裁定依据：SPEC `packages/skills/skill-contract/SPEC.md`（尤其「与组页的差异」表、拒绝次序、需求端口）；裁定编号（E1、G3、S2-3、S3-13、C22′ …）在 `/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w1/reviews/decisions-r1.md` 与 `decisions-r2.md`；「已定事项 4」在 `/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w1/skill/spec.md`。
3. 写法规则：先读 `.claude/skills/asd-ste100/SKILL.md` 与 `.claude/skills/asd-ste100/references/documentation.md`，中文按不依赖英文语法的清晰规则写。本页的结构（设计守则、决定表、守则列）保持。

## 实施规格

1. 逐行按 writeback.md 改。每一处写回的内容必须能在 SPEC 或 decisions 文件里找到依据；找不到的不写，列进交回报告「未写回」。
2. 「归 skill-contract 的规格」类的句子，改为指向 SPEC 具体节的相对链接（形如 `../skill-contract/SPEC.md#需求端口`），不复制 SPEC 的类型定义。229–241 行端口要求改为摘要加链接，SPEC 是现行源。
3. 页首状态句改为：skill-contract 已有实现（候选，W1，尚未技术接受）；skill、skill-host-local 仍是模板草稿。
4. 不写工作日志（「第 3 轮改为」「本波」「评审后」这类词不进正文）。不加新概念、不改统一语言用词。Skill 领域不依赖任何工具、不管脚本设施——不要把脚本执行写进本组责任。
5. Q-SK02 剩余 492 行（资产规格「skill 一段」同步）保留为具名剩余义务，拥有者写「资产 SPEC」。
6. 领域页一处：端口实现方一节加 `snapshot` 的两种新答复（`outside-package`、`entry-unreadable`）与「资产版本不可表示时答 `known-unavailable`」。只改交接语义，不扩写。
7. README：成员状态表 `skill-contract` 改为「已实现（候选）」，写明三个入口 `.`、`./provider`、`./testing` 各给谁（`./provider` 含 `sealSnapshot` 与 `PackageInspection`）。

## 验收清单

- [ ] writeback.md 的每一行要么写回、要么在报告「未写回」里有理由。
- [ ] `grep -n "归 skill-contract 的规格" packages/skills/docs/architecture.md` 为空。
- [ ] 在工作树根运行 `pnpm run check:docs`、`pnpm run check:design`、`pnpm run format`，输出原样记入报告；基线（c247b873a）已有的失败分开列，不修基线问题。
- [ ] 提交 1 个，中文提交信息，正文列写回的节，末尾 trailer：`Harness: claude-code` 与 `Agent-Role: developer`。不推送、不开 PR（由派发者做）。

## 自主范围

拿不准的裁定不要猜：按 SPEC 为准；SPEC 与 decisions 冲突时按 SPEC，并在报告里列出冲突。不能问派发者，自定后在报告写理由。

## 交回报告（写到工作树 `tmp/writeback-report.md` 并在最终消息复述要点）

1. 改动的文件与节。2. 未写回项及理由。3. 三条检查的原样输出摘要。4. 自定的裁定。5. 提交 hash。
