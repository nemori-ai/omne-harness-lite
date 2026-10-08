# MCP 接入点

**一个 [MCP](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) 接入点资产的数据长什么样**：作者写下的正文（连接目标、两项超时与执行权限的默认值）、两种传输、
桥为每份持有存下的动作清单副本与其中每一项对端动作、动作条目名的拼法、OAuth 绑定的三个状态、凭据配值的取值域（「还没取」是缺席）、
一个接入点有哪些设置项与权限项——以及一个值不合这些形状时，拒绝值叫什么。

它是 `data.asset-model` v2 里 mcp 那一支正文的家（那边 `$ref` 本契约的 `McpEndpoint`），也是 [`capability.mcp-bridge`](../../capabilities/mcp-bridge/README.md) 读写的全部形状。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.mcp-endpoint, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，D-061）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`（`acceptance` 指向 D-061 的 `acceptance.json`）。`family=data`、`topic=mcp-endpoint`、
  `contract_path=spec/data/mcp-endpoint/v2/contract.md`，`resources` 另含 `v2/mcp-endpoint.schema.json` 与 `v2/examples.md`；
  依赖四项：`data.asset-model` v2、`data.tool-definition` v2（两者都是候选）、`data.identity-values` v1（不透明标识的交换表示）、`data.offer-expiry` v1——
  消费的条款见[契约头部的依赖表](v2/contract.md)。**登记在 [registry](../../../registry/README.md)，本行只作索引**
- **提供者/装配映射**：[packages/core/mcp-endpoint](../../../realization/packages/core/mcp-endpoint/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。接入点正文被资产治理写、被求值读、被桥读；副本被桥写、被注册表读；凭据取值域被治理写面与桥共用——**写两遍必然分叉** |
| 稳定身份 | `data.mcp-endpoint`，版本 1 |
| 适用范围 | 一个部署之内；跨进程后要由协议重新兑现的，列在[契约第五节](v2/contract.md#五装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**：没有提交点、没有状态转移、没有自己的授权前提。连接、列举、投影、调用、OAuth 流程归 `capability.mcp-bridge` |
| 精确依赖 | 见上面「catalog 映射」一行 |
| 谁在等它 | `capability.mcp-bridge`；`data.asset-model` 的 mcp 一支；求值、治理写面、注册表（均为 v2 候选）。完整清单见[契约的消费者表](v2/contract.md#消费者)——**那里是唯一的一份** |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1 契约](v2/contract.md) |
| 交换与存储表示 | [v1 Schema](v2/mcp-endpoint.schema.json) |
| 一个值长什么样、什么会被拒、拒绝值叫什么 | [v1 正反实例](v2/examples.md) |
| 一个接入点有哪些属性项、默认值从哪来 | [S-14 推出规则](v2/contract.md#s-14-推出规则五类项)与[实例第 7 节](v2/examples.md#7-推出的属性声明) |
| 凭据为什么不在正文里、副本为什么不在正文里 | [S-6](v2/contract.md#s-6-正文不收凭据)、[S-9](v2/contract.md#s-9-动作清单副本)——主线裁定，见 D-060 §S19 S19-a |
| 凭据写错了地方报什么 | [S-20](v2/contract.md#s-20-表示层拒绝值与判定次序) 末尾——没有专门的值；凭据配值的非引用值归资产治理写面的 `valueOutOfDomain` |
| 哪里在等裁决 | [已知缺口](v2/contract.md#八已知缺口) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v2/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`mcp-endpoint.schema.json`、`examples.md`——
**实例是规范工件，不是说明材料**。

**本包不建 `formal/`。**本契约没有状态转移；它的结构约束 Schema 与条款即可表达。
属性项在各格上怎样求值的结构性质归 `capability.asset-evaluation` 的 Alloy 模型；OAuth 绑定的状态迁移归 `capability.mcp-bridge`。
[规格模板对此的要求](../../README.md#按需展开形式化工件)是「已触发的义务不因 optional 而消失」——
本契约触发的义务是 Schema 正反实例校验、接收边界校验、规范场景与静态检查，在[验证入口](verification.md)登记，状态**一律为「未开始」**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `data.mcp-endpoint` v2 的全部条款，D-061 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。
