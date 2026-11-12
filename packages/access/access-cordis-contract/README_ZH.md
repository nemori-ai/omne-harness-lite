# @omne-harness/access-cordis-contract

[English](README.md)

接入贡献的类型与登记表的 Cordis 服务定义。一个领域把自己对外开放的协议交给接入层时，照这里的类型写一份「贡献」，再用 `mount` 挂到入口的登记表上。设计依据是 [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md#登记表与贡献) 第 5 节。

## 职责与状态

本成员拥有领域一侧看得到的全部形状：贡献、处理函数、调用上下文、观察上下文、帧来源的类型，以及登记表的服务定义 `AccessRegistryService`。领域只看得到 `mount`。管道用的 `enter`、`subscribe` 不在这里，它们归[服务端接入](../server-entry/SPEC.md)的登记表。

已实现：上面的类型与服务定义。登录身份 `LoginIdentity` 与主体 `Principal` 暂时是不透明的类型，接上身份的那一程再定形状。`defineAccessPlugin` 还没有建。实际消费者：服务端接入的登记表提供者，以及它的测试贡献；还没有领域的接入插件。

## 使用

```ts
import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'

const empty = ruleCodec({ kind: 'object', fields: {} })
const notes = defineProtocol({
  name: 'notes',
  major: 1,
  operations: {
    ping: { identity: 'none', effect: 'read', limit: 'small', body: empty, outcomes: { succeeded: empty } },
  },
  observations: {},
})
const contribution: AccessContribution<typeof notes> = {
  protocol: notes,
  operations: { ping: async () => ({ outcome: 'succeeded', body: {} }) },
  observations: {},
}

// 在接入插件里：ctx.accessRegistry.mount(contribution)
```

`mount` 是调用者 Cordis 作用域上的一个效应。插件卸载时协议自动撤下，卸载等这份贡献的在途工作都结束。接入插件不写撤下的代码。

根入口是纯类型加一个错误类 `AccessAssemblyError`，不导入 Cordis。`./cordis` 导出 `AccessRegistryService` 与服务名 `accessRegistryKey`（值是 `accessRegistry`）。

## 契约

类型从协议契约推出：

- 贡献要为契约里的每个操作写一个处理函数，为每个观察写一个帧来源；漏了或多了都编不过。
- 处理函数的消息体类型取自操作的 `body` 编解码；答复只能是结果集里的结果，带编解码的结果带对应的消息体，固定结果不带消息体。
- 调用上下文里的主体按 `identity` 一栏：`none` 没有，`login` 是登录身份，`acting-tenant` 是代租户行事的主体。

同名同主版本的协议再挂一次，`mount` 抛 `AccessAssemblyError`，调用者的插件失败，已挂的那份不动。挂上与撤下的完整行为归 [SPEC.md](SPEC.md)，公开定义的导航在 [docs/public-api.md](docs/public-api.md)。

## 设计

`AccessRegistryService.mount` 是具体方法，把挂上包进 `this.ctx.effect`；提供者实现受保护的 `attach`：同步挂上或抛错，返回撤下函数，撤下函数返回一个在最后一个在途工作结束时完成的 Promise。这样「卸载就是撤下」只写在一处。设计细节见 [docs/architecture.md](docs/architecture.md)。

## 配置与运行

本成员没有配置。服务由入口的应用装配提供；宽限等运行参数归服务端接入的登记表与收场。

## 验证

- `pnpm exec vitest run --mode fast`：入口导出与错误类的测试，以及 `tests/contribution.spec-d.ts` 的类型断言（漏操作、参数与契约不一致、结果不在结果集里、消息体与编解码不一致都编不过）。
- 卸载就是撤下在真实 Cordis 4.0.4 上的验证在服务端接入的测试里，因为那里有提供者。

## 维护

公开契约里 `OperationContract`、`ObservationContract`、`Codec` 的形状变了，这里的类型与 `tests/contribution.spec-d.ts` 跟着改。`AccessRegistryService` 的签名变了，同步服务端接入的提供者与以后各领域的接入插件。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、状态与资源归属、关键机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费侧使用与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、运行时校验与内部实现
tests/                    持续测试；fixtures/ 存放测试输入
schema/                   对外 Schema
verification/             models/ 与 proofs/
adr/                      有持续消费者的实现取舍
examples/                 面向公开入口的示例
resources/                运行所需的非源码资源
acceptance/               独立验收；fixtures/ 存放验收输入
```

每个目录的 README.md 说明职责，index.md 负责导航。阅读路径见 [index.md](index.md)。docs 专题可以升级为同名目录，目录内须有 README.md 与 index.md；专题移动时同步本结构图。
