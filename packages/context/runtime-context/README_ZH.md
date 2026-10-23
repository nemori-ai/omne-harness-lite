# @omne-harness/runtime-context

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Runtime Context 的机制实现成员，`module` 变体。

## 职责与状态

本成员实现 Runtime Context 的供给机制：注册表、生产者表、资格表、需要绑定、当前投影、观察链、资格核对与翻译。它导出一个不依赖 Cordis 的工厂，输出实现契约三面操作的机制实例。公开行为归 [runtime-context-contract](../runtime-context-contract/README_ZH.md)，Cordis 绑定与唤醒归 [runtime-context-cordis](../runtime-context-cordis/README_ZH.md)。本成员不持有任何耐久状态，五张表都是进程内副本。

状态：机制实现成员，`draft`。采用依据是组的[成员分解](../docs/architecture.md#成员分解)与 [SPEC](SPEC.md)。现在的实现情况如下：

- 已实现：没有。`src/index.ts` 只有模板标记，根入口没有导出。
- 未实现：工厂、五张表、观察链、资格核对、翻译、变化出口与关闭。
- 未验证：SPEC 列出的持续验证场景都没有测试。本成员不宣称持久化、跨进程一致性或租户隔离。

现在没有包依赖本成员。

Runtime Context 的两个契约成员已有类型、纯校验与 Cordis 服务定义。契约包测试不表示本实现成员已运行，也不证明生产行为。

## 使用

本成员只有根入口 `@omne-harness/runtime-context`。装配 Cordis 的系统不直接导入它，由 runtime-context-cordis 调用工厂。不装配 Cordis 的调用方直接从本成员调用工厂，并自己承担撤除与唤醒的接线，见[使用与定位](docs/context.md#独立使用)。

工厂的名称与签名随实现确定，现在没有可运行的示例。

## 契约

- 公开形状归 `src/`，现在为空。导出索引归[公开接口页](docs/public-api.md)。
- 本成员的本地行为归 [SPEC](SPEC.md)：表与投影、本地行为、关闭与重建。
- 三面操作的输入、结果与失败归 [runtime-context-contract SPEC](../runtime-context-contract/SPEC.md)，条款 RC-01 至 RC-08。
- 内部对象的身份与生灭归[对象模型](docs/object-model.md)。

调用工厂的一方拥有机制实例，负责关闭它。关闭先拒绝新请求，再结束读者、取消在途调用并在超时内等在途读取结算，最后释放表。关闭不撤回已交出的变化材料或外部效果。

## 设计

工厂内部分为注册表、生产者表、当前投影、观察链、资格表、读取与生命周期七个模块。包外依赖只有 runtime-context-contract。关键机制是按提交顺序应用持有者的提交、生产者身份与代际及写入序号、作用域链查找、观察链上限与重取、读取时核资格与翻译、提交之后写入步提交、变化出口、固定的关闭顺序。模块与理由见[内部架构](docs/architecture.md)，五条机制流程见[机制流程](docs/flows.md)，内部对象见[对象模型](docs/object-model.md)。

## 配置与运行

工厂接受观察链保留上限、来源调用与回调的超时，以及变化出口回调。默认值只是配置初值。经 Cordis 时，两项配置由 runtime-context-cordis 的插件配置给出并校验。本成员没有环境前提，运行时不读取资源，不访问存储。注册与步提交的耐久保存归作用域持有者，`persisted` 供给块的值由生产者重新发布。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/runtime-context
```

在本目录执行 `pnpm typecheck` 做类型检查。现有测试只断言根入口没有导出，见 [tests/](tests/README.md)。SPEC 的[持续验证场景](SPEC.md#组合与验证)随实现进入。持久化、跨进程一致性与租户隔离的端到端证据不在本成员。结构检查通过不表示行为已验证。

## 维护

- 契约的读取结果、游标或步提交规则改变时，同步[内部架构](docs/architecture.md)、[机制流程](docs/flows.md)与测试。
- 新增配置项时，同步[公开接口页](docs/public-api.md)与 runtime-context-cordis 的配置 Schema。
- 工厂签名改变时，同步唯一的组内使用方 runtime-context-cordis。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   表与投影、本地行为、关闭与重建
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块与依赖、关键机制与理由
├── flows.md              F-RCI01 至 F-RCI05 机制流程
├── object-model.md       表的条目、游标与实例的生灭
├── public-api.md         导出入口与定义索引
├── context.md            经 Cordis 使用、独立使用与定位
└── cordis.md             不适用 Cordis 集成的理由
src/                      只有 index.ts，现在只有模板标记
tests/                    入口测试，fixtures/ 现在为空
schema/                   现在为空，本成员不发布 Schema
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
