# tool 源码

- [index.ts](index.ts) 是根入口 `.`，不导入 Cordis。它导出 `createIndependentToolScope`、`executeTool`、`createToolLedger`、`createToolRuntime`、记录仓端口类型、guard 类型与构造形状类型。
- [independent-scope.ts](independent-scope.ts) 实现独立执行作用域（G2）：输出账、等待历史、取消与收尾。作者拿到的 `context` 与调用者拿到的 `scope` 都在这里构造。
- [execute-tool.ts](execute-tool.ts) 实现执行包装器 `executeTool`：核对作用域，运行作者，再调用 `finish`。
- [limits.ts](limits.ts) 是 `ToolAuthorLimits` 的闭合检查，两个入口共用。
- [json-tree.ts](json-tree.ts) 用 json-text 的 `judgeJsonValue` 检查等待请求的标签 JSON 树并取得冻结副本，再给出规范文本与字节数。树的判定规则归 json-text；写文本的遍历用显式栈，超过字节上限即停止。字节上限也限定检查的工作量：每个被访问的节点至少写出一个字节，所以检查最多访问 `maxBytes` 次（不超过节点上限 1 000 000），访问更多的树文本必然超过上限，判为 `too-large`，不再读完整棵树；只有 `maxBytes` 不小于节点上限时才可能得到 `budget`。
- [construction.ts](construction.ts) 给出 runtime 工厂的构造形状 `ToolDependencies` 与 `ToolConfiguration`，以及账本读取的 `ToolLedgerConfiguration` 与账本的 admit 入口 `ToolLedgerAdmissions`、队列维护入口 `ToolLedgerQueues`。
- [configuration.ts](configuration.ts) 在构造时检查配置：runtime 检查全部字段，账本检查它读取的三个字段（`resultPageBytes`、`ledgerCommitAttempts`、`queueCapacity`）。可选的 `driverStepsPerRun`（推进协程一次运行的步数，缺省 16）与 `driverRetryDelayMs`（因记录仓或端口失败结束、环境答 `pending` 或 `unknown`、或用尽步数而没有提交或认回任何一步的运行再被运行前的等待，缺省 1000，1 到 2147483647 的整数）由同名函数给出。超出范围抛 `TypeError`。
- [ledger-store.ts](ledger-store.ts) 定义记录仓端口 `ToolLedgerStore`（G1）：事务域、记录（含否定答案的 `exclusion` 围栏与队列域的墓碑 `queue-release`）、写入、读取与提交结果，以及记录键。
- [ledger-guards.ts](ledger-guards.ts) 定义账本的受信快照 `ToolLedgerGuards`：资格守卫（同时证明租户是铸造的值）、来源守卫、文本结果工厂、结果政策与参数解析预算。
- [boundary.ts](boundary.ts) 是命令与读取的边界检查：租户形状、品牌身份与写入上下文。
- [evidence.ts](evidence.ts) 铸造规范 JSON 摘要、耐久证据、修订号与结果/交付身份。每种证据的定位值都含租户与调用。
- [ledger-decider.ts](ledger-decider.ts) 是纯决定器：快照、受理决定（P01、P02）与交付解除决定（P08）。
- [ledger-start.ts](ledger-start.ts) 是到启动为止的纯决定器：队列域（序号、队首与名额、带释放依据的释放与墓碑）与调用域（计划、环境、入队、启动意图、启动拒绝）。
- [ledger-queue.ts](ledger-queue.ts) 是队列维护入口：等待者对本 key 对账，不加围栏地读前序调用的调用域，只删除有释放依据的条目，报告排在等待者前面或持有名额、仍欠队列一步的调用。
- [driver.ts](driver.ts) 是推进协程：按阶段与待办做一步，并在一次运行结束后决定是否再运行（有进展的步数用尽、没有进展或失败后的延迟、等待者对账）。
- [ledger-reads.ts](ledger-reads.ts) 是快照上的读取投影：lookup、操作认回、结果分页与账目。
- [ledger-exclusion.ts](ledger-exclusion.ts) 是按操作号定键的命令的排除规则：第一次读取之后给出的否定答案，以及推进协程据以重做的排除回复。
- [ledger.ts](ledger.ts) 实现 `createToolLedger`：每个入口做边界、资格、读取、决定与按修订号提交；否定的查询答案先提交排除围栏（一条 `exclusion` 记录），被围栏排除的在途命令在重试时停止；后续增量的操作回复具名 `unsupported`（原因写操作名与增量名）。
- [runtime.ts](runtime.ts) 实现 `createToolRuntime`：构造时检查配置与端口，逻辑终局路径的操作接到账本端口，其余回复具名 `unsupported`。
- [testing.ts](testing.ts) 是 `./testing` 入口：非耐久记录仓 `createMemoryToolLedgerStore`，带故障注入。
- 本包经 `@omne-harness/tool-contract` 取得公共类型，不复制它们。`Outcome` 来自 `@omne-harness/operation-result`。

实现选择见 [SPEC](../SPEC.md)。文档导航见 [index](index.md)。
