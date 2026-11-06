# 闭包规格 w3-mcp-call-fix2

## 身份与位置
- 闭包：w3-mcp-call-fix2
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call
- 分支：PanQiWei/skill-mcp-w3-mcp-call
- 基线：5204d379901ef104350ae5759a219a58700238e6
- 清晰度：定

`w3-mcp-call` 第 2 轮评审之后的代码修复轮（PR #1141）。基线是第 2 轮评审的 head。五面报告与卡拥有者的全部裁定在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r2.md`；「卡拥有者的裁定」两节里标「改」的代码项与 SPEC 行为项是本闭包的施工依据。README 两种语言、`docs/`、`verification/README.md`、`verification/models/README.md`、编号读法与契约出处这些表达项，以及 C 序列变异在最终 head 上的重跑，由下一个闭包做。

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：任务的账户隔离（策略 `security-sensitive`）、调用生命周期的并发次序与关停（`top_risks` 并发、收尾时机）→ 顶档；负责人定的 Fable 档位上限是 high。

## 目标边界
目标：修掉第 2 轮的阻断（任务号跨账户碰撞）；把「关停之后不问端口」做成 `under` 的一部分；在途表交出占位句柄，阶段只在表里；`table.lose` 的同步前缀由签名保证；补齐差分变异与正确性评审指出的用例缺口；形式守护（探索器、必要时 `Calls.tla`）跟上新结构。每个行为改动先写一条在基线上变红的用例。

### 已定的事（不重新裁定）
1. **任务号碰撞**（A 阻断 1）：`TaskTable.record` 遇到同一键已有记录且对端账户不同时，该键转为「有歧义」，之后两个引用都答 `unknown`、不发请求；同一账户、不同 `issuedAt` 照旧以新记录为准。MC-17 写明这条规则与反例；根因（`TaskRef`、任务表键不带账户）登记为已知限制，退出条件是契约 6b。
2. **关停之后不问端口**（B R2-1、A 范围外 1、C 11）：
   - `under(stop, work)` 在开始之前与等完之后都核停止信号与 `table.isShut()`，交出「已停止」「已关停」两种哨兵或结果；`perform` 一处把「已停止」判为 `cancelled`（C 3），`prepare` 把「已关停」判为「未发出：`connection-unavailable`」。首次调用与续调用因此同答，关停之后不再读存储、不再问关口。入口处的 `isShut` 先判保留（第 3 步）。
   - `refresh`（`discovery.ts`）先判关停，答 `connection-unavailable`，不问关口；MC-7 次序改为「关停 → 关口 → `ensure`」。
   - 任务操作在 `built` 的关口之后再判一次关停，答 `effect-unknown`（`no-connection`）（S8）；建连途中的关停仍按 MC-17 第 3 步答 `connection-unavailable`。
   - 契约 `packages/mcp/mcp-contract/SPEC.md` S8 补一句：`closeAll` 之后，要连接的操作先判关停、不问端口（先于 S1 的采用核对）；在途的操作在下一步之前判关停，答同样的结果；任务操作仍先按 S2 判发起者。成员 SPEC 第 3 步、MC-7、「所有权」一段同步。
