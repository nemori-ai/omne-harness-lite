# 闭包规格 w3-mcp-e2e-fix1

## 身份与位置
- 闭包：w3-mcp-e2e-fix1
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-e2e
- 分支：PanQiWei/skill-mcp-w3-mcp-e2e（PR #1149）
- 基线：71b4b02f336c46af0d13cc9860d535b994009fe9
- 清晰度：定

`w3-mcp-e2e` 第 1 轮评审之后唯一的一轮修复（C-SM-08）。原规格 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-e2e.md` 仍然有效（含追加 1）；本页只写这一轮要改的。三面评审在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/` 下的 `mcp-e2e-r1-a.md`、`mcp-e2e-r1-b.md`、`mcp-e2e-r1-e.md`。

## 模型与推理强度
developer，implementation_kind verification，Claude Sonnet 5.5（claude-sonnet-5-5），effort high。policy_version 947.1。理由：改动指到文件与行，测试与文档各几处。

## 目标边界
目标：评审选定的各条改完，S6 证明「请求发出之后」，每个目标实际跑的步有断言，文档与代码事实一致。只做下面列的事。

### 已定的事（不重新裁定）
1. **A N1（S6 的发出时刻）。** 去掉固定等待 `SEND_GRACE_MS`。长时工具的参数让它尽早发进度通知；经 `invoke` 请求的 `observe` 等到第一条进度通知，再 `cancel`。等待有上界（超过上界时用例失败并写明「没有收到进度」）。三个适用目标都应走 `sent` 分支。改完在工作树之外的副本上重做「取消」变异：只改 `sent` 分支的那一处，三个目标的 S6 都变红。写读数与日志哈希。
2. **A N4（适用列的断言）。** 每个目标带一份期望的步号表，对实际跑过的步号断言相等。
3. **A N5（MC3-12 的读数）。** 读数在逐步断言之前写进 `readings`（或在 `finally` 里），使 MC3-12 在种类不同时自己报出那一步。
4. **A N6（失败路径的关闭）。** `started.close()` 放进内层 `finally`：`closeAll` 拒绝时目标也关闭，原来的失败不被盖掉。
5. **A N8。** 删掉输出校验替身里没有人读的计数；替身仍对任何值答 `conforms`。
6. **B-1。** `packages/mcp/mcp-host-local/README.md` 与 `README_ZH.md` 第 17 行一带「真实组合未验证，归 `w3-mcp-e2e`」改为现状：`tests/e2e/` 在本机真实服务端上验证与 `@omne-harness/mcp` 的组合，指向 SPEC「组合与验证」。
7. **B-2 与 B N-1。** SPEC 新行的「C4」写成「卡 #1119 判据 C4」并给卡的链接；「MC3-12」不在正式文档出现，改写成它的内容（两种现代传输逐步结局种类相同）。
8. **B N-2 至 N-10。** 按评审文件逐条改。N-8：SPEC「范围与依据」登记新增的测试对端（server-filesystem、mcp-server-fetch 与它们的版本、来源）。N-3：E-sse 的 S4、S5 写成「按修订不适用」，依据是契约 T3：旧修订的 `initialize` 不声明客户端能力（`legacyInitializeParamsOf`），服务端因此不登记表单输入与任务工具；脚本化传输上的契约用例只作补充覆盖，写出用例文件与标题。
9. **A N2、N3、N9 写进文档。** SPEC「组合与验证」的「未覆盖」加两条：端到端旅程不核对端是否收到取消通知（由 `packages/mcp/mcp/tests/cancel.spec.ts`、`invoke.spec.ts` 与 `tests/stdio.spec.ts` 守住）；HTTP 目标的 S7 不核对传输已关闭（由 `packages/mcp/mcp/tests/release.spec.ts` 守住）。`tests/e2e/README.md` 写明 S5 选的工具途中必经 `input_required`，这是该工具的前提。
10. **E：对照矩阵的退出码。** 重跑 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/compat/mcp-compat-matrix.mjs`，把命令、退出码、`date -u` 与输出哈希写进 `compat/README.md` 那一节（追加一行运行记录，不改 09:57 的读数表；读数与上次不同时另起一表写明）。
11. **变异证据。** A 面在副本上补做的变异（`mcp-e2e-r1-a.md` 第 2 节：S1、S2、S4、S5 与 S7 的 `no-process` 一支）与本轮第 1 条的重做，一起写进交回的变异表，标明各自的运行者与 head。

### 写范围
- `packages/mcp/mcp-host-local/tests/e2e/journey.spec.ts` — 第 1–4 条
- `packages/mcp/mcp-host-local/tests/e2e/targets.ts` — 第 1、2 条（长时工具参数与期望步号）
- `packages/mcp/mcp-host-local/tests/e2e/assembly.ts` — 第 5 条
- `packages/mcp/mcp-host-local/tests/e2e/README.md` — 第 8、9 条
- `packages/mcp/mcp-host-local/tests/e2e/index.md` — 第 8 条
- `packages/mcp/mcp-host-local/tests/README.md` — 第 8 条（N-7）
- `packages/mcp/mcp-host-local/tests/index.md` — 第 8 条（N-6）
- `packages/mcp/mcp-host-local/tests/fixtures/README.md` — 第 8 条（N-10）
- `packages/mcp/mcp-host-local/README.md` — 第 6 条
- `packages/mcp/mcp-host-local/README_ZH.md` — 第 6 条
- `packages/mcp/mcp-host-local/SPEC.md` — 只改「范围与依据」（N-8）与「组合与验证」（第 7–9 条）

### 仓库之外的任务产物
第 10 条写父分支工作树任务 tmp 的 `compat/README.md`。

### 排除的调用方
- 任何成员的 `src/`。
- `packages/mcp/mcp-host-local/tests/` 下 e2e 以外的用例与夹具代码。
- `packages/mcp/README.md`（组入口，B N-11）：归 `w3-docs-mcp`，派发者在那条分支上改。
- `package.json` 与锁文件。
- 简报检查报的 `call`、`reserved`、`SentCall` 的调用方：规格只在「当前认知」引用它们，本闭包不改它们的定义。

## 验收清单
1. `VITEST_MAX_WORKERS=6 pnpm --filter @omne-harness/mcp-host-local test:slow` 退出 0；`tests/e2e/` 的用例都执行，P 没有跳过。
2. 第 1 条的变异读数：只改 `sent` 分支，三个适用目标的 S6 都变红。
3. MCP 三包 `typecheck`（`pnpm turbo run typecheck --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp --filter=@omne-harness/mcp-contract`）、`lint:rules`、`lint:oxlint`、`format:check`、`check:docs`、`check:design` 退出 0。仓库级 `typecheck` 与 `lint:deps` 在这棵树上受其他成员没构建 `dist` 的影响，不作本轮验收。
4. `git diff --name-only 71b4b02f3..HEAD` 只含写范围内的文件。
5. 第 1–11 条逐条写「已改」与位置。

## 实施规格
- 等待都有界，用例时限低于慢层的 120 s。
- 中文按 asd-ste100 的语言无关规则；英文 README 用 STE-flavored。只写现状与依据，不写评审轮次与过程。

## 性质及证据义务
- 第 1 条的变异在副本上做，做完还原；改了 `src` 的副本要重新构建被改的包再跑（成员测试 import 的是 `dist`）。

## 施工计划
1. 读三份评审与本页。
2. 第 1–5 条（测试代码），跑 e2e 文件。
3. 第 1 条的变异。
4. 第 6–9 条（文档）。
5. 第 10 条。
6. 门禁、交回。
提交信息中文，作者 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code`、`Agent-Role: developer`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行 `mcp-host-local` 的单个用例文件与慢层；运行对照脚本；本地提交。不允许：推送、开 PR、合并、改写范围外文件、改产品源码。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-e2e。并行的有两份文档写回的评审（只读，别的树）。单个用例文件在 `packages/mcp/mcp-host-local` 下 `VITEST_MAX_WORKERS=4 pnpm exec vitest run tests/e2e/journey.spec.ts --mode slow`。不跑 `admission`、仓库全量测试与差分变异。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-e2e/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 原规格与追加记录：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-e2e.md
- 上一轮交回：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-mcp-e2e.md 与同目录 `w3-mcp-e2e-logs/`
- 三份评审：见「身份与位置」
- 契约 T3、T5：`packages/mcp/mcp-contract/SPEC.md`
- 必须加载：asd-ste100

