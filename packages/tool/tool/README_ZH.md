# @omne-harness/tool

[English](README.md)

不含 Cordis 的 Tool 领域实现。当前根入口导出独立执行：`createIndependentToolScope` 用本地接收者、显式上限和内存等待历史构造执行作用域，`executeTool` 在这样的作用域里运行一个执行者。根入口同时导出工厂构造形状 `ToolDependencies` 与 `ToolConfiguration`。runtime 工厂 `createToolRuntime`、受理决定器、记录仓端口 `ToolLedgerStore` 与 `createToolLedger`，以及提供真实 runtime 测试装配的 `./testing` 入口随 M3 交付。

## 职责与状态

本包实现 `@omne-harness/tool-contract` 的契约。它管理并发、等待、取消与状态，两个实现在这里可以不同，所以不属于契约。本包不依赖 Cordis，独立程序不装 Cordis 也能执行工具。独立执行（工单 04）已实现。M3 加入 runtime。

## 使用

独立程序和应用装配依赖本包与 `@omne-harness/tool-contract`。其他领域的生产代码只依赖 `@omne-harness/tool-contract`。`./testing` 实现后，其他领域的测试可以把 `@omne-harness/tool/testing` 作为开发依赖。

独立程序先调用 `createIndependentToolScope({ limits, signal, process, waits })`。它得到一个 `ToolExecutionScope`。某个上限不是正安全整数时，它得到带字段名的失败。然后调用 `executeTool(argumentsValue, executor, environment, scope)`。执行者收到 `scope.context`，可以用 `emit` 发过程更新，用 `wait` 等待 Ask 或资源协议。`process` 为 null 时 `emit` 返回 `unsupported`。`waits` 为 null 时 `wait` 返回 `unsupported`。结果是执行者的返回值，或一个带 `effect` 的失败。`not-started` 表示作用域被拒绝，作者没有运行。`unknown` 表示作者运行过，之后抛出，或返回时作用域不能收尾。

## 契约

行为归[契约 SPEC](../tool-contract/SPEC.md)，独立路径归其中的 P11。[SPEC.md](SPEC.md) 说明本实现怎样满足契约，并固定契约留给实现的选择：失败种类、字节编码、等待历史预留量和屏障规则。契约 SPEC 的 G1、G2、G8 决定把这些工厂放在本包。

## 设计

依赖方向是 `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`。本包不依赖 `tool-cordis-contract`、`tool-host-local` 或 Cordis。本包依赖 `@omne-harness/kernel-basis` 取得 `Outcome`。该包把 Cordis 列为生产依赖（开放项 O8），一条测试锁定已接受的路径。耐久性取决于记录仓提供者。独立作用域只承诺 `local` 回执。

## 配置与运行

`ToolConfiguration` 携带作者限额与 runtime 预算。`ToolDependencies` 列出 runtime 消费的每个端口。调用者在构造时提供二者。独立作用域直接从 `IndependentToolScopeInput` 取得上限。

## 验证

`OMNE_TEST_TIER=fast pnpm --filter @omne-harness/tool test` 先构建再运行测试。测试核对根导出、导入图、清单依赖、Cordis 路径，以及独立作用域与包装器的 P11 规则。[tests/README](tests/README.md) 列出每条规则对应的测试。

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
