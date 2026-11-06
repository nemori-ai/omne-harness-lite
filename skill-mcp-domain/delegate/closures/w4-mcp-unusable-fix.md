# 闭包规格 w4-mcp-unusable-fix

## 身份与位置
- 闭包：w4-mcp-unusable-fix（W4 MCP 线切片 01 的关口修复轮，C-SM-08 的唯一一轮）
- 卡与修订：#1119 r1，波段 W4
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable
- 分支：PanQiWei/skill-mcp-w4-mcp-unusable（PR #1159）
- 基线：559be15145be26a0f549c76333b08b70e61e0149
- 清晰度：定

基线是关口候选 head。

修复的依据是关口四面的评审与派发者的结构分析：

- 四面原文：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/reviews/mcp-unusable-r1-{A,B,C,E}.md`
- 汇总与裁定：同目录 `mcp-unusable-r1.md`（以最后一次裁定为准：16:05 那一条取代 15:56 对 B-1 的裁定）
- 结构分析：同目录 `mcp-unusable-r1-analysis.md`。先读它，下面每一项都标了它所属的轴。

## 模型与推理强度
developer，implementation_kind product，Claude Opus 5.5（claude-opus-5-5），effort high。policy_version 947.1，policy_revision 0fe161ac874e0b538876a8b1e580b5c15e9bdd492178f703aaa9bcabedac3f67，role_source_revision c0a49e85629301ba225d65c857d6e9a88a14e75affcec153d11e333488c41299，宿主 Claude Code。同原闭包：跨三个成员，形状与规则都已由本规格写定，写者不做设计。同一失败出现两次或 10 分钟没有进展时，派发者介入。

## 目标边界
目标：让实现与正文都符合分析里的应然。标记是传输状态的投影；`lost` 原因在两个阶段由同一个 `lostOf` 给出；转 `lost` 的组合只写一处；契约只定义含义与已建成连接的规则，建连的处置策略归实现。只做下面列的事。不改 `refresh`、调用、任务操作对调用方的答复。

### 已定的事（不重新裁定）

1. **轴 C：`lost` 原因在建连中也经 `lostOf`。** `packages/mcp/mcp/src/internal/build.ts` 的 `failedOf`：
   - `lost` 取 `lostOf(failure)?.reason`，没有时按建连的后备规则取：`error-answer` 或 `answer-malformed` 取 `discover-failed`，其余取 `preparation-failed`。
   - `mark` 取 `lostOf(failure)?.mark`，没有时取 `connection-unavailable`。
   - `reason`（交给调用方的连接失败）不变。
   - 删去 `lostOfNoAnswer`。
   - 可观察的变化只有两格：建连中 `discover` 答不带标记的 `no-answer`（如 HTTP 的 5xx 或单个流断开）时，原因从 `stream-broken` 改为 `preparation-failed`；建连中遇到带 `stream-broken` 标记的 `not-sent`（stdio 的 X02）时，原因从 `preparation-failed` 改为 `stream-broken`。其余格不变。
   - 用例替身按 T1 与 T8 带标记：建连中答 `no-answer`（`process-exited`）或带「传输不再可用」语义的 `no-answer`（`stream-broken`）的替身，要带对应的 `unusable`。不放宽断言。`tests/ensure.spec.ts` 第 441 行一带的表改为：带标记的三种原因各一行，不带标记的 `no-answer`（`stream-broken`）一行（`preparation-failed`），`abandoned` 一行。另加 X02 一行。
   - `lostOf` 的 JSDoc 末两句改写：它回答这个答复对传输与连接说明了什么；在已建成的连接上决定是否转 `lost`；建连失败时给出传输不可用或授权被拒的原因，其余原因由建连的后备规则给出。
2. **轴 B：转 `lost` 的组合只写一处。** 在 `packages/mcp/mcp/src/internal/lost.ts` 加 `loseIfLost(table, ensured, answer)`：问 `lostOf`，有结果就 `loseInScope`。`calls.ts` 与 `tasks.ts`（`failureOf`）都调用它，不再直接调 `lostOf`。`discovery.ts` 的 `lostPageOf` 与 `loseOn` 不变（它要等清单标记，是另一种组合）。
3. **轴 A：标记是传输状态的投影。**
   - `packages/mcp/mcp-contract/src/decisions.ts` 的 `unusableAnswerOf(wire, cause)`：对 `no-answer` 与非 `authorization-required` 的 `not-sent`，一律把 `unusable` 设为 `cause`，不保留答复上已有的值。两个传输的 `handedOver` 传入的是 `this.dead`，所以传输已死之后交出的每个失败答复都带第一次记下的原因。请求自己失败的原因（`cause` 字段）不变。
   - `packages/mcp/mcp-contract/src/transport.ts`：`not-sent`（`session-ended`）变体的字段收窄为 `unusable?: 'session-ended'`。修随之出现的类型错误，只做收窄必需的改动。
   - 符合性套件（`packages/mcp/mcp-contract/src/testing-transport.ts`）加一条：传输进入不再可用之后调用 `close()`，在途请求与之后请求的答复都不带 `unusable`。在两种真实传输与脚本化传输上都跑。
   - `packages/mcp/mcp-host-local/tests/session.spec.ts` 加两条：（a）旧路 SSE 的 GET 期间内存线路的事件 reject，`discover` 答 `not-sent`（`connection-unavailable`）且带 `unusable: 'stream-broken'`（守住 `session.ts` 的 `legacyPath` 里 `handedOver(entered)`，C 面变异 C3 存活）；（b）第二次断开：会话先因 `session-ended` 不再可用，已发出的请求之后因共用流断开结算，它的答复 `cause` 是 `stream-broken`，`unusable` 是 `session-ended`。
   - `packages/mcp/mcp/src/calls.ts` 第 306–307 行一带的注释：理由按 T1 的新定义改写（停止答复在传输仍可用时不带标记；传输已死时带标记，连接按第 1 条转 `lost`）。
4. **轴 E：任务答复的形状归 T6。** 删去契约 T1 中「`TaskAnswer` 的 `finished` 经 `PeerAnswer` 的 `no-answer` 带它」这半句。`packages/mcp/mcp-contract/tests/transport-conformance.spec.ts` 的 `remarkTaskAnswer` 不再给 `finished` 加标记，核对套件里没有一行期望带标记的 `finished`。`resultOf` 不改。类型 `finished.answer` 不收窄（0.1.0 形状项）。
5. **契约 `packages/mcp/mcp-contract/SPEC.md` 的正文（轴 A、B、C、D、F）：**
   - T1：标记定义为一条事实：传输交出这个答复时已不再可用，而且不是本端 `close()` 造成的。它管传输交出的每一种失败答复，含停止答复；有应答的结局类型上没有这个字段。值是传输第一次记下的原因。本端 `close()` 之后的答复不带标记；`close()` 与断开都成立时 `close()` 优先。写入方写公开路径的名字（`concludeAnswer` 一族），不写私有的 `settle`。
   - T8 前言：「`lineGoneAnswerOf` 结算的请求，值是该行的原因」改为「值是传输记下的原因」。
   - S7：定义一次「就绪连接」（已建成的连接，状态是 `ready` 或 `degraded`，与建连中相对）。「传输不再可用」一条写成：带 `unusable` 时转 `lost`，原因取标记；`not-sent`（`authorization-required`）转 `lost`（`authorization-required`）；不带 `unusable` 的答复不转，再举例（含不带标记的 `abandoned`）。各原因的定义在建连与已建成两个阶段都成立；`stream-broken`、`process-exited`、`session-ended` 的定义取标记，建连中没有标记时由实现的建连规则给 `preparation-failed` 或 `discover-failed`。
   - S5：删去末条（「建连的时限先于清单标记到期时……`pending`……」）。建连失败归实现的建连规则，成员 MC-7 已写这一情形。
   - S8：「`closeAll` 有本包自己的错误时」改为「`closeAll` 有实现方自己的编程错误（不是端口违约）时」。
   - 「组合与验证」与「未覆盖」：写明符合性套件核对标记的范围（每格核对本请求与之后一个请求；`close()` 之后不带标记一条）与漏标、错标两个违约实现（在 `tests/transport-conformance.spec.ts`）。不核的写进未覆盖：`lineGoneAnswerOf` 结算的其他在途请求、断开后的停止答复。
   - 裁定第 32 条：补齐改动的条款（T1、T8 前言、S2、S5、S7、S8、R1、R7）；记下 `streamGoneAnswerOf` 的参数收窄（从 `NoAnswerCause` 收为 `Exclude<UnusableCause, 'session-ended'>`），写明这是 0.x 内对调用方不可加的公开签名改动，组内没有别的调用方；把「性质：类型是可加改动」限定到答复上的字段。依据表加第 32 条与 W4 MCP 规格一行；第 88 行的引言改为与第 32 条一致。
   - `packages/mcp/mcp-contract/docs/public-api.md` 第 37 行一带：带 `UnusableCause` 的一行指向 T1。失败码索引加 `UnusableCause`。
6. **成员 `packages/mcp/mcp/` 的正文（轴 B、C、F）：**
   - `SPEC.md`：依据表的契约修订改为「与本页同一提交的契约 SPEC」；MC-5 的建连表按第 1 项改，原因引用 S7 与「先 `lostOf`、后建连后备规则」；MC-16 第 9 步只写 `lostOf` 兑现 S7 与本包「不按原因判断」的取舍，规则引用 S7，不再完整复述三条；第 12 步与 MC-17 第 4 步同理，`abandoned` 带「不带标记的」限定。
   - `src/index.md:26`、`docs/flows.md:101`、`README_ZH.md:82`：改为现状（没有偏离；页请求按标记）。
   - `verification/README.md`：第 43 行的 `loseUnlessStopReply` 改为现行的 `loseIfLost`；第 298 行删去「就绪连接上的 `discover`」的覆盖说法；第 161、166、167 行的范围与读数算上本闭包（含 N11）；第 190、307 行的序列计数算上 U 序列与 N11；第 136 行 `wide` 改为当前读数 55392／177108／26，写明修订与运行方式，并与第 250 行的计时对上（状态数取自关口 A 面在 F 与 head 上的读数，见 `mcp-unusable-r1-A.md`；写者重跑探索器后用自己的读数）；第 429 行 U6–U11、U13、U14 的去处改为「卡 #1119 上本闭包的关口结果评论」，不再写任务 tmp。

### 写范围
- `packages/mcp/mcp/src/internal/build.ts` — 第 1 项
- `packages/mcp/mcp/src/internal/lost.ts` — 第 1、2 项
- `packages/mcp/mcp/src/calls.ts` — 第 2 项与第 3 项的注释
- `packages/mcp/mcp/src/tasks.ts` — 第 2 项
- `packages/mcp/mcp/tests/ensure.spec.ts` — 第 1 项的原因表与替身
- `packages/mcp/mcp/tests/refresh.spec.ts` — 第 1 项：建连中 `discover` 的替身与原因
- `packages/mcp/mcp/tests/status.spec.ts` — 第 1 项：建连中答失败的替身
- `packages/mcp/mcp/tests/port-breach.spec.ts` — 第 1 项：建连中答失败的替身
- `packages/mcp/mcp/tests/lost.spec.ts` — 第 1、2 项
- `packages/mcp/mcp/tests/model/ports.ts` — 只在探索器的替身需要按 T1 带标记时改；性质、场景、探索器本身不改
- `packages/mcp/mcp/SPEC.md` — 第 6 项
- `packages/mcp/mcp/src/index.md` — 第 6 项
- `packages/mcp/mcp/docs/flows.md` — 第 6 项
- `packages/mcp/mcp/README_ZH.md` — 第 6 项
- `packages/mcp/mcp/verification/README.md` — 第 6 项
- `packages/mcp/mcp-contract/src/decisions.ts` — 第 3 项
- `packages/mcp/mcp-contract/src/transport.ts` — 第 3 项
- `packages/mcp/mcp-contract/src/testing-transport.ts` — 第 3 项的符合性条款
- `packages/mcp/mcp-contract/src/answer-readings.ts` — 只做第 3 项收窄必需的改动
- `packages/mcp/mcp-contract/src/testing-scripted-transport.ts` — 只做第 3 项收窄必需的改动
- `packages/mcp/mcp-contract/tests/decisions.spec.ts` — 第 3 项
- `packages/mcp/mcp-contract/tests/transport-conformance.spec.ts` — 第 3、4 项
- `packages/mcp/mcp-contract/tests/public-entry.spec.ts` — 第 3 项的类型用例
- `packages/mcp/mcp-contract/SPEC.md` — 第 5 项
- `packages/mcp/mcp-contract/docs/public-api.md` — 第 5 项
- `packages/mcp/mcp-host-local/tests/session.spec.ts` — 第 3 项
- `packages/mcp/mcp-host-local/src/session.ts` — 只在第 3 项的收窄引起类型错误时改

### 仓库之外的任务产物
变红验证的运行输出：`tmp/closures/w4-mcp-unusable-fix/mut/`（工作树内，被忽略）。

### 排除的调用方
- `packages/mcp/mcp-host-local/SPEC.md`、`docs/`、`README*`、`verification/`：切片 02 在改 `SPEC.md`，本轮不碰。`mcp-host-local/SPEC.md` 里写到标记与 `handedOver` 的句子若与第 3 项不一致，在交回里给出原句与应改成的句子，由派发者在合入时改。
- `packages/mcp/mcp-host-local/src/` 除 `session.ts` 外的文件；`tests/fixtures/`。
- `packages/mcp/mcp/tests/model/` 除 `ports.ts` 外的文件；`verification/models/`（TLA+ 模型不改）。
- `packages/mcp/mcp-cordis-contract/`：切片 02。
- 组页与领域页：切片 03。
- 简报检查对 `cause`、`as`、`dist`、`discover`、`NOT_SENT`、`STREAM_BROKEN`、`failedOf` 报的 `caller-outside-scope`：前四个是通用词或字段名的同名匹配；`NOT_SENT`、`STREAM_BROKEN` 是各文件私有的同名常量，本轮只在 `tests/model/ports.ts` 里按需给它们带标记；`failedOf` 只在 `build.ts` 内部调用，签名不变。

## 验收清单
1. `grep -rn lostOfNoAnswer packages/mcp/mcp/src` 没有输出。`git grep -n 'lostOf(' -- packages/mcp/mcp/src` 只出现在 `packages/mcp/mcp/src/internal/lost.ts`（定义与 `loseIfLost`）、`packages/mcp/mcp/src/internal/build.ts`（`failedOf`）与 `packages/mcp/mcp/src/discovery.ts`（`lostPageOf`）。`packages/mcp/mcp/src/calls.ts` 与 `packages/mcp/mcp/src/tasks.ts` 只调 `loseIfLost`。
2. 第 1 项的两格各有用例，并断言了原因；`ensure.spec.ts` 的原因表按第 1 项改写。
3. 类型：一个 `@ts-expect-error` 的类型用例证明 `{ kind: 'not-sent', cause: 'session-ended', unusable: 'process-exited' }` 不合 `TransportFailure`。
4. 第 3 项的 `unusableAnswerOf` 用例：答复上已有标记时，结果的标记是传入的原因。`session.spec.ts` 的两条新用例通过。
5. 符合性套件的 `close()` 一条在脚本化传输与两种真实传输上通过。派发者用关口 A 面的两个变异（`testing-scripted-transport.ts` 第 392 行去掉 `this.closed ||`；第 398 行把 `this.closed ? undefined : this.dead` 改为 `this.dead`）复核：各使这一条变红。
6. 套件没有一行期望带标记的 `finished`；`remarkTaskAnswer` 不再给 `finished` 加标记。
7. 三个成员 `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp --filter=@omne-harness/mcp-host-local` 退出 0；同一组 `--filter` 的 `test:slow` 退出 0。探索器快层（`tests/model/lifecycle.spec.ts` 与 `calls.spec.ts`，`--mode fast`）各场景的状态数与改动前相同，交回贴对照。
8. `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`format:check`、`check:docs` 退出 0；`pnpm run lint:deps` 没有违规（先构建组外三个成员 `@omne-harness/agent`、`@omne-harness/settings-local`、`@omne-harness/identity-sql`）。交回每条的输出尾部与日志哈希。
9. `pnpm run metrics --coverage --base 60acfc28b640a1535585df1ebccd22bdc87e4d7c` 只在交回前跑一次（先确认没有 `packages/.stryker-tmp*`）。对超 warn 与 alert 的改动函数逐条交代：没覆盖到的只有穷尽 `switch` 的 `never` 分支时，写「圈复杂度来自穷尽 `switch` 的分支数」；否则给处置。`wide` 在覆盖插桩下超时是已知的波末风险，交回如实写出，不改时限。
10. 变红验证：本轮新加或改动的每一条用例，各写一处让它变红的改动，在工作树上改源码、构建、跑、按字节还原。每条留运行输出（命令、退出码、失败用例名取自 vitest 的 JSON 报告），存 `tmp/closures/w4-mcp-unusable-fix/mut/`。交回给表：变异、文件、命令、退出码、变红的用例名、日志 sha256 前 12 位。
11. `git diff --name-only 559be15145be26a0f549c76333b08b70e61e0149..HEAD` 只含写范围内的文件。

