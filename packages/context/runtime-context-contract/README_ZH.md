# @omne-harness/runtime-context-contract

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Runtime Context 的纯契约成员，`module` 变体。

## 职责与状态

本成员拥有 Runtime Context 的协议：块声明、上下文需要、需要绑定、注册、读取资格、绑定读者、快照与变化、上下文更新、步提交、变化材料的类型，以及对它们的五个纯核对函数。它不拥有任何一块的内容，不判断动作能不能做，不组装模型请求，不保存历史。它只认通用角色：作用域持有者、生产者、消费者类、集成方、协调者与调用方。

状态：契约成员，`draft`。[SPEC](SPEC.md) 写明了哪些部分由技术接受采用，哪些部分依据产品正文第 4 版写入。现在的实现情况如下：

- 已实现：`src/` 只有共享类型与两类块声明，全部是类型，根入口没有运行值。
- 未实现：需要、绑定、注册、资格、读者、更新、步提交、变化材料的类型，以及 `judgeNeed`、`judgeBinding`、`judgeRegistration`、`reduceStep`、`diffForReminder`。
- 未验证：SPEC 的全部行为条款。本成员没有运行实现，不宣称租户隔离、并发、恢复或性能通过。

现在的真实消费者是 execution-environment-contract 与 execution-environment，它们使用作用域引用与块声明类型。

## 使用

本成员只有根入口 `@omne-harness/runtime-context-contract`。语义拥有者在自己的包里导出块声明，并增补块表：

```ts
import type { SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'example.locale': { tag: string }
  }
}

export const localeBlock: SuppliedBlockDescriptor<'example.locale', { tag: string }> = {
  kind: 'supplied',
  key: 'example.locale',
  schema: localeSchema,
  consumers: ['model', 'tool'],
  required: false,
  disclosure: 'plain',
  carriesPrevious: true,
  volatility: 'stable',
  recovery: 'reread',
}
```

`localeSchema` 是任何实现 Standard Schema 的校验器。完整示例与独立消费路径见[使用与定位](docs/context.md#使用方式)。

独立使用只需安装本成员，不需要作用域持有者，也不需要 Cordis。本成员没有 `./cordis` 入口。Cordis 集成走组内其他成员，见 [Cordis 说明](docs/cordis.md)。

## 契约

- 公开形状归 [src/index.ts](src/index.ts)。
- 类型以外的行为归 [SPEC](SPEC.md)，条款 RC-01 至 RC-08。
- 导出索引归[公开接口页](docs/public-api.md)，它分开列出现有导出与随实现进入的导出。
- 对象的身份、拥有者与生灭归[对象模型](docs/object-model.md)。

读取有四种结果：成功、拒绝、缺项、未知；`changes` 另有游标作废。注册、块内容与步提交是三笔分开的提交，都不在本成员内发生，本成员只给核对结果与合并材料。本成员不持有资源，没有需要释放的对象。

## 设计

根入口按共享类型、块声明、需要与绑定、注册与资格、读者与观察、更新与提交、纯函数七个模块组织，依赖单向。包外依赖只有 `@standard-schema/spec`，以及随读取资格进入的 legal-identity。模块切分与设计理由见[内部架构](docs/architecture.md)，八条协议流程见[协议流程](docs/flows.md)，对象见[对象模型](docs/object-model.md)。

## 配置与运行

本成员没有配置，没有环境前提，运行时不读取资源。调用方负责提供作用域引用、块声明、生产者与资格材料，并负责注册、步提交与提醒的提交和存储。访问系统托管的数据时，仍适用原访问契约。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/runtime-context-contract
```

在本目录执行 `pnpm typecheck` 做类型检查。现有测试只断言根入口没有运行导出，见 [tests/](tests/README.md)。SPEC 的[持续验证义务](SPEC.md#持续验证义务)都还没有测试覆盖。结构检查通过不表示行为已验证。

## 维护

- 公开导出变化时，同步 SPEC、[公开接口页](docs/public-api.md)、[src 索引](src/index.md)与导出测试。
- 块声明字段、消费者类或读取结果变化时，同步依赖方：execution-environment-contract、request-context-contract、runtime-context-cordis-contract、runtime-context。
- 新增具体块由语义拥有者在自己的包里完成，本成员不改。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为，RC-01 至 RC-08
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块与依赖、关键机制与理由
├── flows.md              F-RC01 至 F-RC08 协议流程
├── object-model.md       对象、生命周期与状态
├── public-api.md         导出入口与定义索引
├── context.md            独立消费、邻域交接与系统定位
└── cordis.md             不适用 Cordis 集成的理由
src/                      公开类型，现在只有 index.ts
tests/                    持续测试，fixtures/ 现在为空
schema/                   现在为空，本成员不发布 Schema
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
