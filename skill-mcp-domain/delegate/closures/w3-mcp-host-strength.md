# 闭包规格 w3-mcp-host-strength

## 身份与位置
- 闭包：w3-mcp-host-strength
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-strength
- 分支：PanQiWei/skill-mcp-w3-mcp-host-strength
- 基线：f04851ce4476dd7dfde3ae0b079dd9e5b5d0ca7c
- 清晰度：界

基线是 host 分支 `f04851ce4`：fix1、文档闭包、派发者的后续修正与形式化闭包都已合入。第 1 轮差分变异在两个成员上测量无效（`waves/w3/reviews/mcp-host-r1.md`「D. 差分变异」）：host-local 有 2 个运行错误，是 Stryker 对没有原型的对象报 `Cannot convert object to primitive value`；存活与无覆盖的线索指向几类输入没有被用例钉住。交付边界评审还要求 MC3-10、MC3-11 每条用例有「用例 → 缺陷 → 变红证据」。本闭包加强用例，并留下这些证据。最终 head 的差分变异由第 2 轮评审跑，不归本闭包。

## 模型与推理强度
developer，implementation_kind verification，Claude Sonnet 5.5（claude-sonnet-5-5），effort high。理由：补输入用例与手工变异取证是验证设施里的经济档工作，规格与判据完整，不涉及跨进程故障建模（那部分已由形式化闭包完成）。

## 目标边界
目标：(1) 找到并消除第 1 轮变异运行错误的来源；(2) 按 D 的线索补用例，每个新用例至少杀死一个具名的手工变异；(3) MC3-10、MC3-11 每条用例的变红证据；(4) 逐条执行成员 SPEC「结果与不变量」H1–H14 的变异句，不成立的改正句子。

### 已定的事（不重新裁定）
1. 抛出或拒绝的值都应是 `Error`。来源在产品源码时，只改那一处抛出或拒绝，让它是 `Error`；来源在用例或夹具时改用例或夹具。
2. D 的线索（逐项，见方法入口里的第 1 轮评审记录「D」一节）：契约 `readers.ts` 可选字段的缺省（`=== undefined → false` 一类存活）；`envelope.ts` 控制字符与 0x7e 的边界；`authorization.ts` 参数名大小写与空白；`withheld.ts` 关键字表逐项；`plain.ts` 的 `isPlainJson` 一族；host-local `http-line.ts` 错误码表逐项；`authorization.ts` 取回路径的快层覆盖；`session.ts` 的中断路径。行号是第 1 轮旧 head 的，先在基线上重新定位；已经随修复轮删除或改写的写明，不补。
3. 穷尽检查的 `default`（`never`）分支不补用例：类型保证运行时不可达，记为等价。
4. MC3-10 的「非 JSON 行 → `stream-broken`」已被裁定 F4 取代：按契约 T2，解析不了的一行丢弃、流继续，只有超过行缓冲上界的一行是断流。证据按现行契约写。
5. 变红证据的做法：改源码 → 重建 `dist`（用例经包名导入，走 `dist`）→ 跑这一条用例 → 还原 → 重建。每条记下变异、用例、红的输出摘录与日志路径。
6. 新用例写进现有的用例文件或夹具，按快层与慢层的现有划分放；不新建用例文件，除非现有文件放不下一类输入（写明理由）。

### 写范围
- `packages/mcp/mcp-host-local/tests/` — 新用例与夹具（`tests/model/` 只读）
- `packages/mcp/mcp-contract/tests/` — 读法、信封、授权、剔除、纯 JSON 的新用例
- `packages/mcp/mcp-host-local/src/` — 只为已定事项 1 改抛出或拒绝的值；其他改动停下交回
- `packages/mcp/mcp-contract/src/` — 同上
- `packages/mcp/mcp-host-local/SPEC.md` — 只改「结果与不变量」H1–H14 中执行后不成立的变异句
- `packages/mcp/mcp-host-local/tests/README.md` — 新用例的登记跟随
- `packages/mcp/mcp-host-local/tests/index.md` — 新用例的登记跟随
- `packages/mcp/mcp-contract/tests/README.md` — 新用例的登记跟随
- `packages/mcp/mcp-contract/tests/index.md` — 新用例的登记跟随
- `tmp/closures/w3-mcp-host-strength/`（新建） — 变异日志、红的输出、门禁日志

### 排除的调用方
- `packages/mcp/mcp-host-local/tests/model/`、`verification/`：形式化闭包的成果，只读。
- 成员 SPEC 的其他节、README 两种语言、`docs/`：只读。
- `packages/mcp/mcp/`：只读。

## 验收清单
1. `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp-contract` 退出 0；`pnpm --filter @omne-harness/mcp-host-local run test:slow` 退出 0。
2. 运行错误的来源：写明是哪个用例、哪个变异体下、抛出或拒绝了哪个值；改动之后，同一个变异体下这个值是 `Error`。如果第 1 轮的两个位点（`session.ts:355`、`stdio-line.ts:59`）在基线上已不存在，在基线上找同类来源（`git grep` 用例与源码里抛出或拒绝非 `Error` 值的地方），逐个列出处置。
3. D 的线索逐项一行：新用例名、它杀死的手工变异、红的日志；或「已随修复轮删除」「等价」及理由。
4. MC3-10、MC3-11 的每条用例一行：用例名 → 它防的缺陷（变异）→ 红的日志路径。
5. H1–H14 的变异句逐条一行：执行的变异、预期变红的用例、实际结果；不成立的句子已改正。
6. 每个手工变异之后 `git status` 干净（还原后），`dist` 已按原源码重建。
7. `pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run format:check`、`pnpm run check:docs`、`pnpm run typecheck` 退出 0；`git ls-files --eol` 对改动文件没有 `w/crlf`。

