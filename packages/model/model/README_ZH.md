# @omne-harness/model

[English](README.md)

## 职责与状态

本成员已有凭据判定、真实运行工厂构造壳和独立内存测试入口。本地凭据保管归 [model-host-local](../model-host-local/README_ZH.md)，领域协议归 [model-contract](../model-contract/README_ZH.md)。

| 能力或入口 | 当前支持 |
| --- | --- |
| 凭据判定及 `deliver` | 凭据判定为纯函数，`deliver` 委托传入的 resolver |
| `createModelRuntime` | 仅构造和校验，十二个托管操作明确返回 unavailable |
| `@omne-harness/model/testing` | 内存 Commands 与五个可控依赖端口 |
| 耐久 Commands 及生产托管执行 | 未实现 |
| Cordis 运行宿主及厂商执行 | 本成员未实现 |

## 使用

选择本实现的独立程序与宿主从[消费与构造](docs/context.md)进入。executeModel、createModelRuntime 及构造参数的设计已接受，精确形状见[公开接口设计](docs/public-api.md)，createModelRuntime 已可导入构造；executeModel 与独立能力工厂仍未实现。

内存测试从 `@omne-harness/model/testing` 导入 createTestModelDependencies。显式配置、authority、evidence 和 owner 的用法见[测试入口](docs/public-api.md#内存测试入口)。返回的五依赖可构造真实 runtime 壳。

内存测试提供者交付 sealed/partial 及真实 trims。显式项数与字节目标按完整项组页，超目标大项独页，整个页受原受理容量约束。消费者须处理未封值与提醒。具体配置及局部上限见[测试入口](docs/public-api.md#内存测试入口)。

## 契约

[实现规格](SPEC.md)拥有单次独立执行与构造配置行为。实现须满足[共同规格](../model-contract/SPEC.md)，不能降低其身份、发送、保管和恢复保证。

## 设计

[设计索引](docs/index.md)按架构、流程、内部对象、公开入口、消费和 Cordis 装配展开。宿主装配设计暂存于 [docs/cordis.md](docs/cordis.md)，它不对应本成员的任何导出；model-host-local 目前只承载本地凭据保管。

## 配置与运行

构造器显式接收 Commands、发送围栏、重试策略、实例宿主与时钟。应用选择并拥有所需 adapter，不从全局 Context 取得业务参数。目标运行实现不依赖 Cordis。包清单不声明 Cordis、proper-lockfile 与 model-cordis-contract，包导出根入口和独立 `./testing`，没有 `./cordis` 与 `./execute`。`pnpm --filter @omne-harness/model run install-closure` 对本成员做打包、隔离安装、入口解析与场景运行，并以 `--out` 写出报告；运行方式与验证范围见[测试说明](tests/README.md#安装闭包)，运行结果不在本页记录。包不自动安装所有厂商或词表。

## 验证

运行 `pnpm --filter @omne-harness/model typecheck`、`pnpm --filter @omne-harness/model test` 及 `pnpm run check:docs`。现有测试覆盖凭据判定（含未经铸造的租户一律拒绝）、根入口导出集合、旧子路径不可解析与清单不含 Cordis 类依赖；保管、持久化与 Cordis 插件的测试在 model-host-local，内存测试覆盖本地 Commands、未知注入、结果读取及释放，不证明真实耐久、厂商发送或生产托管执行。共同协议及类型消费义务见[契约验证](../model-contract/verification/index.md)。

## 维护

修改构造或算法时同步[文档登记](documentation.json)、真实消费者及验证。资源导航见[包索引](index.md)，未实现资源保持实际状态。

## 与 model-contract 的边界

领域契约归[契约入口](../model-contract/docs/public-api.md)，本成员只维护实现函数和构造形状。共同业务行为由[共同 SPEC](../model-contract/SPEC.md)记录。本成员不改变其范围，也不降低其保证。

## 目录结构与文档职责

目录骨架依据 [RFC-0007](../../../docs/rfcs/RFC-0007-source-packages-and-templates.md) 与模板 `typescript-package@3.0.0`（见[完整生成树](../../../docs/package-organization.md#完整生成树)）。对本包不适用的目录，其 README 写明不适用及原因。目录存在不代表功能已实现。

```text
包根：README.md、README_ZH.md、index.md、SPEC.md、documentation.json、package.json
├── docs/：architecture、flows、object-model、public-api、context、cordis 六主题
├── src/
├── tests/fixtures/
├── schema/
├── verification/models/、verification/proofs/
├── adr/
├── examples/
├── resources/
└── acceptance/
```

每个固定目录都有 README 和 index。源码、构建与测试配置沿实际文件；构建产物和依赖目录不属于正文骨架。

| 入口 | 文档职责 |
| --- | --- |
| [设计](docs/index.md) | 架构、流程、对象、接口、消费与装配 |
| [源码](src/index.md) | 实际公开导出和内部代码 |
| [测试](tests/index.md)、[夹具](tests/fixtures/index.md) | 可执行断言与固定输入 |
| [Schema](schema/index.md) | 外部数据格式及发布身份 |
| [持续验证](verification/index.md)、[模型](verification/models/index.md)、[证明](verification/proofs/index.md) | 性质、前提、符合性和验证资源 |
| [设计决策](adr/index.md) | 持续采用的实现取舍 |
| [示例](examples/index.md) | 可运行消费方式 |
| [运行资源](resources/index.md) | 资产、来源和装载责任 |
| [独立验收](acceptance/index.md) | 独立场景、环境与判据 |

## 独立消费入口

凭据判定的已实现导出见[公开入口](docs/public-api.md#已实现的凭据入口)，调用方式见[消费指南](docs/context.md#独立消费入口)；本地保管库与插件的用法见 [model-host-local](../model-host-local/docs/context.md)。凭据判定已有行为测试；其他运行设计的接受不表示已经实现。
