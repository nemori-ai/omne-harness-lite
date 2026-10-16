# @omne-harness/tool-host-local

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

service-provider 变体草稿。
## 职责与状态

<!-- documentation:placeholder -->

填写实际消费者、平台、职责和采用依据。区分已实现、未实现与未验证。

## 使用

<!-- documentation:placeholder -->

给出最小有效示例、依赖及初始化和释放责任。分别说明独立使用入口与 Cordis 集成入口。逐项核对公开 exports、源码值依赖、生成声明、运行启动和安装闭包。存在 ./cordis 不证明独立安装成立。

## 契约

<!-- documentation:placeholder -->

链接公开类型、必要校验及唯一行为正文。类型外行为由 SPEC.md 拥有。说明错误、生命周期与资源责任的拥有者，不复制签名或状态机。

## 设计

<!-- documentation:placeholder -->

说明内部模块、数据流、控制流和关键不变量的拥有者。复杂机制按实际阅读任务拆页。

## 配置与运行

<!-- documentation:placeholder -->

填写配置拥有者、默认行为、环境前提和显式依赖。说明调用者与包各自的运行责任。

## 验证

<!-- documentation:placeholder -->

填写可复跑命令、性质、前提和未覆盖。提供有实际断言的测试。结构通过不表示业务行为已验证。

## 维护

<!-- documentation:placeholder -->

说明公开契约、资源或依赖变化时必须同步的消费者和验证入口。信息不适用时写明理由，未知时登记具名缺口。

## 目录结构与文档职责

固定目录按责任分开。目录存在不表示其中已有实现、Schema、模型、证明或验收能力。源码入口和包根 README 保留 `PACKAGE_TEMPLATE_DRAFT` 标记。其他骨架页保留占位标记，直到拥有者写入正文。

```text
tool-host-local/
├── README.md / README_ZH.md / index.md
├── SPEC.md
├── documentation.json / package.json
├── docs/                     README.md + index.md
│   ├── architecture.md
│   ├── flows.md
│   ├── object-model.md
│   ├── public-api.md
│   ├── context.md
│   └── cordis.md
├── src/                      README.md + index.md + index.ts + cordis.ts
├── tests/                    README.md + index.md + public-entry.spec.ts + cordis-entry.spec.ts
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

本提供者的公共契约归契约成员 [`@omne-harness/tool`](../tool/README_ZH.md)。完整文件导航见 [index](index.md)。主题职责见 [docs/README](docs/README.md)。
