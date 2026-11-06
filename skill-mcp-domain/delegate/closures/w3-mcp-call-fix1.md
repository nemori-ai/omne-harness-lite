# 闭包规格 w3-mcp-call-fix1

## 身份与位置
- 闭包：w3-mcp-call-fix1
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call
- 分支：PanQiWei/skill-mcp-w3-mcp-call
- 基线：7d91a330cf89a445c56057464b91d29f9129260e
- 清晰度：定

`w3-mcp-call` 第 1 轮评审之后的代码修复轮（PR #1141）。基线是评审时的 head。四路评审与卡拥有者的裁定全文在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r1.md`，「根因与卡拥有者的裁定」一节的九条是本闭包的施工依据。README 两种语言、`docs/` 与编号、复述类的表达项由下一个闭包改。并行的 `w3-mcp-call-model` 在另一棵树扩展探索器与 TLA+ 模型（`tests/model/`、`verification/models/`、成员 SPEC「性质与证据」一节），不要碰它的文件。

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：调用的生命周期、取消与等待上界的并发次序，租户与账户隔离（策略 `security-sensitive`）→ 顶档；负责人定的 Fable 档位上限是 high。

## 目标边界
目标：让 `perform` 从占位起拥有一次调用的全部生命周期：一个出口、一个停止信号管全部等待、发出后不等对端；修掉评审指出的其余缺陷；在最终 head 上重跑全部手工变异并补齐缺的变异。每个缺陷先写一条在基线上变红的用例。

### 已定的事（不重新裁定）
评审记录「根因与卡拥有者的裁定」第 1–9 条，以及下面几条补充：

1. **一个出口**（第 1 条）：`perform` 自 `reserve` 起用一个 `try/finally` 收口，按阶段结算：未发出且停止信号已到期 → 键转为已结束、答「未发出：`cancelled`」；未发出且未到期 → 撤销占位、答拒绝原因；已发出 → 键转为已结束。`InFlightCalls` 给出按阶段收口的一个方法；`reserve` 直接交出停止信号或 `in-use`，删掉 `stopOf` 与 `reserved` 项里重复的 `cancelled` 字段。`calls.ts` 里不再有分散的撤销与结束调用。
2. **一个停止信号**（第 2 条）：从占位起，发出之前的每个等待（关口 `admitForUse`、配值、已知动作的存储读取、`ensure`）都用 `within(…, stop, scope)` 在停止信号（调用方 `signal` 与 `cancel` 合成）下等；端口调用本身继续由表的作用域承接；到期一律答 `cancelled`。`discovery.ts` 的同类写法不改，在成员 SPEC 登记为已知限制（它没有调用方信号）。
3. **`cancelRequest`**（第 3 条）：交给表的作用域（`scope.spawn(ask(...))`），不 `await`。
4. **发出代际**（第 4 条）：`markSent(key, connection, generation)`，`generation` 取 `ensured.generation`。
5. **本包计算不进 `ask`**（第 5 条）：`taskResult` 的分类在 `ask` 之外。
6. **`checkOutput` 抛出**（第 6 条）：在契约 `classifyOutcome` 里吸收，结论 `violates`，原因是新的契约值 `output-check-failed`（与 `structured-content-missing` 同类，作为契约常量导出）。契约 SPEC O3 补这一句；O1「全函数，不抛出」由此成立。
7. **任务操作**（第 7 条）：先判关停再复用；`guard.ts` 抽出「判定，并在撤采用或被挡下时关闭」两边共用；任务请求没有发出的 `ensure` 失败（建连阶段的 `EffectUnknown`、时限先到、建连途中关停）答 `connection-unavailable`，`effect-unknown`（`no-connection`）只给 S2 的「不能新建」（没有采用材料、资格不是 `granted`）；`failureOf` 的 `not-sent` 映射用 `connectionFailureOf`。
8. **`TaskRef.issuedAt`**（B 的 N8、C 非阻断 6）：任务表记的发起代际有读者：调用方交来的 `TaskRef.issuedAt` 与记录不同，按「不是这个任务」答 `unknown`，与表外任务相同。MC-17 写明。
9. **`ContinueRequest` 两个字段都缺**（B 的 N13）：答「未发出：`unknown`」之外的哪一种由你按契约 S2、R2 定，写进 MC-16 并加用例；不发空的 `continuation`。
10. **转 `lost` 的偏离**（B1）：成员 SPEC 偏离表登记按原因判断转 `lost` 的规则：采用的判定、原因（传输的答复不带 T8 的「传输不再可用」，服务看不到）、方向（偏安全：多拆一次连接只损失可用性，不把死掉的传输当可用，不给出错误结局）、退出条件（契约给出标记之后对齐，计划 6b）。`lost.ts` 的注释与这一行同口径。
11. **其余代码非阻断**（第 8 条）：`lose` 收进一处；依赖类型方向（共同依赖类型定义在 `invoker.ts` 或 `assembly`，两半各 `Pick`）；`races the send` 等用 `reached` deferred 代替 `settled()`；`sendOn` 改对象参数；A 的 B3 列出的未执行分支每处补一条会失败的用例；度量红项（`perform`、`sendOn`、`failureOf`、`failureOfEnsure`）重构后在交回里逐条给读数。
12. **变异**（第 9 条）：调用口的变异改用前缀 `C`（`C01`…），与生命周期的 `M1`–`M28` 分开；在最终 head 上全部重跑，每条写运行时的 head；另补：发出后取消不重发、任务 `no-answer` 不重发、`cancelRequest` 改回 `await`（取消后不等对端）、映射表缺的行（建连阶段 `credential-unavailable`、`landing-unavailable` 原样，加入方到期 `{connect, pending}`、排队到期 `{settings}`）、写者自裁 1、2、6、单一出口（去掉 `finally`）、停止信号（去掉存储读取的 `within`）、发出代际（改回读视图的实时代际）、`output-check-failed`（去掉吸收）。原 M17（`markSent` 不看取消）在新结构下重判，仍存活就写明原因并交给 `w3-mcp-call-model` 的探索器负控。

