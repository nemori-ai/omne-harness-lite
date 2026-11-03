# Agent 具体装配的行为边界

本包承担 Agent 的本地宿主装配。根入口提供独立 Model 与 Tool 接收组件。`./cordis` 导出宿主插件 `agentHostPlugin`，实现范围与缺口见“[宿主插件](#宿主插件)”。插件尚未接入接收组件，不能据此声称生产 Model 接收方已经登记。领域行为消费 [agent-contract](../agent-contract/SPEC.md)，框架公共保证消费 [agent-cordis-contract](../agent-cordis-contract/SPEC.md)。

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
- <a id="恢复路径的未推进控制"></a>控制的推进。Journal 受理控制之后，宿主读原 execution 的当前挂接。挂接属于本宿主仍在运行的 runtime 时，宿主用该 runtime 的依赖经 `@omne-harness/agent` 的 `advanceControl` 推进这项控制，与执行句柄的 control 相同：取消建立意图并撤销推进资格，Model 或 Tool 中断只作用于原调用。推进在答复之前完成。推进失败时返回该失败，调用方以同一 control operation 重试，已保存的阶段按派生 operation 认回，不重复写。没有挂接，或挂接不属于本宿主仍在运行的 runtime 时，控制只保存为 accepted，由恢复路径推进，宿主不另造推进。已知限制：当前恢复路径（Agent 协调器的 R0）遇到未推进的 accepted 控制仍答 `#502 stage 5` 未实现，所以挂接属于别的进程或已退役实例时，这项控制停在 accepted，不建立意图。触发条件：跨进程宿主或恢复后取消进入验收。
- <a id="有序停止"></a>有序停止。依据 R2-D162：插件对象带 `quiesceAll({ signal })`，由持有插件对象的装配在关闭时调用。它不是 Cordis 服务，应用成员拿不到它。调用后宿主先停止准入：之后的 `acquire` 与 `reserve` 答 unavailable（owner 为 `agent-host`），不再建立实例，也不再开始空闲回收。准入停止前已开始的建立，宿主等它发布或撤销。然后宿主对每个已发布、由本宿主运行的实例调用 quiesce，与空闲回收用同一条路径，不看最近一次报告。只有 drained 的实例才 retire 并卸载贡献 fiber。全部实例都在 `signal` 中止前答 drained 时，结果是 settled。有实例答 unresolved、quiesce 失败或抛出、`signal` 中止时仍没有答复，或有建立没有结束时，结果是 incomplete，`instances` 逐个列出实例与原因，`detail` 是同一内容的文字。没有答 drained 的实例保持 published，留给 fiber 卸载，按“突然失去依赖”处置。截止时间由调用方经 `signal` 给出，本成员不设默认值。插件体没有运行时，结果是 settled，因为没有实例。
- 突然失去依赖。插件体卸载时，宿主停止计时，不再建立实例，也不调用 detach。挂接与在途责任保留在 Journal，宿主不声称外部效果已撤回。

### 测量事件

<a id="测量事件"></a>依据 R2-D17（DP1 取 C）与 R2-D49：Agent 工厂的测量观察者经 `./cordis` 的 `createAgentHostLocalPlugin({ measure })` 交进来，仿 Session 日志 Journal 提供者的 `createSessionAgentJournalPlugin({ cancellation })`（R2-D35）。观察者是函数，不是配置成员，不是服务键，不进入 `agentHostConfig`。

- 返回的插件与 `agentHostPlugin` 同名（`agent-host`），`inject`、配置与提供的五个服务面都不变。宿主为每个实例调用 `createAgentRuntime(依赖, 选项, { measure })`，把同一个观察者交给全部实例；事件的内容与时机归 [Agent SPEC](../agent/SPEC.md#测量事件)，本成员不加、不改事件。
- 不传 `measure` 时与 `agentHostPlugin` 一致。`agentHostPlugin` 原样可用。
- 观察者对 Agent 之外的段（Session、Context）没有作用；它们各自的插件入口交各自的观察者。

### Tool 请求来源

<a id="tool-请求来源"></a>依据 R2-D36：可信的 Tool 请求供给者是 Agent 宿主的构造依赖，不是服务键。它经 `./cordis` 的 `createAgentHostLocalPlugin({ toolRequests })` 交进来，与 `measure` 同一个入口。`toolRequests` 的形状是 `AgentDependencies['toolRequests']`（`describe` 与 `prepare` 两个面）。它是函数对象，不是配置成员，不进入 `agentHostConfig`，也不加 `inject` 键。

- 宿主为每个实例调用 `createAgentRuntime` 时，把传入的 `toolRequests` 放进该 runtime 的依赖，全部实例共用同一个来源。Tool 动作的准入、`describe` 与 `prepare` 的校验和 Tool 调用归 [Agent SPEC](../agent/SPEC.md)，本成员不加、不改。
- 不传 `toolRequests` 时，依赖不带它，Tool 动作的准入答 `unavailable`（owner 为 `agentToolRequests`），Tool 不被调用。`agentHostPlugin` 原样可用，行为不变。
- 来源的生产投影由 Reduce 供给；本成员不实现它，也不推断它的内容。

已知缺口：

1. Runtime 一侧的停用义务尚未实现。Agent 工厂的 quiesce 现在答 unavailable（#502 阶段 5），invoke 取执行槽时也不同步报告 occupied（XC-AGINST 第 3.5 节第 2 条）。所以用生产工厂时，空闲实例不会被回收；宿主只记录诊断，并按期重试。宿主一侧的回收与保护点只用测试包装验证。
2. 接收组件尚未接入插件。Cordis 定义没有提供 `AgentReceivedCommits` 与原消费绑定目标查询的服务键，所以插件不能从注入的服务组装接收组件，也没有经 `modelRuntime.registerResultReceiver` 登记。应用装配页为接收组件列出的 `agentJournalEntries`、`agentMaterials` 与 `agentAccountOutlet` 因此暂未写进 inject。
3. 本成员不注入 `assemblyLifecycle`，因为它还没有 kernel-basis 的定义。有序停止由装配的行句柄调用插件对象的 `quiesceAll`，见“[有序停止](#有序停止)”。用生产工厂时 quiesce 答 unavailable（缺口 1），所以有活实例时有序停止答 incomplete。
4. 局部依赖在每次调用时经 `ctx.get` 现取，缺席时立即答 unavailable。设计中的阶段子 fiber（`ctx.inject`）尚未实现。`ToolRuntime` 中不返回 Reply 的成员在缺席时也得到 Reply 形状的失败；本版不装配 Tool 阶段。
5. 恢复入口的 reconcile 在核验之后答具名 unavailable。
6. 宿主的预约表与槽表只在内存，只在本进程有效。已结束实例的记录保留到插件体结束。

## 独立结果接收组件

本包须在根入口提供独立接收组件工厂，由宿主装配并持有。纯接收算法由 [agent](../agent/README.md) 的独立公开模块提供，不依赖 `createAgentRuntime`；本包只通过公开入口使用该算法。接收方是 Agent 实例外的常驻角色，实例的 disposer 不持有或销毁它。本组件不新增 Cordis 服务键，不把 `./cordis` 的完整插件标为已实现。

装配者显式传入同一 `AgentReceivedProvider`、`AgentAccessCheck`、原消费绑定的稳定目标查询、`AgentAccountOutlet`、Model 的只读 inspect 与 dispatches、租户容量策略和宿主持有的接收状态。条目与账目出站均为必需依赖，不提供独立存储、吞账目或默认放行实现。received 为 null 时拒绝提供接收能力，不退回 preserve 加 record。原 instance 来自随 Journal 已提交 PendingCall 保存的绑定，不能由当前 attachment 推导。

接收组件逐次核验主体、原调用、consumer、admission 和完整 dispatch 集合，包括 saved 重投。它按 [J02](../agent-contract/SPEC.md#结果接收) 与 Model 原协议的顺序处理拒绝、认回、取消、容量和共同提交。只有收到 committed 的原结果才向 Model 返回 saved。内部共同提交结果与失败须按 [Model 接收结果与失败映射](../agent-contract/SPEC.md#model-接收结果与失败映射)转换，保留原操作、未知、排除和内部诊断。Model 自己取得 ACK，本组件不持有生产者 ACK 权限。

接收句柄须提供 push、recover、retry 和只读待办及诊断查询。宿主显式创建并持有接收状态；Agent 实例重建不清空它，接收组件重装配继续传入同一状态。recover 按 execution 从 received 及材料恢复账目待办。unknown 与 unavailable 保留原 handoff，宿主在可重试待办存在时驱动 retry。denied、conflict 与 invalid 保留为 blocked 待办和具名诊断，不自动重试，重装配也不重新发送。恢复和重试返回 Agent Reply。它们先按原绑定工作集核 receive-result，返回前重核；不存在或无权统一 denied，依赖不可读返回 unavailable。报告只含该集合，await 期间新增的绑定留到下一次维护。inspect 是宿主管理的全局视图，不作为租户查询。

共同提交、材料核对和入队后即返回 saved，不等待 outlet。宿主状态持有实际出站任务与当前驱动代；旧代只结算已发出的交接，不能驱动后继。每次实际出站前重核原绑定资格。停止只停止本次等待与后续驱动，不取消已受理的共同提交，不撤回 saved，不删除材料或待办。取消时目标或最终资格检查尚未完成，返回无内容 unavailable（owner=agent-model-receiver，diagnostic=maintenance-cancelled）；已判定 denied 不改成成功。接收状态的内存实现仅支持同进程接续，不证明断电或跨进程恢复；要求耐久的宿主须保存接收与出站的业务事实。Promise 和驱动代只表示本进程的实际执行，不作为耐久记录。容量、材料、接收与出站的精确行为分别沿 [J02](../agent-contract/SPEC.md#结果接收)、[共同提交](../agent-contract/SPEC.md#接收共同提交)和 [J28](../agent-contract/SPEC.md#账目出站)。

Tool 工厂沿 [Tool 接收入口](../agent/docs/public-api.md#独立-tool-接收入口)消费独立算法，以同一提供者共同保存 Tool 完整材料和 received。其依赖为 provider、access、targets 与容量，不使用 Model 专用的账目手交。状态归宿主所有，运行实例停止不撤销接收责任。此入口不新增 Cordis 服务或 Tool 生产路由。

## 验证

独立接收组件须验证租户隔离、原目标在 detach 或实例销毁后仍可取得、每次 push 的权威校验，以及条目和完整材料的共同可见。故障用例须覆盖提交前失败、提交回包未知、原 operation 认回、排除不复活和容量占用。使用 Model 公开 testing pusher 验证 saved 后的 ACK 仍由 Model 完成。

账目验证覆盖全部非 null 账目、迟到修订、同 handoff 重试、blocked 的重装配保留，以及实例重建后继续接收。合一内存提供者须显式执行接收共同提交套件的 required 模式，账目出站须执行其公开一致性套件。上述替身验证不证明生产 Model、磁盘耐久或跨进程恢复。

根入口测试实际装配接收工厂，验证 supported/unsupported、共同保存与原 handoff 重试。Agent 成员另验证接收算法、隔离、取消与换代。

宿主插件的测试在真实 Cordis 4.0.4 上运行。它们验证装载、逐项缺席时的 PENDING、配置错误时的 FAILED、换提供者后插件体重跑、`agentInstanceProvisionConformance` 对宿主真件通过、回收保护点、quiesce 失败或 unresolved 时保持 published、宿主主体被拒、旧登记撤除不撤后继、非宿主 fiber 的撤除被拒，以及恢复入口与控制入口的读回、核验与跨租户拒绝。控制入口对本宿主仍在运行的 runtime 的执行推进取消、同一 control operation 的重试不再写入、守卫拒绝时一次都不推进，用例在 `tests/control-entry.spec.ts`，Loop 由 `createAgentRuntime` 真件在替身依赖上运行。Journal、Model、授权与会话条件用 agent 的 `./testing` 替身。Runtime 一侧的停用义务用测试包装。有序停止的用例在 `tests/ordered-stop.spec.ts`：无实例时 settled，空闲与占用的实例 drained 后卸载贡献 fiber，unresolved、quiesce 抛出、生产工厂的 unavailable 与超过截止时 incomplete 并点名实例，停止开始后 `acquire` 被拒。`createAgentHostLocalPlugin({ measure })` 的用例在同一个真实宿主上经一次 invoke 取受理段，并核对它与 `agentHostPlugin` 同名、同 inject、同配置，不传观察者时照常服务（`tests/measure-plugin.spec.ts`）。`createAgentHostLocalPlugin({ toolRequests })` 的用例在同一个真实宿主上让 Model 建议一个 Tool 调用，核对 `describe` 与 `prepare` 各一次、Tool 替身 invoke 一次；不传时同一动作不调用 Tool（`tests/tool-requests-plugin.spec.ts`）。这些测试不证明生产 Journal、真实授权、跨进程行为或接收方登记。文件清单见[测试说明](tests/index.md)。
