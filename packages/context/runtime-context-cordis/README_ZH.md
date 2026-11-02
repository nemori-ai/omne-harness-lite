# @omne-harness/runtime-context-cordis

[English](README.md)

Runtime Context 的 Service 实现成员，`service-provider` 变体。

## 职责与状态

本成员把 [runtime-context](../runtime-context/README_ZH.md) 的机制装进 [runtime-context-cordis-contract](../runtime-context-cordis-contract/README_ZH.md) 定义的服务 `runtimeContext`。它承担 isolate 绑定、消费者类读取、按作用域过滤的唤醒、生产者登记的效应、撤除与清理。领域行为归 [runtime-context-contract](../runtime-context-contract/README_ZH.md)，机制行为归 runtime-context，都不在本成员。

状态：Service 实现成员，`draft`。采用依据是[系统页的成员与 Cordis 落位](../../../docs/architecture/runtime/runtime-context.md#成员与-cordis-落位)与 [SPEC](SPEC.md)。现在的实现情况如下：

- 已实现：`./cordis` 的具体子类 `RuntimeContextProvider` 与插件入口 `createRuntimeContextPlugin`。子类 `inject` 键 `runtimeContextTrust`，键缺席时停在 PENDING，取出 `authority` 与 `bindings` 交给 runtime-context 的工厂。它用 Standard Schema 校验配置，在调用方 fiber 上登记生产者效应，在 `bind` 中比较 intercept 的消费者类，派发按作用域过滤的唤醒，卸载时关闭机制。根入口保持为空。
- 已在 Cordis 4.0.4 上验证：整套 `runtimeContextConformance` 经服务通过。成员测试覆盖 PENDING、配置失败、重复装载、生产者卸载、新旧两代交错、调用方在登记中卸载、唤醒过滤、intercept 不一致与卸载时的在途读取。
- 未验证：同步失效来源（缺口保留在 #677）、持久化、跨进程一致性，以及与真实消费者和生产者的端到端组合。定义成员的三条机制读数尚未登记到共同 basis。

现在没有应用装配本插件。装配行归应用装配者。

Runtime Context 的两个契约成员已有类型、纯校验与 Cordis 服务定义。契约包测试不表示本实现成员已运行，也不证明生产行为。

## 使用

本成员有两个入口：

- `@omne-harness/runtime-context-cordis/cordis`：插件。应用装配者在插件树里加一行本插件并给出配置。
- `@omne-harness/runtime-context-cordis`：根入口不导出任何东西。`./cordis` 导出 `RuntimeContextProvider` 与 `createRuntimeContextPlugin`。不装配 Cordis 的调用方从 [runtime-context](../runtime-context/README_ZH.md) 取机制工厂。

生产者、作用域持有者与读者不导入本成员，它们经服务定义使用服务。装配写法与独立使用见[使用与定位](docs/context.md#使用方式)。

## 契约

- 公开形状归 `src/`。导出索引归[公开接口页](docs/public-api.md)。
- 类型以外的行为归 [SPEC](SPEC.md)，性质 1 至 10。
- 插件、配置、isolate、消费者类读取、登记、唤醒与撤除顺序归 [Cordis 说明](docs/cordis.md)。
- 服务键、抽象类、intercept 配置与事件归 [runtime-context-cordis-contract](../runtime-context-cordis-contract/docs/cordis.md)。

本插件的 fiber 拥有服务实例与机制实例。插件卸载时一个效应调用机制的 `close()`：拒绝新请求、结束读者、取消在途等待、在结算上界内等全部在途操作、释放表。生产者登记归生产者插件的 fiber，绑定读者归消费者插件。撤除不撤回已交出的变化材料或外部效果。

## 设计

`./cordis` 分为配置、服务子类、唤醒派发与撤除四块。包外依赖是 runtime-context-contract、runtime-context-cordis-contract、runtime-context 与 `@deepseek-ai/cordis`。撤除写在一个 effect 里，机制实例只在构造函数闭包里，消费者类每次调用时读取，唤醒用过滤后的 `emit`，存储端口缺席等于缺项。模块与理由见[内部架构](docs/architecture.md)，三条机制流程见[机制流程](docs/flows.md)，对象见[对象模型](docs/object-model.md)。

## 配置与运行

插件配置用 Standard Schema 校验，字段是机制的七个上限与诊断级别，全部可省略。初值只是配置初值。上限由 runtime-context 的解析函数判定，未知字段使加载失败。配置错误时插件加载失败，fiber 进入 `FAILED`。一个 isolate 标签下只装一份，重复装载失败。

本阶段没有耐久存储端口。持有者在服务之外保存注册与步提交，`persisted` 供给块在生产者重新发布前读到缺项。本成员没有其他环境前提，运行时不读取资源。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/runtime-context-cordis
```

在本目录先构建 runtime-context 与本成员（`pnpm build`），再执行 `pnpm test` 与 `pnpm typecheck`。用例经 `dist` 导入，在真实 Cordis 4.0.4 上运行，见 [tests/](tests/README.md) 与 [Cordis 说明的验证义务](docs/cordis.md#验证义务)。持久化、跨进程一致性与端到端组合不在本成员。结构检查通过不表示行为已验证。

## 维护

- 服务定义改变时，同步具体子类、[Cordis 说明](docs/cordis.md)与测试。
- 机制工厂或配置改变时，同步配置 Schema 与[公开接口页](docs/public-api.md)。
- 存储端口进入时，同步 SPEC 性质 5 与 Cordis 说明。
- Cordis 升版时，先重跑服务定义成员列出的 basis probe。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   类型以外的行为，性质 1 至 10
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       两个入口、模块、依赖、关键机制与理由
├── flows.md              F-RCP01 至 F-RCP03 机制流程
├── object-model.md       服务实例与插件配置
├── public-api.md         导出入口与定义索引
├── context.md            装配、独立使用与定位
└── cordis.md             插件、配置、isolate、唤醒、撤除与 IC 映射
src/                      空的 index.ts，与含提供者的 cordis.ts
tests/                    契约套件、生命周期与入口测试，fixtures/ 为空
schema/                   为空，配置 Schema 在 src/cordis.ts
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
