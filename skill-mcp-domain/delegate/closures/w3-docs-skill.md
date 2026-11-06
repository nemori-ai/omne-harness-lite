# 闭包规格 w3-docs-skill

## 身份与位置
- 闭包：w3-docs-skill
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-docs-skill
- 分支：PanQiWei/skill-mcp-w3-docs-skill
- 基线：3289bee2ffa4b4711ad473c3d6112573317717f2
- 清晰度：定

W3 波末的 Skill 组页、领域页与组入口写回（W3-E 第一项）。条目、目标位置与依据都在分类表 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/writeback-triage.md`，卡拥有者的裁定在同一文件末节「卡拥有者裁定」。

## 模型与推理强度
developer，implementation_kind verification，Claude Sonnet 5.5（claude-sonnet-5-5），effort high。policy_version 947.1。理由：条目与依据都已定的文档写回，不改代码；与 W3 的 docs3 闭包同类。

## 目标边界
目标：Skill 组页与它的同源页写成现行契约与成员 SPEC 的样子，契约「与组页的差异」表随之退出，成员 SPEC 的组设计钉移到写回之后的组页提交。只做分类表里属于 Skill 的条目，不加别的改进。

### 已定的事（不重新裁定）
1. **条目。** 分类表中目标在 Skill 一侧的 A 类行：GS-01、SC-L82、GS-02、GS-03、GS-04、GS-06、GS-07、GS-09、W-1、SC-L86、SC-L87、SC-L88、SC-L89、TP-pins-S、W-2、W-3；加 C 类 GS-05（按候选 A 写回，见末节裁定）。按表后「同一处被几条来源点到」的合并写法，同一处只改一次。
2. **清单外的同源页并入**：`packages/skills/docs/key-flows.md` 的同源行（表末「清单外的同源页」第一条）随同一批条目改。
3. **契约「与组页的差异」表。** 写回完成后，`packages/skills/skill-contract/SPEC.md` 里已写回的差异行删除；全部写回时删掉这张表与「以本页为准」那句，留一句指向组页的现行版本。没写回的行保留并写明原因。
4. **钉。** `skill-host-local/SPEC.md` 第 11 行、`skill/SPEC.md` 第 12 行、`skill-contract/SPEC.md` 第 11、13 行的组设计钉改为本闭包写回组页的那个提交。做法：先提交组页与同源页，再在下一个提交里把钉改成上一个提交的号。`skill-contract` 第 13 行钉的是资产成员：分类表已查明资产成员在 `21175c9f9..HEAD` 没有改到被引用的定义，改钉到本基线 `3289bee2f` 即可。
5. **行号只作指引。** 按文字定位；写回会移动行号。

### 写范围
- `packages/skills/docs/architecture.md` — 第 1 条的全部组页条目
- `packages/skills/docs/key-flows.md` — 第 2 条
- `packages/skills/README.md` — W-3 的状态句与验证句
- `docs/domains/skills/architecture.md` — W-3 的状态句
- `docs/domains/skills/key-flows.md` — W-3 的状态句
- `packages/skills/skill-contract/SPEC.md` — 第 3 条的差异表与第 4 条的钉
- `packages/skills/skill/SPEC.md` — 第 4 条的钉
- `packages/skills/skill-host-local/SPEC.md` — 第 4 条的钉
- `packages/skills/skill/index.md` — 仅当 GS-07 的处置要求
- `packages/skills/skill/tests/index.md` — 仅当 GS-07 的处置要求
- `packages/skills/skill/documentation.json` — 仅当 GS-07 的处置要求

### 排除的调用方
- 所有 `src/` 与 `tests/` 下的代码：本闭包不改行为。
- `packages/mcp/` 与 `docs/domains/mcp/`：归 `w3-docs-mcp`。
- 组页「完整行为候选的正式承接缺口」表的 Cordis 两行（分类表 CP-Cordis，D 类）：归 W4-4。

## 验收清单
1. 每个条目编号写「已改」与改后的位置（文件与小节）；合并处写合并了哪些编号。
2. 改后对每条用 `grep` 证明旧说法已不在目标页（例如 `materialOf` 不在组页；GS-01 的「任一身份答 `unknown` 时整次 `unknown`」不在组页）。命令与输出写进交回。
3. `pnpm run check:docs`、`check:design`、`format:check`、`lint:rules` 退出 0；输出尾部与日志哈希。
4. `git diff --name-only 3289bee2f..HEAD` 只含写范围内的文件。
5. 第 4 条的钉指向本闭包的组页提交；交回写出两个提交号。

## 实施规格
- 中文按 asd-ste100 的语言无关规则；英文 README 用 STE-flavored。
- 组页写规则，成员 SPEC 写怎样切分（GS-03）：组页不出现成员内部函数名。
- 只写现状与依据，不写评审轮次与过程。

## 性质及证据义务
- 本闭包不改行为，没有变异义务。每条改写依据的契约或成员 SPEC 条款写进交回。

## 施工计划
1. 读分类表全文与末节裁定，读 `packages/skills/skill-contract/SPEC.md` 的「与组页的差异」表。
2. 按合并写法逐处改组页与同源页；提交一次。
3. 差异表与钉；提交第二次。
4. 门禁、交回。
提交信息中文，作者 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code`、`Agent-Role: developer`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行仓库文档检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-docs-skill。并行的有 `w3-docs-mcp`（另一棵树，写 MCP 页）与 `w3-mcp-e2e`（另一棵树，写 `mcp-host-local` 的用例）。不跑测试、`admission` 与差分变异。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-docs-skill/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 条目与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/writeback-triage.md
- 差距账本原文：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/gaps-skills.md
- 必须加载：asd-ste100

## 当前认知
- 已确认：分类表的条目在基线上核过，行号来自基线。
- 未知：GS-07 的处置是否要求改成员 `index.md`、`tests/index.md` 与 `documentation.json`（分类表 A 行只写了组页 l.484）。

## 返回与恢复
两个提交号；验收各条的命令、结果、输出尾部与日志哈希；逐条位置；没写回而保留在差异表的行及原因；未覆盖项。

## 已知会受影响的现有用例
- 无。

## 停止条件
- 某条写回与现行契约或成员 SPEC 冲突，而分类表与裁定没有说怎样处理。
- 需要改写范围外的文件。

## 追加记录
- 2026-11-06 09:59 派发前：分类表 39 行，Skill 一侧 A 类 16 行加 GS-05；卡拥有者裁定写在分类表末节。
