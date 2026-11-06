# 闭包规格 w3-mcp-call-model

## 身份与位置
- 闭包：w3-mcp-call-model
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call-model
- 分支：PanQiWei/skill-mcp-w3-mcp-call-model
- 基线：7d91a330cf89a445c56057464b91d29f9129260e
- 清晰度：界

基线是 `w3-mcp-call` 写者交回的 head。调用口（`invoke`、`continueWithInput`、`cancel`、四个任务操作）已实现，用例与手工变异已有，但它新增的并发没有进形式化验证：生命周期的有界穷举探索器（`packages/mcp/mcp/tests/model/`）与 TLA+ 模型（`packages/mcp/mcp/verification/models/ConnectionTable.tla`）只覆盖连接表 P1–P8。负责人要求新代码的并发都在形式化验证的守护之内。本闭包把调用口纳入两者。性质的陈述与映射由你按本规格的方向写定。

## 模型与推理强度
developer，implementation_kind verification，Claude Fable 5.1（claude-fable-5-1），effort high。理由：跨模块的并发次序与形式模型（策略 `cross-process-faults` 同类的验证设施，且结论把守一个闭包的接受）→ 顶档；负责人定的 Fable 档位上限是 high。

## 目标边界
目标：(1) 扩展探索器，让它驱动真实的 `createMcp` 调用口，与连接表的生命周期动作交错；(2) 写出调用口的性质，在探索器的每个可达状态核对；(3) 在 `verification/models/` 加调用口的 TLA+ 模型，正控通过、每条性质各有一个会变红的负控；(4) 写模型、探索器与实现的动作映射。

本闭包不改 `src/`。探索器或模型找到实现的缺陷时，留下最小反例（调度或 TLC 轨迹）与它违反的性质，交回；修复归 `w3-mcp-call` 的修复轮。

### 已定的事（不重新裁定）
1. **性质**（编号接在 P8 之后，名字由你定，陈述写进成员 SPEC「性质与证据」一节，那里是唯一源）。至少：
   - 发出前不发：一次调用答「未发出」时，传输的 `call` 没有被调用，或被调用并答了 `not-sent`。占位之后、发出之前到达的 `cancel` 或调用方中止，使该调用的 `call` 计数为 0 或答 `not-sent`。
   - 取消至多一次：`cancelRequest` 只对答过 `SentCall` 的请求号调用，每个请求号至多一次；调用了它的调用答 `unknown`（`abandoned`）。
   - 占位守恒：每个占位恰好结束一次（归还或标记结束）；调用答复时它的占位已结束；答「未发出」的调用的关联键立即可以再占；任何调度（含端口违约、`lose`、`closeAll`、建连失败）都不遗留占位。
   - 隔离：在途表与任务表按租户与主体隔离，另一主体或另一租户的 `cancel` 与任务操作不触发任何端口调用；任务操作只在与记录的连接键（租户、持有、对端账户）相同的连接上发请求。
   - 关停之后不发：`closeAll` 被调用之后不再调用传输的 `call`；之后的调用答「未发出」。
   - 有界答复：调用方中止或 `cancel` 之后，在所有时限触发之后，没有调用还在等（同 P8 T2 的全局形式）；TLA+ 里写成带公平性的活性。
2. **探索器**：在现有 `explore.ts` 的框架上加操作与端口，不另起一套：操作加 `invoke`、`continueWithInput`、`cancel`、调用方中止与任务操作；端口加传输的 `call`、`cancelRequest` 与应答（答复、`not-sent`、`no-answer` 各原因、挂起、违约）。新的场景放 `scenarios.ts`，新的性质核对放 `properties.ts`。已有场景与 P1–P8 的结论不变。宽的场景只在慢层运行。
3. **TLA+**：新建一个模块（例如 `Calls.tla`），对连接只保留调用口需要的抽象（可用、丢失、关闭、关停与代际），不复制 `ConnectionTable.tla` 的生命周期细节；由 `run.py` 运行，每个配置写进 `models/README.md` 的配置表。负控每个只放一个缺陷，各自让一条性质变红，例如：`markSent` 不看取消、失败路径不归还占位、发出后取消两次调用 `cancelRequest`、任务操作不比账户、关停之后仍发。
4. **映射**：`verification/README.md` 的「动作映射」一节为调用口加一张表：模型动作 ↔ 探索器动作 ↔ 实现的函数（`src/calls.ts`、`src/tasks.ts`、`src/internal/in-flight.ts`、`src/internal/task-table.ts`）。写明模型的抽象与范围上限，不写「已证明」。

