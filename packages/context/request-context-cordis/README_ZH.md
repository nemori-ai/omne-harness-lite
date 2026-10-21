# @omne-harness/request-context-cordis

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Request Context 的 Service 实现成员，`service-provider` 变体。

## 职责与状态

本成员把 [request-context](../request-context/README_ZH.md) 的机制装进 [request-context-cordis-contract](../request-context-cordis-contract/README_ZH.md) 定义的服务 `requestContext`，并承担贡献登记表、按配置选择策略实现、配置校验失败、isolate 绑定与撤除。领域行为归 [request-context-contract](../request-context-contract/README.md)，机制行为归 request-context，两者都不在本成员。

状态：Service 实现成员，`draft`。采用依据是系统页的[成员与 Cordis 落位](../../../docs/architecture/runtime/request-context.md#成员与-cordis-落位)与 [SPEC](SPEC.md)。现在的实现情况如下：

- 已实现：没有。`src/index.ts` 与 `src/cordis.ts` 只有模板标记，两个入口都没有导出。
- 未实现：具体子类、插件、配置 Schema、贡献登记表与根入口的工厂。
- 未验证：性质 2 的 intercept 部分与性质 3 的过滤部分依赖还没有进入 basis 的机制读数，现在是假设。SPEC 列出的七项验证义务都没有测试。本成员不宣称持久化或跨进程一致性。
- 明确缺项：服务定义上没有组装入口，SPEC 没有写明经 Cordis 的调用方怎样用到机制实例。机制实例怎样得知贡献变化、根入口工厂与机制工厂怎样分工，SPEC 也没有写明，见 [Cordis 说明](docs/cordis.md#插件与服务)。

现在没有应用装配本插件，也没有包依赖本成员。

## 使用

本成员有两个入口：

- `@omne-harness/request-context-cordis/cordis`：插件。应用装配者在插件树里加一行本插件并给出配置。
- `@omne-harness/request-context-cordis`：不依赖 Cordis 的工厂，输出与插件相同的实现。

贡献者与组装请求的调用方不导入本成员，它们经服务定义使用服务。装配行与独立使用见[使用与定位](docs/context.md#使用方式)。插件与工厂都没有实现，现在没有可运行的示例。

## 契约

- 公开形状归 `src/`，现在为空。导出索引归[公开接口页](docs/public-api.md)。
- 类型以外的行为归 [SPEC](SPEC.md)，性质 1 至 7。
- 插件、配置与策略选择、isolate 绑定、贡献登记表、变化事件派发与撤除顺序归 [Cordis 说明](docs/cordis.md)。
- 服务键、抽象类、intercept 配置、事件与策略选择的配置形状归 [request-context-cordis-contract](../request-context-cordis-contract/docs/cordis.md)。

服务实例、机制实例与策略实例归本插件的 fiber。插件卸载时按固定顺序撤除：拒绝新的登记与组装，等在途组装结算，丢弃登记表与缓存。一条贡献的登记与渲染结果归贡献者插件的 fiber。撤除不撤回已交出的候选、计划或转换。

## 设计

`./cordis` 分为配置与策略选择、服务子类、贡献登记表、事件派发与撤除五块。包外依赖是 request-context-contract、request-context-cordis-contract、request-context 与 `@deepseek-ai/cordis`。撤除放在一个 effect 里，作用域每次调用时读取，策略选择失败即加载失败、不回退，渲染结果随登记一起撤除，不为每次请求开 fiber。模块与理由见[内部架构](docs/architecture.md)，三条机制流程见[机制流程](docs/flows.md)，对象见[对象模型](docs/object-model.md)。

## 配置与运行

插件配置用 Standard Schema 校验。字段是压缩策略的选择与参数、表示策略的选择与偏好顺序、修剪阈值与缓存容量。默认值只是初值，归 request-context。配置指向不存在的策略，或参数不合 Schema 时，插件加载失败，fiber 进入 `FAILED`，不回退到默认策略。一个 isolate 标签下只装一份本插件，同一标签下第二次装载失败。

本成员没有环境前提，运行时不读取资源，不访问存储。进程失败后由贡献者重新登记。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/request-context-cordis
```

在本目录执行 `pnpm typecheck` 做类型检查。现有两个测试只断言两个入口没有导出，见 [tests/](tests/README.md)。SPEC 的七项验证义务随实现进入，其中一部分必须在真实 Cordis 上运行，见[验证义务](docs/cordis.md#验证义务)。持久化、跨进程一致性与端到端组合不在本成员。结构检查通过不表示行为已验证。

## 维护

- 服务定义改变时，同步具体子类、[Cordis 说明](docs/cordis.md)与测试。
- request-context 的工厂、默认策略或配置改变时，同步配置 Schema 与[公开接口页](docs/public-api.md)。
- Cordis 升版时，先重跑服务定义成员列出的 basis probe。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   类型以外的行为，性质 1 至 7
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       两个入口、模块、依赖、关键机制与理由
├── flows.md              F-RQP01 至 F-RQP03 机制流程
├── object-model.md       服务实例、插件配置与贡献登记表
├── public-api.md         导出入口与定义索引
├── context.md            装配、独立使用与定位
└── cordis.md             插件、策略选择、isolate、登记表、事件、撤除与 IC 映射
src/                      index.ts 与 cordis.ts，现在只有模板标记
tests/                    两个入口测试，fixtures/ 现在为空
schema/                   现在为空，配置 Schema 写在 src/
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
