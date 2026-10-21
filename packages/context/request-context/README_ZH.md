# @omne-harness/request-context

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Request Context 的机制实现成员，`module` 变体。

## 职责与状态

本成员用缓存、预计算派生物与默认策略实现 Request Context 的纯操作。它导出一个不依赖 Cordis 的工厂，输出实现契约纯操作的实例。默认压缩策略、默认表示策略与修剪器也在本成员实现。公开行为归 [request-context-contract](../request-context-contract/README.md)，提示词贡献的登记面归 [request-context-cordis-contract](../request-context-cordis-contract/README_ZH.md)，Cordis 绑定与按配置选择策略归 [request-context-cordis](../request-context-cordis/README_ZH.md)。本成员不持有任何耐久状态，缓存与派生物都是进程内副本，从输入重建不改变任何结果。

状态：机制实现成员，`draft`。采用依据是组的[成员分解](../docs/architecture.md#成员分解)与 [SPEC](SPEC.md)。现在的实现情况如下：

- 已实现：没有。`src/index.ts` 只有模板标记，根入口没有导出。
- 未实现：工厂、候选缓存、派生物、默认策略、修剪器与关闭。
- 未验证：SPEC 列出的十个持续验证场景都没有测试。默认策略的数值来自同类系统的取证，按本项目的计量口径重核之后才作为初值生效。
- 实例经 `notify(change)` 接收变化通知。修剪步之后必有摘要步。实例只从输入「已采用」得知候选已经固定。见[内部架构](docs/architecture.md)与[公开接口页](docs/public-api.md)。

现在没有包依赖本成员。

## 使用

本成员只有根入口 `@omne-harness/request-context`。装配 Cordis 的系统不直接导入它，由 request-context-cordis 按配置选定策略并调用工厂。不装配 Cordis 的调用方直接调用工厂，自己给出五项构造依赖、收集提示词贡献、保存计划进度，见[使用与定位](docs/context.md#独立使用)。

只需要纯操作、不需要缓存的调用方使用 request-context-contract，不需要本成员。

工厂的名称与签名随实现确定，现在没有可运行的示例。

## 契约

- 公开形状归 `src/`，现在为空。导出索引归[公开接口页](docs/public-api.md)。
- 本成员的本地行为归 [SPEC](SPEC.md)：候选缓存、预计算的派生物、默认策略与修剪器、本地行为与关闭。
- 纯操作的输入、结果与失败归 [request-context-contract SPEC](../request-context-contract/SPEC.md)，条款 RQ-01 至 RQ-11。
- 内部对象的身份与生灭归[对象模型](docs/object-model.md)。

调用工厂的一方拥有实例，负责关闭它。关闭后新的组装返回不可用，关闭先等在途组装结算，再释放缓存。关闭不撤回已交出的候选、计划或转换。任一构造依赖缺席或不可用时，相关操作返回不可用，带诊断。

## 设计

工厂内部分为候选缓存、派生物、组装、计划与步、默认压缩策略、默认表示策略、修剪器与生命周期八个模块。包外依赖只有 request-context-contract。关键机制是：七组修订摘要做缓存键；按组失效，只重算受影响的层；失效来自变化通知，不来自时间或内容重哈希；派生物在输入变化时预计算；前缀比较只在锚点处做；默认策略只是配置初值；修剪器不改原记录与模型视图；计划进度不在本成员保存。模块与理由见[内部架构](docs/architecture.md)，三条机制流程见[机制流程](docs/flows.md)，内部对象见[对象模型](docs/object-model.md)。

## 配置与运行

工厂接受修剪阈值与缓存容量。默认压缩策略有触发界线、保留预算、保留偏好、修剪优先与步数上界，默认表示策略有按模态的偏好顺序。全部默认值只是配置初值。经 Cordis 时，这些值由 request-context-cordis 的插件配置给出并校验。本成员没有环境前提，运行时不读取资源，不访问存储。计划进度由协调者保存，历史与压缩记录由历史持有者保存。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/request-context
```

在本目录执行 `pnpm typecheck` 做类型检查。现有测试只断言根入口没有导出，见 [tests/](tests/README.md)。SPEC 的[持续验证场景](SPEC.md#组合与验证)随实现进入，其中复杂度场景需要测量，不只是断言。持久化、共同提交、模型发送，以及与真实协调者和持有者的端到端组合不在本成员。结构检查通过不表示行为已验证。

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
src/                      只有 index.ts，现在只有模板标记
tests/                    入口测试，fixtures/ 现在为空
schema/                   现在为空，本成员不发布 Schema
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