3. **第 8 步**（A 非阻断 1、C 10）：`transport.call` 之前核停止信号，已触发按 `cancelled` 收场，传输的 `call` 不被调用。
4. **占位句柄**（C 2）：`reserve` 交出句柄（停止信号、记发出、收口），阶段只存在表里；`perform` 的可变阶段变量与 `markSent` 的 `TypeError` 守卫删掉。T9（`call` 违约）经句柄记为已发出。发出与登记之间的 `cancel` 不核代际，行为不变（C 1 裁定），SPEC 第 11 步补一句原因：发出代际在 `call` 返回之后才登记。
5. **`table.lose` 的同步前缀**（C 6）：`lose` 改成同步函数：同步完成「标记失联、拒绝请求」，交回拆除与清单标记的 promise（形如 `{ done: Promise<CatalogMark> } | 'not-current'`）；`loseOn` 等它，`loseInScope` 把它交给作用域。`markLost` 同样拆开。在标记之前加 `await` 必须改签名，类型检查会拦下。
6. **一条规则一处**（C 4）：connect 阶段的建连失败映射一个函数，调用口与任务操作共用；`classifyOutcome` 的上下文一处构造；`ensureOptionsOf` 共用；同类型的 `connection-unavailable` 常量只留一个。`outcomeOf` 里由结局本身推出转 `lost` 的原因（D 存活 `calls.ts:251`），不再先判 `kind` 再取 `cause`。
7. **依赖类型**（C 8）：`calls.ts`、`tasks.ts` 各自声明依赖类型，`invoker.ts` 合成；两者不再从 `invoker.ts` 取类型。
8. **可读性**（C 10）：`outcomeOf`、`notSentBy` 换成说出副作用的名字；T9 的 `undefined` 哨兵换具名常量；`asIs` 去掉无用参数；`Sent.access` 只为 `tenant` 存在时去掉。
9. **作用域里的标记**（A 范围外 2）：不改代码。成员 SPEC MC-10 或「所有权」一段写明：调用与任务操作交给作用域的拆除与标记可以落在 `closeAll` 返回之后（作用域拥有错误、不汇合完成，P8 A1）；标记写入经 `ask`，端口失败不成为本包错误。
10. **已知限制**（C 5）：`refresh` 关口与存储读取那一条扩到任务操作（`TaskControl` 没有 `signal`），改掉「调用口没有这项限制」的对照句；给任务操作加 `signal` 记为 6b。
11. **未处理拒绝的守卫**（D）：采用 `packages/mcp/mcp-host-local/tests/unhandled.ts` 的做法，作为本成员 `vitest.config.ts` 的 setup 文件（不是每个用例文件各调用一次）。
12. **用例缺口**（A 非阻断 2、3，D 存活与无覆盖，E 验收 2）：
    - MC-17 第 3 步 `settings` 阶段两支（重读采用答 `unknown` → `unknown`，其余 → `no-connection`）各一条，在关口之后改采用。
    - S8 的两条用例断言关口、存储与建连的端口调用次数。
    - `connectBound` 有值时的建连（时限确实来自它）；只带 `inputResponses` 的续调用；任务失败映射的 `unknown` 与 `no-connection`；`guard.ts:57` 的判定；已触发信号下非 `connection-unavailable` 原因的「未发出」仍转 `lost`（`calls.ts:239`）。
    - 覆盖分类与任务登记、覆盖收口的现有用例加「step 12:」「step 13:」标签。
    - D 的其余存活：错误信息文字、`exactOptionalPropertyTypes` 要求的条件展开，若判为不是承诺或等价，交回逐条写理由，并说明为什么不能改成可判定。
13. **形式守护**：探索器的计数视图改为观察句柄，P11 的三个检查保持；`task-account` 场景加一个碰撞变体（两个账户、同一任务号），零违例；原有负控照旧变红。`Calls.tla` 若建模了关停下的续调用或任务登记键，按第 1、2 条同步，并重跑全部配置；没有建模就在交回里写明为什么不受影响。成员 SPEC「性质与证据」只改与本闭包改动对应的句子（P11 的投影、碰撞变体、P13/P14 若受影响）。

### 写范围
- `packages/mcp/mcp/src/` — 调用口、任务操作、在途表、任务表、连接表的 `lose`、发现、装配
- `packages/mcp/mcp/tests/` — 新用例、标签、替身，含 `tests/model/`
- `packages/mcp/mcp/vitest.config.ts` — 第 11 条的 setup 文件
- `packages/mcp/mcp/SPEC.md` — MC-7、MC-10、MC-12、MC-16、MC-17、「所有权、失败与生命周期」、已知限制、偏离表；「性质与证据」只按第 13 条
- `packages/mcp/mcp/verification/models/` — 第 13 条：`Calls.tla` 与配置（如需），不含 `README.md`
- `packages/mcp/mcp-contract/SPEC.md` — 只改 S8 一句
- `tmp/closures/w3-mcp-call/fix2/`（新建） — 红灯、探索器与 TLC 日志、门禁输出、手工变异日志