### 写范围
- `packages/mcp/mcp/src/` — 调用口、任务操作、在途表、关口、装配
- `packages/mcp/mcp/tests/` — 新用例与替身调整；不含 `tests/model/`
- `packages/mcp/mcp/SPEC.md` — MC-12、MC-15、MC-16、MC-17、「所有权、失败与生命周期」、偏离表、「未覆盖」；不含「性质与证据」
- `packages/mcp/mcp/verification/README.md` — 只改「调用口闭包的变异记录」一节
- `packages/mcp/mcp-contract/src/classify.ts` — 第 6 条
- `packages/mcp/mcp-contract/src/outcomes.ts` — 第 6 条的契约常量（如需）
- `packages/mcp/mcp-contract/src/index.ts` — 第 6 条的根导出（如需）
- `packages/mcp/mcp-contract/tests/` — 第 6 条的用例与导出集合
- `packages/mcp/mcp-contract/SPEC.md` — 只改 O1、O3 的句子
- `tmp/closures/w3-mcp-call/fix1/`（新建） — 红灯、变异日志、门禁输出

### 排除的调用方
- `packages/mcp/mcp/tests/model/`、`packages/mcp/mcp/verification/models/`、成员 SPEC「性质与证据」一节、`verification/README.md` 的其他节：`w3-mcp-call-model` 在改。你改了 `InFlightCalls` 或调用口内部的签名，探索器会受影响：在交回里列出改动的签名，合回时由派发者处理。
- `packages/mcp/mcp/README.md`、`README_ZH.md`、`docs/`：下一个闭包改。
- 契约的其余文件，尤其 `wire.ts`、`transport.ts`、`readers.ts`、`testing-*` 与 SPEC 的 T 段：`w3-mcp-host` 在改。
- `packages/mcp/mcp-host-local/`、锁文件与依赖段。

## 验收清单
每条写命令、预期与结果，输出尾部与日志的 SHA-256 前 16 位写进交回。失败时先在基线上复跑同一检查。

