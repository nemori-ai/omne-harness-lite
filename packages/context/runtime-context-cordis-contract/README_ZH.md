# @omne-harness/runtime-context-cordis-contract

[English](README.md)

Runtime Context 的 Cordis 定义成员，`service-contract` 变体。

## 职责与状态

本成员只拥有 Runtime Context 这一接缝的 Cordis 定义：服务键 `runtimeContext`、抽象类 `RuntimeContextService`、intercept 配置 `{ consumer }`，以及唤醒事件 `runtime-context-cordis-contract/changed`。三面操作的领域行为归 [runtime-context-contract](../runtime-context-contract/README_ZH.md)，供给机制归 [runtime-context](../runtime-context/README_ZH.md)，Service 实现归 [runtime-context-cordis](../runtime-context-cordis/README_ZH.md)。本成员只认通用角色：生产者、作用域持有者、消费者类与监听者。

状态：Cordis 定义成员，`draft`。采用依据是[系统页的成员与 Cordis 落位](../../../docs/architecture/runtime/runtime-context.md#成员与-cordis-落位)与 [IC 约定](../../../docs/architecture/cordis-integration-conventions.md)。现在的实现情况如下：

- 已实现：抽象 Service、唯一键、intercept 类型、Context/Events 增补，以及根入口的显式类型重导出。
- 领域机制和具体提供者归各自实现成员。
- 三条机制读数已有本成员的真实 Cordis 4.0.4 测试；共同 basis 登记仍缺，见 [Cordis 说明](docs/cordis.md#机制读数与假设)。

现在没有包依赖本成员。

## 使用

本成员有两个入口：

- 根入口 `@omne-harness/runtime-context-cordis-contract`：只重导出契约类型，不导入 Cordis。
- `@omne-harness/runtime-context-cordis-contract/cordis`：服务定义。

消费者一侧的适配器插件这样声明自己的消费者类：

```ts
import type {} from '@omne-harness/runtime-context-cordis-contract/cordis'

export const inject = {
  runtimeContext: { consumer: 'model' },
}
```

生产者插件用 `inject: ['runtimeContext']`，在插件体里调用 `registerProducer`。登记随插件卸载自动撤除。各类依赖方的完整用法见[使用与定位](docs/context.md#使用方式)。

独立使用不需要本成员。不装配 Cordis 的调用方直接使用 runtime-context-contract 与 runtime-context 的根入口。

## 契约

- 公开形状归 `src/`，现在为空。
- 类型以外的行为归 [SPEC](SPEC.md)，性质 1 至 8。
- 服务定义、事件、依赖分类、登记与撤除协议、IC 符合性映射归 [Cordis 说明](docs/cordis.md)。
- 导出索引归[公开接口页](docs/public-api.md)。
- 三面操作的输入、结果与失败归 [runtime-context-contract SPEC](../runtime-context-contract/SPEC.md)。

本成员不持有资源。生产者登记的寿命归生产者插件的 fiber，事件监听的寿命归监听者的 fiber。服务撤除、在途读取结算与迟到发布的丢弃归提供者。

## 设计

根入口与 `./cordis` 各一个源文件。包外依赖是 runtime-context-contract 的类型与 `@deepseek-ai/cordis`。本成员不导入机制实现或提供者实现。服务只有一个键，块是数据不是服务。模块与理由见[内部架构](docs/architecture.md)，两条机制流程见[机制流程](docs/flows.md)，三个技术对象见[对象模型](docs/object-model.md)。

## 配置与运行

本成员没有插件配置，没有环境前提，运行时不读取资源。intercept 配置 `{ consumer }` 是消费者插件的装配声明，不是本成员的配置。提供者的配置归 [runtime-context-cordis](../runtime-context-cordis/docs/cordis.md)。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/runtime-context-cordis-contract
```

在本目录执行 `pnpm typecheck` 做类型检查。现有测试核对入口、导出清单、类型泛型与真实 Cordis 调用方生命周期，见 [tests/](tests/README.md)。三条机制读数已在本成员测试中固定；共同 basis 登记与生产提供者的完整义务仍分别维护。结构检查通过不表示行为已验证。

## 维护

- 契约的三面操作类型改变时，同步抽象类、[公开接口页](docs/public-api.md)与导出测试。
- 改服务键、intercept 配置或事件时，同步 [Cordis 说明](docs/cordis.md)与提供者 runtime-context-cordis。
- Cordis 升版时，先重跑 Cordis 说明列出的 basis probe。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   类型以外的行为，性质 1 至 8
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       两个入口、依赖、关键机制与理由
├── flows.md              F-RCD01、F-RCD02 机制流程
├── object-model.md       三个技术对象，领域对象指向契约
├── public-api.md         导出入口与定义索引
├── context.md            依赖方的用法与定位
└── cordis.md             服务定义、事件、登记协议与 IC 映射
src/                      index.ts 类型重导出与 cordis.ts 服务定义
tests/                    两个入口测试，fixtures/ 现在为空
schema/                   现在为空，本成员不发布 Schema
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