### 排除的调用方
- `packages/mcp/mcp/README.md`、`README_ZH.md`、`docs/`、`verification/README.md`、`verification/models/README.md`：下一个闭包改。你改了的行为若让这些文件的句子过时，在交回里列出位置。
- 契约 `src/` 与其余条款：本轮不改。`classify.ts` 的裸 `catch`、`ContinueRequest` 的类型、`TaskRef` 带账户都归 6b。
- `packages/mcp/mcp-host-local/`、契约的 T 段：`w3-mcp-host` 在另一棵树重构，不要碰。
- 锁文件与依赖段。

## 验收清单
每条写命令、预期与结果，输出尾部与日志的 SHA-256 前 16 位写进交回。失败时先在基线上复跑同一检查。

1. `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp --filter=@omne-harness/mcp-contract` 退出 0；`pnpm --filter @omne-harness/mcp run test:slow` 退出 0，日志带退出码一行。
2. 下列行为改动各有一条用例，在基线 `5204d3799` 上变红、在交回的 head 上变绿；红灯输出存 `tmp/closures/w3-mcp-call/fix2/red/`：
   - 两个账户的同一任务号：两个引用都答 `unknown`，不发 `tasks/get`（A 的探针 account）
   - `closeAll` 之后 `invoke`：不问关口、不读存储、不建连
   - `closeAll` 落在关口等待途中：首次调用与续调用都答「未发出：`connection-unavailable`」，之后不读存储（A 的探针 s8）
   - `closeAll` 之后对未采用的接入点 `refresh`：答 `connection-unavailable`，不问关口
   - 任务操作等关口时 `closeAll`：答 `effect-unknown`（`no-connection`）（C 的探针 task-closeall-during-gate）
   - 逐个微任务扫 `cancel` 的落点：停止信号触发之后传输的 `call` 一次也不被调用（A 的探针 step8）
3. 第 12 条的缺口用例在基线上本来就绿的，各给一个让它变红的源码变异（在工作树之外的副本上改、跑、还原），日志存 `tmp/closures/w3-mcp-call/fix2/mutations/`。
4. 结构：`grep -n "markSent\|TypeError('markSent" packages/mcp/mcp/src` 为空；`perform` 没有 `let`；`table.lose` 与 `markLost` 不是 `async` 函数，返回类型不是 `Promise`；`grep -n "from './invoker.ts'" packages/mcp/mcp/src/calls.ts packages/mcp/mcp/src/tasks.ts` 为空。附命令与输出。
5. 差分变异第 2 轮的 7 个无效变异体（2 个运行错误：`calls.ts:216` 箭头函数、`calls.ts:252` `!==` → `===`；5 个没跑完：`calls.ts:105`、`:229`、`:281`、`:303`、`in-flight.ts:74`，行号按基线）在新守卫下各自手工翻转，写出杀死它的用例名；行已被改写的，写明对应的新行与结果。
6. 探索器全部场景零违例，负控照旧变红；`Calls.tla` 改了就重跑全部配置并写判读。日志存 `tmp/closures/w3-mcp-call/fix2/model/`。
7. `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`、`check:design` 退出 0；`git ls-files --eol | grep -c w/crlf` 为 0。每项输出尾部一两行与日志哈希写进交回。
8. `src/` 无 `as`（`as const` 除外）、无 `any`、无非空断言。附命令与输出。
9. `pnpm run metrics --coverage --base b2ba7dc89` 退出 0；改动的函数不新增超 alert 的；`perform`、`prepare`、`under`、`failureOf`、`built` 与新句柄的方法写读数。`lifecycle.spec.ts > wide` 在覆盖率运行里超时是已知现象，出现时写明，并用 `vitest` 单独核对改动函数的覆盖。

## 实施规格
- 契约条款除 S8 一句外不变。成员 SPEC 的步号只用 MC-16 自己的编号；改动后的步号与用例标题、源码注释一致。
- 句柄、哨兵与重命名的名字由你定，写进交回的命名账本。
- 纯整理与行为改动分开提交：先第 4–8 条的结构整理（行为不变，原有用例原样通过），再第 1–3 条的行为改动（先红后绿），再用例缺口与形式守护。

