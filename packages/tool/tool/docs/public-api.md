# tool 公开接口

根入口 `.` 由 [src/index.ts](../src/index.ts) 定义，源码是唯一定义，本页不手写签名。

- [independent-scope.ts](../src/independent-scope.ts)：`createIndependentToolScope`（G2）。它检查 `IndependentToolScopeInput`，返回 `ToolExecutionScope` 或 `{ field, reason }` 失败。`field` 是被拒绝的字段路径，例如 `limits.authorBufferBytes`。`reason` 是 `type`、`range`、`missing`、`accessor` 或 `unknown-field`。作用域内 `emit`、`wait` 与 `finish` 的失败是 `ToolPrimitiveFailure` 值。各种情况对应的种类见 [SPEC 的失败解释](../SPEC.md#失败解释)。
- [execute-tool.ts](../src/execute-tool.ts)：`executeTool` 与其失败类型 `ExecuteToolFailure`。`effect` 为 `not-started` 时作者没有运行。`effect` 为 `unknown` 时作者运行过。
- [construction.ts](../src/construction.ts)：`ToolDependencies` 与 `ToolConfiguration`，即 `createToolRuntime` 的构造形状。`ToolDependencies` 显式注入 operationIdentities、sourceIssuer.resolve 与同账本的 facts；宿主把 instance 传给 driver.run。`ToolConfiguration.queueCapacity` 是一个 FIFO key 下尚未释放的调用数上限；可选的 `ToolConfiguration.driverStepsPerRun` 是推进协程一次运行的步数上限，缺省 16；可选的 `ToolConfiguration.driverRetryDelayMs` 是因记录仓或端口失败结束、环境答 `pending` 或 `unknown`、或用尽步数而没有提交或认回任何一步的运行再被运行前的等待毫秒数（SPEC 第 23 条），缺省 1000，给出时是 1 到 2147483647 的整数；`ToolLedgerConfiguration` 是账本读取的配置部分（`resultPageBytes`、`ledgerCommitAttempts`、`queueCapacity`）；`ToolLedgerAdmissions` 是账本的 admit 入口，回复状态与 `recovered`，runtime 经 `ToolDependencies.admissions` 使用它；`ToolLedgerQueues` 是账本的队列维护入口，`reconcile` 为一个排队的调用对它的 FIFO key 对账（`QueueReconciliation` 是答案），推进协程经 `ToolDependencies.queues` 使用它。配置检查在 [configuration.ts](../src/configuration.ts)。
- [ledger.ts](../src/ledger.ts)：`createToolLedger(store, guards, clock, configuration, ports)`（签名取自 G1，返回值含 G1 记载的 `queues`）返回 `{ commands, reads, admissions, queues, facts }`。第五参数 `ToolLedgerPorts<P>` 从 construction.ts 导出，显式注入 `custody.retainResult`、原环境的 `releaseInspection.inspectRelease` 与 `content` 字节读口或 `null`。`commands` 与 `reads` 是契约的 `ToolCommands` 与 `ToolReads`。`toolLedgerAdoption` 是它在 `unsupported` 答复中的采用。配置超出范围时抛 `TypeError`。已实现的操作与各种拒绝见 [SPEC 的受理账本](../SPEC.md#受理账本怎样满足-p01p02p08-与-p09)。
- [ledger-store.ts](../src/ledger-store.ts)：记录仓端口 `ToolLedgerStore` 与它的事务域（`call`、`queue`、`host`）、记录、写入、读取和提交结果类型；`recordKey` 给出记录在域内的唯一键。存储提供者实现这个端口。宿主提供者把自己的耐久记录放在 `host` 域，记录类型是 `HostRecord`。
- [ledger-guards.ts](../src/ledger-guards.ts)：`ToolLedgerGuards`，即账本的受信快照：`ToolAccessGuard`、`ToolSourceGuard`、必填来源确认守卫 `ToolFactAcknowledgementGuard`、按范围拥有者声明的授予核验器 `ToolGrantVerifier`、启动守卫 `ToolStartGuard`、文本结果工厂、结果政策与 `ToolLedgerBudgets`。
- [boundary.ts](../src/boundary.ts) 的 `isTenantShape` 与 [evidence.ts](../src/evidence.ts) 的 `canonicalDigest`：宿主提供者在 `host` 域里用与账本相同的租户形状检查与规范摘要。
- [runtime.ts](../src/runtime.ts)：`createToolRuntime(dependencies, configuration)`（G8）返回契约的 `ToolProvider`，并在构造时把推进协程装到 `instances.install`；`toolRuntimeAdoption` 是它在 `unsupported` 答复中的采用。配置超出范围、缺端口时抛 `TypeError`。

`./testing` 入口由 [src/testing.ts](../src/testing.ts) 定义：`createMemoryToolLedgerStore` 是声明 `durability: 'none'` 的非耐久记录仓，带读取与提交的故障注入（含在途后落盘的 `unknown-delayed` 与 `landDelayed`），只供测试。故障种类见 [SPEC 第 18 条](../SPEC.md#18-非耐久记录仓testing)。`createTestToolDependencies` 与其输入、返回和手柄类型由 [testing.ts](../src/testing.ts) 拥有。工厂只组装既有七个契约替身与账本，显式调用方输入和固定块、环境类型见 [testing 使用说明](../README_ZH.md#testing-入口)。公开类型归契约包的 [author-context.ts](../../tool-contract/src/author-context.ts)、[execution.ts](../../tool-contract/src/execution.ts) 与 [ports.ts](../../tool-contract/src/ports.ts)。目录职责见 [README](README.md)。

普通 runtime 只以 invoke 发起，以 queries、commands、instances、observation 和 content 持有窄操作。`instances.current` 与 `observation.observe` 由 [stream-facade.ts](../src/stream-facade.ts) 实现，行为见 [SPEC 的运行时观察门面](../SPEC.md#运行时观察门面)。调用引用和操作引用的 codec 在[契约 reference.ts](../../tool-contract/src/reference.ts)。每次引用访问先核结构和租户，再进入原端口核当前主体。没有公开 admit 兼容入口。普通命令不含 acceptDecision/acceptResource。

`./testing` 的 createTestInvocationSource 提供配对 issuer 与 guard，保存完整绑定并拒绝主体、租户、身份、目标、consumer、scope、payload 或来源变更。createTestToolIdentities 只提供操作与实例的测试计数身份。二者只供非耐久测试，不能装配成生产签发器或宿主。

普通 releaseDelivery 成功返回 `released` 与生产者原耐久回执，不附本次操作引用。首次释放和已释放后的重入同形，后者不再写入。`commit-unknown` 保留本次操作引用供 queryOperation 查询。可靠否定只排除这次操作，不能推出交付仍 pending。可靠否定后可明确再次释放以取得原回执，未知或不可读时不能自动重发。lookup 按原 admission 定位，返回当前权威 ToolState，可按当前 result 及 delivery 中的交付号与 consumer 认回已有释放。invoke 的 state 是受理时回执。readProcess 未支持，ResultPage 不含 DeliveryState。

- [ledger-guards.ts](../src/ledger-guards.ts)：`ToolInvokeAuthority` 的当前 consumer 资格与稳定主体比较，装配者将同一实例交来源及配对 guard。`createTestInvocationSource({ authority, snapshotPrincipal })` 必须显式提供资格与语义快照，无默认授权或通用主体复制。来源的 durability 为 none。控制最小门面已转发，真实 ledger 仍 unsupported。

[testing-source.ts](../src/testing-source.ts)的同步 snapshotPrincipal 在来源首次 await 前固定可认证主体；bindings 返回隔离诊断副本。可选同步 beforeIssue 在 reservation 保存后注入签发故障，抛错保留原身份返回 issuance-unknown，issued 不再运行钩子。精确行为见 [实现 SPEC](../SPEC.md#普通调用重入的实现范围)。

- [fact-acknowledgements.ts](../src/fact-acknowledgements.ts)：`createToolFactAcknowledgementGuard(bindings)` 配对同一 runtime 的恢复入口。来源确认的核验顺序与未知重入见 [SPEC](../SPEC.md#24-原执行事实保管p05p08)。

`facts` 是实现包的 ToolLedgerFacts 读口，SavedFact 保留原 start、source、event、cursor 与完整 fact。它凭精确 event evidence 和当前 recover 资格读取，供 settle 消费者恢复原 final。`preserveResult` 使用 WriteContext，主动调用独立保管后再提交原结果与后继责任。`planRelease`、`recordRelease` 与受限 `recordTask(blocked)` 使用 Mutation，不含 caller expected。完整条件、未知和支持边界见 [收场规则](../SPEC.md#26-原结果收场与释放责任)。普通 runtime 不暴露事实写入或此恢复读口。自动原事实推进、信号寿命和恢复缺口见 [SPEC 第 25 条](../SPEC.md#25-原事实受管推进)。


- [ledger-content.ts](../src/ledger-content.ts) 实现结果与附件关联、IO 前后资格及页面核验。行为与 provider 证明责任见 [内容读取](../SPEC.md#27-固定结果与内容读取)。
- [testing.ts](../src/testing.ts) 经 testing 入口导出 `createMemoryToolContent`、`MemoryToolContent` 与 `MemoryContentFault`。`createTestToolDependencies` 将它装配为 `doubles.content` 并复用其 custody。内存提供者只拥有字节及游标，不维护第二份结果账本。


`ToolAccessGuard.qualify` 的 `read-raw-content` 表示原件字节操作，须在一个可信权限事实判定点检查两项基础权限与主体/租户/call 范围。它不是可单独授予的新许可位。guard 无一致视图时答 unavailable。raw 元数据继续使用 read-raw；普通附件继续使用 read-content。精确失败与返回时序由 [SPEC 第 27 条](../SPEC.md#27-固定结果与内容读取)拥有。

- [tools.ts](../src/tools.ts) 从根入口导出 createTools、Tools、ToolsAccess、ToolsOptions 和窄读依赖 ToolsReadRuntime。`implementation` 是 Tools 元工具的实现侧 `ToolImplementation`（[RFC-0012](../../../../docs/rfcs/RFC-0012-tool-dynamics.md)），交绑定提供者登记；`definition` 是以元工具的官方治理（常驻、不可编程、无必需能力，版本为 `toolsAdoption`）经 `deriveDefinition` 派生的 `ToolDefinition`。present 交首屏模型结果，readReply 是收齐新元调用回应的受信方法。签名由源码拥有，完整行为与预算见 [SPEC 第 28 条](../SPEC.md#28-tools-固定结果适配器)。


Tools 的基本调用顺序和 JSON 参数示例见 [README](../README.md#model-result-retrieval)。宿主须对齐 runtime 入站参数限制与 ToolsOptions.arguments，固定当前身份和每次新调用的消费位置，再于 readReply 完整成功后调用 P14。结果身份为调用引用与结果版本的组合。模型无需获得这些宿主能力，投影与实际 help 足以完成接续。

## Ledger store conformance (`./testing`)

`ToolLedgerStoreFixture` and `ToolLedgerStoreControls` are defined in [testing-ledger-store-types.ts](../src/testing-ledger-store-types.ts). The fixture fixes `ContentBlock`, supplies only a store and independent optional fault handles, and has a consumer-owned `close`. It supplies no business oracle. The root entry continues to own `ToolLedgerStore` and its record types.

`toolLedgerStoreConformance()` returns the G1/G6 store cases. `toolLedgerStoreCompositionConformance()` returns the P01 cases through a real Tool ledger. Both return the existing `ConformanceCase<ToolLedgerStoreFixture>[]` protocol from `tool-contract/testing`. `runConformanceCase`, `NotApplicable` and verdicts remain in that package. This entry does not re-export them.

`createMemoryToolLedgerStoreFixture()` returns a new non-durable positive control with every handle. Each case needs its own fixture. Consumers run the case through the existing runner, count `passed` and `not-applicable` separately, and call `close` even after failure. A missing handle is detected before assembly, seed or store IO. An offered broken handle or any other exception fails the case.

The controls arm the next corresponding IO: `readUnavailable`, `commitUnavailable`, `unknownApplied`, `unknownDropped` and `throwApplied`. `delayed.arm` holds a commit with an unknown reply. `delayed.land` resolves after all held commits finish their original expected-revision check. `rejectedHostValue` returns a value that this provider explicitly refuses to encode. The probe accepts an exception, `unknown` or `unavailable`, then requires an unchanged complete snapshot and a successful equivalent legal batch. It does not define a common encoding rejection protocol. The probe uses a matching expected revision without competing commits. Any `committed` or `conflict` reply fails the probe.

The cases have stable `name` and `clause` fields. Direct consumption and the evidence limits are described in the [usage guide](../README.md#ledger-store-conformance). This adds a testing API in the G6 owner package. No existing consumer requires migration.


## Tool 访问守卫的替身与套件（`./testing`）

[testing-access.ts](../src/testing-access.ts) 给出 `ToolAccessGuard` 的表替身与提供者套件。依据是 M2 冻结批 RD-TOOLHEAD r2。它们是 `./testing` 的可加导出，不改 `ToolAccessGuard` 的形状。

- `createTableToolAccess({ principalKey, allow })` 按显式的允许表 `ToolAccessRule[]` 作答，返回 `TableToolAccess`。判定顺序：处于 `fail` 状态时答 `unavailable`。租户不是 legal-identity 铸出的值时答 `denied`，原因 `forged-tenant`。表里有一条规则的主体键、租户文本、动作与调用都匹配时答 `allowed`。否则答 `denied`，原因 `no-rule`。没有默认放行，另一租户的请求因租户不同找不到规则。规则省略 `call` 时匹配该租户的任意调用，`call: null` 只匹配不带调用的请求（`invalidate`）。`read-raw-content` 只认同名规则，一次查表就是一个判定点，不拼两个基础权限。
- `start` 视图在结构上满足 tool-host-local 的 `StartCoordinatorAccess<P>`，与 `guard` 共用同一张表和同一个 `fail` 状态。tool 不依赖 tool-host-local，所以这里只给结构相容的类型 `TableStartAccess<P>`。可赋值的类型断言由 tool-host-local 的测试承担。
- 替身声明 `durability: 'none'`，不能装配进生产。生产代码不导入 `./testing`。
- `toolAccessGuardConformance()` 是每个守卫提供者都要通过的五条用例，夹具类型是 `ToolAccessGuardFixture<P>`：`allowed` 答 `allowed`；`unlisted` 答 `denied`；`otherTenant`（与 `allowed` 只差租户）答 `denied`；伪造租户答 `denied`；依赖失败（夹具的 `breakDependency`）答 `unavailable`，不答 `allowed`。夹具没有 `breakDependency` 时最后一条报告不适用。替身先跑这个套件，应用的真实守卫适配接上后跑同一套件。

## 原环境分配的首次采用

[driver.ts](../src/driver.ts) 消费 [P03](../../tool-contract/SPEC.md#p03-环境准备和释放) 的 allocated 事实。它先比对完整原准备与证据形状，再用同一适配器和原输入追加最多一次 prepare。allocated、pending、unknown 或不可用均保留准备任务，后续运行查询原事实。只有 prepared 写准备完成并进入执行队列。`environmentOf` 只重连 prepared，不通过 allocated 领取租约。原获取与无 E 时的结清仍归适配器，分配证据不能替代独立输出保管依据。

验证使用公开 runtime/ledger 和有独立记录的非耐久环境替身，见 [driver-allocation.spec.ts](../tests/driver-allocation.spec.ts)。没有真实 EE 适配器或跨进程恢复证据，U16 丢失全部原事实的缺口保持。
