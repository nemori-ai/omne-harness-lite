# 闭包规格 w3-mcp-call-docs

## 身份与位置
- 闭包：w3-mcp-call-docs
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call-docs
- 分支：PanQiWei/skill-mcp-w3-mcp-call-docs
- 基线：1a143a4d43d8b4283143c6e0a0d73d11f078899f
- 清晰度：定

基线是调用口分支的头：fix1 的 12 个提交加派发者的 F1(d) 修复。代码与成员 SPEC 的 MC-12、MC-16、MC-17 已按第 1 轮裁定改完；README 两种语言、`docs/` 与契约的两处正文还停在第 1 轮之前的说法。本闭包只改文档，让它们与现行 SPEC 和代码一致。

## 模型与推理强度
developer，implementation_kind product（文档），Claude Sonnet 5.5（claude-sonnet-5-5），effort high。理由：逐条对照已定的正文改写复述，判据完整，没有设计选择。

## 目标边界
目标：下面列出的每处漂移改到与现行成员 SPEC、契约 SPEC 与 `src/` 一致；契约补两处出处与一处定义。不改代码，不改用例。

### 已定的事（不重新裁定）
1. 唯一源：行为以成员 `SPEC.md` 的 MC-12、MC-16、MC-17 与 `src/` 为准；README 与 `docs/` 只复述，不另立规则。复述与 SPEC 冲突时改复述。
2. B 的漂移清单（方法入口「第 1 轮表达评审全文」的「跨文件矛盾与复述漂移清单」）在基线上仍成立的条目，派发者已核过的有：
   - 第 3 条：`docs/flows.md:94`「调用『未发出』时……占位撤销」，与 MC-16 第 13 步（停止信号已触发的未发出调用转为已结束）矛盾。
   - 第 4 条：`docs/architecture.md:23` 把 `lost.ts` 写成「传输答复到『传输不再可用』」。现行口径见 `src/internal/lost.ts` 文件头：按原因判断、偏安全、是登记的偏离，退出条件是契约给出「不再可用」的标记。
   - 第 6 条：`README.md:99` 与 `README_ZH.md:99` 的 S2 模块对照漏了 `internal/task-table.ts`。
   - 第 7 条：`README.md:64`、`README_ZH.md:64` 关于哪些操作会建连，按 MC-16 第 2–8 步与 MC-17 第 3 步核对后改。
   - `docs/object-model.md:50-52` 仍写 `stopOf()`、`markSent(connection)`、`markEnded()`；现行是 `reserve(key, signal)`、`markSent(key, connection, generation)`、`conclude(key, phase)`。
   - `docs/flows.md:84-86` 的调用序列（`markEnded` 等）按现行 `perform` 改写，含 F1(d)：转 `lost` 时拆除交给表的作用域，调用不等它。
   - `docs/architecture.md:51` 的调用口一段按现行 `perform` 改写（一个拥有者、一个停止信号、一个出口）。
   其余条目（第 1、2、5、8–13 条）先在基线上核对：已不成立的写「已随修复轮改」；仍成立的改。第 14 条（`verification/README.md`）不归本闭包。
3. 契约 R2 的 `cancelled`：现文「占位后、发出前收到了 `cancel`」改为「占位后、发出前，这次调用的停止信号已触发：收到了 `cancel`，或调用方的 `signal` 中止」。依据：卡拥有者对 fix1 写者自裁第 2 条的采纳（方法入口的 fix1 闭包规格追加记录）。
4. 契约 S2：写明 `continueWithInput` 的请求两个字段（`requestState`、`inputResponses`）都缺是前提违反，返回的 Promise 以 `TypeError` 拒绝，不占位。依据同上，自裁第 3 条。
5. 契约出处（B 的 N12）：契约 SPEC 的范围与依据表或裁定清单补两条出处：`McpPorts.checkOutput` 必填（调用口闭包裁定 4、7）；`ContinueRequest.inputResponses` 可选（调用口闭包裁定）。第 54 行前言「只有一处改了已有签名的必填性」限定它的适用范围或改正。行号是第 1 轮的，先在基线上重新定位。
6. 契约根新导出的常量 `OUTPUT_CHECK_FAILED`、`STRUCTURED_CONTENT_MISSING`：在契约 `docs/public-api.md` 列根导出的地方登记；那里不逐个列根导出时，按它现有的组织方式加一句，不新建清单。

