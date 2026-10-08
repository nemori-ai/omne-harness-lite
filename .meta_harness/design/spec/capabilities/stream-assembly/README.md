# 流装配

**按到达语法把一条分次到达的流拼起来**——这件事的正式名是[到达装配](../../../ubiquitous_language/terms/record-and-context.md#ul-arrival-assembly--到达装配--arrival-assembly)：一份装配状态怎样随每个事件前进、哪些事件不被接受、快照里有什么、收尾时交出哪些块、一份什么账、这条流怎么结束的；
工具调用参数**唯一的解析点**在这里。

**它是纯计算**：五个操作——`start`、`accept`、`snapshot`、`closeOut`、`abandon`——都作用于**调用方持有**的状态值。
持有状态、按目标路由事件、把结果包成 `AssistantMessage` 或 `ToolInternalMessage`、落盘记账，都归宿主（模型请求运行时、工具执行运行时）。
它是 core 三层（D-035）里的第三层：到达装配自写。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.stream-assembly, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，D-061）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`（`acceptance` 指向 D-061 的 `acceptance.json`）。`family=capabilities`、`topic=stream-assembly`、
  `contract_path=spec/capabilities/stream-assembly/v2/contract.md`，`resources` 另含 `v2/examples.md` 与 `v2/formal/` 下的模型、四份配置与映射页；
  依赖三项：`data.arrival-events` v2、`data.content-blocks` v2、`data.call-accounts` v2（消费 clauses 见[契约头部](v2/contract.md)）。
  **登记在 [registry](../../../registry/README.md)，本行只作索引**
- **形式任务**：`stream-assembly-v2-assembly`（`v2/formal/Assembly.cfg`）已登记；三份有效性核对配置不登记
- **提供者/装配映射**：[packages/core/stream-assembly](../../../realization/packages/core/stream-assembly/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。到达装配的规则被模型请求运行时与工具执行运行时共用，写两遍必然分叉；D-035 定了这一层自写、三层落 core、先于两个运行时的契约 |
| 稳定身份 | `capability.stream-assembly`，版本 1 |
| 适用范围 | 一个部署之内的一条条流；跨进程后要由协议重新兑现的，逐行列在[契约 S-29](v2/contract.md#s-29-部署装配给与协议给) |
| 为什么是 capability 而不是 data | 它有操作、有失败集合、有状态怎样前进的规则、有要用行为模型检查的性质；**但没有自己持有的状态**——状态是调用方手里的值 |
| 精确依赖 | `data.arrival-events` v2（语法）、`data.content-blocks` v2（交出的块）、`data.call-accounts` v2（交出的账）。`data.messages` v2 **不是依赖**：本能力不产出消息 |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1 契约](v2/contract.md) |
| 五个操作各自的九件事 | [契约第三节](v2/contract.md#三操作) |
| 一块在收尾时落成什么 | [S-9](v2/contract.md#s-9-一块怎样落) |
| 失败值与判定次序 | [S-23](v2/contract.md#s-23-本能力自己的失败值)～[S-25](v2/contract.md#s-25-判定次序) |
| 宿主要兑现什么 | [S-28](v2/contract.md#s-28-宿主要兑现的前提) |
| 手算的例子 | [v1 实例](v2/examples.md) |
| 行为模型检查什么、盖不到什么 | [形式化映射](v2/formal/README.md) |
| 哪里在等裁决 | [已知缺口](v2/contract.md#十已知缺口) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v2/` 是本契约的候选版本目录。规范工件：`contract.md`、`examples.md`、`formal/Assembly.tla` 与 `formal/Assembly.cfg`；
`formal/README.md` 拥有条款到模型的映射；`formal/Assembly_OrderByClose.cfg`、`formal/Assembly_ReplaceAsAppend.cfg` 与 `formal/Assembly_OneShotCloseFirst.cfg` 是**预期出反例**的有效性核对配置。
**不发布 Schema**：线上形状归组合契约。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `capability.stream-assembly` v2 的全部条款，D-061 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。

## 2026-09-26 D-068 当前 v3

`capability.stream-assembly · v3` 已接受并冻结，[精确契约](v3/contract.md) 的接受范围与32资源摘要见 D-068。本段为当前导航，以上旧版接受与验证记录保留原适用范围。新版推荐不自动升级消费者；八个core提供者须显式采用，24个外部消费者仍钉2。实现、公开旧Schema闭包及新组合证据尚待完成，不从规格接受推断通过。
