# @omne-harness/model

## Responsibility and status

本成员拥有可复用 Model 领域实现设计，已有凭据存在性与解析的判定，本地保管归 [model-host-local](../model-host-local/README_ZH.md)；托管运行和工厂尚未实现。凭据切片现状分四类：既有保管实现在 [model-host-local](../model-host-local/README_ZH.md)，契约在 [model-contract](../model-contract/README_ZH.md)，判定在本成员，运行工厂与其他宿主尚未实现。公共值、操作与提供者协议归 [model-contract](../model-contract/README_ZH.md)，框架定义归 [model-cordis-contract](../model-cordis-contract/README_ZH.md)。设计、实现与运行验证分别判断。

## Usage

选择本实现的独立程序与宿主从[消费与构造](docs/context.md)进入。executeModel、createModelRuntime 及构造参数的设计已接受，精确形状见[公开接口设计](docs/public-api.md)，尚不能作为现有导入示例。

## Contracts

[实现规格](SPEC.md)拥有单次独立执行与构造配置行为。实现须满足[共同规格](../model-contract/SPEC.md)，不能降低其身份、发送、保管和恢复保证。

## Design

[设计索引](docs/index.md)按架构、流程、内部对象、公开入口、消费和 Cordis 装配展开。宿主装配设计暂存于 [docs/cordis.md](docs/cordis.md)，它不对应本成员的任何导出；model-host-local 目前只承载本地凭据保管。

## Configuration and operation

构造器显式接收 Commands、发送围栏、重试策略、实例宿主与时钟。应用选择并拥有所需 adapter，不从全局 Context 取得业务参数。目标运行实现不依赖 Cordis。包清单不声明 Cordis、proper-lockfile 与 model-cordis-contract，包只有根入口，没有 `./cordis` 与 `./execute`。`pnpm --filter @omne-harness/model run install-closure` 对本成员做打包、隔离安装、入口解析与场景运行，并以 `--out` 写出报告；最近一次运行 `forbidden` 为空、全部检查通过（见[测试说明](tests/README.md#安装闭包)）。包不自动安装所有厂商或词表。

## Verification

运行 `pnpm --filter @omne-harness/model typecheck`、`pnpm --filter @omne-harness/model test` 及 `make docs-check`。现有测试覆盖凭据判定（含未经铸造的租户一律拒绝）、根入口导出集合、旧子路径不可解析与清单不含 Cordis 类依赖；保管、持久化与 Cordis 插件的测试在 model-host-local，不证明托管运行、流式或结果保管已经实现。共同协议及类型消费义务见[契约验证](../model-contract/verification/index.md)。

## Maintenance

修改构造或算法时同步[文档登记](documentation.json)、真实消费者及验证。资源导航见[包索引](index.md)，未实现资源保持实际状态。

<a id="342-主干运行契约候选"></a>
<a id="主干运行契约候选"></a>
## 主干运行契约

领域契约归[契约入口](../model-contract/docs/public-api.md)，本成员只维护实现函数和构造形状。共同业务行为的已接受范围由[共同 SPEC](../model-contract/SPEC.md)记录，迁移不扩大接受范围。

## 目录结构与文档职责

结构沿本任务采用的 #343 目录方案。对本包不适用的目录，其 README 写明不适用及原因。目录存在不代表功能已实现。

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
