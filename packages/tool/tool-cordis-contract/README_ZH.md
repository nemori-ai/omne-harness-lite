# @omne-harness/tool-cordis-contract

[English](README.md)

Tool 的 Cordis 服务定义包。`./cordis` 导出 18 个抽象 Service、18 个服务键、`Context` 增补、`tool-cordis-contract/call-changed` 事件增补和具体实例目录 `ToolInstancesService`。根入口不导出值。

## 职责与状态

本包唯一拥有 Tool 的服务定义。它单独成包，是因为它的安装闭包含 `@deepseek-ai/cordis`，而纯契约包 `@omne-harness/tool-contract` 不能含。定义已经实现。`ToolInstancesService` 的登记与查询在工单 13 实现前返回具名失败。本包没有提供者。

## 使用

提供或消费 Tool 服务的 Cordis 插件从 `@omne-harness/tool-cordis-contract/cordis` 导入定义，从 `@omne-harness/tool-contract` 导入类型。提供者继承抽象类，不再次 provide 同一个键。不用 Cordis 的代码只依赖 `@omne-harness/tool-contract`。

## 契约

行为归[契约 SPEC](../tool-contract/SPEC.md)。服务表、依赖分类、登记协议与事件规则归 [docs/cordis.md](docs/cordis.md)。源码导航见 [docs/public-api.md](docs/public-api.md)。

## 设计

只有一个模块 [src/cordis.ts](src/cordis.ts)。每个键常量取自唯一一个类的 `static provide`。本包为类型依赖 `tool-contract`，不依赖任何 Tool 实现。依赖方向是 `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`。

## 配置与运行

没有配置。本包不持有状态，不启动资源。生命周期归继承这些定义的插件。

## 验证

`pnpm --filter @omne-harness/tool-cordis-contract test` 先构建再运行测试。测试逐对核对键与类、`./cordis` 的导入图、清单依赖，并在真实 Cordis 4.0.4 下核对定义。测试不覆盖任何提供者行为。

## 维护

Service、键或事件变化时，继承或监听它们的插件都要同步：`tool-host-local`、Agent 与 Session 的 Cordis 页和集成页。[docs/cordis.md](docs/cordis.md) 与键表测试要和源码一致。

## 目录结构与文档职责

```text
tool-cordis-contract/
├── README.md / README_ZH.md / index.md
├── SPEC.md
├── documentation.json / package.json
├── docs/                     README.md + index.md
│   ├── architecture.md
│   ├── flows.md
│   ├── object-model.md
│   ├── public-api.md
│   ├── context.md
│   └── cordis.md             服务定义、登记协议与装配规则
├── src/                      README.md + index.md + index.ts + cordis.ts
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