### 写范围
- `packages/mcp/mcp/README.md` — 复述跟随
- `packages/mcp/mcp/README_ZH.md` — 复述跟随
- `packages/mcp/mcp/docs/` — 复述跟随
- `packages/mcp/mcp/index.md` — 复述跟随
- `packages/mcp/mcp/src/README.md` — 复述跟随
- `packages/mcp/mcp/src/index.md` — 复述跟随
- `packages/mcp/mcp/SPEC.md` — 只改已定事项 2 里仍成立、落在 SPEC 的条目；不改「性质与证据」一节
- `packages/mcp/mcp-contract/SPEC.md` — 只改 R2 的 `cancelled`、S2 的一句、出处两条与第 54 行前言
- `packages/mcp/mcp-contract/docs/public-api.md` — 新常量的登记
- `tmp/closures/w3-mcp-call-docs/`（新建） — 核对记录与门禁日志

### 排除的调用方
- `packages/mcp/mcp/src/`、`packages/mcp/mcp/tests/`、契约的 `src/` 与 `tests/`：只读。复述与代码冲突而 SPEC 也没写清时，停下交回，不改代码。
- `packages/mcp/mcp/verification/`、成员 SPEC「性质与证据」一节、`packages/mcp/mcp/tests/README.md`：`w3-mcp-call-model` 在另一棵树里改。
- `packages/mcp/mcp-host-local/`：只读。

## 验收清单
1. 已定事项 2 的每一条一行：位置、改成什么（或「已随修复轮改」及基线上的证据）。
2. 已定事项 3–6 各自落地，交回里给出改后的原句。
3. `git grep -n 'stopOf\|markEnded\|占位撤销' packages/mcp/mcp -- '*.md'` 只剩与现行行为一致的用法（逐条说明），`release(key` 同样。
4. `pnpm run check:docs`、`pnpm run check:design`、`pnpm run format:check`、`pnpm run lint:rules` 退出 0；`git ls-files --eol` 对改动文件没有 `w/crlf`。

## 实施规格
- 中文正文按 asd-ste100 的中文规则：一句一事、主语清楚、不用营销词；英文 README 用 STE-flavored。两种语言的 README 同步改。
- 复述只写到读者需要的层次，细节指向 SPEC 的条款号，不重抄步骤。
- 条款编号带链接（成员 SPEC 内的锚点或契约 SPEC 的锚点）。

## 性质及证据义务
- 每处改动能指出对应的 SPEC 条款或源码位置。

## 施工计划
1. 读方法入口里的表达评审全文、成员 SPEC 的 MC-12、MC-16、MC-17、偏离表与已知限制，`src/calls.ts`、`src/tasks.ts`、`src/internal/in-flight.ts`、`src/internal/lost.ts`。
2. 逐条核对已定事项 2 的清单，改成员文档；提交。
3. 契约 SPEC 与 `docs/public-api.md`；提交。
4. 门禁；交回。
每个阶段提交。提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行文档与规则检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、跑测试套件、跑差分变异。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call-docs。并行的有：`w3-mcp-call-model`（另一棵树，改 `verification/`、SPEC「性质与证据」、`tests/model/`）、`w3-mcp-host-strength`（另一棵树，host 与契约的用例）。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call-docs/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 第 1 轮表达评审全文：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r1-b-full.md
- 第 1 轮汇总与卡拥有者裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r1.md
- fix1 闭包规格与追加记录（自裁的采纳）：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call-fix1.md
- F1(d) 的裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call-model.md 追加记录
- 必须加载：asd-ste100；ub-mode

## 当前认知
- 已确认：基线上成员 SPEC 的 MC-12、MC-16、MC-17 是现行；`verification/README.md` 的调用口变异记录已改为 C 序列。
- 未知：B 清单第 1、2、5、8–13 条在基线上是否仍成立。

## 返回与恢复
每个提交号；验收逐项；已定事项 2 的逐条表；契约改后的原句；自定裁定与理由；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-call-docs/`。

## 已知会受影响的现有用例
- 无。

## 停止条件
- 复述与代码冲突，SPEC 也没写清哪个对：停下交回，附两处原文。
- 改契约要超出已定事项 3–5 的句子：停下交回。

## 追加记录
- 2026-11-05 16:44 派发前：简报检查退出 0，无警告。工作树由 `prepare-closures` 建出，身份已设为 PanQiWei。
- 2026-11-05 16:54 交回（3 个提交到 `3017ba2ff`，9 个文件全在写范围，树干净），已合入调用口分支（merge `0c094e6f1`）。交回的待裁项处置（卡拥有者）：契约 S8 写明 `closeAll` 之后 `continueWithInput` 答「未发出：`connection-unavailable`」，实现答 `unknown`；契约是语义拥有者，改实现（`104261a42`，新用例在改动之前答 `unknown`）。遗留项：成员依据表钉的契约修订改为 `104261a42`（`2678b21b5`）；契约依据表的「可加调整」与 S2 的取消一句由派发者在 `104261a42` 里改；`verification/README.md:169` 的 M17 归模型写者。
