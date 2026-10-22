# @omne-harness/execution-environment-contract

[English](README.md)

Execution Environment 的纯契约成员，`module` 变体。

## 职责与状态

本成员拥有执行环境的契约：访问身份、绑定层、连续性、环境要求、落点、获取、采用记录、租约与受管资源的类型；资源账本、设施守卫、恢复授权三个需要端口；按名登记的设施协议与 `files`、`command`、`terminal` 三个核心设施；工具环境声明的 schema 与采用身份；`execution.placement` 与 `execution.host-facts` 两条块声明；以及 `judgeRequirement`、`matchProviders` 两个纯函数。

它不判断动作能不能做，不选择该落哪一层，不认识策略词，也不记录工具做了什么。它只认通用角色：访问身份、作用域引用、原调用引用、请求身份、集成方、提供者、设施拥有者、维护者与观察者。

状态：契约成员，`draft`。[SPEC](SPEC.md) 写明了哪些部分由技术接受采用，哪些部分依据产品正文第 2 版写入。现在的情况如下：

- 已实现：全部公开类型、三个核心设施的协议与声明、需要声明的 JSON Schema 与 Standard Schema、采用身份、两条块声明、两个纯函数、`describeFacility` 与 `createRecoveryAccess`。
- 已有测试：导出面、设施声明、块声明、不导入 Cordis、环境要求的解码、提供者匹配、需要声明的 schema 与摘要，以及类型测试。
- 没有提供者：本成员不实现任何设施或环境。宿主提供者在 [execution-environment-host-local](../execution-environment-host-local/README.md)。
- 已实现：三面八操作的参数 schema、六个数据结果 schema 与 `operationSchemas`；登记面返回撤除函数，不另做结果 schema。`./testing` 提供用例列表与非耐久替身。设施自身逐操作 schema 留后续。
- 未验证：SPEC 的大部分行为条款需要机制成员、提供者与真实集成方的组合验证。本成员不宣称租户隔离、资源关闭、耐久或恢复已经通过。

现在的真实消费者是组内的 execution-environment-cordis-contract、execution-environment 与 execution-environment-host-local。

## 使用

本成员有根入口 `@omne-harness/execution-environment-contract` 与测试入口 `./testing`。工具包用它写环境声明，并推出执行者能拿到的设施：

```ts
import {
  environmentNeedAdoption,
  type EnvironmentNeedDeclaration,
  type FacilitySet,
} from '@omne-harness/execution-environment-contract'

export const shellNeeds = {
  facilities: ['command', 'terminal'],
  isolation: ['process'],
  layers: ['host_machine', 'session_sandbox', 'tenant_sandbox'],
} as const satisfies EnvironmentNeedDeclaration

export type ShellEnvironment = FacilitySet<(typeof shellNeeds)['facilities'][number]>
export const shellEnvironmentSlot = { schema: environmentNeedAdoption, value: shellNeeds }
```

完整示例在 [examples/shell-needs.ts](examples/shell-needs.ts)。集成方、提供者作者与设施拥有者的做法见[使用与定位](docs/context.md#使用方式)。

独立使用只需要本成员，不需要 Cordis。取得落点与租约还需要机制成员 [execution-environment](../execution-environment/README.md) 与一个提供者成员。本成员没有 `./cordis` 入口，Cordis 集成走组内其他成员，见 [Cordis 说明](docs/cordis.md)。本成员没有初始化步骤，也没有需要释放的对象。

## 契约

- 公开形状归 [src/index.ts](src/index.ts)。
- 类型以外的行为归 [SPEC](SPEC.md)，不变量 INV-EE01 至 INV-EE18，持续验证义务 V-EE01 至 V-EE22。
- 导出索引、需要声明的 schema 与两条块声明归[公开接口页](docs/public-api.md)。
- 对象的身份、拥有者与生灭归[对象模型](docs/object-model.md)。
- 设施协议的规则以 [SPEC](SPEC.md#设施协议) 为唯一源，[内部架构](docs/architecture.md#设施协议)逐设施展开并说明理由。

设施操作的结果有四态：完成、未找到对象、拒绝、未知。获取以集成方的幂等键识别，同键重复请求不重新分配。采用记录由本成员的实现在核验提供者回执之后签发。本成员不提交任何耐久事实：资源许可、终局、采用记录与释放记录都由集成方的账本保存。

## 设计

根入口按身份、绑定层、要求、设施、三个核心设施、端口、租约、提供者与操作面、需要声明、块声明、纯函数分成源模块，依赖单向。包外依赖是 runtime-context-contract、legal-identity、operation-result、json-text、schema-provider 与 `@standard-schema/spec`，其中operation-result、json-text 与 legal-identity 是运行值依赖。模块切分、关键机制的理由与设施协议见[内部架构](docs/architecture.md)，九条协议流程见[协议流程](docs/flows.md)，对象见[对象模型](docs/object-model.md)。

## 配置与运行

本成员没有配置，没有环境前提，运行时不读取资源。集成方负责提供访问身份、作用域引用、原调用引用、允许清单、获取键与请求身份，并实现资源账本、设施守卫与恢复授权三个端口。允许清单的策略求值在本成员之外。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/execution-environment-contract
```

在本目录执行 `pnpm test` 运行测试与类型测试，执行 `pnpm typecheck` 做类型检查。测试的覆盖见 [tests/](tests/README.md)。SPEC 的[持续验证义务](SPEC.md#持续验证义务)大部分不能只在本成员里验证。结构检查与本成员的测试通过不表示组合行为已验证。

## 维护

- 公开导出变化时，同步 SPEC、[公开接口页](docs/public-api.md)、[src 索引](src/index.md)与导出测试。
- 设施操作、结果四态或拒绝原因变化时，同步[设施协议](docs/architecture.md#设施协议)、机制成员与提供者成员。
- schema 文件变化时，同步采用身份的 `digest`（形状变化时还有 `revision`）、[schema 目录](schema/README.md)与工具侧的采用。
- 块字段变化时，同步 host-local 的 Service 实现里的生产者与 Runtime Context 的读者。
- 新设施由设施拥有者在自己的包里增补，新沙箱是新的提供者成员，本成员都不改。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为，INV-EE01 至 INV-EE18
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块与依赖、关键机制、设施协议、Q-EE02 至 Q-EE06
├── flows.md              F-EEC01 至 F-EEC06 协议流程
├── object-model.md       角色、对象、关系与生命周期
├── public-api.md         导出入口、定义索引、schema 与块声明
├── context.md            独立消费、集成方、邻域交接与系统定位
└── cordis.md             不适用 Cordis 集成的理由
src/                      公开定义，facilities/ 是三个核心设施
tests/                    运行测试与类型测试，fixtures/ 现在为空
schema/                   工具环境声明的 JSON Schema
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 工具环境声明的示例
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