### 写范围
- `packages/mcp/mcp/tests/model/` — 探索器、端口替身、性质、场景、新的慢层用例文件
- `packages/mcp/mcp/verification/models/` — 新的 TLA+ 模块、配置、`run.py` 的登记、`README.md`、`index.md`
- `packages/mcp/mcp/verification/README.md` — 动作映射与读数
- `packages/mcp/mcp/SPEC.md` — 只改「性质与证据」一节：新性质的陈述与证据行
- `packages/mcp/mcp/tests/README.md` — `model/` 一段跟随
- `tmp/closures/w3-mcp-call-model/`（新建） — 运行输出、反例与日志

### 排除的调用方
- `packages/mcp/mcp/src/`：只读。找到缺陷时交回反例，不修。
- `packages/mcp/mcp/tests/` 里 `model/` 以外的用例与替身：只读（在途的评审正在读它们）。需要的替身复用时从那里导入，不改它们。
- `packages/mcp/mcp-contract/`、`packages/mcp/mcp-host-local/`：只读。
- 成员 SPEC「性质与证据」以外的节、README 两种语言、`docs/`：只读。

## 验收清单
每条写命令、预期与结果。

1. `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp` 退出 0。
2. `pnpm --filter @omne-harness/mcp run test:slow` 退出 0：原有场景与新场景都没有反例；报告每个场景的状态数、深度与耗时。
3. 探索器的负控：对每条新性质，在副本上对实现做一处使它失效的变异（例如 `markSent` 不看取消、`release` 不调用），探索器找到反例；记下变异、场景与反例的调度，然后还原。至少一条性质要用真实实现上的变异证明会变红。
4. `node scripts/with-test-slot.mjs python3 packages/mcp/mcp/verification/models/run.py <新配置...>` 退出 0：正控通过，每个负控按预期违反它针对的那条性质（`run.py` 的判读与 `summary.json`）。原有 14 个配置不必重跑，除非你改了 `ConnectionTable.tla` 或 `run.py` 的共用部分。
5. 成员 SPEC「性质与证据」的新性质与证据行、`packages/mcp/mcp/verification/README.md` 的映射表、`packages/mcp/mcp/verification/models/README.md` 的配置表一致，编号与名字三处相同。
6. `pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run format:check`、`pnpm run check:docs` 退出 0。

## 实施规格
- 探索器沿用「两个选择之间让所有 promise 反应跑完」的规则与按投影去重。新端口的每次调用都挂起，由探索器选择答复。
- 时间值、上限与场景的边界写成常量并注明理由；耗时超过 10 分钟的场景只放慢层，并在交回里给出耗时。
- TLC 的环境：`TLA2TOOLS_JAR` 与 `JAVA_BIN` 按 `models/README.md`「运行与判读」；本机的 jar 与 java 路径见方法入口的工具链说明。
- 命名账本：新模块、配置、性质的名字写进交回。

## 性质及证据义务
- 每条新性质至少有一个正控（无反例）与一个负控（有反例），两者的命令与输出都留在 `tmp/closures/w3-mcp-call-model/`。
- 探索器找到实现缺陷时：反例的调度、违反的性质、能复现它的最小场景，写进交回的「发现」一节。

## 施工计划
1. 读成员 SPEC 的调用口一节（MC-16、MC-17、映射表）与「性质与证据」、`src/calls.ts`、`src/tasks.ts`、`src/internal/{in-flight,task-table,lost,assembly}.ts`；读 `tests/model/` 全部与 `verification/README.md`、`models/README.md`、`ConnectionTable.tla`。
2. 写性质陈述的草稿（放 tmp），再动探索器。
3. 探索器：端口与操作 → 性质 → 场景 → 正控 → 负控（实现副本上的变异）。
4. TLA+：模块 → 正控 → 负控。
5. 映射与 SPEC 性质节；门禁；交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行 `@omne-harness/mcp` 的构建与测试（含慢层）、TLC；在工作树之外的副本上改实现做负控；本地提交。不允许：改 `src/`、推送、开 PR、合并、改写范围外文件、新增依赖。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call-model。并行的有：`w3-mcp-call` 的只读评审（读另一棵树）、`w3-mcp-host-fix1` 的写者（另一棵树）。慢层探索器与 TLC 吃 CPU：用 `VITEST_MAX_WORKERS=4`、`FORMAL_WORKERS=4`，TLC 经运行名额（`scripts/with-test-slot.mjs`）。不跑 `admission`、不跑仓库全量测试、不跑差分变异。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call-model/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 调用口的闭包规格（裁定 1–12 与追加记录）：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call.md
- 生命周期的模型与探索器是同一做法的先例：`packages/mcp/mcp/verification/README.md`、`verification/models/README.md`。
- TLC 工具链：仓库钉 tla2tools v1.7.4。本机 `/opt/tlaplus/tla2tools.jar`（`run.py` 的缺省）就是 v1.7.4（SHA-256 `936a2620…`），`/data/qiwei/.local/opt/tlaplus-1.7.4/tla2tools.jar` 是同一个文件的副本；`/opt/tlaplus/tla2tools-2026.09.12.jar` 是旧版，不用。`JAVA_BIN=/opt/java/jdk-21.0.12.1+1-jre/bin/java`。Bash 工具起的是非登录 shell，读不到 `/etc/environment` 的变量，运行时显式 `export`。
- 必须加载：verification-facility；ub-mode；pstack:typescript-best-practices；写 SPEC 时 asd-ste100。

