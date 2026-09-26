# 执行环境

**[会话据点](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base)上「一次执行的作用能不能落在[宿主机](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-host-machine--宿主机--host-machine)上」的判断，以及在宿主机上按进程组起、停进程**：
取一个会话的执行环境引用、判一扇门这一次落不落宿主机（只看[执行环境权限](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-execution-environment-permission--执行环境权限--execution-environment-permission)，没有显式允许就不落，判不出与不许分开）、
起一个拓展件子进程（新进程组、不经命令解释器、不继承环境变量）、等它的结果、按组停并有界地答「确认退出／未确认」。

**这是一份窄口**：只收执行宿主、派发器、兼容件三个消费者已列出的操作。**PF-005 其余本版不收，归 PF-005 那一程**——沙箱与沙箱实现、设施与目标环境的匹配、落点变化的提醒、会话执行环境的存活（[契约 S-2](v1/contract.md#s-2-本契约不拥有什么)）。
**依赖方向是单向的：本契约 → 身份值、会话引用、拓展点统一输入、工具定义的目标环境。**

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.execution-environments, 1)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-041](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 accepted。`family=capabilities`、`topic=execution-environments`、
  `contract_path=spec/capabilities/execution-environments/v1/contract.md`，`resources` 另含 `v1/examples.md`；
  依赖四项，消费 clauses 取自[契约 S-4 的被消费面表](v1/contract.md#s-4-依赖方向与被消费的面)：
  `data.identity-values` v1、`data.messages` v1、`data.loop-extension` v1、`data.tool-definition` v1
- **formal-tasks 映射**：无——本版不建 TLA+／Alloy，理由见[契约 S-18](v1/contract.md#s-18-本版选用哪些形式工件)
- **提供者/装配映射**：[packages/infra/execution-environments-host](../../../realization/packages/infra/execution-environments-host/README.md)；当前节点设计已由 D-042 接受，源码／实际验证按各节点四层状态分别读取。
  **最小提供者的形态**（本程施工简报定；接口契约 ＋ 最小提供者取代验收替身见 [D-043 R-1](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）：**直接起本机进程**——落点判断从测试种子读执行环境权限与拓展件子进程的允许（顶替[契约 G-2](v1/contract.md#十已知缺口)、[G-3](v1/contract.md#十已知缺口) 的来路，只供验收装配），起停用本机操作系统的进程组。
  真承接者是 PF-005 那一程（[G-1](v1/contract.md#十已知缺口)）

## 准入核对

- **独立责任**：「这一次作用能不能落宿主机」与「在据点上起停进程并确认它们停下」是三个消费者共用的一件事；放进任何一个消费者里，另两个要么复制一份判断（落点就不再只有一处），要么绕过它（宿主机不再只凭显式允许）。
- **稳定身份与版本**：首版 v1，候选。
- **依赖**：一份已接受（`data.identity-values`），三份候选（`data.messages`、`data.loop-extension`、`data.tool-definition`）——候选依赖改动时本契约须重核。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [版本化契约](v1/contract.md) |
| 落点、起停走通是什么样、每个失败值的反例 | [规范实例](v1/examples.md) |
| 哪些条款有怎样的证据，哪些仍缺 | [验证与覆盖](verification.md) |
| 还有哪些没定、等谁裁 | [已知缺口](v1/contract.md#十已知缺口) |

## 版本包

`v1/` 是候选版本目录。发布（接受并冻结）之后规范正文与实例不可原地覆盖，修改发布新版本；执行记录留在版本目录外（[验证入口](verification.md)）。

## 2026-09-26 版本接受

本次接受 `capability.execution-environments` v1 的全部条款，[D-041](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。