## 实施规格
- 用例断言外部行为：连接状态与原因、答复的字段、套件的失败清单。
- 成员测试导入 `dist`：改源码后先 `pnpm turbo run build --filter=<成员>` 再跑用例。
- 不加 `as` 断言绕过类型。
- 中文文档按 asd-ste100 的语言无关规则，只写现状与依据，不写修改过程。条款号带链接。
- 先写会变红的用例，再改实现（第 1、2、3 项）。

## 性质及证据义务
- 「原因在两个阶段同义」：第 1 项的两格用例与替身带标记后的原有用例。
- 「标记是传输状态的投影」：第 3 项的 `unusableAnswerOf` 用例与第二次断开的用例。
- 「`close()` 优先」：符合性套件的新一条，派发者用两个变异复核。
- 差分变异由派发者在最终 head 上跑，不在本闭包。

## 施工计划
按轴拆提交，每个提交闭合一条轴，提交信息写所闭合的评审编号：
1. 轴 C（第 1 项）。
2. 轴 B（第 2 项）。
3. 轴 A（第 3 项）。
4. 轴 E（第 4 项）。
5. 契约正文（第 5 项）。
6. 成员正文（第 6 项）。
7. 验收第 7–11 条，交回。
提交信息中文，作者 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code`、`Agent-Role: developer`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行三个成员的构建、类型检查、快层与慢层，探索器快层，`metrics` 一次；本地提交。不允许：推送、开 PR、合并、改写范围外文件、改依赖段与锁文件、跑 `admission`、仓库全量测试与差分变异。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable。同时可能有切片 02 的一个小写者在 `.worktrees/w4-mcp-cordis` 跑单个用例文件，共用 CPU：单个用例文件用 `VITEST_MAX_WORKERS=4 pnpm exec vitest run <文件>`；三包整组、`test:slow` 与 `metrics` 只在交回前各跑一次，依次运行。HTTP 夹具只用 20000–59999 的端口。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 结构分析与裁定：见「身份与位置」所列三个文件
- W4 MCP 规格：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/mcp/spec.md 第 1 节（含 15:51、15:56、16:06 的更正）
- 原产品闭包与守护闭包的规格（已定的事、追加记录）：同目录 `w4-mcp-unusable.md`、`w4-mcp-unusable-guard.md`
- 必须加载：ub-mode、asd-ste100、pstack:typescript-best-practices

## 当前认知
- 已确认（A 面）：`explore(WIDE)` 在 F 与 head 上状态数都是 55392、重放 177108、深度 26；`ports.ts` 的 `NOT_SENT` 与 `STREAM_BROKEN` 已带 `stream-broken` 标记。
- 已确认（C 面）：可选字段下，拆开重组答复会静默丢标记，编译器不报；守护靠用例。
- 已确认（派发者读码）：`build.ts` 的 `failedOf` 对非 `authorization-required` 的 `not-sent` 一律给 `preparation-failed`，对 `no-answer` 按 `cause` 给原因；`transport.discover()` 只在 `build.ts` 调用。
- 未知：`mcp/tests/` 里有多少替身在建连中答不带标记的 `no-answer`（`process-exited` 或 `stream-broken`）。

## 返回与恢复
每个提交号；已定第 1–6 项逐条写闭合方式；验收各条的命令、结果、输出尾部与日志哈希；探索器状态数对照；变红验证表；`mcp-host-local/SPEC.md` 需要派发者改的句子（原句与新句）；未覆盖项；交给负责人定的事项。

## 已知会受影响的现有用例
- `tests/ensure.spec.ts` 第 441 行一带的原因表。
- 在建连中用不带标记的 `no-answer` 替身、并断言 `stream-broken` 或 `process-exited` 原因的用例。
- `mcp-contract/tests/decisions.spec.ts` 中「保留已有标记」的用例（第 3 项改了规则）。

## 停止条件
- 第 1 项让探索器快层任何场景的状态数或违例变化。
- 第 1、2、3 项之后，`refresh`、调用或任务操作对调用方的答复发生变化。
- 符合性套件的 `close()` 一条在某种真实传输上失败（说明传输实现有缺陷，交回，不改传输）。
- 需要改写范围外的文件、依赖段或锁文件，或 TLA+ 模型。
- 基线 `559be1514` 上的用例在本工作树失败（`wide` 在负载下超时除外：重跑一次，仍超时就交回）。

## 追加记录

- 2026-11-06 16:38 追加 1（写者按停止条件第 1 条停下，没有提交；第 1 项的改动在工作树里，补丁 `tmp/closures/w4-mcp-unusable-fix/axisC-wip.patch`）。卡拥有者裁定：
  1. **选 (b)，依据是契约，不是方便。** 标记说的是「传输交出这个答复时已不再可用」。`open` 失败时还没有传输，这个标记没有意义；W4 MCP 规格第 1 节第 1 条列的标记范围也不含 `open`；真实工厂 `mcp-host-local/src/factory.ts` 的 `open` 只答不带标记的失败。所以 `packages/mcp/mcp/tests/model/ports.ts` 第 573 行一带 `transports.open` 的失败答复带标记，是替身违约。改为不带标记的常量（`NOT_SENT_USABLE` 或同义的不带标记值）。授权：`ports.ts` 的写范围从「只按 T1 带标记」扩为「按 T1 带或去掉标记，使替身守契约」；性质、场景、探索器本身仍不改。改后探索器快层各场景的状态数应回到改动前；停止条件第 1 条不变。
  2. **把这条规则写进契约，并由符合性套件守护。** 已定第 5 项的 T1 一条加一句：`McpTransportFactory.open` 的失败不带 `unusable`，因为那时还没有传输。符合性套件（`packages/mcp/mcp-contract/src/testing-transport.ts`）在已有能让 `open` 失败的行上加断言：失败不带 `unusable`。如果没有这样的行，就在交回里写明，不另造场景。不收窄 `open` 的类型：标记一律是「可选字段加符合性用例守护」（W4 规格 ub-mode 表，C 面 F1 认可的代价），这里保持一致。
  3. **第 6 节第 1 条（收窄后 `unusableAnswerOf` 的那一格）：一律标 `'session-ended'`。** 传输已死于别的原因、又交出 `not-sent`（`session-ended`）这一格到不了（写者的读码分析成立），但函数要给出合法的值。标记是否出现决定连接是否转 `lost`，比标记的值重要。写者原提的「保留原有标记」在这一格可能交出不带标记的答复，破坏单调。改为：对 `not-sent`（`session-ended`），传输已死时标记取 `'session-ended'`（这个答复本身说明会话已结束），JSDoc 写明这一格到不了与取值的理由。其余变体照已定第 3 项，取传入的 `cause`。
  4. **第 6 节第 2 条：** `packages/mcp/mcp/tests/tasks.spec.ts` 加入写范围，只改建连中答 `no-answer` 的替身，让它按 T1、T8 带标记或换成能说明意图的不带标记值；断言不放宽。
  5. **第 6 节第 3 条：** 照写者说的做，提交用 `-c user.name=PanQiWei -c user.email=594557445@qq.com`，读回核对。
  续用原写者（同一闭包、工作树里有未提交的改动），从补丁所在的状态继续：第 1 项连同本追加第 1 条一起提交，然后按施工计划做第 2–7 步。
