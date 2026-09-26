# 工具定义

**一个工具在数据与治理层面长什么样**——一份定义怎么写、两种范式怎么区分、多命令工具在模型面那一份 input 怎么生成、
六项可选声明各是什么、哪几项是设置项（形状、类别与默认值）、执行权限的默认值、组合与来源；
以及**工具函数交回来的那个返回值**：两种写法、一种模型（`ToolResult`），卸载在返回值里怎么表达。

它是一份数据契约：定义是资产的一份表示，没有操作、没有状态转移，**因此不需要插件**。
执行、派发、落点匹配、收场判定都归工具执行运行时；本契约只给它们据以工作的那份数据。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.tool-definition, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`，`family=data`、`topic=tool-definition`、`contract_path=spec/data/tool-definition/v2/contract.md`，
  `resources` 另含 `v2/tool-definition.schema.json` 与 `v2/examples.md`；`acceptance` 指向 D-061 的 `acceptance.json`；
  `dependencies` 两项：`data.content-blocks` v2 与 `data.asset-model` v2（都是候选），消费 clauses 见[契约抬头](v2/contract.md)
- **提供者/装配映射**：[packages/core/tool-definition](../../../realization/packages/core/tool-definition/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。工具执行运行时、agent 装配、放行判断、资产持有与配值、MCP 桥、`Tools().inspect` 读的是**同一份**定义；各写一份必然分叉 |
| 稳定身份 | `data.tool-definition`，版本 1 |
| 适用范围 | 一个部署之内；跨进程之后哪些结论须由协议重新兑现，列在[契约第七节](v2/contract.md#七装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**。模型面 input 的生成与裸字符串的等价是两条纯派生，不是操作 |
| 精确依赖 | `data.content-blocks` v2：块、附件引用、能力标识、模态、媒体类型、内联字节与执行收场的定义，外加两条规则；`data.asset-model` v2：能力标识名的词法、正文 `name` 与能力标识相等、属性声明与设置项类别、两个保留项名。**不依赖** `data.offer-expiry` 与 `data.identity-values` |
| 起点 | [D-031](../../../record/decisions/tool-definition-baseline/README.md)：按 PF-006 §5.3 自研，三个参考源只作参考、可照抄命名 |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1 契约](v2/contract.md) |
| 交换与存储表示 | [v1 Schema](v2/tool-definition.schema.json) |
| 一份定义、一个返回值长什么样，什么会被拒 | [v1 正反实例](v2/examples.md) |
| 多命令工具在模型面那一份 input 到底长什么样 | [契约 S-7](v2/contract.md#s-7-多命令-input-的生成规则) 与 [实例第 9 节](v2/examples.md#9-生成规则的逐字核对) |
| 一份坏定义、坏返回值报哪个拒绝值 | [契约 S-26](v2/contract.md#s-26-表示层拒绝值与判定次序)：十二个值、判定次序、`malformed` 的来由 M1～M27 |
| 哪里在等裁决 | [已知缺口](v2/contract.md#十已知缺口) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v2/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`tool-definition.schema.json`、`examples.md`——
**实例是规范工件，不是说明材料**：拒绝值的次序与生成规则都靠实例说清楚。

**本包不建 `formal/`。**理由：本契约没有状态转移；它的结构约束——范式判别、`commands` 与 `input` 的互斥、设置类别定死、MCP 来源的三条——
都由 Schema 的条件直接表达，在这里建模型只会产出一份与 Schema 同义的平行工件。
[规格模板的要求](../../README.md#按需展开形式化工件)是「已触发的义务不因 optional 而消失」：
本契约触发的义务是形状校验、生成规则核对、规范场景与消费者走查，在[验证入口](verification.md)登记，状态**一律为「未开始」**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `data.tool-definition` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。

## 2026-09-26 D-068 当前 v3

`data.tool-definition · v3` 已接受并冻结，[精确契约](v3/contract.md) 的接受范围与32资源摘要见 [D-068](../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json)。本段为当前导航，以上旧版接受与验证记录保留原适用范围。新版推荐不自动升级消费者；八个core提供者须显式采用，24个外部消费者仍钉2。实现、公开旧Schema闭包及新组合证据尚待完成，不从规格接受推断通过。
