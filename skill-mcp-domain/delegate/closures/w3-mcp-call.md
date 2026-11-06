# 闭包规格 w3-mcp-call

## 身份与位置
- 闭包：w3-mcp-call
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call
- 分支：PanQiWei/skill-mcp-w3-mcp-call
- 基线：b2ba7dc895476a2e133cfb0ac730f9a878f56aee
- 清晰度：界

基线是父分支 `PanQiWei/skill-mcp` 合入 `w3-mcp-lifecycle`（PR #1134）之后的头。契约的调用口与任务操作已定（契约 SPEC S1–S9、R2、O1–O6、D1–D5、T6；波段 MCP 规格已定事项 27–34）。成员内的模块分法、在途与任务表的数据结构、取消的接线由写者设计，理由写进成员 SPEC。

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：在途调用与取消的并发次序、租户与账户隔离（策略 `security-sensitive`），跨契约与成员两个包 → 顶档；负责人定的 Fable 档位上限是 high。

## 目标边界
目标：在 `@omne-harness/mcp` 实现 `ActionInvoker`（`invoke`、`continueWithInput`、`cancel` 与四个任务操作）和任务表，用 `createMcp(ports, config)` 交出契约的五个服务 `McpServices`；删除 `createMcpCore` 与成员内绕道；做调用口需要的几处契约改动。

清单容错（C1：单个不合法工具剔除并报告）不在本闭包：它改契约 C1、T2 与未封闭项，与 `w3-mcp-host` 正在改的契约段落相邻，排在 host 合入之后的另一个闭包。

### reduce 已定的事（不重新裁定）

1. **`invoke` 的次序**按已定事项 28 的 1–9 步。每步失败答「未发出」并撤销占位，除非注明。
2. **建连失败到「未发出」的映射**（成员 SPEC 每行一条，每行一个能翻转它的变异）：
   - `ensure` 的 `settings` 阶段：原因（`Refusal` 各项、`config-missing`、`config-invalid`、`connection-unavailable`）原样作为 `NotSentReason`。
   - `ensure` 的 `connect` 阶段：`ConnectionFailure` 各项原样；`EffectUnknown`（`discover` 无应答）答 `connection-unavailable`。理由：调用本身没有发出，`effect-unknown` 说的是 `discover`，调用没有未知的对端效果。
   - `transport.call` 答 `not-sent`：`connection-unavailable` 与 `session-ended` 都答 `connection-unavailable`；`authorization-required` 原样带 `discovery`。连接状态按契约 S7「传输不再可用」一条处理（转 `lost`，以 `connection-unavailable` 标记清单），经连接表已有的 `lose`，只对当前代际生效。
   - 发出之后的结局只由 `classifyOutcome` 给出（R5、O1）；应答流断开、进程退出等 `no-answer` 落成 `unknown` 结局，连接状态同样按 S7。
