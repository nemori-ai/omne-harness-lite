# @omne-harness/execution-environment

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

执行环境的登记表机制成员，`module` 变体。

## 职责与状态

本成员实现执行环境的登记表：提供者表、设施声明表、获取表与租约视图，按环境授权与作用域绑定核验访问，按允许清单匹配落点，以（租户，获取键）获取，经提供者的配额与原记录处理丢失答复，核验提供者回执并签发采用记录，在每次设施操作前过逐操作门，编排恢复，并按固定顺序关闭。它导出一个不依赖 Cordis 的工厂。公开行为归 [execution-environment-contract](../execution-environment-contract/README_ZH.md)，Cordis 绑定与服务撤除归 [execution-environment-host-local](../execution-environment-host-local/README_ZH.md)。本成员不持有任何耐久状态，四张表都是进程内副本。

状态：机制实现成员，`draft`。采用依据是组的[主题与唯一拥有者](../docs/architecture.md#主题与唯一拥有者)与 [SPEC](SPEC.md)。现在的实现情况如下：

- 已实现：工厂 `createEnvironmentRegistry`、错误类 `RetirementPending`，以及 SPEC 写的访问核验、落点解析、获取与配额预查、采用与采用失败的清理、两种查询与恢复查询、租约视图、释放、描述、登记与退役、资源与获取两条路径的恢复与关闭。
- 待定的事项列在 SPEC 的[明确缺项](SPEC.md#明确缺项)：受管设施操作的账本计划与许可由提供者承担，本成员不调用账本；进程内各表的保留策略待定；块生产者的读取面待定。受管设施操作对账本的使用仍待兑现。本成员与 host-local 都运行契约的公开执行环境套件；套件用替身端口，不证明真实授权、真实绑定来源或耐久性。
- 未验证：本成员不宣称持久化、跨进程一致性或真实资源停止。

现在 execution-environment-host-local 依赖本成员。

## 使用

本成员只有根入口 `@omne-harness/execution-environment`。装配 Cordis 的系统不直接导入它，由 execution-environment-host-local 的 Service 调用工厂。不装配 Cordis 的调用方直接调用工厂：

```ts
import { createEnvironmentRegistry } from '@omne-harness/execution-environment'

const registry = createEnvironmentRegistry<MyPrincipal>({
  recovery: myRecoveryAuthority,
  authority: myEnvironmentAuthority,
  bindings: myScopeBindings,
})
// 登记设施声明与提供者，解析落点，获取租约……
await registry.close()
```

`MyPrincipal` 与三个端口是调用方自己的值。独立调用方自己持有实例、调用 `close()`，并处理撤除函数抛出的 `RetirementPending`。完整写法见[使用与定位](docs/context.md#独立使用)。

## 契约

- 公开形状归 `src/`。导出索引归[公开接口页](docs/public-api.md)。
- 本成员的本地行为归 [SPEC](SPEC.md)：表与视图、落点解析、访问核验、获取、查询、逐操作门、释放、退役、恢复与关闭。
- 九个操作的输入、结果与失败归 [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md)。
- 内部对象的身份与生灭归[对象模型](docs/object-model.md)。

调用工厂的一方拥有登记表实例，负责调用 `close()`。关闭先拒绝新的落点、获取与登记，再使全部租约失效，然后退役全部提供者。关闭不清空表，不撤回外部效果。退役待处置时，撤除函数抛出 `RetirementPending`。

## 设计

源码分登记表、访问核验、原记录、租约视图、恢复编排与比较六个模块。包外依赖是 execution-environment-contract、legal-identity 与 runtime-context-contract 的类型。关键机制是访问核验在读获取表之前、落点与获取分开并在获取时重新核对、先写获取表再调用提供者、配额只由提供者判定、分配答复丢失不重发、采用记录由本成员签发、租约视图是一层逐操作门、撤除即退役、恢复走资源与获取两条路径、恢复授权一次核对、关闭不清空表。模块与理由见[内部架构](docs/architecture.md)，六条机制流程见[机制流程](docs/flows.md)，内部对象见[对象模型](docs/object-model.md)。

## 配置与运行

工厂接受恢复授权、环境授权与作用域绑定三个端口，可调的只有采用失败后的清理等待上界 `cleanupWaitMs`（缺省 1000 毫秒），另可接诊断出口 `diagnose`。资源账本与设施守卫由集成方在每次获取时给出。本成员没有环境前提，运行时不读取资源，不访问存储。获取的耐久状态与采用记录归集成方的账本，本成员重启后按键查询对旧键答复 `unrecorded`；按原获取描述查询仍问原配额域的提供者。

## 验证

在仓库根执行：

```sh
pnpm --filter @omne-harness/execution-environment test
```

在本目录执行 `pnpm typecheck` 做类型检查。八个测试文件共一百二十四个测试，见 [tests/](tests/README.md)，运行记录见 SPEC [组合与验证](SPEC.md#组合与验证)。测试使用替身提供者、替身账本、替身守卫与替身访问端口。持久化、跨进程一致性与真实资源停止的证据不在本成员。结构检查通过不表示行为已验证。

## 维护

- 契约的获取状态、拒绝原因或设施协议改变时，同步[内部架构](docs/architecture.md)、[机制流程](docs/flows.md)与测试。
- SPEC 明确缺项里的某一项兑现时，同步 SPEC、[机制流程](docs/flows.md)与测试。
- 工厂签名或依赖端口改变时，同步[公开接口页](docs/public-api.md)与唯一的组内使用方 execution-environment-host-local。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   表与视图、访问核验、获取、查询、门、释放、退役、恢复、关闭、明确缺项
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       六个模块、依赖、关键机制与理由
├── flows.md              F-EER01 至 F-EER06 机制流程
├── object-model.md       表的条目、租约视图与实例的生灭
├── public-api.md         导出入口与定义索引
├── context.md            经 Cordis 使用、独立使用与定位
└── cordis.md             不适用 Cordis 集成的理由
src/                      index.ts、registry.ts、access.ts、original.ts、lease-view.ts、recovery.ts、compare.ts
tests/                    入口测试与登记表测试，fixtures/ 现在为空
schema/                   现在为空，本成员不发布 Schema
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
