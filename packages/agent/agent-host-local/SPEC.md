# Agent 具体装配的行为边界

本包承担 Agent 的本地宿主装配。根入口提供独立 Model 接收组件。`./cordis` 导出宿主插件 `agentHostPlugin`，实现范围与缺口见“[宿主插件](#宿主插件)”。插件尚未接入接收组件，不能据此声称生产 Model 接收方已经登记。领域行为消费 [agent-contract](../agent-contract/SPEC.md)，框架公共保证消费 [agent-cordis-contract](../agent-cordis-contract/SPEC.md)。

## 提供者责任

将 Cordis 依赖适配为通用工厂的纯端口，管理本包持有的服务与资源。计划撤除先完成业务交接，突然失去依赖保留未知和恢复责任，不宣称外部效果回滚。

Agent 本地宿主负责实例保留、协程托管和登记贡献。reserve 不授予推进资格。旧登记身份的撤除不得撤除后继登记。

## 宿主插件

`./cordis` 导出 `agentHostPlugin`，名称是 `agent-host`。插件按 [Cordis 装配页](docs/cordis.md) 装载。它在一个插件体内、一条 fiber 上提供五个服务面：`agentInstanceHost`、`agentPublicationAuthority`、`agentExecutionRecovery`、`agentExecutionControl` 与 `agentInstanceProvision`。

插件兑现下列责任：

- 装载。插件静态 inject 十项必需依赖与 `agentHostPrincipal`。缺任一项时插件停在 PENDING，不预约，不发布。配置错误使 fiber 进入 FAILED。任一静态依赖换提供者时，插件体重跑。旧实例的登记随贡献 fiber 撤除，之后的 acquire 建立新实例。
- 实例取得。`acquire` 只以调用方的 Access 核验 reserve。宿主以宿主主体核验 publish，然后在该实例的贡献 fiber 内登记。一个槽至多有一个已发布、未进入回收的实例，并发调用共用一次建立。工厂失败或宿主主体被拒时，宿主撤销预约，不发布。
- 预约、发布与撤除。reserve 只预约实例身份并返回登记句柄，不登记目录，不授予推进资格。发布权威同步核验两件事：该操作是宿主为这个预约发起的 publish，调用 fiber 是该实例的贡献 fiber。撤除只接受目录为该实例分配的登记身份，调用 fiber 须是宿主自己的 fiber 或该实例的贡献 fiber。旧登记身份的撤除不撤除后继登记。
- 空闲回收。实例报告 idle 后，宿主用 `agentClock` 计时 `instanceIdleMs`。到期回调不经 await，先读最近一次报告，再标记回收，然后调用 quiesce。只有 drained 才卸载贡献 fiber。unresolved 或失败时，实例保持 published，宿主记录 error 级诊断，下一次空闲到期再试。
- 恢复入口与控制入口。每个操作先以 `agentAccessCheck` 核验本操作名，目标是原 execution，然后调用 Journal。两个入口不要求活体 runtime，也不要求执行句柄。它们保留 Journal 的答复，包括未知。目标挂接属于本宿主仍在运行的 runtime 时，detach 另核 takeover。
- 突然失去依赖。插件体卸载时，宿主停止计时，不再建立实例，也不调用 detach。挂接与在途责任保留在 Journal，宿主不声称外部效果已撤回。

已知缺口：

1. Runtime 一侧的停用义务尚未实现。Agent 工厂的 quiesce 现在答 unavailable（#502 阶段 5），invoke 取执行槽时也不同步报告 occupied（XC-AGINST 第 3.5 节第 2 条）。所以用生产工厂时，空闲实例不会被回收；宿主只记录诊断，并按期重试。宿主一侧的回收与保护点只用测试包装验证。
2. 接收组件尚未接入插件。Cordis 定义没有提供 `AgentReceivedCommits` 与原消费绑定目标查询的服务键，所以插件不能从注入的服务组装接收组件，也没有经 `modelRuntime.registerResultReceiver` 登记。应用装配页为接收组件列出的 `agentJournalEntries`、`agentMaterials` 与 `agentAccountOutlet` 因此暂未写进 inject。
3. 有序关闭尚未接线，因为 `assemblyLifecycle` 还没有 kernel-basis 的定义。
4. 局部依赖在每次调用时经 `ctx.get` 现取，缺席时立即答 unavailable。设计中的阶段子 fiber（`ctx.inject`）尚未实现。`ToolRuntime` 中不返回 Reply 的成员在缺席时也得到 Reply 形状的失败；本版不装配 Tool 阶段。
5. 恢复入口的 reconcile 在核验之后答具名 unavailable。
6. 宿主的预约表与槽表只在内存，只在本进程有效。已结束实例的记录保留到插件体结束。

## 独立结果接收组件

本包须在根入口提供独立接收组件工厂，由宿主装配并持有。纯接收算法由 [agent](../agent/README.md) 的独立公开模块提供，不依赖 `createAgentRuntime`；本包只通过公开入口使用该算法。接收方是 Agent 实例外的常驻角色，实例的 disposer 不持有或销毁它。本组件不新增 Cordis 服务键，不把 `./cordis` 的完整插件标为已实现。

装配者显式传入同一 `AgentReceivedProvider`、`AgentAccessCheck`、原消费绑定的稳定目标查询、`AgentAccountOutlet`、Model 的只读 inspect 与 dispatches、租户容量策略和宿主持有的接收状态。条目与账目出站均为必需依赖，不提供独立存储、吞账目或默认放行实现。received 为 null 时拒绝提供接收能力，不退回 preserve 加 record。原 instance 来自随 Journal 已提交 PendingCall 保存的绑定，不能由当前 attachment 推导。

接收组件逐次核验主体、原调用、consumer、admission 和完整 dispatch 集合，包括 saved 重投。它按 [J02](../agent-contract/SPEC.md#结果接收) 与 Model 原协议的顺序处理拒绝、认回、取消、容量和共同提交。只有收到 committed 的原结果才向 Model 返回 saved。内部共同提交结果与失败须按 [Model 接收结果与失败映射](../agent-contract/SPEC.md#model-接收结果与失败映射)转换，保留原操作、未知、排除和内部诊断。Model 自己取得 ACK，本组件不持有生产者 ACK 权限。

接收句柄须提供 push、recover、retry 和只读待办及诊断查询。宿主显式创建并持有接收状态；Agent 实例重建不清空它，接收组件重装配继续传入同一状态。recover 按 execution 从 received 及材料恢复账目待办。unknown 与 unavailable 保留原 handoff，宿主在可重试待办存在时驱动 retry。denied、conflict 与 invalid 保留为 blocked 待办和具名诊断，不自动重试，重装配也不重新发送。恢复和重试返回 Agent Reply。它们先按原绑定工作集核 receive-result，返回前重核；不存在或无权统一 denied，依赖不可读返回 unavailable。报告只含该集合，await 期间新增的绑定留到下一次维护。inspect 是宿主管理的全局视图，不作为租户查询。

共同提交、材料核对和入队后即返回 saved，不等待 outlet。宿主状态持有实际出站任务与当前驱动代；旧代只结算已发出的交接，不能驱动后继。每次实际出站前重核原绑定资格。停止只停止本次等待与后续驱动，不取消已受理的共同提交，不撤回 saved，不删除材料或待办。取消时目标或最终资格检查尚未完成，返回无内容 unavailable（owner=agent-model-receiver，diagnostic=maintenance-cancelled）；已判定 denied 不改成成功。接收状态的内存实现仅支持同进程接续，不证明断电或跨进程恢复；要求耐久的宿主须保存接收与出站的业务事实。Promise 和驱动代只表示本进程的实际执行，不作为耐久记录。容量、材料、接收与出站的精确行为分别沿 [J02](../agent-contract/SPEC.md#结果接收)、[共同提交](../agent-contract/SPEC.md#接收共同提交)和 [J28](../agent-contract/SPEC.md#账目出站)。

## 验证

独立接收组件须验证租户隔离、原目标在 detach 或实例销毁后仍可取得、每次 push 的权威校验，以及条目和完整材料的共同可见。故障用例须覆盖提交前失败、提交回包未知、原 operation 认回、排除不复活和容量占用。使用 Model 公开 testing pusher 验证 saved 后的 ACK 仍由 Model 完成。

账目验证覆盖全部非 null 账目、迟到修订、同 handoff 重试、blocked 的重装配保留，以及实例重建后继续接收。合一内存提供者须显式执行接收共同提交套件的 required 模式，账目出站须执行其公开一致性套件。上述替身验证不证明生产 Model、磁盘耐久或跨进程恢复。

根入口测试实际装配接收工厂，验证 supported/unsupported、共同保存与原 handoff 重试。Agent 成员另验证接收算法、隔离、取消与换代。

宿主插件的测试在真实 Cordis 4.0.4 上运行。它们验证装载、逐项缺席时的 PENDING、配置错误时的 FAILED、换提供者后插件体重跑、`agentInstanceProvisionConformance` 对宿主真件通过、回收保护点、quiesce 失败或 unresolved 时保持 published、宿主主体被拒、旧登记撤除不撤后继、非宿主 fiber 的撤除被拒，以及恢复入口与控制入口的读回、核验与跨租户拒绝。Journal、Model、授权与会话条件用 agent 的 `./testing` 替身。Runtime 一侧的停用义务用测试包装。这些测试不证明生产 Journal、真实授权、跨进程行为或接收方登记。文件清单见[测试说明](tests/index.md)。