3. **取消的接线**：`cancel` 对已发出的调用，与调用方 `signal` 在发出后触发同样处理（第 8 步：`cancelRequest(requestId)`，结局 `unknown`（`abandoned`），不等对端）。`markSent` 答 `cancelled`（取消落在第 6 步之后、发出之前）时，调用已在线上：同样按发出后取消处理。占位后、第 6 步之前的取消答「未发出：`cancelled`」，传输 `call` 计数 0。
4. **`continueWithInput`** 按已定事项 29。契约 `ContinueRequest.inputResponses` 改为可选（`mcp-contract/src/services.ts:108`）：S2 已写「各自可选，只带 `requestState` 的重试合法」，类型跟随 SPEC。当前连接的代际与 `issuedAt` 不同时答「未发出：`unknown`」，新代际上 `call` 计数 0。
5. **任务操作**按契约 S2 现行条文。它来自契约第 6 轮裁定 R6-6 A5（晚于已定事项 31 与判据 MC3-7）：四个操作（含 `cancelTask`）复用现有连接时不核采用与资格；要新建连接时核采用、资格必须 `granted`，不能新建答 `effect-unknown`（`no-connection`）；`AdoptionView` 答 `unknown` 时答 `Refusal` 的 `unknown`。已定事项 31 的「`cancelTask` 不为取消启动新进程」与 MC3-7 的「`cancelTask` 不建连」被它取代；契约 `services.ts:152` 的注释改成与 S2 一致（复用时不核，新建时与其他三个相同）。S8：先判发起者，再判 `closeAll`。
6. **任务的账户隔离**（L3 热点）：任务表记下发起时的连接键（租户、接入点、账户）。任务操作只在这个连接键的连接上发请求。新建出的连接的键与记下的不同（账户变了）时，不发请求，答 `effect-unknown`（`no-connection`）。理由：账户 A 发起的任务，不能经账户 B 的凭据去查询、交答复或取消。
7. **输出校验函数**：契约 `McpPorts` 加必填的 `checkOutput: OutputValidator`，`createMcp` 把它交给 `classifyOutcome`（O1、O3）；名字与 `ClassifyContext.checkOutput` 相同。契约 SPEC S3 写一句出处。理由：O1 已写「注入的输出校验函数」；JSON Schema 引擎的选择归装配与 Schema 领域，不归 MCP；没有校验函数时无法如实给出 `conforms`/`violates`，所以必填，不设缺省。成员测试用替身校验函数。
8. **时钟**：用 `McpPorts.clock`，缺省取本机时钟（契约 S3、已定事项 2）。删除 `createMcpCore` 的第三参 `{ now }` 与 `DiscoveryDependencies.now`。
9. **绕道的去留**（已定事项 26 的细化）：
   - 删除：`McpDiscovery`（用契约的 `ActionDiscovery`）、`RefreshRequest`、`internal/canonical.ts`（用契约根导出的 `sameJson`）、第三参 `{ now }`、`createMcpCore`、`McpCore`、`McpCoreOptions`。
   - `tests/doubles/values.ts` 按「是不是契约的值」拆：契约品牌值的样本（`ref`、`adoptionRevision`、`peerIdentity`、`binding`、`target`、`millis`、`generation`、`json`）改用契约 `./testing` 的样本构造器，缺的以可加改动加进 `mcp-contract/src/testing-values.ts`（已定事项 3 允许）；测试世界的身份（`Principal`、`alice`、`bob`、`mallory`、`home`、`away`、`principalKey`、`tenantOf`）不是契约样本，留在成员测试里，文件改名为 `tests/doubles/identities.ts`。
   - 已定事项 19 的「用契约的 `createScriptedTransportFactory` 代替 `tests/doubles/scripted-transport.ts`」收窄：判据是用例脚本化的是「对端说什么」还是「传输对象做什么」。连接表与生命周期的用例脚本化传输对象的行为（`open` 失败、`close` 的延迟、步序），保留成员的传输替身；调用口与任务操作的新用例脚本化对端的答复，用契约的 `createScriptedTransportFactory`。不为换替身改写已评审过的生命周期用例。
10. **装配与作用域的所有权**（来自 lifecycle 第 2 轮设计与实践评审第 3、4、7 条，归本闭包）：
    - 连接表自己创建任务作用域。`TableRuntime` 改为 `{ startBound; afterExit? }`。表对外只给只能 `spawn` 的视图（例如 `Pick<TaskScope, 'spawn'>`），`within` 的参数收窄到它。`exit` 只由 `closeAll` 调用。
    - 拆出不 spawn 的等待原语（例如 `waitAtMost(work, bound)`），`within` 等于它加上把工作交给作用域。等待别人拥有的工作时（`join` 等开始方的建连，`begin` 等别人在途的关闭或拆除）用不 spawn 的那个，删掉 `join` 里为避免重复记录而包的 thunk（lifecycle 第 2 轮设计与实践第 4 条）。
    - 一个内部装配函数建表与五个服务，`index.ts` 的 `createMcp` 与测试的 `tests/doubles/core.ts` 都调用它，不再照抄装配。
    - 公开的 `createMcp` 只收 `(ports, config)`。事后出口不对宿主开放（W4 由 Cordis 装配决定），缺省行为不变（lifecycle 第 2 轮冲突 4 的裁定）。
    - `invoke` 直接消费 `ensure` 的答复：加入方到期 `{ stage: 'connect', catalog: 'pending' }` 与排队到期 `{ stage: 'settings' }` 两种形状已在表一级的用例里钉住（lifecycle 第 3 次提交，`races.spec.ts`），本闭包在 `invoke` 用例里钉住它们的映射。
11. **公开根**：值导出只有 `createMcp` 与 `createInMemoryCatalogStore`。`public-entry.spec.ts` 按此改写。
12. **不实现**：清单容错（另一闭包）、任何传输实现（`mcp-host-local`）、在途表与任务表跨重启（S2 已知限制）、`list_changed` 订阅。

