# 闭包规格 w4-mcp-unusable

## 身份与位置
- 闭包：w4-mcp-unusable（W4 MCP 线切片 01，产品写者）
- 卡与修订：#1119 r1，波段 W4
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable
- 分支：PanQiWei/skill-mcp-w4-mcp-unusable
- 基线：<F>
- 清晰度：定

基线是 W4 的冻结输入 F：父分支 `PanQiWei/skill-mcp` 在 W3 全部合入（`706152690`）与 reduce 共享写之后的头。共享写只加两个 Cordis 草稿成员与依赖，不碰本闭包的文件。

本闭包让传输在答复上标出「传输不再可用」，调用口、任务操作与 `refresh` 只按这个标记（和 `authorization-required`）让连接转 `lost`。依据是 W4 MCP 规格第 1 节。同一分支上，本闭包交回之后另有守护写者写符合性条款、违约实现与探索器性质（不在本规格内）。

## 模型与推理强度
developer，implementation_kind product，Claude Opus 5.5（claude-opus-5-5），effort high。policy_version 947.1，policy_revision 0fe161ac874e0b538876a8b1e580b5c15e9bdd492178f703aaa9bcabedac3f67，role_source_revision c0a49e85629301ba225d65c857d6e9a88a14e75affcec153d11e333488c41299，宿主 Claude Code。策略按 work `capability`、risk `multi-package`、`cross-module-lifecycle` 解析为 Fable 5.1 xhigh。实际按负责人分档规则派 Opus high：跨三个成员的实现，新形状与全函数已在本规格定死，写者不做设计（W4 MCP plan「角色与模型分配」）。同一失败出现两次或 10 分钟没有进展时，派发者介入。

## 目标边界
目标：传输的失败答复带可选标记 `unusable`，由决策层写入，两种传输与脚本化传输原样交出；`mcp` 用一个全函数决定答复对连接的后果；契约 SPEC 与成员 SPEC 改成与之一致，偏离表删空。只做下面列的事。

### 已定的事（不重新裁定）

1. **类型。** 在 `packages/mcp/mcp-contract/src/`：
   - `UnusableCause` 改为 `'stream-broken' | 'process-exited' | 'session-ended'`（去掉 `abandoned`；现在没有生产者：决策层只给 `process-exited`、`session-ended`，两种传输的线路结束只给 `stream-broken`、`process-exited`）。
   - `TransportFailure`（`transport.ts`）的 `not-sent`（`connection-unavailable`）、`not-sent`（`session-ended`）与 `no-answer` 三个变体加可选字段 `unusable?: UnusableCause`。`not-sent`（`authorization-required`）、`error-answer`、`answer-malformed` 不加：它们不会因为线路结束而产生，不加就让下面全函数的第 1、2 条互不重叠。
   - `PeerAnswer`（`outcomes.ts`）的 `no-answer` 变体加同一个可选字段（`SentCall.answer` 与 `TaskAnswer` 的 `finished` 经它带标记）。
   - 决策层的 `WireAnswer`（`decisions.ts`）中对应的 `not-sent` 与 `no-answer` 同样带这个字段。
   - 字段出现表示传输在交出这个答复时已经不再可用；不出现表示仍可用。这是可加改动（0.x，`UnusableCause` 的收窄没有外部消费者）。
2. **标记只由决策层写。** `settle(wire, unusable)` 把 `unusable` 写进交出的 `wire`；`lineGoneAnswerOf(phase, cause)` 交出的答复带 `unusable: cause`；传输进入「不再可用」状态之后，对之后每个请求的答复带它记下的原因（T8「之后每个请求」）。两种传输（`mcp-host-local` 的 `session.ts` 一带）与脚本化传输（`testing-scripted-transport.ts`）只把决策层的答复原样交出，不自己判断。符合 T 段前言「实现……不归类」。`AnswerConclusion` 上现有的 `unusable` 保留，传输仍用它进入「不再可用」状态。本端调用 `close()` 之后的答复不带标记：关闭是本端的决定（同 `abandoned`），这条连接的结束由连接表负责。
3. **全函数。** 在 `packages/mcp/mcp/src/internal/lost.ts` 用一个函数取代 `lostOfNotSent`、`lostOfNoAnswer`、`lostOfOutcome`。它对就绪连接上一个请求的答复给出后果，按序取第一条成立的：
   1. 答复带 `unusable: c`：`lost`，原因 `c`，清单标记 `connection-unavailable`。
   2. 答复是 `not-sent`（`authorization-required`）：`lost`，原因 `authorization-required`，清单标记 `authorization-required`。
   3. 其余：连接不变。
   输入覆盖三个服务交给它的全部答复（`TransportFailure`、`PeerAnswer`，或它们在调用口结局里的形状），返回 `Lost | undefined`。签名由写者按三个调用点定，要求是 `switch` 穷尽、不按 `cause` 判断可用性。
