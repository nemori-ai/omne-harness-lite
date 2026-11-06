# 闭包规格 w3-mcp-call-fix3

## 身份与位置
- 闭包：w3-mcp-call-fix3
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call
- 分支：PanQiWei/skill-mcp-w3-mcp-call
- 基线：fcc955a53060cc8fb5731e1092a3733d21fa99a2
- 清晰度：定

`w3-mcp-call` 第 3 轮评审之后的代码修复轮（PR #1141）。五面报告与卡拥有者的全部处置在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r3.md`；各面「卡拥有者对 X 的处置」里标「改」的代码项与行为条款是本闭包的施工依据。README、`docs/`、`verification/` 的 Markdown 与 B 面的表达项由之后的 `w3-mcp-call-docs3` 改。

结构判断（C 阻断的处置）：`closeAll` 落在调用途中时答复不一致，是第 2 轮 S8-a 同一类的第二次出现。根因是关停的答复散在途中各点，而停止信号的答复已经只在 `perform` 一处决定。本闭包让关停与停止同形：途中各点只负责「关停之后不问端口」，答复只在出口一处从当时的状态读出。不得再用「在某个步骤前补一次核对并直接答复」的方式修。

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：调用口与任务操作的收尾时机与并发次序（策略 `top_risks` 并发、收尾时机），租户与账户隔离（`security-sensitive`）→ 顶档；负责人定的 Fable 档位上限是 high。

## 目标边界
目标：关停的答复一处决定（调用口与任务操作）；兑现 C 与 B 面标「改」的代码项与行为句；A、D 面的项见第 8 条。每个行为改动先写一条在基线上变红的用例。

### 已定的事（不重新裁定）
1. **关停与停止同形（调用口）**（C 阻断，选甲）。
   - `under` 与第 8 步对关停交哨兵（名字你定，例如 `SHUT`），不再交公开原因。
   - `perform` 在收口的同一段同步执行里判定：停止信号已触发 → `cancelled`；否则结果是关停哨兵，或结果是「未发出」且 `table.isShut()` → 「未发出：`connection-unavailable`」；其余原样。
   - 关停开始之后，传输对未发出的请求答的原因（`authorization-required`、`session-ended` 等）也改答 `connection-unavailable`。已发出的结局（`ok`、`unknown`）不改。