### 写范围
- `packages/mcp/mcp/src/` — 调用口、任务表、装配、绕道删除、作用域所有权
- `packages/mcp/mcp/tests/` — 新用例（`invoke.spec.ts`、`cancel.spec.ts`、`continue.spec.ts`、`tasks.spec.ts`，`core.spec.ts` 改为 `mcp.spec.ts`）、替身调整、`values.ts` 拆分与改名、`public-entry.spec.ts`、`index.md`、`README.md`
- `packages/mcp/mcp/SPEC.md` — 跟随实现；调用口一节、映射表、性质与证据；删去已退出的偏离表行
- `packages/mcp/mcp/README.md` — 只写用法、装配与指向 SPEC 的链接
- `packages/mcp/mcp/README_ZH.md` — 同上
- `packages/mcp/mcp/docs/` — 跟随实现，不复述 SPEC 的机制
- `packages/mcp/mcp/src/index.md` — 跟随导出
- `packages/mcp/mcp/verification/README.md` — 本闭包的变异记录
- `packages/mcp/mcp-contract/src/services.ts` — 只做第 4、5、7 条
- `packages/mcp/mcp-contract/src/testing-values.ts` — 只做第 9 条的样本构造器（可加）
- `packages/mcp/mcp-contract/src/testing.ts` — 导出第 9 条新增的样本构造器
- `packages/mcp/mcp-contract/tests/` — 对应用例与导出集合
- `packages/mcp/mcp-contract/SPEC.md` — 只改 S3（`checkOutput` 出处）、O1 的一句出处、`./testing` 样本构造器的列表；不碰 T 段、C1、未封闭项
- `tmp/closures/w3-mcp-call/`（新建） — 红灯、日志、探针

### 排除的调用方
- `packages/mcp/mcp-contract/src/{listing,catalog,wire,transport,readers,withheld,plain}.ts`、`testing-transport*.ts`、`testing-scripted-transport.ts`，契约 SPEC 的 T 段、C1 与未封闭项：`w3-mcp-host` 在改或之后的清单容错闭包要改。需要改它们时停下交回。
- `packages/mcp/mcp-host-local/`：`w3-mcp-host`。契约改动不能让它在本基线上编译失败（它不构造 `McpPorts`；若构造，停下交回）。
- `pnpm-lock.yaml`、各 `package.json` 的依赖段：只由 reduce 写。本闭包预计不需要新依赖。
- `packages/mcp/docs/`、`docs/domains/mcp/`：波末写回。

## 验收清单
每条写命令、预期与具名变异。失败时先在基线上复跑同一检查。

1. `pnpm turbo run build typecheck test --filter=@omne-harness/mcp --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp-host-local` 退出 0；`pnpm --filter @omne-harness/mcp run test:slow` 退出 0（生命周期探索器不受影响）。
2. MC3-4（`invoke.spec.ts`）：次序 1–9 每步的失败各一例，失败时占位撤销（同一关联键立即可再用）；R2 每个原因一例；第 2 条映射表每行一例；发出后 `signal` 触发得 `unknown`（`abandoned`）且 `cancelRequest` 被调用一次；结局经 `classifyOutcome` 与 `toContentBlocks`，`checkOutput` 只在声明了 `outputSchema` 且有结构化内容时调用。
3. MC3-5（`cancel.spec.ts`）：另一主体或另一租户用同一关联键 `cancel` 得 `unknown`；占位后、第 6 步之前取消使原调用答「未发出：`cancelled`」且 `call` 计数 0；第 3 条两种发出后的取消都得 `unknown`（`abandoned`）且 `cancelRequest` 恰好一次。
4. MC3-6（`continue.spec.ts`）：同代际完成；换代后「未发出：`unknown`」且新代际 `call` 计数 0；只带 `requestState` 的继续合法，发出的 `continuation` 不带 `inputResponses`。
5. MC3-7（`tasks.spec.ts`，按第 5、6 条）：发起者可用；非发起者与表外任务答同一 `unknown`（`toStrictEqual`）；复用连接不核采用与资格（采用与资格端口计数 0）；新建连接资格非 `granted` 得 `effect-unknown`（`no-connection`）且传输工厂 `open` 计数 0；`cancelTask` 同上；账户变了时不发请求；`no-answer` 得 `effect-unknown` 带同一子因；`error-answer`、`answer-malformed` 原样；`closeAll` 之后先判发起者再答 `effect-unknown`（`no-connection`）。
6. MC3-8（`mcp.spec.ts`）：`createMcp` 交出五个服务并共享一张连接表、一张在途表、一张任务表；配置不合法抛 `RangeError`；`ports.clock` 决定清单的 `acquiredAt`。下列 `git grep` 在成员 `src/` 与 `tests/` 为空：`createMcpCore`、`McpDiscovery`、`McpCoreOptions`、`internal/canonical`、`doubles/values`。
7. 作用域：表外拿不到 `exit`（类型用例或 `tsd` 式断言）；`within` 只收 `spawn` 视图。lifecycle 的 P7 用例原样通过。
8. 契约：`ContinueRequest.inputResponses` 可选、`McpPorts.checkOutput` 必填有类型用例；新增样本构造器有用例；契约原有用例原样通过，导出集合测试按新增改写。
9. 收尾门禁：`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run lint:deps`、`pnpm run format:check`、`pnpm run check:docs`、`pnpm run check:design`，`git ls-files --eol | grep -c w/crlf` 为 0。
10. `src/` 无 `as`（`as const` 除外）、无 `any`、无非空断言。