## 当前认知
- 已确认（派发者读代码）：HTTP 上传输的 `call` 要等请求离开（fetch 答复）或应答先到才交回 `SentCall`，在途表在这之前是 `reserved`；固定等待 300 ms 时 E-http 的取消走 `reserved` 分支。等到第一条进度通知时，`call` 已经交回。
- 已确认：A 面的补充变异让 S1、S2、S4、S5 与 S7 的 `no-process` 一支各有一处变红（`mcp-e2e-r1-a.md` 第 2 节）。

## 返回与恢复
提交号；验收各条的命令、结果、输出尾部与日志哈希；变异表；对照矩阵的运行记录；逐条位置；未覆盖项。交回写到 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-mcp-e2e-fix1.md`。

## 已知会受影响的现有用例
- `tests/e2e/journey.spec.ts`（本闭包自己的用例）。

## 停止条件
- 长时工具发不出进度通知，或进度通知不经 `observe` 到达：停下交回，写明服务端的实际行为。
- 某条改动需要改 `src/` 或写范围外的文件。

## 追加记录
- 2026-11-06 10:28 派发前：A 阻断 0、非阻断 11；B 阻断 2、非阻断 11；E 未达到 1.5、1.6 等（处置：1.5 在合入父分支后于全构建的父树上取证；1.6 的依赖提交与 `targets.ts` 由派发者接受）。选做 A N1、N2、N3、N4、N5、N6、N8、N9，B 全部，E 的退出码；A N7、N10 不做（无后果，评审自判非阻断）。