4. **三个服务改用它。** `calls.ts`、`tasks.ts`、`discovery.ts` 的每个转 `lost` 的地方只问这个函数，转法不变（`loseOn`、`loseInScope`）。调用口为 T5 停止信号的答复单独跳过判断的分支（MC-16 第 9 步）：停止信号的答复是 `no-answer`（`abandoned`）且不带标记，按第 3 条已是「不变」。核实后删去这个分支；核实不了（例如答复形状不同）就保留并在交回写明。
5. **`refresh`。** 页请求或 `discover` 答不带标记的 `not-sent`（`connection-unavailable`）：页请求算这一页失败，`kept`（`listing-incomplete`，缺陷 `page-failed`），连接转 `degraded`（`list-failed`）；`discover` 上 `refresh` 答 `connection-unavailable`，连接转 `degraded`（`discover-failed`）。与 S5 现在对 `no-answer` 的写法对称。带标记或 `authorization-required` 时仍转 `lost`（第 3 条）。
6. **建连不在此列。** 建连中 `open` 或 `discover` 失败，无论带不带标记，建连都失败并按 MC-5 处置。`internal/build.ts` 不改。
7. **契约 SPEC（`packages/mcp/mcp-contract/SPEC.md`）要改的条款**，逐条：
   - T1 或 T 段前言：答复上的 `unusable` 字段，含义同第 1 条；写方义务同第 2 条。
   - T8 前言「写『传输不再可用』的行」一段（约第 518 行）：这些行与 `lineGoneAnswerOf` 结算的请求，答复带标记；之后的每个请求同样带。
   - S5 首句：「T8 结论带『传输不再可用』」改为「答复带 `unusable`」。S5「失败」一句：按第 5 条改写 `not-sent` 的后果。S5 另加两句：时限先于清单标记到期时 `ensure` 答 `pending`；`closeAll` 有本包错误时以 `AggregateError` 拒绝、不交出确认范围（若写在 S8 更合结构，写在 S8，交回写理由）。S5 再加一句：建连中的 `discover` 失败归建连失败（MC-5），不是「就绪连接的 `discover` 失败」。
   - S7「传输不再可用」一条：原因取答复的标记；X02 的 `not-sent` 由决策层标为 `stream-broken`。
   - R1 与 S2 关于「资格非 `granted` 时任务操作」的冲突句，按现行实现改为同一句；R7 的 `no-connection` 定义写明含「资格不是 `granted`」。
   - 其余按失败种类写连接后果的句子：`grep -n "转为 \`lost\`\|转 \`lost\`" SPEC.md` 逐条核对，与全函数不一致的改。
   - 「裁定」或变更记录的一节加一条，写明本次形状变化与 `UnusableCause` 的收窄。
8. **成员 SPEC（`packages/mcp/mcp/SPEC.md`）。** 「与已定事项和契约的偏离」三行删除；表空了就整节改为一句「没有偏离」。MC-16、MC-17 中按原因判断的步骤改为引用全函数。`verification/README.md` 的变异表随之更新。
9. **`mcp-host-local`。** `src/` 只改交出答复的地方（若决策层已写好标记，可能只需不丢字段）；`SPEC.md` 与 `verification/` 写到答复形状的地方同步。