## 实施规格
- **行为只写在成员 SPEC 一处**。README 两种语言与 `docs/` 只写用法、装配、公开入口与指向 SPEC 条目的链接，不复述机制、次序、映射与失败形状；`verification/README.md` 只写证据与读数。理由：lifecycle 两轮表达评审的发现多半是同一机制在六处复述之间的漂移。README 里已有的生命周期复述不在本闭包删（波末写回），本闭包新增的内容不再复述。
- 契约条款：S1、S2、S3、S6、S8、R2、R5、O1–O6、D1–D5 全文；T6 只读（任务请求的形状归传输）。
- 波段已定事项 27–34 与本规格「reduce 已定的事」。两处冲突时以本规格为准，并在交回里列出。
- 在途表用已有的 `internal/in-flight.ts`（键：租户、主体文本、关联键）。任务表新建（键：租户、主体文本、持有、任务号 → 发起代际、连接键）。
- 命名账本：`createMcp`、`McpPorts.checkOutput`、`tests/doubles/identities.ts`；其余名字写进报告。

## 性质及证据义务
- 每条 MC3-4 到 MC3-8 的用例能对一个具体缺陷变红：报告列「用例 → 缺陷 → 变红证据」。证明变红时改源码、重建 `dist`、跑、还原、再重建（契约用例读 `dist`）。
- 隔离（L3）：在途表与任务表按租户与主体隔离；任务按连接键隔离账户。每条隔离各有一个让它失效的变异。
- 不重发：换代后的 `continueWithInput` 不发；发出后取消不重发；任务操作 `no-answer` 不重发。
- 每个异步副作用有等待上界或明确的拥有者：建连经 `ensure` 的时限；发出后的等待受调用方 `signal`；取消后不等对端。
- 并发用 deferred 排次序，不用 sleep；超时用注入的时限（`tests/doubles/bounds.ts` 的做法）。

## 施工计划
1. 读方法入口、契约条款与本规格；读 `internal/{table,entry,build,port,scope,in-flight,gate,guard}.ts`、`discovery.ts`、`index.ts`。
2. 契约的三处改动与样本构造器，先红后绿；成员先编译通过（`McpPorts.checkOutput` 进测试世界）。提交 1。
3. 装配与作用域所有权（第 10 条）；`createMcp` 取代 `createMcpCore`；时钟；删除绕道；`values.ts` 拆分。现有用例原样通过（只改导入与装配）。提交 2。
4. 在途表接线、`invoke`、`cancel`，MC3-4、MC3-5。提交 3。
5. `continueWithInput`，MC3-6。任务表与四个任务操作，MC3-7。提交 4。
6. 成员 SPEC（调用口一节、映射表、性质与证据、偏离表删行）、README 两种语言、`docs/`；门禁；交回。提交 5。
每个提交后可以交回；遇停止条件立即交回。红灯输出存 `tmp/closures/w3-mcp-call/red/`。提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。

