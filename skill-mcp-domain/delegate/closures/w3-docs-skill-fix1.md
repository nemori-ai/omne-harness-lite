# 闭包规格 w3-docs-skill-fix1

## 身份与位置
- 闭包：w3-docs-skill-fix1
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-docs-skill
- 分支：PanQiWei/skill-mcp-w3-docs-skill（PR #1151）
- 基线：1eab83b8139356e9ad6eeaeddeb077c745360d4e
- 清晰度：定

`w3-docs-skill` 第 1 轮评审之后唯一的一轮修复（C-SM-08）。原规格 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-docs-skill.md` 仍然有效。评审：B 面 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/docs-writeback-r1-b.md` 的「对象 1」一节；E 面 `docs-writeback-r1-e.md`（同目录）对本对象无未达到项。

## 模型与推理强度
developer，implementation_kind verification，Claude Sonnet 5.5（claude-sonnet-5-5），effort high。policy_version 947.1。理由：改动都指到文件与行。

## 目标边界
目标：B 面的五条阻断改完；非阻断里给了具体改法的照改。只做下面列的事。

### 已定的事（不重新裁定）
1. **阻断 SK-B1 至 SK-B5**：按评审表的「建议改法」改，依据是表里列的契约条款。改完对每条用 `grep` 证明旧句已不在目标页，同组的其他页也没有同一旧句。
2. **非阻断**：B 面「对象 1」的非阻断项，凡给了具体改法、且改法不违反契约或组页现行规则的，照改；不改的逐条写理由。
3. **E 面冲突项 S-1 的裁定**：`skill-contract/SPEC.md` 第 41 行一带新加的「组页位置行号指 `21175c9f9` 的版本」保留。
4. **钉不动**：三份成员 SPEC 的组设计钉仍指 `773d9f04c`；本轮改的是同源旧句，规则不变。

### 写范围
- `packages/skills/docs/architecture.md` — SK-B3、SK-B5 与非阻断
- `packages/skills/docs/key-flows.md` — 非阻断
- `docs/domains/skills/architecture.md` — SK-B1、SK-B2 与非阻断
- `docs/domains/skills/key-flows.md` — SK-B4 与非阻断
- `packages/skills/README.md` — 非阻断
- `packages/skills/skill-contract/SPEC.md` — 只在非阻断要求时改

### 排除的调用方
- 所有 `src/` 与 `tests/`。
- `packages/mcp/` 与 `docs/domains/mcp/`。
- 三份成员 SPEC 的钉。

## 验收清单
1. SK-B1 至 SK-B5 逐条写「已改」、位置与 `grep` 证据。
2. 非阻断逐条写「已改」或「不改：理由」。
3. `pnpm run check:docs`、`check:design`、`format:check`、`lint:rules` 退出 0；输出尾部与日志哈希。
4. `git diff --name-only 1eab83b81..HEAD` 只含写范围内的文件。

## 实施规格
- 中文按 asd-ste100 的语言无关规则；英文 README 用 STE-flavored。只写现状与依据，不写评审轮次与过程。

## 性质及证据义务
- 本闭包不改行为，没有变异义务。

## 施工计划
1. 读评审「对象 1」与依据条款。
2. 阻断，再非阻断；一次或两次提交。
3. 门禁、交回。
提交信息中文，作者 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code`、`Agent-Role: developer`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行文档检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-docs-skill。并行的有 `w3-docs-mcp-fix1` 与 `w3-mcp-e2e-fix1`（别的树）。不跑测试。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-docs-skill/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 评审：见「身份与位置」
- 契约：`packages/skills/skill-contract/SPEC.md`
- 必须加载：asd-ste100

## 当前认知
- 已确认：E 面对本对象无未达到项；B 面阻断 5、非阻断 12。

## 返回与恢复
提交号；验收各条；逐条位置；不改的非阻断及理由。交回写到 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-docs-skill-fix1.md`。

## 已知会受影响的现有用例
- 无。

## 停止条件
- 某条建议改法与契约现行条款冲突，看不出哪边是应然：只停那一条，其余照做。
- 需要改写范围外的文件。

## 追加记录
- 2026-11-06 10:32 派发前：B 面「对象 1」阻断 5、非阻断 12；E 面无未达到项，冲突项 S-1 裁定保留注解。
