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
| runtime 已实现的路径 | `createToolLedger` 与 `createToolRuntime`。内部账本按操作身份幂等受理。调用已知不可用的工具，或参数完整但非法，不进入环境或执行者就收场。`queries.lookup` 与 `queries.queryOperation` 查到它，`readResult` 分页读取，`releaseDelivery` 按两条交接路径解除交付，`account` 查账。真实工具的调用，经 `invoke` 分配身份、绑定来源并受理后由推进协程带到启动记录：环境准备、在调用方固定的范围与上限内按 FIFO 排队、启动守卫、启动围栏与 `start`。前台启动通过装配传入的 `ToolClock.begin` 开启计时段。启动前被拒绝的调用以 `unavailable` 收场，`effect` 为 `not-started`。`inspect` 转给装配传入的 Catalog 端口。本包没有 Catalog 提供者 | 根入口。`./testing` 给非耐久记录仓与显式依赖装配 | 托管路径测试消费契约源码入口，在非耐久记录仓上运行，环境、执行绑定、启动授权与时钟用替身。`tool-host-local` 用真实的本地启动协调器运行本 runtime。只有一个进程。耐久性没有覆盖 |
| 尚未交付的宿主与提供者 | 已启动执行的事实接收与收场，及随后的名额释放。控制、计时段开启之后的计时（经过时间、期限、暂停）、等待、过程观察、恢复、排空与交接。耐久记录仓（[#280](https://github.com/nemori-ai/omne-harness-lite/issues/280)）。真实执行环境（[#278](https://github.com/nemori-ai/omne-harness-lite/issues/278)）。宿主时钟、绑定登记表与 Catalog。Cordis 插件 | 无 | 无 |

到达启动记录的调用停在 `running`，一直占用名额。目前没有任何东西释放名额。

尚未交付的操作回复具名的 `unsupported`。`reason` 写明操作名和增量名。没有操作抛异常或回复空成功。

| 增量名 | runtime 门面与提供者的操作 | 同一增量的账本命令 |
| --- | --- | --- |
| `controls` | `control` | `recordControl` |
| `waits, decisions and resources` | `queries.readWait`；回应保留在受信内部端口 | `openWait`、`attachRegistration`、`attachResource`、`recordResponse`、`closeWait` |
| `process observation and diagnostics` | `readProcess`、`readDiagnostics` | `preserveProcess`、`recordLateFact`、`recordLateResult` |
| `execution facts and release` | `content.read`、`content.raw` | `receiveFacts`、`recordFactAcknowledgement`、`preserveResult`、`recordAccount`、`planRelease`、`recordRelease`、`recordTask` |
| `recovery scan` | `recover` | `scanPending`、`claim`、`settleLost` |
| `drain and handover` | `quiesce`、`inspectDrain`、`handover` | 无 |
| `checkpointed executors` | 无 | `prepareResume`、`planSuspension`、`suspend` |
| `program executors` | 无 | `recordScheduling` |

## 使用

独立程序和应用装配依赖本包与 `@omne-harness/tool-contract`。其他领域的生产代码只依赖 `@omne-harness/tool-contract`。其他领域的测试可以把 `@omne-harness/tool/testing` 作为开发依赖。它导出非耐久记录仓 `createMemoryToolLedgerStore` 与下述装配工厂。

独立程序先调用 `createIndependentToolScope({ limits, signal, process, waits })`。它得到一个 `ToolExecutionScope`。某个上限不是正安全整数时，它得到带字段名的失败。然后调用 `executeTool(argumentsValue, executor, environment, scope)`。执行者收到 `scope.context`，可以用 `emit` 发过程更新，用 `wait` 等待 Ask 或资源协议。`process` 为 null 时 `emit` 返回 `unsupported`。`waits` 为 null 时 `wait` 返回 `unsupported`。结果是执行者的返回值，或一个带 `effect` 的失败。`not-started` 表示作用域被拒绝，作者没有运行。`unknown` 表示作者运行过，之后抛出，或返回时作用域不能收尾。

### `./testing` 入口

`createTestToolDependencies<P>(input)` 每次新建记录仓、账本与契约包已有的七个内存替身，返回 `dependencies`、`store`、`ledger`、`doubles` 和 `durability: 'none'`。调用方再把 `dependencies` 传给 `createToolRuntime`。只有构造 runtime 才会装入推进协程，工厂自身不装入、不调度。

调用方必须提供 `invocationIdentities`、`operationIdentities`、`sourceIssuer`、`guards`、`configuration`、`instances`、`catalog`、`children` 与 `bindingsFor(executor)`，没有默认身份或授权。守卫负责租户资格、来源与授予核验、结果构造及结果政策。runtime 的结果政策同样使用 `guards.policy`。宿主、目录、子调用协调与绑定解析没有同型契约内存替身，因此由调用方提供。`bindingsFor` 接收内层执行者绑定，返回不同类型的 `ToolBindings` 解析端口；调用方明确其解析和授权规则。公开入口示例见[英文说明](README.md#testing)。

工厂只对主体 `P` 泛型，块类型固定为 `ContentBlock`，环境类型固定为契约替身的 `MemoryEnvironment`。`doubles` 保留 executor、environment、authority、clock、decisions、resources、custody 原对象及其控制手柄。每次构造的记录与手柄状态相互隔离。工厂不创建隐含租户、主体或实例身份。账本构造异常与 `bindingsFor` 异常原样传播。

替身只供测试，不提供耐久性、真实执行环境或生产宿主，也不增加支持表之外的 runtime 能力。工厂不创建定时器或新的释放协议。runtime 与调用方提供的资源仍由调用方拥有。

## 契约

行为归[契约 SPEC](../tool-contract/SPEC.md)，独立路径归其中的 P11。[SPEC.md](SPEC.md) 说明本实现怎样满足契约，并固定契约留给实现的选择：失败种类、字节编码、等待历史预留量和屏障规则。契约 SPEC 的 G1、G2、G8 决定把这些工厂放在本包。

## 设计

依赖方向是 `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`。本包不依赖 `tool-cordis-contract`、`tool-host-local` 或 Cordis。本包依赖 `@omne-harness/operation-result` 取得 `Outcome`。该包没有生产依赖。测试检查本包的完整生产安装闭包不含 Cordis。耐久性取决于记录仓提供者。独立作用域只承诺 `local` 回执。

## 配置与运行

`ToolConfiguration` 携带作者限额与 runtime 预算。`ToolDependencies` 列出 runtime 消费的每个端口。调用者在构造时提供二者。独立作用域直接从 `IndependentToolScopeInput` 取得上限。

## 验证

`pnpm turbo run test --filter=@omne-harness/tool` 先构建本包及其依赖，再运行测试。测试核对根导出、导入图、清单依赖、Cordis 路径、独立作用域与包装器的 P11 规则、账本规则，以及真实调用在非耐久记录仓上经替身环境、替身绑定与替身启动授权到达启动的路径。`tool-host-local` 的本地启动协调器在那个包里与本 runtime 组合测试。[tests/README](tests/README.md) 列出每条规则对应的测试。

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

普通调用方使用 `runtime.invoke({ principal, tenant, request })` 并保存返回的调用引用。相同 payload 每次产生独立调用。queries.lookup 按原 admission 定位并返回当前权威状态，包含交付状态。invoke 的 state 保留受理时状态；commands.releaseDelivery 成功返回 released 与生产者原耐久回执，不附操作引用，也不承诺新增写入。未知回执用其操作引用经 queries.queryOperation 查询。可靠否定只否定该次操作，调用方此后可明确再次释放以取得已有回执；未知或不可读时不能自动重发。持久读取和交付不要求连接实例目录。每次访问都核当前主体与租户，引用不授予权限。完整响应丢失且未保存引用时，不能重新提交 payload 来找回原调用。

装配者提供受信身份端口与真实来源签发器，本包不提供生产默认签发器。测试可使用 createTestInvocationSource 的配对 issuer/guard 和 createTestToolIdentities 计数身份。宿主向 driver.run 显式提供实例身份，同一存活实例重复唤醒沿用。测试替身不证明生产 host、claim、接管或耐久性。