2. **任务操作同形**（C 阻断与待裁 2、B N1 选乙）。在与 `send` 同一段同步执行里核关停（对应 MC-16 第 8 步）；去掉 `connectionOf` 复用路径上只为对齐类型的 `Promise.resolve` 空隙，或保证它与 `send` 之间没有让出。任务操作的出口一处判定：没有发出且 `table.isShut()` → `effect-unknown`（`no-connection`），不论关停落在等关口、建连还是发请求之前。第 1 轮 N7「建连途中关停答 `connection-unavailable`」由此取代；`failureOfEnsure` 与 `tasks.spec.ts:429` 随之改。
3. **SPEC 与契约句子**。成员 SPEC MC-16 第 3、8 步与 MC-17、「所有权」一节按第 1、2 条改；契约 S8 与第 30 条写明「在途」指发出之前（等关口、读存储、建连的等待），已发出的结局不改（B N2）。句子「答同样的结果」不收窄。
4. **用例**。C 的探针 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r3-probes-c/s8-decision.spec.ts` 的三个反例（续调用等存储时 `closeAll`；首次调用等关口时 `closeAll` 且设置缺 `connect-timeout`；任务操作复用连接时 `closeAll` 落在 k=0）转成用例，在基线上变红。`invoke.spec` 的逐微任务关停扫描补「续调用」与「第 4 步设置缺失」两个变体；任务操作补一条逐微任务关停扫描。
5. **形式守护**。探索器 P13 加答复一侧的断言：`closeAll` 之后结算、没有发出的调用答 `connection-unavailable`（`cancelled` 除外），任务操作答 `effect-unknown`（`no-connection`）；配一个负控（`perform` 不读关停）。`Calls.tla` 不改（`Refused` 不带原因）；交回里写明模型只覆盖「不问端口」。
6. **C 的非阻断**。
   - `Losing`：注释收窄到签名层面的保证；补一条在调用的 `.then` 里同步读 `status` 的用例。
   - 句柄：`sent` 只在 `reserved` 时迁移；撤销时把格子置为终态。
   - 命名：句柄的 `sent` 改成说出副作用的名字；探索器的 `Reservation as Place` 去掉别名。
   - `TaskTable.get` 只交 `TaskRecord | undefined`，歧义留在表内。
   - `tasks.ts:158` 注释折行；用例标题「step 3: at whichever microtask closeAll lands」按断言内容改为 step 8；`invoke.spec.ts:809` 的标题改为 step 10（B N10）。
7. **B N4 的事实**。查清 `closeAll` 的 `closeEntry` 是否汇合经 `loseInScope` 发起的拆除，写进交回（代码位置与一条能证明它的用例或探针输出）；SPEC「所有权」一句按事实改（只有清单标记晚于 `closeAll`，或拆除也可能晚于）。
8. **A 面的项**（D 面在旧 head 上被停掉，没有读数）。
   - 阻断 1、2 与 C 的阻断同一件事，按第 1、2、4 条改；A 的探针 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r3-probes-a/probe/s8r3.spec.ts` 的 R3-a、R3-c 一并转成用例。
   - **S8 的「下一步」粒度**（A 非阻断 1）：以成员 SPEC 编号的一步为单位。关停之后开始的操作一个端口都不问；在途的操作不再开始下一步，已开始的一步内部的本地端口调用（如关口的采用与资格两问）照常走完。不改 `gate.ts`；契约 S8 与成员 SPEC 用同一句写明（并进第 3 条）。
   - **`refresh` 同形**（A 范围外 1）：取页的每一页在发请求的同一段同步执行里核关停；`refresh` 的出口一处判定：没有发布且 `table.isShut()` → `connection-unavailable`，已发布的结果不改。MC-7 补这一步。R3-d 转成用例（基线上答 `kept`（`superseded`）且关停之后调用了 `listActions`）。
   - **关停之后不派取消**（A 范围外 2）：`answerOf` 的停止分支在 `table.isShut()` 时不派 `cancelRequest`。MC-16 第 11 步补一句。R3-e 转成用例（基线上对端收到 1 条取消）。
   - 写范围因此加 `packages/mcp/mcp/src/discovery.ts`（已在 `src/` 之内）。

### 写范围
- `packages/mcp/mcp/src/` — 调用口、任务操作、在途表、任务表
- `packages/mcp/mcp/tests/` — 新用例、扫描、探索器（`tests/model/`）与负控
- `packages/mcp/mcp/SPEC.md` — MC-12、MC-16、MC-17、「所有权、失败与生命周期」、已知限制；「性质与证据」只改 P13 与负控对应的句子
- `packages/mcp/mcp-contract/SPEC.md` — 只改 S8 与第 30 条的句子
- `tmp/closures/w3-mcp-call/fix3/`（新建） — 红灯、探索器日志、门禁输出、手工变异日志

### 排除的调用方
- `packages/mcp/mcp/README.md`、`README_ZH.md`、`docs/`、`verification/`：下一个闭包改。你改了的行为让这些文件的句子过时，在交回里列出位置。
- 契约 `src/` 与其余条款：本轮不改。
- `packages/mcp/mcp-host-local/`：另一棵树在改。
- 锁文件与依赖段。

## 验收清单
每条写命令、预期与结果，输出尾部与日志的 SHA-256 前 16 位写进交回。失败时先在基线上复跑同一检查。

