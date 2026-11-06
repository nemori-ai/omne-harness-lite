# 闭包规格 w3-docs-mcp-fix1

## 身份与位置
- 闭包：w3-docs-mcp-fix1
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-docs-mcp
- 分支：PanQiWei/skill-mcp-w3-docs-mcp（PR #1152）
- 基线：f2fc80aceeabd3e80321eb3b5a51c50bb8470d8e
- 清晰度：定

`w3-docs-mcp` 第 1 轮评审之后唯一的一轮修复（C-SM-08）。原规格 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-docs-mcp.md` 仍然有效。评审（同目录 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/`）：B 面 `docs-writeback-r1-b.md` 的「对象 2」一节；E 面 `docs-writeback-r1-e.md` 的 MCP 表与冲突项；另有 `mcp-e2e-r1-b.md` 的 N-11。

## 模型与推理强度
developer，implementation_kind verification，Claude Sonnet 5.5（claude-sonnet-5-5），effort high。policy_version 947.1。理由：改动都指到文件与行。

## 目标边界
目标：B 面三条阻断与 E 面未达到的 W-4 改完，下列派发者点名的几处一并改，非阻断里给了具体改法的照改。只做下面列的事。

### 已定的事（不重新裁定）
1. **阻断 MC-B1 至 MC-B3**：按评审表的「建议改法」改。MC-B1 的写法以 `mcp-host-local/SPEC.md`「与 SDK 的复用关系」的三类理由为准（硬承诺、规则归契约、无协议行为）。MC-B2 取删「清单变化通知」那一种，不补用例。MC-B3 给出两条条款各自所在的节。
2. **E 面 W-4**：组页「`McpTransport`」一行（第 350 行一带）与依赖倒置一行（第 573 行一带）仍写 SDK 在传输实现里使用。改为现状：产品源码不导入官方 SDK，传输按协议实现，SDK 只在 `mcp-host-local` 的测试与探针里作对照；与组页第 19、83 行和 MC-B1 改后的句子一致。
3. **`mcp-host-local/SPEC.md` 第 12 行**（钉的那一行）的「采用的范围」格：「官方 SDK 只出现在本成员」改为「官方 SDK 只出现在本成员的测试与探针」。钉的提交号不变。
4. **组入口 `packages/mcp/README.md` 第 55 行一带**（`mcp-e2e-r1-b.md` 的 N-11）：「组合行为……都没有证据」改为现状：`mcp-host-local` 的 `tests/e2e/` 在本机真实服务端上验证与 `@omne-harness/mcp` 的组合（PR #1149）。
5. **TP-5 的余项**：`packages/mcp/mcp/README.md` 与 `README_ZH.md` 的「维护」一节删去条款到内部模块文件的对照，指向 `docs/architecture.md`。
6. **E 面冲突项 M-2 的裁定**：组入口「`mcp-host-local → mcp` 是允许依赖」写的是方向规则，不改。
7. **非阻断**：B 面「对象 2」的非阻断项，凡给了具体改法、且改法不违反契约或组页现行规则的，照改；不改的逐条写理由。
8. **钉不动**：成员 SPEC 的组设计钉仍指 `26ab418a7`；本轮改的是同源旧句。

### 写范围
- `packages/mcp/docs/architecture.md` — 第 1、2、7 条
- `packages/mcp/docs/key-flows.md` — 第 7 条
- `packages/mcp/README.md` — 第 1、4、7 条
- `packages/mcp/mcp/README.md` — 第 1、5、7 条
- `packages/mcp/mcp/README_ZH.md` — 第 1、5、7 条
- `docs/domains/mcp/architecture.md` — 第 7 条
- `packages/mcp/mcp-host-local/SPEC.md` — 只改第 12 行的「采用的范围」格（第 3 条）

### 排除的调用方
- 所有 `src/` 与 `tests/`。
- `packages/mcp/mcp-host-local/SPEC.md` 的其他各节：「组合与验证」与「范围与依据」由 `w3-mcp-e2e-fix1` 在另一棵树改。
- `packages/mcp/mcp-host-local/README*.md`：由 `w3-mcp-e2e-fix1` 改。
- `packages/skills/` 与 `docs/domains/skills/`。

## 验收清单
1. 第 1–5 条逐条写「已改」、位置与 `grep` 证据（旧句不在目标页，同组其他页也没有同一旧句）。
2. 非阻断逐条写「已改」或「不改：理由」。
3. `pnpm run check:docs`、`check:design`、`format:check`、`lint:rules` 退出 0；输出尾部与日志哈希。
4. `git diff --name-only f2fc80ace..HEAD` 只含写范围内的文件；`packages/mcp/mcp-host-local/SPEC.md` 的 diff 只有第 12 行。

## 实施规格
- 中文按 asd-ste100 的语言无关规则；英文 README 用 STE-flavored。只写现状与依据，不写评审轮次与过程。

## 性质及证据义务
- 本闭包不改行为，没有变异义务。

## 施工计划
1. 读评审「对象 2」、E 面 MCP 表与 N-11，读依据条款。
2. 阻断与第 2–5 条，再非阻断；一次或两次提交。
3. 门禁、交回。
提交信息中文，作者 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code`、`Agent-Role: developer`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行文档检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-docs-mcp。并行的有 `w3-docs-skill-fix1` 与 `w3-mcp-e2e-fix1`（别的树；后者也改 `mcp-host-local/SPEC.md` 的另两节，合入时由派发者合并）。不跑测试。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-docs-mcp/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 评审：见「身份与位置」
- 契约与成员规格：`packages/mcp/mcp-contract/SPEC.md`、`packages/mcp/mcp/SPEC.md`、`packages/mcp/mcp-host-local/SPEC.md`
- 必须加载：asd-ste100

## 当前认知
- 已确认：`mcp-host-local` 的官方 SDK 客户端在 devDependencies，产品源码不导入它。
- 已确认：B 面「对象 2」阻断 3、非阻断 11；E 面未达到 W-4。

## 返回与恢复
提交号；验收各条；逐条位置；不改的非阻断及理由。交回写到 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-docs-mcp-fix1.md`。

## 已知会受影响的现有用例
- 无。

## 停止条件
- 某条建议改法与契约现行条款冲突，看不出哪边是应然：只停那一条，其余照做。
- 需要改写范围外的文件。

## 追加记录
- 2026-11-06 10:32 派发前：B 面「对象 2」阻断 3、非阻断 11；E 面 W-4 未达到；派发者点名第 3–5 条；M-2 裁定不改。
