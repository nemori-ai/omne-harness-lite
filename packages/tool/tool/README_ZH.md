# @omne-harness/tool

[English](README.md)

不含 Cordis 的 Tool 领域实现。本包将承担独立执行（`executeTool`、`createIndependentToolScope`）、runtime 工厂 `createToolRuntime`、受理决定器、记录仓端口 `ToolLedgerStore` 与 `createToolLedger`，以及提供真实 runtime 测试装配的 `./testing` 入口。当前根入口只导出工厂构造形状 `ToolDependencies` 与 `ToolConfiguration`。

## 职责与状态

本包实现 `@omne-harness/tool-contract` 的契约。它管理并发、等待、取消与状态，两个实现在这里可以不同，所以不属于契约。本包不依赖 Cordis，独立程序不装 Cordis 也能执行工具。当前只有构造形状。工单 04 加入独立执行，M3 加入 runtime。

## 使用

独立程序和应用装配依赖本包与 `@omne-harness/tool-contract`。其他领域的生产代码只依赖 `@omne-harness/tool-contract`。`./testing` 实现后，其他领域的测试可以把 `@omne-harness/tool/testing` 作为开发依赖。

## 契约

行为归[契约 SPEC](../tool-contract/SPEC.md)。[SPEC.md](SPEC.md) 说明本实现怎样满足契约。契约 SPEC 的 G1、G2、G8 决定把这些工厂放在本包。

## 设计

依赖方向是 `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`。本包不依赖 `tool-cordis-contract`、`tool-host-local` 或 Cordis。耐久性取决于记录仓提供者。

## 配置与运行

`ToolConfiguration` 携带作者限额与 runtime 预算。`ToolDependencies` 列出 runtime 消费的每个端口。调用者在构造时提供二者。

## 验证

`pnpm --filter @omne-harness/tool test` 先构建再运行测试。测试核对根导出、导入图与清单依赖。当前没有 runtime 行为可测。

## 维护

`ToolDependencies` 或 `ToolConfiguration` 变化时，`tool-host-local` 与每个构造 runtime 的装配都要同步。

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
├── src/                      README.md + index.md + index.ts + construction.ts
├── tests/                    README.md + index.md + 入口测试与类型测试
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
