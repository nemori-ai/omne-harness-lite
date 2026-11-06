# @omne-harness/skill-cordis-contract

[English](README.md)

Skill 的 Cordis 定义成员，`service-contract` 变体。

## 职责与状态

本成员只拥有 Skill 各接缝的 Cordis 定义：五个抽象 `Service` 与它们的键，即 `PackageInspectionService`（`skillPackageInspection`）、`SkillCatalogService<P, S>`（`skillCatalog`）、`SkillAccessService<P, S>`（`skillAccess`）、`SkillReadCheckService<P, S>`（`skillReadCheck`）与 `SkillResolutionService<P, S>`（`skillResolution`），每个类对应一个导出的键常量（`skillPackageInspectionKey`、`skillCatalogKey`、`skillAccessKey`、`skillReadCheckKey`、`skillResolutionKey`），以及这五个键的 `Context` 增补。

本成员不拥有任何行为。五个接口归 [skill-contract](../skill-contract/README_ZH.md)，三个服务的实现归 [skill](../skill/README_ZH.md)，提供三个服务的插件归 [skill-host-local](../skill-host-local/README_ZH.md)。两个端口服务（`skillReadCheck`、`skillResolution`）由别的领域提供。本成员只认通用角色：服务的消费者与端口的提供者。

状态：Cordis 定义成员，行为是候选，尚未取得技术接受。采用依据是[组页](../README.md#成员与依赖)的成员分工与 [IC 约定](../../../docs/architecture/cordis-integration-conventions.md)。现在的实现情况如下：

- 已实现：`./cordis` 导出五个抽象类与五个键常量（各取自对应类的 `provide`），并声明 `Context` 增补。根入口没有导出。
- 已测试：五个键、导出集合、子类在真实 Cordis 4.0.4 `Context` 上的装载与卸载，以及根入口的导入边界。
- 未实现：事件（没有声明）与 `./testing` 入口（没有计划）。

## 使用

本成员有两个入口：

- 根入口 `@omne-harness/skill-cordis-contract` 没有导出，不加载 Cordis。
- `@omne-harness/skill-cordis-contract/cordis` 承载服务定义。

端口的提供方继承抽象类，并把它作为插件装载。插件卸载时，Cordis 撤除这个服务：

```ts
import { Context } from '@deepseek-ai/cordis'
import {
  SkillReadCheckService,
  skillReadCheckKey,
} from '@omne-harness/skill-cordis-contract/cordis'

class Check extends SkillReadCheckService<unknown, unknown> {
  async check() {
    return { kind: 'refused' } as const
  }
}

const ctx = new Context()
await ctx.plugin(Check)
const check = ctx.get(skillReadCheckKey) // 实例，或 undefined
```

消费方用 `ctx.get(<键常量>)` 读取服务，并接受 `undefined`。各类依赖方的用法见[使用与定位](docs/context.md#使用方式)。

独立使用不需要本成员。不用 Cordis 的调用方使用 skill-contract 与 skill 的根入口。

## 契约

- `src/cordis.ts` 拥有公开形状。
- [SPEC](SPEC.md) 拥有类型以外的行为，见性质 1 至 8。
- [Cordis 说明](docs/cordis.md)拥有依赖分类与 IC 符合性映射。
- [公开接口页](docs/public-api.md)索引导出。
- 五个接口的输入、结果与失败归各自的规格：`PackageInspection` 见 [skill-contract SPEC](../skill-contract/SPEC.md#parse)，`SkillCatalog` 与 `SkillAccess` 见 [skill SPEC](../skill/SPEC.md#catalog)，两个端口见 [skill-contract SPEC 的需求端口](../skill-contract/SPEC.md#ports)。

本成员不持有资源。服务的寿命归装载子类的那个插件的 fiber。

## 设计

本成员有一个带定义的源文件。它依赖 skill-contract 的类型与 `@deepseek-ai/cordis`，不导入任何提供者。每个键只写在各自类的 `provide` 里。模块与理由见[内部架构](docs/architecture.md)，装载与撤除流程见[关键流程](docs/flows.md)，技术对象见[对象模型](docs/object-model.md)。

## 配置与运行

本成员没有插件、没有配置、不需要环境，运行时不读任何资源。提供三个服务的插件在 [skill-host-local](../skill-host-local/docs/cordis.md)。

## 验证

在仓库根运行：

```sh
pnpm --filter @omne-harness/skill-cordis-contract test
```

在本成员目录运行 `pnpm typecheck` 做类型检查。测试在真实 Cordis 4.0.4 上运行，覆盖键、导出集合、子类的装载与卸载，以及根入口的导入边界。范围与限制见 [tests/](tests/README.md)。结构检查通过不表示 Skill 行为已验证。

## 维护

- skill-contract 的五个接口之一增删方法时，同步抽象类、[公开接口页](docs/public-api.md)与导出测试。
- 键改变时，同步 [Cordis 说明](docs/cordis.md)与 skill-host-local 的插件。
- Cordis 升版前，运行本成员与 skill-host-local 的测试。
- 成员关系与依赖方向归[组页](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为，性质 1 至 8
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       两个入口、依赖、关键机制与理由
├── flows.md              服务的装载与撤除流程
├── object-model.md       五个技术对象与 Context 增补
├── public-api.md         公开边界与定义索引
├── context.md            各类依赖方的用法与定位
└── cordis.md             服务定义、依赖分类与 IC 符合性映射
src/                      index.ts 空导出，cordis.ts 服务定义
tests/                    入口测试；fixtures/ 为空
schema/                   空，本包不发布 Schema
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               独立验收；本成员尚未填写
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
