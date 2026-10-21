# @omne-harness/request-context-cordis-contract

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Request Context 的 Cordis 定义成员，`service-contract` 变体。

## 职责与状态

本成员只拥有 Request Context 这一接缝的 Cordis 定义：服务键 `requestContext`、抽象类 `RequestContextService`、intercept 配置 `{ scope }`、变化事件 `request-context-cordis-contract/changed`，以及选择压缩策略与表示策略的配置形状。服务上唯一带寿命的部分是提示词贡献的登记面。纯操作、提示词贡献的两类与组装规则归 [request-context-contract](../request-context-contract/README.md)，缓存、预计算派生物与默认策略归 [request-context](../request-context/README_ZH.md)，Service 实现归 [request-context-cordis](../request-context-cordis/README_ZH.md)。本成员只认通用角色：贡献者、调用方、监听者与提供者。

状态：Cordis 定义成员，`draft`。采用依据是系统页的[提示词贡献登记面](../../../docs/architecture/runtime/request-context.md#提示词贡献登记面)、[成员与 Cordis 落位](../../../docs/architecture/runtime/request-context.md#成员与-cordis-落位)与 [IC 约定](../../../docs/architecture/cordis-integration-conventions.md)。现在的实现情况如下：

- 已实现：没有。`src/index.ts` 与 `src/cordis.ts` 只有模板标记，两个入口都没有导出。
- 未实现：抽象类、键常量、intercept 配置类型、策略选择的配置形状、`Context` 与 `Events` 增补，以及根入口的类型重导出。
- 未验证：一条 Cordis 机制读数还没有进入 basis，所以 SPEC 的性质 7 是假设，见 [Cordis 说明](docs/cordis.md#机制读数与假设)。
- 经 Cordis 的调用方用 `assembly(scope)` 用到带缓存与选定策略的实现；全局层以 `scope: null` 表达。明确缺项：`ScopeRef` 从哪里来、事件由哪一侧按作用域过滤，SPEC 没有写明，见 [Cordis 说明](docs/cordis.md)。

现在没有包依赖本成员。

## 使用

本成员有两个入口：

- 根入口 `@omne-harness/request-context-cordis-contract`：只重导出契约类型，不导入 Cordis。
- `@omne-harness/request-context-cordis-contract/cordis`：服务定义。

实现进入后，贡献者插件这样声明作用域并在插件体里登记：

```text
import type {} from '@omne-harness/request-context-cordis-contract/cordis'
inject: { requestContext: { scope: 作用域引用 } }
插件体：dispose = ctx.requestContext.contributeSection(段)
```

登记随贡献者插件卸载自动撤除。组装请求的调用方用 `inject: ['requestContext']`，调用 `assembly(scope)` 取得已按配置绑定策略的一组纯操作。这组操作每次调用时从登记面现取该作用域的贡献，调用方不传入贡献。各类依赖方的完整用法见[使用与定位](docs/context.md#使用方式)。

独立使用不需要本成员。不装配 Cordis 的调用方自己收集提示词贡献，直接使用 request-context-contract 与 request-context 的根入口。

## 契约

- 公开形状归 `src/`，现在为空。
- 类型以外的行为归 [SPEC](SPEC.md)，性质 1 至 10。
- 服务定义、intercept 配置、事件、依赖分类、登记与撤除协议、策略选择、IC 符合性映射归 [Cordis 说明](docs/cordis.md)。
- 导出索引归[公开接口页](docs/public-api.md)。
- 提示词贡献的两类、逐请求变量的拒绝，以及纯操作的输入、结果与失败归 [request-context-contract SPEC](../request-context-contract/SPEC.md)。

本成员不持有资源。贡献登记的寿命归贡献者插件的 fiber，事件监听的寿命归监听者的 fiber。服务撤除与在途组装的结算归提供者。

## 设计

根入口与 `./cordis` 各一个源文件。包外依赖是 request-context-contract 的类型与 `@deepseek-ai/cordis`。本成员不导入机制实现或提供者实现。服务只有一个键，只承载登记面，纯操作留在契约根入口。事件只做带修订的失效提示，不是事实源。策略选择是配置，不是服务方法。模块与理由见[内部架构](docs/architecture.md)，两条机制流程见[机制流程](docs/flows.md)，三个技术对象见[对象模型](docs/object-model.md)。

## 配置与运行

本成员没有自己的插件配置，没有环境前提，运行时不读取资源。intercept 配置 `{ scope }` 是贡献者插件的装配声明，不是本成员的配置。本成员定义策略选择的配置形状，提供者 [request-context-cordis](../request-context-cordis/docs/cordis.md) 校验这份配置并选择实现。默认策略的数值归 [request-context](../request-context/SPEC.md)。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/request-context-cordis-contract
```

在本目录执行 `pnpm typecheck` 做类型检查。现有两个测试只断言两个入口没有导出，见 [tests/](tests/README.md)。机制性质的验证要先补 basis probe，登记行为再由提供者的测试承担。结构检查通过不表示行为已验证。

## 维护

- 契约的登记面操作类型或 `PromptContribution` 改变时，同步抽象类、[公开接口页](docs/public-api.md)与导出测试。
- 改服务键、intercept 配置、事件或策略选择的配置形状时，同步 [Cordis 说明](docs/cordis.md)与提供者 request-context-cordis。
- Cordis 升版时，先重跑 Cordis 说明列出的 basis probe。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   类型以外的行为，性质 1 至 10
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       两个入口、依赖、关键机制与理由
├── flows.md              F-RQD01、F-RQD02 机制流程
├── object-model.md       三个技术对象，领域对象指向契约
├── public-api.md         导出入口与定义索引
├── context.md            依赖方的用法与定位
└── cordis.md             服务定义、事件、登记协议、策略选择与 IC 映射
src/                      index.ts 与 cordis.ts，现在只有模板标记
tests/                    两个入口测试，fixtures/ 现在为空
schema/                   现在为空，本成员不发布 Schema
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
