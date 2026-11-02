# @omne-harness/runtime-context

[English](README.md)

Runtime Context 的机制实现成员，`module` 变体。

## 职责与状态

本成员实现 Runtime Context 的供给机制：作用域表、注册表、生产者表、资格表、当前投影、游标、恢复会话与读取缓存。它导出一个不依赖 Cordis 的工厂 `createRuntimeContext`，输出实现契约三面操作与 `close` 的机制实例。公开行为归 [runtime-context-contract](../runtime-context-contract/README_ZH.md)，Cordis 绑定与唤醒归 [runtime-context-cordis](../runtime-context-cordis/README_ZH.md)。本成员不持有任何耐久状态，全部表都是进程内副本。

状态：机制实现成员，`draft`。采用依据是组的[成员分解](../docs/architecture.md#成员分解)与 [SPEC](SPEC.md)。现在的实现情况如下：

- 已实现：工厂与八个操作。核对使用两个权威端口，生产者槽按租户加块键。另实现作用域结束、带待刷新标记的恢复会话、读取缓存、变化出口、诊断出口与关闭五步。
- 已验证：整套 `runtimeContextConformance` 对机制通过。成员测试覆盖跨租户拒绝、读取缓存、带在途操作的关闭、恢复后供值的限制、缺席的检查点值、诊断与 `bind` 的调用方声明。
- 未验证：持久化、跨进程一致性、断电耐久，以及与真实持有者和生产者的端到端组合。恢复与代际协议没有正式模型。

[runtime-context-cordis](../runtime-context-cordis/README_ZH.md) 依赖本成员。

Runtime Context 的两个契约成员已有类型、纯校验与 Cordis 服务定义。契约包测试不表示本实现成员已运行，也不证明生产行为。

## 使用

本成员只有根入口 `@omne-harness/runtime-context`。装配 Cordis 的系统不直接导入它，由 runtime-context-cordis 调用工厂。不装配 Cordis 的调用方直接从本成员调用工厂，并自己承担撤除与唤醒的接线，见[使用与定位](docs/context.md#独立使用)。

导出见[公开接口页](docs/public-api.md)。使用页给出工厂、恢复会话、生产者与读者的调用顺序。

## 契约

- 公开形状归 `src/`。导出索引归[公开接口页](docs/public-api.md)。
- 本成员的本地行为归 [SPEC](SPEC.md)：表与投影、本地行为、读取缓存、恢复、关闭与重建。
- 三面操作的输入、结果与失败归 [runtime-context-contract SPEC](../runtime-context-contract/SPEC.md)，条款 RC-01 至 RC-09。
- 内部对象的身份与生灭归[对象模型](docs/object-model.md)。

调用工厂的一方拥有机制实例，负责关闭它。关闭先拒绝新请求，再结束读者并取消在途等待，然后在结算上界内等全部在途操作结算，最后释放表。在途操作答关闭，不答成功。关闭不撤回已交出的变化材料或外部效果。

## 设计

源码分为配置、共享状态、生产者面、持有者面、恢复会话、读者面、读取缓存与诊断八个模块。包外依赖是 runtime-context-contract 与 legal-identity。关键机制如下：

- 两个权威端口、`current()`，以及关闭可以取消的等待
- 按提交顺序应用持有者的提交
- 按租户加块键的生产者槽、代际与供给序号
- 全系统一份、跨租户核对的声明目录
- 带待刷新标记的恢复会话，以及合并并受限的恢复后供值
- 位于全部访问核对之后、以投影版本为键的读取缓存
- 变化出口与诊断出口
- 固定的关闭顺序

模块与理由见[内部架构](docs/architecture.md)，五条机制流程见[机制流程](docs/flows.md)，内部对象见[对象模型](docs/object-model.md)。

## 配置与运行

工厂接受信任对象、七个上限、变化出口与诊断出口。七个上限是 `retention`、`replayCapacity`、`supplyBoundMs`、`settleBoundMs`、`readCacheEntries`、`refreshConcurrency` 与 `refreshRetryMs`。初值只是配置初值，非法上限抛 `RangeError`。经 Cordis 时，上限由 runtime-context-cordis 的插件配置给出，并经同一个解析函数校验。本成员没有环境前提，运行时不读取资源，不访问存储。注册与步提交的耐久保存归作用域持有者，`persisted` 供给块的值由生产者重新发布。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/runtime-context
```

在本目录先执行 `pnpm build`，再执行 `pnpm test` 与 `pnpm typecheck`。用例经 `dist` 导入本包。见 [tests/](tests/README.md) 与 SPEC 的[持续验证场景](SPEC.md#组合与验证)。持久化、跨进程一致性与租户隔离的端到端证据不在本成员。结构检查通过不表示行为已验证。

## 维护

- 契约的读取结果、游标、恢复或步提交规则改变时，同步[内部架构](docs/architecture.md)、[机制流程](docs/flows.md)与测试。
- 新增配置项时，同步 `src/config.ts`、[公开接口页](docs/public-api.md)与 runtime-context-cordis 的配置 Schema。
- 新增会改变过滤后读取输出的状态时，推进投影版本或让读取绕过缓存，并加一条用例。
- 工厂签名改变时，同步唯一的组内使用方 runtime-context-cordis。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   表、本地行为、读取缓存、恢复、关闭
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块与依赖、关键机制与理由
├── flows.md              F-RCI01 至 F-RCI05 机制流程
├── object-model.md       条目、恢复会话、缓存条目与生灭
├── public-api.md         导出入口与定义索引
├── context.md            经 Cordis 使用、独立使用与定位
└── cordis.md             不适用 Cordis 集成的理由
src/                      工厂与八个模块
tests/                    契约套件与成员用例，fixtures/ 为空
schema/                   现在为空，本成员不发布 Schema
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
