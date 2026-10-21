# @omne-harness/execution-environment-cordis-contract

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

执行环境的 Cordis 定义成员，`service-contract` 变体。

## 职责与状态

本成员只拥有执行环境这一接缝的 Cordis 定义：服务键 `executionEnvironment`、抽象类 `ExecutionEnvironmentService<P>`、intercept 配置类型 `ExecutionEnvironmentIntercept`，以及 `Context` 增补。八个方法的领域行为归 [execution-environment-contract](../execution-environment-contract/README_ZH.md)，登记表机制归 [execution-environment](../execution-environment/README_ZH.md)，Service 实现与宿主提供者归 [execution-environment-host-local](../execution-environment-host-local/README_ZH.md)。本成员只认通用角色：集成方、维护者、提供者与设施拥有者。

状态：Cordis 定义成员，`draft`。采用依据是[系统页执行环境](../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备)的成员分工与 [IC 约定](../../../docs/architecture/cordis-integration-conventions.md)。现在的实现情况如下：

- 已实现：`./cordis` 导出抽象类与键常量，并声明 intercept 配置类型与 `Context` 增补。根入口是空导出。
- 未实现：调用方类的核对。没有 Service 实现读取 intercept 配置，见 [Cordis 说明](docs/cordis.md#intercept-配置与调用方类)。
- 未验证：读取 intercept 配置的机制只有源码读数，还没有进入 basis。根入口与 `./cordis` 的导入边界没有逐文件检查。

现在 execution-environment-host-local 依赖本成员。

## 使用

本成员有两个入口：

- 根入口 `@omne-harness/execution-environment-cordis-contract`：空导出，不导入 Cordis。
- `@omne-harness/execution-environment-cordis-contract/cordis`：服务定义。

提供者插件这样登记，登记随插件卸载自动撤除：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'

export const inject = [executionEnvironmentKey]
export function apply(ctx: Context) {
  ctx.executionEnvironment.registerFacility(myFacilityDescriptor)
  ctx.executionEnvironment.registerProvider(myProvider)
}
```

`myFacilityDescriptor` 与 `myProvider` 是提供者自己的值，形状归契约。维护者插件用对象形式 `inject: { executionEnvironment: { caller: 'maintainer' } }`。各类依赖方的完整用法见[使用与定位](docs/context.md#使用方式)。

独立使用不需要本成员。不装配 Cordis 的调用方直接使用 execution-environment-contract 与 execution-environment 的根入口。

## 契约

- 公开形状归 `src/cordis.ts`。
- 类型以外的行为归 [SPEC](SPEC.md)，性质 1 至 8。
- 服务定义、方法分面、intercept 配置、登记与撤除协议、依赖分类与 IC 符合性映射归 [Cordis 说明](docs/cordis.md)。
- 导出索引归[公开接口页](docs/public-api.md)。
- 八个方法的输入、结果与失败归 [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md)。

本成员不持有资源。设施声明与提供者的登记寿命归调用方插件的 fiber。服务撤除时的关闭顺序与退役待处置的报告归 Service 实现。

## 设计

根入口与 `./cordis` 各一个源文件。包外依赖是 execution-environment-contract 的类型与 `@deepseek-ai/cordis`。本成员不导入机制实现或 Service 实现。服务只有一个键，设施与提供者都经登记面登记，不各自成为服务。本成员不声明事件。模块与理由见[内部架构](docs/architecture.md)，两条机制流程见[机制流程](docs/flows.md)，技术对象见[对象模型](docs/object-model.md)。

## 配置与运行

本成员没有插件配置，没有环境前提，运行时不读取资源。intercept 配置 `{ caller }` 是调用方插件的装配声明，不是本成员的配置。Service 实现的配置归 [execution-environment-host-local](../execution-environment-host-local/docs/cordis.md)。

## 验证

在仓库根执行：

```sh
pnpm --filter @omne-harness/execution-environment-cordis-contract test
```

在本目录执行 `pnpm typecheck` 做类型检查。现有两个测试文件共四个测试：根入口没有运行导出，`./cordis` 的导出集合与键常量，子类在键上提供服务并随插件卸载撤除。见 [tests/](tests/README.md)。2026-10-21 在 Node v24.18.0、linux 上，这两个文件的四个测试全部通过。调用方类核对与导入边界没有测试。结构检查通过不表示行为已验证。

## 维护

- 契约的 `ExecutionEnvironment<P>` 或 `ProviderRegistrations` 增删方法时，同步抽象类、[公开接口页](docs/public-api.md)与导出测试。
- 改服务键或 intercept 配置时，同步 [Cordis 说明](docs/cordis.md)与 Service 实现 execution-environment-host-local。
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
├── flows.md              F-EED01、F-EED02 机制流程
├── object-model.md       两个技术对象，领域对象指向契约
├── public-api.md         导出入口与定义索引
├── context.md            依赖方的用法与定位
└── cordis.md             服务定义、调用方类、登记协议与 IC 映射
src/                      index.ts 空导出，cordis.ts 服务定义
tests/                    两个入口测试，fixtures/ 现在为空
schema/                   现在为空，本成员不发布 Schema
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