### 写范围
- `packages/mcp/mcp-contract/src/transport.ts` — 第 1 条：`TransportFailure` 三个变体的字段
- `packages/mcp/mcp-contract/src/outcomes.ts` — 第 1 条：`PeerAnswer` 的字段
- `packages/mcp/mcp-contract/src/decisions.ts` — 第 1、2 条：`UnusableCause`、`WireAnswer`、`settle`、`lineGoneAnswerOf`、`streamGoneAnswerOf`
- `packages/mcp/mcp-contract/src/testing-scripted-transport.ts` — 第 2 条：原样交出、不再可用之后的答复带标记
- `packages/mcp/mcp-contract/src/index.ts` — 仅当导出名变化
- `packages/mcp/mcp-contract/tests/` — 现有用例随形状更新；`toEqual` 精确形状的断言加上标记
- `packages/mcp/mcp-contract/SPEC.md` — 第 7 条列出的条款
- `packages/mcp/mcp-contract/docs/public-api.md` — `UnusableCause` 一行与答复类型的说明随第 1 条更新
- `packages/mcp/mcp-host-local/src/` — 第 2、9 条：`session.ts` 及交出答复的文件
- `packages/mcp/mcp-host-local/tests/`（含 `fixtures/`、`model/`） — 断言答复精确形状的用例更新（如 `stdio.spec.ts:153`、`session.spec.ts:1532`）
- `packages/mcp/mcp-host-local/SPEC.md`、`packages/mcp/mcp-host-local/verification/` — 写到答复形状处
- `packages/mcp/mcp/src/internal/lost.ts` — 第 3 条
- `packages/mcp/mcp/src/calls.ts`、`packages/mcp/mcp/src/tasks.ts`、`packages/mcp/mcp/src/discovery.ts` — 第 4、5 条
- `packages/mcp/mcp/tests/` — 第 3–5 条的用例；现有用例随行为更新（不含 `tests/model/`，归守护写者）
- `packages/mcp/mcp/SPEC.md`、`packages/mcp/mcp/verification/README.md` — 第 8 条（`verification/README.md` 的「两种证据能变红」一节归守护写者，本闭包只改变异表里随行为变的行）

### 仓库之外的任务产物
无。

### 排除的调用方
- `packages/mcp/mcp/src/internal/build.ts`：建连路径，第 6 条。它有一个同名私有函数 `lostOfNoAnswer`，与 `lost.ts` 的导出无关，不改。
- `packages/mcp/mcp-contract/src/testing-transport.ts`、`testing-transport-table.ts`：符合性套件与表，归守护写者。本闭包改形状后若它们编译失败，只做让它们编译通过的最小改动（字段透传），在交回逐处列出；条款本身不加。
- `packages/mcp/mcp/tests/model/`、探索器：归守护写者。本闭包的行为改动若让现有性质或场景失败，停下（停止条件第 2 条）。
- 其他组：`git grep -l "@omne-harness/mcp" -- '*/package.json'` 在 MCP 组外没有命中，不受影响。
- `packages/mcp/docs/`、`docs/domains/mcp/`：组页与领域页由 reduce 在切片 03 写回。

## 验收清单
1. `VITEST_MAX_WORKERS=6 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp --filter=@omne-harness/mcp-host-local` 退出 0；同一组 `--filter` 的 `pnpm turbo run test:slow` 退出 0。交回用例数、输出尾部与日志哈希。
2. `grep -nE 'export function (lostOfNotSent|lostOfNoAnswer|lostOfOutcome)' packages/mcp/mcp/src/internal/lost.ts` 无输出；`grep -nE 'lostOfNotSent|lostOfNoAnswer|lostOfOutcome' packages/mcp/mcp/src/calls.ts packages/mcp/mcp/src/tasks.ts packages/mcp/mcp/src/discovery.ts` 无输出。`git grep -n -E 'loseOn\(|loseInScope\(' -- packages/mcp/mcp/src ':!packages/mcp/mcp/src/internal/lost.ts'` 的每个调用点之前的判断来自第 3 条的函数（交回列出调用点清单）。
3. `awk '/^### 与已定事项和契约的偏离/{f=1;print;next} f&&/^##/{exit} f' packages/mcp/mcp/SPEC.md` 的输出里表格没有数据行，或整节是「没有偏离」。`grep -c '比契约 S7 宽\|波末小卡 K7' packages/mcp/mcp/SPEC.md` 输出 `0`。
4. `mcp` 的新用例（标题写出条号）：调用、任务、`refresh` 的页请求、`refresh` 的 `discover` 各有「带标记转 `lost`、不带不转」；全函数第 2 条一例；HTTP 的 5xx 与单个 POST 流断开各一例（经脚本化传输或 `mcp-host-local` 的用例，答复不带标记，连接不变）；`refresh` 上不带标记的 `not-sent` 答 `kept`（`page-failed`）与 `degraded`（第 5 条）。每条新用例在交回里写一处让它变红的源码改动（例如全函数第 1 条改成忽略标记），在副本上做，不提交。
5. `mcp-host-local`：一条用例断言 stdio 进程退出之后，在途请求与之后的请求的答复都带 `unusable: 'process-exited'`；一条断言 HTTP 上单个 POST 失败（5xx）的答复不带标记，下一个请求照常发出。
6. `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs` 退出 0；输出尾部与日志哈希。
7. `git diff --name-only <F>..HEAD` 只含写范围内的文件。

