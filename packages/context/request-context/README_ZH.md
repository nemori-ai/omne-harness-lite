# @omne-harness/request-context

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Request Context 的机制实现成员，`module` 变体。

## 职责与状态

本成员实现 Request Context 的两个有状态机制：来源登记表与账目投影。它导出两个不依赖 Cordis 的工厂。默认压缩策略、默认表示策略、修剪器与转换件结果读口的缺席实现也归本成员，已进入。候选缓存与预计算派生物也归本成员，尚未实现。公开行为归 [request-context-contract](../request-context-contract/README.md)，提示词贡献的登记面归 [request-context-cordis-contract](../request-context-cordis-contract/README_ZH.md)，Cordis 绑定与按配置选择策略归 [request-context-cordis](../request-context-cordis/README_ZH.md)。本成员不持有任何耐久状态：登记表、账目索引与缓存都是进程内状态，账目索引从结果接收方的日志授权重建。

状态：机制实现成员，`draft`。采用依据是组的[成员分解](../docs/architecture.md#成员分解)与 [SPEC](SPEC.md)。现在的实现情况如下：

- 已实现：`createContextSourceRegistry`（登记、替换、撤除与结算、借用、发布核对、关闭）与 `createContextAccounting`（收件口的固定核验顺序、幂等与容量、窗口占用四种状态、系统恢复的暂存重建）。
- 已验证：登记表与账目投影的进程内测试，以及登记表的 `assembly(target)` 跑契约操作组的全部一致性用例，见 [tests/](tests/README.md)。
- 已实现（构造件）：`createDefaultCompactionPolicy`（含修剪器与摘要指令）、`createDefaultRepresentationPolicy`、`createAbsentConversionResults`，以及它们的配置初值。
- 未实现：候选缓存与 `notify`、预计算派生物。
- 已验证（本成员内）：默认策略的数值、配对不拆开的保留、修剪、表示偏好与 Model 请求准备替身的固定请求，以及第 2 轮的 `lineage.continues`，见 [tests/](tests/README.md)。
- 未验证：SPEC 中缓存、派生物与复杂度的持续验证场景随实现进入；真实 Model 准备资源在联调中验证。默认策略的数值来自同类系统的取证，按本项目的计量口径重核之后才作为初值生效。见[内部架构](docs/architecture.md)与[公开接口页](docs/public-api.md)。

现在没有包依赖本成员；request-context-cordis 的 Service 迁移由其拥有者完成。

## 使用

本成员只有根入口 `@omne-harness/request-context`。装配 Cordis 的系统不直接导入它，由 request-context-cordis 按配置选定策略并调用工厂。来源适配者以 `register` 登记某个目标的来源集合（七组读口、窄采用来源、历史源、转换件结果、读取资格与 Model 准备资源），调用方经 `assembly(target)` 取操作组。不装配 Cordis 又要托管登记的调用方直接调用本成员的工厂，见[使用与定位](docs/context.md#独立使用)。

只需要独立操作组的调用方使用 request-context-contract 根入口的 `createAssemblyOperations`，不需要本成员。现在没有可运行的示例，用法见 [tests/](tests/README.md)。

## 契约

- 公开形状归 `src/`，导出两个工厂；参数与返回值的类型归 request-context-contract。导出索引归[公开接口页](docs/public-api.md)。
- 本成员的本地行为归 [SPEC](SPEC.md)：来源登记表、账目投影、候选缓存、预计算的派生物、默认策略与修剪器、本地行为与关闭。
- 操作组、来源集合、账目协议、结果与失败归 [request-context-contract SPEC](../request-context-contract/SPEC.md)，条款 RQ-01 至 RQ-15。
- 内部对象的身份与生灭归[对象模型](docs/object-model.md)。

调用工厂的一方拥有实例。登记表的 `close()` 拒绝新登记与新借用，等待全部代际结算；关闭不取消在途操作，也不撤回已交出的候选、计划或转换。账目投影实例丢弃时不清理原日志。任一依赖端口缺席或不可用时，相关操作返回不可用，带诊断。

## 设计

已实现的模块是来源登记表、账目投影，以及默认压缩策略、默认表示策略、修剪器与缺席的转换件结果读口三个无状态构造件；计划中的模块是候选缓存与派生物。包外运行依赖是 request-context-contract、model-contract（类型）、call-account 与 legal-identity。关键机制是：缓存键与 `PreparedInputKey`（RQ-13）相同，即来源代际、组一身份、六组令牌与派生规则的采用；按组失效，只重算受影响的层；失效来自变化通知，不来自时间或内容重哈希；派生物在输入变化时预计算；前缀比较只在锚点处做；默认策略只是配置初值；修剪器不改原记录与模型视图；计划进度不在本成员保存。模块与理由见[内部架构](docs/architecture.md)，三条机制流程见[机制流程](docs/flows.md)，内部对象见[对象模型](docs/object-model.md)。

## 配置与运行

默认压缩策略的构造件接受修剪阈值（字节数，初值 65536）；缓存容量待缓存实现后再有字段。默认压缩策略有触发界线、保留预算、保留偏好、修剪优先与步数上界，默认表示策略有按模态的偏好顺序。全部默认值只是配置初值。经 Cordis 时，这些值由 request-context-cordis 的插件配置给出并校验。本成员没有环境前提，运行时不读取资源，不访问存储。计划进度由协调者保存，历史与压缩记录由历史持有者保存。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/request-context
```

在本目录执行 `pnpm typecheck` 做类型检查。现有测试覆盖根入口、登记表、账目投影、默认策略与修剪器、转换件结果读口，以及默认策略在真实操作组里的固定请求，见 [tests/](tests/README.md)。SPEC 其余的[持续验证场景](SPEC.md#组合与验证)随实现进入，其中复杂度场景需要测量，不只是断言。持久化、共同提交、模型发送，以及与真实协调者和持有者的端到端组合不在本成员。结构检查通过不表示行为已验证。

## 维护

- 契约的输入分组、六层布局或前缀变化原因改变时，同步[内部架构](docs/architecture.md)、[机制流程](docs/flows.md)与测试。
- 新增配置项或改默认值时，同步 SPEC、[公开接口页](docs/public-api.md)与 request-context-cordis 的配置 Schema。
- 工厂签名改变时，同步唯一的组内使用方 request-context-cordis。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   缓存、派生物、默认策略、本地行为与关闭
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、依赖、关键机制与理由
├── flows.md              F-RQI01 至 F-RQI03 机制流程
├── object-model.md       缓存条目、派生物、策略实例与生命周期
├── public-api.md         导出入口与定义索引
├── context.md            经 Cordis 使用、独立使用与定位
└── cordis.md             不适用 Cordis 集成的理由
src/                      index.ts、registry.ts 与 accounting.ts
tests/                    入口、登记表与账目投影测试，fixtures/ 现在为空
schema/                   现在为空，本成员不发布 Schema
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