1. `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp-host-local` 退出 0；`pnpm --filter @omne-harness/mcp run test:slow` 退出 0，日志带退出码一行。
2. 下列每项有一条用例：在基线 `7d91a330c` 上变红，在交回的 head 上变绿；红灯输出存 `tmp/closures/w3-mcp-call/fix1/red/`：
   - `cancelRequest` 永不兑现时，发出后 `cancel` 或中止，`invoke` 在事件循环的几轮内答 `unknown`（`abandoned`）（A1、C1）
   - 关口停住期间 `cancel`，之后一步拒绝：原调用答「未发出：`cancelled`」，之后 `cancel` 答 `no-call-in-flight`（A2）
   - 存储读取永不答复时调用方中止：`invoke` 答「未发出：`cancelled`」（A 待裁 2）
   - 建连期间 `cancel`：`invoke` 立即答「未发出：`cancelled`」，不等建连结束（C 非阻断 1、B 的 N6）
   - `checkOutput` 抛出：`invoke` 答 `sent`，结局带 `violates`（`output-check-failed`）；之后同一关联键可再用；对端答 `task` 时任务已登记（A3、C2）
   - `taskResult` 时 `checkOutput` 抛出：答带 `violates`（`output-check-failed`）的结果，不答 `effect-unknown`（A 的 B1、C3）
   - 调用在第 1 代发出，`call` 返回之前连接 `lose` 并重建到第 2 代：之后 `cancel` 答 `unknown`，不调用 `cancelRequest`（C4）
   - 任务操作新建连接时 `discover` 无应答、时限先到、建连途中关停：各答 `connection-unavailable`（第 7 条）
   - `TaskRef.issuedAt` 与记录不同：答 `unknown`，不发请求（第 8 条）
   - A 的 B3 列出的每个未执行分支（T9 `call` 违约、`ensure` 期间 `signal`、`ensure` 之后续调用换代不发、任务请求 `not-sent` → `ConnectionFailure`）
   - `ContinueRequest` 两个字段都缺（第 9 条）
3. 结构：`calls.ts` 里 `InFlightCalls` 的收口只在一处被调用；`grep -n 'await ask(() => ensured.transport.cancelRequest'` 为空；`reserve` 不再与 `stopOf` 分两步。交回附 `grep` 的命令与输出。
4. 契约原有用例原样通过（`classify` 的用例只加不改）；导出集合按新增改写；`mcp` 原有用例只在改了的行为上改写，并逐条说明。
5. 已定事项第 12 条的变异全部在最终 head 上跑过：每条写「变异 → 变红的用例 → 运行时的 head」，存活的写理由。日志在 `tmp/closures/w3-mcp-call/fix1/mutations/`。
6. `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`、`check:design` 退出 0；`git ls-files --eol | grep -c w/crlf` 为 0。每项输出尾部与日志哈希写进交回。
7. `src/` 无 `as`（`as const` 除外）、无 `any`、无非空断言。附命令与输出。
8. `pnpm run metrics --coverage --base 7d91a330c` 退出 0；改动或新增的函数不新增超 alert（圈复杂度 > 12）的；`perform`、`sendOn`、`failureOf`、`failureOfEnsure` 的读数写进交回。

## 实施规格
- 契约 S1–S9、R2、R5、R7、O1–O6 的条款不变，只按已定的事改 O1、O3 的句子与成员 SPEC。
- `perform` 的形状：占位 → 在停止信号下依次走关口、配值、已知动作、续调用核代际、`ensure` → 发出 → 在停止信号下等应答 → 分类；一个 `finally` 按阶段收口。阶段用数据表达（例如一个记录「已发出」的变量或判别联合），不靠多个布尔量拼。
- 成员 SPEC MC-16 按新的形状改写：从占位起 `cancel` 与调用方中止走同一个停止信号；每个答 `cancelled` 的出口写明「键转为已结束」；步号只用 MC-16 自己的编号，用例标题与源码注释里的「step N」随之改成 MC-16 的步号。
- 命名账本：收口方法、契约常量的名字由你定，写进交回。

## 性质及证据义务
- 每个异步副作用有等待上界或明确的拥有者：发出前的每个等待在停止信号下；`cancelRequest` 归表的作用域；发出后的等待在停止信号下。新用例断言有界。
- 占位守恒：任何路径（含端口违约、`checkOutput` 抛出、`lose`、`closeAll`、建连失败）都不遗留占位；答「未发出」且未取消的关联键立即可再占。
- 隔离与不重发的原有用例原样通过。
- 并发用 deferred 排次序，不用 `settled()` 代替「已经到达」。

## 施工计划
1. 读评审记录全文与三个探针目录（`mcp-call-r1-probes-a/`、`mcp-call-r1-probes-c/`），用它们写第 2 条的红灯用例，提交一次。
2. 契约 `classifyOutcome` 吸收校验函数的抛出（第 6 条），先红后绿。
3. `InFlightCalls` 与 `perform`：一个出口、一个停止信号、`cancelRequest` 交作用域、发出代际。
4. 任务操作：第 5、7、8 条。
5. 其余非阻断与 SPEC 各节。
6. 变异（第 12 条）在最终 head 上全部跑；门禁；交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。纯整理与行为改动分开提交。