## 实施规格
- 先改类型（第 1 条），让编译器列出每个要处理的地方，再按第 2–5 条改。不加 `as` 断言绕过类型。
- 全函数的 `switch` 穷尽，`default` 用 `never` 检查。
- 契约 SPEC 只改第 7 条列的条款，中文按 asd-ste100 的语言无关规则，只写现状与依据。
- 用例标题是可读的英文句子，写出条号。不写阶段式注释。

## 性质及证据义务
- 性质：单个请求失败而传输仍可用时，连接不转 `lost`；传输不再可用时，连接转 `lost`。本闭包用第 4、5 条的用例与变红验证给出证据。探索器性质与符合性条款由守护写者在本闭包之后加。
- 差分变异由派发者在最终 head 上跑，不在本闭包。

## 施工计划
1. 读方法入口；在工作树根确认三包已构建（`ready.json`）。
2. 第 1 条类型与第 2 条决策层；契约用例更新；契约包 `build typecheck test` 通过。
3. `mcp-host-local` 透传与用例（第 9 条、验收第 5 条）。
4. `mcp` 的全函数与三个服务（第 3–5 条）与用例（验收第 4 条）。
5. 两份 SPEC 与 `verification/`（第 7、8 条）。
6. 验收第 1、6、7 条；变红验证；交回。
提交信息中文，作者 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code`、`Agent-Role: developer`。不加 Co-Authored-By。可以分几次提交。

## 自主范围与动作授权
允许：写范围内改文件；运行三个成员的构建、类型检查、快层与慢层；本地提交。不允许：推送、开 PR、合并、改写范围外文件、改 `package.json` 与锁文件、跑 `admission`、仓库全量测试与差分变异。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable，已构建 `mcp-contract`、`mcp`、`mcp-host-local`。同时可能有 Skill 线的一个写者在另一棵树上跑门禁，共用 CPU：单个用例文件用 `VITEST_MAX_WORKERS=4 pnpm exec vitest run <文件>`，三包整组只在交回前跑一次。HTTP 夹具只用 20000–59999 的端口。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- W4 MCP 规格第 1 节（第 1–8 条与第 4 条的全函数）：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/mcp/spec.md
- W4 MCP 计划切片 01：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/mcp/plan.md
- 契约：`packages/mcp/mcp-contract/SPEC.md` 的 T 段（T1、T5、T8 与第 560–640 行的表）、S2、S5、S7、S8、R1、R7；`src/decisions.ts`、`src/transport.ts`、`src/outcomes.ts`
- 现行转 `lost`：`packages/mcp/mcp/src/internal/lost.ts` 与三个调用文件；成员 SPEC「与已定事项和契约的偏离」、MC-16、MC-17
- 传输：`packages/mcp/mcp-host-local/src/session.ts`（`die`、`dead`、第 735 行）
- 必须加载：ub-mode、asd-ste100

## 当前认知
- 已确认：基线上三包整组测试与慢层退出 0（父分支 `706152690`，卡评论 6683488904）。
- 已确认：`UnusableCause` 的 `abandoned` 没有生产者（`decisions.ts` 第 155、170 行；`session.ts` 第 349–395 行；`testing-scripted-transport.ts` 第 699–700 行）。
- 未知：调用口 T5 跳过分支能否删（第 4 条）；S5 两句写在 S5 还是 S8 更合结构。

## 返回与恢复
每个提交号；验收各条的命令、结果、输出尾部与日志哈希；全函数的最终签名；调用点清单；变红验证表；为让符合性套件编译而做的最小改动清单；契约 SPEC 改了哪些条款（条号与一句摘要）；未覆盖项。

## 已知会受影响的现有用例
- `mcp-host-local/tests/stdio.spec.ts:153`、`session.spec.ts:1532` 一类 `toEqual` 精确形状的断言。
- `mcp` 中断言「`not-sent` 后连接 `lost`」「`no-answer`（`stream-broken`）后连接 `lost`」的用例：行为按第 3–5 条改变，用例随之改，并在交回列出每一条改了什么。

## 停止条件
- 某个改动需要写范围外的文件，或需要改 `package.json`、锁文件。
- 守护范围内的现有性质或场景（`mcp/tests/model/`）因行为改动失败。
- 契约里出现与第 3 条全函数矛盾、且第 7 条没有列到的规则，而改它会改变另一条已定事项。
- 基线上的用例在本工作树失败。

## 追加记录