## 性质及证据义务
- 每个异步副作用有等待上界或明确的拥有者；关停之后不再调用任何端口（守护：第 2 条的用例与探索器）。
- 占位守恒：任何路径都不遗留占位；P11 的三个检查在新结构下照旧成立。
- 账户隔离：一个账户发起的任务，只经同一账户的连接与凭据操作；碰撞时宁可答 `unknown`。
- 并发用 deferred 或 `reached` 排次序，不用 `settled()` 代替「已经到达」。

## 施工计划
1. 读裁定全文与三个探针目录（`mcp-call-r2-probes-a/probe2/`、`mcp-call-r2-probes-c/`），写第 2 条的红灯用例，提交一次。
2. 结构整理：句柄（第 4 条）、`lose`（第 5 条）、一处规则与依赖类型（第 6、7 条）、可读性（第 8 条）；探索器计数视图同步。每步原有用例通过就提交。
3. 行为：第 1、2、3 条，先红后绿。
4. 守卫（第 11 条）与用例缺口（第 12 条），第 3、5 条验收的手工变异。
5. 形式守护（第 13 条）与 SPEC、契约 S8。
6. 门禁、度量、交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行 `@omne-harness/mcp` 与契约的构建与测试（含慢层）、探索器、TLC、仓库检查、度量；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增依赖、改契约 S8 那一句以外的条款。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call。并行的有 `w3-mcp-host-fix2`（另一棵树）与 host 的第 2 轮评审（可能在跑覆盖率）。成员测试用 `VITEST_MAX_WORKERS=4`；慢层、探索器与 TLC 单独跑，不与成员测试叠加。不跑 `admission`、不跑仓库全量测试、不跑差分变异。TLC 的工具链：`/opt/tlaplus/tla2tools.jar`（v1.7.4），`JAVA_BIN=/opt/java/jdk-21.0.12.1+1-jre/bin/java`，非登录 shell 要显式 export；做法见 `verification/models/README.md`。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 评审记录与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r2.md
- 上一轮修复规格（已定的事与追加记录）：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call-fix1.md
- 探针：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r2-probes-a/probe2/`、`mcp-call-r2-probes-c/`
- 守卫的样板：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/tests/unhandled.ts
- 契约：`packages/mcp/mcp-contract/SPEC.md` 的 S1、S2、S7、S8、R2、R6、R7、T5、T9
- 必须加载：ub-mode；pstack:typescript-best-practices；写 SPEC 时 asd-ste100

## 当前认知
- 已确认：A 的四个探针在基线上复现（碰撞、`closeAll` 落在关口途中、第 8 步的微任务空隙、作用域里的标记落在 `closeAll` 之后）；C 的 `task-closeall-during-gate` 探针复现。
- 已确认：`closeAll` 不汇合作用域里的工作是生命周期已定的设计（`internal/scope.ts` 文件头）。
- 已确认：第 2 轮 `lint:deps` 退出 0；`lifecycle.spec.ts > wide` 在覆盖率运行里超过 600 s（两轮同一现象）。
- 未知：`Calls.tla` 是否建模了关停下的续调用与任务表的键。

## 返回与恢复
每个提交号；每条验收的命令、结果、输出尾部与日志哈希；第 2 条每项的「用例 → 缺陷 → 变红证据」；第 3、5 条的变异表；第 4 条的 `grep` 输出；命名账本；自定裁定与理由；写者声称的结构性改动清单（派发者逐条 `grep` 核实）；让排除文件里的句子过时的位置；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-call/fix2/`。

## 已知会受影响的现有用例
- `tests/in-flight.spec.ts`：`reserve`、`markSent`、`conclude` 的签名改了，按句柄改写，断言不放宽；`:200` 固定的 T9 情形改为经句柄记发出。
- `tests/model/explore.ts` 的 `CountedInFlight`：改为观察句柄。
- `tests/invoke.spec.ts`「step 7: after closeAll」：改为 step 3，并加端口次数断言。
- `tests/refresh.spec.ts` 中 `closeAll` 之后的用例：次序改了，答复可能从关口的拒绝变为 `connection-unavailable`，逐条说明。
- `tests/tasks.spec.ts`：碰撞与关停的新用例；`settings` 阶段两支。