## 实施规格
- 新用例断言要求的结果，含契约要求的「不出现」与固定值；不断言实现细节。
- 用例标题写行为，不写变异名；变异名只出现在交回与日志里。
- 手工变异在本工作树里做，一次一处，跑完立即还原；不留未提交的变异。批量变异写成脚本放 `tmp/closures/w3-mcp-host-strength/`，还原用 `git checkout -- <文件>`，每个变异之后核 `git status`。

## 性质及证据义务
- 每个新用例：至少一个能让它变红的手工变异及红的日志。
- 每条 MC3-10、MC3-11 用例与每条 H 变异句：变红的日志，或「不成立」与改正后的句子。

## 施工计划
1. 读第 1 轮评审记录「D」与 E 节、成员 SPEC「结果与不变量」与「组合与验证」、`tests/README.md`、契约 `tests/README.md`。
2. 运行错误的来源：先 `git grep` 抛出或拒绝的值，再看第 1 轮的两个位点在基线上的对应位置；改，提交。
3. D 的线索逐项补用例，每补一类提交一次。
4. MC3-10、MC3-11 与 H1–H14 的变红取证（脚本化），改正不成立的变异句，提交。
5. 门禁；交回。
每个能过类型检查的阶段都提交。提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行两个成员的构建与测试（含慢层）；在本工作树做手工变异并还原；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增依赖、跑差分变异（`pnpm run mutation`）、跑 `admission` 或仓库全量测试。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-strength。并行的有：`w3-mcp-call-model`（另一棵树，在跑 mcp 成员的探索器与 TLC）。本机 8 核：成员测试用 `VITEST_MAX_WORKERS=4`，同一时刻只跑一个测试进程。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-strength/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 第 1 轮评审与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r1.md（「D. 差分变异」与「卡拥有者对 D 的处置」、E 节）
- 验收行：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/mcp/spec.md 的 MC3-10、MC3-11
- 契约：`packages/mcp/mcp-contract/SPEC.md` 的 T2、T3、T4、T8
- 必须加载：verification-facility；ub-mode；pstack:typescript-best-practices；改 SPEC 时 asd-ste100

## 当前认知
- 已确认：用例经包名导入，走 `dist`；改源码后不重建 `dist`，用例看到的还是旧代码。
- 已确认：第 1 轮的行号来自旧 head `8f9016fd8`；修复轮重写了 `session.ts` 的大部分并删除了 `message.ts`。
- 未知：运行错误在基线上是否仍会出现。

## 返回与恢复
每个提交号；验收逐项的命令与结果；运行错误的来源与处置；D 线索表；MC3-10、MC3-11 证据表；H1–H14 变异句表；自定裁定与理由；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-host-strength/`。

## 已知会受影响的现有用例
- 无删除与放宽；新增用例跟随现有文件。

## 停止条件
- 运行错误的来源要改写范围外的文件，或要在源码里做「改为 `Error`」以外的改动：停下交回。
- 一条 H 变异句或 MC3 用例的变异在三种写法下都不变红，又不能判等价：停下交回，附三次的日志。
- 新用例暴露出实现缺陷（行为与契约不符）：不修，留反例交回。

## 追加记录
- 2026-11-05 16:41 派发前：简报检查退出 0。1446 条 `caller-outside-scope` 警告全部是规格正文里的 `dist` 一词与全仓库同名标识符（工具链、其他成员）的匹配；本闭包只在两个成员内重建 `dist`，不改这些调用方。工作树由 `prepare-closures` 建出（安装、投影、构建 host-local 都 ok），身份已设为 PanQiWei。
- 2026-11-05 18:13 交回（12 个提交到 `2f5da420f`，16 个文件全在写范围，`src/` 未改），已合入 host 分支（merge `aba91c15b`）。卡拥有者的处置：
  - 运行错误：写者更正了前提。值本来就是 `Error`；Stryker 的 vitest runner 在全部用例通过而 `errorsSet` 非空时，对 vitest 序列化出的无原型克隆调 `errorToString`。用例侧守卫 `tests/unhandled.ts`（未处理拒绝让用例失败）采纳：它与 P7「没有 promise 脱离拥有者运行」一致。另记进波末的测试运行器缺陷卡：差分变异把「全部通过加未处理错误」记成运行错误，原因是对序列化克隆调 `String()`。以后可考虑把守卫移到 `vitest.config.ts` 的 setup 文件，交第 2 轮设计与实践评审判断。
  - MC3-10「`open` 之前已退出」：四层各自保证，单层变异不变红、四层同时去掉变红，判为防御纵深，不触发停止条件；线路一层另由 `lines.spec.ts` 单独核对。SPEC「组合与验证」写明（`db06b5b70`）。
  - 写者列出的 SPEC「组合与验证」陈旧处（H12、H14 的未覆盖句、验证表两行）由派发者改（`db06b5b70`）。
