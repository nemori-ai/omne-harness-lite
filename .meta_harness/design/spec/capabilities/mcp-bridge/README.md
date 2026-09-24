# MCP 桥

**本系统与外部 [MCP](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) 对端之间的那座桥**：按一份接入点持有连上对端、完整列举它的动作并存成副本、
把副本投影成[工具定义](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)、作为这些定义的自带实现把调用送到对端，
以及经 OAuth 取得 [MCP 凭据](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)那一路的状态与续期。

**它不做放行判断、不做属性求值、不决定 agent 面前有哪些条目、不判收场、不写配值**——那些归放行判断、求值、[会话资产注册表](../../../ubiquitous_language/terms/reach-and-availability.md#ul-session-asset-registry--会话资产注册表--session-asset-registry)、工具执行运行时与资产治理；
本契约与它们之间的分工写在[契约 S-2](v1/contract.md#s-2-本契约不拥有什么)。它读写的全部形状归 [`data.mcp-endpoint`](../../data/mcp-endpoint/README.md)。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.mcp-bridge, 1)`
- **状态**：`candidate`（2026-09-23 起草，2026-09-24 整批对齐，同日按第一轮独立评审修订——处置表在[验证入口](verification.md#独立评审)；2026-09-25 修复波 1b 闭合 G-14，同日修复波 2 按第二轮独立复评改 S-5、S-12、CS-4）——未接受、未冻结，不得据此发布或声称消费者已采用
- **catalog 映射**：已登记为 `candidate`（`acceptance` 为 `null`）。`family=capabilities`、`topic=mcp-bridge`、
  `contract_path=spec/capabilities/mcp-bridge/v1/contract.md`，`resources` 另含 `v1/examples.md`；
  依赖六项：`data.mcp-endpoint` v1、`data.tool-definition` v1、`data.content-blocks` v1、`data.asset-model` v1、`capability.asset-evaluation` v1（五者都是候选）、`data.identity-values` v1——
  消费的条款见[契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面)。**登记在 [registry](../../../registry/README.md)，本行只作索引**
- **提供者/装配映射**：尚无。D-037 已选官方 SDK 上自写薄桥；精确钉版与几项上游能力未取证（[G-6](v1/contract.md#十已知缺口)）

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。连接、副本、投影规则、调用与结果映射、OAuth 绑定的迁移都只有一个写者 |
| 稳定身份 | `capability.mcp-bridge`，版本 1 |
| 适用范围 | 一个据点进程之内；跨进程后要由协议重新兑现的，列在[契约 S-30](v1/contract.md#s-30-装配给与协议给) |
| 为什么是 capability 而不是 data | 它有操作、提交点（副本的条件写、绑定的迁移）与外部效果（拉起进程、发出调用、用掉授权码） |
| 精确依赖 | 见上面「catalog 映射」一行 |
| 谁在等它 | 会话资产注册表（尝试开始时列举与投影）、工具执行运行时（自带实现）、交付面（OAuth 的两步、可用性原因）——它们对本契约的引用由各自登记 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 每个操作的结局、投影与结果映射的逐项取值 | [v1 规范实例](v1/examples.md) |
| 失败值有哪些、各对到什么收场 | [S-15 失败值表](v1/contract.md#s-15-这一节每个操作写全九件事)、[S-21](v1/contract.md#s-21-失败值与收场的对应) |
| 凭据怎样出示、为什么仓库的同名接入点拿不到租户的凭据 | [S-9](v1/contract.md#s-9-凭据的出示与取用) |
| 桥换代时在途调用怎样收场 | [S-27](v1/contract.md#s-27-桥被替换或卸载) |
| 哪里在等裁决 | [已知缺口](v1/contract.md#十已知缺口) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件恰两份：`contract.md`、`examples.md`——**实例是规范工件，不是说明材料**。
**本契约不发布 Schema**：值的形状引用各数据契约。

**本包不建 `formal/`**（起草时主线判为不触发）。逐条理由在[契约 S-31](v1/contract.md#s-31-本版选用哪些形式工件)；
[规格模板对此的要求](../../README.md#按需展开形式化工件)是「已触发的义务不因 optional 而消失」——本契约触发的义务是规范场景、静态检查与消费者走查，
在[验证入口](verification.md)登记，状态**一律为「未开始」**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。