1. `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp --filter=@omne-harness/mcp-contract` 退出 0；`pnpm --filter @omne-harness/mcp run test:slow` 退出 0，日志带退出码一行。
2. 第 4 条与第 1、2 条的行为改动各有一条用例，在基线 `fcc955a53` 上变红、在交回的 head 上变绿；红灯输出存 `tmp/closures/w3-mcp-call/fix3/red/`。
3. 第 1、2 条各给一个手工变异（例如 `perform` 不读关停；任务操作发请求前不核关停），在工作树之外的副本上改、跑、还原，写出杀死它的用例名；日志存 `tmp/closures/w3-mcp-call/fix3/mutations/`。
4. 探索器全部场景零违例；P13 新断言的负控变红；原有负控 N1–N8 照旧变红（签名有变的写明）。日志存 `tmp/closures/w3-mcp-call/fix3/model/`。
5. 结构：`grep -n "fail(CONNECTION_UNAVAILABLE)" packages/mcp/mcp/src/calls.ts` 只剩 `perform` 的一处；`under` 与第 8 步不交公开原因；`tasks.ts` 的关停答复只在出口一处。附命令与输出。
6. `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`、`check:design` 退出 0；`git ls-files --eol | grep -c w/crlf` 为 0。每项输出尾部一两行与日志哈希写进交回。
7. `src/` 无 `as`（`as const` 除外）、无 `any`、无非空断言。附命令与输出。
8. `pnpm run metrics --coverage --base b2ba7dc89` 退出 0（全部改完、门禁之后跑一次）；本闭包改动的函数不新增超 alert 的；`perform`、`under`、`sendOrder`、任务操作的出口与 `request` 写读数。

## 实施规格
- 契约条款除 S8 与第 30 条的句子外不变。成员 SPEC 的步号只用 MC-16、MC-17 自己的编号；改动后的步号与用例标题、源码注释一致。
- 哨兵与重命名的名字由你定，写进交回的命名账本。
- 纯整理与行为改动分开提交：先红灯用例，再第 1–3 条行为（先红后绿），再第 6 条，最后形式守护与 SPEC。

## 性质及证据义务
- 关停之后不问端口；同一次 `closeAll` 对同一个操作只有一种答复（调用口 `connection-unavailable`，任务操作 `effect-unknown`（`no-connection`），停止信号已触发的调用 `cancelled`），不论落在哪个微任务。
- 占位守恒；账户隔离；并发用例用 deferred 或 `reached` 排次序。

## 施工计划
1. 读处置全文与 C 的探针，写第 4 条的红灯用例，提交一次。
2. 第 1–3 条行为，先红后绿；任务操作同形。
3. 第 6、7 条。
4. 第 5 条形式守护，第 3 条的手工变异。
5. 门禁、度量、交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。每完成一个能过 typecheck 的阶段就提交。

## 自主范围与动作授权
允许：写范围内改文件；运行 `@omne-harness/mcp` 与契约的构建与测试（含慢层）、探索器、仓库检查、度量；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增依赖、改 S8 与第 30 条以外的契约条款、跑差分变异。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call。并行的有 `w3-mcp-host-fix3`（另一棵树，跑成员测试与负控）。成员测试用 `VITEST_MAX_WORKERS=4`；慢层与探索器单独跑，不与成员测试叠加。不跑 `admission`、仓库全量测试与差分变异。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 第 3 轮评审与处置：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r3.md
- 上一轮修复的规格、追加记录与交回：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call-fix2.md`、`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-mcp-call-fix2.md`
- 契约：`packages/mcp/mcp-contract/SPEC.md` 的 S1、S2、S7、S8、R2、R7、T5、T9 与「调用口闭包的裁定」一节
- 必须加载：ub-mode；pstack:typescript-best-practices；写 SPEC 时 asd-ste100

## 当前认知
- 已确认：C 的三个探针在 `fcc955a53` 上复现（续调用答 `unknown`、首次调用答 `config-missing`、任务操作在关停之后调用 `transport.getTask`）。
- 已确认：`fcc955a53` 上 `under` 在等待之前核停止与关停，关停交 `fail(CONNECTION_UNAVAILABLE)`；第 8 步再交一次；`perform` 只读停止信号。
- 未知：去掉 `connectionOf` 的 `Promise.resolve` 包装之后，任务操作的类型与新建路径要怎么对齐。

## 返回与恢复
每个提交号；每条验收的命令、结果、输出尾部与日志哈希；第 2 条每项的「用例 → 缺陷 → 变红证据」；第 3 条的变异表；第 4 条的探索器读数与负控表；第 5、7 条的 `grep` 输出；第 7 条（B N4）查到的事实；命名账本；自定裁定与理由；写者声称的结构性改动清单（派发者逐条 `grep` 核实）；让排除文件里的句子过时的位置；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-call/fix3/`。

