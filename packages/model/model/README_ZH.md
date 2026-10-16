# @omne-harness/model

PACKAGE_TEMPLATE_DRAFT

## 职责与状态

本成员拥有可复用 Model 领域实现设计，当前源码入口为空。公共值、操作与提供者协议归 [model-contract](../model-contract/README_ZH.md)，框架定义归 [model-cordis-contract](../model-cordis-contract/README_ZH.md)。设计、实现与运行验证分别判断。

## 使用

选择本实现的独立程序与宿主从[消费与构造](docs/context.md)进入。executeModel、createModelRuntime 及构造参数的设计已接受，精确形状见[公开接口设计](docs/public-api.md)，尚不能作为现有导入示例。

## 契约

[实现规格](SPEC.md)拥有单次独立执行与构造配置行为。实现须满足[共同规格](../model-contract/SPEC.md)，不能降低其身份、发送、保管和恢复保证。

## 设计

[设计索引](docs/index.md)按架构、流程、内部对象、公开入口、消费和 Cordis 装配展开。宿主装配暂在本成员，目标 model-host-local 尚未初始化。

## 配置与运行

构造器显式接收 Commands、发送围栏、重试策略、实例宿主与时钟。应用选择并拥有所需 adapter，不从全局 Context 取得业务参数。目标实现不依赖 Cordis，也不自动安装所有厂商或词表。

## 验证

运行 `pnpm --filter @omne-harness/model typecheck`、`pnpm --filter @omne-harness/model test` 及 `make docs-check`。当前测试仅断言模板空入口，不证明模型行为。共同协议及类型消费义务见[契约验证](../model-contract/verification/index.md)。

## 维护

修改构造或算法时同步[文档登记](documentation.json)、真实消费者及验证。资源导航见[包索引](index.md)，未实现资源保持实际状态。

<a id="342-主干运行契约候选"></a>
<a id="主干运行契约候选"></a>
## 主干运行契约

领域契约归[契约入口](../model-contract/docs/public-api.md)，本成员只维护实现函数和构造形状。共同业务行为的已接受范围由[共同 SPEC](../model-contract/SPEC.md)记录，迁移不扩大接受范围。

## 目录结构与文档职责

结构沿本任务采用的 #343 目录方案。待实现资源的 README 和 index 明示缺项，不代表功能已实现。

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
