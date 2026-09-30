2026-09-29：[D-107](../../../record/decisions/model-input-usage-calibration-adoption/decision.md) 接受并冻结 v10 全83条/76资源；transport/runtime 映射仍待采用，消费者不自动升级。以下按原版本与日期读取。

2026-09-28：[D-104](../../../record/decisions/model-recovery-timing-adoption/decision.md) 接受本次恢复时序后继 v9 的全部规范资源；当前精确范围以该决定与 registry 为准。下文候选标签记录起草时状态，提供者迁移及真实恢复另验。

**v6 起草时摘要（历史；后由 D-099 接受）**：[契约](v6/contract.md)、[实例](v6/examples.md)、[形式义务](v6/formal/README.md)、[消费者传播](v6/consumer-impact.md)、[验证](verification.md#v6-候选变化与证据)。完整继承 RT5，新增最终输入限制、MR6 未处分事实交接与 LC5 重试历史；跨包定型与未决项见 G-32～G-35。

2026-09-28：[D-101](../../../record/decisions/model-token-estimate-adoption/decision.md)接受本次MP6/RT8计量后继；规范资源冻结，下面candidate标签保留起草事件，实际计量实现与发送验收另计。

2026-09-28：[D-100](../../../record/decisions/model-runtime-current-generation-adoption/decision.md) 接受当前后继 v7 全部规范资源；旧格式运行兼容承诺被取代，未表示实现完成。

**当前候选 `capability.model-request-runtime/v8`**：[契约](v8/contract.md)与[变化及证据](verification.md#v8-估算计量保证)。依据 PF-013 rev15，仅调整 token 估算与显式余量保证；尚未技术接受。已接受基线 v7 的采用依据是上方 D-100；以下各旧版本段落按当时事件读取，不能覆盖当前接受状态。


**2026-09-27 当前规范接受（D-090）**：v5 全73条／27资源已接受并冻结；只将规范 MR4→MR5 并明确同次头事实交接。[决定](../../../record/decisions/model-headers-v5-adoption/decision.md)。D-087 已技术采用 v4-design rev2；v5 runtime/transport/codec 提供者尚待精确投影与采用，当前源码不自动升级，十三操作与真实链未完成。下方早期状态按原事件读取。

# 模型请求运行时

**2026-09-27 当前接受**：[D086](../../../record/decisions/model-runtime-tail-settlement-adoption/decision.md)接受v4全部73条／27资源，精确消费SL3。新版提供者投影尚未采用，十三操作及真实组合未完成；冻结版本起草时candidate标签不覆盖registry接受状态。

**已接受 v3（2026-09-27，D-076）**：[契约](v3/contract.md)保留十三个服务操作，补精确适配绑定、独立函数结果投影、内容门、显式宿主、观察者、当前求值输入端口和观测责任；[S-67](v3/contract.md#s-67-默认重试件的能力标识)补默认重试件标识 `omne-official:default-retry`；[规范实例](v3/examples.md)、[形式义务](v3/formal/README.md)与[验证状态](verification.md#v3-候选变化与证据)可追溯。v3 已由 [D-076](../../../record/decisions/model-runtime-delivery-adoption/decision.md) 接受并冻结；目录/档案/消息/响应、LC4、AE4 与 registry3 的精确采用以 registry 为准。v4 已由 D086 接受，提供者采用仍单独登记，真实组合验收独立于规格接受；manifest3 仅作历史参考，v2 保持原冻结字节。

**会话据点上，一个会话怎样选模型、每一次[模型调用](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)怎样发出、怎样收场、停机之后怎样对账。**
它拥有选中模型的切换、有效模型的四步求值、合法目标集合与展示列表、一次调用的状态与每一次发出、三类事实的发出守卫、两个耐久锚点、中断、恢复对账、成因分类、凭据现取与脱敏，以及系统自带的默认重试件。

**它不拥有**档案与凭据（当前基线消费 `capability.model-profile-directory` v3，中心侧）、响应体与账的形状（`data.model-response`、`data.call-accounts`）、拓展件的执行（`capability.loop-extension-runner`）、模态投影的判定函数（`capability.modality-projection`）、上下文组装与会话日志本身。
**上交条目、中断提醒、回复消息的写入归 loop**——本契约把带回复的响应体交回，落盘成消息的那一条由调用方与消息同一提交写下；被否决、被系统拿去用的那一条由调用方交回处置、本能力写下（`settleReply`）。

**本能力的提供者是运行时协程**——名字里的「运行时」指它（统一语言冲突 C-31「叫 runtime 的必须是协程」以此闭合：[D-060 §七 M18](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)，维持 §一 T-3）。

## v2 历史采用摘要

以下保留 v2 的采用摘要；v3 的现行接受依据见页首及 registry，v4 新消费范围见本页接受入口。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.model-request-runtime, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **操作**：十三个（S-24～S-34、S-49、S-50；S-35 默认重试件是一件拓展件，不是服务面操作）；服务面名 `settleReply` 与输入成员 `basis` 已由主线接受（D-060 §六 N-9，原 G-13 闭合）
- **catalog 映射**：已登记为 accepted。`family=capabilities`、`topic=model-request-runtime`、
  `contract_path=spec/capabilities/model-request-runtime/v2/contract.md`；`resources` 另含 `v2/examples.md`、`v2/formal/README.md`、`v2/formal/Invocation.tla` 与十份配置；
  依赖十六项（2026-09-24 整批对齐补登 `capability.stream-assembly`、`capability.modality-projection`、`capability.asset-evaluation`；2026-09-25 修复波 2 补登 `data.arrival-events`，同日「公开面」修订波补登 `capability.session-log`，N7 评审之后补登 `capability.asset-registry`；`capability.loop-extension-runner` 只指路，它反过来消费本契约），消费 clauses 取自[契约 S-4 的被消费面表](v2/contract.md#s-4-依赖方向与被消费的面)，与它逐项相同
- **formal-tasks 映射**：两个任务——`model-request-runtime-v2-invocation`（`Invocation.cfg`）与 `model-request-runtime-v2-invocation-no-fallback`（`Invocation_NoFallback.cfg`），2026-09-24 修复稿本机 TLC 退出 0、无反例；
  八份否定与可达性配置**按设计不登记**（它们预期出反例），执行结果在[验证入口](verification.md#实际执行)；哪些断言被证明能失败、哪些被建模方式吸收，见 [formal 入口](v2/formal/README.md)
- **提供者/装配映射**：[packages/model/model-request-runtime](../../../realization/packages/model/model-request-runtime/README.md)、[packages/model/pi-ai-transport](../../../realization/packages/model/pi-ai-transport/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

- **独立责任**：一次调用的发出、收场与恢复住在据点、跟着 agent runtime 生灭；它的变化原因（上游行为、传输、首 token 与停机规则）与中心侧档案目录不同，消费者也不同（loop、拓展件、交付面的切换与停止）。
- **稳定身份与版本**：v2、v3 均已接受冻结；v4 已由 D086 接受，各自消费者采用状态分开。
- **依赖**：v2 的精确坐标与接受状态以 registry 为准；v3 的精确接受依赖以 D-076/registry 为准；冻结正文的起草时标签不覆盖接受记录。v4 页首列出本轮消费版本。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 各已接受版本承诺什么 | [已接受 v3](v3/contract.md)、[已接受 v4](v4/contract.md) |
| 各条路径走通是什么样、每个失败值的反例 | [v3 实例](v3/examples.md)、[v4 实例](v4/examples.md) |
| 行为模型表达了什么、每条断言对应哪条条款、吸收了什么 | [v3 formal](v3/formal/README.md)、[v4 formal](v4/formal/README.md) |
| 哪些条款有怎样的证据，哪些仍缺 | [验证与覆盖](verification.md) |
| 还有哪些没定、等谁裁 | [v3 缺口](v3/contract.md#十二已知缺口)、[v4 缺口](v4/contract.md#十二已知缺口) |

## 版本包

`v2/`、`v3/` 已接受冻结；`v4/` 已由 D086 接受冻结。发布之后规范正文、实例与模型不可原地覆盖，修改发布新版本；执行记录留在版本目录外（[验证入口](verification.md)）。

## 2026-09-26 版本接受

本次接受 `capability.model-request-runtime` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。

2026-09-27：[D-076](../../../record/decisions/model-runtime-delivery-adoption/decision.md)技术接受并冻结v3精确资源；实际符合性验证尚待生产实现。版本内原候选标签不作为registry接受状态权威。

## v4 接受：采用 SL3 的结算消费

[契约](v4/contract.md)从 D-076 已接受 v3 演进，保留十三操作和独立 invokeModel，消费 D-083 已接受 session-log v3；S-68～S-73 补显式 condition、实际提交点 late、完整批认回、未知结果与争用耗尽责任。[实例](v4/examples.md#v4-增量结算竞争与恢复)、[形式义务](v4/formal/README.md#结算组合模型)、[消费者传播](v4/consumer-impact.md)与[证据状态](verification.md#v4-候选变化与证据)分别可查。v4 已由D086接受27资源，旧 v3仍沿registry冻结，新版不自动升级任何消费者；本轮不改变既有模型/参数/缓存或其他十六项精确依赖，不为生产 Run 认法、共同 codec、多值头或真实组合补默认。

## v5 起草时摘要（历史）：多值响应头事实交接

[完整契约](v5/contract.md)继承 D-086 已接受 v4 的 73 条、十三服务操作及九项和 SL3 结算/恢复，仅将 MR4 精确依赖换为 [MR5 candidate](../../data/model-response/v5/contract.md)。同次 send 的公共可选 rawHeaders 经 invoke 未结算结果交到完整响应，保留已取得且留存的 string／有序 string[] 原值；取消和读体失败不擦掉事实，头不进入内容门、观察者或诊断。[规范实例](v5/examples.md#v5-增量同次响应头的交接与留存)、[消费者传播](v5/consumer-impact.md)、[形式继承边界](v5/formal/README.md)与[证据义务](verification.md#v5-候选变化与证据)分别维护。

起草当时 MR5/RT5 尚未接受（后来由 D-090 接受）；旧提供者与任何消费者均不自动升级。G-31 仅有候选表示/交接，core 公开接收、transport/runtime/codec 投影、全部真实写方和 TLS→invoke→append/reopen 仍待。四 TLA、十九配置逐字继承，六任务仅登记未运行，不能证明头事实留存或实际停止；其余原缺口保持。

2026-09-28：[D-099](../../../record/decisions/model-input-limit-consumer-contract-adoption/decision.md)在独立复评闭合后技术接受 v6；规范资源冻结。实现采用和验证另行交付，原文 candidate 是起草状态。

## v8 token 估算候选

[v8 契约](v8/contract.md)仅调整 PF-013 rev15 已由用户确认的 tokenizer 估算与可配置余量保证；尚未技术接受。字段与纯判定、十三操作及其他精确消费者范围保持。[验证与变化](verification.md#v8-估算计量保证)记录实际证据与限制。


## 2026-09-28 RT9 恢复时序候选

[v9 契约](v9/contract.md) 为 candidate，未接受、未冻结；只补已确认锚点的中断结算中实际 sentAt 不可用表示。当前采用不自动升级，证据与消费者责任见[验证入口](verification.md#恢复时序候选)。


## 2026-09-29 响应校准候选 v10

[v10 contract](v10/contract.md) · [验证义务](v10/verification.md)。新增增量输入计量事实及其消费；candidate，未接受、未冻结，不自动升级现有消费者。


## v11 candidate（本批）

[v11完整规范](v11/contract.md)、[消费者影响](v11/consumer-impact.md)、[验证义务](v11/verification.md)。未接受、未冻结，不自动升级现有消费者。

## v12 ACK后继候选

[v12 contract](v12/contract.md) · [消费者影响](v12/consumer-impact.md) · [验证义务](v12/verification.md)。candidate，未接受；前驱v11接受状态不传递。ACK确认、真实处分与清理分别可见；本批证据未完成时不据目录存在宣称通过。

2026-09-30 版本外勘误指引（v12 已由 [ACK 契约决定](../../../record/decisions/model-runtime-reference-lifecycle-adoption/ack-contracts-decision.md)接受并冻结，正文不原地改）：[S-99⑧](v12/contract.md#s-99-ack-后的真实处分与-retainedresult)未写明暂存行的精确含义——暂存行 = 最近一次结果尚未确知为零写的追加所用完整批；`tailChanged` 确认零写后重构批须在新追加可能生效前耐久更新到该行；回执未知期间禁止覆盖。候选正文在[ACK 后新处分接缝 revision 2](../../../record/proposals/model-runtime-reference-lifecycle/ack-post-confirmation-settlement.md)，待并入项与扩展形式工件在 [v-next](v-next/README.md)；并入由下一版本 contract 完成，不改变 v12 的接受状态。