## 自主范围与动作授权
允许：写范围内改文件；运行三个成员的构建与测试（含慢层）、仓库检查、度量；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增依赖、改契约条款的含义（O1、O3 的补句除外）。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call。并行的有 `w3-mcp-call-model`（另一棵树，慢层探索器与 TLC 吃 CPU）与 `w3-mcp-host-fix1`（另一棵树）。成员测试用 `VITEST_MAX_WORKERS=4`；慢层单独跑。不跑 `admission`、不跑仓库全量测试、不跑差分变异。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 评审记录与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r1.md
- 原闭包规格（已定的事 1–12 与追加记录）：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call.md
- 探针：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r1-probes-a/`、`mcp-call-r1-probes-c/`
- 契约：`packages/mcp/mcp-contract/SPEC.md` 的 S1–S9、R2、R5、R7、O1–O6、T5、T9
- 必须加载：ub-mode；pstack:typescript-best-practices；写 SPEC 时 asd-ste100

## 当前认知
- 已确认：A、C 两路的探针在基线上复现了第 2 条的大部分项；A 的覆盖率运行里 `lifecycle.spec.ts > wide` 超过 600 s 时限（负载下，未归因），写者此前的慢层 647 s 通过。
- 已确认：两个 MCP 成员之外没有地方构造 `McpPorts` 或读 `inputResponses`。
- 未知：`w3-mcp-call-model` 的探索器是否用到 `InFlightCalls` 的内部签名。

## 返回与恢复
每个提交号；每条验收的命令、结果、输出尾部与日志哈希；第 2 条每项的「用例 → 缺陷 → 变红证据」；第 5 条的变异表；第 3 条的 `grep` 输出；改动的内部签名（给探索器合回用）；自定裁定与理由；写者声称的结构性改动清单（reduce 逐条 `grep` 核实）；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-call/fix1/`。

## 已知会受影响的现有用例
- `packages/mcp/mcp/tests/in-flight.spec.ts`：`reserve`、`stopOf`、`markSent` 的签名改了，按新签名改写，断言不放宽。
- `packages/mcp/mcp/tests/cancel.spec.ts`、`invoke.spec.ts`：「step N」标题改成 MC-16 的步号；`settled()` 排次序的用例改用 `reached` deferred。
- `packages/mcp/mcp/tests/tasks.spec.ts`：任务操作 `ensure` 失败的映射改了，按第 7 条改写并逐条说明。
- `packages/mcp/mcp-contract/tests/public-entry.spec.ts`：如新增导出。

## 停止条件
- 某项要求只能靠改排除范围内的文件实现。
- 已定的事与契约条款冲突，或在任何实现下都兑现不了。
- 同一用例连试三种做法仍红。

## 追加记录
- 2026-11-05 派发前：简报检查退出 0。`caller-outside-scope` 警告来自 `cancelled`、`cancel`、`perform`、`ensure`、`McpPorts`、`InFlightCalls` 与同名标识符的匹配；落在 MCP 两个成员之外的 0 处，其余都在写范围的目录里（检查器只按文件精确匹配）。已知：`w3-mcp-call-model` 的探索器（`tests/model/explore.ts:38`、`:427`）包住真实的 `InFlightCalls` 做计数视图，本闭包改它的签名后两边在合回时由派发者对齐。
- 2026-11-05 约 14:40 宿主 429 限流（5 小时额度到顶），写者中断；15:05 额度恢复后续用原写者接着做（保留工作树改动，P18）。派发者读的工作树事实写在续派消息里；对 `w3-mcp-call-model` 与 `w3-mcp-host-formal` 加了「每完成一个能过 typecheck 的阶段就提交」。
- 2026-11-05 16:09 交回（`67b653a7f`）。派发者核对：23 个文件全在写范围，树干净；`conclude` 唯一调用（`calls.ts:320`）、`await ask(() => ensured.transport.cancelRequest` 0 处、`stopOf`/`markEnded`/`release(key` 0 处。写者自裁 1–11 的处置（卡拥有者）：全部采纳。其中第 2 条（未发出且停止信号已触发一律 `cancelled`，含传输答 `authorization-required`、`session-ended`，连接仍转 `lost`）与第 3 条（`ContinueRequest` 两字段都缺时 `TypeError`，不占位）要写进契约：R2 的 `cancelled` 定义改为「占位后、发出前，这次调用的停止信号已触发（收到 `cancel` 或调用方的 `signal` 中止）」；S2 写明两字段都缺是前提违反。归调用口文档闭包。第 7 条（发现的关口与存储读取不在调用方 `signal` 下）作为已知限制保留。之后派发者自己改了 F1(d)（`1a143a4d4`，见 `w3-mcp-call-model.md` 追加记录）。