## 自主范围与动作授权
允许：写范围内改文件；运行三个 MCP 成员的构建与测试、仓库检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增或升级依赖、改 T 段与 C1。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call。并行的还有 `w3-mcp-host` 的写者（另一棵树）与 reduce 本会话。派发者唯一合回。不跑 `admission`、不跑仓库全量测试、不跑差分变异。本机 8 核：成员测试用 `VITEST_MAX_WORKERS=4`；慢层只在第 6 步跑一次。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 波段规格：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/mcp/spec.md（已定事项 1–3、26–34，判据 MC3-4–MC3-8）。
- 上下文地图（只读调研，带 `文件:行`）：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call-context.md。它基于 lifecycle 的 `60124023657a`；行号在合入后的基线上可能偏移。
- lifecycle 第 2 轮评审记录（第 10 条的来源）：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-lifecycle-r2.md。
- 契约：`packages/mcp/mcp-contract/SPEC.md`；成员：`packages/mcp/mcp/SPEC.md`（MC-1–MC-15、P1–P8）。
- 必须加载：ub-mode；pstack:typescript-best-practices；写 SPEC 与 README 时 asd-ste100。

## 当前认知
- 已确认：`ensure` 成功时交出 `transport`、`generation`、`catalogKey`、`adoptionRevision`、`bound`，不交连接键（用契约 `connectionKeyOf` 算）。`InFlightCalls` 已有 `reserve`、`markSent`、`markEnded`、`release`、`cancel`、`requestIdOf`，还没有 `src` 消费者。契约 `createScriptedTransportFactory` 能脚本化 `tools/call` 的完成、动作错误、`input_required`、任务结局，以及 `tasks/get`、`tasks/update`、`tasks/cancel`。
- 假设：`AdmittedEndpoint` 与 `admitForUse` 足以承担调用口的关口（S1）；任务操作的新建连接经同一关口。
- 未知：已知动作的可用标记在清单记录里的确切读法（写者读 `catalog.ts` 的 `KnownAction`）。

## 返回与恢复
每个提交号；每条验收的命令与结果；「用例 → 缺陷 → 变红证据」表；自定裁定与理由；写者声称的结构性改动清单（reduce 逐条 `grep` 核实）；与本规格或波段规格冲突之处；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-call/`。

## 已知会受影响的现有用例
- `packages/mcp/mcp/tests/public-entry.spec.ts`、`core.spec.ts`（改为 `mcp.spec.ts`）、全部导入 `doubles/values.ts` 的用例（只改导入）。
- `packages/mcp/mcp-contract/tests/public-entry.spec.ts` 与 `./testing` 的导出集合。

## 停止条件
- 某项要求只能靠改排除范围内的文件实现。
- 契约条款之间、或条款与本规格之间有冲突，且影响实现（列出原句交回）。
- 同一用例连试三种做法仍红。
- 现有生命周期用例因第 10 条变红且三种做法修不好。

## 追加记录
- 2026-11-05 派发前：工作树由 `worktree-cli.ts prepare-closures` 建好（基线 `b2ba7dc89`，安装、投影、`mcp` 与 `mcp-contract` 构建都成功），署名用 `git config --worktree`。简报检查退出 0。余下的 `caller-outside-scope` 警告来自正文里的通用词与全仓库同名标识符的匹配，不是本闭包的调用方。唯一的真信号是 `outputCheck` 已是契约 `classify.ts` 的私有函数名：端口字段因此定名 `checkOutput`，与 `ClassifyContext.checkOutput` 同名。
- 2026-11-05 13:30 规格缺口登记（归属：规格，派发者漏写；不追加给在途写者）：本规格只要求生命周期探索器不受影响，没有把调用口新增的并发纳入形式化验证。负责人要求新代码的并发都要在形式化验证的守护之内。处置：本闭包交回后另开 `w3-mcp-call-model`（验证设施，顶档），与本闭包的评审并行：扩展 `tests/model` 的有界穷举探索器（操作加 `invoke`、`continueWithInput`、`cancel`、调用方中止与任务操作；端口加传输的 `call`、`cancelRequest` 与应答），新增调用口的性质（发出前取消则 `call` 计数 0；`cancelRequest` 只对已发出的调用且至多一次；在途表每个占位恰好结束一次，未发出的立即可再用；在途表与任务表按租户与主体隔离、任务按连接键隔离账户；每个 `invoke` 在调用方中止或取消之后有界答复）；在 `verification/models/` 加对应的 TLA+ 模型与能让每条性质变红的负控配置，并写模型与实现的映射。模型找到的缺陷与评审发现一起进修复轮。