## 当前认知
- 已确认：调用口的写者用 34 个手工变异核过用例（`verification/README.md` M01–M34），M17（`markSent` 不看取消）在服务层存活，写者判为等价。这正是探索器要能区分的一类次序问题，先用它做负控。
- 已确认：调用口用 `ask`、`within`、`waitAtMost` 与连接表的作用域；任务操作的时限是 `BoundKind 'task'`。
- 未知：探索器加入调用口之后的状态空间大小。先用最小场景（一个键、一个 `invoke`、一个 `cancel`、一个 `closeAll`）量出状态数，再加宽。

## 返回与恢复
每个提交号；每条验收的命令与结果；新性质的名字与陈述；每个场景与配置的状态数、深度、耗时；负控的「变异或缺陷 → 性质 → 反例」表；发现（实现缺陷的反例）；自定裁定与理由；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-call-model/`。

## 已知会受影响的现有用例
- `packages/mcp/mcp/tests/model/lifecycle.spec.ts`：原有场景原样通过。

## 停止条件
- 某条性质只能靠改 `src/` 才能在探索器里表达（例如缺一个可注入点）：停下交回，写明缺什么。
- 状态空间在最小场景上已超过 30 分钟：停下交回，附读数。
- 同一负控连试三种写法仍不变红。

## 追加记录
- 2026-11-05 派发前：简报检查退出 0。`caller-outside-scope` 警告来自 `cancel`、`invoke`、`within`、`ask`、`closeAll`、`waitAtMost` 与全仓库同名标识符的匹配；本闭包不改这些函数（`src/` 只读），只从探索器里调用它们。不处理。工作树由 `prepare-closures` 建好（安装、投影、构建 `mcp`、`agent`、`identity-sql`），作者已用 `git config --worktree` 设为 PanQiWei。
- 2026-11-05 约 14:40 宿主 429 限流（5 小时额度到顶），写者中断；15:05 额度恢复后续用原写者接着做（保留工作树改动，P18）。派发者读的工作树事实写在续派消息里；对 `w3-mcp-call-model` 与 `w3-mcp-host-formal` 加了「每完成一个能过 typecheck 的阶段就提交」。
- 2026-11-05 15:40 交回（`c28c502f1`）。派发者核对：28 个文件全在写范围，署名与 trailer 正确，树干净。发现 F1、F2 是在基线 `7d91a330c` 上找到的；派发者读 fix1（`da392b283`）的 `calls.ts` 后的裁定（卡拥有者）：
  - F1(a) 关口三端口、F1(c) `cancelRequest`：fix1 已经改掉（`under(stop, …)`；`scope.spawn`）。合回后由探索器在新代码上确认。
  - F1(b) 传输 `call` 在停止后挂起：不算实现缺陷，是前提。调用在传输报告「没有发出」之前不能答 `not-sent`，否则可能谎报没有效果；停止之后 `call` 有界结束是传输按契约 T5 的义务（`answer` 同理：信号触发后以 `no-answer`（`abandoned`）兑现）。探索器与模型把它写成端口前提：信号触发后 `transport.call` 与 `transport.answer` 最终答复；P14 T2 的「无时限端口」集合不含这两个。
  - F1(d) 调用与任务操作等 `lose` 的拆除：是缺陷。判据：调用方只在它的答复要报告 `lose` 的产物时才等 `lose`。`discovery.ts:120` 报告目录标记，照旧等；`calls.ts:236`、`:248` 与 `tasks.ts:123`、`:127` 不用 `loseOn` 的返回值，交给表的作用域（`scope.spawn`）。`markLost` 第一个 `await` 之前的 `entry.connection.lose(reason)` 同步执行，所以「请求当即被拒」仍在调用答复之前成立。P8 A1 的理由是「报告确认的停止范围」，不覆盖调用口；成员 SPEC 已知限制「拆除的端口挂起」里「`lose` 的调用方」收窄为发现的调用方。由派发者自己改（单点修复，指到文件:行）。
  - F2 被放弃调用的 `answer` 无人读：fix1 的 `answerOf` 无论停止是否先到都经 `ask` 读 `answer`，拒绝有人处理。合回后由探索器确认。
  - 下一步：fix1 交回并核实后，派发者在调用口分支改 F1(d)；之后续用本写者把调用口分支合进模型分支，按新的 `InFlightCalls`（`reserve(key, signal)`、`markSent(key, connection, generation): void`、`conclude(key, phase)`）对齐计数视图与映射，在新代码上重跑探索器与受影响的 TLC 配置，报告 F1、F2 是否消失。
- 2026-11-05 16:35 追加 1（续用原写者，接续需要它对探索器的状态）：调用口分支头 `1a143a4d4`（fix1 的 12 个提交加 F1(d) 修复）。要求：
  1. 在模型分支 `PanQiWei/skill-mcp-w3-mcp-call-model` 上 `git merge --no-ff 1a143a4d4`（合并提交 `Agent-Role: developer`）。
  2. 计数视图对齐新的 `InFlightCalls`：`reserve(key, signal): AbortSignal | 'in-use'`、`markSent(key, connection, generation): void`、`conclude(key, phase: 'unsent' | 'sent')`；`stopOf`、`markEnded`、`release` 已删。P11 改为「每个占位恰好 `conclude` 一次」（`perform` 的唯一 `finally`）。`markSent` 不再答 `cancelled`，M17 与 `calls-equiv-marksent-blind` 的说法随之改正或删去。
  3. F1(b) 写成端口前提：信号触发之后 `transport.call` 最终答复（契约 T5）。P14 T2 的「停止后仍等的无时限端口」不含 `transport.call`；`transport.answer` 在 fix1 之后不再被停止的调用等待，如探索器仍报它，交回反例。
  4. 在新代码上重跑探索器全部场景（快层与慢层，含生命周期场景）与受影响的 TLC 配置（`Calls.tla` 或配置改了就重跑全部 `calls-*`），报告 F1(a)、F1(c)、F1(d)、F2 是否消失；新的违例交回反例，不改 `src/`。
  5. fix1 交给探索器的 C50（`under` 答复之后不再核停止信号）：在探索器上试做负控；同一轮交错表达不了时写明理由。
  6. SPEC「性质与证据」、`verification/README.md`（映射、发现一节改为「已修」并写修复提交）、`models/README.md` 同步。写范围与验收同原规格；门禁在最终提交上跑。
- 2026-11-05 16:44 追加 2：第 1 轮表达评审清单第 14 条归本闭包（`verification/README.md` 在你的写范围）：`:3` 的范围句只说连接表生命周期，现在本页也承载调用口；`:130`「编号里没有 M11」与之后的新节（调用口的 C 序列、你的 N 序列）要互不混淆。改成一页里各序列的范围与编号各自写清。评审全文：`waves/w3/reviews/mcp-call-r1-b-full.md`。
- 2026-11-05 17:14 追加 3：调用口分支头前进到 `2678b21b5`（文档闭包合入 `0c094e6f1`；派发者修 S8：`closeAll` 之后续调用与首次调用同样答「未发出：`connection-unavailable`」，在发送次序第 3 步之前判，不问端口，`104261a42`；依据表钉契约修订）。最终运行前把 `2678b21b5` 也合进模型分支；`call-shutdown` 场景与 P13 在新代码上重跑。
- 2026-11-05 17:59 追加 1–3 交回（头 `4dfc0aace`，树干净，写入只在写范围）。F1(a)、F1(c)、F1(d)、F2 在两个合并头上都消失，11 个场景零违例；F1(b) 写成端口前提 WF5；C50 两种证据都表达不了（一轮只有一个外部动作），变异零新增签名；M17 与等价配置删去，`calls-probe-stop` 改为负控 `calls-bad-gate-unstopped`；TLC 15 份配置全部符合判读。已合入调用口分支（merge `5204d3799`）。写者自裁 1–4 采纳。