## 停止条件
- 某项要求只能靠改排除范围内的文件实现。
- 已定的事与契约条款冲突，或在任何实现下都兑现不了。
- 同一用例连试三种做法仍红。

## 追加记录
- 2026-11-05 18:58 派发前：简报检查退出 0。172 条 `caller-outside-scope` 警告：119 条落在 `packages/mcp/` 的写范围目录里（检查器按文件精确匹配）；53 条在其他成员，是 `closeAll`、`ensure`、`lose` 等同名标识符（存储、模型、身份的 `closeAll` 等），不是本包的调用方。
- 2026-11-06 01:15 续派：写者 2026-11-05 约 19:47 起被宿主 429 限流中断（5 小时额度到顶），20:03 时工作树与 19:47 相同。工作树事实：3 个提交（`c9851cfe7` 红灯、`38eb40b92` 结构、`b3b806020` 行为）；未提交 13 个文件（成员与契约 SPEC、`calls.ts`、六个用例文件、探索器三处、`Calls.tla`、`vitest.config.ts`）与新文件 `tests/unhandled.ts`；`tmp/closures/w3-mcp-call/fix2/` 最新日志 `gaps-fast-2.log`（19:46）。额度恢复后续用原写者（保留工作树改动，P18；它的上下文里有施工理解，换人要重读全部材料）。要求：先 `git status` 与 `git diff --stat` 核对改动仍在，再接着做；每完成一个能过 typecheck 的阶段就提交。
- 2026-11-06 03:05 交回（`delegate/handbacks/w3-mcp-call-fix2.md`），head `0b84a0bec`，5 个提交，树干净。派发者核对：`git diff --stat 5204d3799..HEAD` 29 个文件全在写范围（`src/status.ts` 在 `packages/mcp/mcp/src/` 之内）；作者、提交者与 trailer 正确；`Calls.tla` 最后修改 19:30，TLC 全部配置 19:41–19:48 跑在其后。读 `calls.ts` 的 `under`、`prepare`、`sendOrder`、`perform`：每个端口调用之前都由 `under` 先核停止与关停，第 8 步在与 `transport.call` 同一段同步执行里再核，所以关停之后不再问端口，与契约 S8 新句一致。自裁 1–12 全部采纳；第 2 条（`under` 等完之后不核，改在决定点核）由逐微任务扫描用例支持，比裁定字面更强；第 6 条的模型差异（模型在关口答复后读 `shut`，代码在下一次等待前读）可观察结果相同，交 docs2 写进模型 README。验收第 9 条：`publish` CC 17、`begin` CC 12 在基线 `5204d3799` 上相同，不是本闭包新增。派发者在 head 上复跑（03:05–03:17）：`lint:rules` 退出 0（`06a79cd7f6656911`）、`typecheck` 退出 0（`a45371fee1c0e1db`）、三包 `build typecheck test` 退出 0，16 个任务 14 个命中缓存，`@omne-harness/mcp` 的用例重跑 11 分 50 秒（`4896302db3cf48c6`），日志在工作树 `tmp/closures/w3-mcp-call/owner-fix2/`。契约 S8 有一句重复，并进 docs2 第 4 条。
- 2026-11-06 04:10 更正：03:05 一条采纳自裁 2 时，派发者只核了「关停之后不问端口」，没有核契约 S8 新句的另一半「答同样的结果」。第 3 轮 C 面在 `fcc955a53` 上给出三个反例（续调用等存储时答 `unknown`、等关口后设置缺失答 `config-missing`、任务操作发请求前不判关停）。处置见 `reviews/mcp-call-r3.md`「卡拥有者对 C 的处置」：关停与停止同形，答复只在 `perform` 一处决定。归属：派发者的核对（不是写者的缺陷）。