## 已知会受影响的现有用例
- `tests/tasks.spec.ts:429`「a shutdown under way while the connection is built is connection-unavailable」：按第 2 条改答 `effect-unknown`（`no-connection`），标题随之改。
- `tests/invoke.spec.ts`「step 3: at whichever microtask closeAll lands」：标题改 step 8，断言不放宽。
- 断言关停之后传输特有原因（如 `authorization-required`）的用例，若有：按第 1 条改答 `connection-unavailable`。
- `tests/model/explore.ts` 的 `Reservation as Place` 别名与句柄方法名。

## 停止条件
- 某项要求只能靠改排除范围内的文件实现。
- 已定的事与契约条款冲突，或在任何实现下都兑现不了。
- 同一用例连试三种做法仍红。

## 追加记录
- 2026-11-06 04:19 派发前：第 3 轮 A、B、C、E 四面交回并处置；D 面在旧 head 上被停掉（修复轮开始），没有读数，修复后在最终 head 上以 `--since 5204d3799` 跑一次。工作树干净，head `fcc955a53`，残留的 Stryker 进程已清。简报检查退出 0；落在 `packages/mcp/` 的 `caller-outside-scope` 警告都在写范围目录里（检查器按文件精确匹配）。并行：`w3-mcp-host-fix3`（Fable high，另一棵树）。两个 Fable 写者同时跑，2026-11-05 曾撞 5 小时额度，若被 429 中断按 delegate 第 7 步第 6 项接续。
- 2026-11-06 04:26 换写者：原写者（Fable high）被宿主 429 限流中断，工作树没有任何改动（head `fcc955a53`，树干净）。这是本会话第二次两个 Fable 写者同时撞 5 小时额度；按 delegate 第 7 步第 6 项，在角色源允许的范围内换模型：新开 Opus 5.5 high 写者，带原规格与全部追加记录。偏离理由：已定的事给出了逐项修法（甲），规格完整，默认档足够；host fix3 续用 Fable，避免两个 Fable 写者同时跑。
- 2026-11-06 06:19 交回（`delegate/handbacks/w3-mcp-call-fix3.md`），head `deb5a977e`，10 个提交，改动文件全在写范围内，树干净。派发者核对：结构声明 1–9 逐条 `grep` 成立（`calls.ts` 只有 `answerAtExit` 产出 `connection-unavailable`；`under` 与第 8 步交 `SHUT`；任务操作的关停答复只在 `outcomeOf`；`built` 无关停核对；`reusedOf` 无 `await`；`recordSent` 只迁移 `reserved`；`TaskTable.get` 只交记录；`explore.ts` 无 `as Place`）。甲的两半都核：「关停之后不问端口」由各步 `SHUT` 与探索器 P13、负控 N1–N8 守；「出口给同一个答复」由三个出口函数与新负控 N9、N10（基线日志报 `answer-after-closeAll`）守。自裁 1、2、4–10 采纳。**自裁 3 不采纳并由派发者改正**：refresh 的出口先读关停、后看调用方中止，与调用口出口（停止信号先于关停）次序相反，同一条「状态 → 答复」规则在两处不一致；根因是我在第 3 轮 C 处置里给 refresh 写的规则漏了停止信号一句。改为与 MC-16 同序（`035ac8fee`：新用例先红后绿，MC-7 句子同步；`format:check`、`lint:rules`、mcp `typecheck` 退出 0，日志 `tmp/closures/w3-mcp-call/owner-fix3/`）。验收 8 的红项（覆盖率子运行里 lifecycle `wide` 在插桩下超 600 s）判为环境负载，不是本轮回归：非插桩下用时 360 s，与前几轮 338–398 s 同量级；第 4 轮 A 面重跑 `metrics --coverage` 时再看。**接受**，下一步 docs3（输入：交回第 10 节与 B 的 N3–N11）。
