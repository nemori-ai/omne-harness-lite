# @omne-harness/tool

[English](README.md)

不含 Cordis 的 Tool 领域实现。根入口导出独立执行：`createIndependentToolScope` 用本地接收者、显式上限和内存等待历史构造执行作用域，`executeTool` 在这样的作用域里运行一个执行者。根入口还导出账本工厂 `createToolLedger`、记录仓端口 `ToolLedgerStore` 与受信快照 `ToolLedgerGuards`，runtime 工厂 `createToolRuntime` 及其构造形状 `ToolDependencies` 与 `ToolConfiguration`；`./testing` 入口导出非耐久记录仓 `createMemoryToolLedgerStore` 与依赖装配工厂 `createTestToolDependencies`。

## 职责与状态

本包实现 `@omne-harness/tool-contract` 的契约。它管理并发、等待、取消与状态，两个实现在这里可以不同，所以不属于契约。本包不依赖 Cordis，独立程序不装 Cordis 也能执行工具。独立执行已实现。runtime 实现了托管路径的一部分。下一节列出五档支持范围。准确的支持范围见 [SPEC.md](SPEC.md#当前范围)。

## 支持范围

检出范围和跨包总表见[工具执行组的支持范围](../README.md#支持范围)。本节只写本包的部分。验证范围只说明测试核对了什么，不说明测试范围之外的行为已成立。

| 档 | 本包的状态 | 入口 | 验证范围 |
| --- | --- | --- | --- |
| 公开类型已导出 | 已导出：构造形状 `ToolDependencies` 与 `ToolConfiguration` 及其周边的账本形状，记录仓端口 `ToolLedgerStore` 与它的记录类型，受信快照 `ToolLedgerGuards`，`ExecuteToolFailure`，以及宿主提供者用的 `recordKey`、`isTenantShape` 与 `canonicalDigest` | 根入口 | `tests/public-entry.spec.ts` 核对根导出、导入图、清单依赖与 Cordis 路径。`*.spec-d.ts` 核对签名 |
| 纯契约函数已实现 | 本包没有。契约函数在 `tool-contract` | 无 | 无 |
| 独立执行已实现 | `createIndependentToolScope` 与 `executeTool`。作用域用本地接收者、显式上限和内存等待历史。回执只有 `local` | 根入口 | 作用域与包装器的 P11 规则，用可控的接收者与提供者替身核对。没有真实执行环境，不含 Cordis |
| runtime 已实现的路径 | `createToolLedger` 与 `createToolRuntime`。内部账本按操作身份幂等受理。调用已知不可用的工具，或参数完整但非法，不进入环境或执行者就收场。`queries.lookup` 与 `queries.queryOperation` 查到它，`readResult` 分页读取，`releaseDelivery` 按两条交接路径解除交付，`account` 查账。真实工具的调用，经 `invoke` 分配身份、绑定来源并受理后由推进协程带到启动记录：环境准备、在调用方固定的范围与上限内按 FIFO 排队、启动守卫、启动围栏与 live-only 绑定的 `start`。绑定失败或抛错先核实原围栏，只有永久排除确认后才形成不可用终局。未知回执查询原绑定，保留启动待办与名额。前台启动通过装配传入的 `ToolClock.begin` 开启计时段。启动前被拒绝的调用以 `unavailable` 收场，`effect` 为 `not-started`。`inspect` 转给装配传入的 Catalog 端口。本包没有 Catalog 提供者。driver 自动保管原 live 的 process/final 并确认来源，支持信号取消和 cursor 续接，并从已存原 final 收场、修复名额释放及保留异常输出责任。环境清理支持计划和报告核验 | 根入口。`./testing` 给非耐久记录仓与显式依赖装配 | 托管路径测试消费契约源码入口，在非耐久记录仓上运行，环境、启动授权与时钟用替身。受信测试桥先保存胶囊证据、consume，再调用契约内存 executor。方法尝试、唯一 acceptance 与实际 launch 分别计数。`tool-host-local` 用真实的本地启动协调器运行本 runtime。只有一个进程。耐久性没有覆盖 |
| 尚未交付的宿主与提供者 | 真实环境 release 自动驱动、完整异常源恢复。控制、完整计时（经过时间、期限、暂停）、等待、过程观察、恢复、排空与交接。耐久记录仓（[#280](https://github.com/nemori-ai/omne-harness-lite/issues/280)）。真实执行环境（[#278](https://github.com/nemori-ai/omne-harness-lite/issues/278)）。宿主时钟、绑定登记表与 Catalog。Cordis 插件 | 无 | 无 |

已启动调用在原 final 独立保管及收场提交前保持名额。driver 随后按原操作修复 queue 释放；原调用成功回执本身不证明 queue 待办已经关闭。账本受信入口 `commands.receiveFacts` 已支持 process/final 保管。账本通过 `commands.recordFactAcknowledgement` 保存来源确认。runtime 推进协程自动续读原事实并确认来源；已支持名额释放，环境资源释放仍是独立责任。同租户、完整 consumer 与固定请求再次 `invoke` 认回原引用。原回执与当前状态分开，重入沿原调用与 start 推进。

绑定失败通过独立的 `/start-failed` 操作回执认回。已读到 committed 标记的协程不再调用 start，当前协程也记住尚未确认的失败并重试原标记。

若标记真正提交前发生崩溃，失败观察可能丢失。只有合规 authority 排除了旧 ticket 与延迟请求，且没有永久拒绝时，原 start 才能重新核权，取得新 permit 并形成首次受理。此窗口可以再次调用 RPC 方法，但不重放已受理的执行效果。

另一协程持旧否定读时，即使标记随后提交，仍可能再次进入 start 方法。authority 排序 consume 与永久 exclude：consume 先成立则认回原 running 并保留名额，exclude 先成立则禁止新的 acceptance 与 launch。标记不授予派发资格。

此范围按 [revision 2 具名决定](https://github.com/nemori-ai/omne-harness-lite/issues/430#issuecomment-6285621097)取代旧全局方法次数保证；旧反例仍对被取代的保证成立。

一般的未知执行状态不能当作失败标记。内存提示不提供耐久性。本增量不持久保存原绑定异常正文，`run` 也不向外输出该正文。`readDiagnostics` 仍未交付。

启动阶段的前置与查询端口返回具名失败时保持原结果。未知异常以同一错误对象拒绝 `run`，保留启动待办与名额，不自动重试或写终局。`binding.start` 抛错后仍须对账，因为执行可能已经受理。后续查询抛错时，该错误向调用方传播，尚未确认的绑定失败责任保留。串行清理不产生额外的未处理拒绝。

尚未交付的操作回复具名的 `unsupported`。`reason` 写明操作名和增量名。没有操作抛异常或回复空成功。

| 增量名 | runtime 门面与提供者的操作 | 同一增量的账本命令 |
| --- | --- | --- |
| `controls` | `control` 门面已按新 operation 委托；真实 ledger 仍 unsupported | `control`、`recordControl` |
| `waits, decisions and resources` | `queries.readWait`；回应保留在受信内部端口 | `openWait`、`attachRegistration`、`attachResource`、`recordResponse`、`closeWait` |
| `process observation and diagnostics` | `readProcess`、`readDiagnostics` | `preserveProcess`、`recordLateFact`、`recordLateResult` |
| `execution facts and release` | `content.read`、`content.raw` | `recordAccount`，以及异常 settled facts 的 blocked 分支以外的 `recordTask` |
| `recovery scan` | `recover` | `scanPending`、`claim`、`settleLost` |
| `drain and handover` | `quiesce`、`inspectDrain`、`handover` | 无 |
| `checkpointed executors` | 无 | `prepareResume`、`planSuspension`、`suspend` |
| `program executors` | 无 | `recordScheduling` |

### 账本事实保管

受信 Tool 推进方在原调用启动后调用 `ledger.commands.receiveFacts({ principal, tenant, call, start, batch })`。本入口支持 process/final，在一次调用域提交中保存完整事件、过程当前块或 settle 待办、原批保管回执、流游标及 fact-ack 待办。`loadRecovery.streams` 投影保存的游标与待确认回执。runtime 推进协程在启动成功后自动消费原执行源。

批次和事件身份包含原 start operation 与 source owner。来源 evidence 换版不能绕过去重。同批同值重投返回原回执，零写入。游标是不透明文本，支持一批多事件，拒绝缺口、复用边界和异值冲突。提交未知返回 `unavailable`，要求重投原批，不伪造 caller operation。

process 的 sequence 是非负十进制数。append 支持文本及思考文本的累计完整值，块身份、kind 与可见性固定。其他合法块使用 replace。开块后 mode 固定，封块后拒绝新更新，历史同值更新仍可认回。trim 保存数量与原因，不删除原事件。过程观察尚未实现。

含 wait、continued、account 或 program-scheduling 的批次整体返回 `unsupported`，零保存，由源继续保管。final 只形成唯一 settle 待办，不写逻辑终局或释放名额。受信恢复消费者凭该待办的精确 evidence 调用 `ledger.facts.read({ principal, tenant, call, basis })`，得到包含完整 raw、result、terminal 与 effect 的 `SavedFact`。读取逐次核 recover 资格，返回值不引用可变存储。

装配必须把 `write` 资格限制给受信 Tool 推进方。source 文本与 evidence 形状不能认证外部生产者。`ToolLedgerGuards.factAcknowledgements` 是必填依赖。装配用与 runtime 相同的 bindings 构造 `createToolFactAcknowledgementGuard(bindings)`。守卫经原 `bindings.recover.acknowledge` 重送完整保管回执，并比较完整确认。来源与确认的 owner 可以不同。

`recordFactAcknowledgement` 先核当前 write 资格、原 operation 与完整已存回执，再核来源。确认、operation 回执、pending 移除和 fact-ack 删除在调用域同提交。来源或本域结果未知时保留原恢复责任。同 operation 重试返回原 progress，不再次调用来源。已确认回执的新 operation 同值重发也保存自身可查询回执。

非耐久测试运行真实内存执行源、账本和恢复绑定，覆盖 ACK 丢答、未知提交、伪确认、输入突变和 operation 排除。自动组合另覆盖信号取消与续接；不证明生产耐久或 resume。

### 受管事实读取

普通调用方使用 `runtime.invoke`。宿主运行原调用后，driver 自动读取原 live，invoke 不等待事实流结束。宿主须在需要该连接时保持 run.signal 有效。run 返回本身不等于 abort。

每个 driver 对同 tenant/call/原 start 只有一个 reader，至多一个在途 next 和一个 ready。读取回调只保存 ready 并请求唤醒。driver 在原 step budget 内保存保管、发送原回执并记录来源确认。settled queue 修复及尚未终局的原 final 收场先于 fact-ack，ACK 失败不能阻塞收场。一批未确认前仍不读下一批。ACK 保留原 live 或 recover 路由。

abort 阻止该连接的新读取、调度和命令。已发出的 ledger/source 命令可能完成或结果未知，仍按原 receipt/task 恢复。下一次宿主 run 从保存 cursor 接回。旧 reader 清理期间的新 run 保留最新 signal 意图，待 next 与 return 都结束后按仍有效信号唤醒。不合作的源可使清理长期未完成，本包不提供退出时限或生产扫描。

正常 completed 收场关闭 reader，未确认 ACK 保留原 live 或 recover 路由。异常收场保留 reader，晚到原 process 仍保管并 ACK，不改原结果；随后 end/throw/失联持久保存具名 blocked facts。协调取消不等同源失联。尚未收场时，重连及宿主拒绝唤醒沿 driverRetryDelayMs。流 end/throw 本身不证明执行结束。unsupported 输入停止自动重试。inspectStart 的 settled 结果缺原 batch/cursor，driver 返回具名缺口 `settled-start-facts-recovery-needs-original-batch-and-cursor` 并保留任务，不造批次或重新启动。

## 原结果与环境清理

`receiveFacts` 保存 final 与 settle 待办，不直接终局。`preserveResult` 核对本域原 final，主动确认 `custody.retainResult` 后，原子建立唯一原结果、delivery、真实 effect、ended 与全部后继任务。重试保持原身份。保管已生效但丢答仍不等于已确认。

`planRelease` 按原 preparation 认回唯一 canonical 计划，任务关闭后不重建。正常 completed 的全部历史外部引用必须已有独立保管；旧 file 地址不足以证明覆盖。非正常 final 保留 blocked 清理与来源责任。`recordRelease` 经原环境 inspectRelease 核验已报告的 released，不调用环境 release。名额释放不等于环境资源释放。

final 没有实际结束时钟 marker。running 计时保留 unknown、原 segment、已知累计与 blocked clock 任务，不以晚到 elapsed 或零伪造时长。完整条件见 [收场规则](SPEC.md#26-原结果收场与释放责任)。

## 使用

账本第五参数必须显式提供 `{ custody, releaseInspection: environments }`。runtime dependencies 同时传入同账本 `commands`、`reads`、`admissions`、`queues` 与 `facts`。构造片段见[英文使用说明](README.md#usage)，公开构造形状见 [public-api](docs/public-api.md)。

独立程序和应用装配依赖本包与 `@omne-harness/tool-contract`。其他领域的生产代码只依赖 `@omne-harness/tool-contract`。其他领域的测试可以把 `@omne-harness/tool/testing` 作为开发依赖。它导出非耐久记录仓 `createMemoryToolLedgerStore` 与下述装配工厂。

独立程序先调用 `createIndependentToolScope({ limits, signal, process, waits })`。它得到一个 `ToolExecutionScope`。某个上限不是正安全整数时，它得到带字段名的失败。然后调用 `executeTool(argumentsValue, executor, environment, scope)`。执行者收到 `scope.context`，可以用 `emit` 发过程更新，用 `wait` 等待 Ask 或资源协议。`process` 为 null 时 `emit` 返回 `unsupported`。`waits` 为 null 时 `wait` 返回 `unsupported`。结果是执行者的返回值，或一个带 `effect` 的失败。`not-started` 表示作用域被拒绝，作者没有运行。`unknown` 表示作者运行过，之后抛出，或返回时作用域不能收尾。

### `./testing` 入口

`createTestToolDependencies<P>(input)` 每次新建记录仓、账本与契约包已有的七个内存替身，返回 `dependencies`、`store`、`ledger`、`doubles` 和 `durability: 'none'`。调用方再把 `dependencies` 传给 `createToolRuntime`。只有构造 runtime 才会装入推进协程，工厂自身不装入、不调度。

调用方必须提供 `operationIdentities`、`sourceIssuer`、`guards`、`configuration`、`instances`、`catalog`、`children` 与 `bindingsFor(executor)`，没有默认身份或授权。守卫负责租户资格、来源与授予核验、结果构造及结果政策。runtime 的结果政策同样使用 `guards.policy`。输入 guards 不含 `factAcknowledgements`，工厂从唯一一次 `bindingsFor` 返回构造该守卫，并把同一 bindings 对象交给 runtime。宿主、目录、子调用协调与绑定解析没有同型契约内存替身，因此由调用方提供。`bindingsFor` 接收内层执行者绑定，返回不同类型的 `ToolBindings` 解析端口；调用方明确其解析和授权规则。公开入口示例见[英文说明](README.md#testing)。

工厂只对主体 `P` 泛型，块类型固定为 `ContentBlock`，环境类型固定为契约替身的 `MemoryEnvironment`。`doubles` 保留 executor、environment、authority、clock、decisions、resources、custody 原对象及其控制手柄。每次构造的记录与手柄状态相互隔离。工厂不创建隐含租户、主体或实例身份。账本构造异常与 `bindingsFor` 异常原样传播。

替身只供测试，不提供耐久性、真实执行环境或生产宿主，也不增加支持表之外的 runtime 能力。工厂不创建定时器或新的释放协议。runtime 与调用方提供的资源仍由调用方拥有。

## 契约

行为归[契约 SPEC](../tool-contract/SPEC.md)，独立路径归其中的 P11。[SPEC.md](SPEC.md) 说明本实现怎样满足契约，并固定契约留给实现的选择：失败种类、字节编码、等待历史预留量和屏障规则。契约 SPEC 的 G1、G2、G8 决定把这些工厂放在本包。

## 设计

依赖方向是 `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`。本包不依赖 `tool-cordis-contract`、`tool-host-local` 或 Cordis。本包依赖 `@omne-harness/operation-result` 取得 `Outcome`。该包没有生产依赖。测试检查本包的完整生产安装闭包不含 Cordis。耐久性取决于记录仓提供者。独立作用域只承诺 `local` 回执。

## 配置与运行

`ToolConfiguration` 携带作者限额与 runtime 预算。`ToolDependencies` 列出 runtime 消费的每个端口。调用者在构造时提供二者。独立作用域直接从 `IndependentToolScopeInput` 取得上限。

## 验证

`OMNE_TEST_TIER=fast pnpm --filter @omne-harness/tool test` 先构建再运行测试。测试核对根导出、导入图、清单依赖、Cordis 路径、独立作用域与包装器的 P11 规则、账本规则，以及真实调用在非耐久记录仓上经替身环境、替身绑定与替身启动授权到达启动的路径。`tool-host-local` 的本地启动协调器在那个包里与本 runtime 组合测试。[tests/README](tests/README.md) 列出每条规则对应的测试。

Vitest 只把 `@omne-harness/tool-contract`、`@omne-harness/tool-contract/binding` 和 `@omne-harness/tool-contract/testing` 映射到各自源码入口。因此，契约并行构建删除和重建 `dist` 时，业务测试仍可运行。[受控复现](https://github.com/nemori-ai/omne-harness-lite/issues/424#issuecomment-6271941775)在删除后暂停该构建，运行 managed-start 和 queue-release 测试。源码别名不验证安装后契约包的 JavaScript exports。Tool 构建和 `public-entry.spec.ts` 继续核对 Tool 产物、声明导入图、清单依赖与生产安装闭包。

## 维护

`ToolDependencies` 或 `ToolConfiguration` 变化时，`tool-host-local` 与每个构造 runtime 的装配都要同步。[SPEC.md](SPEC.md) 的失败种类或屏障规则变化时，每个读取它们的独立程序都要同步。

## 目录结构与文档职责

```text
tool/
├── README.md / README_ZH.md / index.md
├── SPEC.md
├── documentation.json / package.json
├── docs/                     README.md + index.md
│   ├── architecture.md
│   ├── flows.md
│   ├── object-model.md
│   ├── public-api.md
│   ├── context.md
│   └── cordis.md             说明本包不含 Cordis
├── src/                      README.md + index.md + 根入口、独立执行与构造形状
├── tests/                    README.md + index.md + 入口测试、行为测试与类型测试
│   └── fixtures/             README.md + index.md
├── schema/                   README.md + index.md
├── verification/             README.md + index.md
│   ├── models/               README.md + index.md
│   └── proofs/               README.md + index.md
├── adr/                      README.md + index.md
├── examples/                 README.md + index.md
├── resources/                README.md + index.md
├── acceptance/               README.md + index.md
└── tsconfig.build.json / tsconfig.test.json / vitest.config.ts
```

完整文件导航见 [index](index.md)。主题职责见 [docs/README](docs/README.md)。

普通调用方使用 `runtime.invoke({ principal, tenant, request })` 并保存返回的调用引用。同租户、完整 consumer 与固定请求认回原调用；新执行须新 consumer。queries.lookup 按原 admission 定位并返回当前权威状态，包含交付状态。invoke 的 state 保留受理时状态；commands.releaseDelivery 成功返回 released 与生产者原耐久回执，不附操作引用，也不承诺新增写入。未知回执用其操作引用经 queries.queryOperation 查询。可靠否定只否定该次操作，调用方此后可明确再次释放以取得已有回执；未知或不可读时不能自动重发。持久读取和交付不要求连接实例目录。每次访问都核当前主体与租户，引用不授予权限。完整响应丢失后，以原完整意图再次 invoke 认回；association-unknown 没有引用。

装配者提供受信身份端口与真实来源签发器，本包不提供生产默认签发器。测试须显式装配 createTestInvocationSource({ authority, snapshotPrincipal }) 的配对 issuer/guard；来源自身原子分配调用身份，createTestToolIdentities 只提供操作和实例身份。宿主向 driver.run 显式提供实例身份，同一存活实例重复唤醒沿用。测试替身不证明生产 host、claim、接管或耐久性。

测试装配提供同步 snapshotPrincipal，保留凭据认证语义并隔离可变主体，在首次 await 前捕获。真正不可变的 opaque 主体可以安全复用。来源 resolve 的资格与主体比较使用固定视图，ledger 与配对 guard 仍核原始当前主体；摘要不序列化 P，bindings 返回隔离的诊断副本。可选同步 beforeIssue 在 reservation 保存后、签发前注入故障；抛错返回原身份的 issuance-unknown，重入继续签发，已 issued 不再调用。
