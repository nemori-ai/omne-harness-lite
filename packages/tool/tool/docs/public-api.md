# tool 公开接口

根入口 `.` 由 [src/index.ts](../src/index.ts) 定义，源码是唯一定义，本页不手写签名。

- [independent-scope.ts](../src/independent-scope.ts)：`createIndependentToolScope`（G2）。它检查 `IndependentToolScopeInput`，返回 `ToolExecutionScope` 或 `{ field, reason }` 失败。`field` 是被拒绝的字段路径，例如 `limits.authorBufferBytes`。`reason` 是 `type`、`range`、`missing`、`accessor` 或 `unknown-field`。作用域内 `emit`、`wait` 与 `finish` 的失败是 `ToolPrimitiveFailure` 值。各种情况对应的种类见 [SPEC 的失败解释](../SPEC.md#失败解释)。
- [execute-tool.ts](../src/execute-tool.ts)：`executeTool` 与其失败类型 `ExecuteToolFailure`。`effect` 为 `not-started` 时作者没有运行。`effect` 为 `unknown` 时作者运行过。
- [construction.ts](../src/construction.ts)：`ToolDependencies` 与 `ToolConfiguration`，即 `createToolRuntime` 的构造形状。`ToolDependencies` 显式注入 invocationIdentities、operationIdentities 与 sourceIssuer；宿主把 instance 传给 driver.run。`ToolConfiguration.queueCapacity` 是一个 FIFO key 下尚未释放的调用数上限；可选的 `ToolConfiguration.driverStepsPerRun` 是推进协程一次运行的步数上限，缺省 16；可选的 `ToolConfiguration.driverRetryDelayMs` 是因记录仓或端口失败结束、环境答 `pending` 或 `unknown`、或用尽步数而没有提交或认回任何一步的运行再被运行前的等待毫秒数（SPEC 第 23 条），缺省 1000，给出时是 1 到 2147483647 的整数；`ToolLedgerConfiguration` 是账本读取的配置部分（`resultPageBytes`、`ledgerCommitAttempts`、`queueCapacity`）；`ToolLedgerAdmissions` 是账本的 admit 入口，回复状态与 `recovered`，runtime 经 `ToolDependencies.admissions` 使用它；`ToolLedgerQueues` 是账本的队列维护入口，`reconcile` 为一个排队的调用对它的 FIFO key 对账（`QueueReconciliation` 是答案），推进协程经 `ToolDependencies.queues` 使用它。配置检查在 [configuration.ts](../src/configuration.ts)。
- [ledger.ts](../src/ledger.ts)：`createToolLedger(store, guards, clock, configuration)`（签名取自 G1，返回值含 G1 记载的 `queues`）返回 `{ commands, reads, admissions, queues }`。`commands` 与 `reads` 是契约的 `ToolCommands` 与 `ToolReads`。`toolLedgerAdoption` 是它在 `unsupported` 答复中的采用。配置超出范围时抛 `TypeError`。已实现的操作与各种拒绝见 [SPEC 的受理账本](../SPEC.md#受理账本怎样满足-p01p02p08-与-p09)。
- [ledger-store.ts](../src/ledger-store.ts)：记录仓端口 `ToolLedgerStore` 与它的事务域（`call`、`queue`、`host`）、记录、写入、读取和提交结果类型；`recordKey` 给出记录在域内的唯一键。存储提供者实现这个端口。宿主提供者把自己的耐久记录放在 `host` 域，记录类型是 `HostRecord`。
- [ledger-guards.ts](../src/ledger-guards.ts)：`ToolLedgerGuards`，即账本的受信快照：`ToolAccessGuard`、`ToolSourceGuard`、按范围拥有者声明的授予核验器 `ToolGrantVerifier`、启动守卫 `ToolStartGuard`、文本结果工厂、结果政策与 `ToolLedgerBudgets`。
- [boundary.ts](../src/boundary.ts) 的 `isTenantShape` 与 [evidence.ts](../src/evidence.ts) 的 `canonicalDigest`：宿主提供者在 `host` 域里用与账本相同的租户形状检查与规范摘要。
- [runtime.ts](../src/runtime.ts)：`createToolRuntime(dependencies, configuration)`（G8）返回契约的 `ToolProvider`，并在构造时把推进协程装到 `instances.install`；`toolRuntimeAdoption` 是它在 `unsupported` 答复中的采用。配置超出范围、缺端口时抛 `TypeError`。

`./testing` 入口由 [src/testing.ts](../src/testing.ts) 定义：`createMemoryToolLedgerStore` 是声明 `durability: 'none'` 的非耐久记录仓，带读取与提交的故障注入（含在途后落盘的 `unknown-delayed` 与 `landDelayed`），只供测试。故障种类见 [SPEC 第 18 条](../SPEC.md#18-非耐久记录仓testing)。`createTestToolDependencies` 与其输入、返回和手柄类型由 [testing.ts](../src/testing.ts) 拥有。工厂只组装既有七个契约替身与账本，显式调用方输入和固定块、环境类型见 [testing 使用说明](../README_ZH.md#testing-入口)。公开类型归契约包的 [author-context.ts](../../tool-contract/src/author-context.ts)、[execution.ts](../../tool-contract/src/execution.ts) 与 [ports.ts](../../tool-contract/src/ports.ts)。目录职责见 [README](README.md)。

普通 runtime 只以 invoke 发起，以 queries、commands、instances 和 content 持有窄操作。调用引用和操作引用的 codec 在[契约 reference.ts](../../tool-contract/src/reference.ts)。每次引用访问先核结构和租户，再进入原端口核当前主体。没有公开 admit 兼容入口。普通命令不含 acceptDecision/acceptResource。

`./testing` 的 createTestInvocationSource 提供配对 issuer 与 guard，保存完整绑定并拒绝主体、租户、身份、目标、consumer、scope、payload 或来源变更。createTestToolIdentities 提供测试计数器及显式计划身份。二者只供非耐久测试，不能装配成生产签发器或宿主。

普通 releaseDelivery 成功返回 `released` 与生产者原耐久回执，不附本次操作引用。首次释放和已释放后的重入同形，后者不再写入。`commit-unknown` 保留本次操作引用供 queryOperation 查询。可靠否定只排除这次操作，不能推出交付仍 pending。可靠否定后可明确再次释放以取得原回执，未知或不可读时不能自动重发。lookup 按原 admission 定位，返回当前权威 ToolState，可按当前 result 及 delivery 中的交付号与 consumer 认回已有释放。invoke 的 state 是受理时回执。readProcess 未支持，ResultPage 不含 DeliveryState。
